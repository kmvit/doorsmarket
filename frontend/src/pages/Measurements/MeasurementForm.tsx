import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  measurementsAPI,
  measurementOpeningsAPI,
  measurementAttachmentsAPI,
  buildRecommendationText,
  isInverso,
  validateLiftRequired,
} from '../../api/measurements'
import { Measurement, MeasurementOpening } from '../../types/measurements'
import { DOOR_TYPE_DISPLAY, OPENING_TYPE_DISPLAY } from '../../types/orders'
import { isQueuedError, requestQueue } from '../../services/sync'
import ScheduleMeasurementModal from './ScheduleMeasurementModal'
import OrderAttachmentsBlock from '../../components/orders/OrderAttachmentsBlock'
import FileViewer from '../../components/common/FileViewer'
import AutoResizeTextarea from '../../components/common/AutoResizeTextarea'
import LoadingOverlay from '../../components/common/LoadingOverlay'

const fieldCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const MeasurementForm = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [m, setM] = useState<Measurement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingOpeningId, setSavingOpeningId] = useState<number | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // Уведомление о работе офлайн (действие поставлено в очередь синхронизации)
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null)
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null)
  const [savingConditions, setSavingConditions] = useState(false)
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [draftNotice, setDraftNotice] = useState<string | null>(null)

  const canEditOpenings = !m?.is_done && (
    user?.role === 'service_manager' || user?.role === 'admin' || user?.role === 'leader'
  )
  const canMarkDone = canEditOpenings
  const canMarkProcessed = m?.is_done && !m?.is_processed && (user?.role === 'manager' || user?.role === 'admin')

  const load = async () => {
    setIsLoading(true)
    try {
      const data = await measurementsAPI.getById(Number(id))
      setM(data)
    } catch {
      setError('Замер не найден или нет доступа')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const updateOpeningLocal = (openingId: number, field: keyof MeasurementOpening, value: any) => {
    if (!m) return
    setM({
      ...m,
      openings: m.openings.map((o) => {
        if (o.id !== openingId) return o
        const next = { ...o, [field]: value }
        // СМ редактирует рек. дверь → ручной режим (пустые значения возвращают авторасчёт)
        if (field === 'recommended_door_height' || field === 'recommended_door_width') {
          next.recommended_door_is_manual = Boolean(next.recommended_door_height || next.recommended_door_width)
        }
        // Рек. дверь = факт. проём − 70/100, если СМ не задал её вручную
        if (!next.recommended_door_is_manual) {
          const h = next.actual_height ? Number(next.actual_height) : null
          const w = next.actual_width ? Number(next.actual_width) : null
          next.recommended_door_height = h ? h - 70 : null
          next.recommended_door_width = w ? w - 100 : null
        }
        // Рек. проём = рек. дверь + 70/100
        next.recommended_opening_height = next.recommended_door_height ? Number(next.recommended_door_height) + 70 : null
        next.recommended_opening_width = next.recommended_door_width ? Number(next.recommended_door_width) + 100 : null
        return next
      }),
    })
  }

  const saveOpening = async (op: MeasurementOpening) => {
    setSavingOpeningId(op.id)
    try {
      const payload: Partial<MeasurementOpening> = {
        opening_number: op.opening_number,
        room_name: op.room_name,
        door_type: op.door_type,
        actual_height: op.actual_height,
        actual_width: op.actual_width,
        actual_depth: op.actual_depth,
        opening_type: op.opening_type,
        addon_width: op.addon_width,
        face_trim_qty: op.face_trim_qty,
        face_trim_comment: op.face_trim_comment,
        back_trim_qty: op.back_trim_qty,
        back_trim_comment: op.back_trim_comment,
        extra_hardware: op.extra_hardware,
        threshold: op.threshold,
        notes: op.notes,
      }
      // Рек. размер двери передаём только в ручном режиме — иначе сервер считает его сам.
      // Пустые значения в ручном режиме возвращают проём к авторасчёту.
      if (op.recommended_door_is_manual) {
        payload.recommended_door_height = op.recommended_door_height
        payload.recommended_door_width = op.recommended_door_width
      }
      const updated = await measurementOpeningsAPI.update(op.id, payload)
      // Обновляем только этот проём из ответа сервера — без спиннера и скролла
      setM((prev) => prev ? { ...prev, openings: prev.openings.map((o) => o.id === op.id ? updated : o) } : prev)
    } catch {
      alert('Не удалось сохранить проём')
    } finally {
      setSavingOpeningId(null)
    }
  }

  // Сохранение рек. размера двери: поля передаются всегда (в т.ч. пустые) —
  // непустые включают ручной режим, пустые возвращают авторасчёт от факт. проёма.
  const saveRecommendedDoor = async (op: MeasurementOpening, patch?: { h?: number | null; w?: number | null }) => {
    setSavingOpeningId(op.id)
    try {
      const updated = await measurementOpeningsAPI.update(op.id, {
        recommended_door_height: patch ? (patch.h ?? null) : op.recommended_door_height,
        recommended_door_width: patch ? (patch.w ?? null) : op.recommended_door_width,
      })
      setM((prev) => prev ? { ...prev, openings: prev.openings.map((o) => o.id === op.id ? updated : o) } : prev)
    } catch {
      alert('Не удалось сохранить рекомендуемый размер двери')
    } finally {
      setSavingOpeningId(null)
    }
  }

  const addOpening = async () => {
    if (!m) return
    const maxNum = m.openings.reduce((acc, o) => Math.max(acc, o.opening_number || 0), 0)
    try {
      const created = await measurementOpeningsAPI.create({
        measurement: m.id,
        opening_number: maxNum + 1,
      })
      setM((prev) => prev ? { ...prev, openings: [...prev.openings, created] } : prev)
    } catch {
      alert('Не удалось добавить проём')
    }
  }

  const copyOpening = async (op: MeasurementOpening) => {
    if (!m) return
    const maxNum = m.openings.reduce((acc, o) => Math.max(acc, o.opening_number || 0), 0)
    try {
      const created = await measurementOpeningsAPI.create({
        measurement: m.id,
        opening_number: maxNum + 1,
        room_name: op.room_name,
        door_type: op.door_type,
        actual_height: op.actual_height,
        actual_width: op.actual_width,
        actual_depth: op.actual_depth,
        // Ручной рек. размер двери переносим в копию (сервер включит ручной режим)
        ...(op.recommended_door_is_manual
          ? {
              recommended_door_height: op.recommended_door_height,
              recommended_door_width: op.recommended_door_width,
            }
          : {}),
        opening_type: op.opening_type,
        addon_width: op.addon_width,
        face_trim_qty: op.face_trim_qty,
        face_trim_comment: op.face_trim_comment,
        back_trim_qty: op.back_trim_qty,
        back_trim_comment: op.back_trim_comment,
        extra_hardware: op.extra_hardware,
        threshold: op.threshold,
        notes: op.notes,
      })
      setM((prev) => prev ? { ...prev, openings: [...prev.openings, created] } : prev)
    } catch {
      alert('Не удалось скопировать проём')
    }
  }

  const deleteOpening = async (op: MeasurementOpening) => {
    if (!m) return
    if (!confirm(`Удалить проём #${op.opening_number}?`)) return
    try {
      await measurementOpeningsAPI.delete(op.id)
      setM((prev) => prev ? { ...prev, openings: prev.openings.filter((o) => o.id !== op.id) } : prev)
    } catch {
      alert('Не удалось удалить проём')
    }
  }

  const handleUploadFile = async (openingId: number | null, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!m) return
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await measurementAttachmentsAPI.upload(m.id, file, openingId)
      // Тихая перезагрузка без спиннера — нужна чтобы обновить список вложений
      const data = await measurementsAPI.getById(m.id)
      setM(data)
    } catch (err: any) {
      if (isQueuedError(err)) {
        setOfflineNotice('Нет сети: файл сохранён и будет загружен при появлении интернета.')
      } else {
      alert('Не удалось загрузить файл')
      }
    } finally {
      e.target.value = ''
    }
  }

  const handleSaveDraft = async () => {
    if (!m) return
    setActionError(null)
    setDraftNotice(null)
    try {
      const updated = await measurementsAPI.saveDraft(m.id)
      setM(updated)
      setDraftNotice('Замер сохранён в черновиках. Вы можете вернуться к нему позже, проверить данные и нажать «Замер выполнен».')
    } catch (err: any) {
      if (isQueuedError(err)) {
        setOfflineNotice('Нет сети: замер сохранён в черновиках и будет синхронизирован при появлении интернета.')
        return
      }
      setActionError(err.response?.data?.detail || 'Не удалось сохранить черновик')
    }
  }

  // Те же условия закрытия замера, что проверяет сервер. Нужны на клиенте, потому что
  // офлайн запрос уходит в очередь: без проверки СМ уверен, что замер выполнен, а при
  // синхронизации сервер его отклоняет и замер навсегда остаётся в черновиках.
  const validateCanMarkDone = async (): Promise<string | null> => {
    if (!m) return null
    // Файл, загруженный офлайн, ещё не виден в m.attachments — учитываем очередь синхронизации
    const pendingUpload = (await requestQueue.getAll()).some((r) => {
      if (!r.url.includes('/measurement-attachments/')) return false
      const entries = r.data?.entries as [string, unknown][] | undefined
      return entries?.some(([key, value]) => key === 'measurement' && String(value) === String(m.id)) ?? false
    })
    if (!m.opening_plan_url && m.attachments.length === 0 && !pendingUpload) {
      return 'Перед закрытием замера приложите план открывания.'
    }
    const missing: string[] = []
    if (m.lift_available === null || m.lift_available === undefined) missing.push('возможен ли подъём на лифте')
    if (m.stairs_available === null || m.stairs_available === undefined) missing.push('возможен ли подъём по лестнице')
    if (m.carry_to_entrance === null || m.carry_to_entrance === undefined) missing.push('нужен ли пронос до подъезда')
    if (!(m.floor_number || '').trim()) missing.push('этаж')
    if (missing.length) {
      return `Перед закрытием замера заполните условия объекта: ${missing.join(', ')}.`
    }
    return null
  }

  const handleMarkDone = async () => {
    if (!m) return
    setActionError(null)
    setDraftNotice(null)
    const validationError = await validateCanMarkDone()
    if (validationError) {
      setActionError(validationError)
      return
    }
    try {
      const updated = await measurementsAPI.markDone(m.id)
      setM(updated)
    } catch (err: any) {
      if (isQueuedError(err)) {
        setOfflineNotice('Нет сети: отметка «Замер выполнен» сохранена и будет отправлена при появлении интернета.')
        return
      }
      setActionError(err.response?.data?.detail || 'Не удалось закрыть замер')
    }
  }

  const handleDownloadPdf = async () => {
    if (!m || pdfGenerating) return
    // Офлайн: серверный PDF недоступен — открываем печатную версию бланка,
    // она рендерится из локальных данных и печатается через системный диалог.
    if (!navigator.onLine) {
      navigate(`/measurements/${m.id}/print`)
      return
    }
    setActionError(null)
    setPdfGenerating(true)
    try {
      await measurementsAPI.openBlankPdf(m.id)
    } catch {
      setActionError('Не удалось сформировать PDF-бланк замера')
    } finally {
      setPdfGenerating(false)
    }
  }

  const handleUploadSignature = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!m || !e.target.files?.[0]) return
    setActionError(null)
    try {
      const updated = await measurementsAPI.uploadSignature(m.id, e.target.files[0])
      setM(updated)
    } catch (err: any) {
      if (isQueuedError(err)) {
        setOfflineNotice('Нет сети: фото подписи сохранено и будет загружено при появлении интернета.')
        return
      }
      setActionError(err.response?.data?.detail || 'Не удалось загрузить фото подписи')
    } finally {
      e.target.value = ''
    }
  }

  const saveConditions = async (patch: {
    lift_available?: boolean | null
    stairs_available?: boolean | null
    carry_to_entrance?: boolean | null
    floor_number?: string
    floor_readiness?: string
  }) => {
    if (!m) return
    // Оптимистично обновляем локально
    setM({ ...m, ...patch } as Measurement)
    setSavingConditions(true)
    try {
      const updated = await measurementsAPI.setSiteConditions(m.id, patch)
      setM(updated)
    } catch (err: any) {
      if (isQueuedError(err)) {
        setOfflineNotice('Нет сети: условия объекта сохранены и будут отправлены при появлении интернета.')
        return
      }
      setActionError(err.response?.data?.detail || 'Не удалось сохранить условия объекта')
    } finally {
      setSavingConditions(false)
    }
  }

  const handleMarkProcessed = async () => {
    if (!m) return
    setActionError(null)
    try {
      const updated = await measurementsAPI.markProcessed(m.id)
      setM(updated)
    } catch (err: any) {
      if (isQueuedError(err)) {
        setOfflineNotice('Нет сети: отметка «Замер обработан» сохранена и будет отправлена при появлении интернета.')
        return
      }
      setActionError(err.response?.data?.detail || 'Не удалось отметить как обработанный')
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error || !m) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-6 rounded-xl">
          <h2 className="text-lg font-semibold mb-2">Ошибка</h2>
          <p>{error}</p>
          <Link to="/measurements" className="mt-3 inline-block text-sm text-red-600 hover:underline">← К списку замеров</Link>
        </div>
      </div>
    )
  }

  const liftRequired = validateLiftRequired(m.openings)

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      {/* Хлебные крошки */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/measurements" className="hover:text-primary-600">Замеры</Link>
        <span>/</span>
        <Link to={`/orders/${m.order_id}`} className="hover:text-primary-600">Заказ #{m.order_id}</Link>
        <span>/</span>
        <span className="text-gray-900">Замер #{m.id}</span>
      </div>

      {/* Шапка */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Замер: {m.client_name}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm">
            {m.measurement_date ? (
              <span className="px-3 py-1 rounded-full bg-cyan-100 text-cyan-800 font-medium">
                Назначен на {new Date(m.measurement_date).toLocaleString('ru-RU')}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
                Дата не назначена
              </span>
            )}
            {m.is_draft && !m.is_done && (
              <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 font-medium">📝 Черновик</span>
            )}
            {m.is_done && (
              <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 font-medium">✓ Выполнен</span>
            )}
            {m.is_processed && (
              <span className="px-3 py-1 rounded-full bg-emerald-200 text-emerald-900 font-medium">✓ Обработан</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!m.is_done && canEditOpenings && (
            <button
              onClick={() => setShowSchedule(true)}
              className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl"
            >
              {m.measurement_date ? 'Перенести' : 'Назначить дату'}
            </button>
          )}
          {canMarkDone && (
            <button
              onClick={handleSaveDraft}
              className="px-4 py-1.5 text-sm font-medium text-yellow-800 bg-yellow-100 hover:bg-yellow-200 rounded-xl"
            >
              📝 Сохранить в черновик
            </button>
          )}
          {canMarkDone && (
            <button
              onClick={handleMarkDone}
              className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl"
            >
              ✓ Замер выполнен
            </button>
          )}
          {canMarkProcessed && (
            <button
              onClick={handleMarkProcessed}
              className="px-4 py-1.5 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl"
            >
              ✓ Замер обработан
            </button>
          )}
          <button
            onClick={handleDownloadPdf}
            disabled={pdfGenerating}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pdfGenerating ? '⏳ Формируем PDF…' : '📄 Бланк PDF'}
          </button>
          <button
            onClick={() => navigate(`/measurements/${m.id}/print`)}
            title="Печатная версия бланка — работает без интернета"
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl"
          >
            🖨 Печать бланка
          </button>
          {(user?.role === 'service_manager' || user?.role === 'admin') && (
            <label className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl cursor-pointer">
              {m.signature_photo_url ? '↻ Заменить фото подписи' : '✍ Загрузить фото подписи'}
              <input type="file" accept="image/*" onChange={handleUploadSignature} className="hidden" />
            </label>
          )}
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{actionError}</div>
      )}
      {draftNotice && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl mb-4 flex items-center justify-between gap-3">
          <span>📝 {draftNotice}</span>
          <button onClick={() => setDraftNotice(null)} className="text-green-700 hover:text-green-900 text-sm font-medium shrink-0">✕</button>
        </div>
      )}
      {offlineNotice && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl mb-4 flex items-center justify-between gap-3">
          <span>📡 {offlineNotice}</span>
          <button onClick={() => setOfflineNotice(null)} className="text-amber-700 hover:text-amber-900 text-sm font-medium shrink-0">✕</button>
        </div>
      )}
      {m.lift_impossible_warning && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 font-medium">
          ⚠️ {m.lift_impossible_warning}
        </div>
      )}
      {liftRequired && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl mb-4">
          ⚠️ Высота хотя бы одного проёма больше 2300 — поле «лифт» в заказе обязательно к заполнению.
        </div>
      )}

      {/* Шапка-инфо */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Контактное лицо</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">ФИО</dt><dd className="font-medium">{m.contact_name}</dd>
            </div>
            {m.contact_position && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Должность</dt><dd>{m.contact_position}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Телефон</dt>
              <dd><a href={`tel:${m.contact_phone}`} className="text-primary-600 hover:underline">{m.contact_phone}</a></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Адрес</dt><dd className="text-right max-w-[280px]">{m.address || '—'}</dd>
            </div>
          </dl>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Документы</h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-500 block mb-1">Документы, фото/видео из заказа (весь заказ):</span>
              <OrderAttachmentsBlock
                orderId={m.order_id}
                attachments={(m.order_attachments || []).filter((a) => !a.order_item)}
                readOnly
              />
            </div>
            <div>
              <span className="text-gray-500">План открывания: </span>
              {m.opening_plan_url ? (
                <button
                  type="button"
                  onClick={() => setViewerFile({ url: m.opening_plan_url!, name: 'План открывания' })}
                  className="text-primary-600 hover:underline"
                >
                  Открыть
                </button>
              ) : (
                <span className="text-amber-700">Не приложен — нужно вложить до закрытия замера</span>
              )}
            </div>
            <div>
              <span className="text-gray-500">Общие вложения замера ({m.attachments.length}):</span>
              <ul className="mt-1 space-y-0.5">
                {m.attachments.filter((a) => !a.opening).map((a) => (
                  <li key={a.id} className="text-xs">
                    <button
                      type="button"
                      onClick={() => a.file_url && setViewerFile({ url: a.file_url, name: a.name || 'Файл' })}
                      className="text-primary-600 hover:underline text-left"
                    >
                      {a.name || 'файл'}
                    </button>
                  </li>
                ))}
              </ul>
              {canEditOpenings && (
                <label className="inline-block mt-2">
                  <span className="text-xs text-primary-600 cursor-pointer hover:underline">+ Загрузить файл</span>
                  <input
                    type="file"
                    onChange={(e) => handleUploadFile(null, e)}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            {m.signature_photo_url && (
              <div>
                <span className="text-gray-500">Подпись клиента: </span>
                <button
                  type="button"
                  onClick={() => setViewerFile({ url: m.signature_photo_url!, name: 'Подпись клиента' })}
                  className="text-primary-600 hover:underline"
                >
                  Открыть
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Условия объекта — заполняет СМ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Условия объекта</h2>
          {savingConditions && <span className="text-xs text-gray-400">сохранение...</span>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>
              Возможен подъём на лифте? <span className="text-red-600">*</span>
              {liftRequired && <span className="text-red-600"> (высота &gt; 2300)</span>}
            </label>
            <select
              value={m.lift_available === null || m.lift_available === undefined ? '' : String(m.lift_available)}
              onChange={(e) => saveConditions({ lift_available: e.target.value === '' ? null : e.target.value === 'true' })}
              disabled={!canEditOpenings}
              className={fieldCls}
            >
              <option value="">— не указано —</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Возможен подъём по лестнице? <span className="text-red-600">*</span></label>
            <select
              value={m.stairs_available === null || m.stairs_available === undefined ? '' : String(m.stairs_available)}
              onChange={(e) => saveConditions({ stairs_available: e.target.value === '' ? null : e.target.value === 'true' })}
              disabled={!canEditOpenings}
              className={fieldCls}
            >
              <option value="">— не указано —</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Нужен пронос до подъезда? <span className="text-red-600">*</span></label>
            <select
              value={m.carry_to_entrance === null || m.carry_to_entrance === undefined ? '' : String(m.carry_to_entrance)}
              onChange={(e) => saveConditions({ carry_to_entrance: e.target.value === '' ? null : e.target.value === 'true' })}
              disabled={!canEditOpenings}
              className={fieldCls}
            >
              <option value="">— не указано —</option>
              <option value="true">Нужен</option>
              <option value="false">Не нужен</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Этаж <span className="text-red-600">*</span></label>
            <input
              type="text"
              defaultValue={m.floor_number || ''}
              onBlur={(e) => { if (e.target.value !== (m.floor_number || '')) saveConditions({ floor_number: e.target.value }) }}
              disabled={!canEditOpenings}
              className={fieldCls}
              placeholder="Например: 5"
              maxLength={20}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Готовность пола</label>
            <input
              type="text"
              defaultValue={m.floor_readiness || ''}
              onBlur={(e) => { if (e.target.value !== (m.floor_readiness || '')) saveConditions({ floor_readiness: e.target.value }) }}
              disabled={!canEditOpenings}
              className={fieldCls}
              placeholder="Например: готов / черновой / стяжка"
            />
          </div>
        </div>
        {m.lift_impossible_warning && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm font-medium">
            ⚠️ {m.lift_impossible_warning}
          </div>
        )}
      </div>

      {/* Проёмы */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Проёмы ({m.openings.length})</h2>
          {canEditOpenings && (
            <button
              onClick={addOpening}
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl"
            >
              + Добавить проём
            </button>
          )}
        </div>
        {m.openings.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-sm text-gray-500">
            Проёмы ещё не добавлены{canEditOpenings ? '. Нажмите «+ Добавить проём».' : ''}
          </div>
        )}
        {m.openings.map((op) => (
          <div key={op.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">
                Проём #{op.opening_number}{op.room_name && ` — ${op.room_name}`}
              </h3>
              <div className="flex items-center gap-2">
                {savingOpeningId === op.id && <span className="text-xs text-gray-400">сохранение...</span>}
                {canEditOpenings && (
                  <>
                    <button
                      onClick={() => copyOpening(op)}
                      className="px-2 py-1 text-xs text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                    >
                      Копировать
                    </button>
                    <button
                      onClick={() => deleteOpening(op)}
                      className="px-2 py-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
                    >
                      Удалить
                    </button>
                  </>
                )}
              </div>
            </div>

            {op.inverso_warning && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm font-medium">
                ⚠️ {op.inverso_warning}
              </div>
            )}

            {/* Идентификация проёма (СМ заполняет сам — раньше копировалось из заказа) */}
            <div className="mb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>№ проёма</label>
                <input
                  type="number"
                  value={op.opening_number ?? ''}
                  onChange={(e) => updateOpeningLocal(op.id, 'opening_number', e.target.value ? Number(e.target.value) : 0)}
                  onBlur={() => saveOpening(op)}
                  disabled={!canEditOpenings}
                  className={fieldCls}
                />
              </div>
              <div className="col-span-1 md:col-span-1">
                <label className={labelCls}>Помещение</label>
                <input
                  type="text"
                  value={op.room_name}
                  onChange={(e) => updateOpeningLocal(op.id, 'room_name', e.target.value)}
                  onBlur={() => saveOpening(op)}
                  disabled={!canEditOpenings}
                  className={fieldCls}
                  placeholder="напр. Спальня"
                />
              </div>
              <div>
                <label className={labelCls}>Тип двери</label>
                <select
                  value={op.door_type}
                  onChange={(e) => {
                    updateOpeningLocal(op.id, 'door_type', e.target.value as any)
                    setTimeout(() => saveOpening({ ...op, door_type: e.target.value as any }), 0)
                  }}
                  disabled={!canEditOpenings}
                  className={fieldCls}
                >
                  <option value="">—</option>
                  <option value="entrance">{DOOR_TYPE_DISPLAY.entrance}</option>
                  <option value="interior">{DOOR_TYPE_DISPLAY.interior}</option>
                  <option value="other">{DOOR_TYPE_DISPLAY.other}</option>
                </select>
              </div>
            </div>

            {/* Фактические размеры проёма */}
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-500 uppercase mb-2">Фактические размеры проёма *</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Высота, мм</label>
                  <input
                    type="number"
                    value={op.actual_height ?? ''}
                    onChange={(e) => updateOpeningLocal(op.id, 'actual_height', e.target.value ? Number(e.target.value) : null)}
                    onBlur={() => saveOpening(op)}
                    disabled={!canEditOpenings}
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Ширина, мм</label>
                  <input
                    type="number"
                    value={op.actual_width ?? ''}
                    onChange={(e) => updateOpeningLocal(op.id, 'actual_width', e.target.value ? Number(e.target.value) : null)}
                    onBlur={() => saveOpening(op)}
                    disabled={!canEditOpenings}
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Глубина, мм</label>
                  <input
                    type="number"
                    value={op.actual_depth ?? ''}
                    onChange={(e) => updateOpeningLocal(op.id, 'actual_depth', e.target.value ? Number(e.target.value) : null)}
                    onBlur={() => saveOpening(op)}
                    disabled={!canEditOpenings}
                    className={fieldCls}
                  />
                </div>
              </div>
            </div>

            {/* Рекомендации: рек. дверь редактируется СМ, рек. проём считается от неё */}
            <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-medium text-blue-700 uppercase">Рекомендуемый размер двери</div>
                  {op.recommended_door_is_manual && (
                    <button
                      type="button"
                      onClick={() => saveRecommendedDoor(op, { h: null, w: null })}
                      disabled={!canEditOpenings}
                      title="Вернуть авторасчёт (проём −70 / −100)"
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      ↺ авто
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={op.recommended_door_height ?? ''}
                    onChange={(e) => updateOpeningLocal(op.id, 'recommended_door_height', e.target.value ? Number(e.target.value) : null)}
                    onBlur={() => saveRecommendedDoor(op)}
                    disabled={!canEditOpenings}
                    className={fieldCls}
                    placeholder="Высота, мм"
                  />
                  <input
                    type="number"
                    value={op.recommended_door_width ?? ''}
                    onChange={(e) => updateOpeningLocal(op.id, 'recommended_door_width', e.target.value ? Number(e.target.value) : null)}
                    onBlur={() => saveRecommendedDoor(op)}
                    disabled={!canEditOpenings}
                    className={fieldCls}
                    placeholder="Ширина, мм"
                  />
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  {op.recommended_door_is_manual
                    ? '✎ задан вручную — рекомендации считаются от этого размера'
                    : 'авторасчёт: проём −70 / −100. Можно отредактировать'}
                </div>
              </div>
              <div className="p-3 bg-cyan-50 rounded-lg">
                <div className="text-xs font-medium text-cyan-700 uppercase mb-1">Рекомендуемый размер проёма</div>
                <div className="text-cyan-900">
                  Высота: <strong>{op.recommended_opening_height ?? '—'}</strong> · Ширина: <strong>{op.recommended_opening_width ?? '—'}</strong>
                </div>
                <div className="text-xs text-cyan-600 mt-1">(рек. дверь +70 / +100)</div>
              </div>
            </div>

            {/* Текст рекомендации — от рекомендуемой двери */}
            {(() => {
              const text = buildRecommendationText(op.actual_height, op.actual_width, op.recommended_door_height, op.recommended_door_width)
              if (!text) return null
              return (
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                  💡 {text}
                </div>
              )
            })()}

            {/* Открывание + добор */}
            <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Открывание *</label>
                <select
                  value={op.opening_type}
                  onChange={(e) => {
                    updateOpeningLocal(op.id, 'opening_type', e.target.value as any)
                    setTimeout(() => saveOpening({ ...op, opening_type: e.target.value as any }), 0)
                  }}
                  disabled={!canEditOpenings}
                  className={fieldCls}
                  title={op.opening_type ? OPENING_TYPE_DISPLAY[op.opening_type] : ''}
                >
                  <option value="">—</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="B_INVERSO">B Inverso</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                  <option value="D_INVERSO">D Inverso</option>
                </select>
                {isInverso(op.opening_type) && (
                  <p className="text-xs text-red-600 mt-1">⚠️ Inverso: увеличьте высоту полотна на 1 см.</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Ширина добора, мм</label>
                <input
                  type="number"
                  value={op.addon_width ?? ''}
                  onChange={(e) => updateOpeningLocal(op.id, 'addon_width', e.target.value ? Number(e.target.value) : null)}
                  onBlur={() => saveOpening(op)}
                  disabled={!canEditOpenings}
                  className={fieldCls}
                />
              </div>
            </div>

            {/* Наличники */}
            <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Наличник лицевой, кол-во (можно дробное)</label>
                <input
                  type="text"
                  value={op.face_trim_qty ?? ''}
                  onChange={(e) => updateOpeningLocal(op.id, 'face_trim_qty', e.target.value)}
                  onBlur={() => saveOpening(op)}
                  disabled={!canEditOpenings}
                  className={fieldCls}
                  placeholder="например, 1.5"
                />
                <input
                  type="text"
                  value={op.face_trim_comment}
                  onChange={(e) => updateOpeningLocal(op.id, 'face_trim_comment', e.target.value)}
                  onBlur={() => saveOpening(op)}
                  disabled={!canEditOpenings}
                  className={`${fieldCls} mt-1`}
                  placeholder="Комментарий (лицо)"
                />
              </div>
              <div>
                <label className={labelCls}>Наличник оборотный, кол-во</label>
                <input
                  type="text"
                  value={op.back_trim_qty ?? ''}
                  onChange={(e) => updateOpeningLocal(op.id, 'back_trim_qty', e.target.value)}
                  onBlur={() => saveOpening(op)}
                  disabled={!canEditOpenings}
                  className={fieldCls}
                />
                <input
                  type="text"
                  value={op.back_trim_comment}
                  onChange={(e) => updateOpeningLocal(op.id, 'back_trim_comment', e.target.value)}
                  onBlur={() => saveOpening(op)}
                  disabled={!canEditOpenings}
                  className={`${fieldCls} mt-1`}
                  placeholder="Комментарий (оборот)"
                />
              </div>
            </div>

            {/* Доп. фурнитура / порог / примечания */}
            <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Доп. фурнитура</label>
                <AutoResizeTextarea
                  value={op.extra_hardware}
                  onChange={(e) => updateOpeningLocal(op.id, 'extra_hardware', e.target.value)}
                  onBlur={() => saveOpening(op)}
                  disabled={!canEditOpenings}
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls}>Порог</label>
                <AutoResizeTextarea
                  value={op.threshold}
                  onChange={(e) => updateOpeningLocal(op.id, 'threshold', e.target.value)}
                  onBlur={() => saveOpening(op)}
                  disabled={!canEditOpenings}
                  className={fieldCls}
                />
              </div>
            </div>

            <div className="mb-3">
              <label className={labelCls}>Примечания / рекомендации</label>
              <AutoResizeTextarea
                value={op.notes}
                onChange={(e) => updateOpeningLocal(op.id, 'notes', e.target.value)}
                onBlur={() => saveOpening(op)}
                disabled={!canEditOpenings}
                className={fieldCls}
              />
            </div>

            {(() => {
              const fromOrder = (m.order_attachments || []).filter(
                (a) => a.order_item === op.order_item,
              )
              if (fromOrder.length === 0) return null
              return (
                <div className="mb-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                  <p className="text-xs font-medium text-gray-600 mb-2">Из заказа по этому проёму:</p>
                  <OrderAttachmentsBlock
                    orderId={m.order_id}
                    attachments={fromOrder}
                    readOnly
                  />
                </div>
              )
            })()}

            {/* Файлы по проёму (замер) */}
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase mb-1">Файлы / схемы по проёму ({op.attachments.length})</div>
              <ul className="space-y-0.5">
                {op.attachments.map((a) => (
                  <li key={a.id} className="text-xs">
                    <button
                      type="button"
                      onClick={() => a.file_url && setViewerFile({ url: a.file_url, name: a.name || 'Файл' })}
                      className="text-primary-600 hover:underline text-left"
                    >
                      {a.name || 'файл'}
                    </button>
                  </li>
                ))}
              </ul>
              {canEditOpenings && (
                <label className="inline-block mt-2">
                  <span className="text-xs text-primary-600 cursor-pointer hover:underline">+ Прикрепить файл к проёму</span>
                  <input
                    type="file"
                    onChange={(e) => handleUploadFile(op.id, e)}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
        ))}

        {/* Дублирующие кнопки снизу — чтобы не прокручивать вверх после длинного списка */}
        {m.openings.length > 0 && (canEditOpenings || canMarkDone) && (
          <div className="flex flex-wrap justify-center items-center gap-3 pt-2">
            {canEditOpenings && (
              <button
                onClick={addOpening}
                className="px-4 py-2 text-sm font-medium text-primary-600 border border-primary-300 hover:bg-primary-50 rounded-xl"
              >
                + Добавить проём
              </button>
            )}
            {canMarkDone && (
              <button
                onClick={handleMarkDone}
                className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl"
              >
                ✓ Замер выполнен
              </button>
            )}
          </div>
        )}
      </div>

      {showSchedule && (
        <ScheduleMeasurementModal
          measurementId={m.id}
          initialDate={m.measurement_date}
          contactName={m.contact_name}
          onClose={() => setShowSchedule(false)}
          onScheduled={() => {
            setShowSchedule(false)
            load()
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
        <LoadingOverlay message="Формируем PDF-бланк замера…" hint="Это может занять несколько секунд, не закрывайте страницу." />
      )}
    </div>
  )
}

export default MeasurementForm
