import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { serviceManagerReportAPI, ServiceManagerReport as Report } from '../../api/serviceManagerReport'
import { useAuthStore } from '../../store/authStore'
import { formatDay, formatRub, periodPresets } from './DesignerReportFilters'
import { ReportTile } from './DesignerReportOrders'

const RATE_KEY = 'reports:sm-opening-rate'
const KM_RATE_KEY = 'reports:sm-km-rate'

const readStored = (key: string) => {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

const storeValue = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Хранилище недоступно — ставка просто не запомнится
  }
}

const formatKm = (km: string | number) => `${Number(km).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`

const inputCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'

/**
 * Расчёт зарплаты сервис-менеджеров: проёмы в выполненных за период замерах
 * (панель в проёме считается ещё одним проёмом) × ставка за проём + километры
 * удалённости «включить в счёт» × ставка за км. Ставки вводит руководитель;
 * они запоминаются в этом браузере.
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
  const [rate, setRate] = useState(() => readStored(RATE_KEY))
  const [kmRate, setKmRate] = useState(() => readStored(KM_RATE_KEY))
  const [report, setReport] = useState<Report | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

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

  const cleanMoney = (value: string) => value.replace(/[^\d.,]/g, '').replace(',', '.')
  const changeRate = (value: string) => { const v = cleanMoney(value); setRate(v); storeValue(RATE_KEY, v) }
  const changeKmRate = (value: string) => { const v = cleanMoney(value); setKmRate(v); storeValue(KM_RATE_KEY, v) }

  const rateNumber = Number(rate) > 0 ? Number(rate) : 0
  const kmRateNumber = Number(kmRate) > 0 ? Number(kmRate) : 0
  // К выплате: (проёмы + панели) × ставка + км «в счёт» × ставка за км. Без ставок — не считаем
  const salary = (openings: number, km: string) =>
    rateNumber || kmRateNumber ? openings * rateNumber + Number(km) * kmRateNumber : null

  const toggle = (id: number) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Зарплата сервис-менеджеров</h1>
        <p className="text-sm text-gray-500 mt-1">Проёмы в выполненных за период замерах (панели считаются как проёмы) × ставка за проём + километры удалённости «включить в счёт» × ставка за км</p>
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
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
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ставка за проём, ₽</label>
            <input
              type="text"
              inputMode="decimal"
              value={rate}
              onChange={(e) => changeRate(e.target.value)}
              placeholder="Например, 500"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ставка за км, ₽</label>
            <input
              type="text"
              inputMode="decimal"
              value={kmRate}
              onChange={(e) => changeKmRate(e.target.value)}
              placeholder="Например, 20"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>}

      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <ReportTile label="Сервис-менеджеров" value={report.totals.service_managers_count} />
          <ReportTile label="Выполнено замеров" value={report.totals.measurements_count} />
          <ReportTile
            label="Проёмов к оплате"
            value={report.totals.paid_openings_count}
          />
          <ReportTile label="Удалённость в счёт" value={formatKm(report.totals.distance_km_invoice)} />
          {(() => {
            const total = salary(report.totals.paid_openings_count, report.totals.distance_km_invoice)
            return (
              <ReportTile
                label="К выплате всего"
                value={total !== null ? formatRub(total) : 'укажите ставку'}
                accent={total !== null ? 'text-green-700' : 'text-gray-400 text-base'}
              />
            )
          })()}
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
                  <th className="px-4 py-3 text-right">Проёмов к оплате</th>
                  <th className="px-4 py-3 text-right">За проёмы</th>
                  <th className="px-4 py-3 text-right">Км в счёт</th>
                  <th className="px-4 py-3 text-right">За км</th>
                  <th className="px-4 py-3 text-right">К выплате</th>
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
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="font-medium text-gray-900">{row.paid_openings_count}</div>
                          {row.panels_count > 0 && (
                            <div className="text-xs text-gray-500">{row.openings_count} проём. + {row.panels_count} пан.</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-gray-600">
                          {rateNumber ? formatRub(row.paid_openings_count * rateNumber) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-gray-900">{formatKm(row.distance_km_invoice)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-gray-600">
                          {kmRateNumber ? formatRub(Number(row.distance_km_invoice) * kmRateNumber) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-green-700">
                          {formatRub(salary(row.paid_openings_count, row.distance_km_invoice))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => toggle(sm.id)}
                            className="text-sm font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap"
                          >
                            {isOpen ? 'Скрыть замеры' : 'Замеры'}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} className="bg-gray-50 px-4 py-3">
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm divide-y divide-gray-200 bg-white">
                                <thead className="bg-gray-50">
                                  <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                                    <th className="px-3 py-2">Выполнен</th>
                                    <th className="px-3 py-2">Замер</th>
                                    <th className="px-3 py-2">Клиент / адрес</th>
                                    <th className="px-3 py-2">№ КП</th>
                                    <th className="px-3 py-2">Салон / менеджер</th>
                                    <th className="px-3 py-2 text-right">Проёмов к оплате</th>
                                    <th className="px-3 py-2">Удалённость</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {row.measurements.map((m) => (
                                    <tr key={m.id} className="align-top">
                                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDay(m.done_at)}</td>
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        <Link to={`/measurements/${m.id}`} className="text-primary-600 hover:underline">№{m.id}</Link>
                                        <span className="text-gray-400"> · </span>
                                        <Link to={`/orders/${m.order_id}`} className="text-primary-600 hover:underline">заказ #{m.order_id}</Link>
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="font-medium text-gray-900">{m.client_name}</div>
                                        {m.address && <div className="text-xs text-gray-500 max-w-[260px]">{m.address}</div>}
                                      </td>
                                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{m.kp_number || '—'}</td>
                                      <td className="px-3 py-2 text-gray-700">
                                        <div>{m.salon_name}</div>
                                        <div className="text-xs text-gray-500">{m.manager_name}</div>
                                      </td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <div className="text-gray-900">{m.paid_openings_count}</div>
                                        {m.panels_count > 0 && (
                                          <div className="text-xs text-gray-500">{m.openings_count} + {m.panels_count} пан.</div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        {m.distance_payment ? (
                                          <>
                                            <div className={m.distance_payment === 'invoice' ? 'font-medium text-gray-900' : 'text-gray-500'}>
                                              {m.distance_km ? formatKm(m.distance_km) : '—'}
                                            </div>
                                            <div className="text-xs text-gray-500">{m.distance_payment_display}</div>
                                          </>
                                        ) : <span className="text-gray-400">—</span>}
                                      </td>
                                    </tr>
                                  ))}
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
