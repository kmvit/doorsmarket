import apiClient from './client'
import {
  Order, OrderListItem, CreateOrderData, OrderFilters,
  MeasurementRequest, CreateMeasurementRequestData,
  OrderActionReminder, CreateActionReminderData,
  WorkshopOrder, ParsedKpData, OrderAttachment, OrderActivityLog, OrderStatus,
  OrderFolderCount, OrderManager, Designer, CreateDesignerData,
} from '../types/orders'
import { orderUtils, withOfflineFallback } from '../services/offline'
import { requestWithQueue } from '../services/sync'

// TTL кеша для вспомогательных данных (счётчики папок, журналы) — 7 дней,
// чтобы данные пережили длительный офлайн
const LONG_TTL = 7 * 24 * 60 * 60 * 1000

export const designersAPI = {
  // Поиск по фамилии/имени, студии и телефону; без запроса — первые 30
  // cityId — город салона заказа; сервер учитывает его только у админа
  // (менеджер и руководитель и так видят дизайнеров своего города)
  search: async (query: string, cityId?: number | null): Promise<Designer[]> => {
    const params: Record<string, string> = {}
    if (query) params.search = query
    if (cityId) params.city = String(cityId)
    const response = await apiClient.get('/designers/', { params })
    return Array.isArray(response.data) ? response.data : (response.data.results || [])
  },

  // Справочник: весь список (своего города; админу — всех или выбранного города)
  directory: async (cityId?: number | null): Promise<Designer[]> => {
    const params: Record<string, string> = { all: '1' }
    if (cityId) params.city = String(cityId)
    const response = await apiClient.get('/designers/', { params })
    return Array.isArray(response.data) ? response.data : (response.data.results || [])
  },

  create: async (data: CreateDesignerData): Promise<Designer> => {
    const response = await apiClient.post('/designers/', data)
    return response.data
  },

  update: async (id: number, data: Partial<CreateDesignerData>): Promise<Designer> => {
    const response = await apiClient.patch(`/designers/${id}/`, data)
    return response.data
  },
}

