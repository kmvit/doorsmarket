import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ordersAPI } from '../../api/orders'
import { Order } from '../../types/orders'
import KpUploadTab from './KpUploadTab'

/**
 * Добавление ещё одного КП в существующий заказ: загрузка PDF → парсинг →
 * правка превью → присоединение позиций к уже имеющимся.
 * Ничего не удаляется: нумерация проёмов продолжается, замер и связки проёмов
 * с позициями сохраняются. Номер нового КП дописывается к уже указанным.
 */
const OrderAppendKp = () => {
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
          Добавить КП в заказ #{orderId}{order ? ` — ${order.client_name}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          КП в заказе: {order?.kp_number || '—'}. Загрузите ещё один PDF — его позиции добавятся
          к уже имеющимся по своим категориям, нумерация проёмов продолжится с последнего.
          Существующие позиции и замер не пострадают. Повторяющиеся услуги (доставка, подъём)
          подсвечены — удалите лишние строки до добавления.
        </p>
      </div>
      <KpUploadTab
        salons={[]}
        defaultSalonId={0}
        appendOrderId={orderId}
        existingAddonNames={(order?.addons || []).map((a) => a.name)}
      />
    </div>
  )
}

export default OrderAppendKp
