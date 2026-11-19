export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  role: string
  // СМ, который делает только замеры: без рекламаций, отгрузки и возвратов
  measurements_only?: boolean
  can_manage_service?: boolean
  city?: {
    id: number
    name: string
  }
  city_id?: number
  phone_number?: string
  salon?: {
    id: number
    name: string
    city_name?: string
  }
  salon_id?: number
  date_joined: string
}

export const canManageService = (user?: User | null) =>
  user?.role === 'service_manager' || user?.can_manage_service === true

export const hasManagerPermissions = (user?: User | null) =>
  user?.role === 'manager' || user?.role === 'group_leader'

export interface LoginResponse {
  access: string
  refresh: string
  user?: User
}

export interface RegisterData {
  username: string
  email: string
  password: string
  password2: string
  first_name?: string
  last_name?: string
  role?: string
  city_id?: number
  phone_number?: string
}

export interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
}

export interface City {
  id: number
  name: string
}

