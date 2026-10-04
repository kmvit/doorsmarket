import apiClient from './client'

export interface ServiceManagerReportMeasurement {
  id: number
  order_id: number
  done_at: string
  measurement_date: string | null
  client_name: string
  address: string
  kp_number: string
  salon_name: string
  manager_name: string
  openings_count: number
  panels_count: number
  // Проёмы + панели — по ним считается зарплата
  paid_openings_count: number
  distance_payment: 'on_site' | 'invoice' | ''
  distance_payment_display: string
  distance_km: string | null
}

export interface ServiceManagerReportRow {
  service_manager: { id: number; full_name: string }
  measurements_count: number
  openings_count: number
  panels_count: number
  paid_openings_count: number
  // Км по замерам «включить в счёт» — идут в расчёт
  distance_km_invoice: string
  measurements: ServiceManagerReportMeasurement[]
}

export interface ServiceManagerReport {
  totals: {
    service_managers_count: number
    measurements_count: number
    openings_count: number
    panels_count: number
    paid_openings_count: number
    distance_km_invoice: string
  }
  service_managers: ServiceManagerReportRow[]
}

export const serviceManagerReportAPI = {
  get: async (params: { date_from: string; date_to: string; city: string }): Promise<ServiceManagerReport> => {
    const query: Record<string, string> = {}
    if (params.date_from) query.date_from = params.date_from
    if (params.date_to) query.date_to = params.date_to
    if (params.city) query.city = params.city
    const response = await apiClient.get('/reports/service-managers/', { params: query })
    return response.data
  },
}
