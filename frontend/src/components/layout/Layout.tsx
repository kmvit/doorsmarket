import { ReactNode } from 'react'
import Header from './Header'
import OfflineIndicator from '../common/OfflineIndicator'
import InstallPrompt from '../common/InstallPrompt'

interface LayoutProps {
  children: ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="relative z-10">
        {children}
      </main>
      <footer className="relative z-10 text-center py-6 text-gray-500 text-sm">
        <p>&copy; 2025 Marketing Doors. Все права защищены.</p>
      </footer>
      <OfflineIndicator />
      <InstallPrompt />
    </div>
  )
}

export default Layout