export const ordersAPI = {
  getList: async (filters?: OrderFilters): Promise<OrderListItem[]> => {
    const params: Record<string, any> = {}
    // Несколько статусов — одним параметром status__in=a,b
    if (filters?.status?.length) params.status__in = filters.status.join(',')
    if (filters?.salon) params.salon = filters.salon
    if (filters?.manager_id) params.manager_id = filters.manager_id
    if (filters?.managers?.length) params.manager__in = filters.managers.join(',')
    if (filters?.salons?.length) params.salon__in = filters.salons.join(',')
    if (filters?.cities?.length) params.city__in = filters.cities.join(',')
    if (filters?.search) params.search = filters.search
    if (filters?.my_orders) params.my_orders = 'true'
    if (filters?.exclude_cancelled) params.exclude_cancelled = 'true'
    if (filters?.exclude_finished) params.exclude_finished = 'true'
    if (filters?.folder) params.folder = filters.folder

    return withOfflineFallback({
      cacheKey: `orders_list_${JSON.stringify(params)}`,
      request: async () => {
        const response = await apiClient.get('/orders/', { params })
        return Array.isArray(response.data) ? response.data : (response.data.results || [])
      },
      saveOffline: (list) => orderUtils.saveList(list),
      loadOffline: () => orderUtils.getList(),
    })
  },

  // Менеджеры для фильтра в списках — только те, чьи заказы пользователь видит
  // scope сужает список под выбранные в фильтре города и салоны
  getManagers: async (scope?: { cities?: string[]; salons?: string[] }): Promise<OrderManager[]> => {
    const params: Record<string, string> = {}
    if (scope?.cities?.length) params.city__in = scope.cities.join(',')
    if (scope?.salons?.length) params.salon__in = scope.salons.join(',')
    return withOfflineFallback({
      cacheKey: `orders_managers_${JSON.stringify(params)}`,
      request: async () => {
        const response = await apiClient.get('/orders/managers/', { params })
        return Array.isArray(response.data) ? response.data : []
      },
      ttl: LONG_TTL,
    })
  },

  getFolderCounts: async (opts?: { mine?: boolean }): Promise<OrderFolderCount[]> => {
    const params: Record<string, any> = {}
    if (opts?.mine) params.mine = 'true'
    return withOfflineFallback({
      cacheKey: `orders_folder_counts_${opts?.mine ? 'mine' : 'all'}`,
      request: async () => {
        const response = await apiClient.get('/orders/folder_counts/', { params })
        return Array.isArray(response.data) ? response.data : []
      },
      ttl: LONG_TTL,
    })
  },

  getById: async (id: number): Promise<Order> => {
    return withOfflineFallback({
      cacheKey: `order_detail_${id}`,
      request: async () => {
        const response = await apiClient.get(`/orders/${id}/`)
        return response.data
      },
      saveOffline: (order) => orderUtils.saveDetail(order),
      loadOffline: () => orderUtils.getDetail(id),
    })
  },

  create: async (data: CreateOrderData): Promise<Order> => {
    return requestWithQueue('POST', '/orders/', data)
  },

  update: async (id: number, data: Partial<CreateOrderData>): Promise<Order> => {
    return requestWithQueue('PATCH', `/orders/${id}/`, data)
  },

  fullUpdate: async (id: number, data: CreateOrderData): Promise<Order> => {
    return requestWithQueue('PUT', `/orders/${id}/`, data)
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/orders/${id}/`)
  },

  // Отметить выплату дизайнеру (папка «Выплаты дизайнерам»). Только онлайн:
  // в очереди офлайн-запросов сумма могла бы уйти дважды
  markDesignerPaid: async (id: number, amount: string): Promise<Order> => {
    const response = await apiClient.post(`/orders/${id}/designer_paid/`, { amount })
    return response.data
  },

  uploadOffer: async (id: number, file: File): Promise<Order> => {
    const formData = new FormData()
    formData.append('commercial_offer', file)
    return requestWithQueue('PATCH', `/orders/${id}/`, formData, {
      'Content-Type': 'multipart/form-data',
    })
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
    return requestWithQueue('POST', '/order-attachments/', formData, {
      'Content-Type': 'multipart/form-data',
    })
  },

  deleteAttachment: async (attachmentId: number): Promise<void> => {
    await apiClient.delete(`/order-attachments/${attachmentId}/`)
  },

  // ===== Phase 2 =====

  // Парсинг КП выполняется на сервере — офлайн недоступен
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
    return requestWithQueue('POST', '/orders/create_from_parsed/', data)
  },

  // Замена КП в существующем заказе (повторная загрузка): шапка обновляется,
  // позиции пересоздаются, замер сохраняется (связки проёмов сбрасываются).
  replaceFromParsed: async (
    orderId: number,
    data: ParsedKpData & { comment?: string },
  ): Promise<Order> => {
    return requestWithQueue('POST', `/orders/${orderId}/replace_from_parsed/`, data)
  },

  // Присоединение ещё одного КП к заказу: позиции дописываются к уже имеющимся
  // (нумерация проёмов продолжается), ничего не удаляется, замер не затрагивается.
  appendFromParsed: async (
    orderId: number,
    data: ParsedKpData,
  ): Promise<Order & { kp_number_warning?: string }> => {
    return requestWithQueue('POST', `/orders/${orderId}/append_from_parsed/`, data)
  },

  getMeasurementRequest: async (orderId: number): Promise<MeasurementRequest | null> => {
    return withOfflineFallback({
      cacheKey: `order_measurement_request_${orderId}`,
      request: async () => {
        const response = await apiClient.get(`/orders/${orderId}/measurement-request/`)
        return response.data
      },
      ttl: LONG_TTL,
    })
  },

  saveMeasurementRequest: async (
    orderId: number,
    data: CreateMeasurementRequestData,
    // Планов открывания может быть несколько; removeFileIds — id ранее
    // приложенных файлов на удаление (null — файл в поле opening_plan заявки)
    files?: File[] | null,
    removeFileIds?: (number | null)[],
  ): Promise<MeasurementRequest> => {
    const hasFiles = Boolean(files && files.length)
    const hasRemovals = Boolean(removeFileIds && removeFileIds.length)
    if (hasFiles || hasRemovals) {
      const formData = new FormData()
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null) formData.append(k, String(v))
      })
      ;(files || []).forEach((f) => formData.append('files', f))
      ;(removeFileIds || []).forEach((id) => formData.append('remove_files', id === null ? 'null' : String(id)))
      return requestWithQueue('POST', `/orders/${orderId}/measurement-request/`, formData, {
        'Content-Type': 'multipart/form-data',
      })
    }
    return requestWithQueue('POST', `/orders/${orderId}/measurement-request/`, data)
  },

  applyMeasurementToItems: async (orderId: number): Promise<Order> => {
    return requestWithQueue('POST', `/orders/${orderId}/apply_measurement_to_items/`)
  },

  // ===== Phase 5: переходы статусов производства/отгрузки =====
  transition: async (
    orderId: number,
    status: OrderStatus,
    opts?: { production_start_date?: string | null; production_deadline?: string | null },
  ): Promise<Order> => {
    return requestWithQueue('POST', `/orders/${orderId}/transition/`, {
      status,
      ...(opts || {}),
    })
  },

  getActivityLog: async (orderId: number): Promise<OrderActivityLog[]> => {
    return withOfflineFallback({
      cacheKey: `order_activity_log_${orderId}`,
      request: async () => {
        const response = await apiClient.get(`/orders/${orderId}/activity_log/`)
        return Array.isArray(response.data) ? response.data : (response.data.results || [])
      },
      ttl: LONG_TTL,
    })
  },

  // SMS клиенту «не дозвонились» — доступно с момента заявки (замера может не быть)
  notifyClientCallFailed: async (orderId: number): Promise<{ detail: string; phone: string }> => {
    const response = await apiClient.post(`/orders/${orderId}/notify_client_call_failed/`)
    return response.data
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
    return requestWithQueue('PATCH', `/order-items/${itemId}/`, data)
  },
}

export const remindersAPI = {
  list: async (params?: { mine?: boolean; today?: boolean; tomorrow?: boolean; overdue?: boolean; order?: number; done?: boolean }): Promise<OrderActionReminder[]> => {
    const queryParams: Record<string, any> = {}
    if (params?.mine) queryParams.mine = 'true'
    if (params?.today) queryParams.today = 'true'
    if (params?.tomorrow) queryParams.tomorrow = 'true'
    if (params?.overdue) queryParams.overdue = 'true'
    if (params?.order != null) queryParams.order = params.order
    if (params?.done != null) queryParams.done = params.done ? 'true' : 'false'
    return withOfflineFallback({
      cacheKey: `reminders_list_${JSON.stringify(queryParams)}`,
      request: async () => {
        const response = await apiClient.get('/action-reminders/', { params: queryParams })
        return Array.isArray(response.data) ? response.data : (response.data.results || [])
      },
      ttl: LONG_TTL,
    })
  },

  create: async (data: CreateActionReminderData): Promise<OrderActionReminder> => {
    return requestWithQueue('POST', '/action-reminders/', data)
  },

  update: async (id: number, data: Partial<CreateActionReminderData>): Promise<OrderActionReminder> => {
    return requestWithQueue('PATCH', `/action-reminders/${id}/`, data)
  },

  markDone: async (
    id: number,
    options?: {
      new_status?: string
      next_action_text?: string
      next_action_due_at?: string
    },
  ): Promise<OrderActionReminder & { next_reminder?: OrderActionReminder }> => {
    return requestWithQueue('POST', `/action-reminders/${id}/mark_done/`, options || {})
  },

  reschedule: async (id: number, dueAt: string): Promise<OrderActionReminder> => {
    return requestWithQueue('POST', `/action-reminders/${id}/reschedule/`, { due_at: dueAt })
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/action-reminders/${id}/`)
  },
}

