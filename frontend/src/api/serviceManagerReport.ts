import apiClient from './client'

/** Строка отчёта — столбцы как в образце «Отчет по замерам.xlsx». */
export interface ServiceManagerReportMeasurement {
  number: number              // порядковый № в отчёте СМ, с 1
  id: number
  order_id: number
  done_at: string
  address: string
  client_name: string
  manager_name: string
  payment_status: string      // «Оплачен на месте» / «Не оплачен» / '' — про удалённость
  openings_count: number
  panels_count: number
  openings_total: number      // проёмы + панели
  tariff_exceeded: boolean    // больше 60 проёмов — шкала не описывает
  measurement_sum: string
  distance_km: string | null
  distance_sum: string
  total: string
}

export interface ServiceManagerReportRow {
  service_manager: { id: number; full_name: string }
  measurements_count: number
  openings_total: number
  measurements_sum: string
  distance_sum: string
  total: string
  measurements: ServiceManagerReportMeasurement[]
}

export interface ServiceManagerReport {
  totals: {
    service_managers_count: number
    measurements_count: number
    openings_total: number
    measurements_sum: string
    distance_sum: string
    total: string
  }
  tariff: { openings: { up_to: number; amount: string }[]; distance_rate: string }
  service_managers: ServiceManagerReportRow[]
}

interface ReportParams {
  date_from: string
  date_to: string
  city: string
  service_manager?: number
}

const toQuery = (params: ReportParams) => {
  const query: Record<string, string> = {}
  if (params.date_from) query.date_from = params.date_from
  if (params.date_to) query.date_to = params.date_to
  if (params.city) query.city = params.city
  if (params.service_manager) query.service_manager = String(params.service_manager)
  return query
}

export const serviceManagerReportAPI = {
  get: async (params: ReportParams): Promise<ServiceManagerReport> => {
    const response = await apiClient.get('/reports/service-managers/', { params: toQuery(params) })
    return response.data
  },

  // Excel в виде образца: по листу на каждого СМ (или один лист, если передан service_manager)
  downloadXlsx: async (params: ReportParams, filename: string): Promise<void> => {
    const response = await apiClient.get('/reports/service-managers/', {
      params: { ...toQuery(params), export: 'xlsx' },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
