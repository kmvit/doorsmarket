import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { selectCanCreateComplaint, useAuthStore } from '../../store/authStore'

// Раздел рекламаций (и всё, что с ним связано: главная со статистикой, отгрузка,
// возвраты, уведомления). СМ «только замеры» отправляем в «Заказы и замеры».
// Сервер тоже не отдаёт ему рекламации — здесь только чтобы не видеть пустых страниц.
const ComplaintsRoute = ({ children, creationOnly = false }: { children: ReactNode; creationOnly?: boolean }) => {
  const measurementsOnly = useAuthStore((state) => state.user?.measurements_only)
  const canCreateComplaint = useAuthStore(selectCanCreateComplaint)
  if (measurementsOnly) return <Navigate to="/orders" replace />
  if (creationOnly && !canCreateComplaint) return <Navigate to="/complaints" replace />
  return <>{children}</>
}

export default ComplaintsRoute
