import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { shippingAPI } from '../api/shipping'
import { ShippingRegistry } from '../types/complaints'
import Button from '../components/common/Button'

const ShippingRegistryDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [entry, setEntry] = useState<ShippingRegistry | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  
  const [formData, setFormData] = useState({
    doors_count: 1,
    lift_type: 'our' as 'our' | 'client',
    lift_method: 'elevator' as 'elevator' | 'manual',
    delivery_destination: 'client' as 'client' | 'warehouse',
    payment_status: '',
    comments: '',
    delivery_status: 'pending' as 'pending' | 'in_transit' | 'delivered' | 'cancelled',
    client_rating: null as number | null,
  })

  useEffect(() => {
    if (id) {
      fetchEntry()
    }
  }, [id])

  const fetchEntry = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await shippingAPI.getDetail(Number(id))
      setEntry(data)
      setFormData({
        doors_count: data.doors_count,
        lift_type: data.lift_type,
        lift_method: data.lift_method,
        delivery_destination: data.delivery_destination,
        payment_status: data.payment_status || '',
        comments: data.comments || '',
        delivery_status: data.delivery_status,
        client_rating: data.client_rating,
      })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка при загрузке данных')
      console.error('Error fetching shipping registry entry:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!entry) return

    try {
      setIsSaving(true)
      await shippingAPI.update(entry.id, formData)
      // Обновляем данные после сохранения
      await fetchEntry()
      alert('Запись обновлена успешно')
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Ошибка при обновлении записи')
      console.error('Error updating shipping registry entry:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getOrderTypeBadge = (orderType: string) => {
    if (orderType === 'complaint') {
      return (
        <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">
          Рекламация
        </span>
      )
    }
    return (
      <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">
        Основной
      </span>
    )
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

  if (error || !entry) {
    return (
      <div className="min-h-screen py-8 px-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Запись не найдена'}</p>
          <Button onClick={() => navigate('/shipping-registry')}>Вернуться к реестру</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Заголовок */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Запись реестра #{entry.id}</h1>
            <p className="text-sm text-gray-600 mt-1">
              {entry.order_number} - {entry.client_name}
            </p>
          </div>
          <Link
            to="/shipping-registry"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Назад к реестру
          </Link>
        </div>

        {/* Форма редактирования */}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Основная информация */}
            <div className="lg:col-span-2 space-y-6">
              {/* Информация о заказе */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Информация о заказе</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Номер заказа</p>
                    <p className="text-base font-semibold text-gray-900">{entry.order_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Менеджер</p>
                    <p className="text-base font-semibold text-gray-900">
                      {entry.manager.first_name && entry.manager.last_name
                        ? `${entry.manager.first_name} ${entry.manager.last_name}`
                        : entry.manager.username}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Дата добавления</p>
                    <p className="text-base font-semibold text-gray-900">
                      {formatDate(entry.created_at) || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Вид заказа</p>
                    {getOrderTypeBadge(entry.order_type)}
                  </div>
                </div>

                {entry.complaint && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <Link
                      to={`/complaints/${entry.complaint.id}`}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      → Связанная рекламация #{entry.complaint.id}
                    </Link>
                  </div>
                )}
              </div>

              {/* Информация о клиенте */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Информация о клиенте</h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Клиент</p>
                    <p className="text-base font-semibold text-gray-900">{entry.client_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Адрес</p>
                    <p className="text-base text-gray-900">{entry.address}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Контактное лицо</p>
                      <p className="text-base text-gray-900">{entry.contact_person}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Телефон</p>
                      <p className="text-base text-gray-900">{entry.contact_phone}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Детали заказа */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Детали заказа</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Количество дверей
                    </label>
                    <input
                      type="number"
                      value={formData.doors_count}
                      onChange={(e) => handleChange('doors_count', parseInt(e.target.value) || 1)}
                      min="1"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Чей подъем</label>
                    <select
                      value={formData.lift_type}
                      onChange={(e) => handleChange('lift_type', e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="our">Наш</option>
                      <option value="client">Клиент</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Как подъем</label>
                    <select
                      value={formData.lift_method}
                      onChange={(e) => handleChange('lift_method', e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="elevator">Лифт</option>
                      <option value="manual">Ручной</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Куда везем</label>
                    <select
                      value={formData.delivery_destination}
                      onChange={(e) => handleChange('delivery_destination', e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="client">Клиент</option>
                      <option value="warehouse">На склад</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Оплата</label>
                    <input
                      type="text"
                      value={formData.payment_status}
                      onChange={(e) => handleChange('payment_status', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Статус оплаты"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Комментарии</label>
                    <textarea
                      value={formData.comments}
                      onChange={(e) => handleChange('comments', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Дополнительные комментарии"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Боковая панель */}
            <div className="space-y-6">
              {/* Статус доставки */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Доставка</h2>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Статус доставки
                  </label>
                  <select
                    value={formData.delivery_status}
                    onChange={(e) => handleChange('delivery_status', e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="pending">Ожидает отгрузки</option>
                    <option value="in_transit">В пути</option>
                    <option value="delivered">Доставлено</option>
                    <option value="cancelled">Отменено</option>
                  </select>
                </div>

                {entry.planned_shipping_date && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-600">Плановая дата</p>
                    <p className="text-base font-semibold text-gray-900">
                      {formatDate(entry.planned_shipping_date)}
                    </p>
                  </div>
                )}

                {entry.actual_shipping_date && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-600">Фактическая дата</p>
                    <p className="text-base font-semibold text-gray-900">
                      {formatDate(entry.actual_shipping_date)}
                    </p>
                  </div>
                )}
              </div>

              {/* Оценка клиента */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Оценка клиента</h2>

                <div className="flex items-center justify-center space-x-2 mb-4">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <label key={rating} className="cursor-pointer">
                      <input
                        type="radio"
                        name="client_rating"
                        value={rating}
                        checked={formData.client_rating === rating}
                        onChange={() => handleChange('client_rating', rating)}
                        className="hidden peer"
                      />
                      <svg
                        className={`h-8 w-8 transition-colors ${
                          formData.client_rating && formData.client_rating >= rating
                            ? 'text-yellow-400 fill-current'
                            : 'text-gray-300'
                        } hover:text-yellow-300`}
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                      </svg>
                    </label>
                  ))}
                </div>

                {formData.client_rating ? (
                  <p className="text-center text-sm text-gray-600">
                    Текущая оценка: {formData.client_rating}/5
                  </p>
                ) : (
                  <p className="text-center text-sm text-gray-400">Оценка не выставлена</p>
                )}
              </div>

              {/* Кнопки действий */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="space-y-3">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full px-4 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="h-5 w-5 inline mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {isSaving ? 'Сохранение...' : 'Сохранить изменения'}
                  </button>

                  {entry.complaint && (
                    <Link
                      to={`/complaints/${entry.complaint.id}`}
                      className="block w-full px-4 py-3 bg-blue-600 text-white text-center rounded-xl hover:bg-blue-700 transition-colors"
                    >
                      <svg
                        className="h-5 w-5 inline mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      Просмотреть рекламацию
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ShippingRegistryDetail

