import apiClient from './client'
import { withOfflineFallback } from '../services/offline'
import { requestWithQueue } from '../services/sync'
import {
  Installation, InstallationEvent, InstallationFields, InstallationFile, InstallationFileKind,
  InstallationFilters, InstallationFolderCount, InstallationPrefill, Installer, ScheduleVisit,
} from '../types/installations'

const LONG_TTL = 7 * 24 * 60 * 60 * 1000

const asList = <T>(data: any): T[] => (Array.isArray(data) ? data : (data?.results || []))

export const installationsAPI = {
  getList: async (filters?: InstallationFilters): Promise<Installation[]> => {
    const params: Record<string, string> = {}
    if (filters?.status?.length) params.status__in = filters.status.join(',')
    if (filters?.is_paid !== undefined) params.is_paid = String(filters.is_paid)
    if (filters?.exclude_closed) params.exclude_closed = 'true'
    if (filters?.mine) params.mine = 'true'
    if (filters?.search) params.search = filters.search
    if (filters?.order) params.order = String(filters.order)
    if (filters?.cities?.length) params.city__in = filters.cities.join(',')
    if (filters?.salons?.length) params.salon__in = filters.salons.join(',')
    if (filters?.managers?.length) params.manager__in = filters.managers.join(',')
    if (filters?.folder) params.folder = filters.folder
    return withOfflineFallback({
      cacheKey: `installations_list_${JSON.stringify(params)}`,
      request: async () => asList<Installation>((await apiClient.get('/installations/', { params })).data),
      ttl: LONG_TTL,
    })
  },

  getById: async (id: number): Promise<Installation> =>
    withOfflineFallback({
      cacheKey: `installation_detail_${id}`,
      request: async () => (await apiClient.get(`/installations/${id}/`)).data,
      ttl: LONG_TTL,
    }),

  getEvents: async (id: number): Promise<InstallationEvent[]> =>
    withOfflineFallback({
      cacheKey: `installation_events_${id}`,
      request: async () => asList<InstallationEvent>((await apiClient.get(`/installations/${id}/events/`)).data),
      ttl: LONG_TTL,
    }),

  prefill: async (orderId: number): Promise<InstallationPrefill> =>
    (await apiClient.get('/installations/prefill/', { params: { order: orderId } })).data,

  // Оформление — только онлайн: обязательные документы проверяет сервер,
  // а без номера монтажа после отправки некуда перейти
  create: async (
    orderId: number,
    fields: InstallationFields,
    files: Partial<Record<InstallationFileKind, File[]>>,
  ): Promise<Installation> => {
    const form = new FormData()
    form.append('order', String(orderId))
    form.append('is_paid', fields.is_paid ? 'true' : 'false')
    form.append('work_description', fields.work_description)
    form.append('collection_finish', fields.collection_finish)
    if (fields.planned_delivery_date) form.append('planned_delivery_date', fields.planned_delivery_date)
    form.append('desired_date_comment', fields.desired_date_comment)
    form.append('contact_name', fields.contact_name)
    form.append('contact_phone', fields.contact_phone)
    for (const [kind, list] of Object.entries(files)) {
      for (const f of list || []) form.append(kind, f)
    }
    const response = await apiClient.post('/installations/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  update: async (id: number, fields: Partial<InstallationFields>): Promise<Installation> =>
    (await apiClient.patch(`/installations/${id}/`, fields)).data,

  uploadFile: async (installationId: number, kind: InstallationFileKind, file: File): Promise<InstallationFile> => {
    const form = new FormData()
    form.append('installation', String(installationId))
    form.append('kind', kind)
    form.append('file', file)
    const response = await apiClient.post('/installation-files/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  // Акт и фото результата монтажник прикладывает и без связи: запрос встаёт в
  // очередь (файл хранится байтами) и уйдёт, когда сеть появится
  uploadWorkFile: async (installationId: number, kind: 'act' | 'result', file: File): Promise<InstallationFile> => {
    const form = new FormData()
    form.append('installation', String(installationId))
    form.append('kind', kind)
    form.append('file', file)
    return requestWithQueue('POST', '/installation-files/', form, { 'Content-Type': 'multipart/form-data' })
  },

  // Завершение тоже через очередь: в поле связи может не быть. Очередь идёт по
  // порядку, поэтому акт, приложенный офлайн, попадёт на сервер раньше
  complete: async (id: number, partial: boolean): Promise<Installation> =>
    requestWithQueue('POST', `/installations/${id}/${partial ? 'complete_partial' : 'complete'}/`, {}),

  deleteFile: async (fileId: number): Promise<void> => {
    await apiClient.delete(`/installation-files/${fileId}/`)
  },

  getFolderCounts: async (opts?: { mine?: boolean }): Promise<InstallationFolderCount[]> =>
    withOfflineFallback({
      cacheKey: `installations_folder_counts_${opts?.mine ? 'mine' : 'all'}`,
      request: async () =>
        asList<InstallationFolderCount>((await apiClient.get('/installations/folder_counts/', {
          params: opts?.mine ? { mine: 'true' } : {},
        })).data),
      ttl: LONG_TTL,
    }),

  getInstallers: async (): Promise<Installer[]> =>
    withOfflineFallback({
      cacheKey: 'installations_installers',
      request: async () => asList<Installer>((await apiClient.get('/installations/installers/')).data),
      ttl: LONG_TTL,
    }),

  getSchedule: async (dateFrom: string, dateTo: string, installers?: number[]): Promise<ScheduleVisit[]> => {
    const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo }
    if (installers?.length) params.installers = installers.join(',')
    return withOfflineFallback({
      cacheKey: `installations_schedule_${JSON.stringify(params)}`,
      request: async () => asList<ScheduleVisit>((await apiClient.get('/installations/schedule/', { params })).data),
      ttl: LONG_TTL,
    })
  },

  assign: async (id: number, installers: number[], dateFrom: string, dateTo: string): Promise<Installation> =>
    (await apiClient.post(`/installations/${id}/assign/`, { installers, date_from: dateFrom, date_to: dateTo })).data,

  action: async (
    id: number,
    name: 'unassign' | 'not_ready' | 'ready' | 'request_irrelevant' | 'confirm_irrelevant' | 'keep_relevant'
      | 'notify_call_failed' | 'installer_call_failed' | 'reschedule' | 'confirm_reschedule' | 'reject_reschedule',
    body: Record<string, string> = {},
  ): Promise<Installation> => (await apiClient.post(`/installations/${id}/${name}/`, body)).data,

  setNotNeeded: async (orderId: number, notNeeded: boolean): Promise<void> => {
    await apiClient.post('/installations/set_not_needed/', { order: orderId, not_needed: notNeeded })
  },
}

/** Текст ошибки DRF для показа пользователю */
export const apiErrorText = (err: any, fallback: string): string => {
  const data = err?.response?.data
  if (!data) return fallback
  if (typeof data === 'string') return fallback
  if (data.detail) return String(data.detail)
  const parts = Object.values(data).flat().filter((v) => typeof v === 'string') as string[]
  return parts.length ? parts.join(' ') : fallback
}
