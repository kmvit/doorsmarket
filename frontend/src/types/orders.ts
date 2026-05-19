export interface Salon {
  id: number
  name: string
  city: number
  city_name: string
  address: string
  phone: string
  is_active: boolean
}

export type OrderStatus =
  | 'draft' | 'active' | 'measurement_requested'
  | 'paid' | 'in_production' | 'on_warehouse' | 'shipped' | 'completed'
  | 'cancelled'

export const ORDER_STATUS_DISPLAY: Record<OrderStatus, string> = {
  draft: 'Черновик',
  active: 'Создан',
  measurement_requested: 'Заявка на замер',
  paid: 'Оплачен',
  in_production: 'В производстве',
  on_warehouse: 'На складе',
  shipped: 'Отгружен',
  completed: 'Выполнен',
  cancelled: 'Не актуален',
}

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  measurement_requested: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  in_production: 'bg-orange-100 text-orange-700',
  on_warehouse: 'bg-cyan-100 text-cyan-700',
  shipped: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-200 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
}

export type DoorType = 'entrance' | 'interior' | 'other' | ''
export type OpeningType = 'A' | 'B' | 'B_INVERSO' | 'C' | 'D' | 'D_INVERSO' | ''
export type AddonKind = 'box' | 'platband' | 'extension' | 'hinges' | 'handle' | 'mechanism' | 'glass' | 'extra' | 'service'

export const DOOR_TYPE_DISPLAY: Record<string, string> = {
  entrance: 'Входная',
  interior: 'Межкомнатная',
  other: 'Другое',
}

export const OPENING_TYPE_DISPLAY: Record<string, string> = {
  A: 'A — правое наружнее, лицо снаружи',
  B: 'B — правое наружнее, лицо внутри',
  B_INVERSO: 'B Inverso — правое внутреннее, лицо снаружи',
  C: 'C — левое наружнее, лицо снаружи',
  D: 'D — левое наружнее, лицо внутри',
  D_INVERSO: 'D Inverso — левое внутреннее, лицо снаружи',
}

export const OPENING_TYPE_SHORT: Record<string, string> = {
  A: 'A',
  B: 'B',
  B_INVERSO: 'B Inverso',
  C: 'C',
  D: 'D',
  D_INVERSO: 'D Inverso',
}

export type ActivityKind =
  | 'created' | 'updated' | 'items_changed' | 'status_changed'
  | 'file_attached' | 'comment_added'
  | 'measurement_requested' | 'measurement_scheduled' | 'measurement_done' | 'measurement_processed'
  | ''

export const ACTIVITY_KIND_DISPLAY: Record<string, string> = {
  created: 'Заказ создан',
  updated: 'Заказ обновлён',
  items_changed: 'Изменены позиции',
  status_changed: 'Изменён статус',
  file_attached: 'Загружен файл',
  comment_added: 'Добавлен комментарий',
  measurement_requested: 'Заявка на замер',
  measurement_scheduled: 'Замер запланирован',
  measurement_done: 'Замер выполнен',
  measurement_processed: 'Замер обработан',
}

export const ADDON_KIND_DISPLAY: Record<AddonKind, string> = {
  box: 'Короб',
  platband: 'Наличник',
  extension: 'Добор',
  hinges: 'Петли',
  handle: 'Ручки',
  mechanism: 'Механизм',
  glass: 'Стекло',
  extra: 'Доп. к заказу',
  service: 'Услуга',
}

export interface OrderAddon {
  id: number
  order: number
  kind: AddonKind
  kind_display: string
  name: string
  quantity: number | string
  size: string
  opening_type: OpeningType | ''
  opening_type_display: string
  price: number | string | null
  amount: number | string | null
  comment: string
  position: number
}

export interface CreateOrderAddonData {
  kind: AddonKind
  name: string
  quantity?: number | string
  size?: string
  opening_type?: OpeningType | ''
  price?: number | string | null
  amount?: number | string | null
  comment?: string
  position?: number
}

export type OrderAttachmentType = 'photo' | 'video' | 'document'

export interface OrderAttachment {
  id: number
  order: number | null
  order_item: number | null
  file_url: string | null
  file_size: string
  attachment_type: OrderAttachmentType
  name: string
  created_at: string
}

export interface MeasurementData {
  actual_height: number | null
  actual_width: number | null
  actual_depth: number | null
  recommended_door_height: number | null
  recommended_door_width: number | null
  recommended_opening_height: number | null
  recommended_opening_width: number | null
  opening_type: string
  notes: string
  recommendation_text: string
}

