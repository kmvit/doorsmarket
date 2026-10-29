export type InstallationStatus =
  | 'not_planned'
  | 'planned'
  | 'not_ready'
  | 'awaiting_signature'
  | 'partially_done'
  | 'done'
  | 'irrelevant'

export const INSTALLATION_STATUS_DISPLAY: Record<InstallationStatus, string> = {
  not_planned: 'Не запланирован',
  planned: 'Запланирован',
  not_ready: 'Не готов к монтажу',
  awaiting_signature: 'Ожидает подписи клиента',
  partially_done: 'Частично завершён',
  done: 'Завершён',
  irrelevant: 'Не актуален',
}

export const INSTALLATION_STATUS_COLOR: Record<InstallationStatus, string> = {
  not_planned: 'bg-amber-100 text-amber-800',
  planned: 'bg-blue-100 text-blue-800',
  not_ready: 'bg-orange-100 text-orange-800',
  awaiting_signature: 'bg-purple-100 text-purple-800',
  partially_done: 'bg-cyan-100 text-cyan-800',
  done: 'bg-green-100 text-green-800',
  irrelevant: 'bg-gray-200 text-gray-700',
}

export const INSTALLATION_STATUS_ORDER: InstallationStatus[] = [
  'not_planned', 'planned', 'not_ready', 'awaiting_signature', 'partially_done', 'done', 'irrelevant',
]

export const CLOSED_INSTALLATION_STATUSES: InstallationStatus[] = ['done', 'irrelevant']

export type InstallationFileKind =
  | 'measurement_blank'
  | 'final_kp'
  | 'installation_kp'
  | 'drawings'
  | 'extra'
  | 'photo'
  | 'video'
  | 'act'
  | 'act_unsigned'
  | 'result'

export const INSTALLATION_FILE_KIND_DISPLAY: Record<InstallationFileKind, string> = {
  measurement_blank: 'Бланк замера',
  final_kp: 'Финальное КП (PDF)',
  installation_kp: 'КП на монтаж',
  drawings: 'Чертежи (СНИ)',
  extra: 'Дополнительные документы',
  photo: 'Фото',
  video: 'Видео',
  act: 'Акт выполненных работ',
  act_unsigned: 'Акт без подписи клиента',
  result: 'Фото/видео результата',
}

export const INSTALLATION_FILE_KINDS: InstallationFileKind[] = [
  'measurement_blank', 'final_kp', 'installation_kp', 'drawings', 'extra', 'photo', 'video', 'act', 'act_unsigned', 'result',
]

/** Что прикладывает монтажник по факту работ */
export const INSTALLER_FILE_KINDS: InstallationFileKind[] = ['act', 'act_unsigned', 'result']

export interface InstallationFile {
  id: number
  installation: number
  kind: InstallationFileKind
  kind_display: string
  visit: number | null
  uploaded_by: number | null
  // Акт, приложенный клиентом по ссылке, засчитывается после проверки подписи
  review_status: '' | 'pending' | 'approved' | 'rejected'
  review_comment: string
  file_url: string | null
  file_size: string
  attachment_type: 'photo' | 'video' | 'document'
  name: string
  created_at: string
}

/** Документ заказа, который сам попадает в пакет: КП заказа, бланк выполненного замера */
export interface OrderDocument {
  kind: 'order_kp' | 'order_measurement'
  kind_display: string
  name: string
  file_url: string
}

export interface Staff {
  id: number
  full_name: string
  phone_number: string | null
}

export interface Installer extends Staff {
  city: number | null
  city_name: string
}

/** Выезд: монтаж в графике монтажников на интервал дат */
export interface InstallationVisit {
  id: number
  date_from: string
  date_to: string
  installers: Staff[]
  reschedule_requested_at?: string | null
  reschedule_requested_by_name?: string
  reschedule_reason?: string
  previous_date_from?: string | null
  previous_date_to?: string | null
}

/** Выезд в календаре монтажника */
export interface ScheduleVisit extends InstallationVisit {
  installation_id: number
  status: InstallationStatus
  status_display: string
  order: number
  client_name: string
  address: string
  work_description: string
  contact_name: string
  contact_phone: string
}

