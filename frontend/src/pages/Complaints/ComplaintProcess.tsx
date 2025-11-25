import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useComplaintsStore } from '../../store/complaintsStore'
import { useAuthStore } from '../../store/authStore'
import { complaintsAPI } from '../../api/complaints'
import { referencesAPI } from '../../api/references'
import { User } from '../../types/auth'
import Button from '../../components/common/Button'

const ComplaintProcess = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentComplaint, fetchComplaint, isLoading, error } = useComplaintsStore()
  const { user } = useAuthStore()
  const [installers, setInstallers] = useState<User[]>([])
  const [managers, setManagers] = useState<User[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [assigneeComment, setAssigneeComment] = useState('')
  const [closureReason, setClosureReason] = useState('')

  useEffect(() => {
    if (id) {
      fetchComplaint(Number(id))
    }
  }, [id, fetchComplaint])

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const [installersData, managersData] = await Promise.all([
          referencesAPI.getUsersByRole('installer'),
          referencesAPI.getUsersByRole('manager'),
        ])
        setInstallers(installersData || [])
        setManagers(managersData || [])
      } catch (error) {
        console.error('Ошибка загрузки пользователей:', error)
      }
    }
    loadUsers()
  }, [])

  useEffect(() => {
    if (currentComplaint) {
      setAssigneeComment(currentComplaint.assignee_comment || '')
    }
  }, [currentComplaint])

  const handleUpdateComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return

    setIsProcessing(true)
    try {
      await complaintsAPI.update(Number(id), { assignee_comment: assigneeComment })
      alert('Комментарий для исполнителя обновлён.')
      await fetchComplaint(Number(id))
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка обновления комментария')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSetType = async (type: 'installer' | 'manager' | 'factory', installerId?: number, managerId?: number) => {
    if (!id) return

    setIsProcessing(true)
    try {
      if (type === 'installer') {
        if (!installerId) {
          alert('Выберите монтажника')
          setIsProcessing(false)
          return
        }
        // Сначала устанавливаем тип, потом назначаем монтажника
        await complaintsAPI.process(Number(id), 'installer')
        await complaintsAPI.update(Number(id), { installer_assigned_id: installerId })
        alert(`Тип установлен: Монтажник. Назначен монтажник.`)
      } else if (type === 'manager') {
        if (!managerId) {
          alert('Выберите менеджера')
          setIsProcessing(false)
          return
        }
        // Сначала назначаем менеджера, потом устанавливаем тип
        await complaintsAPI.update(Number(id), { manager_id: managerId })
        await complaintsAPI.process(Number(id), 'manager')
        alert(`Тип рекламации установлен: Менеджер. Назначен менеджер.`)
      } else {
        await complaintsAPI.process(Number(id), 'factory')
        alert('Тип рекламации установлен: Фабрика')
      }
      await fetchComplaint(Number(id))
      navigate(`/complaints/${id}`)
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка обработки рекламации')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleApprove = async () => {
    if (!id) return
    if (!confirm('Вы подтверждаете, что работа выполнена качественно?')) return

    setIsProcessing(true)
    try {
      await complaintsAPI.approve(Number(id))
      await fetchComplaint(Number(id))
      navigate(`/complaints/${id}`)
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка проверки работы')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleChangeInstaller = async (newInstallerId: number) => {
    if (!id) return

    setIsProcessing(true)
    try {
      await complaintsAPI.changeInstaller(Number(id), newInstallerId)
      await fetchComplaint(Number(id))
      alert('Монтажник успешно заменён')
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка замены монтажника')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    if (!confirm('Вы уверены, что хотите закрыть эту рекламацию? Все участники получат уведомление.')) return

    if (!closureReason.trim()) {
      alert('Укажите причину закрытия')
      return
    }

    setIsProcessing(true)
    try {
      await complaintsAPI.close(Number(id), closureReason)
      await fetchComplaint(Number(id))
      alert('Рекламация успешно завершена. Причина сохранена в комментарии.')
      navigate(`/complaints/${id}`)
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка закрытия рекламации')
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen py-8 px-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !currentComplaint) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-lg">
            <p className="font-medium">{error || 'Рекламация не найдена'}</p>
          </div>
          <Link to="/complaints">
            <Button className="mt-4">Вернуться к списку</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Проверка прав доступа - только СМ, ОР, админ и руководитель могут обрабатывать рекламации
  const canProcess = user?.role && ['service_manager', 'complaint_department', 'admin', 'leader'].includes(user.role)
  
  if (!canProcess) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-lg">
            <p className="font-medium">У вас нет прав для обработки рекламаций</p>
            <p className="text-sm mt-2">Обработка рекламаций доступна только для сервис-менеджеров, отдела рекламаций, администраторов и руководителей.</p>
          </div>
          <Link to={`/complaints/${id}`}>
            <Button className="mt-4">Вернуться к рекламации</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Заголовок */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Обработка рекламации</h1>
              <p className="mt-2 text-gray-600">#{currentComplaint.id} - {currentComplaint.order_number}</p>
            </div>
            <Link
              to={`/complaints/${id}`}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Просмотр деталей
            </Link>
          </div>
        </div>

        {/* Информация о рекламации */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Информация о рекламации</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Клиент</p>
                <p className="text-base font-medium text-gray-900">{currentComplaint.client_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Номер заказа</p>
                <p className="text-base font-medium text-gray-900">{currentComplaint.order_number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Причина</p>
                <p className="text-base font-medium text-gray-900">{currentComplaint.reason.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Текущий статус</p>
                <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-yellow-100 text-yellow-800">
                  {currentComplaint.status_display}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Действия СМ */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Действия</h3>

            {/* Комментарий для исполнителя */}
            <div className="mb-6 p-4 border border-gray-200 rounded-xl bg-gray-50">
              <h4 className="text-md font-medium text-gray-900 mb-3">Комментарий для исполнителя</h4>
              <p className="text-sm text-gray-600 mb-3">Этот комментарий видят назначенные менеджеры и монтажники. Используйте поле, чтобы пояснить детали задачи.</p>
              <form onSubmit={handleUpdateComment} className="space-y-3">
                <textarea
                  rows={4}
                  value={assigneeComment}
                  onChange={(e) => setAssigneeComment(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="Добавьте инструкции или пояснения"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={isProcessing}
                    className="px-6 py-2 bg-gray-700 text-white rounded-xl hover:bg-gray-800"
                  >
                    Сохранить комментарий
                  </Button>
                </div>
              </form>
            </div>

            {/* Выбор типа рекламации - только для СМ, ОР, админа и руководителя */}
            {canProcess && !currentComplaint.complaint_type && (
              <div className="mb-6">
                <h4 className="text-md font-medium text-gray-900 mb-3">Выберите тип рекламации и назначьте исполнителя:</h4>

                {/* Тип: Монтажник */}
                <div className="mb-4 p-4 border border-blue-200 rounded-xl bg-blue-50">
                  <div className="flex items-center mb-3">
                    <svg className="h-6 w-6 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="font-semibold text-blue-900">Монтажник</span>
                  </div>
                  <InstallerSelect
                    installers={installers}
                    onSelect={(installerId) => handleSetType('installer', installerId)}
                    disabled={isProcessing}
                  />
                </div>

                {/* Тип: Менеджер */}
                <div className="mb-4 p-4 border border-green-200 rounded-xl bg-green-50">
                  <div className="flex items-center mb-3">
                    <svg className="h-6 w-6 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="font-semibold text-green-900">Менеджер</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">Выберите менеджера, который будет обрабатывать рекламацию:</p>
                  <ManagerSelect
                    managers={managers}
                    currentManagerId={currentComplaint.manager?.id}
                    onSelect={(managerId) => handleSetType('manager', undefined, managerId)}
                    disabled={isProcessing}
                  />
                </div>

                {/* Тип: Фабрика */}
                <div className="p-4 border border-orange-200 rounded-xl bg-orange-50">
                  <div className="flex items-center mb-3">
                    <svg className="h-6 w-6 text-orange-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span className="font-semibold text-orange-900">Фабрика</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">Рекламация будет направлена в отдел рекламаций для работы с фабрикой</p>
                  <Button
                    onClick={() => handleSetType('factory')}
                    disabled={isProcessing}
                    className="w-full bg-orange-600 text-white rounded-xl hover:bg-orange-700"
                  >
                    Передать в ОР
                  </Button>
                </div>
              </div>
            )}

            {/* Проверка выполненной работы */}
            {currentComplaint.status === 'under_sm_review' && (
              <div className="mb-6 p-4 border-2 border-green-300 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50">
                <h4 className="text-md font-medium text-gray-900 mb-3">Проверка выполненной работы:</h4>
                <p className="text-sm text-gray-700 mb-4 flex items-start">
                  <svg className="inline h-4 w-4 mr-2 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Монтажник отметил работу как выполненную. После проверки статус изменится на "Выполнена", а клиенту будет отправлено SMS для оценки работы.
                </p>
                <Button
                  onClick={handleApprove}
                  disabled={isProcessing}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl hover:shadow-lg"
                >
                  <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ✓ Проверено
                </Button>
              </div>
            )}

            {/* Заменить монтажника */}
            {currentComplaint.installer_assigned && 
             !['completed', 'closed', 'resolved'].includes(currentComplaint.status) && (
              <div className="mb-6 p-4 border-2 border-blue-200 rounded-xl bg-blue-50">
                <h4 className="text-md font-medium text-gray-900 mb-3">
                  <svg className="inline h-5 w-5 mr-1 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Заменить назначенного монтажника
                </h4>
                <p className="text-sm text-gray-700 mb-3">
                  Текущий монтажник: <strong className="text-blue-900">
                    {currentComplaint.installer_assigned.first_name && currentComplaint.installer_assigned.last_name
                      ? `${currentComplaint.installer_assigned.first_name} ${currentComplaint.installer_assigned.last_name}`
                      : currentComplaint.installer_assigned.username}
                  </strong>
                </p>
                <InstallerSelect
                  installers={installers}
                  currentInstallerId={currentComplaint.installer_assigned.id}
                  onSelect={handleChangeInstaller}
                  disabled={isProcessing}
                  label="Выберите нового монтажника"
                />
              </div>
            )}

            {/* Возможность завершить рекламацию напрямую */}
            {user?.role === 'service_manager' && 
             !['completed', 'closed', 'resolved', 'under_sm_review'].includes(currentComplaint.status) && (
              <div className="mt-6 p-4 border-2 border-gray-300 rounded-xl bg-gray-50">
                <h4 className="text-md font-medium text-gray-900 mb-3">Закрыть рекламацию</h4>
                <p className="text-sm text-gray-600 mb-4">
                  <svg className="inline h-4 w-4 mr-1 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Используйте эту опцию, если рекламация не требует дальнейшей обработки (например, клиент отказался, проблема решена другим способом и т.д.). Статус изменится на "Закрыта".
                </p>
                <form onSubmit={handleClose}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Причина закрытия <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={closureReason}
                      onChange={(e) => setClosureReason(e.target.value)}
                      required
                      placeholder="Например: клиент отказался от заказа, проблема решена самостоятельно и т.д."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Причина сохранится в комментариях рекламации для истории.</p>
                  </div>
                  <Button
                    type="submit"
                    disabled={isProcessing}
                    className="px-6 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700"
                  >
                    <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Закрыть рекламацию
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Компонент выбора монтажника
const InstallerSelect = ({
  installers,
  currentInstallerId,
  onSelect,
  disabled,
  label = 'Выберите монтажника'
}: {
  installers: User[]
  currentInstallerId?: number
  onSelect: (installerId: number) => void
  disabled: boolean
  label?: string
}) => {
  const [selectedId, setSelectedId] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedId) {
      onSelect(Number(selectedId))
      setSelectedId('')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        required
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">{label}</option>
        {installers.map((installer) => (
          <option
            key={installer.id}
            value={installer.id}
            disabled={installer.id === currentInstallerId}
          >
            {installer.first_name && installer.last_name
              ? `${installer.first_name} ${installer.last_name}`
              : installer.username}
            {installer.id === currentInstallerId ? ' (текущий)' : ''}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        disabled={disabled || !selectedId}
        className="w-full bg-blue-600 text-white rounded-xl hover:bg-blue-700"
      >
        {currentInstallerId ? 'Заменить монтажника' : 'Назначить монтажника'}
      </Button>
    </form>
  )
}

// Компонент выбора менеджера
const ManagerSelect = ({
  managers,
  currentManagerId,
  onSelect,
  disabled
}: {
  managers: User[]
  currentManagerId?: number
  onSelect: (managerId: number) => void
  disabled: boolean
}) => {
  const [selectedId, setSelectedId] = useState(currentManagerId?.toString() || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedId) {
      onSelect(Number(selectedId))
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        required
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        <option value="">Выберите менеджера</option>
        {managers.map((manager) => (
          <option key={manager.id} value={manager.id}>
            {manager.first_name && manager.last_name
              ? `${manager.first_name} ${manager.last_name}`
              : manager.username}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        disabled={disabled || !selectedId}
        className="w-full bg-green-600 text-white rounded-xl hover:bg-green-700"
      >
        Назначить менеджеру
      </Button>
    </form>
  )
}

export default ComplaintProcess

