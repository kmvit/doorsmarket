import { useState } from 'react'
import { ordersAPI } from '../../api/orders'
import {
  Order, OrderStatus,
  ORDER_STATUS_DISPLAY, ORDER_STATUS_COLOR, ORDER_STATUS_HINT, OVERDUE_STATUSES,
} from '../../types/orders'

interface Props {
  order: Order
  canManage: boolean
  onChanged: () => void
}

// Допустимые «следующие» статусы (прямой ход воркфлоу) по текущему статусу.
const NEXT_STEPS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  measurement_processed: { status: 'paid', label: 'Отметить оплаченным' },
  measurement_not_processed: { status: 'paid', label: 'Отметить оплаченным' },
  paid: { status: 'in_production', label: 'Запустить в производство' },
  in_production: { status: 'on_warehouse', label: 'Поступил на склад' },
  on_warehouse: { status: 'shipped', label: 'Отгрузить' },
  shipped: { status: 'completed', label: 'Завершить заказ' },
}

const PRODUCTION_STATUSES: OrderStatus[] = [
  'paid', 'in_production', 'on_warehouse', 'shipped', 'completed',
]

const OrderStatusWorkflow = ({ order, canManage, onChanged }: Props) => {
  const [busy, setBusy] = useState(false)
  const [showProdModal, setShowProdModal] = useState(false)
  const [startDate, setStartDate] = useState(order.production_start_date || '')
  const [deadline, setDeadline] = useState(order.production_deadline || '')

  const isOverdue = order.is_overdue || OVERDUE_STATUSES.includes(order.status)
  const hint = ORDER_STATUS_HINT[order.status]
  const next = NEXT_STEPS[order.status]
  const canCancel = !['completed', 'cancelled'].includes(order.status)

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('ru-RU') : '—')

  const doTransition = async (
    status: OrderStatus,
    opts?: { production_start_date?: string | null; production_deadline?: string | null },
  ) => {
    setBusy(true)
    try {
      await ordersAPI.transition(order.id, status, opts)
      onChanged()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Не удалось изменить статус')
    } finally {
      setBusy(false)
    }
  }

  const handleNext = () => {
    if (!next) return
    // Запуск в производство — спрашиваем даты запуска/готовности
    if (next.status === 'in_production') {
      setShowProdModal(true)
      return
    }
    if (!window.confirm(`Перевести заказ в статус «${ORDER_STATUS_DISPLAY[next.status]}»?`)) return
    doTransition(next.status)
  }

  const handleProdConfirm = async () => {
    if (!startDate) {
      alert('Укажите дату запуска в производство')
      return
    }
    setShowProdModal(false)
    await doTransition('in_production', {
      production_start_date: startDate,
      production_deadline: deadline || null,
    })
  }

  // Инлайн-сохранение дат производства (когда заказ уже в производстве и далее)
  const saveProductionDates = async () => {
    setBusy(true)
    try {
      await ordersAPI.update(order.id, {
        production_start_date: startDate || null,
        production_deadline: deadline || null,
      })
      onChanged()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Не удалось сохранить даты')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 ${isOverdue ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Статус заказа</h2>
        <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${ORDER_STATUS_COLOR[order.status]}`}>
          {ORDER_STATUS_DISPLAY[order.status]}
        </span>
      </div>

      {/* UI-подсказка по статусу */}
      {hint && (
        <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          <span>💡</span>
          <span>{hint}</span>
        </div>
      )}

      {/* Просрочка */}
      {isOverdue && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          <span>⚠️</span>
          <span>Заказ просрочен. Запланируйте/выполните/обработайте замер.</span>
        </div>
      )}

      {/* Даты производства */}
      {PRODUCTION_STATUSES.includes(order.status) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 text-sm">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Дата запуска</label>
            {canManage ? (
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
            ) : (
              <span className="text-gray-900">{fmt(order.production_start_date)}</span>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Дата готовности</label>
            {canManage ? (
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
            ) : (
              <span className="text-gray-900">{fmt(order.production_deadline)}</span>
            )}
          </div>
          {canManage && (
            (startDate !== (order.production_start_date || '') || deadline !== (order.production_deadline || '')) && (
              <div className="sm:col-span-2">
                <button
                  onClick={saveProductionDates}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-60"
                >
                  Сохранить даты
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* Кнопки переходов */}
      {canManage && (next || canCancel) && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
          {next && (
            <button
              onClick={handleNext}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-60"
            >
              {next.label} →
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => {
                if (window.confirm('Пометить заказ как «Не актуален»?')) doTransition('cancelled')
              }}
              disabled={busy}
              className="px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-60"
            >
              Не актуален
            </button>
          )}
        </div>
      )}

      {/* Модалка дат при запуске в производство */}
      {showProdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Запуск в производство</h3>
            <p className="text-sm text-gray-500 mb-4">Укажите дату запуска и (опционально) дату готовности.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Дата запуска *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Дата готовности</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowProdModal(false)}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Отмена
              </button>
              <button
                onClick={handleProdConfirm}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-60"
              >
                Запустить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrderStatusWorkflow
