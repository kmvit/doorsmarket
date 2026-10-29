import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { installationsAPI } from '../../api/installations'
import {
  Installation, InstallationStatus, INSTALLATION_STATUS_COLOR, INSTALLATION_STATUS_DISPLAY,
  INSTALLATION_STATUS_ORDER, canCreateInstallation, canEditSchedule, formatDate, formatPeriod,
} from '../../types/installations'
import { usePersistedState } from '../../utils/persistedState'
import MultiSelect, { toArray } from '../../components/common/MultiSelect'
import PhoneLink from '../../components/common/PhoneLink'
import FileViewer from '../../components/common/FileViewer'
import PeopleFilters, {
  canFilterByPeople, normalizePeopleFilter, EMPTY_PEOPLE_FILTER, PeopleFilterValue,
} from '../../components/orders/PeopleFilters'
import OrderPickerModal from './OrderPickerModal'
import InstallationsTabs from './InstallationsTabs'
import AssignModal from '../../components/installations/AssignModal'
import OfflinePrefetchButton from '../../components/common/OfflinePrefetchButton'

// Папки с главной (?folder=)
const FOLDER_LABELS: Record<string, string> = {
  to_assign: 'Назначить монтаж',
  planned: 'Запланирован',
  not_ready: 'Не готов к монтажу',
  irrelevant_requested: 'Неактуален? Подтвердить',
  reschedule_requested: 'Перенос даты? Подтвердить',
  awaiting_signature: 'Ожидает подписи клиента',
  act_review: 'Проверить акт клиента',
}

const STATUS_OPTIONS = INSTALLATION_STATUS_ORDER.map((value) => ({ value, label: INSTALLATION_STATUS_DISPLAY[value] }))

type PaidFilter = '' | 'paid' | 'unpaid'

