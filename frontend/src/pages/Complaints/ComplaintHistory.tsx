import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useComplaintsStore } from '../../store/complaintsStore'
import { complaintsAPI } from '../../api/complaints'
import { ComplaintHistoryEvent } from '../../types/complaints'
import Button from '../../components/common/Button'

const COLOR_CLASSES: Record<string, string> = {
  blue: 'bg-gradient-to-br from-blue-500 to-blue-600',
  gray: 'bg-gradient-to-br from-gray-500 to-gray-600',
  yellow: 'bg-gradient-to-br from-yellow-500 to-yellow-600',
  purple: 'bg-gradient-to-br from-purple-500 to-purple-600',
  green: 'bg-gradient-to-br from-green-500 to-green-600',
  indigo: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
  orange: 'bg-gradient-to-br from-orange-500 to-orange-600',
}

const EventIcon = ({ icon }: { icon: string }) => {
  const icons: Record<string, JSX.Element> = {
    create: (
      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
      </svg>
    ),
    comment: (
      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
    notification: (
      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
    update: (
      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    user: (
      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    calendar: (
      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    truck: (
      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1h9M7 16a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
      </svg>
    ),
    check: (
      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
      </svg>
    ),
  }
  return icons[icon] || icons.comment
}

const ComplaintHistory = () => {
  const { id } = useParams<{ id: string }>()
  const { currentComplaint, fetchComplaint, isLoading, error } = useComplaintsStore()
  const [events, setEvents] = useState<ComplaintHistoryEvent[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  useEffect(() => {
    if (id) {
      fetchComplaint(Number(id))
      loadHistory()
    }
  }, [id, fetchComplaint])

  const loadHistory = async () => {
    if (!id) return
    setIsLoadingHistory(true)
    try {
      const { events: historyEvents } = await complaintsAPI.getHistory(Number(id))
      setEvents(historyEvents || [])
    } catch (error) {
      console.error('Ошибка загрузки истории:', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen py-8 px-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !currentComplaint) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-lg">
            <p className="font-medium">{error || 'Рекламация не найдена'}</p>
          </div>
          <Link to="/complaints">
            <Button className="mt-4">Вернуться к списку</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Заголовок */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <svg className="h-10 w-10 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              История событий
            </h1>
            <p className="mt-2 text-gray-600">
              Рекламация #{currentComplaint.id} - {currentComplaint.order_number}
            </p>
          </div>
          <Link
            to={`/complaints/${id}`}
            className="px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300 transition-all duration-200"
          >
            <svg className="inline h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Назад к рекламации
          </Link>
        </div>

        {/* Информация о рекламации */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-gray-100 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Клиент</p>
              <p className="text-base font-semibold text-gray-900">{currentComplaint.client_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Текущий статус</p>
              <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">
                {currentComplaint.status_display}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-600">Менеджер</p>
              {currentComplaint.manager ? (
                <p className="text-base font-semibold text-gray-900">
                  {currentComplaint.manager.first_name && currentComplaint.manager.last_name
                    ? `${currentComplaint.manager.first_name} ${currentComplaint.manager.last_name}`
                    : currentComplaint.manager.username}
                </p>
              ) : (
                <p className="text-base font-semibold text-orange-600">Не назначен</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-600">Всего событий</p>
              <p className="text-2xl font-bold text-purple-600">{events.length}</p>
            </div>
          </div>
        </div>

        {/* Временная шкала событий */}
        {isLoadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : events.length > 0 ? (
          <div className="relative">
            {/* Вертикальная линия */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-500 via-blue-500 to-gray-300"></div>

            <div className="space-y-6">
              {events.map((event, index) => (
                <div key={`${event.type}-${event.date}-${index}`} className="relative pl-20 animate-fadeIn">
                  {/* Иконка события */}
                  <div className="absolute left-0 flex items-center justify-center">
                    <div className={`h-16 w-16 rounded-full border-4 border-white shadow-lg flex items-center justify-center ${COLOR_CLASSES[event.color] || COLOR_CLASSES.blue}`}>
                      <EventIcon icon={event.icon} />
                    </div>
                  </div>

                  {/* Карточка события */}
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow duration-200">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900">{event.title}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          <svg className="inline h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {event.date ? formatDate(event.date) : '—'}
                        </p>
                      </div>
                      {event.user && (
                        <div className="flex items-center space-x-2 ml-4">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">
                              {event.user.first_name && event.user.last_name
                                ? `${event.user.first_name} ${event.user.last_name}`
                                : event.user.username}
                            </p>
                            <p className="text-xs text-gray-500">{event.user.role}</p>
                          </div>
                          <div className="h-10 w-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {event.user.username.slice(0, 2).toUpperCase()}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-gray-700 bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="whitespace-pre-wrap">{event.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Нет событий</h3>
            <p className="mt-1 text-sm text-gray-500">История событий для этой рекламации пока пуста</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ComplaintHistory

