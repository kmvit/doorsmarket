import { useState } from 'react'
import { ordersAPI } from '../../api/orders'
import { OrderActivityLog, ORDER_STATUS_DISPLAY, OrderStatus } from '../../types/orders'

interface Props {
  orderId: number
}

// Цвет «пилюли» события по виду
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
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

const statusName = (s: string) => ORDER_STATUS_DISPLAY[s as OrderStatus] || s

const OrderHistory = ({ orderId }: Props) => {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<OrderActivityLog[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && logs === null) {
      setLoading(true)
      try {
        setLogs(await ordersAPI.getActivityLog(orderId))
      } catch {
        setLogs([])
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mt-4">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
          <svg className="h-4 w-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          История событий
          {logs && <span className="text-gray-400 normal-case font-normal">({logs.length})</span>}
        </h2>
        <svg
          className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-gray-400 py-2">Загрузка…</p>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">Событий пока нет</p>
          ) : (
            <ul className="relative border-l border-gray-200 ml-2 space-y-4 pl-5">
              {logs.map((log) => (
                <li key={log.id} className="relative">
                  <span
                    className={`absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full ring-4 ring-white ${KIND_COLOR[log.kind] || 'bg-gray-400'}`}
                  />
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">{log.kind_display}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{fmt(log.created_at)}</span>
                  </div>
                  {log.kind === 'status_changed' && (log.old_status || log.new_status) && (
                    <div className="text-xs text-gray-600 mt-0.5">
                      {statusName(log.old_status)} → <strong>{statusName(log.new_status)}</strong>
                    </div>
                  )}
                  {log.description && (
                    <div className="text-xs text-gray-600 mt-0.5 break-words">{log.description}</div>
                  )}
                  <div className="text-[11px] text-gray-400 mt-0.5">{log.actor_name}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default OrderHistory
