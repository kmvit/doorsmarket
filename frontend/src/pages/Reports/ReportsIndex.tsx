import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const REPORTS = [
  {
    to: '/orders/reports/designers',
    title: 'Дизайнеры',
    text: 'Заказы через дизайнеров за период: суммы, статусы, выплаченные бонусы',
  },
  {
    to: '/orders/reports/service-managers',
    title: 'Зарплата сервис-менеджеров',
    text: 'Выполненные за период замеры по каждому СМ и сумма к выплате по ставке',
  },
]

/** Отчёты руководителя. */
const ReportsIndex = () => {
  const { user } = useAuthStore()
  if (user && !['leader', 'admin'].includes(user.role)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-6 rounded-xl">Отчёты доступны руководителю</div>
      </div>
    )
  }
  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Отчёты</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <Link
            key={r.to}
            to={r.to}
            className="block bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-primary-300 hover:shadow-md transition-all"
          >
            <div className="text-lg font-semibold text-gray-900">{r.title}</div>
            <div className="text-sm text-gray-500 mt-1">{r.text}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default ReportsIndex
