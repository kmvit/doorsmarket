import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useComplaintsStore } from '../../store/complaintsStore'
import { useAuthStore } from '../../store/authStore'
import { ComplaintFilters } from '../../types/complaints'
import { referencesAPI } from '../../api/references'
import { ComplaintReason } from '../../types/complaints'
import { City } from '../../types/auth'
import apiClient from '../../api/client'
import Button from '../../components/common/Button'

const ComplaintList = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { complaints, isLoading, error, fetchComplaints, filters, setFilters, clearFilters } = useComplaintsStore()
  const [reasons, setReasons] = useState<ComplaintReason[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [localFilters, setLocalFilters] = useState<ComplaintFilters>(filters)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    // Проверяем наличие токена перед загрузкой данных
    const token = localStorage.getItem('access_token')
    if (!token) {
      return
    }

    // Обработка параметров URL
    const myTasks = searchParams.get('my_tasks')
    const needsPlanning = searchParams.get('needs_planning')
    const filter = searchParams.get('filter')
    
    const urlFilters: ComplaintFilters = {
      exclude_closed: true,
      ordering: '-created_at',
    } as any // Используем any, так как my_tasks не в типе ComplaintFilters
    
    if (myTasks) {
      // Передаем my_tasks в API, который обработает его самостоятельно
      ;(urlFilters as any).my_tasks = myTasks
      
      // API обрабатывает my_tasks самостоятельно, но для некоторых ролей нужны дополнительные фильтры
      if (myTasks === 'in_work') {
        urlFilters.exclude_closed = true
        // Для менеджера применяем my_orders
        if (user?.role === 'manager') {
          urlFilters.my_orders = true
        }
        // Для СМ не применяем my_orders при in_work (API сам обработает)
      } else if (myTasks === 'in_progress') {
        if (user?.role === 'manager') {
          urlFilters.my_orders = true
        }
      } else if (myTasks === 'on_warehouse') {
        if (user?.role === 'manager') {
          urlFilters.my_orders = true
        }
      }
      // Для остальных my_tasks (new, review, overdue и т.д.) API обрабатывает самостоятельно
      // Не устанавливаем status, так как API знает правильные фильтры для каждой роли
    }
    
    if (needsPlanning === '1') {
      urlFilters.needs_planning = true
    }
    
    if (filter) {
      // Обработка фильтров для монтажника (как в Django installer_planning)
      if (filter === 'needs_planning') {
        urlFilters.needs_planning = true
      } else if (filter === 'planned') {
        urlFilters.status = 'installation_planned'
      } else if (filter === 'completed') {
        urlFilters.status = 'under_sm_review' // В Django это ['under_sm_review', 'completed']
        urlFilters.exclude_closed = false
      } else if (filter === 'closed') {
        urlFilters.status = 'closed'
        urlFilters.exclude_closed = false
      }
    }
    
    // Применяем фильтры из URL
    if (myTasks || needsPlanning || filter) {
      setFilters(urlFilters)
      setLocalFilters(urlFilters)
      fetchComplaints(urlFilters)
    } else {
      fetchComplaints()
    }
    
    loadReferences()
  }, [searchParams])

  const loadReferences = async () => {
    try {
      const promises: Promise<any>[] = [
        referencesAPI.getComplaintReasons(),
      ]
      
      // Загружаем города только для админа и ОР
      if (user?.role === 'admin' || user?.role === 'complaint_department') {
        promises.push(apiClient.get('/cities/').then(r => r.data))
      }
      
      const results = await Promise.all(promises)
      setReasons(results[0])
      if (user?.role === 'admin' || user?.role === 'complaint_department') {
        setCities(results[1] || [])
      }
    } catch (error) {
      console.error('Error loading references:', error)
    }
  }

  const handleFilterChange = (key: keyof ComplaintFilters, value: any) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleApplyFilters = () => {
    setFilters(localFilters)
    fetchComplaints(localFilters)
  }

  const handleResetFilters = () => {
    clearFilters()
    setLocalFilters({
      exclude_closed: true,
      ordering: '-created_at',
    })
    fetchComplaints()
  }

  const getStatusBadge = (complaint: any) => {
    const status = complaint.status
    const statusDisplay = complaint.status_display

    // Просроченные статусы - красный
    if (['installer_not_planned', 'factory_response_overdue', 'factory_rejected', 'factory_dispute', 
         'sm_response_overdue', 'shipping_overdue'].includes(status)) {
      return (
        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 border border-red-200">
          {statusDisplay}
        </span>
      )
    }

    // Оба запланированы
    if (status === 'both_planned') {
      return (
        <div className="text-xs">
          <div className="font-semibold text-gray-800">
            Отгрузка {complaint.planned_shipping_date ? new Date(complaint.planned_shipping_date).toLocaleDateString('ru-RU') : '—'}, 
            монтаж {complaint.planned_installation_date ? new Date(complaint.planned_installation_date).toLocaleDateString('ru-RU') : '—'}
            {complaint.installer_assigned && `, монтажник ${complaint.installer_assigned.first_name || complaint.installer_assigned.username}`}
          </div>
        </div>
      )
    }

    // Только монтаж запланирован
    if (status === 'installation_planned') {
      return (
        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
          Монтаж запланирован на {complaint.planned_installation_date ? new Date(complaint.planned_installation_date).toLocaleDateString('ru-RU') : '—'}
          {complaint.installer_assigned && `, монтажник ${complaint.installer_assigned.first_name || complaint.installer_assigned.username}`}
        </span>
      )
    }

    // Только отгрузка запланирована
    if (status === 'shipping_planned') {
      return (
        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">
          Отгрузка запланирована на {complaint.planned_shipping_date ? new Date(complaint.planned_shipping_date).toLocaleDateString('ru-RU') : '—'}
        </span>
      )
    }

    // В производстве
    if (status === 'in_production') {
      return (
        <div className="text-xs">
          <div className="font-semibold text-purple-800">Заказ в производстве</div>
          {complaint.production_deadline && (
            <div className="text-gray-600 mt-1">
              Срок готовности: {new Date(complaint.production_deadline).toLocaleDateString('ru-RU')}
            </div>
          )}
        </div>
      )
    }

    // Просроченные статусы (красные)
    if (status === 'installer_overdue') {
      return (
        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-600 text-white border-2 border-red-800 animate-pulse">
          ⚠️ ПРОСРОЧЕНА! {statusDisplay}
        </span>
      )
    }

    // Остальные статусы
    const statusColors: Record<string, string> = {
      new: 'bg-green-100 text-green-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      factory_approved: 'bg-green-100 text-green-800',
      resolved: 'bg-purple-100 text-purple-800',
      closed: 'bg-gray-100 text-gray-800',
      factory_response_overdue: 'bg-red-100 text-red-800',
      sm_response_overdue: 'bg-red-100 text-red-800',
      shipping_overdue: 'bg-red-100 text-red-800',
    }

    const colorClass = statusColors[status] || 'bg-blue-100 text-blue-800'

    return (
      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClass}`}>
        {status === 'factory_approved' ? `✓ ${statusDisplay}` : statusDisplay}
      </span>
    )
  }

  const truncateText = (text: string, maxWords: number) => {
    const words = text.split(' ')
    if (words.length <= maxWords) return text
    return words.slice(0, maxWords).join(' ') + '...'
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Заголовок */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Список рекламаций</h1>
            <p className="text-sm text-gray-600 mt-1">Управление заявками на рекламацию</p>
          </div>
          <Link to="/complaints/create">
            <Button>
              <svg className="h-5 w-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Создать рекламацию
            </Button>
          </Link>
        </div>

        {/* Фильтры и поиск */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 mb-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Фильтры</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? 'Скрыть фильтры' : 'Показать фильтры'}
            </Button>
          </div>

          {showFilters && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Поиск</label>
                <input
                  type="text"
                  value={localFilters.search || ''}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  placeholder="Номер заказа, клиент, адрес..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Статус</label>
                <select
                  value={localFilters.status || ''}
                  onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">Все статусы</option>
                  <option value="new">Новая</option>
                  <option value="in_progress">В работе</option>
                  <option value="completed">Выполнена</option>
                  <option value="in_production">В производстве</option>
                  <option value="on_warehouse">На складе</option>
                  <option value="resolved">Решена</option>
                  <option value="closed">Закрыта</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Причина</label>
                <select
                  value={localFilters.reason || ''}
                  onChange={(e) => handleFilterChange('reason', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">Все причины</option>
                  {reasons.map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Фильтр по городу только для админа и ОР */}
            {(user?.role === 'admin' || user?.role === 'complaint_department') && cities.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Город</label>
                  <select
                    value={localFilters.city || ''}
                    onChange={(e) => handleFilterChange('city', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">Все города</option>
                    {cities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center px-4 py-2 bg-purple-50 text-purple-700 rounded-xl cursor-pointer hover:bg-purple-100 transition-colors">
                <input
                  type="checkbox"
                  checked={localFilters.exclude_closed !== false}
                  onChange={(e) => handleFilterChange('exclude_closed', e.target.checked)}
                  className="mr-2"
                />
                Кроме завершенных
              </label>
              <button
                onClick={handleApplyFilters}
                className="px-6 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
              >
                Применить фильтры
              </button>
              <button
                onClick={handleResetFilters}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors"
              >
                Сбросить
              </button>
              <label className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors">
                <input
                  type="checkbox"
                  checked={localFilters.my_complaints || false}
                  onChange={(e) => handleFilterChange('my_complaints', e.target.checked || undefined)}
                  className="mr-2"
                />
                Созданные мной
              </label>
              {user?.role !== 'service_manager' && (
                <label className="inline-flex items-center px-4 py-2 bg-green-50 text-green-700 rounded-xl cursor-pointer hover:bg-green-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={localFilters.my_orders || false}
                    onChange={(e) => handleFilterChange('my_orders', e.target.checked || undefined)}
                    className="mr-2"
                  />
                  Все по моим заказам
                </label>
              )}
            </div>
            </div>
          )}
        </div>

        {/* Таблица рекламаций */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
          {error && (
            <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
              <p className="font-medium">{error}</p>
            </div>
          )}

          {isLoading && complaints.length === 0 ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            </div>
          ) : complaints.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Рекламации не найдены</h3>
              <p className="mt-1 text-sm text-gray-500">Попробуйте изменить параметры фильтрации</p>
              <div className="mt-6">
                <Link
                  to="/complaints/create"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-xl text-white bg-primary-600 hover:bg-primary-700"
                >
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Создать первую рекламацию
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">№</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата создания</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Номер заказа</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Инициатор</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Менеджер</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Клиент</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Адрес</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Контактное лицо</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Телефон</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {complaints.map((complaint) => (
                    <tr
                      key={complaint.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/complaints/${complaint.id}`)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        #{complaint.id}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {new Date(complaint.created_at).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {complaint.order_number}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {complaint.initiator.first_name && complaint.initiator.last_name
                          ? `${complaint.initiator.first_name} ${complaint.initiator.last_name}`
                          : complaint.initiator.username}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {complaint.manager ? (
                          complaint.manager.first_name && complaint.manager.last_name
                            ? `${complaint.manager.first_name} ${complaint.manager.last_name}`
                            : complaint.manager.username
                        ) : (
                          <span className="text-orange-600 font-medium">Не назначен</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {complaint.client_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {truncateText(complaint.address || '', 8)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {complaint.contact_person}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {complaint.contact_phone}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(complaint)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ComplaintList
