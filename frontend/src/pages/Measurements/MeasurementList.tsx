import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { measurementsAPI } from '../../api/measurements'
import { MeasurementListItem, MeasurementFolder } from '../../types/measurements'
import { ORDER_STATUS_COLOR } from '../../types/orders'
import OrdersMeasurementsSwitch from '../../components/orders/OrdersMeasurementsSwitch'

const FOLDERS: { key: MeasurementFolder; label: string; color: string }[] = [
  { key: '', label: 'Все', color: 'bg-gray-200 text-gray-800' },
  { key: 'unscheduled', label: 'Назначить замер', color: 'bg-blue-100 text-blue-700' },
  { key: 'scheduled', label: 'Запланированные', color: 'bg-cyan-100 text-cyan-700' },
  { key: 'today', label: 'Сегодня замер', color: 'bg-amber-100 text-amber-700' },
  { key: 'drafts', label: 'Черновики', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'done', label: 'Выполненные', color: 'bg-green-100 text-green-700' },
  { key: 'mine', label: 'Мои', color: 'bg-purple-100 text-purple-700' },
]

const VALID_FOLDERS: MeasurementFolder[] = ['', 'unscheduled', 'scheduled', 'today', 'drafts', 'done', 'mine']

const MeasurementList = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlFolder = searchParams.get('folder') as MeasurementFolder | null
  const [measurements, setMeasurements] = useState<MeasurementListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [folder, setFolder] = useState<MeasurementFolder>(
    urlFolder != null && VALID_FOLDERS.includes(urlFolder) ? urlFolder : 'unscheduled',
  )
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await measurementsAPI.list({ folder, search: search || undefined })
      setMeasurements(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки замеров')
    } finally {
      setIsLoading(false)
    }
  }, [folder, search])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Переключатель Заказы / Замеры */}
      <OrdersMeasurementsSwitch active="measurements" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Замеры</h1>
        <p className="text-sm text-gray-500 mt-1">Заявки на замер, запланированные и выполненные замеры</p>
      </div>

      {/* Папки-фильтры */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FOLDERS.map((f) => (
          <button
            key={f.key || 'all'}
            onClick={() => setFolder(f.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
              folder === f.key ? f.color + ' ring-2 ring-offset-1' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Поиск */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-4">
        <input
          type="text"
          placeholder="Поиск: № замера, № заказа, клиент, адрес, контакт, № КП, телефон…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border-gray-300 shadow-sm text-sm"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : measurements.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-5xl mb-4">📐</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Замеров нет</h2>
          <p className="text-gray-500">Ничего не найдено по выбранной папке</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Замер</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Заказ</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Клиент / адрес</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Контактное лицо</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Желаемая дата</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Назначено</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">СМ</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {measurements.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-primary-50 cursor-pointer"
                    onClick={() => navigate(`/measurements/${m.id}`)}
                  >
                    <td className="px-3 py-2 font-medium text-gray-900">№ {m.id}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/orders/${m.order_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary-600 font-medium hover:underline"
                      >
                        #{m.order_id}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{m.client_name}</div>
                      {m.address && <div className="text-xs text-gray-500 truncate max-w-[200px]">{m.address}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-gray-700">{m.contact_name}</div>
                      {m.contact_position && <div className="text-xs text-gray-500">{m.contact_position}</div>}
                      {m.contact_phone && (
                        <a
                          href={`tel:${m.contact_phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          {m.contact_phone}
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {m.desired_date ? new Date(m.desired_date).toLocaleDateString('ru-RU') : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {m.measurement_date ? (
                        <span className="text-sm text-gray-900">{formatDate(m.measurement_date)}</span>
                      ) : (
                        <span className="text-xs text-amber-700">не назначен</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-xs">{m.service_manager_name || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${ORDER_STATUS_COLOR[m.order_status]}`}>
                          {m.order_status_display}
                        </span>
                        {m.is_draft && !m.is_done && (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                            📝 Черновик
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default MeasurementList
