import { DoorType, OpeningType, OrderAttachment, OrderStatus } from './orders'

export interface MeasurementAttachment {
  id: number
  measurement: number
  opening: number | null
  file_url: string | null
  name: string
  created_at: string
}

export interface MeasurementOpening {
  id: number
  measurement: number
  order_item: number | null
  opening_number: number
  room_name: string

  door_type: DoorType
  door_type_display: string

  actual_height: number | null
  actual_width: number | null
  actual_depth: number | null

  recommended_door_height: number | null
  recommended_door_width: number | null
  recommended_opening_height: number | null
  recommended_opening_width: number | null

  desired_door_height: number | null
  desired_door_width: number | null

  opening_type: OpeningType
  opening_type_display: string
  addon_width: number | null

  face_trim_qty: string | number | null
  face_trim_comment: string
  back_trim_qty: string | number | null
  back_trim_comment: string

  extra_hardware: string
  threshold: string
  notes: string

  attachments: MeasurementAttachment[]
  inverso_warning: string | null
  recommendation_text: string
}

export interface Measurement {
  id: number
  request: number
  order_id: number
  service_manager: number | null
  service_manager_name: string | null
  measurement_date: string | null
  signature_photo_url: string | null
  client_access_token: string
  short_code: string | null
  is_done: boolean
  done_at: string | null
  is_processed: boolean
  processed_at: string | null
  created_at: string
  updated_at: string

  openings: MeasurementOpening[]
  attachments: MeasurementAttachment[]
  order_attachments: OrderAttachment[]

  client_name: string
  address: string
  contact_name: string
  contact_position: string
  contact_phone: string
  opening_plan_url: string | null
  lift_required: boolean
  lift_impossible_warning: string | null
  order_status: OrderStatus
  lift_available: boolean | null
  stairs_available: boolean | null
  floor_readiness: string
}

export interface MeasurementListItem {
  id: number
  order_id: number
  client_name: string
  address: string
  contact_name: string
  contact_position: string
  contact_phone: string
  desired_date: string | null
  payer_display: string
  measurement_date: string | null
  is_done: boolean
  done_at: string | null
  is_processed: boolean
  processed_at: string | null
  service_manager: number | null
  service_manager_name: string | null
  order_status: OrderStatus
  order_status_display: string
  manager_name: string | null
  created_at: string
}

export type MeasurementFolder = 'unscheduled' | 'scheduled' | 'today' | 'done' | 'mine' | ''
