import { Link } from 'react-router-dom'

/** Переключатель «Список монтажей | Монтажники» */
const InstallationsTabs = ({ active }: { active: 'list' | 'installers' }) => (
  <div className="flex rounded-xl border border-gray-200 bg-gray-100 p-0.5 text-sm font-medium mb-4 max-w-sm">
    {([
      ['list', '/orders/installations', '🛠️ Список монтажей'],
      ['installers', '/orders/installations/installers', '📅 Монтажники'],
    ] as const).map(([key, to, label]) => (
      <Link
        key={key}
        to={to}
        className={`flex-1 text-center px-3 py-2 rounded-lg transition-all ${
          active === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {label}
      </Link>
    ))}
  </div>
)

export default InstallationsTabs
