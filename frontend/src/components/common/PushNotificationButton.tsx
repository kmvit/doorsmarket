import { useState, useEffect } from 'react'
import { pushNotificationService } from '../../services/push'

export default function PushNotificationButton() {
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkSubscriptionStatus()
    setPermission(Notification.permission)
    
    // Слушаем изменения разрешения
    if ('Notification' in window) {
      const interval = setInterval(() => {
        setPermission(Notification.permission)
      }, 1000)
      
      return () => clearInterval(interval)
    }
  }, [])

  const checkSubscriptionStatus = async () => {
    try {
      const subscribed = await pushNotificationService.isSubscribed()
      setIsSubscribed(subscribed)
    } catch (error) {
      console.error('Ошибка проверки статуса подписки:', error)
    }
  }

  const handleSubscribe = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const success = await pushNotificationService.subscribe()
      
      if (success) {
        setIsSubscribed(true)
        setPermission(Notification.permission)
      } else {
        if (Notification.permission === 'denied') {
          setError('Разрешение на уведомления отклонено. Включите уведомления в настройках браузера.')
        } else if (Notification.permission === 'default') {
          setError('Разрешение на уведомления не получено. Разрешите уведомления в появившемся окне.')
        } else {
          setError('Не удалось подписаться на push-уведомления. Проверьте консоль для подробностей.')
        }
      }
    } catch (err: any) {
      console.error('Ошибка подписки на push-уведомления:', err)
      setError(err.message || 'Произошла ошибка при подписке на уведомления')
    } finally {
      setIsLoading(false)
      await checkSubscriptionStatus()
    }
  }

  const handleUnsubscribe = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const success = await pushNotificationService.unsubscribe()
      if (success) {
        setIsSubscribed(false)
      }
    } catch (err: any) {
      console.error('Ошибка отписки:', err)
      setError(err.message || 'Произошла ошибка при отписке')
    } finally {
      setIsLoading(false)
      await checkSubscriptionStatus()
    }
  }

  // Если уведомления не поддерживаются
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Push-уведомления не поддерживаются в этом браузере
      </div>
    )
  }

  // Если разрешение отклонено
  if (permission === 'denied') {
    return (
      <div className="text-sm text-red-600 dark:text-red-400">
        Уведомления заблокированы. Разрешите их в настройках браузера.
      </div>
    )
  }

  // Если уже подписаны
  if (isSubscribed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-green-600 dark:text-green-400">
          ✓ Push-уведомления включены
        </span>
        <button
          onClick={handleUnsubscribe}
          disabled={isLoading}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline disabled:opacity-50"
        >
          {isLoading ? 'Отписка...' : 'Отключить'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleSubscribe}
        disabled={isLoading}
        className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-gray-400 text-white text-sm font-medium rounded-md transition-colors disabled:cursor-not-allowed"
      >
        {isLoading ? 'Подписка...' : 'Включить push-уведомления'}
      </button>
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}
      {permission === 'default' && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Нажмите кнопку выше, чтобы включить уведомления. Браузер запросит разрешение.
        </div>
      )}
    </div>
  )
}

