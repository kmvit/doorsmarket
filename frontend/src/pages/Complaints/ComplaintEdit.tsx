import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { complaintsAPI } from '../../api/complaints'
import { referencesAPI } from '../../api/references'
import { ComplaintCreateData, ComplaintType } from '../../types/complaints'
import { ProductionSite, ComplaintReason } from '../../types/complaints'
import { useComplaintsStore } from '../../store/complaintsStore'
import { useAuthStore } from '../../store/authStore'
import Input from '../../components/common/Input'
import Button from '../../components/common/Button'
import { User } from '../../types/auth'

const ComplaintEdit = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { fetchComplaint } = useComplaintsStore()
  const { currentComplaint } = useComplaintsStore()
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<ComplaintCreateData & { complaint_type?: ComplaintType | ''; recipient_id?: number; installer_assigned_id?: number; commercial_offer_text?: string }>()
  const [productionSites, setProductionSites] = useState<ProductionSite[]>([])
  const [reasons, setReasons] = useState<ComplaintReason[]>([])
  const [serviceManagers, setServiceManagers] = useState<User[]>([])
  const [managers, setManagers] = useState<User[]>([])
  const [installers, setInstallers] = useState<User[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [error, setError] = useState('')

  const isServiceManager = user?.role === 'service_manager'

  useEffect(() => {
    const loadData = async () => {
      if (!id) return

      setIsLoadingData(true)
      try {
        const loadPromises: Promise<unknown>[] = [
          referencesAPI.getProductionSites(),
          referencesAPI.getComplaintReasons(),
        ]
        if (user?.role === 'service_manager') {
          loadPromises.push(
            referencesAPI.getUsersByRole('service_manager'),
            referencesAPI.getUsersByRole('manager'),
            referencesAPI.getUsersByRole('installer'),
          )
        }

        const results = await Promise.all(loadPromises)
        setProductionSites(results[0] as ProductionSite[])
        setReasons(results[1] as ComplaintReason[])
        if (user?.role === 'service_manager' && results.length >= 5) {
          setServiceManagers(results[2] as User[])
          setManagers(results[3] as User[])
          setInstallers(results[4] as User[])
        }

        // Загружаем рекламацию
        await fetchComplaint(Number(id))

        // Заполняем форму данными рекламации после загрузки
        const complaint = useComplaintsStore.getState().currentComplaint
        if (complaint) {
          setValue('production_site_id', complaint.production_site.id)
          setValue('reason_id', complaint.reason.id)
          setValue('order_number', complaint.order_number)
          setValue('client_name', complaint.client_name)
          setValue('address', complaint.address)
          setValue('contact_person', complaint.contact_person)
          setValue('contact_phone', complaint.contact_phone)
          setValue('additional_info', complaint.additional_info || '')
          setValue('assignee_comment', complaint.assignee_comment || '')
          setValue('document_package_link', complaint.document_package_link || '')
          if (complaint.manager) {
            setValue('manager_id', complaint.manager.id)
          }
          if (user?.role === 'service_manager') {
            setValue('complaint_type', (complaint.complaint_type ?? undefined) as ComplaintType | undefined)
            if (complaint.recipient) {
              setValue('recipient_id', complaint.recipient.id)
            }
            if (complaint.installer_assigned) {
              setValue('installer_assigned_id', complaint.installer_assigned.id)
            }
            setValue('commercial_offer_text', complaint.commercial_offer_text || '')
          }
        }
      } catch (error) {
        console.error('Error loading data:', error)
        setError('Ошибка загрузки данных')
      } finally {
        setIsLoadingData(false)
      }
    }

    loadData()
  }, [id, fetchComplaint, setValue, user?.role])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(Array.from(e.target.files))
    }
  }

  const onSubmit = async (data: ComplaintCreateData & { complaint_type?: ComplaintType | ''; recipient_id?: number; installer_assigned_id?: number; commercial_offer_text?: string }) => {
    if (!id) return

    setIsLoading(true)
    setError('')

    try {
      // Преобразуем данные для API
      const apiData: Partial<ComplaintCreateData> & { installer_assigned_id?: number } = {
        production_site_id: Number(data.production_site_id),
        reason_id: Number(data.reason_id),
        order_number: data.order_number,
        client_name: data.client_name,
        address: data.address,
        contact_person: data.contact_person,
        contact_phone: data.contact_phone,
        additional_info: data.additional_info || '',
        assignee_comment: data.assignee_comment || '',
        document_package_link: data.document_package_link || '',
      }

      if (data.manager_id) {
        apiData.manager_id = Number(data.manager_id)
      }

      // Сервис-менеджер может редактировать все поля
      if (isServiceManager) {
        if (data.complaint_type) {
          apiData.complaint_type = data.complaint_type
        }
        if (data.recipient_id) {
          apiData.recipient_id = Number(data.recipient_id)
        }
        if (data.installer_assigned_id) {
          apiData.installer_assigned_id = Number(data.installer_assigned_id)
        }
        if (data.commercial_offer_text !== undefined) {
          apiData.commercial_offer_text = data.commercial_offer_text
        }
      }

      await complaintsAPI.update(Number(id), apiData, attachments.length > 0 ? attachments : undefined)
      navigate(`/complaints/${id}`)
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 
                          err.response?.data?.error || 
                          (typeof err.response?.data === 'object' ? JSON.stringify(err.response.data) : 'Ошибка обновления рекламации')
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoadingData) {
    return (
      <div className="min-h-screen py-12 px-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error && !currentComplaint) {
    return (
      <div className="min-h-screen py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-lg">
            <p className="font-medium">{error}</p>
          </div>
          <Button onClick={() => navigate('/complaints')} className="mt-4">
            Вернуться к списку
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Редактирование рекламации #{id}</h1>
          <p className="text-sm text-gray-600 mt-1">Измените необходимые поля</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-lg">
            <p className="font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Секция назначения — только для сервис-менеджера */}
          {isServiceManager && (
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Назначение</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Тип рекламации</label>
                  <select
                    {...register('complaint_type')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Не выбран</option>
                    <option value="manager">Менеджер</option>
                    <option value="installer">Монтажник</option>
                    <option value="factory">Фабрика</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Получатель (СМ)</label>
                  <select
                    {...register('recipient_id')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Выберите сервис-менеджера</option>
                    {serviceManagers.map((sm) => (
                      <option key={sm.id} value={sm.id}>
                        {sm.first_name} {sm.last_name} ({sm.username})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Менеджер заказа *</label>
                  <select
                    {...register('manager_id', { required: 'Выберите менеджера заказа' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Выберите менеджера</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name} ({m.username})
                      </option>
                    ))}
                  </select>
                  {errors.manager_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.manager_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Назначенный монтажник</label>
                  <select
                    {...register('installer_assigned_id')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Не назначен</option>
                    {installers.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.first_name} {inst.last_name} ({inst.username})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Основная информация</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Производственная площадка *
                </label>
                <select
                  {...register('production_site_id', { required: 'Выберите производственную площадку' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Выберите площадку</option>
                  {productionSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
                {errors.production_site_id && (
                  <p className="mt-1 text-sm text-red-600">{errors.production_site_id.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Причина рекламации *
                </label>
                <select
                  {...register('reason_id', { required: 'Выберите причину' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Выберите причину</option>
                  {reasons.map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.name}
                    </option>
                  ))}
                </select>
                {errors.reason_id && (
                  <p className="mt-1 text-sm text-red-600">{errors.reason_id.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Номер заказа *
                </label>
                <Input
                  {...register('order_number', { required: 'Введите номер заказа' })}
                  type="text"
                  placeholder="Номер заказа"
                />
                {errors.order_number && (
                  <p className="mt-1 text-sm text-red-600">{errors.order_number.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Клиент *
                </label>
                <Input
                  {...register('client_name', { required: 'Введите имя клиента' })}
                  type="text"
                  placeholder="Имя клиента"
                />
                {errors.client_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.client_name.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Адрес *
                </label>
                <Input
                  {...register('address', { required: 'Введите адрес' })}
                  type="text"
                  placeholder="Адрес"
                />
                {errors.address && (
                  <p className="mt-1 text-sm text-red-600">{errors.address.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Контактное лицо *
                </label>
                <Input
                  {...register('contact_person', { required: 'Введите контактное лицо' })}
                  type="text"
                  placeholder="Контактное лицо"
                />
                {errors.contact_person && (
                  <p className="mt-1 text-sm text-red-600">{errors.contact_person.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Телефон *
                </label>
                <Input
                  {...register('contact_phone', { required: 'Введите телефон' })}
                  type="text"
                  placeholder="Телефон"
                />
                {errors.contact_phone && (
                  <p className="mt-1 text-sm text-red-600">{errors.contact_phone.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Дополнительная информация
                </label>
                <textarea
                  {...register('additional_info')}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Дополнительная информация"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Комментарий для менеджера/монтажника
                </label>
                <textarea
                  {...register('assignee_comment')}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Комментарий"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ссылка на пакет документов
                </label>
                <Input
                  {...register('document_package_link')}
                  type="url"
                  placeholder="https://..."
                />
              </div>

              {isServiceManager && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Комментарий к коммерческому предложению
                  </label>
                  <textarea
                    {...register('commercial_offer_text')}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Описание коммерческого предложения"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Дополнительные файлы</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Фото/Видео/Документы
              </label>
              <input
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={handleFileChange}
                className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              />
              <p className="text-xs text-gray-500 mt-2">
                Можно выбрать несколько файлов. Поддерживаются изображения, видео и документы.
              </p>
              {attachments.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Выбранные файлы:</p>
                  {attachments.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700">{file.name}</span>
                      <span className="text-xs text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/complaints/${id}`)}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Сохранение...' : 'Сохранить изменения'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ComplaintEdit

