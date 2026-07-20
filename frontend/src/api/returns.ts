import apiClient from './client'
import {
  ReturnRegistry,
  ReturnRegistryFilters,
  ReturnRegistryStats,
} from '../types/complaints'

export const returnsAPI = {
  // Получить список записей реестра на возврат
  getList: async (filters?: ReturnRegistryFilters): Promise<{ results: ReturnRegistry[]; count: number }> => {
    const params = new URLSearchParams()

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value))
        }
      })
    }

    const response = await apiClient.get(`/return-registry/?${params.toString()}`)
    const data = response.data

    // Обработка случая, когда API возвращает массив напрямую (без пагинации)
    if (Array.isArray(data)) {
      return {
        results: data,
        count: data.length,
      }
    }

    return {
      results: data.results || [],
      count: data.count || 0,
    }
  },

  // Получить детальную информацию о записи
  getDetail: async (id: number): Promise<ReturnRegistry> => {
    const response = await apiClient.get(`/return-registry/${id}/`)
    return response.data
  },

  // Обновить запись (статус, фактическая дата, комментарии)
  update: async (id: number, data: Partial<ReturnRegistry>): Promise<ReturnRegistry> => {
    const response = await apiClient.patch(`/return-registry/${id}/`, data)
    return response.data
  },

  // Получить статистику
  getStats: async (): Promise<ReturnRegistryStats> => {
    const response = await apiClient.get('/return-registry/stats/')
    return response.data
  },
}
