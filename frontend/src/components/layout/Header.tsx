import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { ROLE_DISPLAY } from '../../utils/constants'
import apiClient from '../../api/client'

const Header = () => {
  const { user, logout, isAuthenticated, isLoading } = useAuthStore()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

  // Загрузка количества непрочитанных уведомлений
  useEffect(() => {
    // Не делаем запрос, пока идет загрузка или пользователь не авторизован
    if (isLoading || !isAuthenticated || !user) {
      setUnreadNotificationsCount(0)
      return
    }

    // Проверяем наличие токена
    const token = localStorage.getItem('access_token')
    if (!token) {
      setUnreadNotificationsCount(0)
      return
    }

    // Проверяем, не было ли уже ошибки авторизации для уведомлений
    const notificationAuthErrorKey = 'notification_auth_error'
    const notificationTokenExpiredKey = 'notification_token_expired'
    const hasAuthError = sessionStorage.getItem(notificationAuthErrorKey) === 'true'
    const tokenExpired = sessionStorage.getItem(notificationTokenExpiredKey) === 'true'
    
    if (hasAuthError || tokenExpired) {
      // Если была ошибка авторизации или токены истекли, не делаем запрос
      setUnreadNotificationsCount(0)
      return
    }

    let cancelled = false

    // Делаем запрос после того, как проверка аутентификации завершена
    const loadNotifications = async () => {
      if (cancelled) return

      try {
        const response = await apiClient.get('/notifications/?is_read=false')
        if (cancelled) return
        
        // Очищаем флаги ошибки авторизации при успешном запросе
        sessionStorage.removeItem(notificationAuthErrorKey)
        sessionStorage.removeItem('notification_token_expired')
        
        setUnreadNotificationsCount(Array.isArray(response.data) ? response.data.length : (response.data.count || 0))
      } catch (error: any) {
        if (cancelled) return
        
        // Игнорируем ошибки авторизации - они обрабатываются интерцептором
        if (error.response?.status === 401 || error.response?.status === 302 || error.message?.includes('авторизация')) {
          // Устанавливаем флаг, чтобы не делать повторные запросы
          sessionStorage.setItem(notificationAuthErrorKey, 'true')
          setUnreadNotificationsCount(0)
          return
        }
      }
    }

    // Небольшая задержка, чтобы убедиться, что все инициализации завершены
    const timer = setTimeout(loadNotifications, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [user, isAuthenticated, isLoading])

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  const isActive = (path: string) => location.pathname === path

  // Не показываем Header, если пользователь не авторизован
  if (!isAuthenticated || !user) return null

  return (
    <nav className="relative z-20 bg-white/90 backdrop-blur-md shadow-lg border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Логотип и основная навигация */}
          <div className="flex">
            {/* Логотип */}
            <div className="flex-shrink-0 flex items-center">
              <Link to="/dashboard" className="flex items-center space-x-2 group">
                <div className="h-10 w-10 bg-gradient-to-br from-primary-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>
                <span className="text-xl font-bold text-gray-900 hidden lg:block">Marketing Doors</span>
              </Link>
            </div>

            {/* Навигационные ссылки (Desktop) */}
            <div className="hidden md:ml-8 md:flex md:space-x-2">
              <Link
                to="/dashboard"
                className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                  isActive('/dashboard')
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
                }`}
              >
                <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Главная
              </Link>

              {user.role !== 'installer' && (
                <Link
                  to="/complaints"
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                    isActive('/complaints') || location.pathname.startsWith('/complaints/')
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
                  }`}
                >
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Рекламации
                </Link>
              )}

              {(user.role === 'admin' || user.role === 'leader') && (
                <Link
                  to="/users"
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                    isActive('/users')
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
                  }`}
                >
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Пользователи
                </Link>
              )}

              {(user.role === 'manager' || user.role === 'service_manager') && (
                <Link
                  to="/shipping-registry"
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                    isActive('/shipping-registry')
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
                  }`}
                >
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  Реестр на отгрузку
                </Link>
              )}

              {user.role === 'manager' && (
                <Link
                  to="/manager/production"
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                    isActive('/manager/production')
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
                  }`}
                >
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  Производство
                </Link>
              )}

              {user.role === 'installer' && (
                <Link
                  to="/installer/planning"
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                    isActive('/installer/planning')
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
                  }`}
                >
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  Мои задачи
                </Link>
              )}

              {user.role === 'complaint_department' && (
                <Link
                  to="/or/factory-complaints"
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                    isActive('/or/factory-complaints')
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
                  }`}
                >
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Фабричные рекламации
                </Link>
              )}

              <Link
                to="/complaints/create"
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-cyan-600 hover:from-primary-700 hover:to-cyan-700 rounded-xl transition-all shadow-md"
              >
                <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Создать
              </Link>
            </div>
          </div>

          {/* Профиль, бургер и выход */}
          <div className="flex items-center space-x-2">
            {/* Информация о пользователе (Desktop) */}
            <div className="hidden md:flex items-center space-x-3">
              {/* Кнопка уведомлений */}
              <Link
                to="/notifications"
                className="relative inline-flex items-center justify-center p-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                title="Уведомления"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-1 right-1 inline-flex h-3 w-3 rounded-full bg-red-500 ring-2 ring-white"></span>
                )}
              </Link>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user.first_name && user.last_name
                    ? `${user.first_name} ${user.last_name}`
                    : user.username}
                </p>
                <p className="text-xs text-gray-600">{ROLE_DISPLAY[user.role] || user.role}</p>
              </div>
              <div className="h-10 w-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white font-bold">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>

            {/* Аватар (Mobile) */}
            <div className="md:hidden flex items-center space-x-2">
              <Link
                to="/notifications"
                className="relative inline-flex items-center justify-center p-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                title="Уведомления"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-1 right-1 inline-flex h-3 w-3 rounded-full bg-red-500 ring-2 ring-white"></span>
                )}
              </Link>
              <div className="h-10 w-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white font-bold">
                {user.username.slice(0, 2).toUpperCase()}
              </div>

              {/* Кнопка бургер-меню (Mobile) */}
              <button
                type="button"
                onClick={toggleMobileMenu}
                className="inline-flex items-center justify-center p-2 rounded-xl text-gray-700 hover:text-primary-600 hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 transition-all"
              >
                {mobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Мобильное меню (скрытое по умолчанию) */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-md border-t border-gray-200">
          <div className="px-4 pt-2 pb-3 space-y-1">
            {/* Информация о пользователе */}
            <div className="px-3 py-3 border-b border-gray-200 mb-2">
              <p className="text-sm font-medium text-gray-900">
                {user.first_name && user.last_name
                  ? `${user.first_name} ${user.last_name}`
                  : user.username}
              </p>
              <p className="text-xs text-gray-600">{ROLE_DISPLAY[user.role] || user.role}</p>
            </div>

            {/* Навигационные ссылки */}
            <Link
              to="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
            >
              <svg className="h-5 w-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Главная
            </Link>

            {user.role !== 'installer' && (
              <Link
                to="/complaints"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
              >
                <svg className="h-5 w-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Рекламации
              </Link>
            )}

            {(user.role === 'admin' || user.role === 'leader') && (
              <Link
                to="/users"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
              >
                <svg className="h-5 w-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Пользователи
              </Link>
            )}

            {(user.role === 'manager' || user.role === 'service_manager') && (
              <Link
                to="/shipping-registry"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
              >
                <svg className="h-5 w-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                Реестр на отгрузку
              </Link>
            )}

            {user.role === 'manager' && (
              <Link
                to="/manager/production"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
              >
                <svg className="h-5 w-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Производство
              </Link>
            )}

            {user.role === 'installer' && (
              <Link
                to="/installer/planning"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
              >
                <svg className="h-5 w-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Мои задачи
              </Link>
            )}

            {user.role === 'complaint_department' && (
              <Link
                to="/or/factory-complaints"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
              >
                <svg className="h-5 w-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Фабричные рекламации
              </Link>
            )}

            <Link
              to="/complaints/create"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center px-3 py-2 text-base font-medium text-white bg-gradient-to-r from-primary-600 to-cyan-600 hover:from-primary-700 hover:to-cyan-700 rounded-lg transition-all shadow-md"
            >
              <svg className="h-5 w-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Создать рекламацию
            </Link>

            {/* Выход */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-3 py-2 text-base font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all border-t border-gray-200 mt-2 pt-3"
            >
              <svg className="h-5 w-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Выйти
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}

export default Header
