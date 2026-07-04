import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { workshopAPI } from '../../api/orders'
import { WorkshopOrder, OrderStatus, ORDER_STATUS_DISPLAY, ORDER_STATUS_COLOR } from '../../types/orders'

const Workshop = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reminderParam = searchParams.get('reminder') // 'today' | 'tomorrow'
  const [orders, setOrders] = useState<WorkshopOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [mine, setMine] = useState(false)
  const [withReminderToday, setWithReminderToday] = useState(reminderParam === 'today')
  const [withReminderTomorrow, setWithReminderTomorrow] = useState(reminderParam === 'tomorrow')
  const [withOverdue, setWithOverdue] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await workshopAPI.list({
        mine: mine || undefined,
        with_reminder_today: withReminderToday || undefined,
        with_reminder_tomorrow: withReminderTomorrow || undefined,
        with_overdue_reminder: withOverdue || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
      })
      setOrders(data)
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки')
    } finally {
      setIsLoading(false)
    }
  }, [search, statusFilter, mine, withReminderToday, withReminderTomorrow, withOverdue])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }
  const formatDateTime = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Наработки</h1>
        <p className="text-sm text-gray-500 mt-1">Заказы со статусом, напоминаниями и активностью</p>
      </div>

      {/* Фильтры */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Поиск</label>
          <input
            type="text"
            placeholder="По любому полю: клиент, адрес, № КП, телефон, комментарий, ID, менеджер, действие…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border-gray-300 shadow-sm text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Статус</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
            className="rounded-lg border-gray-300 shadow-sm text-sm"
          >
            <option value="">Все</option>
            <option value="draft">Черновик</option>
            <option value="active">Создан</option>
            <option value="measurement_requested">Заявка на замер</option>
            <option value="measurement_scheduled">Замер запланирован</option>
            <option value="measurement_done">Замер выполнен</option>
            <option value="measurement_processed">Замер обработан</option>
            <option value="paid">Оплачен</option>
            <option value="in_production">В производстве</option>
            <option value="on_warehouse">На складе</option>
            <option value="shipped">Отгружен</option>
            <option value="completed">Выполнен</option>
            <option value="cancelled">Не актуален</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="rounded border-gray-300 text-primary-600" />
          Мои
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={withReminderToday} onChange={(e) => setWithReminderToday(e.target.checked)} className="rounded border-gray-300 text-primary-600" />
          На сегодня
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={withReminderTomorrow} onChange={(e) => setWithReminderTomorrow(e.target.checked)} className="rounded border-gray-300 text-primary-600" />
          На завтра
        </label>
        <label className="flex items-center gap-2 text-sm text-red-700 cursor-pointer">
          <input type="checkbox" checked={withOverdue} onChange={(e) => setWithOverdue(e.target.checked)} className="rounded border-gray-300 text-red-600" />
          Просрочено
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-5xl mb-4">📌</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Наработок нет</h2>
          <p className="text-gray-500">Ничего не найдено по выбранным фильтрам</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">№</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Создан</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Клиент / адрес</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Комментарий</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Активность</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Следующее действие</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Телефон</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">№ КП</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o) => {
                  const isOverdue = o.next_action_at && new Date(o.next_action_at) < new Date()
                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-primary-50 cursor-pointer"
                      onClick={() => navigate(`/orders/${o.id}`)}
                    >
                      <td className="px-3 py-2">
                        <Link
                          to={`/orders/${o.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary-600 font-medium hover:underline"
                        >
                          #{o.id}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{formatDate(o.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{o.client_name}</div>
                        {o.address && <div className="text-xs text-gray-500 truncate max-w-[200px]">{o.address}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${ORDER_STATUS_COLOR[o.status]}`}>
                          {ORDER_STATUS_DISPLAY[o.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={o.comment}>{o.comment || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {o.last_activity_at ? (
                          <>
                            <div>{formatDateTime(o.last_activity_at)}</div>
                            <div className="text-xs text-gray-400">{o.last_activity_kind_display}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {o.next_action_at ? (
                          <div className={isOverdue ? 'text-red-600' : 'text-gray-700'}>
                            <div className="text-xs">{formatDateTime(o.next_action_at)}</div>
                            <div className="text-xs truncate max-w-[150px]" title={o.next_action_text}>{o.next_action_text}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {o.contact_phone ? (
                          <a
                            href={`tel:${o.contact_phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary-600 hover:underline text-xs"
                          >
                            {o.contact_phone}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{o.kp_number || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default Workshop
