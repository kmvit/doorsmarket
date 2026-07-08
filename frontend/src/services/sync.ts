import { db, PendingRequest } from './offline'
import apiClient from '../api/client'
import { AxiosRequestConfig } from 'axios'

// Максимальное количество попыток повтора запроса, отклонённого сервером (4xx/5xx)
const MAX_RETRY_COUNT = 3
// Таймаут запроса синхронизации — зависший запрос не должен блокировать очередь навсегда
const SYNC_REQUEST_TIMEOUT = 60 * 1000
// Период фоновой проверки очереди (в PWA событие online может не прийти вовсе)
const SYNC_INTERVAL = 30 * 1000

// FormData нельзя сохранить в IndexedDB (structured clone её не поддерживает),
// поэтому сериализуем в массив пар — File/Blob клонируются без проблем
interface SerializedFormData {
  __isFormData: true
  entries: [string, string | File][]
}

const serializeBody = (data: any): any => {
  if (data instanceof FormData) {
    const serialized: SerializedFormData = {
      __isFormData: true,
      entries: [],
    }
    data.forEach((value, key) => {
      serialized.entries.push([key, value as string | File])
    })
    return serialized
  }
  return data
}

const deserializeBody = (data: any): any => {
  if (data && data.__isFormData) {
    const formData = new FormData()
    for (const [key, value] of (data as SerializedFormData).entries) {
      formData.append(key, value)
    }
    return formData
  }
  return data
}

class RequestQueue {
  private isProcessing = false
  private listeners: Array<(count: number) => void> = []

  // Добавить слушателя изменений очереди
  onQueueChange(listener: (count: number) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  // Уведомить слушателей об изменении
  private notifyListeners(): void {
    db.pendingRequests.count().then((count) => {
      this.listeners.forEach((listener) => listener(count))
    })
  }

  // Добавить запрос в очередь
  async add(
    method: PendingRequest['method'],
    url: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<PendingRequest> {
    const request: PendingRequest = {
      method,
      url,
      data: serializeBody(data),
      headers,
      timestamp: Date.now(),
      retryCount: 0,
    }

    const id = await db.pendingRequests.add(request)
    const savedRequest = await db.pendingRequests.get(id)
    
    this.notifyListeners()
    
    // Если есть интернет, сразу обрабатываем
    if (navigator.onLine) {
      this.processQueue()
    }

    return savedRequest!
  }

  // Выполнить запрос
  private async executeRequest(request: PendingRequest): Promise<any> {
    const config: AxiosRequestConfig = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      timeout: SYNC_REQUEST_TIMEOUT,
    }

    if (request.data && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const body = deserializeBody(request.data)
      config.data = body
      if (body instanceof FormData) {
        // Убираем Content-Type — браузер сам выставит multipart/form-data с boundary
        config.headers = { ...config.headers }
        delete (config.headers as Record<string, any>)['Content-Type']
      }
    }

    try {
      const response = await apiClient(config)
      return response.data
    } catch (error: any) {
      // Если ошибка 401, не повторяем запрос (проблема с авторизацией)
      if (error.response?.status === 401) {
        throw new Error('Unauthorized')
      }
      throw error
    }
  }

  // Обработать очередь запросов
  async processQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) {
      return
    }

    this.isProcessing = true

