import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { complaintsAPI } from '../../api/complaints'
import { referencesAPI } from '../../api/references'
import { ComplaintCreateData, ComplaintType, DefectiveProduct, ParsedComplaintData, ParsedProduct } from '../../types/complaints'
import { ProductionSite, ComplaintReason } from '../../types/complaints'
import { useComplaintsStore } from '../../store/complaintsStore'
import { useAuthStore } from '../../store/authStore'
import Input from '../../components/common/Input'
import Button from '../../components/common/Button'
import FileUploadList from '../../components/complaints/FileUploadList'
import FileViewer from '../../components/common/FileViewer'
import { User } from '../../types/auth'

interface DefectiveProductForm {
  id?: number
  product_name: string
  size: string
  opening_type: string
  problem_description: string
}

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
  const [commercialOffers, setCommercialOffers] = useState<File[]>([])
  const [defectiveProducts, setDefectiveProducts] = useState<DefectiveProductForm[]>([])
  const [deletedProductIds, setDeletedProductIds] = useState<number[]>([])
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<number[]>([])
  const [viewingFile, setViewingFile] = useState<{ url: string; name?: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [error, setError] = useState('')
  const [isParsingPDF, setIsParsingPDF] = useState(false)
  const [showProductSelection, setShowProductSelection] = useState(false)
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([])

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
          // Бракованные изделия — для полного редактирования СМ
          if (complaint.defective_products && complaint.defective_products.length > 0) {
            setDefectiveProducts(complaint.defective_products.map((p: DefectiveProduct) => ({
              id: p.id,
              product_name: p.product_name || '',
              size: p.size || '',
              opening_type: p.opening_type || '',
              problem_description: p.problem_description || '',
            })))
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
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)
      setAttachments(prev => [...prev, ...newFiles])
      e.target.value = ''
    }
  }

  const handleCommercialOffersChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)

      const pdfFiles = newFiles.filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))

      if (pdfFiles.length > 0) {
        const pdfFile = pdfFiles[0]
        setIsParsingPDF(true)
        setError('')

        try {
          const parsedData: ParsedComplaintData = await complaintsAPI.parsePDF(pdfFile)

          if (parsedData.order_number) {
            setValue('order_number', parsedData.order_number)
          }
          if (parsedData.client_name) {
            setValue('client_name', parsedData.client_name)
          }
          if (parsedData.contact_person) {
            setValue('contact_person', parsedData.contact_person)
          }
          if (parsedData.contact_phone) {
            setValue('contact_phone', parsedData.contact_phone)
          }
          if (parsedData.address) {
            setValue('address', parsedData.address)
          }

          if (parsedData.manager_name && managers.length > 0) {
            const managerNameFromPDF = parsedData.manager_name.trim().toLowerCase()
            const foundManager = managers.find(manager => {
              const fullName = `${manager.first_name || ''} ${manager.last_name || ''}`.trim().toLowerCase()
              const reverseName = `${manager.last_name || ''} ${manager.first_name || ''}`.trim().toLowerCase()
              return fullName.includes(managerNameFromPDF) ||
                     managerNameFromPDF.includes(fullName) ||
                     reverseName.includes(managerNameFromPDF) ||
                     managerNameFromPDF.includes(reverseName)
            })
            if (foundManager) {
              setValue('manager_id', foundManager.id)
            }
          }

          setCommercialOffers(prev => [...prev, ...newFiles])

          if (parsedData.defective_products && parsedData.defective_products.length > 0) {
            setParsedProducts(parsedData.defective_products)
            setShowProductSelection(true)
          } else {
            alert('Данные из PDF успешно заполнены. Изделия не найдены.')
          }
        } catch (err: any) {
          const errorMessage = err.response?.data?.error || err.message || 'Ошибка при парсинге PDF файла'
          setError(errorMessage)
          console.error('Ошибка парсинга PDF:', err)
          setCommercialOffers(prev => [...prev, ...newFiles])
        } finally {
          setIsParsingPDF(false)
        }
      } else {
        setCommercialOffers(prev => [...prev, ...newFiles])
      }

      e.target.value = ''
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const removeCommercialOffer = (index: number) => {
    setCommercialOffers(prev => prev.filter((_, i) => i !== index))
  }

  const removeExistingAttachment = (attachmentId: number) => {
    setDeletedAttachmentIds(prev => [...prev, attachmentId])
  }

  const restoreExistingAttachment = (attachmentId: number) => {
    setDeletedAttachmentIds(prev => prev.filter(id => id !== attachmentId))
  }

  const addDefectiveProduct = () => {
    setDefectiveProducts(prev => [...prev, { product_name: '', size: '', opening_type: '', problem_description: '' }])
  }

  const updateDefectiveProduct = (index: number, field: keyof DefectiveProductForm, value: string) => {
    setDefectiveProducts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  const removeDefectiveProduct = (index: number) => {
    const product = defectiveProducts[index]
    if (product.id) {
      setDeletedProductIds(prev => [...prev, product.id!])
    }
    setDefectiveProducts(prev => prev.filter((_, i) => i !== index))
  }

  const handleAddSelectedProducts = (selectedIndices: number[]) => {
    const selectedProducts = selectedIndices.map(index => parsedProducts[index])
    const newProducts: DefectiveProductForm[] = selectedProducts.map(product => ({
      product_name: product.product_name || '',
      size: product.size || '',
      opening_type: product.opening_type || '',
      problem_description: product.problem_description || '',
    }))

    if (defectiveProducts.length === 0) {
      setDefectiveProducts(newProducts)
    } else {
      setDefectiveProducts(prev => [...prev, ...newProducts])
    }

    setShowProductSelection(false)
    setParsedProducts([])
  }

  const handleCancelProductSelection = () => {
    setShowProductSelection(false)
    setParsedProducts([])
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

      await complaintsAPI.update(
        Number(id),
        apiData,
        attachments.length > 0 ? attachments : undefined,
        commercialOffers.length > 0 ? commercialOffers : undefined
      )

      // Удаление помеченных вложений
      for (const attachmentId of deletedAttachmentIds) {
        await complaintsAPI.deleteAttachment(Number(id), attachmentId)
      }

      // Бракованные изделия: удаление, создание, обновление
      for (const productId of deletedProductIds) {
        await complaintsAPI.deleteDefectiveProduct(productId)
      }
      for (const product of defectiveProducts) {
        if (product.id) {
          await complaintsAPI.updateDefectiveProduct(product.id, {
            product_name: product.product_name,
            size: product.size,
            opening_type: product.opening_type,
            problem_description: product.problem_description,
          })
        } else if (product.product_name.trim() || product.problem_description.trim()) {
          await complaintsAPI.createDefectiveProduct({
            complaint: Number(id),
            product_name: product.product_name || '—',
            size: product.size,
            opening_type: product.opening_type,
            problem_description: product.problem_description || '—',
            order: defectiveProducts.indexOf(product),
          })
        }
      }

      navigate(`/complaints/${id}`)
    } catch (err: any) {
      console.error('[ComplaintEdit] Ошибка обновления:', err.response?.status, err.response?.data || err.message)
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

          {/* Бракованные изделия — только для сервис-менеджера */}
          {isServiceManager && (
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Бракованные изделия</h2>
              <p className="text-sm text-gray-600 mb-4">
                Наименование, параметры и описание проблемы по каждому изделию.
              </p>
              <div className="space-y-4">
                {defectiveProducts.map((product, index) => (
                  <div key={product.id || `new-${index}`} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-medium text-gray-700">Изделие #{index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeDefectiveProduct(index)}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        Удалить
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Наименование</label>
                        <input
                          type="text"
                          value={product.product_name}
                          onChange={(e) => updateDefectiveProduct(index, 'product_name', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Название изделия"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Размер</label>
                        <input
                          type="text"
                          value={product.size}
                          onChange={(e) => updateDefectiveProduct(index, 'size', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Размеры"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Открывание</label>
                        <input
                          type="text"
                          value={product.opening_type}
                          onChange={(e) => updateDefectiveProduct(index, 'opening_type', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Тип открывания"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Описание проблемы</label>
                        <input
                          type="text"
                          value={product.problem_description}
                          onChange={(e) => updateDefectiveProduct(index, 'problem_description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Описание дефекта"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addDefectiveProduct}>
                  + Добавить изделие
                </Button>
              </div>
            </div>
          )}

          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Дополнительные файлы</h2>
            <div className="space-y-4">
              {/* Существующие вложения */}
              {currentComplaint?.attachments && currentComplaint.attachments.filter(a => a.attachment_type !== 'commercial_offer').length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Существующие вложения</label>
                  <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    {currentComplaint.attachments
                      .filter(a => a.attachment_type !== 'commercial_offer')
                      .map((attachment) => {
                        const isDeleted = deletedAttachmentIds.includes(attachment.id)
                        return (
                          <div key={attachment.id} className={`flex items-center justify-between p-2 rounded border transition-all ${isDeleted ? 'bg-red-50 border-red-200 opacity-60' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <div className="flex-shrink-0">
                                {attachment.attachment_type === 'photo' ? (
                                  <svg className={`h-6 w-6 ${isDeleted ? 'text-red-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                ) : attachment.attachment_type === 'video' ? (
                                  <svg className={`h-6 w-6 ${isDeleted ? 'text-red-400' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                ) : (
                                  <svg className={`h-6 w-6 ${isDeleted ? 'text-red-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => !isDeleted && setViewingFile({
                                    url: (attachment as any).file_url || attachment.file || '',
                                    name: attachment.file?.split('/').pop() || 'Файл'
                                  })}
                                  className={`text-sm font-medium truncate block text-left ${isDeleted ? 'line-through text-red-400 cursor-default' : 'text-primary-600 hover:text-primary-700 cursor-pointer'}`}
                                >
                                  {attachment.file.split('/').pop()}
                                </button>
                                <p className="text-xs text-gray-500">
                                  {attachment.attachment_type === 'photo' ? 'Фото' : attachment.attachment_type === 'video' ? 'Видео' : 'Документ'}
                                  {attachment.file_size ? ` • ${attachment.file_size}` : ''}
                                  {isDeleted && ' • Будет удалён'}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => isDeleted ? restoreExistingAttachment(attachment.id) : removeExistingAttachment(attachment.id)}
                              className={`ml-2 flex-shrink-0 transition-colors ${isDeleted ? 'text-green-600 hover:text-green-700' : 'text-red-600 hover:text-red-700'}`}
                              title={isDeleted ? 'Восстановить' : 'Удалить'}
                            >
                              {isDeleted ? (
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                              ) : (
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )
                      })}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {deletedAttachmentIds.some(id => currentComplaint.attachments!.filter(a => a.attachment_type !== 'commercial_offer').some(a => a.id === id))
                      ? 'Помеченные файлы будут удалены при сохранении.'
                      : 'Нажмите на корзину, чтобы удалить файл.'}
                  </p>
                </div>
              )}

              {/* Существующие КП */}
              {currentComplaint?.attachments && currentComplaint.attachments.filter(a => a.attachment_type === 'commercial_offer').length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Существующие коммерческие предложения</label>
                  <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    {currentComplaint.attachments
                      .filter(a => a.attachment_type === 'commercial_offer')
                      .map((attachment, idx) => {
                        const isDeleted = deletedAttachmentIds.includes(attachment.id)
                        return (
                          <div key={attachment.id} className={`flex items-center justify-between p-2 rounded border transition-all ${isDeleted ? 'bg-red-50 border-red-200 opacity-60' : 'bg-white border-blue-200'}`}>
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <svg className={`h-6 w-6 flex-shrink-0 ${isDeleted ? 'text-red-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <div className="flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => !isDeleted && setViewingFile({
                                    url: (attachment as any).file_url || attachment.file || '',
                                    name: `КП #${idx + 1}`
                                  })}
                                  className={`text-sm font-medium truncate block text-left ${isDeleted ? 'line-through text-red-400 cursor-default' : 'text-primary-600 hover:text-primary-700 cursor-pointer'}`}
                                >
                                  КП #{idx + 1}
                                </button>
                                <p className="text-xs text-gray-500">
                                  {attachment.file_size || ''}
                                  {isDeleted && ' • Будет удалён'}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => isDeleted ? restoreExistingAttachment(attachment.id) : removeExistingAttachment(attachment.id)}
                              className={`ml-2 flex-shrink-0 transition-colors ${isDeleted ? 'text-green-600 hover:text-green-700' : 'text-red-600 hover:text-red-700'}`}
                              title={isDeleted ? 'Восстановить' : 'Удалить'}
                            >
                              {isDeleted ? (
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                              ) : (
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )
                      })}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {deletedAttachmentIds.some(id => currentComplaint.attachments!.filter(a => a.attachment_type === 'commercial_offer').some(a => a.id === id))
                      ? 'Помеченные КП будут удалены при сохранении.'
                      : 'Нажмите на корзину, чтобы удалить КП.'}
                  </p>
                </div>
              )}

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
                <FileUploadList files={attachments} onRemove={removeAttachment} type="attachments" />
              </div>
              {isServiceManager && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Коммерческое предложение (КП)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx"
                    onChange={handleCommercialOffersChange}
                    disabled={isParsingPDF}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {isParsingPDF && (
                    <div className="mt-2 flex items-center text-blue-600">
                      <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="text-sm">Парсинг PDF файла...</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Можно выбрать несколько файлов КП. При загрузке PDF данные будут автоматически извлечены и заполнены.
                  </p>
                  <FileUploadList files={commercialOffers} onRemove={removeCommercialOffer} type="commercial_offers" />
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

      {showProductSelection && parsedProducts.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Выберите изделия для добавления</h2>
              <p className="text-sm text-gray-600 mt-1">
                Найдено изделий в PDF: {parsedProducts.length}. Выберите те, которые нужно добавить в рекламацию.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <ProductSelectionDialog
                products={parsedProducts}
                onAddSelected={handleAddSelectedProducts}
                onCancel={handleCancelProductSelection}
              />
            </div>
          </div>
        </div>
      )}

      <FileViewer
        fileUrl={viewingFile?.url || null}
        fileName={viewingFile?.name}
        onClose={() => setViewingFile(null)}
      />
    </div>
  )
}

interface ProductSelectionDialogProps {
  products: ParsedProduct[]
  onAddSelected: (selectedIndices: number[]) => void
  onCancel: () => void
}

const ProductSelectionDialog = ({ products, onAddSelected, onCancel }: ProductSelectionDialogProps) => {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())

  const toggleProduct = (index: number) => {
    const newSelected = new Set(selectedIndices)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedIndices(newSelected)
  }

  const selectAll = () => {
    setSelectedIndices(new Set(products.map((_, i) => i)))
  }

  const deselectAll = () => {
    setSelectedIndices(new Set())
  }

  const handleAdd = () => {
    onAddSelected(Array.from(selectedIndices))
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={selectAll}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Выбрать все
          </button>
          <span className="text-gray-400">|</span>
          <button
            type="button"
            onClick={deselectAll}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Снять все
          </button>
        </div>
        <span className="text-sm text-gray-600">
          Выбрано: {selectedIndices.size} из {products.length}
        </span>
      </div>

      <div className="space-y-3">
        {products.map((product, index) => (
          <div
            key={index}
            className={`border rounded-xl p-4 cursor-pointer transition-colors ${
              selectedIndices.has(index)
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => toggleProduct(index)}
          >
            <div className="flex items-start">
              <input
                type="checkbox"
                checked={selectedIndices.has(index)}
                onChange={() => toggleProduct(index)}
                className="mt-1 mr-3 h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex-1">
                <div className="font-semibold text-gray-900 mb-2">
                  {product.product_name || 'Без названия'}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-600">
                  {product.size && (
                    <div>
                      <span className="font-medium">Размер:</span> {product.size}
                    </div>
                  )}
                  {product.opening_type && (
                    <div>
                      <span className="font-medium">Открывание:</span> {product.opening_type}
                    </div>
                  )}
                  {product.problem_description && (
                    <div className="md:col-span-3">
                      <span className="font-medium">Описание проблемы:</span> {product.problem_description}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          Отмена
        </Button>
        <Button
          type="button"
          onClick={handleAdd}
          disabled={selectedIndices.size === 0}
        >
          Добавить выбранные ({selectedIndices.size})
        </Button>
      </div>
    </div>
  )
}

export default ComplaintEdit

