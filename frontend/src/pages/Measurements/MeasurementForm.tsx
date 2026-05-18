import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  measurementsAPI,
  measurementOpeningsAPI,
  measurementAttachmentsAPI,
  buildRecommendationText,
  isInverso,
  validateLiftRequired,
} from '../../api/measurements'
import { Measurement, MeasurementOpening, ChangeTarget, CHANGE_TARGET_DISPLAY } from '../../types/measurements'
import { OPENING_TYPE_DISPLAY } from '../../types/orders'
import ScheduleMeasurementModal from './ScheduleMeasurementModal'
import OrderAttachmentsBlock from '../../components/orders/OrderAttachmentsBlock'

const fieldCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const MeasurementForm = () => {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const [m, setM] = useState<Measurement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingOpeningId, setSavingOpeningId] = useState<number | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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

  // Локальное обновление одного проёма + дебаунсная отправка через onBlur
  const updateOpeningLocal = (openingId: number, field: keyof MeasurementOpening, value: any) => {
    if (!m) return
    setM({
      ...m,
      openings: m.openings.map((o) => (o.id === openingId ? { ...o, [field]: value } : o)),
    })
  }

  const saveOpening = async (op: MeasurementOpening) => {
    setSavingOpeningId(op.id)
    try {
      const payload: Partial<MeasurementOpening> = {
        actual_height: op.actual_height,
        actual_width: op.actual_width,
        actual_depth: op.actual_depth,
        change_target: op.change_target,
        new_door_height: op.new_door_height,
        new_door_width: op.new_door_width,
        opening_type: op.opening_type,
        addon_width: op.addon_width,
        face_trim_qty: op.face_trim_qty,
        face_trim_comment: op.face_trim_comment,
        back_trim_qty: op.back_trim_qty,
        back_trim_comment: op.back_trim_comment,
        extra_hardware: op.extra_hardware,
        threshold: op.threshold,
        notes: op.notes,
        room_name: op.room_name,
      }
      await measurementOpeningsAPI.update(op.id, payload)
      // Перезагружаем замер чтобы получить пересчитанные рекомендации
      await load()
    } catch {
      alert('Не удалось сохранить проём')
    } finally {
      setSavingOpeningId(null)
    }
  }

  const handleUploadFile = async (openingId: number | null, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!m) return
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await measurementAttachmentsAPI.upload(m.id, file, openingId)
      await load()
    } catch {
      alert('Не удалось загрузить файл')
    } finally {
      e.target.value = ''
    }
  }

  const handleMarkDone = async () => {
    if (!m) return
    setActionError(null)
    try {
      await measurementsAPI.markDone(m.id)
      await load()
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Не удалось закрыть замер')
    }
  }

  const handleMarkProcessed = async () => {
    if (!m) return
    setActionError(null)
    try {
      await measurementsAPI.markProcessed(m.id)
      await load()
    } catch (err: any) {
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
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{actionError}</div>
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
                <a href={m.opening_plan_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">Открыть</a>
              ) : (
                <span className="text-amber-700">Не приложен — нужно вложить до закрытия замера</span>
              )}
            </div>
            <div>
              <span className="text-gray-500">Общие вложения замера ({m.attachments.length}):</span>
              <ul className="mt-1 space-y-0.5">
                {m.attachments.filter((a) => !a.opening).map((a) => (
                  <li key={a.id} className="text-xs">
                    <a href={a.file_url || '#'} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">{a.name || 'файл'}</a>
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
                <a href={m.signature_photo_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">Открыть</a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Проёмы */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Проёмы ({m.openings.length})</h2>
        {m.openings.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-sm text-gray-500">
            Проёмы не загружены
          </div>
        )}
        {m.openings.map((op) => (
          <div key={op.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">
                Проём #{op.opening_number}{op.room_name && ` — ${op.room_name}`}
              </h3>
              {savingOpeningId === op.id && <span className="text-xs text-gray-400">сохранение...</span>}
            </div>

            {op.inverso_warning && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm font-medium">
                ⚠️ {op.inverso_warning}
              </div>
            )}

            {/* Размеры из заказа (read-only) */}
            <div className="mb-3 p-3 bg-gray-50 rounded-lg">
              <div className="text-xs font-medium text-gray-500 uppercase mb-2">Размер двери по Заказу</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Высота:</span> <strong>{op.door_height_by_order ?? '—'}</strong> мм</div>
                <div><span className="text-gray-500">Ширина:</span> <strong>{op.door_width_by_order ?? '—'}</strong> мм</div>
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

            {/* Авто-рекомендации */}
            <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-xs font-medium text-blue-700 uppercase mb-1">Рекомендуемый размер двери</div>
                <div className="text-blue-900">
                  Высота: <strong>{op.recommended_door_height ?? '—'}</strong> · Ширина: <strong>{op.recommended_door_width ?? '—'}</strong>
                </div>
                <div className="text-xs text-blue-600 mt-1">(проём −70 / −100)</div>
              </div>
              <div className="p-3 bg-cyan-50 rounded-lg">
                <div className="text-xs font-medium text-cyan-700 uppercase mb-1">Рекомендуемый размер проёма</div>
                <div className="text-cyan-900">
                  Высота: <strong>{op.recommended_opening_height ?? '—'}</strong> · Ширина: <strong>{op.recommended_opening_width ?? '—'}</strong>
                </div>
                <div className="text-xs text-cyan-600 mt-1">(дверь +70 / +100)</div>
              </div>
            </div>

            {/* Текст рекомендации */}
            {(op.recommendation_text || buildRecommendationText(op.actual_height, op.actual_width, op.door_height_by_order, op.door_width_by_order)) && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                💡 {op.recommendation_text || buildRecommendationText(op.actual_height, op.actual_width, op.door_height_by_order, op.door_width_by_order)}
              </div>
            )}

            {/* Меняем дверь / проём / оба */}
            <div className="mb-3">
              <label className={labelCls}>Что меняем?</label>
              <div className="flex flex-wrap gap-2">
                {(['door', 'opening', 'both'] as ChangeTarget[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={!canEditOpenings}
                    onClick={() => {
                      updateOpeningLocal(op.id, 'change_target', t)
                      setTimeout(() => saveOpening({ ...op, change_target: t }), 0)
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg ${op.change_target === t ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} disabled:opacity-50`}
                  >
                    {CHANGE_TARGET_DISPLAY[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Если меняем дверь или оба — поля новой двери */}
            {(op.change_target === 'door' || op.change_target === 'both') && (
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Новая высота двери, мм</label>
                  <input
                    type="number"
                    value={op.new_door_height ?? ''}
                    onChange={(e) => updateOpeningLocal(op.id, 'new_door_height', e.target.value ? Number(e.target.value) : null)}
                    onBlur={() => saveOpening(op)}
                    disabled={!canEditOpenings}
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Новая ширина двери, мм</label>
                  <input
                    type="number"
                    value={op.new_door_width ?? ''}
                    onChange={(e) => updateOpeningLocal(op.id, 'new_door_width', e.target.value ? Number(e.target.value) : null)}
                    onBlur={() => saveOpening(op)}
                    disabled={!canEditOpenings}
                    className={fieldCls}
                  />
                </div>
              </div>
            )}

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
                <textarea
                  value={op.extra_hardware}
                  onChange={(e) => updateOpeningLocal(op.id, 'extra_hardware', e.target.value)}
                  onBlur={() => saveOpening(op)}
                  disabled={!canEditOpenings}
                  rows={2}
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls}>Порог</label>
                <textarea
                  value={op.threshold}
                  onChange={(e) => updateOpeningLocal(op.id, 'threshold', e.target.value)}
                  onBlur={() => saveOpening(op)}
                  disabled={!canEditOpenings}
                  rows={2}
                  className={fieldCls}
                />
              </div>
            </div>

            <div className="mb-3">
              <label className={labelCls}>Примечания / рекомендации</label>
              <textarea
                value={op.notes}
                onChange={(e) => updateOpeningLocal(op.id, 'notes', e.target.value)}
                onBlur={() => saveOpening(op)}
                disabled={!canEditOpenings}
                rows={2}
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
                    <a href={a.file_url || '#'} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">{a.name || 'файл'}</a>
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
    </div>
  )
}

export default MeasurementForm
