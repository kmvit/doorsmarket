import Dexie, { Table } from 'dexie'
import { Complaint, ComplaintListItem } from '../types/complaints'
import { User } from '../types/auth'

// Интерфейс для отложенных запросов
export interface PendingRequest {
  id?: number
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  data?: any
  headers?: Record<string, string>
  timestamp: number
  retryCount: number
  lastError?: string
}

// Интерфейс для кешированных данных
export interface CachedData {
  id?: number
  key: string
  data: any
  timestamp: number
  expiresAt: number
}

// Класс для работы с IndexedDB
class OfflineDB extends Dexie {
  complaints!: Table<Complaint, number>
  complaintList!: Table<ComplaintListItem, number>
  notifications!: Table<any, number>
  pendingRequests!: Table<PendingRequest, number>
  cachedData!: Table<CachedData, number>
  users!: Table<User, number>

  constructor() {
    super('MarketingDoorsDB')
    
    this.version(1).stores({
      complaints: '++id, status, created_at, updated_at',
      complaintList: '++id, status, created_at, updated_at',
      notifications: '++id, is_read, created_at',
      pendingRequests: '++id, timestamp, method, url',
      cachedData: '++id, key, timestamp, expiresAt',
      users: '++id, username, email',
    })
  }
}

export const db = new OfflineDB()

// Утилиты для работы с кешем
export const cacheUtils = {
  // Сохранить данные в кеш
  async set(key: string, data: any, ttl: number = 5 * 60 * 1000): Promise<void> {
    const expiresAt = Date.now() + ttl
    await db.cachedData.put({
      key,
      data,
      timestamp: Date.now(),
      expiresAt,
    })
  },

  // Получить данные из кеша
  async get(key: string): Promise<any | null> {
    const cached = await db.cachedData.get({ key })
    if (!cached) return null
    
    // Проверяем срок действия
    if (Date.now() > cached.expiresAt) {
      await db.cachedData.delete(cached.id!)
      return null
    }
    
    return cached.data
  },

  // Удалить данные из кеша
  async delete(key: string): Promise<void> {
    const cached = await db.cachedData.get({ key })
    if (cached) {
      await db.cachedData.delete(cached.id!)
    }
  },

  // Очистить просроченный кеш
  async clearExpired(): Promise<void> {
    const now = Date.now()
    await db.cachedData
      .where('expiresAt')
      .below(now)
      .delete()
  },
}

// Утилиты для работы с рекламациями
export const complaintUtils = {
  // Сохранить список рекламаций
  async saveList(complaints: ComplaintListItem[]): Promise<void> {
    await db.complaintList.clear()
    await db.complaintList.bulkPut(complaints)
  },

  // Получить список рекламаций
  async getList(): Promise<ComplaintListItem[]> {
    return await db.complaintList.toArray()
  },

  // Сохранить детальную рекламацию
  async saveDetail(complaint: Complaint): Promise<void> {
    await db.complaints.put(complaint)
  },

  // Получить детальную рекламацию
  async getDetail(id: number): Promise<Complaint | undefined> {
    return await db.complaints.get(id)
  },

  // Очистить все рекламации
  async clear(): Promise<void> {
    await db.complaints.clear()
    await db.complaintList.clear()
  },
}

// Утилиты для работы с уведомлениями
export const notificationUtils = {
  // Сохранить уведомления
  async save(notifications: any[]): Promise<void> {
    await db.notifications.clear()
    await db.notifications.bulkPut(notifications)
  },

  // Получить уведомления
  async getAll(): Promise<any[]> {
    return await db.notifications.toArray()
  },

  // Получить непрочитанные уведомления
  async getUnread(): Promise<any[]> {
    return await db.notifications
      .filter((notification) => !notification.is_read)
      .toArray()
  },

  // Очистить уведомления
  async clear(): Promise<void> {
    await db.notifications.clear()
  },
}

// Проверка доступности IndexedDB
export const isIndexedDBAvailable = (): boolean => {
  return typeof indexedDB !== 'undefined'
}

// Инициализация базы данных
export const initOfflineDB = async (): Promise<void> => {
  if (!isIndexedDBAvailable()) {
    console.warn('IndexedDB не доступен в этом браузере')
    return
  }

  try {
    // Очищаем просроченный кеш при инициализации
    await cacheUtils.clearExpired()
    console.log('Offline DB инициализирована')
  } catch (error) {
    console.error('Ошибка инициализации Offline DB:', error)
  }
}

