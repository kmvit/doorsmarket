import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { User, LoginResponse } from '../types/auth'
import { authAPI } from '../api/auth'
import { resetRedirectFlag } from '../api/client'
import { pushNotificationService } from '../services/push'

interface AuthStore {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  
  login: (username: string, password: string) => Promise<void>
  register: (data: any) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User | null) => void
  setTokens: (access: string, refresh: string) => void
  clearError: () => void
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          console.log('[Auth] Начало процесса входа...')
          const response: LoginResponse = await authAPI.login(username, password)
          
          // Сначала сохраняем токены в localStorage, чтобы они были доступны для последующих запросов
          localStorage.setItem('access_token', response.access)
          localStorage.setItem('refresh_token', response.refresh)
          
          // Теперь получаем информацию о пользователе (токен уже в заголовках)
          const user = response.user || await authAPI.getMe()
          console.log('[Auth] Вход успешен, пользователь:', user.username)
          
          resetRedirectFlag() // Сбрасываем флаг редиректа при успешной авторизации
          // Очищаем флаги ошибки авторизации для уведомлений
          sessionStorage.removeItem('notification_auth_error')
          sessionStorage.removeItem('notification_token_expired')
          
          // Устанавливаем состояние АТОМАРНО, чтобы избежать гонок условий
          set({
            user,
            accessToken: response.access,
            refreshToken: response.refresh,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
          
          // Подписываемся на push-уведомления в фоне (не блокируем процесс входа)
          pushNotificationService.subscribe().catch((error) => {
            console.warn('Не удалось подписаться на push-уведомления:', error)
          })
        } catch (error: any) {
          console.error('[Auth] Ошибка входа:', error)
          set({
            error: error.response?.data?.detail || 'Ошибка входа',
            isLoading: false,
            isAuthenticated: false,
          })
          throw error
        }
      },

      register: async (data: any) => {
        set({ isLoading: true, error: null })
        try {
          const response: LoginResponse = await authAPI.register(data)
          
          // Сначала сохраняем токены в localStorage
          localStorage.setItem('access_token', response.access)
          localStorage.setItem('refresh_token', response.refresh)
          
          // Теперь получаем информацию о пользователе (токен уже в заголовках)
          const user = response.user || await authAPI.getMe()
          
          resetRedirectFlag() // Сбрасываем флаг редиректа при успешной авторизации
          // Очищаем флаги ошибки авторизации для уведомлений
          sessionStorage.removeItem('notification_auth_error')
          sessionStorage.removeItem('notification_token_expired')
          set({
            user,
            accessToken: response.access,
            refreshToken: response.refresh,
            isAuthenticated: true,
            isLoading: false,
          })
          
          // Подписываемся на push-уведомления в фоне (не блокируем процесс регистрации)
          pushNotificationService.subscribe().catch((error) => {
            console.warn('Не удалось подписаться на push-уведомления:', error)
          })
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || 'Ошибка регистрации',
            isLoading: false,
          })
          throw error
        }
      },

      logout: async () => {
        try {
          // Отписываемся от push-уведомлений при выходе
          await pushNotificationService.unsubscribe().catch((error) => {
            console.warn('Не удалось отписаться от push-уведомлений:', error)
          })
          await authAPI.logout()
        } catch (error) {
          console.error('Logout error:', error)
        } finally {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          })
        }
      },

      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user })
      },

      setTokens: (access: string, refresh: string) => {
        set({ accessToken: access, refreshToken: refresh })
        localStorage.setItem('access_token', access)
        localStorage.setItem('refresh_token', refresh)
      },

      clearError: () => {
        set({ error: null })
      },

      checkAuth: async () => {
        const token = localStorage.getItem('access_token')
        if (!token) {
          // Если нет токена, убеждаемся, что состояние чистое
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
          })
          return
        }

        // Если уже загружаем или проверяем, не запускаем повторную проверку
        const currentState = useAuthStore.getState()
        if (currentState.isLoading) {
          return
        }

          set({ isLoading: true })
          try {
          console.log('[Auth] Проверка аутентификации...')
            const user = await authAPI.getMe()
          console.log('[Auth] Проверка успешна, пользователь:', user.username)
            resetRedirectFlag() // Сбрасываем флаг редиректа при успешной проверке
            // Очищаем флаг ошибки авторизации для уведомлений
            sessionStorage.removeItem('notification_auth_error')
          sessionStorage.removeItem('notification_token_expired')
            set({
              user,
              accessToken: token,
              refreshToken: localStorage.getItem('refresh_token'),
              isAuthenticated: true,
              isLoading: false,
            })
            
            // НЕ подписываемся автоматически - пользователь должен сделать это вручную через кнопку
            // Автоматическая подписка вызывала проблемы с 500 ошибками
        } catch (error: any) {
          console.error('[Auth] Ошибка проверки аутентификации:', error)
          // Очищаем только если это реальная ошибка авторизации
          if (error.response?.status === 401 || error.message?.includes('авторизация')) {
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
              isLoading: false,
            })
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
          } else {
            // Если это другая ошибка (сеть и т.д.), не сбрасываем состояние
            set({ isLoading: false })
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

