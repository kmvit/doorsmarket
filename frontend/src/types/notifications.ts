import { ComplaintListItem } from './complaints'
import { User } from './auth'

export type NotificationType = 'pc' | 'push' | 'sms' | 'email'

export interface Notification {
  id: number
  complaint: ComplaintListItem | null
  complaint_id: number | null
  recipient: User
  recipient_id: number
  notification_type: NotificationType
  notification_type_display: string
  title: string
  message: string
  is_sent: boolean
  is_read: boolean
  sent_at: string | null
  read_at: string | null
  created_at: string
}

export interface NotificationFilters {
  is_read?: boolean
  notification_type?: NotificationType
  complaint?: number
  ordering?: string
}

export interface PushSubscriptionData {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

