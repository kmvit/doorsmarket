import apiClient from './client'
import { User, LoginResponse, RegisterData } from '../types/auth'

export const authAPI = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const response = await apiClient.post('/auth/login/', {
      username,
      password,
    })
    return response.data
  },

  register: async (data: RegisterData): Promise<LoginResponse> => {
    const response = await apiClient.post('/auth/register/', data)
    return response.data
  },

  logout: async (): Promise<void> => {
    const refreshToken = localStorage.getItem('refresh_token')
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout/', {
          refresh_token: refreshToken,
        })
      } catch (error) {
        console.error('Logout error:', error)
      }
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
  },

  getMe: async (): Promise<User> => {
    const response = await apiClient.get('/auth/me/')
    return response.data
  },

  updateMe: async (data: Partial<User>): Promise<User> => {
    const response = await apiClient.patch('/auth/me/', data)
    return response.data
  },

  changePassword: async (oldPassword: string, newPassword: string, newPassword2: string): Promise<void> => {
    await apiClient.post('/auth/change-password/', {
      old_password: oldPassword,
      new_password: newPassword,
      new_password2: newPassword2,
    })
  },
}

