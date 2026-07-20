import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { returnsAPI } from '../api/returns'
import { ReturnRegistry, ReturnRegistryFilters } from '../types/complaints'
import Button from '../components/common/Button'

const ReturnRegistryPage = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [entries, setEntries] = useState<ReturnRegistry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const buildFiltersFromParams = (params: URLSearchParams): ReturnRegistryFilters => {
    const hasAnyParam = Array.from(params.keys()).length > 0
    const excludeParam = params.get('exclude_sent')
    return {
      search: params.get('search') || undefined,
      return_status: (params.get('return_status') as any) || undefined,
      exclude_sent: hasAnyParam ? excludeParam === 'true' : true,
    }
  }

  const [filters, setFilters] = useState<ReturnRegistryFilters>(() => buildFiltersFromParams(searchParams))
  const [localFilters, setLocalFilters] = useState<ReturnRegistryFilters>(filters)

  useEffect(() => {
    const newFilters = buildFiltersFromParams(searchParams)
    setLocalFilters(newFilters)
    setFilters((prev) => (JSON.stringify(prev) === JSON.stringify(newFilters) ? prev : newFilters))
  }, [searchParams])

  useEffect(() => {
    fetchData()
  }, [filters])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const listResponse = await returnsAPI.getList(filters)
      setEntries(listResponse?.results || [])
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка при загрузке данных')
      console.error('Error fetching return registry:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFilterChange = (key: keyof ReturnRegistryFilters, value: any) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleApplyFilters = () => {
    setFilters(localFilters)
    const newSearchParams = new URLSearchParams()
    Object.entries(localFilters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        newSearchParams.set(k, String(v))
      }
    })
    setSearchParams(newSearchParams)
  }

  const handleResetFilters = () => {
    const defaultFilters: ReturnRegistryFilters = { exclude_sent: true }
    setFilters(defaultFilters)
    setLocalFilters(defaultFilters)
    setSearchParams({})
  }

  const handleMarkSent = async (entry: ReturnRegistry) => {
    if (!confirm(`Подтвердите, что товар по заказу ${entry.order_number} отправлен на фабрику?`)) return
    setUpdatingId(entry.id)
    try {
      await returnsAPI.update(entry.id, {
        return_status: 'sent',
        actual_return_date: new Date().toISOString(),
      })
      await fetchData()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Ошибка при обновлении записи')
    } finally {
      setUpdatingId(null)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const getReturnStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      pending: { label: 'Ожидает отправки', className: 'bg-yellow-100 text-yellow-800' },
      sent: { label: 'Отправлено', className: 'bg-green-100 text-green-800' },
      cancelled: { label: 'Отменено', className: 'bg-red-100 text-red-800' },
    }

    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' }

    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${config.className}`}>
        {config.label}
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
            <h1 className="text-3xl font-bold text-gray-900">Реестр на возврат</h1>
            <p className="text-sm text-gray-600 mt-1">Возврат товара на фабрику по рекламациям</p>
          </div>
        </div>

        {/* Фильтры */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 mb-6 border border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Поиск</label>
              <input
                type="text"
                value={localFilters.search || ''}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="Номер заказа, клиент, товар..."
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Статус возврата</label>
              <select
                value={localFilters.return_status || ''}
                onChange={(e) => handleFilterChange('return_status', e.target.value || undefined)}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="">Все</option>
                <option value="pending">Ожидает отправки</option>
                <option value="sent">Отправлено</option>
                <option value="cancelled">Отменено</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center px-4 py-2 bg-green-50 text-green-700 rounded-xl cursor-pointer hover:bg-green-100 transition-colors">
                <input
                  type="checkbox"
                  checked={localFilters.exclude_sent || false}
                  onChange={(e) => handleFilterChange('exclude_sent', e.target.checked || undefined)}
                  className="mr-2"
                />
                Кроме отправленных
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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
          </div>
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
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Товар</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Дата отгрузки (план)</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Дата отгрузки (факт)</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Добавлено</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entries.map((entry, index) => (
                    <tr
                      key={entry.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => entry.complaint && navigate(`/complaints/${entry.complaint.id}`)}
                    >
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">{index + 1}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">{entry.order_number}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900">
                        {entry.manager.first_name && entry.manager.last_name
                          ? `${entry.manager.first_name} ${entry.manager.last_name}`
                          : entry.manager.username}
                      </td>
                      <td className="px-3 py-2 text-gray-900">{entry.client_name}</td>
                      <td className="px-3 py-2 text-gray-900 max-w-xs truncate">{entry.product_name}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{getReturnStatusBadge(entry.return_status)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900">{formatDate(entry.planned_return_date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900">{formatDate(entry.actual_return_date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatDate(entry.created_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {entry.return_status === 'pending' && (
                          <button
                            onClick={() => handleMarkSent(entry)}
                            disabled={updatingId === entry.id}
                            className="px-3 py-1 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                          >
                            Отправлено
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Реестр пуст</h3>
              <p className="mt-1 text-sm text-gray-500">
                Записи появятся, когда менеджер запланирует отгрузку возврата по рекламации
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReturnRegistryPage
