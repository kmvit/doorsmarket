export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

export const ROLES = {
  ADMIN: 'admin',
  SERVICE_MANAGER: 'service_manager',
  MANAGER: 'manager',
  INSTALLER: 'installer',
  COMPLAINT_DEPARTMENT: 'complaint_department',
  LEADER: 'leader',
} as const

export const ROLE_DISPLAY: Record<string, string> = {
  admin: 'Администратор',
  service_manager: 'Сервис-менеджер',
  manager: 'Менеджер',
  installer: 'Монтажник',
  complaint_department: 'Отдел рекламаций',
  leader: 'Руководитель подразделения',
}

