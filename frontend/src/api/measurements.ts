import apiClient from './client'
import {
  Measurement, MeasurementListItem, MeasurementFolder,
  MeasurementOpening, MeasurementAttachment,
} from '../types/measurements'
import { MeasurementFolderCount } from '../types/orders'
import { measurementUtils, withOfflineFallback } from '../services/offline'
import { requestWithQueue } from '../services/sync'

// TTL кеша для вспомогательных данных — 7 дней, чтобы пережить длительный офлайн
const LONG_TTL = 7 * 24 * 60 * 60 * 1000

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
    data: { lift_available?: boolean | null; stairs_available?: boolean | null; floor_readiness?: string },
  ): Promise<Measurement> => {
    return requestWithQueue('POST', `/measurements/${id}/set_site_conditions/`, data)
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
    return requestWithQueue('PATCH', `/measurement-openings/${id}/`, data)
  },

  create: async (data: Partial<MeasurementOpening>): Promise<MeasurementOpening> => {
    return requestWithQueue('POST', '/measurement-openings/', data)
  },

  delete: async (id: number): Promise<void> => {
    await requestWithQueue('DELETE', `/measurement-openings/${id}/`)
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

// Рек. проём с учётом «желаемого размера двери»: если desired задан — от него,
// иначе — от рекомендованной двери.
export const calculateOpeningRecommendationWithDesired = (
  desiredH: number | null,
  desiredW: number | null,
  recDoorH: number | null,
  recDoorW: number | null,
): { h: number | null; w: number | null } => {
  const h = desiredH || recDoorH
  const w = desiredW || recDoorW
  return {
    h: h ? h + 70 : null,
    w: w ? w + 100 : null,
  }
}

export const buildRecommendationText = (
  openingH: number | null,
  openingW: number | null,
  doorH: number | null,
  doorW: number | null,
): string => {
  const parts: string[] = []
  if (openingH != null && doorH != null) {
    const d = openingH - doorH
    if (d < 60) parts.push(`Высота проёма (${openingH} мм) недостаточна. Увеличьте проём до ${doorH + 70} (дверь +70) или уменьшите дверь до ${openingH - 70} (проём −70).`)
    else if (d > 80) parts.push(`Высота проёма (${openingH} мм) избыточна. Уменьшите проём до ${doorH + 70} (дверь +70) или увеличьте дверь до ${openingH - 70} (проём −70).`)
  }
  if (openingW != null && doorW != null) {
    const d = openingW - doorW
    if (d < 90) parts.push(`Ширина проёма (${openingW} мм) недостаточна. Увеличьте проём до ${doorW + 100} (дверь +100) или уменьшите дверь до ${openingW - 100} (проём −100).`)
    else if (d > 105) parts.push(`Ширина проёма (${openingW} мм) избыточна. Уменьшите проём до ${doorW + 100} (дверь +100) или увеличьте дверь до ${openingW - 100} (проём −100).`)
  }
  return parts.join(' ')
}

export const isInverso = (openingType: string): boolean =>
  openingType === 'B_INVERSO' || openingType === 'D_INVERSO'

export const validateLiftRequired = (
  openings: {
    actual_height: number | null
    desired_door_height?: number | null
    recommended_door_height?: number | null
  }[],
): boolean =>
  openings.some((o) => {
    const h = o.actual_height || o.desired_door_height || o.recommended_door_height
    return h != null && Number(h) > 2300
  })
