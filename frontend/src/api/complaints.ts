import apiClient from './client'
import {
  Complaint,
  ComplaintListItem,
  ComplaintCreateData,
  ComplaintFilters,
  DefectiveProduct,
  ComplaintAttachment,
  ComplaintComment,
} from '../types/complaints'
import { complaintUtils, cacheUtils } from '../services/offline'
import { requestQueue } from '../services/sync'

export const complaintsAPI = {
  // Получить список рекламаций
  getList: async (filters?: ComplaintFilters): Promise<{ results: ComplaintListItem[]; count: number }> => {
    const params = new URLSearchParams()
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value))
        }
      })
    }
    
    const cacheKey = `complaints_list_${params.toString()}`
    
    try {
    const response = await apiClient.get(`/complaints/?${params.toString()}`)
      
      // Сохраняем в кеш при успешном запросе
      if (response.data?.results) {
        console.log(`[ComplaintsAPI] Сохранение ${response.data.results.length} рекламаций в IndexedDB`)
        await complaintUtils.saveList(response.data.results)
        await cacheUtils.set(cacheKey, response.data, 5 * 60 * 1000) // 5 минут
        console.log(`[ComplaintsAPI] Данные сохранены в IndexedDB и кеш`)
      }
      
    return response.data
    } catch (error: any) {
      console.log(`[ComplaintsAPI] Ошибка загрузки рекламаций:`, error.message || error)
      
      // Если ошибка авторизации, не пытаемся использовать офлайн данные
      if (error.message?.includes('авторизация') || error.message?.includes('HTML') || error.message?.includes('401') || error.response?.status === 401) {
        console.log(`[ComplaintsAPI] Ошибка авторизации, не используем офлайн данные`)
        throw error
      }
      
      // Если офлайн или ошибка сети, пытаемся получить из кеша или IndexedDB
      if (!navigator.onLine || error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        console.log(`[ComplaintsAPI] Офлайн режим или ошибка сети, загружаем из кеша/IndexedDB`)
        const cached = await cacheUtils.get(cacheKey)
        if (cached) {
          console.log(`[ComplaintsAPI] Данные найдены в кеше`)
          return cached
        }
        
        // Если кеша нет, возвращаем данные из IndexedDB
        const list = await complaintUtils.getList()
        console.log(`[ComplaintsAPI] Загружено ${list.length} рекламаций из IndexedDB`)
        return {
          results: list,
          count: list.length,
        }
      }
      
      // Даже если интернет есть, но запрос не прошел (кроме авторизации), 
      // пытаемся загрузить из IndexedDB как fallback
      console.log(`[ComplaintsAPI] Интернет есть, но запрос не прошел, пытаемся загрузить из IndexedDB`)
      try {
        const cached = await cacheUtils.get(cacheKey)
        if (cached) {
          console.log(`[ComplaintsAPI] Данные найдены в кеше (fallback)`)
          return cached
        }
        
        const list = await complaintUtils.getList()
        console.log(`[ComplaintsAPI] Загружено ${list.length} рекламаций из IndexedDB (fallback)`)
        if (list.length > 0) {
          return {
            results: list,
            count: list.length,
          }
        }
      } catch (offlineError) {
        console.warn('[ComplaintsAPI] Не удалось загрузить данные из IndexedDB:', offlineError)
      }
      
      throw error
    }
  },

  // Получить детальную информацию о рекламации
  getDetail: async (id: number): Promise<Complaint> => {
    const cacheKey = `complaint_detail_${id}`
    
    try {
    const response = await apiClient.get(`/complaints/${id}/`)
      
      // Сохраняем в кеш при успешном запросе
      if (response.data) {
        await complaintUtils.saveDetail(response.data)
        await cacheUtils.set(cacheKey, response.data, 5 * 60 * 1000) // 5 минут
      }
      
    return response.data
    } catch (error: any) {
      // Если ошибка авторизации, не пытаемся использовать офлайн данные
      if (error.message?.includes('авторизация') || error.message?.includes('HTML') || error.message?.includes('401') || error.response?.status === 401) {
        throw error
      }
      
      // Если офлайн или ошибка сети, пытаемся получить из кеша или IndexedDB
      if (!navigator.onLine || error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        const cached = await cacheUtils.get(cacheKey)
        if (cached) {
          return cached
        }
        
        // Если кеша нет, возвращаем данные из IndexedDB
        const detail = await complaintUtils.getDetail(id)
        if (detail) {
          return detail
        }
      }
      
      // Даже если интернет есть, но запрос не прошел (кроме авторизации), 
      // пытаемся загрузить из IndexedDB как fallback
      try {
        const cached = await cacheUtils.get(cacheKey)
        if (cached) {
          return cached
        }
        
        const detail = await complaintUtils.getDetail(id)
        if (detail) {
          return detail
        }
      } catch (offlineError) {
        console.warn('Не удалось загрузить данные из IndexedDB:', offlineError)
      }
      
      throw error
    }
  },

  // Создать рекламацию
  create: async (data: ComplaintCreateData, files?: File[]): Promise<Complaint> => {
    const formData = new FormData()
    
    // Добавляем текстовые поля
    // Важно: production_site_id и reason_id должны оставаться с _id (сериализатор ожидает их)
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        // Все поля передаем как есть (production_site_id, reason_id и т.д.)
        formData.append(key, String(value))
      }
    })
    
    // Добавляем файлы как attachments (множественное число)
    if (files && files.length > 0) {
      files.forEach((file) => {
        formData.append('attachments', file)
      })
    }
    
    try {
    const response = await apiClient.post('/complaints/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
    } catch (error: any) {
      // Если офлайн, добавляем в очередь
      if (!navigator.onLine) {
        await requestQueue.add('POST', '/complaints/', formData, {
          'Content-Type': 'multipart/form-data',
        })
        // Возвращаем временный объект для оптимистичного обновления
        throw new Error('Запрос добавлен в очередь для синхронизации')
      }
      throw error
    }
  },

  // Обновить рекламацию
  update: async (id: number, data: Partial<ComplaintCreateData> & { installer_assigned_id?: number }, files?: File[]): Promise<Complaint> => {
    const formData = new FormData()
    
    // Поля, которые должны передаваться с _id
    const idFields = ['production_site_id', 'reason_id', 'manager_id', 'installer_assigned_id', 'recipient_id']
    
    // Добавляем текстовые поля
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        // Для полей с _id, которые есть в списке idFields, передаем как есть
        // Для остальных полей с _id заменяем на обычное имя
        const fieldName = (key.endsWith('_id') && !idFields.includes(key)) 
          ? key.replace('_id', '') 
          : key
        formData.append(fieldName, String(value))
      }
    })
    
    // Добавляем новые файлы
    if (files && files.length > 0) {
      files.forEach((file) => {
        formData.append('attachments', file)
      })
    }
    
    try {
    const response = await apiClient.patch(`/complaints/${id}/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
      
      // Обновляем кеш
      if (response.data) {
        await complaintUtils.saveDetail(response.data)
      }
      
    return response.data
    } catch (error: any) {
      // Если офлайн, добавляем в очередь
      if (!navigator.onLine) {
        await requestQueue.add('PATCH', `/complaints/${id}/`, formData, {
          'Content-Type': 'multipart/form-data',
        })
        throw new Error('Запрос добавлен в очередь для синхронизации')
      }
      throw error
    }
  },

  // Действия с рекламацией
  process: async (id: number, complaintType: 'installer' | 'manager' | 'factory'): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/process/`, {
      complaint_type: complaintType,
    })
    return response.data
  },

  complete: async (id: number): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/complete/`)
    return response.data
  },

  planInstallation: async (id: number, installerId: number, installationDate: string): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/plan_installation/`, {
      installer_id: installerId,
      installation_date: installationDate,
    })
    return response.data
  },

  startProduction: async (id: number, productionDeadline: string): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/start_production/`, {
      production_deadline: productionDeadline,
    })
    return response.data
  },

  markWarehouse: async (id: number): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/mark_warehouse/`)
    return response.data
  },

  planShipping: async (id: number, shippingDate: string): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/plan_shipping/`, {
      shipping_date: shippingDate,
    })
    return response.data
  },

  agreeClient: async (id: number, productionDeadline: string): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/agree_client/`, {
      production_deadline: productionDeadline,
    })
    return response.data
  },

  disputeDecision: async (id: number, disputeArguments: string): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/dispute_decision/`, {
      dispute_arguments: disputeArguments,
    })
    return response.data
  },

  factoryApprove: async (id: number): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/factory_approve/`)
    return response.data
  },

  factoryReject: async (id: number, rejectReason: string): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/factory_reject/`, {
      reject_reason: rejectReason,
    })
    return response.data
  },

  // Обновление контактных данных клиента
  updateClientContact: async (
    id: number,
    contactPerson: string,
    contactPhone: string,
    address?: string
  ): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/update_client_contact/`, {
      contact_person: contactPerson,
      contact_phone: contactPhone,
      address: address || '',
    })
    return response.data
  },

  // СМ проверяет и одобряет выполненную работу
  approve: async (id: number): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/approve/`)
    return response.data
  },

  // СМ заменяет монтажника
  changeInstaller: async (id: number, newInstallerId: number): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/change_installer/`, {
      new_installer_id: newInstallerId,
    })
    return response.data
  },

  // Монтажник переносит дату монтажа
  rescheduleInstallation: async (id: number, installationDate: string): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/reschedule_installation/`, {
      installation_date: installationDate,
    })
    return response.data
  },

  // ОР отмечает товар на складе для фабричных рекламаций
  markWarehouseOR: async (id: number): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/mark_warehouse_or/`)
    return response.data
  },

  // СМ закрывает рекламацию
  close: async (id: number, closureReason: string): Promise<Complaint> => {
    const response = await apiClient.post(`/complaints/${id}/close/`, {
      closure_reason: closureReason,
    })
    return response.data
  },

  // Отправить email уведомление в отдел рекламаций
  sendFactoryEmail: async (id: number): Promise<void> => {
    await apiClient.post(`/complaints/${id}/send_factory_email/`)
  },

  // Бракованные изделия
  getDefectiveProducts: async (complaintId: number): Promise<DefectiveProduct[]> => {
    const response = await apiClient.get(`/defective-products/?complaint=${complaintId}`)
    return response.data
  },

  createDefectiveProduct: async (data: Omit<DefectiveProduct, 'id'>): Promise<DefectiveProduct> => {
    const response = await apiClient.post('/defective-products/', data)
    return response.data
  },

  updateDefectiveProduct: async (id: number, data: Partial<DefectiveProduct>): Promise<DefectiveProduct> => {
    const response = await apiClient.patch(`/defective-products/${id}/`, data)
    return response.data
  },

  deleteDefectiveProduct: async (id: number): Promise<void> => {
    await apiClient.delete(`/defective-products/${id}/`)
  },

  // Вложения
  getAttachments: async (complaintId: number): Promise<ComplaintAttachment[]> => {
    const response = await apiClient.get(`/attachments/?complaint=${complaintId}`)
    return response.data
  },

  uploadAttachment: async (
    complaintId: number,
    file: File,
    attachmentType?: string,
    description?: string
  ): Promise<ComplaintAttachment> => {
    const formData = new FormData()
    formData.append('complaint', String(complaintId))
    formData.append('file', file)
    if (attachmentType) {
      formData.append('attachment_type', attachmentType)
    }
    if (description) {
      formData.append('description', description)
    }

    const response = await apiClient.post('/attachments/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  deleteAttachment: async (_complaintId: number, attachmentId: number): Promise<void> => {
    await apiClient.delete(`/attachments/${attachmentId}/`)
  },

  // Комментарии
  getComments: async (complaintId: number): Promise<ComplaintComment[]> => {
    const response = await apiClient.get(`/comments/?complaint=${complaintId}`)
    return response.data
  },

  createComment: async (complaintId: number, text: string): Promise<ComplaintComment> => {
    const response = await apiClient.post('/comments/', {
      complaint: complaintId,
      text,
    })
    return response.data
  },

  updateComment: async (id: number, text: string): Promise<ComplaintComment> => {
    const response = await apiClient.patch(`/comments/${id}/`, { text })
    return response.data
  },

  deleteComment: async (id: number): Promise<void> => {
    await apiClient.delete(`/comments/${id}/`)
  },
}

