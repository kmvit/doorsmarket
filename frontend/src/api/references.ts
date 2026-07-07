import apiClient from './client'
import { ProductionSite, ComplaintReason } from '../types/complaints'
import { User } from '../types/auth'
import { withOfflineFallback } from '../services/offline'

// Справочники меняются редко — храним в кеше 7 дней для офлайн-режима
const LONG_TTL = 7 * 24 * 60 * 60 * 1000

export const referencesAPI = {
  // Производственные площадки
  getProductionSites: async (): Promise<ProductionSite[]> => {
    return withOfflineFallback({
      cacheKey: 'references_production_sites',
      request: async () => {
        const response = await apiClient.get('/production-sites/')
        return response.data
      },
      ttl: LONG_TTL,
    })
  },

  // Причины рекламаций
  getComplaintReasons: async (): Promise<ComplaintReason[]> => {
    return withOfflineFallback({
      cacheKey: 'references_complaint_reasons',
      request: async () => {
        const response = await apiClient.get('/complaint-reasons/')
        return response.data
      },
      ttl: LONG_TTL,
    })
  },

  // Пользователи по роли
  getUsersByRole: async (role: string): Promise<User[]> => {
    return withOfflineFallback({
      cacheKey: `references_users_role_${role}`,
      request: async () => {
        const response = await apiClient.get(`/users/?role=${role}`)
        // API возвращает массив или объект с results
        return Array.isArray(response.data) ? response.data : (response.data.results || [])
      },
      ttl: LONG_TTL,
    })
  },

  // Все пользователи (с опциональной фильтрацией по роли)
  getAllUsers: async (role?: string): Promise<User[]> => {
    return withOfflineFallback({
      cacheKey: `references_users_${role || 'all'}`,
      request: async () => {
        const url = role ? `/users/?role=${role}` : '/users/'
        const response = await apiClient.get(url)
        return Array.isArray(response.data) ? response.data : (response.data.results || [])
      },
      ttl: LONG_TTL,
    })
  },
}
