import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { complaintsAPI } from '../api/complaints'
import { ComplaintListItem } from '../types/complaints'
import Button from '../components/common/Button'

const ManagerProduction = () => {
  const navigate = useNavigate()
  const [complaints, setComplaints] = useState<ComplaintListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showProductionModal, setShowProductionModal] = useState(false)
  const [showShippingModal, setShowShippingModal] = useState(false)
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintListItem | null>(null)
  const [productionDeadline, setProductionDeadline] = useState('')
  const [shippingDate, setShippingDate] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    fetchComplaints()
  }, [])

  const fetchComplaints = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Получаем рекламации со статусами для управления производством
      const response = await complaintsAPI.getList({
        status: undefined, // Получаем все, потом фильтруем
      })
      
      // Фильтруем по нужным статусам
      const filtered = (response.results || []).filter(
        (c) =>
          c.status === 'in_progress' ||
          c.status === 'in_production' ||
          c.status === 'on_warehouse' ||
          c.status === 'shipping_planned'
      )
      
      setComplaints(filtered)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка при загрузке данных')
      console.error('Error fetching complaints:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartProduction = async () => {
    if (!selectedComplaint || !productionDeadline) {
      alert('Укажите дату готовности')
      return
    }

    try {
      setIsProcessing(true)
      await complaintsAPI.startProduction(selectedComplaint.id, productionDeadline)
      setShowProductionModal(false)
      setSelectedComplaint(null)
      setProductionDeadline('')
      await fetchComplaints()
      alert('Производство запущено')
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Ошибка при запуске производства')
      console.error('Error starting production:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleMarkWarehouse = async (complaintId: number) => {
    if (!confirm('Подтвердите, что товар готов на складе?')) {
      return
    }

    try {
      setIsProcessing(true)
      await complaintsAPI.markWarehouse(complaintId)
      await fetchComplaints()
      alert('Товар отмечен как готовый на складе')
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Ошибка при обновлении статуса')
      console.error('Error marking warehouse:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePlanShipping = async () => {
    if (!selectedComplaint || !shippingDate) {
      alert('Укажите дату отгрузки')
      return
    }

    try {
      setIsProcessing(true)
      await complaintsAPI.planShipping(selectedComplaint.id, shippingDate)
      setShowShippingModal(false)
      setSelectedComplaint(null)
      setShippingDate('')
      await fetchComplaints()
      alert('Отгрузка запланирована')
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Ошибка при планировании отгрузки')
      console.error('Error planning shipping:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const openProductionModal = (complaint: ComplaintListItem) => {
    setSelectedComplaint(complaint)
    setShowProductionModal(true)
  }

  const openShippingModal = (complaint: ComplaintListItem) => {
    setSelectedComplaint(complaint)
    setShowShippingModal(true)
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      in_progress: { label: 'В работе', className: 'bg-yellow-100 text-yellow-800' },
      in_production: { label: 'В производстве', className: 'bg-blue-100 text-blue-800' },
      on_warehouse: { label: 'На складе', className: 'bg-green-100 text-green-800' },
      shipping_planned: { label: 'Отгрузка запланирована', className: 'bg-purple-100 text-purple-800' },
    }

    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' }

    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${config.className}`}>
        {config.label}
      </span>
    )
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen py-8 px-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка данных...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen py-8 px-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchComplaints}>Попробовать снова</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Заголовок */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Управление производством</h1>
          <p className="mt-2 text-gray-600">Контроль производства и планирование отгрузок</p>
        </div>

        {/* Список рекламаций */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {complaints.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Рекламация
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Клиент
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Статус
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Сроки
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {complaints.map((complaint) => (
                    <tr
                      key={complaint.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/complaints/${complaint.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-primary-800">#{complaint.id}</span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{complaint.order_number}</div>
                            <div className="text-sm text-gray-500">
                              {new Date(complaint.created_at).toLocaleString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{complaint.client_name}</div>
                        <div className="text-sm text-gray-500">{complaint.contact_person}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(complaint.status)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {complaint.production_deadline && (
                          <div>Готовность: {formatDate(complaint.production_deadline)}</div>
                        )}
                        {complaint.planned_shipping_date && (
                          <div>Отгрузка: {formatDate(complaint.planned_shipping_date)}</div>
                        )}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm font-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex space-x-2">
                          {complaint.status === 'in_progress' && (
                            <button
                              onClick={() => openProductionModal(complaint)}
                              disabled={isProcessing}
                              className="px-3 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                            >
                              Запустить производство
                            </button>
                          )}
                          {complaint.status === 'in_production' && (
                            <button
                              onClick={() => handleMarkWarehouse(complaint.id)}
                              disabled={isProcessing}
                              className="px-3 py-1 text-xs text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                            >
                              Товар на складе
                            </button>
                          )}
                          {(complaint.status === 'on_warehouse' || complaint.status === 'installation_planned') && !complaint.planned_shipping_date && (
                            <button
                              onClick={() => openShippingModal(complaint)}
                              disabled={isProcessing}
                              className="px-3 py-1 text-xs text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
                            >
                              Запланировать отгрузку
                            </button>
                          )}
                          {!['in_progress', 'in_production', 'on_warehouse'].includes(complaint.status) && (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Нет рекламаций для управления</h3>
              <p className="mt-1 text-sm text-gray-500">
                Все рекламации обработаны или не требуют вашего участия.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно для запуска производства */}
      {showProductionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Запуск производства</h3>
                <button
                  onClick={() => {
                    setShowProductionModal(false)
                    setSelectedComplaint(null)
                    setProductionDeadline('')
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Предварительная дата готовности
                </label>
                <input
                  type="date"
                  value={productionDeadline}
                  onChange={(e) => setProductionDeadline(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowProductionModal(false)
                    setSelectedComplaint(null)
                    setProductionDeadline('')
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleStartProduction}
                  disabled={isProcessing}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'Обработка...' : 'Запустить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно для планирования отгрузки */}
      {showShippingModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Планирование отгрузки</h3>
                <button
                  onClick={() => {
                    setShowShippingModal(false)
                    setSelectedComplaint(null)
                    setShippingDate('')
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Дата отгрузки</label>
                <input
                  type="date"
                  value={shippingDate}
                  onChange={(e) => setShippingDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowShippingModal(false)
                    setSelectedComplaint(null)
                    setShippingDate('')
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handlePlanShipping}
                  disabled={isProcessing}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'Обработка...' : 'Запланировать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ManagerProduction

