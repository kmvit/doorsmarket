import { useEffect, useState } from 'react'
import ModalPortal from '../../components/installations/ModalPortal'
import { ordersAPI } from '../../api/orders'
import { OrderListItem, ORDER_STATUS_DISPLAY } from '../../types/orders'
import { useBodyScrollLock } from '../../utils/useBodyScrollLock'

/**
 * Выбор заказа для нового монтажа из списка монтажей: поиск по номеру,
 * клиенту, адресу, телефону или номеру КП. Показываются заказы любых статусов —
 * монтаж можно оформить по любому заказу.
 */
const OrderPickerModal = ({ onClose, onPick }: { onClose: () => void; onPick: (orderId: number) => void }) => {
  useBodyScrollLock(true)
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const list = await ordersAPI.getList({ search: search || undefined })
        if (!cancelled) setOrders(list.slice(0, 30))
      } catch {
        if (!cancelled) setOrders([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search])

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Заказ для монтажа</h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="№ заказа, клиент, адрес, телефон, КП..."
            className="w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <p className="p-4 text-sm text-gray-500">Поиск…</p>
          ) : orders.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Заказы не найдены</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {orders.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onPick(o.id)}
                    className="w-full text-left px-4 py-3 hover:bg-primary-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">#{o.id} · {o.client_name}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">{ORDER_STATUS_DISPLAY[o.status]}</span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {[o.address, o.kp_number && `КП ${o.kp_number}`, o.salon_name].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

export default OrderPickerModal
