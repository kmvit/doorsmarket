import apiClient from './client'
import {
  ShippingRegistry,
  ShippingRegistryFilters,
  ShippingRegistryStats,
} from '../types/complaints'

export const shippingAPI = {
  // Получить список записей реестра
  getList: async (filters?: ShippingRegistryFilters): Promise<{ results: ShippingRegistry[]; count: number }> => {
    const params = new URLSearchParams()
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value))
        }
      })
    }
    
    const response = await apiClient.get(`/shipping-registry/?${params.toString()}`)
    const data = response.data
    
    // Обработка случая, когда API возвращает массив напрямую (без пагинации)
    if (Array.isArray(data)) {
      return {
        results: data,
        count: data.length,
      }
    }
    
    // Если API возвращает объект с results и count (с пагинацией)
    return {
      results: data.results || [],
      count: data.count || 0,
    }
  },

  // Получить детальную информацию о записи
  getDetail: async (id: number): Promise<ShippingRegistry> => {
    const response = await apiClient.get(`/shipping-registry/${id}/`)
    return response.data
  },

  // Создать запись в реестре
  create: async (data: Partial<ShippingRegistry>): Promise<ShippingRegistry> => {
    const response = await apiClient.post('/shipping-registry/', data)
    return response.data
  },

  // Обновить запись
  update: async (id: number, data: Partial<ShippingRegistry>): Promise<ShippingRegistry> => {
    const response = await apiClient.patch(`/shipping-registry/${id}/`, data)
    return response.data
  },

  // Удалить запись
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/shipping-registry/${id}/`)
  },

  // Получить статистику
  getStats: async (filters?: ShippingRegistryFilters): Promise<ShippingRegistryStats> => {
    const params = new URLSearchParams()
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value))
        }
      })
    }
    
    const queryString = params.toString()
    const url = `/shipping-registry/stats/${queryString ? `?${queryString}` : ''}`
    const response = await apiClient.get(url)
    return response.data
  },
}

