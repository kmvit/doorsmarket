import { useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'
import { ordersAPI } from '../../api/orders'
import { salonsAPI } from '../../api/salons'
import { OrderManager, Salon } from '../../types/orders'
import MultiSelect from '../common/MultiSelect'

export interface PeopleFilterValue {
  cities: string[]
  salons: string[]
  managers: string[]
}

export const EMPTY_PEOPLE_FILTER: PeopleFilterValue = { cities: [], salons: [], managers: [] }

/** Фильтры «город / салон / менеджер» видны руководителю и админу. */
export const canFilterByPeople = (role?: string) => role === 'leader' || role === 'admin'

/** Значение из sessionStorage старого формата (до городов и салонов) → новый вид. */
export const normalizePeopleFilter = (v: unknown): PeopleFilterValue => {
  const o = (v && typeof v === 'object' && !Array.isArray(v)) ? v as Partial<PeopleFilterValue> : {}
  const arr = (x: unknown) => (Array.isArray(x) ? x.map(String) : [])
  return { cities: arr(o.cities), salons: arr(o.salons), managers: arr(o.managers) }
}

export const hasPeopleFilter = (v: PeopleFilterValue) =>
  v.cities.length > 0 || v.salons.length > 0 || v.managers.length > 0

interface Props {
  role?: string
  value: PeopleFilterValue
  onChange: (value: PeopleFilterValue) => void
  labelClassName?: string
  fieldClassName?: string
}

/**
 * Фильтры руководителя и админа в списках заказов, наработок и замеров.
 * Админу — города, салоны и менеджеры; руководителю — салоны и менеджеры его
 * города (город он видит только свой). Выбранный город сужает список салонов и
 * менеджеров, выбранный салон — список менеджеров; то, что из выбора выпало,
 * снимается, чтобы не оставалось невидимых условий.
 */
const PeopleFilters = ({
  role, value, onChange,
  labelClassName = 'block text-xs font-medium text-gray-600 mb-1',
  fieldClassName = 'w-48 rounded-lg border-gray-300 shadow-sm text-sm px-3 py-2',
}: Props) => {
  const isAdmin = role === 'admin'
  const [cities, setCities] = useState<{ id: number; name: string }[]>([])
  const [salons, setSalons] = useState<Salon[]>([])
  const [managers, setManagers] = useState<OrderManager[]>([])

  useEffect(() => {
    salonsAPI.getAll().then(setSalons).catch(() => {})
    if (isAdmin) apiClient.get('/cities/').then((r) => setCities(r.data.results || r.data)).catch(() => {})
  }, [isAdmin])

  const visibleSalons = useMemo(
    () => (value.cities.length ? salons.filter((s) => value.cities.includes(String(s.city))) : salons),
    [salons, value.cities],
  )

  // Менеджеры — под выбранные города и салоны
  const scopeKey = `${value.cities.join(',')}|${value.salons.join(',')}`
  useEffect(() => {
    let cancelled = false
    ordersAPI.getManagers({ cities: value.cities, salons: value.salons })
      .then((list) => { if (!cancelled) setManagers(list) })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

  // Снимаем выбор, который больше не подходит (салон чужого города, менеджер не из салона)
  useEffect(() => {
    if (!salons.length) return
    const allowed = new Set(visibleSalons.map((s) => String(s.id)))
    const kept = value.salons.filter((id) => allowed.has(id))
    if (kept.length !== value.salons.length) onChange({ ...value, salons: kept })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSalons])

  useEffect(() => {
    if (!managers.length) return
    const allowed = new Set(managers.map((m) => String(m.id)))
    const kept = value.managers.filter((id) => allowed.has(id))
    if (kept.length !== value.managers.length) onChange({ ...value, managers: kept })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managers])

  if (!canFilterByPeople(role)) return null

  return (
    <>
      {isAdmin && (
        <div>
          <label className={labelClassName}>Город</label>
          <MultiSelect
            options={cities.map((c) => ({ value: String(c.id), label: c.name }))}
            value={value.cities}
            onChange={(next) => onChange({ ...value, cities: next })}
            placeholder="Все города"
            className={fieldClassName}
          />
        </div>
      )}
      {visibleSalons.length > 1 || value.salons.length > 0 ? (
        <div>
          <label className={labelClassName}>Салон</label>
          <MultiSelect
            options={visibleSalons.map((s) => ({ value: String(s.id), label: s.name }))}
            value={value.salons}
            onChange={(next) => onChange({ ...value, salons: next })}
            placeholder="Все салоны"
            className={fieldClassName}
          />
        </div>
      ) : null}
      <div>
        <label className={labelClassName}>Менеджер</label>
        <MultiSelect
          options={managers.map((m) => ({ value: String(m.id), label: m.full_name }))}
          value={value.managers}
          onChange={(next) => onChange({ ...value, managers: next })}
          placeholder="Все менеджеры"
          className={fieldClassName}
        />
      </div>
    </>
  )
}

export default PeopleFilters
