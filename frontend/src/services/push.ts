import { notificationsAPI } from '../api/notifications'
import { PushSubscriptionData } from '../types/notifications'

// VAPID public key (может быть из .env или получен с сервера)
let VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
let vapidKeyPromise: Promise<string> | null = null

class PushNotificationService {
  private registration: ServiceWorkerRegistration | null = null
  private subscription: PushSubscription | null = null

  // Получить VAPID публичный ключ (с кешированием)
  async getVapidPublicKey(): Promise<string> {
    // Если ключ уже есть из .env, используем его
    if (VAPID_PUBLIC_KEY) {
      return VAPID_PUBLIC_KEY
    }

    // Если запрос уже в процессе, ждём его
    if (vapidKeyPromise) {
      return vapidKeyPromise
    }

    // Запрашиваем ключ с сервера
    vapidKeyPromise = notificationsAPI.getVapidPublicKey()
      .then((key) => {
        VAPID_PUBLIC_KEY = key
        return key
      })
      .catch((error) => {
        vapidKeyPromise = null // Сбрасываем, чтобы можно было повторить
        console.error('Не удалось получить VAPID ключ с сервера:', error)
        throw error
      })

    return vapidKeyPromise
  }

  // Инициализация push-уведомлений
  async initialize(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push-уведомления не поддерживаются в этом браузере')
      return false
    }

    try {
      // Регистрируем Service Worker
      this.registration = await navigator.serviceWorker.ready

      // Проверяем существующую подписку
      this.subscription = await this.registration.pushManager.getSubscription()

      // Если подписка есть, проверяем её валидность
      if (this.subscription) {
        console.log('Push подписка уже существует')
        return true
      }

      return false
    } catch (error) {
      console.error('Ошибка инициализации push-уведомлений:', error)
      return false
    }
  }

  // Запросить разрешение и подписаться
  async subscribe(): Promise<boolean> {
    console.log('[Push] Начинаем процесс подписки...')
    
    if (!this.registration) {
      console.log('[Push] Service Worker не инициализирован, инициализируем...')
      const initialized = await this.initialize()
      if (!initialized && !this.registration) {
        console.error('[Push] Не удалось инициализировать Service Worker')
        return false
      }
    }

    if (!this.registration) {
      console.error('[Push] Service Worker не зарегистрирован')
      return false
    }
    
    console.log('[Push] Service Worker готов:', this.registration.scope)

    try {
      // Проверяем, есть ли уже подписка
      if (!this.subscription) {
        this.subscription = await this.registration.pushManager.getSubscription()
      }

      // Если подписка уже существует, отправляем её на сервер
      if (this.subscription) {
        const p256dhKey = this.subscription.getKey('p256dh')
        const authKey = this.subscription.getKey('auth')
        
        if (p256dhKey && authKey) {
          const subscriptionData: PushSubscriptionData = {
            endpoint: this.subscription.endpoint,
            keys: {
              p256dh: this.arrayBufferToBase64(p256dhKey),
              auth: this.arrayBufferToBase64(authKey),
            },
          }

          try {
            await notificationsAPI.subscribePush(subscriptionData)
            console.log('Push подписка успешно отправлена на сервер')
            localStorage.setItem('push_subscription', JSON.stringify(subscriptionData))
            return true
          } catch (error) {
            console.warn('Не удалось отправить существующую подписку на сервер:', error)
            // Продолжаем, чтобы попытаться создать новую подписку
          }
        }
      }

      // Если подписки нет или не удалось отправить существующую, создаем новую
      console.log('[Push] Подписки нет, создаём новую...')
      
      // Запрашиваем разрешение
      console.log('[Push] Текущее разрешение:', Notification.permission)
      const permission = await Notification.requestPermission()
      console.log('[Push] Новое разрешение:', permission)
      
      if (permission !== 'granted') {
        console.warn('[Push] Разрешение на уведомления не получено. Разрешение:', permission)
        return false
      }

      // Получаем VAPID публичный ключ
      console.log('[Push] Получаем VAPID публичный ключ...')
      const vapidPublicKey = await this.getVapidPublicKey()
      if (!vapidPublicKey) {
        console.error('[Push] VAPID публичный ключ не получен')
        return false
      }
      console.log('[Push] VAPID ключ получен (первые 20 символов):', vapidPublicKey.substring(0, 20) + '...')

      // Создаем подписку
      const applicationServerKey = this.urlBase64ToUint8Array(vapidPublicKey)
      this.subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      })

      // Получаем ключи из подписки
      const p256dhKey = this.subscription.getKey('p256dh')
      const authKey = this.subscription.getKey('auth')
      
      if (!p256dhKey || !authKey) {
        throw new Error('Не удалось получить ключи из подписки')
      }
      
      // Отправляем подписку на сервер
      const subscriptionData: PushSubscriptionData = {
        endpoint: this.subscription.endpoint,
        keys: {
          p256dh: this.arrayBufferToBase64(p256dhKey),
          auth: this.arrayBufferToBase64(authKey),
        },
      }

      await notificationsAPI.subscribePush(subscriptionData)
      console.log('Push подписка успешно создана и отправлена на сервер')

      // Сохраняем в localStorage
      localStorage.setItem('push_subscription', JSON.stringify(subscriptionData))

      return true
    } catch (error) {
      console.error('Ошибка подписки на push-уведомления:', error)
      return false
    }
  }

  // Отписаться от push-уведомлений
  async unsubscribe(): Promise<boolean> {
    if (!this.subscription) {
      return true
    }

    try {
      const unsubscribed = await this.subscription.unsubscribe()
      if (unsubscribed) {
        await notificationsAPI.unsubscribePush()
        this.subscription = null
        localStorage.removeItem('push_subscription')
        console.log('Отписка от push-уведомлений выполнена')
        return true
      }
      return false
    } catch (error) {
      console.error('Ошибка отписки от push-уведомлений:', error)
      return false
    }
  }

  // Проверить статус подписки
  async isSubscribed(): Promise<boolean> {
    if (!this.registration) {
      await this.initialize()
    }

    if (!this.registration) {
      return false
    }

    try {
      const subscription = await this.registration.pushManager.getSubscription()
      return subscription !== null
    } catch (error) {
      console.error('Ошибка проверки подписки:', error)
      return false
    }
  }

  // Проверить разрешение на уведомления
  getPermission(): NotificationPermission {
    return Notification.permission
  }

  // Вспомогательные функции для конвертации ключей
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | ArrayBufferView): string {
    let bytes: Uint8Array
    if (buffer instanceof ArrayBuffer) {
      bytes = new Uint8Array(buffer)
    } else {
      bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    }
    
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
  }
}

// Экспортируем singleton
export const pushNotificationService = new PushNotificationService()

// Инициализация при загрузке приложения
export const initPushNotifications = async (): Promise<void> => {
  try {
    // Пытаемся получить ключ (либо из .env, либо с сервера)
    const key = await pushNotificationService.getVapidPublicKey()
    if (!key) {
      console.warn('VAPID_PUBLIC_KEY не настроен, push-уведомления недоступны')
      return
    }
    await pushNotificationService.initialize()
  } catch (error) {
    console.warn('Не удалось инициализировать push-уведомления (возможно, ключ не настроен на сервере):', error)
  }
}

