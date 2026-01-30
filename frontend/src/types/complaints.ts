import { User } from './auth'

export interface ProductionSite {
  id: number
  name: string
  address: string
  is_active: boolean
  created_at: string
}

export interface ComplaintReason {
  id: number
  name: string
  description: string
  is_active: boolean
  order: number
  created_at: string
}

export interface DefectiveProduct {
  id: number
  complaint: number
  product_name: string
  size: string
  opening_type: string
  problem_description: string
  order: number
}

export interface ComplaintAttachment {
  id: number
  complaint: number
  file: string
  file_url: string
  file_size: string
  attachment_type: 'photo' | 'video' | 'document' | 'commercial_offer'
  description: string
  uploaded_at: string
}

export interface ComplaintComment {
  id: number
  complaint: number
  author: User
  author_id: number
  text: string
  created_at: string
}

export type ComplaintStatus =
  | 'new'
  | 'in_progress'
  | 'completed'
  | 'in_production'
  | 'on_warehouse'
  | 'shipping_overdue'
  | 'factory_dispute'
  | 'factory_response_overdue'
  | 'factory_approved'
  | 'factory_rejected'
  | 'sm_response_overdue'
  | 'under_sm_review'
  | 'waiting_installer_date'
  | 'needs_planning'
  | 'installer_not_planned'
  | 'installer_overdue'
  | 'shipping_planned'
  | 'installation_planned'
  | 'both_planned'
  | 'resolved'
  | 'closed'
  | 'rejected'
  | 'sent'

export type ComplaintType = 'manager' | 'installer' | 'factory'

export interface Complaint {
  id: number
  created_at: string
  updated_at: string
  complaint_type: ComplaintType | null
  complaint_type_display: string
  status: ComplaintStatus
  status_display: string
  initiator: User
  initiator_id?: number
  recipient: User
  recipient_id?: number
  manager: User | null
  manager_id?: number
  installer_assigned: User | null
  installer_assigned_id?: number
  production_site: ProductionSite
  production_site_id?: number
  reason: ComplaintReason
  reason_id?: number
  order_number: string
  client_name: string
  address: string
  contact_person: string
  contact_phone: string
  additional_info: string
  assignee_comment: string
  document_package_link: string
  commercial_offer: string | null
  commercial_offer_url: string | null
  commercial_offer_text: string
  planned_installation_date: string | null
  planned_shipping_date: string | null
  production_deadline: string | null
  factory_response_date: string | null
  factory_reject_reason: string
  factory_approve_comment: string
  dispute_arguments: string
  client_agreement_date: string | null
  completion_date: string | null
  added_to_shipping_registry_at: string | null
  defective_products?: DefectiveProduct[]
  attachments?: ComplaintAttachment[]
  comments?: ComplaintComment[]
}

export interface ComplaintListItem {
  id: number
  order_number: string
  client_name: string
  address: string
  contact_person: string
  contact_phone: string
  status: ComplaintStatus
  status_display: string
  complaint_type: ComplaintType | null
  complaint_type_display: string
  initiator: User
  recipient: User
  manager: User | null
  production_site: ProductionSite
  reason: ComplaintReason
  installer_assigned: User | null
  created_at: string
  updated_at: string
  planned_installation_date: string | null
  planned_shipping_date: string | null
  production_deadline?: string | null
}

export interface ComplaintCreateData {
  production_site_id: number
  reason_id: number
  manager_id?: number
  recipient_id?: number
  installer_assigned_id?: number
  complaint_type?: ComplaintType
  order_number: string
  client_name: string
  address: string
  contact_person: string
  contact_phone: string
  additional_info?: string
  assignee_comment?: string
  document_package_link?: string
  commercial_offer_text?: string
}

export interface ComplaintFilters {
  status?: ComplaintStatus
  complaint_type?: ComplaintType
  production_site?: number
  reason?: number
  my_complaints?: boolean
  my_orders?: boolean
  needs_planning?: boolean
  exclude_closed?: boolean
  city?: number
  search?: string
  ordering?: string
}

// Shipping Registry types
export type LiftType = 'our' | 'client'
export type LiftMethod = 'elevator' | 'manual'
export type OrderType = 'main' | 'complaint'
export type DeliveryDestination = 'client' | 'warehouse'
export type DeliveryStatus = 'pending' | 'in_transit' | 'delivered' | 'cancelled'

export interface ShippingRegistry {
  id: number
  complaint: ComplaintListItem | null
  complaint_id: number | null
  created_at: string
  order_number: string
  manager: User
  manager_id: number
  client_name: string
  address: string
  contact_person: string
  contact_phone: string
  doors_count: number
  lift_type: LiftType
  lift_type_display: string
  lift_method: LiftMethod
  lift_method_display: string
  order_type: OrderType
  order_type_display: string
  payment_status: string
  delivery_destination: DeliveryDestination
  delivery_destination_display: string
  comments: string
  delivery_status: DeliveryStatus
  delivery_status_display: string
  client_rating: number | null
  planned_shipping_date: string | null
  actual_shipping_date: string | null
}

export interface ShippingRegistryFilters {
  order_type?: OrderType
  delivery_status?: DeliveryStatus
  manager?: number
  delivery_destination?: DeliveryDestination
  search?: string
  ordering?: string
}

export interface ShippingRegistryStats {
  total: number
  pending: number
  in_transit: number
  delivered: number
  complaints: number
}

// Данные, извлеченные из PDF
export interface ParsedProduct {
  product_name: string
  quantity?: string
  size: string
  opening_type: string
  problem_description: string
}

export interface ParsedComplaintData {
  order_number: string
  client_name: string
  contact_person: string
  contact_phone: string
  address: string
  manager_name?: string
  defective_products: ParsedProduct[]
}
