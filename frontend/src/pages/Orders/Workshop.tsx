import { refusalSummary } from '../../components/orders/OrderRefusalFields'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { workshopAPI } from '../../api/orders'
import MultiSelect from '../../components/common/MultiSelect'
import PeopleFilters, { canFilterByPeople, EMPTY_PEOPLE_FILTER, PeopleFilterValue } from '../../components/orders/PeopleFilters'
import { formatPaymentMonth } from '../../components/orders/OrderSalesFieldsBlock'
import { useAuthStore } from '../../store/authStore'
import { WorkshopOrder, REFUSAL_REASONS, PURCHASE_REASONS, OrderStatus, OrderProbability, ORDER_STATUS_DISPLAY, ORDER_STATUS_COLOR, ORDER_STATUS_ORDER } from '../../types/orders'

const WORKSHOP_STATUS_OPTIONS = ORDER_STATUS_ORDER
  .map((value) => ({ value, label: ORDER_STATUS_DISPLAY[value] }))

const PROBABILITY_COLOR: Record<OrderProbability, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
}

const rubles = new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2,
})

const Workshop = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reminderParam = searchParams.get('reminder') // 'today' | 'tomorrow'
  const [orders, setOrders] = useState<WorkshopOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus[]>([])
  const [refusalReason, setRefusalReason] = useState('')
  const [purchaseReason, setPurchaseReason] = useState('')
  const showRefusals = statusFilter.includes('cancelled')
  const { user } = useAuthStore()
  // Город / салон / менеджер — для руководителя и админа
  const canFilterByManager = canFilterByPeople(user?.role)
  const [people, setPeople] = useState<PeopleFilterValue>(EMPTY_PEOPLE_FILTER)
  // С главной менеджер приходит с ?mine=1 — список совпадает с цифрами на карточке
  const [mine, setMine] = useState(searchParams.get('mine') === '1')
  const [withReminderToday, setWithReminderToday] = useState(reminderParam === 'today')
  const [withReminderTomorrow, setWithReminderTomorrow] = useState(reminderParam === 'tomorrow')
  const [withOverdue, setWithOverdue] = useState(reminderParam === 'overdue')

  useEffect(() => {
    if (amountMin && amountMax && Number(amountMin) > Number(amountMax)) {
      setError('Сумма «от» не может быть больше суммы «до».')
      setOrders([])
      setIsLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data = await workshopAPI.list({
          userId: user?.id,
          mine: mine || undefined,
          amount_min: amountMin || undefined,
          amount_max: amountMax || undefined,
          with_reminder_today: withReminderToday || undefined,
          with_reminder_tomorrow: withReminderTomorrow || undefined,
          with_overdue_reminder: withOverdue || undefined,
          status: statusFilter,
          refusal_reason: refusalReason || undefined,
          purchase_reason: purchaseReason || undefined,
          managers: canFilterByManager ? people.managers : undefined,
          salons: canFilterByManager ? people.salons : undefined,
          cities: canFilterByManager ? people.cities : undefined,
          search: search || undefined,
        })
        if (!cancelled) setOrders(data)
      } catch (err: any) {
        if (!cancelled) {
          setOrders([])
          const fields = err.response?.data
          setError(fields?.amount_min?.[0] || fields?.amount_max?.[0] || err.message || 'Ошибка загрузки')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    const t = setTimeout(load, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search, refusalReason, purchaseReason, amountMin, amountMax, statusFilter, people, canFilterByManager, mine, withReminderToday, withReminderTomorrow, withOverdue, user?.id])

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
          <MultiSelect
            options={WORKSHOP_STATUS_OPTIONS}
            value={statusFilter}
            onChange={values => {
              setStatusFilter(values)
              if (!values.includes('cancelled')) {
                setRefusalReason('')
                setPurchaseReason('')
              }
            }}
            placeholder="Все"
            className="w-56 rounded-lg border-gray-300 shadow-sm text-sm px-3 py-2"
          />
        </div>
        {showRefusals && <label className="text-xs font-medium text-gray-600">Причина отказа
          <select className="mt-1 block rounded-lg border-gray-300 text-sm" value={refusalReason}
            onChange={e => { setRefusalReason(e.target.value); setPurchaseReason('') }}>
            <option value="">Все причины</option>
            {Object.entries(REFUSAL_REASONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>}
        {showRefusals && refusalReason === 'bought_elsewhere' && <label className="text-xs font-medium text-gray-600">Почему купил в другом месте
          <select className="mt-1 block rounded-lg border-gray-300 text-sm" value={purchaseReason}
            onChange={e => setPurchaseReason(e.target.value)}>
            <option value="">Все причины покупки</option>
            {Object.entries(PURCHASE_REASONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>}
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-gray-600">Сумма заказа, ₽</legend>
          <div className="flex gap-2">
            <input type="number" inputMode="decimal" min="0" step="0.01" aria-label="Сумма заказа от" placeholder="От"
              value={amountMin} onChange={e => setAmountMin(e.target.value)} className="w-28 rounded-lg border-gray-300 text-sm" />
            <input type="number" inputMode="decimal" min="0" step="0.01" aria-label="Сумма заказа до" placeholder="До"
              value={amountMax} onChange={e => setAmountMax(e.target.value)} className="w-28 rounded-lg border-gray-300 text-sm" />
          </div>
        </fieldset>
        <PeopleFilters role={user?.role} value={people} onChange={setPeople} />
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
      ) : error ? null : orders.length === 0 ? (
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
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Менеджер</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Дизайнер</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Оплата</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Вероятность</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Активность</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Следующее действие</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">№ КП</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Сумма заказа</th>
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
                          {o.status_display}
                        </span>
                        {o.status === 'cancelled' && <div className="mt-1 min-w-36 break-words text-xs text-gray-600">{refusalSummary(o.refusal)}</div>}
                      </td>
                      <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={o.manager?.full_name}>{o.manager?.full_name || '—'}</td>
                      <td className="px-3 py-2 max-w-[180px]">
                        {o.designer ? (
                          <>
                            <div className="text-gray-900 truncate" title={o.designer.full_name}>{o.designer.full_name}</div>
                            {o.designer.studio && (
                              <div className="text-xs text-gray-500 truncate" title={o.designer.studio}>{o.designer.studio}</div>
                            )}
                          </>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {o.payment_month ? formatPaymentMonth(o.payment_month) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {o.order_probability ? (
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${PROBABILITY_COLOR[o.order_probability]}`}>
                            {o.order_probability_display}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
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
                      <td className="px-3 py-2 text-gray-600 text-xs">{o.kp_number || '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {o.order_amount == null ? '—' : rubles.format(Number(o.order_amount))}
                      </td>
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
