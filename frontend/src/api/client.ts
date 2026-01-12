import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

// Флаг для предотвращения множественных редиректов
let isRedirecting = false

// Экспортируем функцию для сброса флага (используется после успешной авторизации)
export const resetRedirectFlag = () => {
  isRedirecting = false
}

// Создаем экземпляр axios
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Отключаем автоматическое следование редиректам
  maxRedirects: 0,
  validateStatus: (status) => {
    // Разрешаем только успешные статусы и 302 (для ручной обработки редиректов)
    // 401 и другие ошибки должны обрабатываться как ошибки
    return (status >= 200 && status < 300) || status === 302
  },
})

// Интерцептор для добавления токена
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
      // Отладочное логирование для запросов к notifications
      if (config.url?.includes('/notifications/')) {
        console.log('Request to notifications with token:', token.substring(0, 20) + '...')
      }
    } else if (config.url && !config.url.includes('/auth/login') && !config.url.includes('/auth/register') && !config.url.includes('/auth/token/refresh')) {
      // Логируем, если токен отсутствует для защищенных эндпоинтов
      console.warn('No token found for request:', config.url)
    }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// Функция для безопасного перенаправления на логин
const redirectToLogin = (skipCheck?: boolean) => {
  if (isRedirecting && !skipCheck) {
    return // Уже перенаправляем, не делаем это снова
  }
  
  // Проверяем, что мы не на странице логина
  if (window.location.pathname === '/login') {
    return
  }
  
  // Проверяем, не происходит ли push-подписка (по флагу в sessionStorage)
  const isPushInProgress = sessionStorage.getItem('push_subscribe_in_progress') === 'true'
  if (isPushInProgress && !skipCheck) {
    console.warn('[API] Редирект заблокирован - выполняется push-подписка')
    return
  }
  
  isRedirecting = true
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  
  // Используем replace вместо href, чтобы не создавать историю
  window.location.replace('/login')
}

