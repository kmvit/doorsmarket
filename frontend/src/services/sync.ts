import { db, PendingRequest } from './offline'
import apiClient from '../api/client'
import { AxiosRequestConfig } from 'axios'

// Максимальное количество попыток повтора запроса
const MAX_RETRY_COUNT = 3
// Задержка между попытками (в миллисекундах)
const RETRY_DELAY = 1000

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
      data,
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
    }

    if (request.data && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
      if (request.data instanceof FormData) {
        config.data = request.data
        config.headers = {
          ...config.headers,
          'Content-Type': 'multipart/form-data',
        }
      } else {
        config.data = request.data
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
          // Проверяем количество попыток
          if (request.retryCount >= MAX_RETRY_COUNT) {
            console.error(
              `Запрос ${request.method} ${request.url} превысил максимальное количество попыток`
            )
            await db.pendingRequests.delete(request.id!)
            this.notifyListeners()
            continue
          }

          // Выполняем запрос
          await this.executeRequest(request)

          // Успешно выполнен - удаляем из очереди
          await db.pendingRequests.delete(request.id!)
          this.notifyListeners()
        } catch (error: any) {
          // Увеличиваем счетчик попыток
          const updatedRequest: PendingRequest = {
            ...request,
            retryCount: request.retryCount + 1,
            lastError: error.message || 'Unknown error',
          }

          await db.pendingRequests.update(request.id!, updatedRequest)

          // Если это не ошибка авторизации, ждем перед следующей попыткой
          if (error.message !== 'Unauthorized') {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
          } else {
            // Ошибка авторизации - удаляем запрос
            await db.pendingRequests.delete(request.id!)
            this.notifyListeners()
          }
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

  // Очистить очередь
  async clear(): Promise<void> {
    await db.pendingRequests.clear()
    this.notifyListeners()
  }
}

// Экспортируем singleton
export const requestQueue = new RequestQueue()

// Инициализация синхронизации
export const initSync = (): void => {
  // Обрабатываем очередь при восстановлении связи
  window.addEventListener('online', () => {
    console.log('Интернет восстановлен, начинаем синхронизацию...')
    requestQueue.processQueue()
  })

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

