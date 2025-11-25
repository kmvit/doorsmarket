import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { User, LoginResponse } from '../types/auth'
import { authAPI } from '../api/auth'

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
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const response: LoginResponse = await authAPI.login(username, password)
          
          // Сначала сохраняем токены в localStorage, чтобы они были доступны для последующих запросов
          localStorage.setItem('access_token', response.access)
          localStorage.setItem('refresh_token', response.refresh)
          
          // Теперь получаем информацию о пользователе (токен уже в заголовках)
          const user = response.user || await authAPI.getMe()
          
          set({
            user,
            accessToken: response.access,
            refreshToken: response.refresh,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || 'Ошибка входа',
            isLoading: false,
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
          
          set({
            user,
            accessToken: response.access,
            refreshToken: response.refresh,
            isAuthenticated: true,
            isLoading: false,
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
        if (token) {
          set({ isLoading: true })
          try {
            const user = await authAPI.getMe()
            set({
              user,
              accessToken: token,
              refreshToken: localStorage.getItem('refresh_token'),
              isAuthenticated: true,
              isLoading: false,
            })
          } catch (error) {
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
              isLoading: false,
            })
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
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

