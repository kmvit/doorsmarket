import apiClient from './client'
import {
  Order, OrderListItem, CreateOrderData, OrderFilters,
  MeasurementRequest, CreateMeasurementRequestData,
  OrderActionReminder, CreateActionReminderData,
  WorkshopOrder, ParsedKpData, OrderAttachment, OrderActivityLog, OrderStatus,
} from '../types/orders'

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

  uploadAttachment: async (
    orderId: number,
    file: File,
    orderItemId?: number | null,
  ): Promise<OrderAttachment> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('order', String(orderId))
    if (orderItemId) {
      formData.append('order_item', String(orderItemId))
    }
    const response = await apiClient.post('/order-attachments/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  deleteAttachment: async (attachmentId: number): Promise<void> => {
    await apiClient.delete(`/order-attachments/${attachmentId}/`)
  },

  // ===== Phase 2 =====

  parseKp: async (file: File): Promise<ParsedKpData> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post('/orders/parse_kp/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  createFromParsed: async (
    data: ParsedKpData & {
      salon: number
      comment?: string
      next_action_text: string
      next_action_due_at: string
    },
  ): Promise<Order> => {
    const response = await apiClient.post('/orders/create_from_parsed/', data)
    return response.data
  },

  getMeasurementRequest: async (orderId: number): Promise<MeasurementRequest | null> => {
    const response = await apiClient.get(`/orders/${orderId}/measurement-request/`)
    return response.data
  },

  saveMeasurementRequest: async (
    orderId: number,
    data: CreateMeasurementRequestData,
    openingPlan?: File | null,
  ): Promise<MeasurementRequest> => {
    if (openingPlan) {
      const formData = new FormData()
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null) formData.append(k, String(v))
      })
      formData.append('opening_plan', openingPlan)
      const response = await apiClient.post(`/orders/${orderId}/measurement-request/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    }
    const response = await apiClient.post(`/orders/${orderId}/measurement-request/`, data)
    return response.data
  },

  applyMeasurementToItems: async (orderId: number): Promise<Order> => {
    const response = await apiClient.post(`/orders/${orderId}/apply_measurement_to_items/`)
    return response.data
  },

  // ===== Phase 5: переходы статусов производства/отгрузки =====
  transition: async (
    orderId: number,
    status: OrderStatus,
    opts?: { production_start_date?: string | null; production_deadline?: string | null },
  ): Promise<Order> => {
    const response = await apiClient.post(`/orders/${orderId}/transition/`, {
      status,
      ...(opts || {}),
    })
    return response.data
  },

  getActivityLog: async (orderId: number): Promise<OrderActivityLog[]> => {
    const response = await apiClient.get(`/orders/${orderId}/activity_log/`)
    return Array.isArray(response.data) ? response.data : (response.data.results || [])
  },

  updateItem: async (
    itemId: number,
    data: Partial<{
      door_height: number | null
      door_width: number | null
      opening_type: string
      door_type: string
      recommended_opening_height: number | null
      recommended_opening_width: number | null
    }>,
  ): Promise<any> => {
    const response = await apiClient.patch(`/order-items/${itemId}/`, data)
    return response.data
  },
}

export const remindersAPI = {
  list: async (params?: { mine?: boolean; today?: boolean; overdue?: boolean; order?: number; done?: boolean }): Promise<OrderActionReminder[]> => {
    const queryParams: Record<string, any> = {}
    if (params?.mine) queryParams.mine = 'true'
    if (params?.today) queryParams.today = 'true'
    if (params?.overdue) queryParams.overdue = 'true'
    if (params?.order != null) queryParams.order = params.order
    if (params?.done != null) queryParams.done = params.done ? 'true' : 'false'
    const response = await apiClient.get('/action-reminders/', { params: queryParams })
    return Array.isArray(response.data) ? response.data : (response.data.results || [])
  },

  create: async (data: CreateActionReminderData): Promise<OrderActionReminder> => {
    const response = await apiClient.post('/action-reminders/', data)
    return response.data
  },

  update: async (id: number, data: Partial<CreateActionReminderData>): Promise<OrderActionReminder> => {
    const response = await apiClient.patch(`/action-reminders/${id}/`, data)
    return response.data
  },

  markDone: async (
    id: number,
    options?: {
      new_status?: string
      next_action_text?: string
      next_action_due_at?: string
    },
  ): Promise<OrderActionReminder & { next_reminder?: OrderActionReminder }> => {
    const response = await apiClient.post(`/action-reminders/${id}/mark_done/`, options || {})
    return response.data
  },

  reschedule: async (id: number, dueAt: string): Promise<OrderActionReminder> => {
    const response = await apiClient.post(`/action-reminders/${id}/reschedule/`, { due_at: dueAt })
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/action-reminders/${id}/`)
  },
}

export const workshopAPI = {
  list: async (params?: { mine?: boolean; with_reminder_today?: boolean; with_overdue_reminder?: boolean; status?: string; search?: string }): Promise<WorkshopOrder[]> => {
    const queryParams: Record<string, any> = {}
    if (params?.mine) queryParams.mine = 'true'
    if (params?.with_reminder_today) queryParams.with_reminder_today = 'true'
    if (params?.with_overdue_reminder) queryParams.with_overdue_reminder = 'true'
    if (params?.status) queryParams.status = params.status
    if (params?.search) queryParams.search = params.search
    const response = await apiClient.get('/workshop/', { params: queryParams })
    return Array.isArray(response.data) ? response.data : (response.data.results || [])
  },
}
