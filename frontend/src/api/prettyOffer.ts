import apiClient from './client'
import {
  Clarification,
  DoorColorRef,
  DoorImageRef,
  DoorModelRef,
  OfferTextPreset,
  PrettyOffer,
  PrettyOfferAttachment,
  PrettyOfferItem,
  SourceImage,
} from '../types/prettyOffer'

// Красивое КП офлайн не редактируется: оно про картинки и PDF, а это
// в любом случае требует сети. Поэтому здесь обычные запросы, без очереди.
export const prettyOfferAPI = {
  // Кнопка «Сформировать красивое КП». Идемпотентна: повторный вызов
  // подтягивает новые проёмы и доподбирает картинки, ничего не затирая.
  build: async (orderId: number): Promise<PrettyOffer> => {
    const response = await apiClient.post(`/orders/${orderId}/pretty-offer/`)
    return response.data
  },

  get: async (orderId: number): Promise<PrettyOffer | null> => {
    try {
      const response = await apiClient.get(`/orders/${orderId}/pretty-offer/`)
      return response.data
    } catch (err: any) {
      // 404 — КП ещё не формировали, это не ошибка.
      if (err?.response?.status === 404) return null
      throw err
    }
  },

  getClarifications: async (orderId: number): Promise<Clarification[]> => {
    const response = await apiClient.get(`/orders/${orderId}/pretty-offer/clarifications/`)
    return response.data
  },

  getSourceImages: async (orderId: number): Promise<SourceImage[]> => {
    const response = await apiClient.get(`/orders/${orderId}/pretty-offer/source-images/`)
    return response.data
  },

  update: async (offerId: number, data: Partial<PrettyOffer>): Promise<PrettyOffer> => {
    const response = await apiClient.patch(`/pretty-offers/${offerId}/`, data)
    return response.data
  },

  updateItem: async (itemId: number, data: Partial<PrettyOfferItem>): Promise<PrettyOfferItem> => {
    const response = await apiClient.patch(`/pretty-offer-items/${itemId}/`, data)
    return response.data
  },

  // Своя картинка полотна, когда в каталоге подходящей нет (п.7 ТЗ).
  uploadItemImage: async (
    itemId: number,
    side: 'front' | 'back',
    file: File,
  ): Promise<PrettyOfferItem> => {
    const form = new FormData()
    form.append(`${side}_custom_image`, file)
    const response = await apiClient.patch(`/pretty-offer-items/${itemId}/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  // Доп. картинка в КП: своим файлом либо копией вложения заказа/замера (п.11).
  addImage: async (
    offerId: number,
    payload: { file?: File; source?: SourceImage; offerItemId?: number; caption?: string },
  ): Promise<PrettyOfferAttachment> => {
    if (payload.file) {
      const form = new FormData()
      form.append('image', payload.file)
      if (payload.offerItemId) form.append('offer_item', String(payload.offerItemId))
      if (payload.caption) form.append('caption', payload.caption)
      const response = await apiClient.post(`/pretty-offers/${offerId}/add-image/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    }
    const response = await apiClient.post(`/pretty-offers/${offerId}/add-image/`, {
      kind: payload.source?.kind,
      source_id: payload.source?.id,
      offer_item: payload.offerItemId ?? null,
      caption: payload.caption ?? '',
    })
    return response.data
  },

  deleteImage: async (attachmentId: number): Promise<void> => {
    await apiClient.delete(`/pretty-offer-attachments/${attachmentId}/`)
  },

  getPresets: async (): Promise<OfferTextPreset[]> => {
    const response = await apiClient.get('/offer-text-presets/')
    return Array.isArray(response.data) ? response.data : response.data.results || []
  },

  downloadPdf: async (orderId: number): Promise<Blob> => {
    const response = await apiClient.get(`/orders/${orderId}/pretty-offer/pdf/`, {
      responseType: 'blob',
    })
    return response.data
  },

  // Скачиваем через временную ссылку — так же, как бланк замера: работает
  // везде и не упирается в блокировку всплывающих окон.
  openPdf: async (orderId: number, kpNumber?: string): Promise<void> => {
    const blob = await prettyOfferAPI.downloadPdf(orderId)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `kp_${kpNumber || orderId}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
}

// Справочник дверей для окна уточнения.
export const doorCatalogAPI = {
  getModels: async (search?: string): Promise<DoorModelRef[]> => {
    const response = await apiClient.get('/door-models/', {
      params: search ? { search } : undefined,
    })
    return Array.isArray(response.data) ? response.data : response.data.results || []
  },

  // Цвета только те, в которых эта модель реально есть.
  getColors: async (doorModelId: number): Promise<DoorColorRef[]> => {
    const response = await apiClient.get('/door-colors/', {
      params: { door_model: doorModelId },
    })
    return Array.isArray(response.data) ? response.data : response.data.results || []
  },

  getImages: async (doorModelId: number, colorId: number): Promise<DoorImageRef[]> => {
    const response = await apiClient.get('/door-images/', {
      params: { door_model: doorModelId, color: colorId },
    })
    return Array.isArray(response.data) ? response.data : response.data.results || []
  },

  // Загрузка картинки в сам каталог: следующему заказу с этой моделью
  // она подберётся уже автоматически (п.7 ТЗ).
  uploadImage: async (data: {
    doorModelId: number
    colorId: number
    variant: string
    file: File
  }): Promise<DoorImageRef> => {
    const form = new FormData()
    form.append('door_model', String(data.doorModelId))
    form.append('color', String(data.colorId))
    form.append('variant', data.variant)
    form.append('image', data.file)
    const response = await apiClient.post('/door-images/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
}