    try {
      const requests = await db.pendingRequests
        .orderBy('timestamp')
        .toArray()

      for (const request of requests) {
        try {
          // Выполняем запрос
          await this.executeRequest(request)

          // Успешно выполнен - удаляем из очереди
          await db.pendingRequests.delete(request.id!)
          this.notifyListeners()
        } catch (error: any) {
          // Сети всё ещё нет (или запрос отвалился по таймауту) — прекращаем проход,
          // попробуем при следующем триггере. retryCount не трогаем:
          // сетевые сбои не должны приводить к потере данных
          if (isNetworkError(error)) {
            console.log('[Sync] Сеть недоступна, проход синхронизации прерван')
            break
          }

          // Ошибка авторизации — удаляем запрос (повтор бессмысленен)
          if (error.message === 'Unauthorized') {
            await db.pendingRequests.delete(request.id!)
            this.notifyListeners()
            continue
          }

          // Сервер ответил ошибкой (например, 400 валидация) — считаем попытки,
          // после MAX_RETRY_COUNT удаляем, чтобы битый запрос не висел в очереди вечно
          const retryCount = request.retryCount + 1
          if (retryCount >= MAX_RETRY_COUNT) {
            console.error(
              `[Sync] Запрос ${request.method} ${request.url} отклонён сервером ${retryCount} раз(а), удаляем из очереди:`,
              error.response?.data || error.message,
            )
            await db.pendingRequests.delete(request.id!)
          } else {
            await db.pendingRequests.update(request.id!, {
              retryCount,
              lastError: error.message || 'Unknown error',
            })
          }
          this.notifyListeners()
        }
      }
    } catch (error) {
      console.error('Ошибка обработки очереди запросов:', error)
    } finally {
      this.isProcessing = false
    }
  }

  // Получить количество запросов в очереди
  async getQueueLength(): Promise<number> {
    return await db.pendingRequests.count()
  }

  // Получить все запросы в очереди
  async getAll(): Promise<PendingRequest[]> {
    return await db.pendingRequests.orderBy('timestamp').toArray()
  }

  // Удалить конкретный запрос из очереди (например, отменённое офлайн-создание)
  async remove(id: number): Promise<void> {
    await db.pendingRequests.delete(id)
    this.notifyListeners()
  }

  // Очистить очередь
  async clear(): Promise<void> {
    await db.pendingRequests.clear()
    this.notifyListeners()
  }
}

// Экспортируем singleton
export const requestQueue = new RequestQueue()

// Сетевая ошибка (нет соединения / сервер недоступен / таймаут) — от неё имеет смысл
// уходить в офлайн-режим. Ответы с HTTP-статусом сетевой ошибкой не считаем.
export const isNetworkError = (error: any): boolean =>
  error?.response?.status === undefined &&
  (!navigator.onLine ||
    error?.code === 'ERR_NETWORK' ||
    error?.code === 'ECONNABORTED' ||
    error?.message?.includes('Network Error') ||
    error?.message?.includes('timeout'))

// Текст-маркер ошибки «запрос поставлен в очередь» — UI может показать
// мягкое уведомление вместо ошибки
export const QUEUED_MESSAGE = 'Запрос добавлен в очередь для синхронизации'
export const isQueuedError = (error: any): boolean =>
  typeof error?.message === 'string' && error.message.includes(QUEUED_MESSAGE)

// Выполнить мутацию, а при отсутствии сети — поставить в очередь синхронизации.
// Бросает ошибку «Запрос добавлен в очередь…», чтобы UI показал понятное сообщение
// (тот же контракт, что у complaintsAPI.create/update).
export const requestWithQueue = async <T = any>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  data?: any,
  headers?: Record<string, string>,
): Promise<T> => {
  try {
    const config: AxiosRequestConfig = { method, url, data }
    if (headers) config.headers = headers
    const response = await apiClient(config)
    return response.data
  } catch (error: any) {
    if (isNetworkError(error)) {
      await requestQueue.add(method, url, data, headers)
      throw new Error(QUEUED_MESSAGE)
    }
    throw error
  }
}

// Инициализация синхронизации
export const initSync = (): void => {
  // Обрабатываем очередь при восстановлении связи
  window.addEventListener('online', () => {
    console.log('Интернет восстановлен, начинаем синхронизацию...')
    requestQueue.processQueue()
  })

  // PWA: событие online может не прийти (приложение было свёрнуто) —
  // обрабатываем очередь при возврате в приложение
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      requestQueue.processQueue()
    }
  })

  // Фоновая проверка: если очередь не пуста и сеть есть — пробуем отправить.
  // Подстраховка на случай, когда события не сработали или проход был прерван
  setInterval(() => {
    if (navigator.onLine) {
      requestQueue.getQueueLength().then((count) => {
        if (count > 0) requestQueue.processQueue()
      })
    }
  }, SYNC_INTERVAL)

  // Обрабатываем очередь при загрузке страницы (если есть интернет)
  if (navigator.onLine) {
    requestQueue.processQueue()
  }
}

// Проверка статуса синхронизации
export const getSyncStatus = async (): Promise<{
  isOnline: boolean
  queueLength: number
  isProcessing: boolean
}> => {
  return {
    isOnline: navigator.onLine,
    queueLength: await requestQueue.getQueueLength(),
    isProcessing: false, // Можно добавить флаг в RequestQueue
  }
}

