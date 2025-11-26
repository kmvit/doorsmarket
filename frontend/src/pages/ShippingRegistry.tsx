import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { shippingAPI } from '../api/shipping'
import { ShippingRegistry, ShippingRegistryFilters } from '../types/complaints'
import Button from '../components/common/Button'

const ShippingRegistryPage = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [entries, setEntries] = useState<ShippingRegistry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ShippingRegistryFilters>({
    search: searchParams.get('search') || undefined,
    order_type: (searchParams.get('order_type') as any) || undefined,
    delivery_status: (searchParams.get('delivery_status') as any) || undefined,
    manager: searchParams.get('manager') ? Number(searchParams.get('manager')) : undefined,
  })
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetchData()
  }, [filters])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const listResponse = await shippingAPI.getList(filters)
      setEntries(listResponse?.results || [])
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка при загрузке данных')
      console.error('Error fetching shipping registry:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFilterChange = (key: keyof ShippingRegistryFilters, value: any) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)

    // Обновляем URL параметры
    const newSearchParams = new URLSearchParams()
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        newSearchParams.set(k, String(v))
      }
    })
    setSearchParams(newSearchParams)
  }

  const clearFilters = () => {
    const clearedFilters: ShippingRegistryFilters = {}
    setFilters(clearedFilters)
    setSearchParams({})
  }

  const getDeliveryStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      pending: { label: 'Ожидает', className: 'bg-yellow-100 text-yellow-800' },
      in_transit: { label: 'В пути', className: 'bg-blue-100 text-blue-800' },
      delivered: { label: 'Доставлено', className: 'bg-green-100 text-green-800' },
      cancelled: { label: 'Отменено', className: 'bg-red-100 text-red-800' },
    }

    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' }

    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${config.className}`}>
        {config.label}
      </span>
    )
  }

  const getOrderTypeBadge = (orderType: string) => {
    if (orderType === 'complaint') {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
          Рекламация
        </span>
      )
    }
    return (
      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
        Основной
      </span>
    )
  }

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-gray-400">—</span>

    return (
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`h-4 w-4 ${star <= rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
            viewBox="0 0 20 20"
          >
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
      </div>
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

  if (error) {
    return (
      <div className="min-h-screen py-8 px-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchData}>Попробовать снова</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Заголовок */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Реестр на отгрузку</h1>
            <p className="text-sm text-gray-600 mt-1">Управление заказами на доставку</p>
          </div>
        </div>

        {/* Фильтры */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 mb-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Фильтры</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Сбросить
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
                {showFilters ? 'Скрыть фильтры' : 'Показать фильтры'}
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Поиск</label>
                <input
                  type="text"
                  value={filters.search || ''}
                  onChange={(e) => handleFilterChange('search', e.target.value || undefined)}
                  placeholder="Номер заказа, клиент, адрес..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Вид заказа</label>
                <select
                  value={filters.order_type || ''}
                  onChange={(e) => handleFilterChange('order_type', e.target.value || undefined)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">Все</option>
                  <option value="main">Основной</option>
                  <option value="complaint">Рекламация</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Статус доставки</label>
                <select
                  value={filters.delivery_status || ''}
                  onChange={(e) => handleFilterChange('delivery_status', e.target.value || undefined)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">Все</option>
                  <option value="pending">Ожидает</option>
                  <option value="in_transit">В пути</option>
                  <option value="delivered">Доставлено</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Таблица */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
          {entries && entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">№</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Номер заказа</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Менеджер</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Клиент</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Адрес</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Контактное лицо</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Телефон</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Кол-во дверей</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Вид заказа</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Статус доставки</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Оценка</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entries.map((entry, index) => (
                    <tr
                      key={entry.id}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                        entry.order_type === 'complaint' ? 'bg-red-50' : ''
                      }`}
                      onClick={() => navigate(`/shipping-registry/${entry.id}`)}
                    >
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">{index + 1}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">{entry.order_number}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900">
                        {entry.manager.first_name && entry.manager.last_name
                          ? `${entry.manager.first_name} ${entry.manager.last_name}`
                          : entry.manager.username}
                      </td>
                      <td className="px-3 py-2 text-gray-900">{entry.client_name}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{entry.address}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900">{entry.contact_person}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900">{entry.contact_phone}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-center text-gray-900">{entry.doors_count}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{getOrderTypeBadge(entry.order_type)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{getDeliveryStatusBadge(entry.delivery_status)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-center">{renderStars(entry.client_rating)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Реестр пуст</h3>
              <p className="mt-1 text-sm text-gray-500">Добавьте первую запись в реестр на отгрузку</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ShippingRegistryPage