export interface InstallationFolderCount {
  folder: string
  label: string
  count: number
}

export interface Installation {
  id: number
  order: number
  status: InstallationStatus
  status_display: string
  is_paid: boolean
  current_visit: InstallationVisit | null
  irrelevant_requested_at: string | null
  irrelevant_requested_by_name: string
  irrelevant_reason: string
  client_name: string
  address: string
  kp_number: string
  salon_name: string
  city_name: string
  manager_name: string
  contact_name: string
  contact_phone: string
  work_description: string
  collection_finish: string
  planned_delivery_date: string | null
  desired_date_comment: string
  files: InstallationFile[]
  order_documents: OrderDocument[]
  rating_overall: number | null
  created_at: string
  updated_at: string
  // Только в карточке
  created_by_name?: string
  order_status_display?: string
  measurement_blank_required?: boolean
  order_manager_id?: number
  visits?: InstallationVisit[]
  installer_notified_at?: string | null
  complaints?: { id: number; created_at: string; status_display: string }[]
  act_sent_at?: string | null
  client_confirmed_at?: string | null
  client_link?: string | null
  rating?: RatingScores | null
  payment?: {
    available: boolean
    sent_at: string | null
    sent_by_name: string
    accountant_email: string
  } | null
}

/** Оценка клиента: баллы 1–5 и комментарии по параметрам формы */
export interface RatingScores {
  created_at: string
  items: { key: string; label: string; score: number | null; comment: string }[]
}

export interface RatingReport {
  params: { key: string; label: string }[]
  months: string[]
  rows: {
    key: number
    name: string
    note: string
    count: number
    scores: Record<string, number | null>
    months: Record<string, number | null>
  }[]
}

/** Страница клиента по ссылке /m/{код} */
export interface PublicActPage {
  id: number
  client_name: string
  address: string
  work_description: string
  status: InstallationStatus
  status_display: string
  awaiting_signature: boolean
  client_confirmed_at: string | null
  documents: { id: number; kind: InstallationFileKind; kind_display: string; name: string; file_url: string }[]
  last_upload: { name: string; review_status: string; review_comment: string; created_at: string } | null
  signed: boolean
  rating_open: boolean
  rating: RatingScores | null
  rating_fields: { key: string; label: string }[]
}

export interface InstallationEvent {
  id: number
  kind: string
  kind_display: string
  actor_name: string
  description: string
  old_status: string
  new_status: string
  created_at: string
}

export interface InstallationPrefill {
  order: number
  client_name: string
  address: string
  kp_number: string
  contact_name: string
  contact_phone: string
  measurement_blank_required: boolean
  installations_count: number
}

export interface InstallationFields {
  is_paid: boolean
  work_description: string
  collection_finish: string
  planned_delivery_date: string | null
  desired_date_comment: string
  contact_name: string
  contact_phone: string
}

export interface InstallationFilters {
  status?: InstallationStatus[]
  is_paid?: boolean
  exclude_closed?: boolean
  mine?: boolean
  search?: string
  order?: number
  cities?: string[]
  salons?: string[]
  managers?: string[]
  folder?: string
}

/** Список монтажей видят все роли модуля заказов, кроме монтажника */
export const canSeeInstallations = (role?: string) =>
  !!role && ['manager', 'service_manager', 'leader', 'group_leader', 'admin'].includes(role)

/** Оформляет монтаж менеджер (и роли с его правами) */
export const canCreateInstallation = (role?: string) =>
  !!role && ['manager', 'leader', 'group_leader', 'admin'].includes(role)

export const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** Графики монтажников правит СМ */
export const canEditSchedule = (role?: string) => role === 'service_manager' || role === 'admin'

/** Решение по неактуальности — менеджер */
export const canDecideIrrelevant = (role?: string) => canCreateInstallation(role)

/** Дата ГГГГ-ММ-ДД по локальному времени (без сдвига в UTC) */
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** «10.11» или «10.11–12.11» */
export const formatPeriod = (from: string, to: string) => {
  const short = (v: string) => `${v.slice(8, 10)}.${v.slice(5, 7)}`
  return from === to ? short(from) : `${short(from)}–${short(to)}`
}
