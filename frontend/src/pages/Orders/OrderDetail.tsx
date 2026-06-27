import { useEffect, useRef, useState, Fragment } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { ordersAPI } from '../../api/orders'
import { Order, MeasurementRequest, ORDER_STATUS_DISPLAY, ORDER_STATUS_COLOR, DOOR_TYPE_DISPLAY, OPENING_TYPE_SHORT, OPENING_TYPE_DISPLAY, ADDON_KIND_DISPLAY, AddonKind, OpeningType } from '../../types/orders'
import NextActionBlock, { NextActionBlockHandle } from './NextActionBlock'
import OrderStatusWorkflow from './OrderStatusWorkflow'
import MeasurementRequestForm from './MeasurementRequestForm'
import { measurementsAPI, buildRecommendationText } from '../../api/measurements'
import { Measurement } from '../../types/measurements'
import ScheduleMeasurementModal from '../Measurements/ScheduleMeasurementModal'
import OrderAttachmentsBlock from '../../components/orders/OrderAttachmentsBlock'
import MeasurementLinkSection from './MeasurementLinkSection'
import HScrollSync from '../../components/common/HScrollSync'
import LoadingOverlay from '../../components/common/LoadingOverlay'
import FileViewer from '../../components/common/FileViewer'

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [measurementRequest, setMeasurementRequest] = useState<MeasurementRequest | null>(null)
  const [showMrModal, setShowMrModal] = useState(false)
  const [measurement, setMeasurement] = useState<Measurement | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null)
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const nextActionRef = useRef<NextActionBlockHandle>(null)

  const canEdit = user?.role === 'manager' || user?.role === 'admin'
  const canManage = canEdit || user?.role === 'leader'
  const canUploadAttachments = canEdit || user?.role === 'service_manager' || user?.role === 'leader'
  const [notifyingClient, setNotifyingClient] = useState(false)
  const [callNotifySent, setCallNotifySent] = useState(false)

  const handleNotifyClientCallFailed = async () => {
    if (!measurement || notifyingClient) return
    setNotifyingClient(true)
    try {
      const res = await measurementsAPI.notifyClientCallFailed(measurement.id)
      setCallNotifySent(true)
      alert(`SMS отправлено${res.phone ? ` на ${res.phone}` : ''}`)
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Не удалось отправить уведомление')
    } finally {
      setNotifyingClient(false)
    }
  }

  const loadMeasurement = async (mr: MeasurementRequest | null) => {
    if (!mr) {
      setMeasurement(null)
      return
    }
    try {
      // Найдём замер этого заказа через список (фильтруем по order_id)
      const list = await measurementsAPI.list({})
      const found = list.find((x) => x.order_id === Number(id))
      if (found) {
        const full = await measurementsAPI.getById(found.id)
        setMeasurement(full)
      } else {
        setMeasurement(null)
      }
    } catch {
      setMeasurement(null)
    }
  }

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const [data, mr] = await Promise.all([
          ordersAPI.getById(Number(id)),
          ordersAPI.getMeasurementRequest(Number(id)).catch(() => null),
        ])
        setOrder(data)
        setMeasurementRequest(mr)
        await loadMeasurement(mr)
      } catch (err: any) {
        setError('Заказ не найден или нет доступа')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  const reloadOrder = async () => {
    try {
      const data = await ordersAPI.getById(Number(id))
      setOrder(data)
      await loadMeasurement(measurementRequest)
    } catch {}
  }

  const handleMarkProcessed = async () => {
    if (!measurement) return
    if (!window.confirm('Отметить замер как обработанный?')) return
    try {
      await measurementsAPI.markProcessed(measurement.id)
      await reloadOrder()
      // По ТЗ: после обработки замера сразу предлагаем указать следующее действие.
      nextActionRef.current?.promptNextAction()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Не удалось отметить как обработанный')
    }
  }

  const handleDownloadMeasurementPdf = async () => {
    if (!measurement || pdfGenerating) return
    setPdfGenerating(true)
    try {
      await measurementsAPI.openBlankPdf(measurement.id)
    } catch {
      alert('Не удалось сформировать PDF замера')
    } finally {
      setPdfGenerating(false)
    }
  }

  const handleCopyClientLink = async () => {
    if (!measurement?.client_access_token) return
    const url = measurementsAPI.getPublicPdfUrl(measurement.client_access_token)
    try {
      await navigator.clipboard.writeText(url)
      alert('Ссылка для клиента скопирована:\n' + url)
    } catch {
      window.prompt('Ссылка для клиента (скопируйте):', url)
    }
  }

  const handleAdjustDoor = async (itemId: number, recDoorH: number | null, recDoorW: number | null) => {
    if (!recDoorH && !recDoorW) {
      alert('Нет данных рекомендованной двери в замере')
      return
    }
    if (!window.confirm(
      `Установить размер двери ${recDoorH ?? '—'}×${recDoorW ?? '—'} (из замера)? Рек. проём пересчитается.`,
    )) return
    try {
      await ordersAPI.updateItem(itemId, {
        door_height: recDoorH,
        door_width: recDoorW,
        recommended_opening_height: recDoorH ? recDoorH + 70 : null,
        recommended_opening_width: recDoorW ? recDoorW + 100 : null,
      })
      await reloadOrder()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Не удалось изменить размер двери')
    }
  }

  const handleDelete = async () => {
    if (!order || !window.confirm(`Удалить заказ #${order.id}?`)) return
    setIsDeleting(true)
    try {
      await ordersAPI.delete(order.id)
      navigate('/orders')
    } catch {
      alert('Не удалось удалить заказ')
      setIsDeleting(false)
    }
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const formatDateTime = (d: string) => {
    return new Date(d).toLocaleString('ru-RU', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-6 rounded-xl">
          <h2 className="text-lg font-semibold mb-2">Ошибка</h2>
          <p>{error}</p>
          <Link to="/orders" className="mt-3 inline-block text-sm text-red-600 hover:underline">← К списку заказов</Link>
        </div>
      </div>
    )
  }

  const salon = order.salon as any

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      {/* Хлебные крошки */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/orders" className="hover:text-primary-600">Заказы</Link>
        <span>/</span>
        <span className="text-gray-900">Заказ #{order.id}</span>
      </div>

      {/* Предупреждение о невозможности подъёма */}
      {order.lift_impossible_warning && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 font-medium flex items-center gap-2">
          <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {order.lift_impossible_warning}
        </div>
      )}

      {/* Шапка */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{order.client_name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${ORDER_STATUS_COLOR[order.status]}`}>
              {ORDER_STATUS_DISPLAY[order.status]}
            </span>
            {order.kp_number && (
              <span className="text-sm text-gray-500">КП: {order.kp_number}</span>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {measurement?.is_done && (
              <button
                onClick={handleDownloadMeasurementPdf}
                disabled={pdfGenerating}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {pdfGenerating ? 'Формируем PDF…' : 'Скачать замер PDF'}
              </button>
            )}
            <button
              onClick={() => setShowMrModal(true)}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all"
            >
              <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {measurementRequest ? 'Заявка на замер' : 'Заявка на замер'}
            </button>
            <Link
              to={`/orders/${order.id}/edit`}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-all"
            >
              <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Редактировать
            </Link>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-all"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Воркфлоу статусов + подсказки + даты производства */}
      <div className="mb-6">
        <OrderStatusWorkflow order={order} canManage={canManage} onChanged={reloadOrder} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Основная информация */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Клиент</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Имя</dt>
              <dd className="font-medium text-gray-900">{order.client_name}</dd>
            </div>
            {order.contact_phone && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Телефон</dt>
                <dd className="font-medium">
                  <a href={`tel:${order.contact_phone}`} className="text-primary-600 hover:underline">
                    {order.contact_phone}
                  </a>
                </dd>
              </div>
            )}
            {order.address && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Адрес</dt>
                <dd className="font-medium text-gray-900 text-right max-w-[250px]">{order.address}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Салон и менеджер */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Салон и менеджер</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Салон</dt>
              <dd className="font-medium text-gray-900">{typeof salon === 'object' ? salon.name : '—'}</dd>
            </div>
            {typeof salon === 'object' && salon.address && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Адрес салона</dt>
                <dd className="text-gray-700">{salon.address}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Менеджер</dt>
              <dd className="font-medium text-gray-900">{order.manager.full_name}</dd>
            </div>
          </dl>
        </div>

        {/* КП и условия */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">КП и объект</h2>
          <dl className="space-y-2 text-sm">
            {order.kp_number && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Номер КП</dt>
                <dd className="font-medium text-gray-900">{order.kp_number}</dd>
              </div>
            )}
            {order.kp_date && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Дата КП</dt>
                <dd className="text-gray-900">{formatDate(order.kp_date)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Лифт</dt>
              <dd className="text-gray-900">
                {order.lift_available === true ? 'Есть' : order.lift_available === false ? 'Нет' : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Лестница</dt>
              <dd className="text-gray-900">
                {order.stairs_available === true ? 'Есть' : order.stairs_available === false ? 'Нет' : '—'}
              </dd>
            </div>
            {order.floor_readiness && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Готовность пола</dt>
                <dd className="text-gray-900">{order.floor_readiness}</dd>
              </div>
            )}
          </dl>
          {order.commercial_offer_url && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <a
                href={order.commercial_offer_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-sm text-primary-600 hover:underline"
              >
                <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Коммерческое предложение
              </a>
            </div>
          )}
        </div>

        {/* Служебная */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Служебная</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Создан</dt>
              <dd className="text-gray-900">{formatDateTime(order.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Обновлён</dt>
              <dd className="text-gray-900">{formatDateTime(order.updated_at)}</dd>
            </div>
            {order.last_activity_at && (
              <>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Последняя активность</dt>
                  <dd className="text-gray-900">{formatDateTime(order.last_activity_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Вид активности</dt>
                  <dd className="text-gray-700">{order.last_activity_kind_display}</dd>
                </div>
              </>
            )}
          </dl>
          {order.comment && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Комментарий</p>
              <p className="text-sm text-gray-700">{order.comment}</p>
            </div>
          )}
        </div>
      </div>

      {/* Документы и фото/видео по заказу (лист «Заказ» в ТЗ) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
          Документы и фото / видео
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Вложения по всему заказу. По проёмам — в таблице позиций ниже.
        </p>
        <OrderAttachmentsBlock
          orderId={order.id}
          attachments={order.attachments || []}
          canEdit={canUploadAttachments}
          onUpdate={reloadOrder}
        />

        {/* Документы и фото из замера (загружены СМ) */}
        {measurement && measurement.attachments && measurement.attachments.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h3 className="text-xs font-semibold text-cyan-700 uppercase tracking-wider mb-2">
              Документы из замера ({measurement.attachments.length})
            </h3>
            <ul className="flex flex-wrap gap-2">
              {measurement.attachments.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => a.file_url && setViewerFile({ url: a.file_url, name: a.name || 'Файл из замера' })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    {a.name || 'файл'}
                    {a.opening != null && <span className="text-cyan-500">(проём)</span>}
                  </button>
                </li>
              ))}
            </ul>
            {measurement.opening_plan_url && (
              <button
                type="button"
                onClick={() => setViewerFile({ url: measurement.opening_plan_url!, name: 'План открывания' })}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100"
              >
                План открывания
              </button>
            )}
          </div>
        )}
      </div>

      {/* Заявка на замер (если создана) + Следующее действие */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {measurementRequest && (
          <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-4 ring-1 ring-blue-100">
            <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3">Заявка на замер</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Контактное лицо</dt>
                <dd className="font-medium text-gray-900">{measurementRequest.contact_name}</dd>
              </div>
              {measurementRequest.contact_position && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Должность</dt>
                  <dd className="text-gray-700">{measurementRequest.contact_position}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Телефон</dt>
                <dd>
                  <a href={`tel:${measurementRequest.contact_phone}`} className="text-primary-600 hover:underline">
                    {measurementRequest.contact_phone}
                  </a>
                </dd>
              </div>
              {measurementRequest.desired_date && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Желаемая дата</dt>
                  <dd className="text-gray-900">{formatDate(measurementRequest.desired_date)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Кто оплачивает</dt>
                <dd className="text-gray-900">{measurementRequest.payer_display}</dd>
              </div>
              {measurementRequest.opening_plan_url && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">План открывания</dt>
                  <dd>
                    <a href={measurementRequest.opening_plan_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                      Открыть
                    </a>
                  </dd>
                </div>
              )}
              {measurementRequest.comment && (
                <div className="pt-2 border-t border-blue-100 mt-2">
                  <p className="text-xs text-gray-500 mb-1">Комментарий</p>
                  <p className="text-sm text-gray-700">{measurementRequest.comment}</p>
                </div>
              )}
            </dl>
          </div>
        )}
        <NextActionBlock ref={nextActionRef} orderId={order.id} canEdit={canEdit} onStatusChanged={() => reloadOrder()} />
      </div>

      {/* Замер */}
      {measurementRequest && (
        <div className="bg-white rounded-xl shadow-sm border border-cyan-200 ring-1 ring-cyan-100 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-cyan-700 uppercase tracking-wider">Замер</h2>
            <div className="flex items-center gap-2">
              {measurement ? (
                <Link
                  to={`/measurements/${measurement.id}`}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg"
                >
                  Открыть замер →
                </Link>
              ) : (
                ['service_manager', 'admin', 'leader'].includes(user?.role || '') && (
                  <button
                    onClick={() => setShowScheduleModal(true)}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    Назначить дату замера
                  </button>
                )
              )}
              {measurement && !measurement.is_done && ['service_manager', 'manager', 'admin', 'leader'].includes(user?.role || '') && (
                <button
                  onClick={handleNotifyClientCallFailed}
                  disabled={notifyingClient}
                  className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg disabled:opacity-60"
                  title="SMS клиенту: «Мы не дозвонились по замеру»"
                >
                  {notifyingClient ? 'Отправляем…' : callNotifySent ? '↻ Повторно отправить' : '📵 Не дозвонились — уведомить'}
                </button>
              )}
              {measurement && measurement.is_done && !measurement.is_processed && canEdit && (
                <button
                  onClick={handleMarkProcessed}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                >
                  ✓ Замер обработан
                </button>
              )}
              {measurement && measurement.is_done && (
                <>
                  <button
                    onClick={handleDownloadMeasurementPdf}
                    disabled={pdfGenerating}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {pdfGenerating ? '⏳ Формируем PDF…' : '📄 Скачать замер PDF'}
                  </button>
                  <button
                    onClick={handleCopyClientLink}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    🔗 Ссылка для клиента
                  </button>
                </>
              )}
            </div>
          </div>
          {measurement ? (
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Дата замера</dt>
                <dd className="font-medium text-gray-900">
                  {measurement.measurement_date
                    ? new Date(measurement.measurement_date).toLocaleString('ru-RU')
                    : 'не назначена'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Сервис-менеджер</dt>
                <dd className="text-gray-900">{measurement.service_manager_name || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Проёмы</dt>
                <dd className="text-gray-900">{measurement.openings.length} шт</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Статус</dt>
                <dd>
                  {measurement.is_processed
                    ? <span className="text-emerald-700 font-medium">✓ обработан</span>
                    : measurement.is_done
                      ? <span className="text-green-700 font-medium">✓ выполнен</span>
                      : measurement.measurement_date
                        ? <span className="text-cyan-700">запланирован</span>
                        : <span className="text-amber-700">ожидает назначения</span>}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-500">Замер ещё не создан. Когда СМ назначит дату, замер появится здесь.</p>
          )}
        </div>
      )}

      {/* Связка позиций КП с проёмами замера — только менеджер/admin (СМ не имеет прав) */}
      {measurement && measurement.is_done && canEdit && (
        <MeasurementLinkSection
          order={order}
          measurement={measurement}
          onApplied={reloadOrder}
          onLinksSaved={() => loadMeasurement(measurementRequest)}
        />
      )}

      {/* Позиции */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Позиции ({order.items?.length || 0})
          </h2>
          {canEdit && (
            <Link
              to={`/orders/${order.id}/edit`}
              className="text-sm text-primary-600 hover:underline"
            >
              Редактировать позиции
            </Link>
          )}
        </div>

        {!order.items || order.items.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">Позиции не добавлены</p>
        ) : (
          <HScrollSync className="max-h-[70vh]">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky top-0 z-30 bg-white border-b border-gray-200" style={{ left: 0, width: 48, minWidth: 48, maxWidth: 48 }}>№</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky top-0 z-30 bg-white border-b border-gray-200" style={{ left: 48, width: 120, minWidth: 120, maxWidth: 120 }}>Помещение</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky top-0 z-30 bg-white border-r border-b border-gray-200" style={{ left: 168, width: 180, minWidth: 180, maxWidth: 180 }}>Модель</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Кол.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Цена</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Сумма</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Тип двери</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Откр.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Выс. полотна</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Шир. полотна</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Рек. выс. проёма</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Рек. шир. проёма</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-cyan-600 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Факт. выс.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-cyan-600 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Факт. шир.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-cyan-600 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Факт. глуб.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-cyan-600 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Рек. дверь</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-cyan-600 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Рек. проём</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-cyan-600 uppercase sticky top-0 z-20 bg-white border-b border-gray-200">Откр. (замер)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-orange-600 uppercase min-w-[260px] sticky top-0 z-20 bg-white border-b border-gray-200">Рекомендация по проёму</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.items.map((item) => (
                  <Fragment key={item.id}>
                  <tr className="group hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium align-top sticky z-10 bg-white group-hover:bg-gray-50" style={{ left: 0, width: 48, minWidth: 48, maxWidth: 48 }}>{item.opening_number}</td>
                    <td className="px-3 py-2 text-gray-600 align-top break-words sticky z-10 bg-white group-hover:bg-gray-50" style={{ left: 48, width: 120, minWidth: 120, maxWidth: 120 }}>{item.room_name || '—'}</td>
                    <td className="px-3 py-2 text-gray-900 align-top whitespace-pre-wrap break-words sticky z-10 bg-white group-hover:bg-gray-50 border-r border-gray-200" style={{ left: 168, width: 180, minWidth: 180, maxWidth: 180 }}>{item.model_name || '—'}</td>
                    <td className="px-3 py-2 text-right align-top">{item.quantity}</td>
                    <td className="px-3 py-2 text-right align-top">{item.price != null ? Number(item.price).toLocaleString('ru-RU') : '—'}</td>
                    <td className="px-3 py-2 text-right font-medium align-top">{item.amount != null ? Number(item.amount).toLocaleString('ru-RU') : '—'}</td>
                    <td className="px-3 py-2 text-gray-600 align-top">{item.door_type ? DOOR_TYPE_DISPLAY[item.door_type] : '—'}</td>
                    <td className="px-3 py-2 text-gray-600 align-top" title={item.opening_type ? OPENING_TYPE_DISPLAY[item.opening_type] : ''}>
                      {item.opening_type ? OPENING_TYPE_SHORT[item.opening_type] : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 align-top">{item.door_height ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600 align-top">{item.door_width ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600 align-top">{item.recommended_opening_height ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600 align-top">{item.recommended_opening_width ?? '—'}</td>
                    {/* Колонки 13–18 из Замера */}
                    <td className="px-3 py-2 text-right text-cyan-800 align-top">{item.measurement_data?.actual_height ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-cyan-800 align-top">{item.measurement_data?.actual_width ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-cyan-800 align-top">{item.measurement_data?.actual_depth ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-cyan-800 align-top text-xs">
                      {item.measurement_data?.recommended_door_height != null && item.measurement_data?.recommended_door_width != null
                        ? `${item.measurement_data.recommended_door_height}×${item.measurement_data.recommended_door_width}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-cyan-800 align-top text-xs">
                      {item.measurement_data?.recommended_opening_height != null && item.measurement_data?.recommended_opening_width != null
                        ? `${item.measurement_data.recommended_opening_height}×${item.measurement_data.recommended_opening_width}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-cyan-800 align-top text-xs">
                      {item.measurement_data?.opening_type ? OPENING_TYPE_SHORT[item.measurement_data.opening_type as OpeningType] ?? item.measurement_data.opening_type : '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {(() => {
                        const md = item.measurement_data
                        if (!md) return <span className="text-gray-400">—</span>
                        // Рекомендация считается от ФАКТ. проёма (из замера) и текущего
                        // размера двери В ЗАКАЗЕ. Так при правке размеров менеджером она
                        // сразу обновляется — его размер приоритетнее КП/замера.
                        const text = buildRecommendationText(
                          md.actual_height, md.actual_width, item.door_height, item.door_width,
                        )
                        const canAdjust = canEdit && md.recommended_door_height && md.recommended_door_width
                          && (md.recommended_door_height !== item.door_height || md.recommended_door_width !== item.door_width)
                        return (
                          <div className="space-y-1.5">
                            {text ? (
                              <div className="text-orange-700">💡 {text}</div>
                            ) : (
                              <div className="text-gray-400">Проём в норме</div>
                            )}
                            {text && canEdit && (
                              <div className="flex flex-wrap gap-1.5">
                                <span className="inline-block px-2 py-0.5 text-[11px] rounded bg-amber-100 text-amber-800">
                                  Доработать проём
                                </span>
                                {canAdjust && (
                                  <button
                                    onClick={() => handleAdjustDoor(item.id, md.recommended_door_height, md.recommended_door_width)}
                                    className="px-2 py-0.5 text-[11px] rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                  >
                                    Изменить размер двери → {md.recommended_door_height}×{md.recommended_door_width}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                  {(item.notes || item.measurement_data?.notes) && (
                    <tr className="bg-amber-50/40">
                      <td colSpan={2} className="px-3 py-1 text-xs text-right text-amber-700">Примечания:</td>
                      <td colSpan={17} className="px-3 py-1 text-xs text-amber-900 whitespace-pre-wrap space-y-0.5">
                        {item.notes && <div>{item.notes}</div>}
                        {item.measurement_data?.notes && <div className="text-cyan-800">Замер: {item.measurement_data.notes}</div>}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-gray-50/80">
                    <td colSpan={19} className="px-3 py-2">
                      <OrderAttachmentsBlock
                        orderId={order.id}
                        attachments={item.attachments || []}
                        canEdit={canUploadAttachments}
                        orderItemId={item.id}
                        title={`Проём #${item.opening_number}${item.room_name ? ` — ${item.room_name}` : ''}: документы, фото/видео`}
                        onUpdate={reloadOrder}
                      />
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </HScrollSync>
        )}
      </div>

      {/* Сопутствующие позиции */}
      {order.addons && order.addons.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Сопутствующие позиции ({order.addons.length})
            </h2>
            {canEdit && (
              <Link to={`/orders/${order.id}/edit`} className="text-sm text-primary-600 hover:underline">
                Редактировать
              </Link>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Тип</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Наименование</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Кол.</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Размер</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Откр.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Цена</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.addons.map((addon) => (
                  <tr key={addon.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">
                        {ADDON_KIND_DISPLAY[addon.kind as AddonKind] || addon.kind_display || addon.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-900 align-top whitespace-pre-wrap break-words max-w-[400px]">{addon.name || '—'}</td>
                    <td className="px-3 py-2 text-right align-top">{addon.quantity}</td>
                    <td className="px-3 py-2 text-gray-600 align-top">{addon.size || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 align-top">{addon.opening_type ? OPENING_TYPE_SHORT[addon.opening_type] : '—'}</td>
                    <td className="px-3 py-2 text-right align-top">{addon.price != null ? Number(addon.price).toLocaleString('ru-RU') : '—'}</td>
                    <td className="px-3 py-2 text-right font-medium align-top">{addon.amount != null ? Number(addon.amount).toLocaleString('ru-RU') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showMrModal && (
        <MeasurementRequestForm
          orderId={order.id}
          defaultClientName={order.client_name}
          defaultPhone={order.contact_phone}
          existing={measurementRequest}
          onClose={() => setShowMrModal(false)}
          onSaved={(mr) => {
            setMeasurementRequest(mr)
            reloadOrder()
          }}
        />
      )}

      {showScheduleModal && measurementRequest && (
        <ScheduleMeasurementModal
          requestId={measurementRequest.id}
          contactName={measurementRequest.contact_name}
          onClose={() => setShowScheduleModal(false)}
          onScheduled={(mid) => {
            setShowScheduleModal(false)
            reloadOrder()
            navigate(`/measurements/${mid}`)
          }}
        />
      )}

      {viewerFile && (
        <FileViewer
          fileUrl={viewerFile.url}
          fileName={viewerFile.name}
          onClose={() => setViewerFile(null)}
        />
      )}
      {pdfGenerating && (
        <LoadingOverlay message="Формируем PDF замера…" hint="Это может занять несколько секунд, не закрывайте страницу." />
      )}
    </div>
  )
}

export default OrderDetail
