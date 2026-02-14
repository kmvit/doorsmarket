import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { referencesAPI } from '../api/references'
import { User } from '../types/auth'
import { ROLE_DISPLAY, ROLES } from '../utils/constants'

const ROLES_FOR_FILTER = [
  { value: '', label: 'Все роли' },
  { value: ROLES.ADMIN, label: ROLE_DISPLAY[ROLES.ADMIN] },
  { value: ROLES.LEADER, label: ROLE_DISPLAY[ROLES.LEADER] },
  { value: ROLES.SERVICE_MANAGER, label: ROLE_DISPLAY[ROLES.SERVICE_MANAGER] },
  { value: ROLES.MANAGER, label: ROLE_DISPLAY[ROLES.MANAGER] },
  { value: ROLES.INSTALLER, label: ROLE_DISPLAY[ROLES.INSTALLER] },
  { value: ROLES.COMPLAINT_DEPARTMENT, label: ROLE_DISPLAY[ROLES.COMPLAINT_DEPARTMENT] },
]

const Users = () => {
  const { user } = useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string>('')

  const canAccess = user?.role === 'admin' || user?.role === 'leader'

  const loadUsers = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const role = roleFilter || undefined
      const data = await referencesAPI.getAllUsers(role)
      setUsers(data || [])
    } catch (err: any) {
      console.error('Ошибка загрузки пользователей:', err)
      setError(err.message || 'Не удалось загрузить список пользователей')
      setUsers([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [roleFilter])

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  const getFullName = (user: User) => {
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`.trim()
    }
    return user.username
  }

  if (!canAccess) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-6 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Доступ ограничен</h2>
          <p>Просмотр списка пользователей доступен только администраторам и руководителям подразделения.</p>
        </div>
      </div>
    )
  }

  if (isLoading && users.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Пользователи</h1>
        <p className="text-gray-600">
          Список пользователей системы
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Фильтр по роли */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Фильтр по роли</label>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="block w-full max-w-xs rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
        >
          {ROLES_FOR_FILTER.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Список пользователей */}
      {users.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-6xl mb-4">👥</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Нет пользователей</h2>
          <p className="text-gray-600">
            {roleFilter
              ? 'Нет пользователей с выбранной ролью'
              : 'В системе пока нет зарегистрированных пользователей'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Пользователь
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Роль
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Город
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Контакты
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Регистрация
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{getFullName(user)}</div>
                      <div className="text-sm text-gray-500">{user.username}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-primary-50 text-primary-700">
                        {ROLE_DISPLAY[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.city?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div>{user.email}</div>
                      {user.phone_number && (
                        <div className="text-gray-500">{user.phone_number}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(user.date_joined)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default Users
