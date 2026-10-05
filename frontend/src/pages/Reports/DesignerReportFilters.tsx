import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { salonsAPI } from '../../api/salons'
import { DesignerReportFilters } from '../../api/designerReport'
import { useAuthStore } from '../../store/authStore'
import { OrderStatus, ORDER_STATUS_DISPLAY, ORDER_STATUS_ORDER, Salon } from '../../types/orders'
import MultiSelect from '../../components/common/MultiSelect'
import ManagerFilter from '../../components/orders/ManagerFilter'

const STATUS_OPTIONS = ORDER_STATUS_ORDER.map((value) => ({ value, label: ORDER_STATUS_DISPLAY[value] }))

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])

/**
 * Фильтры отчёта живут в адресной строке: из списка дизайнеров в карточку
 * дизайнера и обратно период и отборы переходят вместе со ссылкой.
 */
export function useReportFilters() {
  const [params, setParams] = useSearchParams()
  const filters: DesignerReportFilters = useMemo(() => ({
    date_from: params.get('date_from') || '',
    date_to: params.get('date_to') || '',
    city: params.get('city') || '',
    salon: params.get('salon') || '',
    managers: list(params.get('managers')),
    statuses: list(params.get('statuses')).filter((s): s is OrderStatus => s in ORDER_STATUS_DISPLAY),
  }), [params])

  const setFilters = (next: Partial<DesignerReportFilters>) => {
    const merged = { ...filters, ...next }
    const out = new URLSearchParams()
    if (merged.date_from) out.set('date_from', merged.date_from)
    if (merged.date_to) out.set('date_to', merged.date_to)
    if (merged.city) out.set('city', merged.city)
    if (merged.salon) out.set('salon', merged.salon)
    if (merged.managers.length) out.set('managers', merged.managers.join(','))
    if (merged.statuses.length) out.set('statuses', merged.statuses.join(','))
    setParams(out, { replace: true })
  }

  return [filters, setFilters, params.toString()] as const
}

export const formatRub = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '—'
  return `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`
}

export const formatDay = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Быстрый выбор периода — общий для отчётов. */
export function periodPresets() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  return [
    { label: 'Этот месяц', from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) },
    { label: 'Прошлый месяц', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { label: 'Этот год', from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) },
    { label: 'Всё время', from: '', to: '' },
  ]
}

const inputCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'

interface Props {
  filters: DesignerReportFilters
  onChange: (next: Partial<DesignerReportFilters>) => void
}

const DesignerReportFilterBar = ({ filters, onChange }: Props) => {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [salons, setSalons] = useState<Salon[]>([])
  const [cities, setCities] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    salonsAPI.getAll().then(setSalons).catch(() => {})
    // Город выбирает только админ: руководитель и так видит лишь свой
    if (isAdmin) apiClient.get('/cities/').then((r) => setCities(r.data.results || r.data)).catch(() => {})
  }, [isAdmin])

  const visibleSalons = filters.city ? salons.filter((s) => String(s.city) === filters.city) : salons

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {periodPresets().map((p) => {
          const active = filters.date_from === p.from && filters.date_to === p.to
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ date_from: p.from, date_to: p.to })}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${
                active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Заказы с</label>
          <input type="date" value={filters.date_from} onChange={(e) => onChange({ date_from: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">по</label>
          <input type="date" value={filters.date_to} onChange={(e) => onChange({ date_to: e.target.value })} className={inputCls} />
        </div>
        {isAdmin && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Город</label>
            <select
              value={filters.city}
              // Салон другого города при смене города сбрасываем
              onChange={(e) => onChange({ city: e.target.value, salon: '' })}
              className={inputCls}
            >
              <option value="">Все города</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Салон</label>
          <select value={filters.salon} onChange={(e) => onChange({ salon: e.target.value })} className={inputCls}>
            <option value="">Все салоны</option>
            {visibleSalons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Менеджер</label>
          <ManagerFilter
            value={filters.managers}
            onChange={(managers) => onChange({ managers })}
            cities={filters.city ? [filters.city] : []}
            salons={filters.salon ? [filters.salon] : []}
            className="w-full rounded-lg border-gray-300 shadow-sm text-sm px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Статус заказа</label>
          <MultiSelect
            options={STATUS_OPTIONS}
            value={filters.statuses}
            onChange={(statuses) => onChange({ statuses })}
            placeholder="Все статусы"
            className="w-full rounded-lg border-gray-300 shadow-sm text-sm px-3 py-2"
          />
        </div>
      </div>
    </div>
  )
}

export default DesignerReportFilterBar
