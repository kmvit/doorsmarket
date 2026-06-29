import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ordersAPI } from '../../api/orders'
import {
  Order, OrderActivityLog, ORDER_STATUS_DISPLAY, ORDER_STATUS_COLOR, OrderStatus,
} from '../../types/orders'

// Цвет маркера события по виду
const KIND_COLOR: Record<string, string> = {
  created: 'bg-blue-500',
  updated: 'bg-gray-400',
  items_changed: 'bg-gray-500',
  status_changed: 'bg-emerald-600',
  file_attached: 'bg-indigo-500',
  comment_added: 'bg-purple-500',
  measurement_requested: 'bg-blue-500',
  measurement_scheduled: 'bg-cyan-500',
  measurement_done: 'bg-teal-500',
  measurement_processed: 'bg-emerald-500',
  sms_sent: 'bg-amber-500',
}

const fmt = (d: string) =>
  new Date(d).toLocaleString('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

const statusName = (s: string) => ORDER_STATUS_DISPLAY[s as OrderStatus] || s

const OrderHistory = () => {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [logs, setLogs] = useState<OrderActivityLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const [o, l] = await Promise.all([
          ordersAPI.getById(Number(id)),
          ordersAPI.getActivityLog(Number(id)).catch(() => []),
        ])
        setOrder(o)
        setLogs(l)
      } catch {
        setError('Заказ не найден или нет доступа')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-6 rounded-xl">
          <h2 className="text-lg font-semibold mb-2">Ошибка</h2>
          <p>{error}</p>
          <Link to="/orders" className="mt-3 inline-block text-sm text-red-600 hover:underline">← К списку заказов</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Хлебные крошки */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/orders" className="hover:text-primary-600">Заказы</Link>
        <span>/</span>
        <Link to={`/orders/${order.id}`} className="hover:text-primary-600">Заказ #{order.id}</Link>
        <span>/</span>
        <span className="text-gray-900">История</span>
      </div>

      {/* Шапка */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <svg className="h-7 w-7 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            История событий
          </h1>
          <p className="mt-1 text-gray-600">
            Заказ #{order.id} — {order.client_name}
          </p>
        </div>
        <Link
          to={`/orders/${order.id}`}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
        >
          <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Назад к заказу
        </Link>
      </div>

      {/* Краткая информация */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Клиент</p>
            <p className="font-semibold text-gray-900">{order.client_name}</p>
          </div>
          <div>
            <p className="text-gray-500">Текущий статус</p>
            <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${ORDER_STATUS_COLOR[order.status]}`}>
              {ORDER_STATUS_DISPLAY[order.status]}
            </span>
          </div>
          <div>
            <p className="text-gray-500">Менеджер</p>
            <p className="font-semibold text-gray-900">{order.manager.full_name}</p>
          </div>
          <div>
            <p className="text-gray-500">Всего событий</p>
            <p className="text-xl font-bold text-purple-600">{logs.length}</p>
          </div>
        </div>
      </div>

      {/* Таймлайн */}
      {logs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Нет событий</h3>
          <p className="mt-1 text-sm text-gray-500">История по этому заказу пока пуста</p>
        </div>
      ) : (
        <ul className="relative border-l-2 border-gray-200 ml-3 space-y-5 pl-6">
          {logs.map((log) => (
            <li key={log.id} className="relative">
              <span
                className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full ring-4 ring-white ${KIND_COLOR[log.kind] || 'bg-gray-400'}`}
              />
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{log.kind_display}</h3>
                  <span className="text-xs text-gray-400 flex-shrink-0">{fmt(log.created_at)}</span>
                </div>
                {log.kind === 'status_changed' && (log.old_status || log.new_status) && (
                  <p className="text-sm text-gray-600 mt-1">
                    {statusName(log.old_status)} → <strong>{statusName(log.new_status)}</strong>
                  </p>
                )}
                {log.description && (
                  <p className="text-sm text-gray-700 mt-1 break-words">{log.description}</p>
                )}
                {log.kind === 'sms_sent' && log.meta?.suppressed && (
                  <p className="text-xs text-amber-600 mt-1">SMS отключены (тест-режим) — не отправлено</p>
                )}
                <p className="text-xs text-gray-400 mt-2">{log.actor_name}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default OrderHistory
