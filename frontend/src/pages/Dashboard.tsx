import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import apiClient from '../api/client'

interface DashboardStat {
  key: string
  label: string
  count: number
  url_param: string | null
  url: string
}

const Dashboard = () => {
  const { user } = useAuthStore()
  const [stats, setStats] = useState<DashboardStat[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      // Проверяем наличие токена и аутентификации
      const token = localStorage.getItem('access_token')
      if (!token || !user) {
        console.log('[Dashboard] Нет токена или пользователя, пропускаем загрузку статистики')
        setIsLoading(false)
        return
      }

      console.log('[Dashboard] Загружаем статистику...')
      try {
        const response = await apiClient.get('/dashboard/stats/')
        console.log('[Dashboard] Статистика получена:', response.data)
        if (response.data && response.data.stats && Array.isArray(response.data.stats)) {
        setStats(response.data.stats)
          console.log('[Dashboard] Установлено статистик:', response.data.stats.length)
        } else {
          console.warn('[Dashboard] Неверный формат данных статистики:', response.data)
          setStats([])
        }
      } catch (error: any) {
        console.error('[Dashboard] Ошибка загрузки статистики:', error)
        setStats([])
        // Если ошибка авторизации, не пытаемся загружать снова
        if (error.response?.status === 401 || error.message?.includes('авторизация') || error.message?.includes('401')) {
          console.error('[Dashboard] Ошибка авторизации при загрузке статистики')
          return
        }
      } finally {
        setIsLoading(false)
      }
    }

    // Загружаем статистику только если пользователь авторизован
    if (user) {
    fetchStats()
    }
  }, [user])

  const getRoleDisplay = (role: string) => {
    const roles: Record<string, string> = {
      admin: 'Администратор',
      service_manager: 'Сервис-менеджер',
      manager: 'Менеджер',
      installer: 'Монтажник',
      complaint_department: 'Отдел рекламаций',
      leader: 'Руководитель подразделения',
    }
    return roles[role] || role
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-6xl mx-auto animate-fadeIn">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Добро пожаловать, {user?.first_name && user?.last_name
              ? `${user.first_name} ${user.last_name}`
              : user?.username}!
          </h1>
          {user?.city && (
            <p className="mt-2 text-gray-600">
              Город: <span className="font-semibold text-primary-600">{user.city.name}</span>
            </p>
          )}
          {user?.role && (
            <p className="mt-1 text-gray-600">
              Роль: <span className="font-semibold text-primary-600">{getRoleDisplay(user.role)}</span>
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : stats.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat) => (
              <Link
                key={stat.key}
                to={stat.url}
                className={`group relative overflow-hidden rounded-2xl border p-6 shadow-lg hover:shadow-2xl transition-all duration-300 ${
                  stat.key !== 'in_work' && stat.key !== 'completed' && stat.count > 0
                    ? 'bg-red-50/80 border-red-200'
                    : 'bg-white/80 border-gray-100'
                } backdrop-blur-sm`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        stat.key !== 'in_work' && stat.key !== 'completed' && stat.count > 0
                          ? 'text-red-700'
                          : 'text-gray-500'
                      }`}
                    >
                      {stat.label}
                    </p>
                    <p
                      className={`mt-3 text-3xl font-bold group-hover:text-primary-600 transition-colors ${
                        stat.key !== 'in_work' && stat.key !== 'completed' && stat.count > 0
                          ? 'text-red-900'
                          : 'text-gray-900'
                      }`}
                    >
                      {stat.count}
                    </p>
                  </div>
                  <div
                    className={`h-12 w-12 flex items-center justify-center rounded-xl group-hover:scale-110 transition-transform ${
                      stat.key !== 'in_work' && stat.key !== 'completed' && stat.count > 0
                        ? 'bg-gradient-to-br from-red-500 to-red-600'
                        : 'bg-gradient-to-br from-primary-500 to-cyan-500'
                    } text-white`}
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-100 p-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Быстрые действия</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              to="/complaints"
              className="flex items-center p-4 bg-gradient-to-r from-primary-50 to-cyan-50 rounded-xl hover:shadow-lg transition-all duration-200 group"
            >
              <div className="flex-shrink-0">
                <div className="h-12 w-12 bg-gradient-to-br from-primary-500 to-cyan-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-900">Список рекламаций</p>
                <p className="text-xs text-gray-600">Просмотр всех заявок</p>
              </div>
            </Link>

            <Link
              to="/complaints/create"
              className="flex items-center p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl hover:shadow-lg transition-all duration-200 group"
            >
              <div className="flex-shrink-0">
                <div className="h-12 w-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-900">Создать рекламацию</p>
                <p className="text-xs text-gray-600">Новая заявка</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard

