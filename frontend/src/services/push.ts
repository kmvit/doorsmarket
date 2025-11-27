import { notificationsAPI } from '../api/notifications'
import { PushSubscriptionData } from '../types/notifications'

// VAPID public key (может быть из .env или получен с сервера)
let VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
let vapidKeyPromise: Promise<string> | null = null

const SW_SCOPE = '/'
const SW_URL = import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/sw.js'
const getServiceWorkerOptions = (): RegistrationOptions =>
  import.meta.env.DEV ? { scope: SW_SCOPE, type: 'module' } : { scope: SW_SCOPE }

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
      // Ищем существующую регистрацию
      if (!this.registration) {
        const existingRegistration = await navigator.serviceWorker.getRegistration()
        if (existingRegistration) {
          this.registration = existingRegistration
          console.log('[Push] Найден существующий Service Worker:', existingRegistration.scope)
        } else {
          console.log('[Push] Регистрируем Service Worker для push-уведомлений...')
          this.registration = await navigator.serviceWorker.register(SW_URL, getServiceWorkerOptions())
          console.log('[Push] Service Worker зарегистрирован:', this.registration.scope)
        }
      }

      // Ждем готовности Service Worker
      const readyRegistration = await navigator.serviceWorker.ready
      if (readyRegistration) {
        this.registration = readyRegistration
      }

      if (!this.registration) {
        console.error('[Push] Service Worker не зарегистрирован, push недоступны')
        return false
      }

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
    // Устанавливаем флаг, чтобы предотвратить редиректы во время подписки
    sessionStorage.setItem('push_subscribe_in_progress', 'true')
    
    try {
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
            console.log('[Push] Подписка успешно отправлена на сервер')
            localStorage.setItem('push_subscription', JSON.stringify(subscriptionData))
            return true
          } catch (error: any) {
            console.warn('[Push] Не удалось отправить существующую подписку на сервер:', error)
            // Если это ошибка 500 - это проблема на сервере, не критично
            if (error.response?.status === 500) {
              console.error('[Push] Ошибка 500 на сервере при сохранении подписки. Подписка есть в браузере, но не сохранена на сервере.')
              // Возвращаем true, так как подписка работает в браузере
              // Можно попробовать сохранить позже
              return true
            }
            // Если это ошибка авторизации, не продолжаем создавать новую подписку
            if (error.response?.status === 401 || error.message?.includes('авторизация')) {
              console.error('[Push] Ошибка авторизации при сохранении существующей подписки. Подписка есть в браузере, но не сохранена на сервере.')
              // Возвращаем false, чтобы показать пользователю, что подписка не полностью активна
              return false
            }
            // Для других ошибок - подписка есть в браузере, возвращаем true
            console.warn('[Push] Другая ошибка при сохранении на сервер, но подписка есть в браузере')
            return true
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

      try {
      await notificationsAPI.subscribePush(subscriptionData)
        console.log('[Push] Подписка успешно создана и отправлена на сервер')

      // Сохраняем в localStorage
      localStorage.setItem('push_subscription', JSON.stringify(subscriptionData))

      return true
      } catch (error: any) {
        console.error('[Push] Ошибка отправки подписки на сервер:', error)
        // Если это ошибка 500 - это проблема на сервере, подписка работает в браузере
        if (error.response?.status === 500) {
          console.error('[Push] Ошибка 500 на сервере. Подписка создана в браузере, но не сохранена на сервере.')
          // Возвращаем true, так как подписка работает в браузере
          // Пользователь может попробовать подписаться снова позже
          return true
        }
        // Если это ошибка авторизации, логируем подробнее, но не бросаем дальше
        if (error.response?.status === 401) {
          console.error('[Push] Ошибка 401 при отправке подписки. Возможно, токен истек.')
        }
        // Всё равно возвращаем true, так как подписка создана в браузере
        // Сервер может не сохранить её, но это не критично
        return true
      }
    } catch (error: any) {
      console.error('[Push] Ошибка подписки на push-уведомления:', error)
      if (error.message) {
        console.error('[Push] Сообщение об ошибке:', error.message)
      }
      if (error.response) {
        console.error('[Push] Статус ошибки:', error.response.status)
        console.error('[Push] Данные ошибки:', error.response.data)
      }
      return false
    }
  } finally {
    // Убираем флаг после завершения подписки (успешной или неуспешной)
    sessionStorage.removeItem('push_subscribe_in_progress')
    console.log('[Push] Процесс подписки завершен, флаг удален')
    }
  }

  // Отписаться от push-уведомлений
  async unsubscribe(): Promise<boolean> {
    // Устанавливаем флаг, чтобы предотвратить редиректы во время отписки
    sessionStorage.setItem('push_subscribe_in_progress', 'true')

    try {
      // Собираем данные о текущей подписке (для информирования сервера)
      let subscriptionData: PushSubscriptionData | null = null

      // Пытаемся получить данные из активной подписки браузера
      if (this.subscription) {
        try {
          const p256dhKey = this.subscription.getKey('p256dh')
          const authKey = this.subscription.getKey('auth')

          if (p256dhKey && authKey) {
            subscriptionData = {
              endpoint: this.subscription.endpoint,
              keys: {
                p256dh: this.arrayBufferToBase64(p256dhKey),
                auth: this.arrayBufferToBase64(authKey),
              },
            }
          }
        } catch (error) {
          console.warn('[Push] Не удалось получить ключи активной подписки:', error)
        }
      }

      // Если в браузере нет подписки, пробуем взять сохранённую из localStorage
      if (!subscriptionData) {
        const storedSubscription = localStorage.getItem('push_subscription')
        if (storedSubscription) {
          try {
            subscriptionData = JSON.parse(storedSubscription) as PushSubscriptionData
          } catch (error) {
            console.warn('[Push] Не удалось разобрать сохранённую подписку из localStorage:', error)
          }
        }
      }

      // Отписываемся на сервере (даже если нет подписки в браузере)
      try {
        await notificationsAPI.unsubscribePush(subscriptionData || undefined)
        console.log('[Push] Отписка на сервере выполнена')
      } catch (error: any) {
        // Если ошибка 500 - не критично, продолжаем
        if (error.response?.status === 500) {
          console.warn('[Push] Ошибка 500 при отписке на сервере, но продолжаем отписку в браузере')
        } else {
          console.warn('[Push] Ошибка при отписке на сервере:', error)
        }
      }
      
      // Отписываемся в браузере, если есть подписка
      if (this.subscription) {
        try {
          const unsubscribed = await this.subscription.unsubscribe()
          if (unsubscribed) {
        this.subscription = null
        localStorage.removeItem('push_subscription')
            console.log('[Push] Отписка в браузере выполнена')
          }
        } catch (error) {
          console.warn('[Push] Ошибка отписки в браузере:', error)
          // Продолжаем, даже если отписка в браузере не удалась
        }
      }
      
      // Очищаем подписку локально
      this.subscription = null
      localStorage.removeItem('push_subscription')
      
      return true
    } catch (error) {
      console.error('[Push] Ошибка отписки от push-уведомлений:', error)
      return false
    } finally {
      // Убираем флаг после завершения отписки
      sessionStorage.removeItem('push_subscribe_in_progress')
      console.log('[Push] Процесс отписки завершен, флаг удален')
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

