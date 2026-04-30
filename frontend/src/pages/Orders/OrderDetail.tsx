import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { ordersAPI } from '../../api/orders'
import { Order, ORDER_STATUS_DISPLAY, ORDER_STATUS_COLOR, DOOR_TYPE_DISPLAY, OPENING_TYPE_DISPLAY } from '../../types/orders'

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const canEdit = user?.role === 'manager' || user?.role === 'admin'

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const data = await ordersAPI.getById(Number(id))
        setOrder(data)
      } catch (err: any) {
        setError('Заказ не найден или нет доступа')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  const handleDelete = async () => {
    if (!order || !window.confirm(`Удалить заказ #${order.id}?`)) return
    setIsDeleting(true)
    try {
      await ordersAPI.delete(order.id)
      navigate('/orders')
    } catch {
      alert('Не удалось удалить заказ')
      setIsDeleting(false)
    }
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const formatDateTime = (d: string) => {
    return new Date(d).toLocaleString('ru-RU', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-6 rounded-xl">
          <h2 className="text-lg font-semibold mb-2">Ошибка</h2>
          <p>{error}</p>
          <Link to="/orders" className="mt-3 inline-block text-sm text-red-600 hover:underline">← К списку заказов</Link>
        </div>
      </div>
    )
  }

  const salon = order.salon as any

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      {/* Хлебные крошки */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/orders" className="hover:text-primary-600">Заказы</Link>
        <span>/</span>
        <span className="text-gray-900">Заказ #{order.id}</span>
      </div>

      {/* Шапка */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{order.client_name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${ORDER_STATUS_COLOR[order.status]}`}>
              {ORDER_STATUS_DISPLAY[order.status]}
            </span>
            {order.kp_number && (
              <span className="text-sm text-gray-500">КП: {order.kp_number}</span>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Link
              to={`/orders/${order.id}/edit`}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-all"
            >
              <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Редактировать
            </Link>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-all"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Основная информация */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Клиент</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Имя</dt>
              <dd className="font-medium text-gray-900">{order.client_name}</dd>
            </div>
            {order.contact_phone && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Телефон</dt>
                <dd className="font-medium text-gray-900">{order.contact_phone}</dd>
              </div>
            )}
            {order.address && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Адрес</dt>
                <dd className="font-medium text-gray-900 text-right max-w-[250px]">{order.address}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Салон и менеджер */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Салон и менеджер</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Салон</dt>
              <dd className="font-medium text-gray-900">{typeof salon === 'object' ? salon.name : '—'}</dd>
            </div>
            {typeof salon === 'object' && salon.address && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Адрес салона</dt>
                <dd className="text-gray-700">{salon.address}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Менеджер</dt>
              <dd className="font-medium text-gray-900">{order.manager.full_name}</dd>
            </div>
          </dl>
        </div>

        {/* КП и условия */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">КП и объект</h2>
          <dl className="space-y-2 text-sm">
            {order.kp_number && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Номер КП</dt>
                <dd className="font-medium text-gray-900">{order.kp_number}</dd>
              </div>
            )}
            {order.kp_date && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Дата КП</dt>
                <dd className="text-gray-900">{formatDate(order.kp_date)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Лифт</dt>
              <dd className="text-gray-900">
                {order.lift_available === true ? 'Есть' : order.lift_available === false ? 'Нет' : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Лестница</dt>
              <dd className="text-gray-900">
                {order.stairs_available === true ? 'Есть' : order.stairs_available === false ? 'Нет' : '—'}
              </dd>
            </div>
            {order.floor_readiness && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Готовность пола</dt>
                <dd className="text-gray-900">{order.floor_readiness}</dd>
              </div>
            )}
          </dl>
          {order.commercial_offer_url && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <a
                href={order.commercial_offer_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-sm text-primary-600 hover:underline"
              >
                <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Коммерческое предложение
              </a>
            </div>
          )}
        </div>

        {/* Служебная */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Служебная</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Создан</dt>
              <dd className="text-gray-900">{formatDateTime(order.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Обновлён</dt>
              <dd className="text-gray-900">{formatDateTime(order.updated_at)}</dd>
            </div>
          </dl>
          {order.comment && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Комментарий</p>
              <p className="text-sm text-gray-700">{order.comment}</p>
            </div>
          )}
        </div>
      </div>

      {/* Позиции */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Позиции ({order.items?.length || 0})
          </h2>
          {canEdit && (
            <Link
              to={`/orders/${order.id}/edit`}
              className="text-sm text-primary-600 hover:underline"
            >
              Редактировать позиции
            </Link>
          )}
        </div>

        {!order.items || order.items.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">Позиции не добавлены</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Проём</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Помещение</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Модель</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Тип</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Размер (ВxШ)</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Кол-во</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Цена</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.items.map((item) => (
                  <>
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{item.opening_number}</td>
                      <td className="px-3 py-2 text-gray-600">{item.room_name || '—'}</td>
                      <td className="px-3 py-2 text-gray-900 max-w-[200px]">{item.model_name || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">
                        <div>{item.door_type ? DOOR_TYPE_DISPLAY[item.door_type] : '—'}</div>
                        <div className="text-xs text-gray-400">{item.opening_type ? OPENING_TYPE_DISPLAY[item.opening_type] : ''}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {item.door_height && item.door_width ? `${item.door_height} × ${item.door_width}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{item.price != null ? Number(item.price).toLocaleString('ru-RU') : '—'}</td>
                      <td className="px-3 py-2 text-right font-medium">{item.amount != null ? Number(item.amount).toLocaleString('ru-RU') : '—'}</td>
                    </tr>
                    {item.addons?.map((addon) => (
                      <tr key={`addon-${addon.id}`} className="bg-gray-50 text-xs text-gray-500">
                        <td />
                        <td className="px-3 py-1" colSpan={2}>↳ {addon.kind_display}: {addon.name}</td>
                        <td />
                        <td />
                        <td className="px-3 py-1 text-right">{addon.quantity}</td>
                        <td className="px-3 py-1 text-right">{addon.price != null ? Number(addon.price).toLocaleString('ru-RU') : '—'}</td>
                        <td />
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default OrderDetail
