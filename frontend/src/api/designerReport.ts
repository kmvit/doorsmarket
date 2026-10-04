import apiClient from './client'
import { OrderStatus } from '../types/orders'

export interface DesignerReportOrder {
  id: number
  created_at: string
  client_name: string
  kp_number: string
  address: string
  status: OrderStatus
  status_display: string
  salon_name: string
  manager_name: string
  amount: string | null
  designer_paid_amount: string | null
  designer_paid_at: string | null
  designer_paid_by_name: string
}

export interface DesignerReportRow {
  designer: { id: number; full_name: string; phone: string; studio: string; bonus_percent: number | null }
  orders_count: number
  orders_amount: string
  bonus_paid: string
  bonus_paid_count: number
  status_counts: Partial<Record<OrderStatus, number>>
  orders: DesignerReportOrder[]
}

export interface DesignerReport {
  totals: { designers_count: number; orders_count: number; orders_amount: string; bonus_paid: string }
  designers: DesignerReportRow[]
}

/** Фильтры отчёта — те же ключи, что в адресной строке страницы. */
export interface DesignerReportFilters {
  date_from: string
  date_to: string
  city: string
  salon: string
  managers: string[]
  statuses: OrderStatus[]
}

export const designerReportAPI = {
  get: async (filters: DesignerReportFilters, designerId?: number): Promise<DesignerReport> => {
    const params: Record<string, string> = {}
    if (filters.date_from) params.date_from = filters.date_from
    if (filters.date_to) params.date_to = filters.date_to
    if (filters.city) params.city = filters.city
    if (filters.salon) params.salon = filters.salon
    if (filters.managers.length) params.manager__in = filters.managers.join(',')
    if (filters.statuses.length) params.status__in = filters.statuses.join(',')
    if (designerId) params.designer = String(designerId)
    const response = await apiClient.get('/reports/designers/', { params })
    return response.data
  },
}
