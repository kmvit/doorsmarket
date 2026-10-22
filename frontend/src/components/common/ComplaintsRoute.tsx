import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

// Раздел рекламаций (и всё, что с ним связано: главная со статистикой, отгрузка,
// возвраты, уведомления). СМ «только замеры» отправляем в «Заказы и замеры».
// Сервер тоже не отдаёт ему рекламации — здесь только чтобы не видеть пустых страниц.
const ComplaintsRoute = ({ children }: { children: ReactNode }) => {
  const { user } = useAuthStore()
  if (user?.measurements_only) return <Navigate to="/orders" replace />
  return <>{children}</>
}

export default ComplaintsRoute