export const workshopAPI = {
  list: async (params?: { mine?: boolean; with_reminder_today?: boolean; with_reminder_tomorrow?: boolean; with_overdue_reminder?: boolean; status?: string[]; managers?: string[]; salons?: string[]; cities?: string[]; search?: string }): Promise<WorkshopOrder[]> => {
    const queryParams: Record<string, any> = {}
    if (params?.mine) queryParams.mine = 'true'
    if (params?.with_reminder_today) queryParams.with_reminder_today = 'true'
    if (params?.with_reminder_tomorrow) queryParams.with_reminder_tomorrow = 'true'
    if (params?.with_overdue_reminder) queryParams.with_overdue_reminder = 'true'
    if (params?.status?.length) queryParams.status__in = params.status.join(',')
    if (params?.managers?.length) queryParams.manager__in = params.managers.join(',')
    if (params?.salons?.length) queryParams.salon__in = params.salons.join(',')
    if (params?.cities?.length) queryParams.city__in = params.cities.join(',')
    if (params?.search) queryParams.search = params.search
    return withOfflineFallback({
      cacheKey: `workshop_list_${JSON.stringify(queryParams)}`,
      request: async () => {
        const response = await apiClient.get('/workshop/', { params: queryParams })
        return Array.isArray(response.data) ? response.data : (response.data.results || [])
      },
      ttl: LONG_TTL,
    })
  },
}
