import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { ratingsAPI, apiErrorText } from '../../api/installations'
import { RatingReport, isoDate } from '../../types/installations'
import PeopleFilters, {
  EMPTY_PEOPLE_FILTER, PeopleFilterValue, canFilterByPeople,
} from '../../components/orders/PeopleFilters'

const GROUPS = [
  { value: 'all', label: 'В целом' },
  { value: 'staff', label: 'По сотрудникам' },
  { value: 'salon', label: 'По салонам' },
  { value: 'city', label: 'По городам' },
]

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`

// Цвет средней оценки: ниже 4 — повод разобраться
const scoreClass = (v: number | null) =>
  v == null ? 'text-gray-300' : v >= 4.5 ? 'text-green-700' : v >= 4 ? 'text-gray-900' : v >= 3 ? 'text-amber-700' : 'text-red-700'

/**
 * Оценки клиентов за любой период: средние по каждому параметру и в целом —
 * по всем, по сотрудникам (менеджер, замерщик, монтажники заказа), салонам,
 * городам; ниже — общее впечатление по месяцам.
 */
const RatingsReport = () => {
  const { user } = useAuthStore()
  const today = new Date()
  const [dateFrom, setDateFrom] = useState(isoDate(new Date(today.getFullYear(), 0, 1)))
  const [dateTo, setDateTo] = useState(isoDate(today))
  const [group, setGroup] = useState('all')
  const [people, setPeople] = useState<PeopleFilterValue>(EMPTY_PEOPLE_FILTER)
  const [report, setReport] = useState<RatingReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    ratingsAPI.report({ date_from: dateFrom, date_to: dateTo, group, ...(canFilterByPeople(user?.role) ? people : {}) })
      .then((r) => { if (!cancelled) setReport(r) })
      .catch((err) => { if (!cancelled) setError(apiErrorText(err, 'Не удалось построить отчёт')) })
    return () => { cancelled = true }
  }, [dateFrom, dateTo, group, people, user?.role])

  const th = 'px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap'
  const td = 'px-3 py-2 text-sm whitespace-nowrap'

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Оценки клиентов</h1>
      <p className="text-sm text-gray-500 mb-4">Средние баллы из 5 по оценкам после монтажа</p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <label className="text-xs font-medium text-gray-600">
          С
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="block rounded-lg border-gray-300 shadow-sm text-sm" />
        </label>
        <label className="text-xs font-medium text-gray-600">
          По
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="block rounded-lg border-gray-300 shadow-sm text-sm" />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Разрез
          <select value={group} onChange={(e) => setGroup(e.target.value)}
            className="block rounded-lg border-gray-300 shadow-sm text-sm">
            {GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </label>
        <PeopleFilters role={user?.role} value={people} onChange={setPeople} />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>}

      {report && (report.rows.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center text-gray-500">
          За этот период оценок нет
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>{GROUPS.find((g) => g.value === group)?.label}</th>
                  <th className={th}>Оценок</th>
                  {report.params.map((p) => <th key={p.key} className={th}>{p.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.rows.map((row) => (
                  <tr key={row.key}>
                    <td className={td}>
                      <div className="font-medium text-gray-900">{row.name}</div>
                      {row.note && <div className="text-xs text-gray-500">{row.note}</div>}
                    </td>
                    <td className={`${td} text-gray-600`}>{row.count}</td>
                    {report.params.map((p) => (
                      <td key={p.key} className={`${td} font-semibold ${scoreClass(row.scores[p.key])}`}>
                        {row.scores[p.key]?.toFixed(1) ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {report.months.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Общее впечатление по месяцам</h2>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className={th}>{GROUPS.find((g) => g.value === group)?.label}</th>
                      {report.months.map((m) => <th key={m} className={th}>{monthLabel(m)}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.rows.map((row) => (
                      <tr key={row.key}>
                        <td className={`${td} font-medium text-gray-900`}>{row.name}</td>
                        {report.months.map((m) => (
                          <td key={m} className={`${td} font-semibold ${scoreClass(row.months[m] ?? null)}`}>
                            {row.months[m]?.toFixed(1) ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ))}
    </div>
  )
}

export default RatingsReport
