import apiClient from './client'
import {
  Measurement, MeasurementListItem, MeasurementFolder,
  MeasurementOpening, MeasurementAttachment,
} from '../types/measurements'
import { MeasurementFolderCount } from '../types/orders'
import { measurementUtils, cacheUtils, withOfflineFallback, db } from '../services/offline'
import { requestQueue, requestWithQueue, isNetworkError } from '../services/sync'

// TTL кеша для вспомогательных данных — 7 дней, чтобы пережить длительный офлайн
const LONG_TTL = 7 * 24 * 60 * 60 * 1000

// ===== Офлайн-режим проёмов (полевой сценарий замерщика) =====

// Локальная копия проёма, созданного офлайн, хранит ссылку на отложенный POST
type LocalOpening = MeasurementOpening & { _pendingRequestId?: number }

// Временный отрицательный id для проёмов, созданных офлайн (не пересекается с серверными)
let tempSeq = 0
const nextTempId = (): number => -(Date.now() * 100 + (tempSeq++ % 100))

// Пустой проём с дефолтами под UI (форма обращается к attachments и строковым полям)
const emptyOpening = (measurementId: number, data: Partial<MeasurementOpening>): MeasurementOpening => ({
  id: nextTempId(),
  measurement: measurementId,
  order_item: null,
  opening_number: 1,
  room_name: '',
  door_type: '' as MeasurementOpening['door_type'],
  door_type_display: '',
  actual_height: null,
  actual_width: null,
  actual_depth: null,
  recommended_door_height: null,
  recommended_door_width: null,
  recommended_door_is_manual: false,
  recommended_opening_height: null,
  recommended_opening_width: null,
  opening_type: '' as MeasurementOpening['opening_type'],
  opening_type_display: '',
  addon_width: null,
  face_trim_qty: null,
  face_trim_comment: '',
  back_trim_qty: null,
  back_trim_comment: '',
  extra_hardware: '',
  threshold: '',
  notes: '',
  attachments: [],
  inverso_warning: null,
  recommendation_text: '',
  ...data,
})

// Обновить проёмы внутри локальной копии замера (IndexedDB + кеш) —
// чтобы изменения переживали перезагрузку страницы офлайн
const applyOpeningsToLocalDetail = async (
  measurementId: number,
  mutate: (openings: MeasurementOpening[]) => MeasurementOpening[],
): Promise<void> => {
  try {
    const cacheKey = `measurement_detail_${measurementId}`
    const detail: Measurement | undefined =
      (await measurementUtils.getDetail(measurementId)) ||
      (await cacheUtils.getStale(cacheKey)) ||
      undefined
    if (detail) {
      const updated = { ...detail, openings: mutate(detail.openings || []) }
      await measurementUtils.saveDetail(updated)
      await cacheUtils.set(cacheKey, updated)
    }
  } catch (e) {
    console.warn('[Offline] Не удалось обновить локальную копию замера:', e)
  }
}

// Найти id замера по id проёма (по локальным данным)
const findMeasurementIdByOpening = async (openingId: number): Promise<number | null> => {
  const local = await db.measurementOpenings.get(openingId)
  if (local?.measurement) return local.measurement
  const all = await db.measurements.toArray()
  const found = all.find((mm) => (mm.openings || []).some((o) => o.id === openingId))
  return found?.id ?? null
}

// Достать локальную копию проёма (из таблицы проёмов или из копии замера)
const getLocalOpening = async (openingId: number): Promise<LocalOpening | undefined> => {
  const fromTable = (await db.measurementOpenings.get(openingId)) as LocalOpening | undefined
  if (fromTable) return fromTable
  const measurementId = await findMeasurementIdByOpening(openingId)
  if (!measurementId) return undefined
  const detail = await measurementUtils.getDetail(measurementId)
  return detail?.openings?.find((o) => o.id === openingId) as LocalOpening | undefined
}

