import { ReactNode, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

interface ProtectedRouteProps {
  children: ReactNode
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore()
  const hasCheckedAuth = useRef(false)
  const isChecking = useRef(false)

  useEffect(() => {
    // Проверяем наличие токена
    const token = localStorage.getItem('access_token')
    
    // Если нет токена, сразу не авторизован
    if (!token) {
      hasCheckedAuth.current = true
      return
    }

    // Если уже авторизован, не проверяем повторно
    if (isAuthenticated) {
      hasCheckedAuth.current = true
      isChecking.current = false
      return
    }

    // Если уже проверяем, не запускаем еще одну проверку
    if (isChecking.current || isLoading) {
      return
    }

    // Если не авторизован и еще не проверяли - проверяем
    if (!hasCheckedAuth.current) {
      hasCheckedAuth.current = true
      isChecking.current = true
      console.log('[ProtectedRoute] Вызываем checkAuth()')
      checkAuth().finally(() => {
        isChecking.current = false
      })
    }
  }, [isAuthenticated, isLoading, checkAuth])

  // Показываем загрузку, пока проверяем или загружаем
  if (isLoading || (!isAuthenticated && hasCheckedAuth.current === false)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Если не авторизован - редирект на логин
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Авторизован - показываем содержимое
  return <>{children}</>
}

export default ProtectedRoute

