import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { ordersAPI } from '../../api/orders'
import { salonsAPI } from '../../api/salons'
import { OrderListItem, Salon, OrderStatus, ORDER_STATUS_DISPLAY, ORDER_STATUS_COLOR } from '../../types/orders'
import OrdersMeasurementsSwitch from '../../components/orders/OrdersMeasurementsSwitch'

// Метки папок для баннера (folder может быть статусом или составной выборкой)
const FOLDER_LABELS: Record<string, string> = {
  created: 'Создан',
  today_measurement: 'Сегодня замер',
  tomorrow_measurement: 'Замеры на завтра',
}

const OrderList = () => {
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const folder = searchParams.get('folder') || ''
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [salons, setSalons] = useState<Salon[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [salonFilter, setSalonFilter] = useState<number | ''>('')
  const [myOrders, setMyOrders] = useState(false)

  const canCreate = user?.role === 'manager' || user?.role === 'admin'

  const folderLabel = folder
    ? (FOLDER_LABELS[folder] || ORDER_STATUS_DISPLAY[folder as OrderStatus] || folder)
    : ''

  const clearFolder = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('folder')
    setSearchParams(next)
  }

  const loadOrders = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await ordersAPI.getList({
        status: statusFilter || undefined,
        salon: salonFilter || undefined,
        search: search || undefined,
        my_orders: myOrders || undefined,
        folder: folder || undefined,
      })
      setOrders(data)
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки заказов')
    } finally {
      setIsLoading(false)
    }
  }, [search, statusFilter, salonFilter, myOrders, folder])

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
      {/* Переключатель Заказы / Замеры */}
      <OrdersMeasurementsSwitch active="orders" />

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

      {/* Активная папка (переход с Dashboard) */}
      {folder && (
        <div className="mb-4 flex items-center gap-2 text-sm bg-primary-50 border border-primary-200 text-primary-800 rounded-xl px-4 py-2">
          <span>Папка: <strong>{folderLabel}</strong></span>
          <button onClick={clearFolder} className="ml-auto text-primary-600 hover:underline">
            Сбросить ✕
          </button>
        </div>
      )}

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
            onChange={(e) => {
              // Папка из дашборда — это тоже выборка по статусу. Если её не сбросить,
              // она пересекается с выбранным статусом и список почти всегда пустой,
              // из-за чего фильтр выглядит нерабочим.
              if (e.target.value && folder) clearFolder()
              setStatusFilter(e.target.value as OrderStatus | '')
            }}
            className="rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="">Все статусы</option>
            <option value="draft">Черновик</option>
            <option value="active">Создан</option>
            <option value="measurement_requested">Заявка на замер</option>
            <option value="measurement_scheduled">Замер запланирован</option>
            <option value="measurement_done">Замер выполнен</option>
            <option value="measurement_processed">Замер обработан</option>
            <option value="measurement_not_planned">Замер не запланирован</option>
            <option value="measurement_not_done">Замер не выполнен</option>
            <option value="measurement_not_processed">Замер не обработан</option>
            <option value="paid">Оплачен</option>
            <option value="in_production">В производстве</option>
            <option value="on_warehouse">На складе</option>
            <option value="shipped">Отгружен</option>
            <option value="completed">Выполнен</option>
            <option value="cancelled">Не актуален</option>
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
                  <tr
                    key={order.id}
                    className={`cursor-pointer ${order.is_overdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}
                    onClick={() => {}}
                  >
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
                      </Link>
                      {order.contact_phone && (
                        <a
                          href={`tel:${order.contact_phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          {order.contact_phone}
                        </a>
                      )}
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
