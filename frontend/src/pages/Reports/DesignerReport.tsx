import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { designerReportAPI, DesignerReport as Report } from '../../api/designerReport'
import { useAuthStore } from '../../store/authStore'
import { ORDER_STATUS_COLOR, ORDER_STATUS_DISPLAY, ORDER_STATUS_ORDER } from '../../types/orders'
import DesignerReportFilterBar, { formatRub, useReportFilters } from './DesignerReportFilters'
import DesignerReportOrders, { ReportTile } from './DesignerReportOrders'

/** Отчёт по дизайнерам: кто сколько заказов привёл, на какую сумму и сколько бонусов выплачено. */
const DesignerReport = () => {
  const { user } = useAuthStore()
  const [filters, setFilters, query] = useReportFilters()
  const [report, setReport] = useState<Report | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    designerReportAPI.get(filters)
      .then((data) => { if (!cancelled) setReport(data) })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.detail || 'Не удалось загрузить отчёт') })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
    // query — строковый слепок фильтров: объект filters пересоздаётся при каждом рендере
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

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
        <h1 className="text-2xl font-bold text-gray-900">Отчёт по дизайнерам</h1>
        <p className="text-sm text-gray-500 mt-1">Заказы, оформленные через дизайнеров, суммы и выплаченные бонусы</p>
      </div>

      <DesignerReportFilterBar filters={filters} onChange={setFilters} />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>}

      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <ReportTile label="Дизайнеров" value={report.totals.designers_count} />
          <ReportTile label="Заказов" value={report.totals.orders_count} />
          <ReportTile label="Сумма заказов" value={formatRub(report.totals.orders_amount)} />
          <ReportTile label="Выплачено бонусов" value={formatRub(report.totals.bonus_paid)} accent="text-green-700" />
        </div>
      )}

      {isLoading && !report ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : report && report.designers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          За выбранный период и по выбранным фильтрам заказов с дизайнерами нет
        </div>
      ) : report && (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${isLoading ? 'opacity-60' : ''}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-3">Дизайнер</th>
                  <th className="px-4 py-3">Заказы по статусам</th>
                  <th className="px-4 py-3 text-right">Заказов</th>
                  <th className="px-4 py-3 text-right">Сумма заказов</th>
                  <th className="px-4 py-3 text-right">Выплачено бонусов</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.designers.map((row) => {
                  const d = row.designer
                  const isOpen = expanded.has(d.id)
                  return (
                    <Fragment key={d.id}>
                      <tr className="hover:bg-gray-50 align-top">
                        <td className="px-4 py-3">
                          <Link
                            to={`/orders/reports/designers/${d.id}${query ? `?${query}` : ''}`}
                            className="font-medium text-primary-600 hover:underline"
                          >
                            {d.full_name}
                          </Link>
                          <div className="text-xs text-gray-500">
                            {d.studio && <>{d.studio} · </>}{d.phone}
                            {d.bonus_percent != null && <> · бонус {d.bonus_percent}%</>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {ORDER_STATUS_ORDER.filter((s) => row.status_counts[s]).map((s) => (
                              <span key={s} className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${ORDER_STATUS_COLOR[s]}`}>
                                {ORDER_STATUS_DISPLAY[s]}: {row.status_counts[s]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{row.orders_count}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-gray-900">{formatRub(row.orders_amount)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="font-medium text-green-700">{formatRub(row.bonus_paid)}</div>
                          {row.bonus_paid_count > 0 && (
                            <div className="text-xs text-gray-500">по {row.bonus_paid_count} из {row.orders_count}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => toggle(d.id)}
                            className="text-sm font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap"
                          >
                            {isOpen ? 'Скрыть заказы' : 'Заказы'}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} className="bg-gray-50 px-4 py-3">
                            <DesignerReportOrders orders={row.orders} />
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

export default DesignerReport
