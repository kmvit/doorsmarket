import { Link } from 'react-router-dom'
import { ComplaintListItem } from '../../types/complaints'

interface ComplaintCardProps {
  complaint: ComplaintListItem
}

const ComplaintCard = ({ complaint }: ComplaintCardProps) => {
  const getStatusColor = (status: string) => {
    const statusColors: Record<string, string> = {
      new: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      closed: 'bg-gray-100 text-gray-800',
      factory_response_overdue: 'bg-red-100 text-red-800',
      sm_response_overdue: 'bg-red-100 text-red-800',
      shipping_overdue: 'bg-red-100 text-red-800',
    }
    return statusColors[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <Link
      to={`/complaints/${complaint.id}`}
      className="block bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200 group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
              {complaint.order_number}
            </h3>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(complaint.status)}`}>
              {complaint.status_display}
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-1">
            <span className="font-medium">Клиент:</span> {complaint.client_name}
          </p>
          {complaint.complaint_type && (
            <p className="text-xs text-gray-500 mb-2">
              Тип: {complaint.complaint_type_display}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
        <div>
          <span className="font-medium">Инициатор:</span>
          <p className="text-gray-900">
            {complaint.initiator.first_name && complaint.initiator.last_name
              ? `${complaint.initiator.first_name} ${complaint.initiator.last_name}`
              : complaint.initiator.username}
          </p>
        </div>
        {complaint.manager && (
          <div>
            <span className="font-medium">Менеджер:</span>
            <p className="text-gray-900">
              {complaint.manager.first_name && complaint.manager.last_name
                ? `${complaint.manager.first_name} ${complaint.manager.last_name}`
                : complaint.manager.username}
            </p>
          </div>
        )}
        <div>
          <span className="font-medium">Площадка:</span>
          <p className="text-gray-900">{complaint.production_site.name}</p>
        </div>
        <div>
          <span className="font-medium">Причина:</span>
          <p className="text-gray-900">{complaint.reason.name}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t border-gray-200">
        <span>Создано: {new Date(complaint.created_at).toLocaleDateString('ru-RU')}</span>
        {complaint.updated_at !== complaint.created_at && (
          <span>Обновлено: {new Date(complaint.updated_at).toLocaleDateString('ru-RU')}</span>
        )}
      </div>
    </Link>
  )
}

export default ComplaintCard