const InstallationList = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [items, setItems] = useState<Installation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ url: string; name: string } | null>(null)
  const [pickingOrder, setPickingOrder] = useState(false)
  const [assigning, setAssigning] = useState<Installation | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const folder = searchParams.get('folder') || ''
  const mineParam = searchParams.get('mine') === '1'
  const canAssign = canEditSchedule(user?.role)

  const [search, setSearch] = usePersistedState('installations:search', '')
  const [rawStatus, setStatus] = usePersistedState<InstallationStatus[]>('installations:status', [])
  const status = toArray<InstallationStatus>(rawStatus)
  const [paid, setPaid] = usePersistedState<PaidFilter>('installations:paid', '')
  const [mine, setMine] = usePersistedState('installations:mine', false)
  // «Кроме выполненных» — по умолчанию включено
  const [excludeClosed, setExcludeClosed] = usePersistedState('installations:exclude_closed', true)
  const [rawPeople, setPeople] = usePersistedState<PeopleFilterValue>('installations:people', EMPTY_PEOPLE_FILTER)
  const people = normalizePeopleFilter(rawPeople)
  const byPeople = canFilterByPeople(user?.role)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setItems(await installationsAPI.getList({
        search: search || undefined,
        status,
        is_paid: paid === '' ? undefined : paid === 'paid',
        mine: mine || undefined,
        exclude_closed: excludeClosed || undefined,
        cities: byPeople ? people.cities : undefined,
        salons: byPeople ? people.salons : undefined,
        managers: byPeople ? people.managers : undefined,
        folder: folder || undefined,
      }))
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки монтажей')
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, rawStatus, paid, mine, excludeClosed, rawPeople, byPeople, folder])

  // С главной менеджер приходит с ?mine=1 — плитки считают монтажи по его заказам
  useEffect(() => {
    if (mineParam) setMine(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineParam])

  const clearFolder = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('folder')
    next.delete('mine')
    setSearchParams(next)
  }

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  const th = 'px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
  const td = 'px-3 py-3 text-sm text-gray-700 align-top'

  return (
    <div className="container mx-auto px-4 py-6 max-w-[1600px]">
      <InstallationsTabs active="list" />
      {/* Монтажнику — офлайн-копия его монтажей с документами перед выездом */}
      {user?.role === 'installer' && <OfflinePrefetchButton target="installations" />}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Монтажи</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} монтаж(ей)</p>
        </div>
        {canCreateInstallation(user?.role) && (
          <button
            type="button"
            onClick={() => setPickingOrder(true)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-cyan-600 hover:from-primary-700 hover:to-cyan-700 rounded-xl shadow-md transition-all"
          >
            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Оформить монтаж
          </button>
        )}
      </div>

      {folder && (
        <div className="mb-4 flex items-center gap-2 text-sm bg-primary-50 border border-primary-200 text-primary-800 rounded-xl px-4 py-2">
          <span>Папка: <strong>{FOLDER_LABELS[folder] || folder}</strong></span>
          <button onClick={clearFolder} className="ml-auto text-primary-600 hover:underline">Сбросить ✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Поиск</label>
          <input
            type="text"
            placeholder="№ монтажа или заказа, клиент, адрес, телефон..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Статус</label>
          <MultiSelect
            options={STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
            placeholder="Все статусы"
            className="w-56 rounded-lg border-gray-300 shadow-sm text-sm px-3 py-2 focus:border-primary-500 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Оплата</label>
          <select
            value={paid}
            onChange={(e) => setPaid(e.target.value as PaidFilter)}
            className="rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="">Все</option>
            <option value="paid">Оплаченные</option>
            <option value="unpaid">Неоплаченные</option>
          </select>
        </div>
        <PeopleFilters role={user?.role} value={people} onChange={setPeople} />
        {user?.role === 'manager' && (
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Мои заказы
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={excludeClosed}
            onChange={(e) => setExcludeClosed(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Кроме выполненных
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-5xl mb-4">🛠️</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Монтажей нет</h2>
          <p className="text-gray-500">
            {search || status.length || paid ? 'Ничего не найдено по выбранным фильтрам' : 'Монтажи ещё не оформляли'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>№</th>
                  <th className={th}>Статус</th>
                  <th className={th}>Клиент</th>
                  <th className={th}>Контактное лицо</th>
                  <th className={th}>Менеджер / салон</th>
                  <th className={th}>Что смонтировать</th>
                  <th className={th}>Коллекция, покрытие</th>
                  <th className={th}>Доставка</th>
                  <th className={th}>Пожелания</th>
                  <th className={th}>Документы</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it) => {
                  const docs = [
                    ...it.order_documents.map((d) => ({ key: `${d.kind}-${d.file_url}`, name: d.name, url: d.file_url })),
                    ...it.files.map((f) => ({ key: `f${f.id}`, name: f.kind_display, url: f.file_url || '' })),
                  ]
                  return (
                    <tr
                      key={it.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/orders/installations/${it.id}`)}
                    >
                      <td className={`${td} whitespace-nowrap`}>
                        <Link
                          to={`/orders/installations/${it.id}`}
                          className="text-primary-600 font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          #{it.id}
                        </Link>
                        <div className="text-xs text-gray-500">
                          заказ{' '}
                          <Link
                            to={`/orders/${it.order}`}
                            className="hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            #{it.order}
                          </Link>
                        </div>
                      </td>
                      <td className={td}>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${INSTALLATION_STATUS_COLOR[it.status]}`}>
                          {it.status_display}
                        </span>
                        {it.status === 'planned' && it.current_visit && (
                          <div className="mt-1 text-xs text-gray-700 whitespace-nowrap">
                            <span className="font-semibold">{formatPeriod(it.current_visit.date_from, it.current_visit.date_to)}</span>
                            {' · '}{it.current_visit.installers.map((u) => u.full_name).join(', ')}
                          </div>
                        )}
                        <div className={`mt-1 text-xs font-medium ${it.is_paid ? 'text-green-700' : 'text-red-600'}`}>
                          {it.is_paid ? 'Оплачен' : 'Не оплачен'}
                        </div>
                        {it.rating_overall && (
                          <div className="mt-1 text-xs text-amber-600 whitespace-nowrap" title="Оценка клиента: общее впечатление">
                            ★ {it.rating_overall}/5
                          </div>
                        )}
                        {it.irrelevant_requested_at && (
                          <div className="mt-1 text-xs font-medium text-gray-600">Помечен неактуальным</div>
                        )}
                        {canAssign && ['not_planned', 'partially_done', 'planned'].includes(it.status) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setAssigning(it) }}
                            className="mt-1 text-xs font-medium text-primary-600 hover:underline"
                          >
                            {it.status === 'planned' ? 'Изменить' : 'Назначить'}
                          </button>
                        )}
                      </td>
                      <td className={td}>
                        <div className="font-medium text-gray-900">{it.client_name}</div>
                        {it.address && <div className="text-xs text-gray-500 max-w-[220px]">{it.address}</div>}
                      </td>
                      <td className={td}>
                        <div>{it.contact_name || '—'}</div>
                        {it.contact_phone && <PhoneLink phone={it.contact_phone} className="text-xs" stopPropagation />}
                      </td>
                      <td className={td}>
                        <div>{it.manager_name}</div>
                        <div className="text-xs text-gray-500">{it.salon_name}</div>
                      </td>
                      <td className={`${td} max-w-[240px] whitespace-pre-line`}>{it.work_description}</td>
                      <td className={`${td} max-w-[200px]`}>{it.collection_finish}</td>
                      <td className={`${td} whitespace-nowrap`}>{formatDate(it.planned_delivery_date)}</td>
                      <td className={`${td} max-w-[220px] whitespace-pre-line text-xs`}>{it.desired_date_comment || '—'}</td>
                      <td className={td}>
                        <ul className="space-y-0.5">
                          {docs.map((d) => (
                            <li key={d.key}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setViewing({ url: d.url, name: d.name }) }}
                                className="text-xs text-primary-600 hover:underline text-left whitespace-nowrap"
                              >
                                {d.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewing && <FileViewer fileUrl={viewing.url} fileName={viewing.name} onClose={() => setViewing(null)} />}
      {assigning && (
        <AssignModal
          installation={assigning}
          onClose={() => setAssigning(null)}
          onDone={() => { setAssigning(null); load() }}
        />
      )}
      {pickingOrder && (
        <OrderPickerModal
          onClose={() => setPickingOrder(false)}
          onPick={(orderId) => navigate(`/orders/installations/new?order=${orderId}`)}
        />
      )}
    </div>
  )
}

export default InstallationList
