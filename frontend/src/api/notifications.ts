import apiClient from './client'
import { Notification, NotificationFilters, PushSubscriptionData } from '../types/notifications'
import { notificationUtils, cacheUtils } from '../services/offline'
import { requestQueue } from '../services/sync'

export const notificationsAPI = {
  // Получить список уведомлений
  getList: async (filters?: NotificationFilters): Promise<Notification[]> => {
    const params = new URLSearchParams()
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value))
        }
      })
    }
    
    const cacheKey = `notifications_list_${params.toString()}`
    
    try {
      const response = await apiClient.get(`/notifications/?${params.toString()}`)
      
      // Проверяем, что ответ - это не HTML
      if (typeof response.data === 'string' && response.data.trim().startsWith('<!DOCTYPE')) {
        throw new Error('Получен HTML ответ вместо JSON. Требуется авторизация.')
      }
      
      // Обрабатываем ответ - может быть массив или объект с results (пагинация)
      let notifications: Notification[] = []
      if (Array.isArray(response.data)) {
        notifications = response.data
      } else if (response.data && typeof response.data === 'object' && Array.isArray(response.data.results)) {
        notifications = response.data.results
      } else if (response.data && typeof response.data === 'object' && 'id' in response.data) {
        // Если это один объект, оборачиваем в массив
        notifications = [response.data]
      }
      
      // Сохраняем в кеш при успешном запросе
      if (notifications.length > 0) {
        await notificationUtils.save(notifications)
        await cacheUtils.set(cacheKey, notifications, 2 * 60 * 1000) // 2 минуты
      }
      
      return notifications
    } catch (error: any) {
      // Если ошибка авторизации, не пытаемся использовать офлайн данные
      if (error.message?.includes('авторизация') || error.message?.includes('HTML') || error.message?.includes('401')) {
        throw error
      }
      
      // Если офлайн, пытаемся получить из кеша
      if (!navigator.onLine) {
        const cached = await cacheUtils.get(cacheKey)
        if (cached && Array.isArray(cached)) {
          return cached
        }
        
        // Если кеша нет, возвращаем данные из IndexedDB
        const list = await notificationUtils.getAll()
        return Array.isArray(list) ? list : []
      }
      throw error
    }
  },

  // Получить непрочитанные уведомления
  getUnread: async (): Promise<Notification[]> => {
    try {
      const response = await apiClient.get('/notifications/?is_read=false')
      
      // Проверяем, что ответ - это не HTML
      if (typeof response.data === 'string' && response.data.trim().startsWith('<!DOCTYPE')) {
        throw new Error('Получен HTML ответ вместо JSON. Требуется авторизация.')
      }
      
      // Обрабатываем ответ - может быть массив или объект с results
      let notifications: Notification[] = []
      if (Array.isArray(response.data)) {
        notifications = response.data
      } else if (response.data && typeof response.data === 'object' && Array.isArray(response.data.results)) {
        notifications = response.data.results
      } else if (response.data && typeof response.data === 'object' && 'id' in response.data) {
        notifications = [response.data]
      }
      
      if (notifications.length > 0) {
        await notificationUtils.save(notifications)
      }
      
      return notifications
    } catch (error: any) {
      // Если ошибка авторизации, не пытаемся использовать офлайн данные
      if (error.message?.includes('авторизация') || error.message?.includes('HTML')) {
        throw error
      }
      
      if (!navigator.onLine) {
        const unread = await notificationUtils.getUnread()
        return Array.isArray(unread) ? unread : []
      }
      throw error
    }
  },

  // Отметить уведомление как прочитанное
  markRead: async (id: number): Promise<Notification> => {
    try {
      const response = await apiClient.post(`/notifications/${id}/mark_read/`)
      
      // Обновляем в IndexedDB
      const notifications = await notificationUtils.getAll()
      const updated = notifications.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
      await notificationUtils.save(updated)
      
      return response.data
    } catch (error: any) {
      // Если офлайн, добавляем в очередь
      if (!navigator.onLine) {
        await requestQueue.add('POST', `/notifications/${id}/mark_read/`)
        // Оптимистично обновляем локально
        const notifications = await notificationUtils.getAll()
        const updated = notifications.map((n) =>
          n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
        await notificationUtils.save(updated)
        throw new Error('Запрос добавлен в очередь для синхронизации')
      }
      throw error
    }
  },

  // Отметить все уведомления как прочитанные
  markAllRead: async (): Promise<{ updated_count: number }> => {
    try {
      const response = await apiClient.post('/notifications/mark_all_read/')
      
      // Обновляем в IndexedDB
      const notifications = await notificationUtils.getAll()
      const updated = notifications.map((n) => ({
        ...n,
        is_read: true,
        read_at: new Date().toISOString(),
      }))
      await notificationUtils.save(updated)
      
      return response.data
    } catch (error: any) {
      // Если офлайн, добавляем в очередь
      if (!navigator.onLine) {
        await requestQueue.add('POST', '/notifications/mark_all_read/')
        // Оптимистично обновляем локально
        const notifications = await notificationUtils.getAll()
        const updated = notifications.map((n) => ({
          ...n,
          is_read: true,
          read_at: new Date().toISOString(),
        }))
        await notificationUtils.save(updated)
        throw new Error('Запрос добавлен в очередь для синхронизации')
      }
      throw error
    }
  },

  // Регистрация push подписки
  subscribePush: async (subscription: PushSubscriptionData): Promise<void> => {
    await apiClient.post('/auth/push-subscribe/', subscription)
  },

  // Отписка от push уведомлений
  unsubscribePush: async (): Promise<void> => {
    await apiClient.post('/auth/push-unsubscribe/')
  },
}

