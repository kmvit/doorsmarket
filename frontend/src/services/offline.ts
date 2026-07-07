import Dexie, { Table } from 'dexie'
import { Complaint, ComplaintListItem } from '../types/complaints'
import { Order, OrderListItem } from '../types/orders'
import { Measurement, MeasurementListItem, MeasurementOpening } from '../types/measurements'
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
  orders!: Table<Order, number>
  orderList!: Table<OrderListItem, number>
  measurements!: Table<Measurement, number>
  measurementList!: Table<MeasurementListItem, number>
  measurementOpenings!: Table<MeasurementOpening, number>

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

    // Версия 2: офлайн для заказов и замеров
    this.version(2).stores({
      orders: 'id, status',
      orderList: 'id, status',
      measurements: 'id, status',
      measurementList: 'id, status',
      measurementOpenings: 'id, measurement',
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

  // Получить данные из кеша, игнорируя срок действия (для офлайн-фолбэка)
  async getStale(key: string): Promise<any | null> {
    const cached = await db.cachedData.get({ key })
    return cached ? cached.data : null
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

// Утилиты для работы с заказами
export const orderUtils = {
  // Сохранить список заказов (upsert, без очистки — списки приходят по папкам/фильтрам)
  async saveList(orders: OrderListItem[]): Promise<void> {
    await db.orderList.bulkPut(orders)
  },

  // Получить список заказов
  async getList(): Promise<OrderListItem[]> {
    return await db.orderList.toArray()
  },

  // Сохранить детальный заказ
  async saveDetail(order: Order): Promise<void> {
    await db.orders.put(order)
  },

  // Получить детальный заказ
  async getDetail(id: number): Promise<Order | undefined> {
    return await db.orders.get(id)
  },

  // Очистить все заказы
  async clear(): Promise<void> {
    await db.orders.clear()
    await db.orderList.clear()
  },
}

// Утилиты для работы с замерами
export const measurementUtils = {
  // Сохранить список замеров (upsert, без очистки — списки приходят по папкам/фильтрам)
  async saveList(measurements: MeasurementListItem[]): Promise<void> {
    await db.measurementList.bulkPut(measurements)
  },

  // Получить список замеров
  async getList(): Promise<MeasurementListItem[]> {
    return await db.measurementList.toArray()
  },

  // Сохранить детальный замер
  async saveDetail(measurement: Measurement): Promise<void> {
    await db.measurements.put(measurement)
  },

  // Получить детальный замер
  async getDetail(id: number): Promise<Measurement | undefined> {
    return await db.measurements.get(id)
  },

  // Сохранить проёмы замера
  async saveOpenings(measurementId: number, openings: MeasurementOpening[]): Promise<void> {
    // Удаляем старые проёмы этого замера, чтобы не остались удалённые на сервере
    await db.measurementOpenings.where('measurement').equals(measurementId).delete()
    await db.measurementOpenings.bulkPut(openings)
  },

  // Получить проёмы замера
  async getOpenings(measurementId: number): Promise<MeasurementOpening[]> {
    return await db.measurementOpenings.where('measurement').equals(measurementId).toArray()
  },

  // Очистить все замеры
  async clear(): Promise<void> {
    await db.measurements.clear()
    await db.measurementList.clear()
    await db.measurementOpenings.clear()
  },
}

// Ошибка авторизации — офлайн-данные использовать нельзя (по образцу complaints.ts)
export const isAuthError = (error: any): boolean =>
  error.message?.includes('авторизация') ||
  error.message?.includes('HTML') ||
  error.message?.includes('401') ||
  error.response?.status === 401

// Универсальная обёртка «сеть → кеш → IndexedDB»:
// при успехе сохраняет данные офлайн, при ошибке (кроме авторизации) поднимает их обратно
export async function withOfflineFallback<T>(options: {
  cacheKey: string
  request: () => Promise<T>
  saveOffline?: (data: T) => Promise<void>
  loadOffline?: () => Promise<T | undefined | null>
  ttl?: number
}): Promise<T> {
  const { cacheKey, request, saveOffline, loadOffline, ttl = 5 * 60 * 1000 } = options

  try {
    const data = await request()
    try {
      if (saveOffline) await saveOffline(data)
      await cacheUtils.set(cacheKey, data, ttl)
    } catch (saveError) {
      console.warn(`[Offline] Не удалось сохранить "${cacheKey}" в IndexedDB:`, saveError)
    }
    return data
  } catch (error: any) {
    if (isAuthError(error)) {
      throw error
    }

    try {
      // Кеш точного запроса (в т.ч. просроченный — офлайн лучше старые данные, чем никаких)
      const cached = await cacheUtils.getStale(cacheKey)
      if (cached !== null) {
        console.log(`[Offline] "${cacheKey}" загружен из кеша`)
        return cached
      }

      // Фолбэк на таблицы IndexedDB
      if (loadOffline) {
        const offline = await loadOffline()
        if (offline !== undefined && offline !== null) {
          console.log(`[Offline] "${cacheKey}" загружен из IndexedDB`)
          return offline as T
        }
      }
    } catch (offlineError) {
      console.warn(`[Offline] Не удалось загрузить "${cacheKey}" из IndexedDB:`, offlineError)
    }

    throw error
  }
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

