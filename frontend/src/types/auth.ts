export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  role: string
  city?: {
    id: number
    name: string
  }
  city_id?: number
  phone_number?: string
  date_joined: string
}

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

