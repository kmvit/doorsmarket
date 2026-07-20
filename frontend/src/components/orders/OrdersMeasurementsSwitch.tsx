import { Link } from 'react-router-dom'

/**
 * Переключатель «Заказы | Замеры» в шапке списков модуля заказов.
 * СМ (и остальные роли модуля) переключается между списком заказов
 * и списком замеров с их собственными фильтрами и папками.
 */
const OrdersMeasurementsSwitch = ({ active }: { active: 'orders' | 'measurements' }) => (
  <div className="flex rounded-xl border border-gray-200 bg-gray-100 p-0.5 text-sm font-medium mb-4 max-w-xs">
    <Link
      to="/orders"
      className={`flex-1 text-center px-3 py-2 rounded-lg transition-all ${
        active === 'orders' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      📋 Заказы
    </Link>
    <Link
      to="/measurements"
      className={`flex-1 text-center px-3 py-2 rounded-lg transition-all ${
        active === 'measurements' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      📐 Замеры
    </Link>
  </div>
)

export default OrdersMeasurementsSwitch
