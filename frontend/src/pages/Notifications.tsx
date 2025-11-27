import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { notificationsAPI } from '../api/notifications'
import { Notification, NotificationType } from '../types/notifications'
import { useAuthStore } from '../store/authStore'
import PushNotificationButton from '../components/common/PushNotificationButton'

const Notifications = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filter, setFilter] = useState<'all' | 'unread'>('unread')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadNotifications = async () => {
    // Проверяем наличие токена перед запросом
    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated) {
      setNotifications([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const filters = filter === 'unread' ? { is_read: false } : undefined
      const data = await notificationsAPI.getList(filters)
      // Убеждаемся, что data - это массив
      setNotifications(Array.isArray(data) ? data : [])
    } catch (err: any) {
      const errorMessage = err.message || 'Ошибка загрузки уведомлений'
      setError(errorMessage)
      setNotifications([]) // Устанавливаем пустой массив при ошибке
      
      // Если ошибка авторизации, не пытаемся загружать снова
      if (errorMessage.includes('авторизация') || errorMessage.includes('HTML') || errorMessage.includes('401') || err.response?.status === 401) {
        // Ошибка будет обработана ProtectedRoute или интерцептором
        return
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Не делаем запрос, пока идет проверка аутентификации
    if (authLoading) {
      return
    }

    // Проверяем, не истекли ли токены
    const tokenExpired = sessionStorage.getItem('notification_token_expired') === 'true'
    const hasAuthError = sessionStorage.getItem('notification_auth_error') === 'true'
    
    if (tokenExpired || hasAuthError) {
      setError('Требуется повторная авторизация')
      setIsLoading(false)
      return
    }

    loadNotifications()
    
    // Обновляем каждые 30 секунд, только если нет ошибки авторизации
    const interval = setInterval(() => {
      const token = localStorage.getItem('access_token')
      const tokenExpired = sessionStorage.getItem('notification_token_expired') === 'true'
      const hasAuthError = sessionStorage.getItem('notification_auth_error') === 'true'
      
      if (token && isAuthenticated && !tokenExpired && !hasAuthError && (!error || !error.includes('авторизация') && !error.includes('HTML'))) {
        loadNotifications()
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [filter, error, isAuthenticated, authLoading])

  const handleMarkRead = async (id: number) => {
    try {
      await notificationsAPI.markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      )
    } catch (err: any) {
      // Если запрос в очереди, обновляем локально
      if (err.message?.includes('очередь')) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
        )
      } else {
        console.error('Ошибка отметки уведомления:', err)
      }
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead()
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          is_read: true,
          read_at: new Date().toISOString(),
        }))
      )
    } catch (err: any) {
      // Если запрос в очереди, обновляем локально
      if (err.message?.includes('очередь')) {
        setNotifications((prev) =>
          prev.map((n) => ({
            ...n,
            is_read: true,
            read_at: new Date().toISOString(),
          }))
        )
      } else {
        console.error('Ошибка отметки всех уведомлений:', err)
      }
    }
  }

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'push':
        return '🔔'
      case 'pc':
        return '💻'
      case 'sms':
        return '📱'
      case 'email':
        return '📧'
      default:
        return '📬'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'только что'
    if (minutes < 60) return `${minutes} мин. назад`
    if (hours < 24) return `${hours} ч. назад`
    if (days < 7) return `${days} дн. назад`
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  if (isLoading && notifications.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Уведомления</h1>
        <p className="text-gray-600">
          {unreadCount > 0 ? `${unreadCount} непрочитанных` : 'Все уведомления прочитаны'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Push-уведомления настройка */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg mb-6 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Push-уведомления</h3>
            <p className="text-sm text-gray-600">
              Получайте уведомления прямо на ваше устройство, даже когда приложение закрыто
            </p>
          </div>
          <PushNotificationButton />
        </div>
      </div>

      {/* Фильтры и действия */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'unread'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Непрочитанные
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Все
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Отметить все прочитанными
            </button>
          )}
        </div>
      </div>

      {/* Список уведомлений */}
      {notifications.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-6xl mb-4">📭</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {filter === 'unread' ? 'Нет непрочитанных уведомлений' : 'Нет уведомлений'}
          </h2>
          <p className="text-gray-600">
            {filter === 'unread'
              ? 'Все уведомления прочитаны'
              : 'Здесь будут отображаться ваши уведомления'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-white rounded-lg shadow p-4 transition-all ${
                !notification.is_read
                  ? 'border-l-4 border-blue-600 hover:shadow-md'
                  : 'opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="text-2xl flex-shrink-0">
                  {getNotificationIcon(notification.notification_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3
                        className={`font-semibold mb-1 ${
                          !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                        }`}
                      >
                        {notification.title}
                      </h3>
                      <p className="text-gray-600 text-sm mb-2">{notification.message}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{formatDate(notification.created_at)}</span>
                        <span className="capitalize">
                          {notification.notification_type_display}
                        </span>
                        {notification.complaint && (
                          <Link
                            to={`/complaints/${notification.complaint.id}`}
                            className="text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            Рекламация #{notification.complaint.id}
                          </Link>
                        )}
                      </div>
                    </div>
                    {!notification.is_read && (
                      <button
                        onClick={() => handleMarkRead(notification.id)}
                        className="flex-shrink-0 px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Отметить прочитанным"
                      >
                        ✓ Прочитано
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Notifications

