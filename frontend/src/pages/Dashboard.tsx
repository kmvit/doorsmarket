import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import apiClient from '../api/client'
import { authAPI } from '../api/auth'
import { remindersAPI, ordersAPI } from '../api/orders'
import { measurementsAPI } from '../api/measurements'
import { OrderFolderCount, MeasurementFolderCount } from '../types/orders'

interface DashboardStat {
  key: string
  label: string
  count: number
  url_param: string | null
  url: string
}

// Папки, показываемые в «Наработках» (пайплайн замера + просрочки).
// Производственные/отгрузочные статусы в наработках не выводим.
const NARABOTKI_FOLDERS = [
  'created', 'measurement_requested', 'measurement_scheduled',
  'measurement_done', 'measurement_processed',
  'measurement_not_planned', 'measurement_not_done', 'measurement_not_processed',
]

// Карточка папки (наработки заказов / замеры) для Dashboard (Фаза 6)
const FolderCard = ({ to, label, count, overdue }: { to: string; label: string; count: number; overdue?: boolean }) => (
  <Link
    to={to}
    className={`group rounded-xl border p-4 shadow-sm hover:shadow-md transition-all ${
      overdue && count > 0 ? 'bg-red-50 border-red-200' : 'bg-white/80 border-gray-100'
    }`}
  >
    <p className={`text-xs font-medium ${overdue && count > 0 ? 'text-red-700' : 'text-gray-500'}`}>{label}</p>
    <p className={`mt-1 text-2xl font-bold ${overdue && count > 0 ? 'text-red-900' : 'text-gray-900 group-hover:text-primary-600'} transition-colors`}>
      {count}
    </p>
  </Link>
)