// Интерцептор для обработки ошибок и обновления токена
apiClient.interceptors.response.use(
  (response) => {
    // Проверяем статус 401 в response interceptor (на случай, если validateStatus все еще пропускает его)
    if (response.status === 401) {
      console.log('401 status in response interceptor for:', response.config.url)
      // Преобразуем в ошибку, чтобы error interceptor мог обработать
      const error = new Error('Unauthorized') as any
      error.response = response
      error.config = response.config
      return Promise.reject(error)
    }
    
    // Проверяем, что ответ - это JSON, а не HTML
    // Исключаем запросы к push-subscribe и push-unsubscribe из редиректа
    const url = response.config?.url || ''
    const isPushRequest = url.includes('/push-subscribe') || url.includes('/push-unsubscribe') || url.includes('/vapid-public-key')
    if (typeof response.data === 'string' && response.data.trim().startsWith('<!DOCTYPE') && !isPushRequest) {
      // Получен HTML вместо JSON - вероятно, перенаправление на страницу логина
      console.warn('[API] Получен HTML ответ для:', url)
      redirectToLogin()
      return Promise.reject(new Error('Получен HTML ответ вместо JSON. Требуется авторизация.'))
    }
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Логируем 401 ошибки для диагностики
    if (error.response?.status === 401) {
      const token = localStorage.getItem('access_token')
      console.log('401 error for:', originalRequest.url, 'Token present:', !!token, 'Token preview:', token ? token.substring(0, 20) + '...' : 'none')
    }

    // Обрабатываем 302 редирект как ошибку авторизации (если Django все еще делает редирект)
    if (error.response?.status === 302) {
      // Редирект на страницу логина - обрабатываем как 401
      // Останавливаем все дальнейшие попытки
      if (!originalRequest._retry) {
        originalRequest._retry = true
        
        // Пытаемся обновить токен только один раз
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken) {
          try {
            const response = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
              refresh: refreshToken,
            })

            const { access } = response.data
            localStorage.setItem('access_token', access)

            // Повторяем оригинальный запрос с новым токеном
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${access}`
            }
            return apiClient(originalRequest)
          } catch (refreshError) {
            // Если обновление токена не удалось - очищаем и редиректим
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
            redirectToLogin()
            return Promise.reject(new Error('Требуется авторизация'))
          }
        } else {
          // Нет refresh токена - сразу редирект
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          redirectToLogin()
          return Promise.reject(new Error('Требуется авторизация'))
        }
      } else {
        // Уже была попытка - останавливаем цикл
        return Promise.reject(new Error('Требуется авторизация'))
      }
    }

    // Проверяем, что ошибка содержит HTML (перенаправление на логин)
    if (error.response?.data && typeof error.response.data === 'string' && error.response.data.trim().startsWith('<!DOCTYPE')) {
      redirectToLogin()
      return Promise.reject(new Error('Требуется авторизация'))
    }

    // Если ошибка 401 и это не повторный запрос
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Проверяем, не является ли это запросом на обновление токена - если да, не пытаемся обновить снова
      if (originalRequest.url?.includes('/auth/token/refresh/')) {
        console.error('Token refresh endpoint returned 401 - refresh token is invalid or expired')
        // Очищаем токены и редиректим на логин
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        // Для запросов к notifications и push просто возвращаем ошибку, не редиректим
        const url = originalRequest.url || ''
        const isProtectedRequest = url.includes('/notifications/') || url.includes('/push-subscribe') || url.includes('/push-unsubscribe') || url.includes('/vapid-public-key')
        if (isProtectedRequest) {
          console.warn('[API] Ошибка авторизации для защищенного запроса (без редиректа):', url)
          return Promise.reject(new Error('Требуется авторизация'))
        }
        redirectToLogin()
        return Promise.reject(new Error('Требуется авторизация'))
      }

        // Для уведомлений и push подписки - проверяем, не было ли уже попытки обновления токена
      // Используем отдельный флаг для предотвращения бесконечного цикла
        const url = originalRequest.url || ''
        const isNotificationRequest = url.includes('/notifications/') || url.includes('/push-subscribe') || url.includes('/push-unsubscribe') || url.includes('/push-status') || url.includes('/vapid-public-key')
      const notificationRetryKey = `notification_retry_${originalRequest.url}`
      const notificationRetryCount = parseInt(sessionStorage.getItem(notificationRetryKey) || '0', 10)
      
      // Если это запрос к уведомлениям и уже была попытка обновления токена, не пытаемся снова
      if (isNotificationRequest && notificationRetryCount >= 1) {
        console.warn('Уведомления: уже была попытка обновления токена, прекращаем попытки')
        sessionStorage.removeItem(notificationRetryKey)
        return Promise.reject(new Error('Требуется авторизация'))
      }

      originalRequest._retry = true
      
      // Увеличиваем счетчик попыток для уведомлений
      if (isNotificationRequest) {
        sessionStorage.setItem(notificationRetryKey, String(notificationRetryCount + 1))
      }

      const refreshToken = localStorage.getItem('refresh_token')
      
      // Если нет refresh токена
      if (!refreshToken) {
        console.log('401 error: No refresh token available for:', originalRequest.url)
        // Для запросов к notifications просто возвращаем ошибку, не редиректим
        if (isNotificationRequest) {
          sessionStorage.removeItem(notificationRetryKey)
          return Promise.reject(new Error('Требуется авторизация'))
        }
        redirectToLogin()
        return Promise.reject(new Error('Требуется авторизация'))
      }

      // Пытаемся обновить токен
      try {
        console.log('Attempting to refresh token for:', originalRequest.url)
        console.log('Refresh token present:', !!refreshToken, 'Preview:', refreshToken ? refreshToken.substring(0, 20) + '...' : 'none')
        const response = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        })

        const { access, refresh: newRefreshToken } = response.data
        
        // Сохраняем новый access token
        localStorage.setItem('access_token', access)
        
        // Если пришел новый refresh token (при ROTATE_REFRESH_TOKENS: True), сохраняем его
        if (newRefreshToken) {
          localStorage.setItem('refresh_token', newRefreshToken)
          console.log('New refresh token saved')
        }
        
        console.log('Token refreshed successfully, retrying request:', originalRequest.url)

        // Повторяем оригинальный запрос с новым токеном
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access}`
        }
        
        // Для уведомлений НЕ сбрасываем флаг retry, чтобы предотвратить бесконечный цикл
        // Если запрос снова вернет 401, мы просто вернем ошибку
        if (!isNotificationRequest) {
          delete originalRequest._retry
        }
        
        return apiClient(originalRequest)
      } catch (refreshError: any) {
        console.error('Token refresh failed:', refreshError)
        
        // Если refresh token тоже вернул 401, очищаем токены
        if (refreshError.response?.status === 401) {
          console.error('Refresh token is invalid or expired, clearing tokens')
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          
          // Для уведомлений и push устанавливаем флаг, чтобы полностью прекратить запросы
          if (isNotificationRequest) {
            sessionStorage.setItem('notification_auth_error', 'true')
            sessionStorage.setItem('notification_token_expired', 'true')
            console.warn('Уведомления: токены истекли, прекращаем все запросы к уведомлениям')
          }
        }
        
        // Очищаем счетчик попыток для уведомлений
        if (isNotificationRequest) {
          sessionStorage.removeItem(notificationRetryKey)
        }
        
        // Если обновление токена не удалось
        // Для запросов к notifications просто возвращаем ошибку, не редиректим
        if (isNotificationRequest) {
          return Promise.reject(new Error('Требуется авторизация'))
        }
        redirectToLogin()
        return Promise.reject(new Error('Требуется авторизация'))
      }
    }
    
    // Если это повторный запрос к уведомлениям или push после обновления токена и снова 401
    // Просто возвращаем ошибку, не пытаемся обновлять токен снова
    const url = originalRequest.url || ''
    const isPushOrNotificationRequest = url.includes('/notifications/') || url.includes('/push-subscribe') || url.includes('/push-unsubscribe') || url.includes('/push-status') || url.includes('/vapid-public-key')
    if (error.response?.status === 401 && originalRequest._retry && isPushOrNotificationRequest) {
      const notificationRetryKey = `notification_retry_${originalRequest.url}`
      sessionStorage.removeItem(notificationRetryKey)
      console.warn('Уведомления: запрос с обновленным токеном все еще возвращает 401, прекращаем попытки')
      return Promise.reject(new Error('Требуется авторизация'))
    }

    // Для серверных ошибок (500+) на push-запросах - логируем, но не редиректим
    if (error.response && error.response.status >= 500 && isPushOrNotificationRequest) {
      console.error(`[API] Серверная ошибка ${error.response.status} для push/notification запроса:`, url, error.response.data)
      // Не редиректим, просто возвращаем ошибку
      return Promise.reject(error)
    }

    return Promise.reject(error)
  }
)

export default apiClient