export interface OrderItem {
  id: number
  order: number
  opening_number: number
  room_name: string
  model_name: string
  quantity: number
  price: number | null
  amount: number | null
  door_type: DoorType
  door_type_display: string
  opening_type: OpeningType
  opening_type_display: string
  door_height: number | null
  door_width: number | null
  recommended_opening_height: number | null
  recommended_opening_width: number | null
  notes: string
  position: number
  attachments?: OrderAttachment[]
  measurement_data: MeasurementData | null
}

export interface OrderManager {
  id: number
  username: string
  full_name: string
  phone_number: string | null
}

export interface Order {
  id: number
  created_at: string
  updated_at: string
  manager: OrderManager
  salon: Salon | number
  salon_name?: string
  kp_number: string
  kp_date: string | null
  client_name: string
  contact_phone: string
  address: string
  lift_available: boolean | null
  stairs_available: boolean | null
  floor_readiness: string
  comment: string
  status: OrderStatus
  status_display: string
  commercial_offer_url: string | null
  items?: OrderItem[]
  addons?: OrderAddon[]
  attachments?: OrderAttachment[]
  last_activity_at: string | null
  last_activity_kind: ActivityKind
  last_activity_kind_display: string
  lift_impossible_warning: string | null
}

export interface OrderListItem {
  id: number
  created_at: string
  updated_at: string
  manager: OrderManager
  salon: number
  salon_name: string
  kp_number: string
  kp_date: string | null
  client_name: string
  contact_phone: string
  address: string
  status: OrderStatus
  status_display: string
  last_activity_at: string | null
  last_activity_kind: ActivityKind
  last_activity_kind_display: string
}

export interface CreateOrderItemData {
  opening_number: number
  room_name?: string
  model_name?: string
  quantity?: number
  price?: number | null
  amount?: number | null
  door_type?: DoorType
  opening_type?: OpeningType
  door_height?: number | null
  door_width?: number | null
  recommended_opening_height?: number | null
  recommended_opening_width?: number | null
  notes?: string
  position?: number
}

export interface CreateOrderData {
  salon: number
  kp_number?: string
  kp_date?: string | null
  client_name: string
  contact_phone?: string
  address?: string
  lift_available?: boolean | null
  stairs_available?: boolean | null
  floor_readiness?: string
  comment?: string
  status?: OrderStatus
  items?: CreateOrderItemData[]
  addons?: CreateOrderAddonData[]
}

export interface OrderFilters {
  status?: OrderStatus | ''
  salon?: number | ''
  manager_id?: number | ''
  search?: string
  my_orders?: boolean
  exclude_cancelled?: boolean
}

// ===== Phase 2 =====

export type MeasurementPayer = 'client' | 'salon'

export const MEASUREMENT_PAYER_DISPLAY: Record<MeasurementPayer, string> = {
  client: 'Клиент',
  salon: 'Салон',
}

export interface MeasurementRequest {
  id: number
  order: number
  contact_name: string
  contact_position: string
  contact_phone: string
  desired_date: string | null
  payer: MeasurementPayer
  payer_display: string
  opening_plan_url: string | null
  comment: string
  created_at: string
  created_by: number | null
  created_by_name: string | null
}

export interface CreateMeasurementRequestData {
  contact_name: string
  contact_position?: string
  contact_phone: string
  desired_date?: string | null
  payer: MeasurementPayer
  comment?: string
}

export interface OrderActionReminder {
  id: number
  order: number
  due_at: string
  action_text: string
  done: boolean
  done_at: string | null
  created_at: string
  created_by: number | null
  created_by_name: string | null
  notified: boolean
  is_overdue: boolean
}

export interface CreateActionReminderData {
  order: number
  due_at: string
  action_text: string
}

export interface WorkshopOrder {
  id: number
  created_at: string
  client_name: string
  address: string
  status: OrderStatus
  status_display: string
  last_activity_at: string | null
  last_activity_kind: string
  last_activity_kind_display: string
  contact_phone: string
  kp_number: string
  manager: OrderManager
  salon_name: string
  comment: string
  next_action_at: string | null
  next_action_text: string
  last_comment: string
}

// ===== Парсинг КП =====

export interface ParsedKpItem {
  opening_number: number
  room_name: string
  model_name: string
  quantity: number
  price: string | number | null
  amount: string | number | null
  door_type: string
  opening_type: string
  door_height: number | null
  door_width: number | null
  recommended_opening_height: number | null
  recommended_opening_width: number | null
  notes?: string
}

export interface ParsedKpAddon {
  kind: AddonKind
  name: string
  quantity: string | number
  size: string
  opening_type: string
  price: string | number | null
  amount: string | number | null
  comment: string
}

export interface ParsedKpData {
  kp_number: string
  kp_date: string | null
  client_name: string
  contact_phone: string
  address: string
  manager_name: string
  items: ParsedKpItem[]
  addons: ParsedKpAddon[]
}
