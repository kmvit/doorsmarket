import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ordersAPI } from '../../api/orders'
import { Order } from '../../types/orders'
import KpUploadTab from './KpUploadTab'

/**
 * Замена КП в существующем заказе (в т.ч. с уже выполненным замером):
 * загрузка нового PDF КП → парсинг → правка превью → замена шапки и позиций.
 * Замер сохраняется; связки проёмов с позициями КП сбрасываются.
 */
const OrderReplaceKp = () => {
  const { id } = useParams<{ id: string }>()
  const orderId = Number(id)
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ordersAPI.getById(orderId)
      .then(setOrder)
      .catch(() => setError('Заказ не найден или нет доступа'))
  }, [orderId])

  if (error) {
    return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <Link to={`/orders/${orderId}`} className="text-sm text-primary-600 hover:underline">
          ← Назад к заказу #{orderId}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          Заменить КП в заказе #{orderId}{order ? ` — ${order.client_name}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Текущее КП: {order?.kp_number || '—'}. Загрузите новый PDF — шапка и позиции заказа будут
          заменены. Замер и его проёмы сохранятся, связки проёмов с позициями нужно будет привязать заново.
        </p>
      </div>
      <KpUploadTab salons={[]} defaultSalonId={0} replaceOrderId={orderId} />
    </div>
  )
}

export default OrderReplaceKp
