import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { complaintsAPI } from '../../api/complaints'
import { referencesAPI } from '../../api/references'
import { ComplaintCreateData, ParsedComplaintData, ParsedProduct } from '../../types/complaints'
import { ProductionSite, ComplaintReason } from '../../types/complaints'
import { User } from '../../types/auth'
import { useAuthStore } from '../../store/authStore'
import Button from '../../components/common/Button'
import FileUploadList from '../../components/complaints/FileUploadList'

interface DefectiveProductForm {
  product_name: string
  size: string
  opening_type: string
  problem_description: string
}

const ComplaintCreate = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<ComplaintCreateData & { complaint_type?: string; installer_id?: number }>()
  const [productionSites, setProductionSites] = useState<ProductionSite[]>([])
  const [reasons, setReasons] = useState<ComplaintReason[]>([])
  const [managers, setManagers] = useState<User[]>([])
  const [installers, setInstallers] = useState<User[]>([])
  const [recipients, setRecipients] = useState<User[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [commercialOffers, setCommercialOffers] = useState<File[]>([])
  const [defectiveProducts, setDefectiveProducts] = useState<DefectiveProductForm[]>([
    { product_name: '', size: '', opening_type: '', problem_description: '' }
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [error, setError] = useState('')
  const [isParsingPDF, setIsParsingPDF] = useState(false)
  const [showProductSelection, setShowProductSelection] = useState(false)
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([])

  const complaintType = watch('complaint_type')

  useEffect(() => {
    const loadReferences = async () => {
      setIsLoadingData(true)
      try {
        const [sites, reasonsData] = await Promise.all([
          referencesAPI.getProductionSites(),
          referencesAPI.getComplaintReasons(),
        ])
        setProductionSites(sites)
        setReasons(reasonsData)

        // Загружаем пользователей отдельно с обработкой ошибок
        try {
          const managersData = await referencesAPI.getUsersByRole('manager')
          setManagers(managersData || [])
        } catch (error) {
          console.warn('Failed to load managers:', error)
          setManagers([])
        }

        try {
          const installersData = await referencesAPI.getUsersByRole('installer')
          setInstallers(installersData || [])
        } catch (error) {
          console.warn('Failed to load installers:', error)
          setInstallers([])
        }

        try {
          const [smData, cdData, leaderData] = await Promise.all([
            referencesAPI.getUsersByRole('service_manager').catch(() => []),
            referencesAPI.getUsersByRole('complaint_department').catch(() => []),
            referencesAPI.getUsersByRole('leader').catch(() => []),
          ])
          setRecipients([...(smData || []), ...(cdData || []), ...(leaderData || [])])
        } catch (error) {
          console.warn('Failed to load recipients:', error)
          setRecipients([])
        }
      } catch (error) {
        console.error('Error loading references:', error)
        setError('Ошибка загрузки данных. Пожалуйста, обновите страницу.')
      } finally {
        setIsLoadingData(false)
      }
    }
    loadReferences()
  }, [])

  const handleAttachmentsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setAttachments(prev => [...prev, ...newFiles])
      e.target.value = '' // Сбрасываем input для возможности добавить еще файлы
    }
  }

  const handleCommercialOffersChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      
      // Проверяем, есть ли среди новых файлов PDF
      const pdfFiles = newFiles.filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
      
      if (pdfFiles.length > 0) {
        // Парсим первый PDF файл
        const pdfFile = pdfFiles[0]
        setIsParsingPDF(true)
        setError('')
        
        try {
          const parsedData: ParsedComplaintData = await complaintsAPI.parsePDF(pdfFile)
          
          // Заполняем поля формы
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
          
          // Ищем менеджера по имени из PDF
          if (parsedData.manager_name && managers.length > 0) {
            // Нормализуем имя из PDF (убираем лишние пробелы)
            const managerNameFromPDF = parsedData.manager_name.trim().toLowerCase()
            
            // Ищем менеджера, у которого имя совпадает (в любом порядке)
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
              console.log(`Найден менеджер: ${foundManager.first_name} ${foundManager.last_name} (ID: ${foundManager.id})`)
            } else {
              console.warn(`Менеджер "${parsedData.manager_name}" не найден в списке`)
            }
          }
          
          // Добавляем все файлы (включая PDF) в коммерческие предложения
          setCommercialOffers(prev => [...prev, ...newFiles])
          
          // Если есть изделия, показываем диалог выбора
          if (parsedData.defective_products && parsedData.defective_products.length > 0) {
            setParsedProducts(parsedData.defective_products)
            setShowProductSelection(true)
          } else {
            // Если изделий нет, просто показываем уведомление
            alert('Данные из PDF успешно заполнены. Изделия не найдены.')
          }
        } catch (err: any) {
          const errorMessage = err.response?.data?.error || err.message || 'Ошибка при парсинге PDF файла'
          setError(errorMessage)
          console.error('Ошибка парсинга PDF:', err)
          // Все равно добавляем файл, если парсинг не удался
          setCommercialOffers(prev => [...prev, ...newFiles])
        } finally {
          setIsParsingPDF(false)
        }
      } else {
        // Если нет PDF файлов, просто добавляем их
        setCommercialOffers(prev => [...prev, ...newFiles])
      }
      
      e.target.value = '' // Сбрасываем input для возможности добавить еще файлы
    }
  }
  
  const handleAddSelectedProducts = (selectedIndices: number[]) => {
    // Добавляем выбранные изделия в форму
    const selectedProducts = selectedIndices.map(index => parsedProducts[index])
    
    // Преобразуем в формат DefectiveProductForm
    const newProducts: DefectiveProductForm[] = selectedProducts.map(product => ({
      product_name: product.product_name || '',
      size: product.size || '',
      opening_type: product.opening_type || '',
      problem_description: product.problem_description || '',
    }))
    
    // Добавляем к существующим изделиям (если первое пустое, заменяем, иначе добавляем)
    if (defectiveProducts.length === 1 && !defectiveProducts[0].product_name) {
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

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const removeCommercialOffer = (index: number) => {
    setCommercialOffers(prev => prev.filter((_, i) => i !== index))
  }


  const addProduct = () => {
    setDefectiveProducts(prev => [...prev, { product_name: '', size: '', opening_type: '', problem_description: '' }])
  }

  const removeProduct = (index: number) => {
    if (defectiveProducts.length > 1) {
      setDefectiveProducts(prev => prev.filter((_, i) => i !== index))
    } else {
      alert('Должно быть хотя бы одно изделие')
    }
  }

  const copyProduct = (index: number) => {
    const product = defectiveProducts[index]
    setDefectiveProducts(prev => [...prev, { ...product }])
  }

  const updateProduct = (index: number, field: keyof DefectiveProductForm, value: string) => {
    setDefectiveProducts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  const onSubmit = async (data: ComplaintCreateData & { complaint_type?: string; installer_id?: number }) => {
    // Проверка для монтажников - обязательно должны быть вложения
    if (user?.role === 'installer' && attachments.length === 0) {
      setError('⚠️ Для монтажников обязательно нужно прикрепить фото/видео/документы!')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // Преобразуем данные для API
      // Проверяем обязательные поля
      if (!data.production_site_id || !data.reason_id) {
        setError('Пожалуйста, заполните все обязательные поля (Производственная площадка и Причина рекламации)')
        setIsLoading(false)
        return
      }

      const apiData: ComplaintCreateData = {
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

      // Добавляем опциональные поля
      if (data.manager_id) {
        apiData.manager_id = Number(data.manager_id)
      }

      if (data.recipient_id) {
        apiData.recipient_id = Number(data.recipient_id)
      }

      if (data.complaint_type) {
        apiData.complaint_type = data.complaint_type as 'manager' | 'installer' | 'factory'
      }

      if (data.installer_id) {
        apiData.installer_assigned_id = Number(data.installer_id)
      }

      // Создаем рекламацию с обычными вложениями и КП отдельно
      const complaint = await complaintsAPI.create(
        apiData, 
        attachments.length > 0 ? attachments : undefined,
        commercialOffers.length > 0 ? commercialOffers : undefined
      )

      // Создаем бракованные изделия
      if (defectiveProducts.some(p => p.product_name || p.size || p.opening_type || p.problem_description)) {
        for (let i = 0; i < defectiveProducts.length; i++) {
          const product = defectiveProducts[i]
          if (product.product_name || product.size || product.opening_type || product.problem_description) {
            await complaintsAPI.createDefectiveProduct({
              complaint: complaint.id,
              product_name: product.product_name || '',
              size: product.size || '',
              opening_type: product.opening_type || '',
              problem_description: product.problem_description || '',
              order: i,
            })
          }
        }
      }

      // Если рекламация типа "Фабрика", отправляем email уведомление после создания всех данных
      if (data.complaint_type === 'factory') {
        try {
          await complaintsAPI.sendFactoryEmail(complaint.id)
        } catch (emailError) {
          console.warn('Ошибка отправки email уведомления:', emailError)
          // Не прерываем процесс создания рекламации из-за ошибки email
        }
      }

      navigate(`/complaints/${complaint.id}`)
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 
                          err.response?.data?.error || 
                          (typeof err.response?.data === 'object' ? JSON.stringify(err.response.data) : 'Ошибка создания рекламации')
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const showRecipient = user && !['manager', 'installer', 'service_manager'].includes(user.role)
  const showManagerField = user && ['service_manager', 'installer', 'admin', 'leader', 'complaint_department', 'manager'].includes(user.role)

  if (isLoadingData) {
    return (
      <div className="min-h-screen py-12 px-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Создать рекламацию</h1>
          <p className="text-sm text-gray-600 mt-1">
            Заполните все обязательные поля, отмеченные <span className="text-red-500">*</span>
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-lg">
            <p className="font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Назначение */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Назначение</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {user?.role === 'service_manager' && (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Тип рекламации <span className="text-red-500">*</span>
                    </label>
                    <select
                      {...register('complaint_type', { required: user?.role === 'service_manager' })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value="">Выберите тип рекламации</option>
                      <option value="manager">Менеджер</option>
                      <option value="installer">Монтажник</option>
                      <option value="factory">Фабрика</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Выберите, кто будет обрабатывать рекламацию</p>
                  </div>

                  {complaintType === 'installer' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Монтажник <span className="text-red-500">*</span>
                      </label>
                      <select
                        {...register('installer_id', { required: complaintType === 'installer' })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
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
                  )}
                </>
              )}

              {showRecipient ? (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Получатель <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register('recipient_id', { required: showRecipient })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">Выберите получателя</option>
                    {recipients.map((recipient) => (
                      <option key={recipient.id} value={recipient.id}>
                        {recipient.first_name && recipient.last_name
                          ? `${recipient.first_name} ${recipient.last_name}`
                          : recipient.username}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="md:col-span-2">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-sm text-blue-700">
                      <strong>Получатель:</strong> Автоматически назначается сервис-менеджер
                    </p>
                  </div>
                </div>
              )}

              {showManagerField && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Менеджер заказа <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register('manager_id', { required: showManagerField })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">Выберите менеджера заказа</option>
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.first_name && manager.last_name
                          ? `${manager.first_name} ${manager.last_name}`
                          : manager.username}
                        {manager.city && ` (${manager.city.name})`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Выберите менеджера, ответственного за заказ</p>
                </div>
              )}
            </div>
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Комментарий менеджеру/монтажнику
              </label>
              <textarea
                {...register('assignee_comment')}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Дополнительные указания для менеджера или монтажника. Например, что уточнить у клиента или какие материалы подготовить."
              />
              <p className="text-xs text-gray-500 mt-1">Поле необязательное, видно менеджеру и монтажнику.</p>
            </div>
          </div>

          {/* Производство и причина */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Производство</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Производственная площадка <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('production_site_id', { required: true })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">Выберите площадку</option>
                  {productionSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
                {errors.production_site_id && (
                  <p className="mt-1 text-sm text-red-600">Обязательное поле</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Причина рекламации <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('reason_id', { required: true })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">Выберите причину</option>
                  {reasons.map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.name}
                    </option>
                  ))}
                </select>
                {errors.reason_id && (
                  <p className="mt-1 text-sm text-red-600">Обязательное поле</p>
                )}
              </div>
            </div>
          </div>

          {/* Информация о заказе и клиенте */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Информация о заказе и клиенте</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Номер заказа <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('order_number', { required: true })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Например: ORD-12345"
                />
                {errors.order_number && (
                  <p className="mt-1 text-sm text-red-600">Обязательное поле</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Наименование клиента <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('client_name', { required: true })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="ООО Компания"
                />
                {errors.client_name && (
                  <p className="mt-1 text-sm text-red-600">Обязательное поле</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Адрес <span className="text-red-500">*</span>
                </label>
                <textarea
                  {...register('address', { required: true })}
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Полный адрес установки"
                />
                {errors.address && (
                  <p className="mt-1 text-sm text-red-600">Обязательное поле</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Контактное лицо <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('contact_person', { required: true })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Иван Иванов"
                />
                {errors.contact_person && (
                  <p className="mt-1 text-sm text-red-600">Обязательное поле</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Телефон контактного лица <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  {...register('contact_phone', { required: true })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="+7XXXXXXXXXX"
                />
                {errors.contact_phone && (
                  <p className="mt-1 text-sm text-red-600">Обязательное поле</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Дополнительная информация
                </label>
                <textarea
                  {...register('additional_info')}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Любые важные детали, которые стоит знать команде"
                />
                <p className="text-xs text-gray-500 mt-1">Необязательное поле для уточнений или контекста.</p>
              </div>
            </div>
          </div>

          {/* Бракованные изделия */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Бракованные изделия</h2>
              <button
                type="button"
                onClick={addProduct}
                className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors flex items-center"
              >
                <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Добавить изделие
              </button>
            </div>
            <div className="space-y-4">
              {defectiveProducts.map((product, index) => (
                <div key={index} className="product-item border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-700">Изделие #{index + 1}</h3>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => copyProduct(index)}
                        className="text-blue-600 hover:text-blue-700 transition-colors"
                        title="Копировать изделие"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeProduct(index)}
                        className="text-red-600 hover:text-red-700 transition-colors"
                        title="Удалить изделие"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Наименование</label>
                      <input
                        type="text"
                        value={product.product_name}
                        onChange={(e) => updateProduct(index, 'product_name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Название изделия"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Размер</label>
                      <input
                        type="text"
                        value={product.size}
                        onChange={(e) => updateProduct(index, 'size', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Размеры"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Открывание</label>
                      <input
                        type="text"
                        value={product.opening_type}
                        onChange={(e) => updateProduct(index, 'opening_type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Тип открывания"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Описание проблемы</label>
                      <input
                        type="text"
                        value={product.problem_description}
                        onChange={(e) => updateProduct(index, 'problem_description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Описание дефекта"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Вложения и документы */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Вложения и документы</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Фото/Видео/Документы {user?.role === 'installer' && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleAttachmentsChange}
                  className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Загружаются без сжатия. Можно выбрать несколько файлов.
                  {user?.role === 'installer' && (
                    <span className="text-red-500 font-semibold"> Обязательно для монтажников!</span>
                  )}
                </p>
                <FileUploadList
                  files={attachments}
                  onRemove={removeAttachment}
                  type="attachments"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Ссылка на пакет документов
                </label>
                <input
                  type="url"
                  {...register('document_package_link')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                  Можно выбрать несколько файлов КП. При загрузке PDF файла данные будут автоматически извлечены и заполнены.
                </p>
                <FileUploadList
                  files={commercialOffers}
                  onRemove={removeCommercialOffer}
                  type="commercial_offers"
                />
              </div>
            </div>
          </div>

          {/* Кнопки */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/complaints')}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Создание...' : 'Создать рекламацию'}
            </Button>
          </div>
        </form>

        {/* Диалог выбора изделий из PDF */}
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
      </div>
    </div>
  )
}

// Компонент диалога выбора изделий
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

export default ComplaintCreate
