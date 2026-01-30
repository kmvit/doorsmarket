import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useComplaintsStore } from '../../store/complaintsStore'
import { useAuthStore } from '../../store/authStore'
import { complaintsAPI } from '../../api/complaints'
import { referencesAPI } from '../../api/references'
import { User } from '../../types/auth'
import Button from '../../components/common/Button'
import { ROLE_DISPLAY } from '../../utils/constants'
import AttachmentUpload from '../../components/complaints/AttachmentUpload'
import FileViewer from '../../components/common/FileViewer'

const ComplaintDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentComplaint, fetchComplaint, isLoading, error } = useComplaintsStore()
  const { user } = useAuthStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [showEditContactForm, setShowEditContactForm] = useState(false)
  const [contactFormData, setContactFormData] = useState({
    contact_person: '',
    contact_phone: '',
    address: ''
  })
  const [isUpdatingContact, setIsUpdatingContact] = useState(false)
  const [installers, setInstallers] = useState<User[]>([])
  const [showForms, setShowForms] = useState<{
    planInstallation?: boolean
    changeInstaller?: boolean
    clientAgreement?: boolean
    dispute?: boolean
    reject?: boolean
    reschedule?: boolean
  }>({})
  const [formData, setFormData] = useState<{
    installationDate?: string
    installerId?: string
    newInstallerId?: string
    productionDeadline?: string
    shippingDate?: string
    disputeArguments?: string
    rejectReason?: string
  }>({})
  const [viewingFile, setViewingFile] = useState<{ url: string; name?: string } | null>(null)

  useEffect(() => {
    if (id) {
      fetchComplaint(Number(id))
    }
  }, [id, fetchComplaint])

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const installersData = await referencesAPI.getUsersByRole('installer')
        setInstallers(installersData || [])
      } catch (error) {
        console.error('Ошибка загрузки пользователей:', error)
      }
    }
    loadUsers()
  }, [])

  useEffect(() => {
    if (currentComplaint) {
      setContactFormData({
        contact_person: currentComplaint.contact_person || '',
        contact_phone: currentComplaint.contact_phone || '',
        address: currentComplaint.address || ''
      })
    }
  }, [currentComplaint])

  const getStatusBadgeClass = (status: string) => {
    if (status === 'new') {
      return 'px-4 py-2 inline-flex text-sm font-semibold rounded-xl bg-green-100 text-green-800'
    } else if (status === 'installer_not_planned' || status === 'installer_overdue') {
      return 'px-4 py-2 inline-flex text-sm font-semibold rounded-xl bg-red-600 text-white border-2 border-red-800 animate-pulse'
    } else if (status === 'in_progress') {
      return 'px-4 py-2 inline-flex text-sm font-semibold rounded-xl bg-yellow-100 text-yellow-800'
    } else if (status === 'resolved') {
      return 'px-4 py-2 inline-flex text-sm font-semibold rounded-xl bg-purple-100 text-purple-800'
    } else if (['factory_response_overdue', 'sm_response_overdue', 'shipping_overdue'].includes(status)) {
      return 'px-4 py-2 inline-flex text-sm font-semibold rounded-xl bg-red-100 text-red-800'
    } else {
      return 'px-4 py-2 inline-flex text-sm font-semibold rounded-xl bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateOnly = (dateString: string | null) => {
    if (!dateString) return null
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatTimeOnly = (dateString: string | null) => {
    if (!dateString) return null
    return new Date(dateString).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    })
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
        <div className="max-w-6xl mx-auto">
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

  const canEdit = user && (
    currentComplaint.initiator.id === user.id ||
    user.role === 'admin' ||
    user.role === 'service_manager' ||
    user.role === 'leader'
  )


  const canEditContact = user && (
    user.role === 'service_manager' ||
    user.role === 'manager' ||
    user.role === 'admin' ||
    user.role === 'leader'
  )

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return

    setIsUpdatingContact(true)
    try {
      await complaintsAPI.updateClientContact(
        Number(id),
        contactFormData.contact_person,
        contactFormData.contact_phone,
        contactFormData.address
      )
      await fetchComplaint(Number(id))
      setShowEditContactForm(false)
      alert('Контактные данные успешно обновлены. Уведомления отправлены всем участникам.')
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка обновления контактных данных')
    } finally {
      setIsUpdatingContact(false)
    }
  }

  const handleAction = async (action: string) => {
    if (!id) return

    setIsProcessing(true)
    try {
      switch (action) {
        case 'process':
          navigate(`/complaints/${id}/process`)
          return
        case 'approve':
          if (!confirm('Вы подтверждаете, что работа выполнена качественно?')) return
          await complaintsAPI.approve(Number(id))
          break
        case 'plan_installation':
          if (!formData.installationDate) {
            alert('Укажите дату монтажа')
            return
          }
          // Если это СМ планирует, нужен installerId, если монтажник - он планирует сам
          if (user?.role === 'service_manager') {
            if (!formData.installerId) {
              alert('Укажите монтажника')
              return
            }
            await complaintsAPI.planInstallation(
              Number(id),
              Number(formData.installerId),
              formData.installationDate
            )
            setShowForms({ ...showForms, planInstallation: false })
            setFormData({ ...formData, installationDate: '', installerId: '' })
          } else if (user?.role === 'installer') {
            // Монтажник планирует сам
            await complaintsAPI.planInstallation(
              Number(id),
              user.id,
              formData.installationDate
            )
            setFormData({ ...formData, installationDate: '' })
          }
          break
        case 'change_installer':
          if (!formData.newInstallerId) {
            alert('Выберите нового монтажника')
            return
          }
          await complaintsAPI.changeInstaller(Number(id), Number(formData.newInstallerId))
          setShowForms({ ...showForms, changeInstaller: false })
          setFormData({ ...formData, newInstallerId: '' })
          break
        case 'reschedule_installation':
          if (!formData.installationDate) {
            alert('Укажите новую дату монтажа')
            return
          }
          await complaintsAPI.rescheduleInstallation(Number(id), formData.installationDate)
          setShowForms({ ...showForms, reschedule: false })
          setFormData({ ...formData, installationDate: '' })
          break
        case 'complete':
          await complaintsAPI.complete(Number(id))
          break
        case 'start_production':
          if (!formData.productionDeadline) {
            alert('Укажите дату готовности')
            return
          }
          await complaintsAPI.startProduction(Number(id), formData.productionDeadline)
          setFormData({ ...formData, productionDeadline: '' })
          break
        case 'mark_warehouse':
          await complaintsAPI.markWarehouse(Number(id))
          break
        case 'mark_warehouse_or':
          if (!confirm('Подтвердите, что товар готов и находится на складе?')) return
          await complaintsAPI.markWarehouseOR(Number(id))
          break
        case 'plan_shipping':
          if (!formData.shippingDate) {
            alert('Укажите дату отгрузки')
            return
          }
          await complaintsAPI.planShipping(Number(id), formData.shippingDate)
          setFormData({ ...formData, shippingDate: '' })
          break
        case 'factory_approve':
          if (!confirm('Вы одобряете рекламацию? Статус станет «Ответ получен», а СМ получит задачу согласовать решение с клиентом.')) return
          await complaintsAPI.factoryApprove(Number(id))
          break
        case 'factory_reject':
          if (!formData.rejectReason) {
            alert('Укажите причину отказа')
            return
          }
          await complaintsAPI.factoryReject(Number(id), formData.rejectReason)
          setShowForms({ ...showForms, reject: false })
          setFormData({ ...formData, rejectReason: '' })
          break
        case 'agree_client':
          if (!formData.productionDeadline) {
            alert('Укажите дату готовности заказа')
            return
          }
          await complaintsAPI.agreeClient(Number(id), formData.productionDeadline)
          setShowForms({ ...showForms, clientAgreement: false })
          setFormData({ ...formData, productionDeadline: '' })
          break
        case 'dispute_decision':
          if (!formData.disputeArguments) {
            alert('Укажите аргументы для фабрики')
            return
          }
          await complaintsAPI.disputeDecision(Number(id), formData.disputeArguments)
          setShowForms({ ...showForms, dispute: false })
          setFormData({ ...formData, disputeArguments: '' })
          break
        default:
          break
      }
      await fetchComplaint(Number(id))
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка выполнения действия')
    } finally {
      setIsProcessing(false)
    }
  }

  const regularAttachments = currentComplaint.attachments?.filter(a => a.attachment_type !== 'commercial_offer') || []
  const commercialOffers = currentComplaint.attachments?.filter(a => a.attachment_type === 'commercial_offer') || []

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Заголовок страницы */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Рекламация #{currentComplaint.id}</h1>
            <p className="text-sm text-gray-600 mt-1">
              {formatDate(currentComplaint.created_at)} | {currentComplaint.order_number}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <span className={getStatusBadgeClass(currentComplaint.status)}>
              {currentComplaint.status === 'installer_not_planned' && '⚠️ '}
              {currentComplaint.status_display}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Основная информация */}
          <div className="lg:col-span-2 space-y-6">
            {/* Информация о заказе */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Информация о заказе</h2>
                {canEditContact && (
                  <button
                    onClick={() => setShowEditContactForm(!showEditContactForm)}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all"
                  >
                    <svg className="inline h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Изменить контактные данные
                  </button>
                )}
              </div>

              {/* Форма редактирования (скрыта по умолчанию) */}
              {showEditContactForm && (
                <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Изменить контактные данные клиента</h3>
                  <form onSubmit={handleUpdateContact}>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Контактное лицо *</label>
                        <input
                          type="text"
                          value={contactFormData.contact_person}
                          onChange={(e) => setContactFormData({ ...contactFormData, contact_person: e.target.value })}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Телефон *</label>
                        <input
                          type="text"
                          value={contactFormData.contact_phone}
                          onChange={(e) => setContactFormData({ ...contactFormData, contact_phone: e.target.value })}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
                        <textarea
                          rows={2}
                          value={contactFormData.address}
                          onChange={(e) => setContactFormData({ ...contactFormData, address: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="flex space-x-3">
                        <button
                          type="submit"
                          disabled={isUpdatingContact}
                          className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                        >
                          Сохранить изменения
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowEditContactForm(false)
                            if (currentComplaint) {
                              setContactFormData({
                                contact_person: currentComplaint.contact_person || '',
                                contact_phone: currentComplaint.contact_phone || '',
                                address: currentComplaint.address || ''
                              })
                            }
                          }}
                          className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-all"
                        >
                          Отмена
                        </button>
                      </div>
                      <p className="text-xs text-gray-600">
                        <svg className="inline h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        После сохранения все участники рекламации получат уведомление об изменении контактных данных.
                      </p>
                    </div>
                  </form>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Номер заказа</p>
                  <p className="text-base font-semibold text-gray-900">{currentComplaint.order_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Причина рекламации</p>
                  <p className="text-base font-semibold text-gray-900">{currentComplaint.reason.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Клиент</p>
                  <p className="text-base font-semibold text-gray-900">{currentComplaint.client_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Контактное лицо</p>
                  <p className="text-base font-semibold text-gray-900">{currentComplaint.contact_person}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Телефон</p>
                  <p className="text-base font-semibold text-gray-900">{currentComplaint.contact_phone}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Площадка</p>
                  <p className="text-base font-semibold text-gray-900">{currentComplaint.production_site.name}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">Адрес</p>
                  <p className="text-base font-semibold text-gray-900">{currentComplaint.address}</p>
                </div>
                {currentComplaint.additional_info && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600">Дополнительная информация</p>
                    <p className="text-base text-gray-900 whitespace-pre-line">{currentComplaint.additional_info}</p>
                  </div>
                )}
                {currentComplaint.assignee_comment && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600">Комментарий для исполнителя</p>
                    <div className="text-base text-gray-900 whitespace-pre-line bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
                      {currentComplaint.assignee_comment}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Бракованные изделия */}
            {currentComplaint.defective_products && currentComplaint.defective_products.length > 0 && (
              <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Бракованные изделия</h2>
                <div className="space-y-4">
                  {currentComplaint.defective_products.map((product) => (
                    <div key={product.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-sm text-gray-600">Наименование</p>
                          <p className="text-base font-semibold text-gray-900">{product.product_name}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Размер</p>
                          <p className="text-base font-semibold text-gray-900">{product.size}</p>
                        </div>
                        {product.opening_type && (
                          <div>
                            <p className="text-sm text-gray-600">Открывание</p>
                            <p className="text-base font-semibold text-gray-900">{product.opening_type}</p>
                          </div>
                        )}
                        <div className="col-span-2">
                          <p className="text-sm text-gray-600">Описание проблемы</p>
                          <p className="text-base text-gray-900">{product.problem_description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Информация о решении фабрики */}
            {currentComplaint.complaint_type === 'factory' && (
              <>
                {currentComplaint.factory_reject_reason && (
                  <div className="bg-red-50 border-2 border-red-300 rounded-3xl shadow-2xl p-6">
                    <h2 className="text-xl font-bold text-red-900 mb-4 flex items-center">
                      <svg className="h-6 w-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Отказ фабрики
                    </h2>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Причина отказа:</p>
                      <p className="text-base text-gray-900">{currentComplaint.factory_reject_reason}</p>
                    </div>
                    {currentComplaint.factory_response_date && (
                      <div className="mt-3 text-xs text-gray-600">
                        Дата ответа: {formatDate(currentComplaint.factory_response_date)}
                      </div>
                    )}
                  </div>
                )}

                {currentComplaint.dispute_arguments && (
                  <div className="bg-orange-50 border-2 border-orange-300 rounded-3xl shadow-2xl p-6">
                    <h2 className="text-xl font-bold text-orange-900 mb-4 flex items-center">
                      <svg className="h-6 w-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Спор с фабрикой
                    </h2>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Аргументы СМ:</p>
                      <p className="text-base text-gray-900">{currentComplaint.dispute_arguments}</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Вложения */}
            {regularAttachments.length > 0 && (
              <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Вложения</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {regularAttachments.map((attachment) => (
                    <button
                      key={attachment.id}
                      onClick={() => setViewingFile({
                        url: attachment.file_url || attachment.file || '',
                        name: attachment.file?.split('/').pop() || 'Файл'
                      })}
                      className="border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors cursor-pointer text-left w-full"
                    >
                      <div className="text-center">
                        {attachment.attachment_type === 'photo' ? (
                          <svg className="h-12 w-12 mx-auto text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        ) : attachment.attachment_type === 'video' ? (
                          <svg className="h-12 w-12 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        ) : (
                          <svg className="h-12 w-12 mx-auto text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        )}
                        <p className="text-xs text-gray-600 mt-2">
                          {attachment.attachment_type === 'photo' ? 'Фото' :
                           attachment.attachment_type === 'video' ? 'Видео' :
                           attachment.attachment_type === 'document' ? 'Документ' :
                           'Вложение'}
                        </p>
                        <p className="text-xs text-gray-500">{attachment.file_size}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Загрузка новых вложений */}
            {canEdit && (
              <AttachmentUpload
                complaintId={currentComplaint.id}
                onUploaded={() => {
                  if (id) fetchComplaint(Number(id))
                }}
              />
            )}
          </div>

          {/* Боковая панель */}
          <div className="space-y-6">
            {/* Участники */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Участники</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-600">Инициатор</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {currentComplaint.initiator.first_name && currentComplaint.initiator.last_name
                      ? `${currentComplaint.initiator.first_name} ${currentComplaint.initiator.last_name}`
                      : currentComplaint.initiator.username}
                  </p>
                  <p className="text-xs text-gray-500">
                    {ROLE_DISPLAY[currentComplaint.initiator.role] || currentComplaint.initiator.role}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Получатель</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {currentComplaint.recipient.first_name && currentComplaint.recipient.last_name
                      ? `${currentComplaint.recipient.first_name} ${currentComplaint.recipient.last_name}`
                      : currentComplaint.recipient.username}
                  </p>
                  <p className="text-xs text-gray-500">
                    {ROLE_DISPLAY[currentComplaint.recipient.role] || currentComplaint.recipient.role}
                  </p>
                </div>
                {currentComplaint.manager ? (
                  <div>
                    <p className="text-xs text-gray-600">Менеджер</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {currentComplaint.manager.first_name && currentComplaint.manager.last_name
                        ? `${currentComplaint.manager.first_name} ${currentComplaint.manager.last_name}`
                        : currentComplaint.manager.username}
                    </p>
                    <p className="text-xs text-gray-500">
                      {ROLE_DISPLAY[currentComplaint.manager.role] || currentComplaint.manager.role}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-gray-600">Менеджер</p>
                    <p className="text-sm font-semibold text-orange-600">Не назначен</p>
                    <p className="text-xs text-gray-500">Будет назначен при обработке</p>
                  </div>
                )}
                {currentComplaint.installer_assigned && (
                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-600">Монтажник</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {currentComplaint.installer_assigned.first_name && currentComplaint.installer_assigned.last_name
                        ? `${currentComplaint.installer_assigned.first_name} ${currentComplaint.installer_assigned.last_name}`
                        : currentComplaint.installer_assigned.username}
                    </p>
                    <p className="text-xs text-gray-500">
                      {currentComplaint.installer_assigned.phone_number || 'Телефон не указан'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Информация о монтаже */}
            {(currentComplaint.status === 'under_sm_review' || currentComplaint.status === 'completed') && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-3xl shadow-2xl p-6 border border-green-200">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-semibold text-green-900 mb-1">Выполнено монтажником</h3>
                    {currentComplaint.installer_assigned && (
                      <p className="text-sm text-gray-700">
                        {currentComplaint.installer_assigned.first_name && currentComplaint.installer_assigned.last_name
                          ? `${currentComplaint.installer_assigned.first_name} ${currentComplaint.installer_assigned.last_name}`
                          : currentComplaint.installer_assigned.username}
                      </p>
                    )}
                    {currentComplaint.status === 'under_sm_review' ? (
                      <p className="text-xs text-gray-600 mt-2">Ожидает проверки СМ</p>
                    ) : currentComplaint.status === 'completed' ? (
                      <p className="text-xs text-green-700 mt-2">✓ Одобрено СМ</p>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {currentComplaint.planned_installation_date && 
             currentComplaint.status !== 'under_sm_review' && 
             currentComplaint.status !== 'completed' && (
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-3xl shadow-2xl p-6 border border-yellow-200">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">Монтаж запланирован</h3>
                    <p className="text-lg font-bold text-gray-900">{formatDateOnly(currentComplaint.planned_installation_date)}</p>
                    <p className="text-sm text-gray-600">{formatTimeOnly(currentComplaint.planned_installation_date)}</p>
                    {currentComplaint.installer_assigned && (
                      <p className="text-xs text-gray-500 mt-2">
                        {currentComplaint.installer_assigned.first_name && currentComplaint.installer_assigned.last_name
                          ? `${currentComplaint.installer_assigned.first_name} ${currentComplaint.installer_assigned.last_name}`
                          : currentComplaint.installer_assigned.username}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Действия */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Действия</h2>
              <div className="space-y-2">
                {/* Общие действия */}
                {(user?.role === 'service_manager' || user?.role === 'manager' || user?.role === 'admin' || user?.role === 'leader' || user?.role === 'complaint_department') && (
                  <Link to={`/complaints/${id}/history`}>
                    <Button variant="outline" className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0">
                      <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      История
                    </Button>
                  </Link>
                )}

                {(canEdit || user?.id === currentComplaint.initiator.id) && (
                  <Link to={`/complaints/${id}/edit`}>
                    <Button variant="outline" className="w-full">
                      <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Редактировать рекламацию
                    </Button>
                  </Link>
                )}

                {(user?.role === 'service_manager' || currentComplaint.status === 'new') && (
                  <Button
                    onClick={() => handleAction('process')}
                    className="w-full bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    Обработать рекламацию
                  </Button>
                )}

                {/* Действия для СМ */}
                {user?.role === 'service_manager' && (
                  <>
                    {/* Планирование монтажа (когда товар на складе или отгрузка запланирована) */}
                    {(currentComplaint.status === 'on_warehouse' || currentComplaint.status === 'shipping_planned') && (
                      <>
                        {!showForms.planInstallation ? (
                          <Button
                            onClick={() => setShowForms({ ...showForms, planInstallation: true })}
                            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                          >
                            <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Монтаж запланирован
                          </Button>
                        ) : (
                          <div className="p-4 border-2 border-orange-200 rounded-xl bg-orange-50">
                            <h4 className="text-sm font-semibold text-gray-900 mb-3">Планирование монтажа</h4>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Дата и время монтажа <span className="text-red-500">*</span></label>
                                <input
                                  type="datetime-local"
                                  value={formData.installationDate || ''}
                                  onChange={(e) => setFormData({ ...formData, installationDate: e.target.value })}
                                  required
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Монтажник <span className="text-red-500">*</span></label>
                                <select
                                  value={formData.installerId || ''}
                                  onChange={(e) => setFormData({ ...formData, installerId: e.target.value })}
                                  required
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                  <option value="">Выберите монтажника</option>
                                  {installers.map((installer) => (
                                    <option key={installer.id} value={installer.id}>
                                      {installer.first_name && installer.last_name
                                        ? `${installer.first_name} ${installer.last_name}`
                                        : installer.username}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex space-x-2">
                                <Button
                                  onClick={() => handleAction('plan_installation')}
                                  disabled={isProcessing}
                                  className="flex-1 bg-orange-600 text-white hover:bg-orange-700"
                                >
                                  Сохранить
                                </Button>
                                <Button
                                  onClick={() => setShowForms({ ...showForms, planInstallation: false })}
                                  variant="outline"
                                  className="flex-1"
                                >
                                  Отмена
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Заменить монтажника */}
                    {currentComplaint.installer_assigned && 
                     !['completed', 'closed', 'resolved'].includes(currentComplaint.status) && (
                      <>
                        {!showForms.changeInstaller ? (
                          <Button
                            onClick={() => setShowForms({ ...showForms, changeInstaller: true })}
                            className="w-full bg-blue-600 text-white hover:bg-blue-700"
                          >
                            <svg className="h-4 w-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                            Заменить монтажника
                          </Button>
                        ) : (
                          <div className="p-4 border-2 border-blue-200 rounded-xl bg-blue-50">
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">
                              <svg className="inline h-4 w-4 mr-1 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                              </svg>
                              Заменить монтажника
                            </h4>
                            <p className="text-xs text-gray-600 mb-3">
                              Текущий монтажник: <strong>
                                {currentComplaint.installer_assigned.first_name && currentComplaint.installer_assigned.last_name
                                  ? `${currentComplaint.installer_assigned.first_name} ${currentComplaint.installer_assigned.last_name}`
                                  : currentComplaint.installer_assigned.username}
                              </strong>
                            </p>
                            <select
                              value={formData.newInstallerId || ''}
                              onChange={(e) => setFormData({ ...formData, newInstallerId: e.target.value })}
                              required
                              className="w-full px-3 py-2 mb-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">Выберите нового монтажника</option>
                              {installers.map((installer) => (
                                <option
                                  key={installer.id}
                                  value={installer.id}
                                  disabled={installer.id === currentComplaint.installer_assigned?.id}
                                >
                                  {installer.first_name && installer.last_name
                                    ? `${installer.first_name} ${installer.last_name}`
                                    : installer.username}
                                  {installer.id === currentComplaint.installer_assigned?.id ? ' (текущий)' : ''}
                                </option>
                              ))}
                            </select>
                            <div className="flex space-x-2">
                              <Button
                                onClick={() => handleAction('change_installer')}
                                disabled={isProcessing}
                                className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                              >
                                Заменить
                              </Button>
                              <Button
                                onClick={() => setShowForms({ ...showForms, changeInstaller: false })}
                                variant="outline"
                                className="flex-1"
                              >
                                Отмена
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Проверить и завершить рекламацию (СМ) */}
                    {currentComplaint.status === 'under_sm_review' && (
                      <div className="p-4 border-2 border-green-300 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50">
                        <p className="text-xs text-gray-700 mb-3 flex items-start">
                          <svg className="inline h-4 w-4 mr-2 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Монтажник отметил работу как выполненную. После проверки статус изменится на "Выполнена", а клиенту будет отправлено SMS для оценки работы.
                        </p>
                        <Button
                          onClick={() => handleAction('approve')}
                          disabled={isProcessing}
                          className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                        >
                          <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          ✓ Проверено
                        </Button>
                      </div>
                    )}

                    {/* Действия для СМ по фабричным рекламациям */}
                    {currentComplaint.complaint_type === 'factory' && (
                      <>
                        {(currentComplaint.status === 'factory_approved' || 
                          currentComplaint.status === 'sm_response_overdue' || 
                          currentComplaint.status === 'factory_rejected') && (
                          <div className={`p-4 border-2 rounded-xl mb-3 ${
                            currentComplaint.status === 'factory_rejected'
                              ? 'border-red-300 bg-gradient-to-br from-red-50 to-rose-50'
                              : 'border-blue-300 bg-gradient-to-br from-blue-50 to-cyan-50'
                          }`}>
                            <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
                              {currentComplaint.status === 'factory_rejected' ? (
                                <>
                                  <svg className="h-5 w-5 mr-2 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-12.728 12.728m0-12.728L18.364 18.364" />
                                  </svg>
                                  Ответ на отказ фабрики
                                </>
                              ) : (
                                <>
                                  <svg className="h-5 w-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                  </svg>
                                  Согласование с клиентом
                                </>
                              )}
                            </h4>
                            <p className="text-xs text-gray-700 mb-3">
                              {currentComplaint.status === 'factory_rejected' ? (
                                <>
                                  <span className="text-red-600 font-semibold">Фабрика отклонила рекламацию.</span>
                                  {' '}Подготовьте аргументы и при необходимости вложения, чтобы вернуть заявку на повторное рассмотрение.
                                </>
                              ) : currentComplaint.status === 'sm_response_overdue' ? (
                                <>
                                  <span className="text-red-600 font-semibold">⚠️ Просрочено!</span>
                                  {' '}Фабрика ожидает подтверждения. Свяжитесь с клиентом как можно скорее.
                                </>
                              ) : (
                                <>
                                  <span className="text-green-600 font-semibold">✓ Ответ получен от фабрики</span>
                                  {' '}Озвучьте клиенту решение или верните его в фабрику, если не согласны.
                                </>
                              )}
                            </p>

                            {currentComplaint.status !== 'factory_rejected' && (
                              <>
                                {!showForms.clientAgreement ? (
                                  <Button
                                    onClick={() => setShowForms({ ...showForms, clientAgreement: true })}
                                    className="w-full mb-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                                  >
                                    <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                    ✓ Ответ фабрики согласован
                                  </Button>
                                ) : (
                                  <div className="mb-2 p-3 bg-white border-2 border-green-200 rounded-xl">
                                    <div className="mb-3">
                                      <label className="block text-sm font-medium text-gray-700 mb-2">Дата готовности заказа <span className="text-red-500">*</span></label>
                                      <input
                                        type="date"
                                        value={formData.productionDeadline || ''}
                                        onChange={(e) => setFormData({ ...formData, productionDeadline: e.target.value })}
                                        required
                                        min={new Date().toISOString().split('T')[0]}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                      />
                                    </div>
                                    <div className="flex space-x-2">
                                      <Button
                                        onClick={() => handleAction('agree_client')}
                                        disabled={isProcessing}
                                        className="flex-1 bg-green-600 text-white hover:bg-green-700"
                                      >
                                        Подтвердить
                                      </Button>
                                      <Button
                                        onClick={() => setShowForms({ ...showForms, clientAgreement: false })}
                                        variant="outline"
                                        className="flex-1"
                                      >
                                        Отмена
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}

                            {!showForms.dispute ? (
                              <Button
                                onClick={() => setShowForms({ ...showForms, dispute: true })}
                                className="w-full bg-gradient-to-r from-red-500 to-rose-500 text-white"
                              >
                                <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                {currentComplaint.status === 'factory_rejected' ? '↺ Вернуть фабрике' : '⚠ Оспорить решение'}
                              </Button>
                            ) : (
                              <div className="mt-3 p-3 bg-white border-2 border-red-200 rounded-xl">
                                <div className="mb-3">
                                  <label className="block text-sm font-medium text-gray-700 mb-2">Аргументы для фабрики <span className="text-red-500">*</span></label>
                                  <textarea
                                    rows={4}
                                    value={formData.disputeArguments || ''}
                                    onChange={(e) => setFormData({ ...formData, disputeArguments: e.target.value })}
                                    required
                                    placeholder="Опишите детали и аргументы, почему решение фабрики нужно пересмотреть..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                                  />
                                </div>
                                <div className="flex space-x-2">
                                  <Button
                                    onClick={() => handleAction('dispute_decision')}
                                    disabled={isProcessing}
                                    className="flex-1 bg-red-600 text-white hover:bg-red-700"
                                  >
                                    {currentComplaint.status === 'factory_rejected' ? 'Отправить фабрике' : 'Оспорить решение'}
                                  </Button>
                                  <Button
                                    onClick={() => setShowForms({ ...showForms, dispute: false })}
                                    variant="outline"
                                    className="flex-1"
                                  >
                                    Отмена
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {currentComplaint.status === 'in_production' && (
                          <div className="p-4 border-2 border-green-200 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 mb-3">
                            <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
                              <svg className="h-5 w-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Заказ в производстве
                            </h4>
                            <p className="text-xs text-gray-700">
                              Решение фабрики согласовано, заказ запущен в производство. Следите за сроками готовности и информируйте клиента.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Действия для ОР */}
                {(user?.role === 'complaint_department' || user?.role === 'admin' || user?.role === 'leader') && (
                  <>
                    {currentComplaint.complaint_type === 'factory' && 
                     ['sent', 'factory_response_overdue', 'factory_dispute'].includes(currentComplaint.status) && (
                      <div className="p-4 border-2 border-orange-300 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 mb-3">
                        <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
                          <svg className="h-5 w-5 mr-2 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                          Решение отдела рекламаций
                        </h4>
                        <p className="text-xs text-gray-700 mb-3">
                          Рассмотрите рекламацию и примите решение в течение 2 рабочих дней
                        </p>
                        
                        <Button
                          onClick={() => handleAction('factory_approve')}
                          disabled={isProcessing}
                          className="w-full mb-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                        >
                          <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          ✓ Запуск в производство
                        </Button>
                        
                        {!showForms.reject ? (
                          <Button
                            onClick={() => setShowForms({ ...showForms, reject: true })}
                            className="w-full bg-gradient-to-r from-red-500 to-rose-500 text-white"
                          >
                            <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            ✗ Отказ
                          </Button>
                        ) : (
                          <div className="mt-3 p-3 bg-white border-2 border-red-200 rounded-xl">
                            <div className="mb-3">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Причина отказа <span className="text-red-500">*</span></label>
                              <textarea
                                rows={3}
                                value={formData.rejectReason || ''}
                                onChange={(e) => setFormData({ ...formData, rejectReason: e.target.value })}
                                required
                                placeholder="Укажите причину отказа в рекламации..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                              />
                            </div>
                            <div className="flex space-x-2">
                              <Button
                                onClick={() => handleAction('factory_reject')}
                                disabled={isProcessing}
                                className="flex-1 bg-red-600 text-white hover:bg-red-700"
                              >
                                Отправить отказ
                              </Button>
                              <Button
                                onClick={() => setShowForms({ ...showForms, reject: false })}
                                variant="outline"
                                className="flex-1"
                              >
                                Отмена
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Кнопка "Заказ на складе" для ОР */}
                    {currentComplaint.complaint_type === 'factory' && currentComplaint.status === 'in_production' && (
                      <Button
                        onClick={() => handleAction('mark_warehouse_or')}
                        disabled={isProcessing}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                      >
                        <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Заказ на складе
                      </Button>
                    )}
                  </>
                )}

                {/* Действия для монтажника */}
                {user?.role === 'installer' && currentComplaint.installer_assigned?.id === user.id && (
                  <>
                    {['waiting_installer_date', 'needs_planning', 'installer_not_planned'].includes(currentComplaint.status) && (
                      <div className="p-4 border-2 border-orange-200 rounded-xl bg-orange-50">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Назначить дату монтажа</h4>
                        <div className="mb-3">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Дата и время монтажа</label>
                          <input
                            type="datetime-local"
                            value={formData.installationDate || ''}
                            onChange={(e) => setFormData({ ...formData, installationDate: e.target.value })}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <Button
                          onClick={() => handleAction('plan_installation')}
                          disabled={isProcessing}
                          className="w-full bg-orange-600 text-white hover:bg-orange-700"
                        >
                          <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Назначить дату монтажа
                        </Button>
                      </div>
                    )}
                    
                    {/* Перенос даты монтажа */}
                    {currentComplaint.planned_installation_date && 
                     !['under_sm_review', 'completed', 'closed', 'resolved'].includes(currentComplaint.status) && (
                      <>
                        {!showForms.reschedule ? (
                          <Button
                            onClick={() => {
                              setShowForms({ ...showForms, reschedule: true })
                              if (currentComplaint.planned_installation_date) {
                                const date = new Date(currentComplaint.planned_installation_date)
                                const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
                                  .toISOString()
                                  .slice(0, 16)
                                setFormData({ ...formData, installationDate: localDateTime })
                              }
                            }}
                            className="w-full bg-yellow-600 text-white hover:bg-yellow-700"
                          >
                            <svg className="h-4 w-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Перенести дату монтажа
                          </Button>
                        ) : (
                          <div className="p-4 border-2 border-yellow-200 rounded-xl bg-yellow-50">
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">
                              <svg className="inline h-4 w-4 mr-1 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              Перенести дату монтажа
                            </h4>
                            <p className="text-xs text-gray-600 mb-3">
                              Текущая дата: <strong>{formatDate(currentComplaint.planned_installation_date)}</strong>
                            </p>
                            <div className="mb-3">
                              <label className="block text-xs font-medium text-gray-700 mb-1">Новая дата и время</label>
                              <input
                                type="datetime-local"
                                value={formData.installationDate || ''}
                                onChange={(e) => setFormData({ ...formData, installationDate: e.target.value })}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                              />
                            </div>
                            <div className="flex space-x-2">
                              <Button
                                onClick={() => handleAction('reschedule_installation')}
                                disabled={isProcessing}
                                className="flex-1 bg-yellow-600 text-white hover:bg-yellow-700"
                              >
                                Перенести дату
                              </Button>
                              <Button
                                onClick={() => setShowForms({ ...showForms, reschedule: false })}
                                variant="outline"
                                className="flex-1"
                              >
                                Отмена
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    
                    {/* Отметить выполненным */}
                    {['installation_planned', 'both_planned'].includes(currentComplaint.status) && (
                      <Button
                        onClick={() => handleAction('complete')}
                        disabled={isProcessing}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                      >
                        <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        ✓ Отметить выполненной
                      </Button>
                    )}
                  </>
                )}

                {/* Действия для менеджера */}
                {user?.role === 'manager' && currentComplaint.manager?.id === user.id && (
                  <>
                    {(currentComplaint.status === 'new' || !currentComplaint.complaint_type) && (
                      <div className="p-4 border-2 border-yellow-200 rounded-xl bg-yellow-50">
                        <div className="flex items-start">
                          <svg className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-1">Ожидает обработки</h4>
                            <p className="text-xs text-gray-700">
                              Рекламация отправлена сервис-менеджеру на обработку. После того как СМ назначит тип рекламации "Менеджер", вы получите уведомление и сможете оформить заказ в производство.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {currentComplaint.status === 'in_progress' && currentComplaint.complaint_type === 'manager' && (
                      <div className="p-4 border-2 border-purple-200 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 mb-3">
                        <p className="text-xs text-gray-700 flex items-start mb-3">
                          <svg className="inline h-4 w-4 mr-2 text-purple-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Оформите заказ на производство за счет филиала, затем нажмите кнопку "Заказ в производстве" и укажите предварительную дату готовности.
                        </p>
                        <div className="mb-3">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Предварительная дата готовности <span className="text-red-500">*</span></label>
                          <input
                            type="date"
                            value={formData.productionDeadline || ''}
                            onChange={(e) => setFormData({ ...formData, productionDeadline: e.target.value })}
                            required
                            min={new Date().toISOString().split('T')[0]}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                        <Button
                          onClick={() => handleAction('start_production')}
                          disabled={isProcessing}
                          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
                        >
                          <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                          Заказ в производстве
                        </Button>
                      </div>
                    )}

                    {currentComplaint.status === 'in_production' && currentComplaint.complaint_type === 'manager' && (
                      <Button
                        onClick={() => handleAction('mark_warehouse')}
                        disabled={isProcessing}
                        className="w-full bg-green-600 text-white hover:bg-green-700"
                      >
                        <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Товар на складе
                      </Button>
                    )}

                    {(currentComplaint.status === 'on_warehouse' || currentComplaint.status === 'installation_planned') && !currentComplaint.planned_shipping_date && (
                      <div className="p-4 border-2 border-blue-200 rounded-xl bg-blue-50">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Планирование отгрузки</h4>
                        <div className="mb-3">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Дата отгрузки</label>
                          <input
                            type="date"
                            value={formData.shippingDate || ''}
                            onChange={(e) => setFormData({ ...formData, shippingDate: e.target.value })}
                            required
                            min={new Date().toISOString().split('T')[0]}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <Button
                          onClick={() => handleAction('plan_shipping')}
                          disabled={isProcessing}
                          className="w-full bg-blue-600 text-white hover:bg-blue-700"
                        >
                          <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Отгрузка запланирована
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* Кнопка назад */}
                <Link to={user?.role === 'installer' ? '/installer/planning' : '/complaints'}>
                  <Button variant="outline" className="w-full">
                    <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    {user?.role === 'installer' ? 'Вернуться к задачам' : 'Вернуться к списку'}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Документы */}
            {(currentComplaint.document_package_link || commercialOffers.length > 0 || currentComplaint.commercial_offer_url) && (
              <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Документы</h2>
                <div className="space-y-2">
                  {currentComplaint.document_package_link && (
                    <button
                      onClick={() => setViewingFile({
                        url: currentComplaint.document_package_link || '',
                        name: 'Пакет документов'
                      })}
                      className="flex items-center text-sm text-primary-600 hover:text-primary-700 p-2 rounded-lg hover:bg-blue-50 transition-colors w-full text-left"
                    >
                      <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                      </svg>
                      Пакет документов
                    </button>
                  )}
                  
                  {commercialOffers.map((attachment, index) => (
                    <button
                      key={attachment.id}
                      onClick={() => setViewingFile({
                        url: attachment.file_url || attachment.file || '',
                        name: `КП #${index + 1}`
                      })}
                      className="flex items-center text-sm text-primary-600 hover:text-primary-700 p-2 rounded-lg hover:bg-blue-50 transition-colors w-full text-left"
                    >
                      <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      КП #{index + 1}
                      {attachment.file_size && (
                        <span className="ml-auto text-xs text-gray-500">{attachment.file_size}</span>
                      )}
                    </button>
                  ))}
                  
                  {currentComplaint.commercial_offer_url && (
                    <button
                      onClick={() => setViewingFile({
                        url: currentComplaint.commercial_offer_url || '',
                        name: 'КП (старое)'
                      })}
                      className="flex items-center text-sm text-primary-600 hover:text-primary-700 p-2 rounded-lg hover:bg-blue-50 transition-colors w-full text-left"
                    >
                      <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      КП (старое)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модальное окно для просмотра файлов */}
      <FileViewer
        fileUrl={viewingFile?.url || null}
        fileName={viewingFile?.name}
        onClose={() => setViewingFile(null)}
      />
    </div>
  )
}

export default ComplaintDetail

