import apiClient from './client'
import { ProductionSite, ComplaintReason } from '../types/complaints'
import { User } from '../types/auth'

export const referencesAPI = {
  // Производственные площадки
  getProductionSites: async (): Promise<ProductionSite[]> => {
    const response = await apiClient.get('/production-sites/')
    return response.data
  },

  // Причины рекламаций
  getComplaintReasons: async (): Promise<ComplaintReason[]> => {
    const response = await apiClient.get('/complaint-reasons/')
    return response.data
  },

  // Пользователи по роли
  getUsersByRole: async (role: string): Promise<User[]> => {
    const response = await apiClient.get(`/users/?role=${role}`)
    // API возвращает массив или объект с results
    return Array.isArray(response.data) ? response.data : (response.data.results || [])
  },
}

