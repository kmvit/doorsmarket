import apiClient from './client'
import {
  Measurement, MeasurementListItem, MeasurementFolder,
  MeasurementOpening, MeasurementAttachment,
} from '../types/measurements'

export const measurementsAPI = {
  list: async (params?: { folder?: MeasurementFolder; search?: string; service_manager?: number }): Promise<MeasurementListItem[]> => {
    const queryParams: Record<string, any> = {}
    if (params?.folder) queryParams.folder = params.folder
    if (params?.search) queryParams.search = params.search
    if (params?.service_manager) queryParams.service_manager = params.service_manager
    const response = await apiClient.get('/measurements/', { params: queryParams })
    return Array.isArray(response.data) ? response.data : (response.data.results || [])
  },

  getById: async (id: number): Promise<Measurement> => {
    const response = await apiClient.get(`/measurements/${id}/`)
    return response.data
  },

  createFromRequest: async (requestId: number, measurementDate?: string | null): Promise<Measurement> => {
    const response = await apiClient.post('/measurements/create_from_request/', {
      request_id: requestId,
      measurement_date: measurementDate,
    })
    return response.data
  },

  schedule: async (id: number, measurementDate: string): Promise<Measurement> => {
    const response = await apiClient.post(`/measurements/${id}/schedule/`, {
      measurement_date: measurementDate,
    })
    return response.data
  },

  markDone: async (id: number): Promise<Measurement> => {
    const response = await apiClient.post(`/measurements/${id}/mark_done/`)
    return response.data
  },

  markProcessed: async (id: number): Promise<Measurement> => {
    const response = await apiClient.post(`/measurements/${id}/mark_processed/`)
    return response.data
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
    const response = await apiClient.post(`/measurements/${id}/set_site_conditions/`, data)
    return response.data
  },

  uploadSignature: async (id: number, file: File): Promise<Measurement> => {
    const fd = new FormData()
    fd.append('signature', file)
    const response = await apiClient.post(`/measurements/${id}/upload_signature/`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
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
}

export const measurementOpeningsAPI = {
  list: async (measurementId: number): Promise<MeasurementOpening[]> => {
    const response = await apiClient.get('/measurement-openings/', { params: { measurement: measurementId } })
    return Array.isArray(response.data) ? response.data : (response.data.results || [])
  },

  update: async (id: number, data: Partial<MeasurementOpening>): Promise<MeasurementOpening> => {
    const response = await apiClient.patch(`/measurement-openings/${id}/`, data)
    return response.data
  },

  create: async (data: Partial<MeasurementOpening>): Promise<MeasurementOpening> => {
    const response = await apiClient.post('/measurement-openings/', data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/measurement-openings/${id}/`)
  },

  linkToOrderItem: async (openingId: number, orderItemId: number | null): Promise<MeasurementOpening> => {
    const response = await apiClient.post(`/measurement-openings/${openingId}/link/`, {
      order_item_id: orderItemId,
    })
    return response.data
  },

  batchLink: async (
    links: { measurement_opening_id: number; order_item_id: number | null }[],
  ): Promise<MeasurementOpening[]> => {
    const response = await apiClient.post('/measurement-openings/batch_link/', { links })
    return response.data
  },
}

export const measurementAttachmentsAPI = {
  upload: async (measurementId: number, file: File, openingId?: number | null): Promise<MeasurementAttachment> => {
    const fd = new FormData()
    fd.append('measurement', String(measurementId))
    if (openingId) fd.append('opening', String(openingId))
    fd.append('file', file)
    fd.append('name', file.name)
    const response = await apiClient.post('/measurement-attachments/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
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
