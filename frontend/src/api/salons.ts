import apiClient from './client'
import { Salon } from '../types/orders'
import { withOfflineFallback } from '../services/offline'

// Салоны меняются редко — храним в кеше 7 дней для офлайн-режима
const LONG_TTL = 7 * 24 * 60 * 60 * 1000

export const salonsAPI = {
  getAll: async (cityId?: number): Promise<Salon[]> => {
    const params = cityId ? { city: cityId } : {}
    return withOfflineFallback({
      cacheKey: `salons_${cityId || 'all'}`,
      request: async () => {
        const response = await apiClient.get('/salons/', { params })
        return Array.isArray(response.data) ? response.data : (response.data.results || [])
      },
      ttl: LONG_TTL,
    })
  },
}
