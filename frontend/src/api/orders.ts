import apiClient from './client'
import { Order, OrderListItem, CreateOrderData, OrderFilters } from '../types/orders'

export const ordersAPI = {
  getList: async (filters?: OrderFilters): Promise<OrderListItem[]> => {
    const params: Record<string, any> = {}
    if (filters?.status) params.status = filters.status
    if (filters?.salon) params.salon = filters.salon
    if (filters?.manager_id) params.manager_id = filters.manager_id
    if (filters?.search) params.search = filters.search
    if (filters?.my_orders) params.my_orders = 'true'
    if (filters?.exclude_cancelled) params.exclude_cancelled = 'true'

    const response = await apiClient.get('/orders/', { params })
    return Array.isArray(response.data) ? response.data : (response.data.results || [])
  },

  getById: async (id: number): Promise<Order> => {
    const response = await apiClient.get(`/orders/${id}/`)
    return response.data
  },

  create: async (data: CreateOrderData): Promise<Order> => {
    const response = await apiClient.post('/orders/', data)
    return response.data
  },

  update: async (id: number, data: Partial<CreateOrderData>): Promise<Order> => {
    const response = await apiClient.patch(`/orders/${id}/`, data)
    return response.data
  },

  fullUpdate: async (id: number, data: CreateOrderData): Promise<Order> => {
    const response = await apiClient.put(`/orders/${id}/`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/orders/${id}/`)
  },

  uploadOffer: async (id: number, file: File): Promise<Order> => {
    const formData = new FormData()
    formData.append('commercial_offer', file)
    const response = await apiClient.patch(`/orders/${id}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
}
