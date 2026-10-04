import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { designerReportAPI, DesignerReportRow } from '../../api/designerReport'
import DesignerReportFilterBar, { formatRub, useReportFilters } from './DesignerReportFilters'
import DesignerReportOrders, { ReportTile } from './DesignerReportOrders'

/** Карточка дизайнера в отчёте: его заказы, клиенты, суммы и выплаченные бонусы за период. */
const DesignerReportDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [filters, setFilters, query] = useReportFilters()
  const [row, setRow] = useState<DesignerReportRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    designerReportAPI.get(filters, Number(id))
      .then((data) => { if (!cancelled) setRow(data.designers[0] || null) })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.detail || 'Не удалось загрузить отчёт') })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, query])

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <Link
        to={`/orders/reports/designers${query ? `?${query}` : ''}`}
        className="inline-flex items-center text-sm text-primary-600 hover:underline mb-3"
      >
        ← Все дизайнеры
      </Link>

      {row && (
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{row.designer.full_name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {row.designer.phone}
            {row.designer.studio && <> · студия «{row.designer.studio}»</>}
            {row.designer.bonus_percent != null && <> · бонус {row.designer.bonus_percent}%</>}
          </p>
        </div>
      )}

      <DesignerReportFilterBar filters={filters} onChange={setFilters} />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>}

      {isLoading && !row ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : !row ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          По этому дизайнеру за выбранный период и по выбранным фильтрам заказов нет
        </div>
      ) : (
        <div className={isLoading ? 'opacity-60' : ''}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <ReportTile label="Заказов" value={row.orders_count} />
            <ReportTile label="Сумма заказов" value={formatRub(row.orders_amount)} />
            <ReportTile label="Выплачено бонусов" value={formatRub(row.bonus_paid)} accent="text-green-700" />
            <ReportTile label="Выплат" value={`${row.bonus_paid_count} из ${row.orders_count}`} />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <DesignerReportOrders orders={row.orders} />
          </div>
        </div>
      )}
    </div>
  )
}

export default DesignerReportDetail
