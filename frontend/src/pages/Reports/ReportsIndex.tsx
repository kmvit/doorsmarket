import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

// roles — кому отчёт виден. Админ видит все, руководитель — по своему городу,
// менеджер — дизайнеров своего салона, сервис-менеджер — только свою зарплату
const REPORTS = [
  {
    to: '/orders/reports/designers',
    title: 'Дизайнеры',
    text: 'Заказы через дизайнеров за период: суммы, статусы, выплаченные бонусы',
    // Менеджеру — по его салону
    roles: ['admin', 'leader', 'manager'],
  },
  {
    to: '/orders/reports/service-managers',
    title: 'Отчёт по замерам (ЗП СМ)',
    text: 'Замеры каждого СМ за период: проёмы, сумма по шкале, удалённость, итого за месяц, выгрузка в Excel',
    smTitle: 'Моя зарплата',
    smText: 'Мои замеры за период: проёмы, сумма по шкале, удалённость, итого за месяц, выгрузка в Excel',
    roles: ['admin', 'leader', 'service_manager'],
  },
]


/** Отчёты: руководителю и админу — оба, менеджеру — дизайнеры, сервис-менеджеру — его зарплата. */
const ReportsIndex = () => {
  const { user } = useAuthStore()
  const isSM = user?.role === 'service_manager'
  const reports = REPORTS.filter((r) => user && r.roles.includes(user.role))
  if (user && reports.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-6 rounded-xl">Отчёты вам недоступны</div>
      </div>
    )
  }
  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Отчёты</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((r) => (
          <Link
            key={r.to}
            to={r.to}
            className="block bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-primary-300 hover:shadow-md transition-all"
          >
            <div className="text-lg font-semibold text-gray-900">{isSM && r.smTitle ? r.smTitle : r.title}</div>
            <div className="text-sm text-gray-500 mt-1">{isSM && r.smText ? r.smText : r.text}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default ReportsIndex
