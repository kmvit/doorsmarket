import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { serviceManagerReportAPI, ServiceManagerReport as Report } from '../../api/serviceManagerReport'
import { useAuthStore } from '../../store/authStore'
import { formatDay, formatRub, periodPresets } from './DesignerReportFilters'
import { ReportTile } from './DesignerReportOrders'

const inputCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'

const formatKm = (km: string | number) => `${Number(km).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`

/**
 * Отчёт по замерам для расчёта зарплаты сервис-менеджеров — по образцу
 * «Отчет по замерам.xlsx». Тарифы считает сервер: сумма по замеру — по шкале
 * от количества проёмов (проёмы + панели), удалённость — км × 30 ₽, если не
 * оплачена на месте. Итого по замеру = сумма + удалённость.
 */
const ServiceManagerReport = () => {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  // Зарплату обычно считают за прошлый месяц
  const [period, setPeriod] = useState(() => {
    const p = periodPresets()[1]
    return { date_from: p.from, date_to: p.to }
  })
  const [city, setCity] = useState('')
  const [cities, setCities] = useState<{ id: number; name: string }[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin) apiClient.get('/cities/').then((r) => setCities(r.data.results || r.data)).catch(() => {})
  }, [isAdmin])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    serviceManagerReportAPI.get({ ...period, city })
      .then((data) => { if (!cancelled) setReport(data) })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.detail || 'Не удалось загрузить отчёт') })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [period, city])

  const toggle = (id: number) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const download = async (key: string, filename: string, serviceManager?: number) => {
    setDownloading(key)
    try {
      await serviceManagerReportAPI.downloadXlsx({ ...period, city, service_manager: serviceManager }, filename)
    } catch {
      setError('Не удалось скачать отчёт')
    } finally {
      setDownloading(null)
    }
  }

  const periodLabel = [period.date_from, period.date_to].filter(Boolean).join('_') || 'всё-время'

  if (user && !['leader', 'admin'].includes(user.role)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-6 rounded-xl">Отчёт доступен руководителю</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <Link to="/orders/reports" className="inline-flex items-center text-sm text-primary-600 hover:underline mb-3">
        ← Отчёты
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Отчёт по замерам</h1>
          <p className="text-sm text-gray-500 mt-1">Расчёт зарплаты сервис-менеджеров за выполненные замеры</p>
        </div>
        {report && report.service_managers.length > 0 && (
          <button
            type="button"
            onClick={() => download('all', `Отчет_по_замерам_${periodLabel}.xlsx`)}
            disabled={downloading !== null}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl disabled:opacity-50"
          >
            {downloading === 'all' ? 'Готовим файл…' : 'Скачать Excel (все СМ)'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {periodPresets().map((p) => {
            const active = period.date_from === p.from && period.date_to === p.to
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setPeriod({ date_from: p.from, date_to: p.to })}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${
                  active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Выполнены с</label>
            <input
              type="date"
              value={period.date_from}
              onChange={(e) => setPeriod((p) => ({ ...p, date_from: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">по</label>
            <input
              type="date"
              value={period.date_to}
              onChange={(e) => setPeriod((p) => ({ ...p, date_to: e.target.value }))}
              className={inputCls}
            />
          </div>
          {isAdmin && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Город</label>
              <select value={city} onChange={(e) => setCity(e.target.value)} className={inputCls}>
                <option value="">Все города</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {report && (
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer select-none">Как считается</summary>
            <div className="mt-2 space-y-1">
              <div>
                Сумма по замеру — по количеству проёмов (все проёмы и все панели):{' '}
                {report.tariff.openings.map((t, i) => {
                  const from = i === 0 ? 1 : report.tariff.openings[i - 1].up_to + 1
                  return `${from}–${t.up_to} — ${formatRub(t.amount)}`
                }).join(', ')}.
              </div>
              <div>Удалённость — {formatRub(report.tariff.distance_rate)} за км, если не оплачена на месте.</div>
              <div>Итого по замеру = сумма по замеру + удалённость. Итого за месяц — сумма по всем замерам.</div>
            </div>
          </details>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>}

      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <ReportTile label="Сервис-менеджеров" value={report.totals.service_managers_count} />
          <ReportTile label="Замеров" value={report.totals.measurements_count} />
          <ReportTile label="Проёмов" value={report.totals.openings_total} />
          <ReportTile label="Итого к выплате" value={formatRub(report.totals.total)} accent="text-green-700" />
        </div>
      )}

      {isLoading && !report ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : report && report.service_managers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          За выбранный период выполненных замеров нет
        </div>
      ) : report && (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${isLoading ? 'opacity-60' : ''}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-3">Сервис-менеджер</th>
                  <th className="px-4 py-3 text-right">Замеров</th>
                  <th className="px-4 py-3 text-right">Проёмов</th>
                  <th className="px-4 py-3 text-right">Сумма по замерам</th>
                  <th className="px-4 py-3 text-right">Удалённость</th>
                  <th className="px-4 py-3 text-right">Итого за месяц</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.service_managers.map((row) => {
                  const sm = row.service_manager
                  const isOpen = expanded.has(sm.id)
                  return (
                    <Fragment key={sm.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{sm.full_name}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{row.measurements_count}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{row.openings_total}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-gray-700">{formatRub(row.measurements_sum)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-gray-700">{formatRub(row.distance_sum)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-green-700">{formatRub(row.total)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggle(sm.id)}
                            className="text-sm font-medium text-primary-600 hover:text-primary-700"
                          >
                            {isOpen ? 'Скрыть' : 'Отчёт'}
                          </button>
                          <button
                            type="button"
                            onClick={() => download(`sm-${sm.id}`, `Отчет_по_замерам_${sm.full_name}_${periodLabel}.xlsx`, sm.id)}
                            disabled={downloading !== null}
                            className="ml-3 text-sm font-medium text-green-700 hover:text-green-800 disabled:opacity-50"
                          >
                            {downloading === `sm-${sm.id}` ? '…' : 'Excel'}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="bg-gray-50 px-4 py-3">
                            <div className="overflow-x-auto">
                              {/* Столбцы — как в образце «Отчет по замерам.xlsx» */}
                              <table className="min-w-full text-sm divide-y divide-gray-200 bg-white">
                                <thead className="bg-gray-50">
                                  <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                                    <th className="px-3 py-2">№</th>
                                    <th className="px-3 py-2">Дата</th>
                                    <th className="px-3 py-2">Адрес</th>
                                    <th className="px-3 py-2">№ заказа</th>
                                    <th className="px-3 py-2">Менеджер</th>
                                    <th className="px-3 py-2">Оплачен / не оплачен</th>
                                    <th className="px-3 py-2 text-right">Проёмов</th>
                                    <th className="px-3 py-2 text-right">Сумма по замеру</th>
                                    <th className="px-3 py-2 text-right">Удалённость</th>
                                    <th className="px-3 py-2 text-right">Итого по замеру</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {row.measurements.map((m) => (
                                    <tr key={m.id} className="align-top">
                                      <td className="px-3 py-2 text-gray-500">{m.number}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDay(m.done_at)}</td>
                                      <td className="px-3 py-2 min-w-[180px]">
                                        <div className="text-gray-900">{m.address || '—'}</div>
                                        <div className="text-xs text-gray-500">{m.client_name}</div>
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        <Link to={`/orders/${m.order_id}`} className="text-primary-600 hover:underline">#{m.order_id}</Link>
                                        <div className="text-xs">
                                          <Link to={`/measurements/${m.id}`} className="text-gray-500 hover:underline">замер №{m.id}</Link>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-gray-700">{m.manager_name}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{m.payment_status || '—'}</td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <div className="text-gray-900">{m.openings_total}</div>
                                        {m.panels_count > 0 && (
                                          <div className="text-xs text-gray-500">{m.openings_count} + {m.panels_count} пан.</div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <div className="text-gray-900">{formatRub(m.measurement_sum)}</div>
                                        {m.tariff_exceeded && (
                                          <div className="text-xs text-amber-600">больше 60 проёмов — проверьте</div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <div className="text-gray-900">{formatRub(m.distance_sum)}</div>
                                        {m.distance_km && Number(m.distance_km) > 0 && (
                                          <div className="text-xs text-gray-500">{formatKm(m.distance_km)}</div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-gray-900">{formatRub(m.total)}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-gray-50 font-semibold">
                                    <td className="px-3 py-2" colSpan={6}>Итого за месяц</td>
                                    <td className="px-3 py-2 text-right">{row.openings_total}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatRub(row.measurements_sum)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatRub(row.distance_sum)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap text-green-700">{formatRub(row.total)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

export default ServiceManagerReport
