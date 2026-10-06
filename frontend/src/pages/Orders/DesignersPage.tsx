import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { designersAPI } from '../../api/orders'
import { useAuthStore } from '../../store/authStore'
import { Designer } from '../../types/orders'
import { DesignerForm } from '../../components/orders/OrderSalesFieldsBlock'

/**
 * Справочник дизайнеров: список своего города (админу — любого), поиск, новая
 * карточка и правка. Раньше завести или поправить дизайнера можно было только
 * из формы заказа, и менеджеры не находили, где это делается.
 */
const DesignersPage = () => {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [designers, setDesigners] = useState<Designer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [cities, setCities] = useState<{ id: number; name: string }[]>([])
  const [cityId, setCityId] = useState<number | null>(null)

  useEffect(() => {
    if (isAdmin) apiClient.get('/cities/').then((r) => setCities(r.data.results || r.data)).catch(() => {})
  }, [isAdmin])

  const load = () => {
    setIsLoading(true)
    setError(null)
    designersAPI.directory(isAdmin ? cityId : null)
      .then(setDesigners)
      .catch(() => setError('Не удалось загрузить дизайнеров'))
      .finally(() => setIsLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [cityId, isAdmin])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return designers
    const digits = q.replace(/\D/g, '')
    const phoneQuery = digits.length > 1 && digits[0] === '8' ? `7${digits.slice(1)}` : digits
    return designers.filter((d) =>
      d.full_name.toLowerCase().includes(q)
      || (d.studio || '').toLowerCase().includes(q)
      || (phoneQuery.length >= 3 && d.phone.replace(/\D/g, '').includes(phoneQuery)))
  }, [designers, search])

  const saved = (d: Designer) => {
    setDesigners((list) => {
      const rest = list.filter((x) => x.id !== d.id)
      const prev = list.find((x) => x.id === d.id)
      return [...rest, { ...d, orders_count: prev?.orders_count ?? 0 }]
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
    })
    setCreating(false)
    setEditingId(null)
  }

  if (user && !['manager', 'leader', 'admin'].includes(user.role)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-6 rounded-xl">Справочник дизайнеров вам недоступен</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Дизайнеры</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin ? 'Дизайнеры всех городов' : 'Дизайнеры вашего города'} — заведение и правка карточек
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => { setCreating(true); setEditingId(null) }}
            disabled={isAdmin && !cityId}
            title={isAdmin && !cityId ? 'Сначала выберите город — дизайнер заводится в нём' : undefined}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50"
          >
            + Новый дизайнер
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск: фамилия, имя, студия или телефон"
          className="flex-1 min-w-[220px] rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
        />
        {isAdmin && (
          <select
            value={cityId ?? ''}
            onChange={(e) => setCityId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="">Все города</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {creating && (
        <div className="mb-4">
          <DesignerForm cityId={isAdmin ? cityId : null} onCancel={() => setCreating(false)} onSaved={saved} />
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>}

      {isLoading ? (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center text-gray-500">
          {search.trim() ? `По запросу «${search.trim()}» дизайнеров нет` : 'Дизайнеров пока нет — заведите первую карточку'}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
          {shown.map((d) => (
            <div key={d.id} className="p-4">
              {editingId === d.id ? (
                <DesignerForm initial={d} cityId={d.city} onCancel={() => setEditingId(null)} onSaved={saved} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">{d.full_name}</div>
                    <div className="text-gray-600">
                      {d.phone}
                      {d.studio && <> · {d.studio}</>}
                      {d.bonus_percent != null && <> · бонус {d.bonus_percent}%</>}
                      {isAdmin && d.city_name && <> · {d.city_name}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {d.orders_count ? (
                      <Link
                        to={`/orders/reports/designers/${d.id}`}
                        className="text-sm text-gray-600 hover:text-primary-600 hover:underline"
                        title="Заказы дизайнера в отчёте"
                      >
                        Заказов: {d.orders_count}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-400">Заказов нет</span>
                    )}
                    <button
                      type="button"
                      onClick={() => { setEditingId(d.id); setCreating(false) }}
                      className="text-sm font-medium text-primary-600 hover:text-primary-700"
                    >
                      Редактировать
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DesignersPage
