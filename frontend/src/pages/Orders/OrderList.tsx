import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { ordersAPI } from '../../api/orders'
import { salonsAPI } from '../../api/salons'
import { OrderListItem, Salon, OrderStatus, ORDER_STATUS_DISPLAY, ORDER_STATUS_COLOR } from '../../types/orders'

const OrderList = () => {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [salons, setSalons] = useState<Salon[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [salonFilter, setSalonFilter] = useState<number | ''>('')
  const [myOrders, setMyOrders] = useState(false)

  const canCreate = user?.role === 'manager' || user?.role === 'admin'

  const loadOrders = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await ordersAPI.getList({
        status: statusFilter || undefined,
        salon: salonFilter || undefined,
        search: search || undefined,
        my_orders: myOrders || undefined,
      })
      setOrders(data)
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки заказов')
    } finally {
      setIsLoading(false)
    }
  }, [search, statusFilter, salonFilter, myOrders])

  useEffect(() => {
    salonsAPI.getAll().then(setSalons).catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setTimeout(loadOrders, 300)
    return () => clearTimeout(timer)
  }, [loadOrders])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Заказы</h1>
          <p className="text-sm text-gray-500 mt-1">{orders.length} заказ(ов)</p>
        </div>
        {canCreate && (
          <Link
            to="/orders/create"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-cyan-600 hover:from-primary-700 hover:to-cyan-700 rounded-xl shadow-md transition-all"
          >
            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Новый заказ
          </Link>
        )}
      </div>

      {/* Фильтры */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Поиск</label>
          <input
            type="text"
            placeholder="Клиент, адрес, номер КП..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Статус</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
            className="rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="">Все статусы</option>
            <option value="draft">Черновик</option>
            <option value="active">Активный</option>
            <option value="cancelled">Отменён</option>
          </select>
        </div>
        {salons.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Салон</label>
            <select
              value={salonFilter}
              onChange={(e) => setSalonFilter(e.target.value ? Number(e.target.value) : '')}
              className="rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="">Все салоны</option>
              {salons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        {(user?.role === 'service_manager' || user?.role === 'leader' || user?.role === 'admin') && (
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={myOrders}
              onChange={(e) => setMyOrders(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Мои заказы
          </label>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Нет заказов</h2>
          <p className="text-gray-500 mb-4">
            {search || statusFilter || salonFilter ? 'Ничего не найдено по выбранным фильтрам' : 'Заказов пока нет'}
          </p>
          {canCreate && (
            <Link
              to="/orders/create"
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-all"
            >
              Создать первый заказ
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">№</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Клиент</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Салон</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">КП</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Менеджер</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Создан</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => {}}>
                    <td className="px-4 py-3">
                      <Link to={`/orders/${order.id}`} className="text-primary-600 font-medium hover:underline">
                        #{order.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/orders/${order.id}`} className="block">
                        <div className="font-medium text-gray-900">{order.client_name}</div>
                        {order.address && (
                          <div className="text-xs text-gray-500 truncate max-w-[200px]">{order.address}</div>
                        )}
                        {order.contact_phone && (
                          <div className="text-xs text-gray-500">{order.contact_phone}</div>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{order.salon_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {order.kp_number && <div className="font-medium">{order.kp_number}</div>}
                      {order.kp_date && <div className="text-xs text-gray-500">{formatDate(order.kp_date)}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{order.manager.full_name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${ORDER_STATUS_COLOR[order.status]}`}>
                        {ORDER_STATUS_DISPLAY[order.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(order.created_at)}</td>
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

export default OrderList