const Dashboard = () => {
  const { user, setUser } = useAuthStore()
  const [stats, setStats] = useState<DashboardStat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditingPhone, setIsEditingPhone] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '')
  const [isSavingPhone, setIsSavingPhone] = useState(false)
  const [reminderTodayCount, setReminderTodayCount] = useState<number | null>(null)
  const [reminderTomorrowCount, setReminderTomorrowCount] = useState<number | null>(null)
  const [reminderOverdueCount, setReminderOverdueCount] = useState<number | null>(null)
  const [orderFolders, setOrderFolders] = useState<OrderFolderCount[]>([])
  const [measFolders, setMeasFolders] = useState<MeasurementFolderCount[]>([])

  const showWorkshopCard = user && ['manager', 'service_manager', 'leader', 'admin'].includes(user.role)
  const isManager = user?.role === 'manager'
  const isSM = user?.role === 'service_manager'

  // Папки Фазы 6: менеджеру — заказы, СМ — замеры + просроченные заказы
  useEffect(() => {
    if (isManager) {
      ordersAPI.getFolderCounts({ mine: true }).then(setOrderFolders).catch(() => {})
    } else if (isSM) {
      measurementsAPI.getFolderCounts({ mine: true }).then(setMeasFolders).catch(() => {})
      ordersAPI.getFolderCounts().then(setOrderFolders).catch(() => {})
    }
  }, [isManager, isSM])

  useEffect(() => {
    if (!showWorkshopCard) return
    const load = async () => {
      try {
        const [today, tomorrow, overdue] = await Promise.all([
          remindersAPI.list({ today: true, mine: true }).catch(() => []),
          remindersAPI.list({ tomorrow: true, mine: true }).catch(() => []),
          remindersAPI.list({ overdue: true, mine: true }).catch(() => []),
        ])
        setReminderTodayCount(today.length)
        setReminderTomorrowCount(tomorrow.length)
        setReminderOverdueCount(overdue.length)
      } catch {}
    }
    load()
  }, [showWorkshopCard])

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

  // Обновляем номер телефона при изменении пользователя
  useEffect(() => {
    if (user?.phone_number !== undefined) {
      setPhoneNumber(user.phone_number || '')
    }
  }, [user?.phone_number])

  const handleSavePhone = async () => {
    setIsSavingPhone(true)
    try {
      const phoneValue = phoneNumber.trim() || undefined
      const updatedUser = await authAPI.updateMe({ phone_number: phoneValue })
      setUser(updatedUser)
      setIsEditingPhone(false)
    } catch (error: any) {
      alert(error.response?.data?.phone_number?.[0] || error.response?.data?.detail || 'Ошибка при сохранении номера телефона')
    } finally {
      setIsSavingPhone(false)
    }
  }

  const handleCancelPhoneEdit = () => {
    setPhoneNumber(user?.phone_number || '')
    setIsEditingPhone(false)
  }

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
        {/* Карточка "Наработки" — только для менеджеров (у СМ свой раздел «Замеры») */}
        {showWorkshopCard && !isSM && (
          <Link
            to="/workshop"
            className="block mb-6 bg-gradient-to-r from-primary-600 to-cyan-600 text-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Наработки</h2>
                <p className="text-sm opacity-90 mt-0.5">
                  {reminderTodayCount !== null ? `${reminderTodayCount} на сегодня` : 'загрузка...'}
                  {reminderOverdueCount !== null && reminderOverdueCount > 0 && (
                    <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-medium">
                      {reminderOverdueCount} просрочено
                    </span>
                  )}
                </p>
              </div>
              <svg className="h-8 w-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
          </Link>
        )}

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
          <div className="mt-3">
            <div className="flex items-center gap-3">
              <p className="text-gray-600">
                Номер телефона:{' '}
                <span className="font-semibold text-gray-900">
                  {user?.phone_number || 'Не указан'}
                </span>
              </p>
              <button
                onClick={() => isEditingPhone ? handleCancelPhoneEdit() : setIsEditingPhone(true)}
                className="text-primary-600 hover:text-primary-700 text-sm font-medium transition-colors"
              >
                {isEditingPhone ? 'Отмена' : 'Изменить'}
              </button>
            </div>
            {isEditingPhone && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+7XXXXXXXXXX"
                  maxLength={20}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  onClick={handleSavePhone}
                  disabled={isSavingPhone}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingPhone ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Фаза 6: кнопки задач на сегодня / завтра (наработки-напоминания) */}
        {(isManager || isSM) && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Link
              to="/workshop?reminder=today"
              className="rounded-2xl p-4 bg-gradient-to-br from-primary-600 to-cyan-600 text-white shadow-md hover:shadow-lg transition-all"
            >
              <p className="text-sm opacity-90">Задачи на сегодня</p>
              <p className="mt-1 text-3xl font-bold">{reminderTodayCount ?? '—'}</p>
            </Link>
            <Link
              to="/workshop?reminder=tomorrow"
              className="rounded-2xl p-4 bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg transition-all"
            >
              <p className="text-sm opacity-90">Задачи на завтра</p>
              <p className="mt-1 text-3xl font-bold">{reminderTomorrowCount ?? '—'}</p>
            </Link>
          </div>
        )}

        {/* Фаза 6: Наработки менеджера — папки пайплайна замера + просрочки */}
        {isManager && orderFolders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Наработки</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {orderFolders
                .filter((f) => NARABOTKI_FOLDERS.includes(f.folder))
                .map((f) => (
                  <FolderCard
                    key={f.folder}
                    to={`/orders?folder=${f.folder}`}
                    label={f.label}
                    count={f.count}
                    overdue={f.overdue}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Фаза 6: Замеры СМ — «Назначить замер» + те же папки заказов (включая «Заявка на замер») */}
        {isSM && (measFolders.length > 0 || orderFolders.length > 0) && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Замеры</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {measFolders.filter((f) => f.folder === 'unscheduled').map((f) => (
                <FolderCard
                  key={`m-${f.folder}`}
                  to="/measurements?folder=unscheduled"
                  label="Назначить замер"
                  count={f.count}
                />
              ))}
              {orderFolders
                .filter((f) => NARABOTKI_FOLDERS.includes(f.folder))
                .map((f) => (
                  <FolderCard
                    key={f.folder}
                    to={`/orders?folder=${f.folder}`}
                    label={f.label}
                    count={f.count}
                    overdue={f.overdue}
                  />
                ))}
            </div>
          </div>
        )}

        {(isManager || isSM) && stats.length > 0 && (
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Рекламации</h2>
        )}

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

