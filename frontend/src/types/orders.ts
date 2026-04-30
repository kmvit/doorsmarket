export interface Salon {
  id: number
  name: string
  city: number
  city_name: string
  address: string
  phone: string
  is_active: boolean
}

export type OrderStatus = 'draft' | 'active' | 'cancelled'

export const ORDER_STATUS_DISPLAY: Record<OrderStatus, string> = {
  draft: 'Черновик',
  active: 'Активный',
  cancelled: 'Отменён',
}

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export type DoorType = 'entrance' | 'interior' | 'other' | ''
export type OpeningType = 'left' | 'right' | 'left_inner' | 'right_inner' | 'sliding' | 'other' | ''
export type AddonKind = 'box' | 'platband' | 'extension' | 'hinges' | 'handle' | 'mechanism' | 'glass' | 'extra' | 'service'

export const DOOR_TYPE_DISPLAY: Record<string, string> = {
  entrance: 'Входная',
  interior: 'Межкомнатная',
  other: 'Другое',
}

export const OPENING_TYPE_DISPLAY: Record<string, string> = {
  left: 'Левое',
  right: 'Правое',
  left_inner: 'Левое внутреннее',
  right_inner: 'Правое внутреннее',
  sliding: 'Раздвижное',
  other: 'Другое',
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

export interface OrderItemAddon {
  id: number
  item: number
  kind: AddonKind
  kind_display: string
  name: string
  quantity: number
  price: number | null
  comment_face: string
  comment_back: string
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
  notes: string
  position: number
  addons: OrderItemAddon[]
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
}

export interface CreateOrderItemAddonData {
  kind: AddonKind
  name: string
  quantity: number
  price?: number | null
  comment_face?: string
  comment_back?: string
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
  notes?: string
  position?: number
  addons?: CreateOrderItemAddonData[]
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
}

export interface OrderFilters {
  status?: OrderStatus | ''
  salon?: number | ''
  manager_id?: number | ''
  search?: string
  my_orders?: boolean
  exclude_cancelled?: boolean
}
