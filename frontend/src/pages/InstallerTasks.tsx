import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useComplaintsStore } from '../store/complaintsStore'
import { useAuthStore } from '../store/authStore'
import { ComplaintFilters } from '../types/complaints'
import Button from '../components/common/Button'

const InstallerTasks = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { complaints, isLoading, fetchComplaints, filters, setFilters } = useComplaintsStore()
  const [localFilters, setLocalFilters] = useState<ComplaintFilters>(filters)
  const [excludeClosed, setExcludeClosed] = useState(true)

  useEffect(() => {
    // Обработка параметров URL для монтажника
    const filter = searchParams.get('filter')
    const excludeClosedParam = searchParams.get('exclude_closed')
    
    const urlFilters: ComplaintFilters = {
      exclude_closed: excludeClosedParam !== '0' && excludeClosedParam !== 'false',
      ordering: '-created_at',
    }
    
    // Для монтажника НЕ используем my_orders, так как базовый фильтр в API уже правильный
    // (Q(installer_assigned=user) | Q(initiator=user))
    // my_orders перезаписывает базовый фильтр и оставляет только installer_assigned=user
    
    if (filter) {
      // Обработка фильтров для монтажника (как в Django installer_planning)
      if (filter === 'needs_planning') {
        // В Django: status__in=['waiting_installer_date', 'needs_planning', 'installer_not_planned']
        // Используем needs_planning параметр, но он может перезаписать базовый фильтр
        // Поэтому лучше использовать статусы напрямую
        urlFilters.needs_planning = true
      } else if (filter === 'planned') {
        // В Django: status__in=['installation_planned', 'both_planned']
        urlFilters.status = 'installation_planned'
      } else if (filter === 'completed') {
        // В Django: status__in=['under_sm_review', 'completed']
        // API не поддерживает несколько статусов, используем один
        urlFilters.status = 'under_sm_review'
        urlFilters.exclude_closed = false
      } else if (filter === 'closed') {
        urlFilters.status = 'closed'
        urlFilters.exclude_closed = false
      }
    } else {
      // По умолчанию исключаем закрытые и выполненные рекламации
      if (excludeClosedParam !== '0' && excludeClosedParam !== 'false') {
        urlFilters.exclude_closed = true
      }
    }
    
    setExcludeClosed(urlFilters.exclude_closed || false)
    setFilters(urlFilters)
    setLocalFilters(urlFilters)
    fetchComplaints(urlFilters)
  }, [searchParams])


  const getStatusBadge = (complaint: any) => {
    const status = complaint.status
    const statusDisplay = complaint.status_display

    if (['waiting_installer_date', 'needs_planning'].includes(status)) {
      return (
        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 border border-red-200">
          Нужно запланировать
        </span>
      )
    } else if (status === 'installer_not_planned') {
      return (
        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-600 text-white border-2 border-red-800 animate-pulse">
          ⚠️ ПРОСРОЧКА! Не запланировано
        </span>
      )
    } else if (status === 'installation_planned') {
      return (
        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
          Запланирован
        </span>
      )
    } else if (status === 'under_sm_review') {
      return (
        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
          На проверке у СМ
        </span>
      )
    } else if (status === 'completed') {
      return (
        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
          Завершена
        </span>
      )
    } else {
      return (
        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
          {statusDisplay}
        </span>
      )
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen py-8 px-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Заголовок страницы */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Мои задачи</h1>
          <p className="text-sm text-gray-600 mt-1">Список назначенных вам монтажных работ</p>
        </div>

        {/* Статистика для монтажника */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Link
            to="/installer/planning"
            className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">В работе</p>
              </div>
            </div>
          </Link>

          <Link
            to="/installer/planning?filter=needs_planning"
            className="bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl shadow-lg p-6 border border-red-200 hover:shadow-xl transition-all transform hover:scale-105"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-white">Нужно запланировать</p>
              </div>
            </div>
          </Link>

          <Link
            to="/installer/planning?filter=planned"
            className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-12 w-12 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Запланировано</p>
              </div>
            </div>
          </Link>

          <Link
            to="/installer/planning?filter=completed"
            className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-12 w-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Завершено</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Фильтры */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-100 p-6 mb-6">
          <div className="flex flex-wrap gap-2 items-center">
            <label className="inline-flex items-center px-4 py-2 bg-purple-50 text-purple-700 rounded-xl cursor-pointer hover:bg-purple-100 transition-colors">
              <input
                type="checkbox"
                checked={excludeClosed}
                onChange={(e) => {
                  const newExcludeClosed = e.target.checked
                  const params = new URLSearchParams(searchParams)
                  params.set('exclude_closed', newExcludeClosed ? '1' : '0')
                  navigate(`/installer/planning?${params.toString()}`)
                }}
                className="mr-2"
              />
              Кроме завершенных
            </label>
            <Link
              to="/installer/planning"
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors"
            >
              Сбросить
            </Link>
          </div>
        </div>

        {/* Список задач */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
          {complaints.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Рекламация</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Клиент / Адрес</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата монтажа</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {complaints.map((complaint: any) => (
                    <tr key={complaint.id} className="hover:bg-gray-50 transition-colors">
                      <td
                        className="px-6 py-4 whitespace-nowrap cursor-pointer"
                        onClick={() => navigate(`/complaints/${complaint.id}`)}
                      >
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-blue-800">#{complaint.id}</span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{complaint.order_number}</div>
                            <div className="text-sm text-gray-500">
                              {new Date(complaint.created_at).toLocaleDateString('ru-RU')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td
                        className="px-6 py-4 cursor-pointer"
                        onClick={() => navigate(`/complaints/${complaint.id}`)}
                      >
                        <div className="text-sm font-medium text-gray-900">{complaint.client_name}</div>
                        <div className="text-sm text-gray-500">{complaint.address}</div>
                        <div className="text-sm text-gray-500">{complaint.contact_phone}</div>
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap cursor-pointer"
                        onClick={() => navigate(`/complaints/${complaint.id}`)}
                      >
                        {getStatusBadge(complaint)}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap cursor-pointer"
                        onClick={() => navigate(`/complaints/${complaint.id}`)}
                      >
                        {complaint.planned_installation_date ? (
                          <>
                            <div className="text-sm font-medium text-gray-900">
                              {new Date(complaint.planned_installation_date).toLocaleDateString('ru-RU')}
                            </div>
                            <div className="text-sm text-gray-500">
                              {new Date(complaint.planned_installation_date).toLocaleTimeString('ru-RU', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">Не назначена</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center space-x-2">
                          <Button
                            onClick={() => navigate(`/complaints/${complaint.id}`)}
                            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
                          >
                            Открыть
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Нет задач</h3>
              <p className="mt-1 text-sm text-gray-500">У вас пока нет назначенных монтажных работ</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default InstallerTasks

