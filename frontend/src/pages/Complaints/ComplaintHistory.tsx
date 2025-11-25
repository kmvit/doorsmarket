import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useComplaintsStore } from '../../store/complaintsStore'
import { complaintsAPI } from '../../api/complaints'
import { ComplaintComment } from '../../types/complaints'
import Button from '../../components/common/Button'

const ComplaintHistory = () => {
  const { id } = useParams<{ id: string }>()
  const { currentComplaint, fetchComplaint, isLoading, error } = useComplaintsStore()
  const [comments, setComments] = useState<ComplaintComment[]>([])
  const [isLoadingComments, setIsLoadingComments] = useState(false)

  useEffect(() => {
    if (id) {
      fetchComplaint(Number(id))
      loadComments()
    }
  }, [id, fetchComplaint])

  const loadComments = async () => {
    if (!id) return
    setIsLoadingComments(true)
    try {
      const commentsData = await complaintsAPI.getComments(Number(id))
      setComments(commentsData || [])
    } catch (error) {
      console.error('Ошибка загрузки комментариев:', error)
    } finally {
      setIsLoadingComments(false)
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

  const sortedComments = [...comments].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

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
              <p className="text-2xl font-bold text-purple-600">{sortedComments.length}</p>
            </div>
          </div>
        </div>

        {/* Временная шкала событий */}
        {isLoadingComments ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : sortedComments.length > 0 ? (
          <div className="relative">
            {/* Вертикальная линия */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-500 via-blue-500 to-gray-300"></div>

            <div className="space-y-6">
              {sortedComments.map((comment, index) => (
                <div key={comment.id} className="relative pl-20 animate-fadeIn">
                  {/* Иконка события */}
                  <div className="absolute left-0 flex items-center justify-center">
                    <div className="h-16 w-16 rounded-full border-4 border-white shadow-lg flex items-center justify-center bg-gradient-to-br from-blue-500 to-cyan-500">
                      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                      </svg>
                    </div>
                  </div>

                  {/* Карточка события */}
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow duration-200">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900">Комментарий</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          <svg className="inline h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatDate(comment.created_at)}
                        </p>
                      </div>
                      {comment.author && (
                        <div className="flex items-center space-x-2 ml-4">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">
                              {comment.author.first_name && comment.author.last_name
                                ? `${comment.author.first_name} ${comment.author.last_name}`
                                : comment.author.username}
                            </p>
                            <p className="text-xs text-gray-500">{comment.author.role}</p>
                          </div>
                          <div className="h-10 w-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {comment.author.username.slice(0, 2).toUpperCase()}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-gray-700 bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="whitespace-pre-wrap">{comment.text}</p>
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