export const measurementsAPI = {
  list: async (params?: { folder?: MeasurementFolder; search?: string; service_manager?: number }): Promise<MeasurementListItem[]> => {
    const queryParams: Record<string, any> = {}
    if (params?.folder) queryParams.folder = params.folder
    if (params?.search) queryParams.search = params.search
    if (params?.service_manager) queryParams.service_manager = params.service_manager
    return withOfflineFallback({
      cacheKey: `measurements_list_${JSON.stringify(queryParams)}`,
      request: async () => {
        const response = await apiClient.get('/measurements/', { params: queryParams })
        return Array.isArray(response.data) ? response.data : (response.data.results || [])
      },
      saveOffline: (list) => measurementUtils.saveList(list),
      loadOffline: () => measurementUtils.getList(),
    })
  },

  getFolderCounts: async (opts?: { mine?: boolean }): Promise<MeasurementFolderCount[]> => {
    const params: Record<string, any> = {}
    if (opts?.mine) params.mine = 'true'
    return withOfflineFallback({
      cacheKey: `measurements_folder_counts_${opts?.mine ? 'mine' : 'all'}`,
      request: async () => {
        const response = await apiClient.get('/measurements/folder_counts/', { params })
        return Array.isArray(response.data) ? response.data : []
      },
      ttl: LONG_TTL,
    })
  },

  getById: async (id: number): Promise<Measurement> => {
    return withOfflineFallback({
      cacheKey: `measurement_detail_${id}`,
      request: async () => {
        const response = await apiClient.get(`/measurements/${id}/`)
        return response.data
      },
      saveOffline: (m) => measurementUtils.saveDetail(m),
      loadOffline: () => measurementUtils.getDetail(id),
    })
  },

  createFromRequest: async (requestId: number, measurementDate?: string | null): Promise<Measurement> => {
    return requestWithQueue('POST', '/measurements/create_from_request/', {
      request_id: requestId,
      measurement_date: measurementDate,
    })
  },

  schedule: async (id: number, measurementDate: string): Promise<Measurement> => {
    return requestWithQueue('POST', `/measurements/${id}/schedule/`, {
      measurement_date: measurementDate,
    })
  },

  saveDraft: async (id: number): Promise<Measurement> => {
    return requestWithQueue('POST', `/measurements/${id}/save_draft/`)
  },

  markDone: async (id: number): Promise<Measurement> => {
    return requestWithQueue('POST', `/measurements/${id}/mark_done/`)
  },

  markProcessed: async (id: number): Promise<Measurement> => {
    return requestWithQueue('POST', `/measurements/${id}/mark_processed/`)
  },

  // Phase 5: SMS клиенту о недозвоне («Отправить» / «Повторно отправить»)
  notifyClientCallFailed: async (id: number): Promise<{ detail: string; phone: string }> => {
    const response = await apiClient.post(`/measurements/${id}/notify_client_call_failed/`)
    return response.data
  },

  setSiteConditions: async (
    id: number,
    data: {
      lift_available?: boolean | null
      stairs_available?: boolean | null
      carry_to_entrance?: boolean | null
      floor_number?: string
      floor_readiness?: string
    },
  ): Promise<Measurement> => {
    try {
      const response = await apiClient.post(`/measurements/${id}/set_site_conditions/`, data)
      await measurementUtils.saveDetail(response.data)
      await cacheUtils.set(`measurement_detail_${id}`, response.data)
      return response.data
    } catch (error: any) {
      if (!isNetworkError(error)) throw error
      // Офлайн: применяем условия к локальной копии, POST — в очередь синхронизации
      await requestQueue.add('POST', `/measurements/${id}/set_site_conditions/`, data)
      const detail =
        (await measurementUtils.getDetail(id)) ||
        (await cacheUtils.getStale(`measurement_detail_${id}`))
      if (detail) {
        const merged = { ...detail, ...data }
        await measurementUtils.saveDetail(merged)
        await cacheUtils.set(`measurement_detail_${id}`, merged)
        return merged
      }
      throw new Error('Запрос добавлен в очередь для синхронизации')
    }
  },

  uploadSignature: async (id: number, file: File): Promise<Measurement> => {
    const fd = new FormData()
    fd.append('signature', file)
    return requestWithQueue('POST', `/measurements/${id}/upload_signature/`, fd, {
      'Content-Type': 'multipart/form-data',
    })
  },

  // PDF-бланк замера: качаем как blob и открываем/скачиваем (эндпоинт под авторизацией).
  downloadBlankPdf: async (id: number): Promise<Blob> => {
    const response = await apiClient.get(`/measurements/${id}/download_blank_pdf/`, {
      responseType: 'blob',
    })
    return response.data
  },

  openBlankPdf: async (id: number): Promise<void> => {
    const blob = await measurementsAPI.downloadBlankPdf(id)
    // Скачиваем файл через временную ссылку (работает везде, без попап-блокировок
    // и ограничений превью на window.open).
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zamer_${id}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },

  // PDF «Рекомендации» — финальный бланк менеджера (после обработки замера).
  downloadRecommendationsPdf: async (id: number): Promise<Blob> => {
    const response = await apiClient.get(`/measurements/${id}/download_recommendations_pdf/`, {
      responseType: 'blob',
    })
    return response.data
  },

  openRecommendationsPdf: async (id: number): Promise<void> => {
    const blob = await measurementsAPI.downloadRecommendationsPdf(id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rekomendacii_${id}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },

  // Публичная ссылка на PDF «Рекомендации» (для отправки клиенту).
  getRecommendationsLink: (m: { client_access_token: string }): string =>
    `${window.location.origin}/api/v1/public/measurements/${m.client_access_token}/recommendations/`,

  // Публичная ссылка на PDF для клиента (без авторизации).
  getPublicPdfUrl: (clientAccessToken: string): string =>
    `${window.location.origin}/api/v1/public/measurements/${clientAccessToken}/pdf/`,

  // Короткая ссылка для клиента (/z/{код}). Fallback — полная, если кода нет.
  getClientLink: (m: { short_code?: string | null; client_access_token: string }): string =>
    m.short_code
      ? `${window.location.origin}/z/${m.short_code}/`
      : `${window.location.origin}/api/v1/public/measurements/${m.client_access_token}/pdf/`,
}

export const measurementOpeningsAPI = {
  list: async (measurementId: number): Promise<MeasurementOpening[]> => {
    return withOfflineFallback({
      cacheKey: `measurement_openings_${measurementId}`,
      request: async () => {
        const response = await apiClient.get('/measurement-openings/', { params: { measurement: measurementId } })
        return Array.isArray(response.data) ? response.data : (response.data.results || [])
      },
      saveOffline: (openings) => measurementUtils.saveOpenings(measurementId, openings),
      loadOffline: () => measurementUtils.getOpenings(measurementId),
    })
  },

  update: async (id: number, data: Partial<MeasurementOpening>): Promise<MeasurementOpening> => {
    // Временный проём (создан офлайн): правим payload отложенного POST — PATCH
    // по несуществующему серверному id слать нельзя
    if (id < 0) {
      const local = await getLocalOpening(id)
      const measurementId = local?.measurement || Number(data.measurement) || 0
      const merged: LocalOpening = { ...emptyOpening(measurementId, {}), ...local, ...data, id }
      if (local?._pendingRequestId) {
        const pending = await db.pendingRequests.get(local._pendingRequestId)
        if (pending) {
          await db.pendingRequests.update(local._pendingRequestId, {
            data: { ...pending.data, ...data },
          })
        }
      }
      await db.measurementOpenings.put(merged)
      await applyOpeningsToLocalDetail(measurementId, (ops) => ops.map((o) => (o.id === id ? merged : o)))
      return merged
    }

    try {
      const response = await apiClient.patch(`/measurement-openings/${id}/`, data)
      const updated: MeasurementOpening = response.data
      await db.measurementOpenings.put(updated)
      await applyOpeningsToLocalDetail(updated.measurement, (ops) => ops.map((o) => (o.id === id ? updated : o)))
      return updated
    } catch (error: any) {
      if (!isNetworkError(error)) throw error
      // Офлайн: применяем изменения локально, PATCH — в очередь синхронизации
      await requestQueue.add('PATCH', `/measurement-openings/${id}/`, data)
      const local = await getLocalOpening(id)
      const measurementId = local?.measurement || (await findMeasurementIdByOpening(id)) || 0
      const merged = { ...emptyOpening(measurementId, {}), ...local, ...data, id }
      await db.measurementOpenings.put(merged)
      if (measurementId) {
        await applyOpeningsToLocalDetail(measurementId, (ops) => ops.map((o) => (o.id === id ? merged : o)))
      }
      return merged
    }
  },

  create: async (data: Partial<MeasurementOpening>): Promise<MeasurementOpening> => {
    const measurementId = Number(data.measurement) || 0
    try {
      const response = await apiClient.post('/measurement-openings/', data)
      const created: MeasurementOpening = response.data
      await db.measurementOpenings.put(created)
      await applyOpeningsToLocalDetail(measurementId, (ops) => [...ops, created])
      return created
    } catch (error: any) {
      if (!isNetworkError(error)) throw error
      // Офлайн: создаём проём локально с временным id, POST — в очередь синхронизации
      const pending = await requestQueue.add('POST', '/measurement-openings/', data)
      const local: LocalOpening = { ...emptyOpening(measurementId, data), _pendingRequestId: pending.id }
      await db.measurementOpenings.put(local)
      await applyOpeningsToLocalDetail(measurementId, (ops) => [...ops, local])
      return local
    }
  },

  delete: async (id: number): Promise<void> => {
    const measurementId = await findMeasurementIdByOpening(id)

    // Временный проём: убираем отложенный POST и локальную копию, серверу ничего не шлём
    if (id < 0) {
      const local = await getLocalOpening(id)
      if (local?._pendingRequestId) {
        await requestQueue.remove(local._pendingRequestId)
      }
    } else {
      try {
        await apiClient.delete(`/measurement-openings/${id}/`)
      } catch (error: any) {
        if (!isNetworkError(error)) throw error
        await requestQueue.add('DELETE', `/measurement-openings/${id}/`)
      }
    }

    await db.measurementOpenings.delete(id)
    if (measurementId) {
      await applyOpeningsToLocalDetail(measurementId, (ops) => ops.filter((o) => o.id !== id))
    }
  },

  linkToOrderItem: async (openingId: number, orderItemId: number | null): Promise<MeasurementOpening> => {
    return requestWithQueue('POST', `/measurement-openings/${openingId}/link/`, {
      order_item_id: orderItemId,
    })
  },

  batchLink: async (
    links: { measurement_opening_id: number; order_item_id: number | null }[],
  ): Promise<MeasurementOpening[]> => {
    return requestWithQueue('POST', '/measurement-openings/batch_link/', { links })
  },
}

export const measurementAttachmentsAPI = {
  upload: async (measurementId: number, file: File, openingId?: number | null): Promise<MeasurementAttachment> => {
    const fd = new FormData()
    fd.append('measurement', String(measurementId))
    if (openingId) fd.append('opening', String(openingId))
    fd.append('file', file)
    fd.append('name', file.name)
    return requestWithQueue('POST', '/measurement-attachments/', fd, {
      'Content-Type': 'multipart/form-data',
    })
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/measurement-attachments/${id}/`)
  },
}

// Утилиты для расчёта рекомендаций на клиенте (без обращения к серверу)
export const calculateDoorRecommendation = (
  openingH: number | null,
  openingW: number | null,
): { h: number | null; w: number | null } => ({
  h: openingH ? Math.max(0, openingH - 70) : null,
  w: openingW ? Math.max(0, openingW - 100) : null,
})

export const calculateOpeningRecommendation = (
  doorH: number | null,
  doorW: number | null,
): { h: number | null; w: number | null } => ({
  h: doorH ? doorH + 70 : null,
  w: doorW ? doorW + 100 : null,
})

export const buildRecommendationText = (
  openingH: number | null,
  openingW: number | null,
  doorH: number | null,
  doorW: number | null,
): string => {
  // Краткий формат: «Увеличить проём по высоте до 2570, уменьшить проём по ширине до 900»
  const parts: string[] = []
  if (openingH != null && doorH != null) {
    const d = openingH - doorH
    if (d < 60) parts.push(`увеличить проём по высоте до ${doorH + 70}`)
    else if (d > 80) parts.push(`уменьшить проём по высоте до ${doorH + 70}`)
  }
  if (openingW != null && doorW != null) {
    const d = openingW - doorW
    if (d < 90) parts.push(`увеличить проём по ширине до ${doorW + 100}`)
    else if (d > 105) parts.push(`уменьшить проём по ширине до ${doorW + 100}`)
  }
  if (parts.length === 0) return ''
  const text = parts.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const isInverso = (openingType: string): boolean =>
  openingType === 'B_INVERSO' || openingType === 'D_INVERSO'

export const validateLiftRequired = (
  openings: {
    actual_height: number | null
    recommended_door_height?: number | null
  }[],
): boolean =>
  openings.some((o) => {
    const h = o.actual_height || o.recommended_door_height
    return h != null && Number(h) > 2300
  })
