import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const Navigation = () => {
  const { user } = useAuthStore()
  const location = useLocation()

  if (!user) return null

  const isActive = (path: string) => location.pathname === path

  const navItems = []

  // Общие пункты для всех
  navItems.push(
    <Link
      key="dashboard"
      to="/dashboard"
      className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all ${
        isActive('/dashboard')
          ? 'text-primary-600 bg-primary-50'
          : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
      }`}
    >
      <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
      Главная
    </Link>
  )

  // Пункты в зависимости от роли
  if (user.role !== 'installer') {
    navItems.push(
      <Link
        key="complaints"
        to="/complaints"
        className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all ${
          isActive('/complaints')
            ? 'text-primary-600 bg-primary-50'
            : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
        }`}
      >
        <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Рекламации
      </Link>
    )
  }

  if (user.role === 'installer') {
    navItems.push(
      <Link
        key="tasks"
        to="/tasks"
        className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all ${
          isActive('/tasks')
            ? 'text-primary-600 bg-primary-50'
            : 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
        }`}
      >
        <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        Мои задачи
      </Link>
    )
  }

  return (
    <div className="hidden md:ml-8 md:flex md:space-x-2 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex space-x-2 py-2">
        {navItems}
        <Link
          to="/complaints/create"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-cyan-600 hover:from-primary-700 hover:to-cyan-700 rounded-xl transition-all shadow-md"
        >
          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Создать
        </Link>
      </div>
    </div>
  )
}

export default Navigation

