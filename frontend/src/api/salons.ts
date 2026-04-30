import apiClient from './client'
import { Salon } from '../types/orders'

export const salonsAPI = {
  getAll: async (cityId?: number): Promise<Salon[]> => {
    const params = cityId ? { city: cityId } : {}
    const response = await apiClient.get('/salons/', { params })
    return Array.isArray(response.data) ? response.data : (response.data.results || [])
  },
}
