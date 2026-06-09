import { useEffect, useMemo, useState } from 'react'
import { Order, OrderAttachment } from '../../types/orders'
import { Measurement, MeasurementOpening, MeasurementAttachment } from '../../types/measurements'
import { measurementOpeningsAPI } from '../../api/measurements'
import { ordersAPI } from '../../api/orders'
import FileViewer from '../../components/common/FileViewer'

interface Props {
  order: Order
  measurement: Measurement
  onApplied: () => void
  onLinksSaved?: () => void
}

// Если страница по HTTPS, а файл по HTTP — поправляем, чтобы не было mixed content.
const fixUrl = (url: string): string =>
  window.location.protocol === 'https:' && url.startsWith('http://')
    ? url.replace('http://', 'https://')
    : url

const isImage = (url: string | null): boolean =>
  !!url && /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif)(\?|$)/i.test(url)

// Миниатюры вложений: фото — превью, прочие файлы — кнопка-ссылка. Всё открывается в FileViewer.
const AttachmentThumbs = ({
  attachments,
  onView,
}: {
  attachments: (OrderAttachment | MeasurementAttachment)[]
  onView: (url: string, name: string) => void
}) => {
  const withUrl = (attachments || []).filter((a) => a.file_url)
  if (withUrl.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {withUrl.map((a) => {
        const url = fixUrl(a.file_url!)
        const name = a.name || 'Файл'
        return isImage(a.file_url) ? (
          <button
            key={a.id}
            type="button"
            onClick={() => onView(url, name)}
            title={name}
            className="block h-16 w-16 rounded-md overflow-hidden border border-gray-200 hover:ring-2 hover:ring-primary-400"
          >
            <img src={url} alt={name} loading="lazy" className="h-full w-full object-cover" />
          </button>
        ) : (
          <button
            key={a.id}
            type="button"
            onClick={() => onView(url, name)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-gray-200 bg-white text-primary-600 hover:underline"
          >
            📎 {name}
          </button>
        )
      })}
    </div>
  )
}

const MeasurementLinkSection = ({ order, measurement, onApplied, onLinksSaved }: Props) => {
  const items = order.items || []
  const openings = measurement.openings || []

  // Локальные связки: orderItemId → openingId | null
  const [links, setLinks] = useState<Record<number, number | null>>({})
  const [isSavingLinks, setIsSavingLinks] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [savedOnce, setSavedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null)

  const onView = (url: string, name: string) => setViewerFile({ url, name })

  // Инициализация: связки берём с серверной стороны (op.order_item)
  useEffect(() => {
    const initial: Record<number, number | null> = {}
    for (const item of items) initial[item.id] = null
    for (const op of openings) {
      if (op.order_item && initial.hasOwnProperty(op.order_item)) {
        initial[op.order_item] = op.id
      }
    }
    setLinks(initial)
    // savedOnce включаем сразу, если на сервере уже есть хотя бы одна привязка —
    // тогда при возврате на страницу кнопка «Заполнить из Замера» сразу доступна.
    const anyLinkedFromServer = items.some((i) => initial[i.id] != null)
    setSavedOnce(anyLinkedFromServer)
  }, [order.id, measurement.id])

  const openingById = useMemo(() => {
    const m = new Map<number, MeasurementOpening>()
    for (const op of openings) m.set(op.id, op)
    return m
  }, [openings])

  // Обратная карта: openingId → itemId, к которому он уже привязан.
  // Нужна, чтобы один проём нельзя было выбрать сразу для нескольких позиций КП.
  const itemIdByOpening = useMemo(() => {
    const m = new Map<number, number>()
    for (const [itemId, opId] of Object.entries(links)) {
      if (opId != null) m.set(opId, Number(itemId))
    }
    return m
  }, [links])

  const linkedCount = items.filter((i) => links[i.id] != null).length
  const hasAnyLink = linkedCount > 0

  const handleSaveLinks = async () => {
    setError(null)
    setSuccessMsg(null)

    // Страховка: один проём не может быть привязан к нескольким позициям КП.
    const seen = new Set<number>()
    for (const opId of Object.values(links)) {
      if (opId == null) continue
      if (seen.has(opId)) {
        const op = openingById.get(opId)
        setError(`Проём № ${op?.opening_number ?? opId} выбран сразу для нескольких позиций. Один проём можно привязать только к одной двери.`)
        return
      }
      seen.add(opId)
    }

    setIsSavingLinks(true)
    try {
      const payload = Object.entries(links).map(([itemId, openingId]) => ({
        // Меняем порядок: на бэке берём opening_id и привязываем к item
        measurement_opening_id: openingId,
        order_item_id: Number(itemId),
      })).filter((l) => l.measurement_opening_id != null) as
        { measurement_opening_id: number; order_item_id: number | null }[]

      // Также собираем отвязки — для openings, которые сейчас привязаны к этому заказу,
      // но в links уже не указаны.
      const linkedOpeningIds = new Set(payload.map((l) => l.measurement_opening_id))
      for (const op of openings) {
        if (op.order_item != null && !linkedOpeningIds.has(op.id)) {
          payload.push({ measurement_opening_id: op.id, order_item_id: null })
        }
      }

      if (payload.length === 0) {
        setIsSavingLinks(false)
        return
      }

      await measurementOpeningsAPI.batchLink(payload)
      setSavedOnce(true)
      setSuccessMsg(`Связки сохранены (${linkedCount}). Теперь нажмите «Заполнить из Замера», чтобы перенести размеры в позиции заказа.`)
      onLinksSaved?.()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось сохранить связки')
    } finally {
      setIsSavingLinks(false)
    }
  }

  const handleApply = async () => {
    setError(null)
    setIsApplying(true)
    setError(null)
    setSuccessMsg(null)
    try {
      await ordersAPI.applyMeasurementToItems(order.id)
      setSuccessMsg('Размеры и рекомендации из замера перенесены в позиции заказа.')
      onApplied()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось применить замер')
    } finally {
      setIsApplying(false)
    }
  }

  if (!measurement.is_done) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex items-start justify-between mb-3">
        <h2 className="text-base font-bold text-gray-900">
          Связка позиций КП с проёмами замера
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveLinks}
            disabled={isSavingLinks}
            className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-xl"
          >
            {isSavingLinks ? 'Сохранение...' : 'Сохранить связки'}
          </button>
          {savedOnce && hasAnyLink && (
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-xl"
            >
              {isApplying ? 'Применяю...' : 'Заполнить размеры дверей и рекомендации по Замеру'}
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Слева — позиции КП, справа — фактические проёмы замера (с размерами, открыванием и фото).
        Сопоставьте проём двери, выберите соответствие в выпадающем списке и нажмите «Сохранить связки»,
        затем «Заполнить из Замера» — это перенесёт тип двери, открывание и размеры из замера в позиции заказа.
        На компьютере удобнее: заказ и замер видны на одном экране.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg mb-3 text-sm">
          ✓ {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Слева — позиции КП с селектами */}
        <div>
          <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Позиции КП</h3>
          <div className="space-y-2">
            {items.map((item) => {
              const linkedOpId = links[item.id] ?? null
              const linkedOp = linkedOpId ? openingById.get(linkedOpId) : null
              return (
                <div
                  key={item.id}
                  className="border border-gray-200 rounded-lg p-2.5 text-sm bg-gray-50"
                >
                  <div className="font-medium text-gray-900">
                    №{item.opening_number} — {item.room_name || 'без комнаты'}
                  </div>
                  <div className="text-xs text-gray-700 mb-1 whitespace-pre-wrap break-words">
                    {item.model_name || '—'}
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5 mb-2">
                    <div>Размер двери: {item.door_height ?? '—'}×{item.door_width ?? '—'} мм</div>
                    {(item.door_type_display || item.opening_type_display) && (
                      <div>
                        {item.door_type_display || ''}
                        {item.opening_type_display ? `${item.door_type_display ? ' · ' : ''}открывание ${item.opening_type_display}` : ''}
                      </div>
                    )}
                    {item.notes && <div className="whitespace-pre-wrap break-words">📝 {item.notes}</div>}
                  </div>
                  <AttachmentThumbs attachments={item.attachments || []} onView={onView} />
                  <select
                    value={linkedOpId ?? ''}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null
                      setLinks((prev) => ({ ...prev, [item.id]: v }))
                      setSavedOnce(false)
                    }}
                    className="mt-2 block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value="">— не связано —</option>
                    {openings.map((op) => {
                      const takenByItemId = itemIdByOpening.get(op.id)
                      const takenByOther = takenByItemId != null && takenByItemId !== item.id
                      const takenByNum = takenByOther
                        ? items.find((i) => i.id === takenByItemId)?.opening_number ?? '?'
                        : null
                      return (
                        <option key={op.id} value={op.id} disabled={takenByOther}>
                          № {op.opening_number} — {op.room_name || 'без комнаты'}
                          {takenByOther ? ` (занят позицией №${takenByNum})` : ''}
                        </option>
                      )
                    })}
                  </select>
                  {linkedOp && (
                    <div className="mt-1.5 text-xs text-cyan-700">
                      → проём № {linkedOp.opening_number}: {linkedOp.actual_height ?? '—'}×{linkedOp.actual_width ?? '—'} (факт), открывание{' '}
                      {linkedOp.opening_type_display || linkedOp.opening_type || '—'}
                    </div>
                  )}
                </div>
              )
            })}
            {items.length === 0 && (
              <div className="text-sm text-gray-500">Позиций нет</div>
            )}
          </div>
        </div>

        {/* Справа — проёмы замера */}
        <div>
          <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Проёмы замера</h3>
          <div className="space-y-2">
            {openings.map((op) => {
              const linkedToItemId = Object.entries(links).find(([, opId]) => opId === op.id)?.[0]
              return (
                <div
                  key={op.id}
                  className={`border rounded-lg p-2.5 text-sm ${linkedToItemId ? 'bg-cyan-50 border-cyan-200' : 'bg-white border-gray-200'}`}
                >
                  <div className="font-medium text-gray-900">
                    № {op.opening_number} — {op.room_name || 'без комнаты'}
                  </div>
                  <div className="text-xs text-gray-600 space-y-0.5 mt-1">
                    <div>
                      Факт. проём: {op.actual_height ?? '—'}×{op.actual_width ?? '—'}
                      {op.actual_depth ? `×${op.actual_depth}` : ''} мм
                    </div>
                    <div>Рек. дверь: {op.recommended_door_height ?? '—'}×{op.recommended_door_width ?? '—'} мм</div>
                    {(op.desired_door_height || op.desired_door_width) && (
                      <div>Желаемая дверь: {op.desired_door_height ?? '—'}×{op.desired_door_width ?? '—'} мм</div>
                    )}
                    <div>
                      Открывание: {op.opening_type_display || op.opening_type || '—'}
                      {op.door_type_display ? ` · ${op.door_type_display}` : ''}
                    </div>
                    {op.threshold && <div>Порог: {op.threshold}</div>}
                    {op.extra_hardware && <div>Доп. фурнитура: {op.extra_hardware}</div>}
                    {op.notes && <div className="whitespace-pre-wrap break-words text-gray-700">📝 {op.notes}</div>}
                    {op.recommendation_text && (
                      <div className="whitespace-pre-wrap break-words text-amber-700">{op.recommendation_text}</div>
                    )}
                    {op.inverso_warning && (
                      <div className="whitespace-pre-wrap break-words text-red-600">⚠ {op.inverso_warning}</div>
                    )}
                  </div>
                  <AttachmentThumbs attachments={op.attachments || []} onView={onView} />
                  {linkedToItemId && (
                    <div className="text-xs text-cyan-700 mt-2">
                      → привязан к позиции КП №{
                        items.find((i) => i.id === Number(linkedToItemId))?.opening_number ?? '?'
                      }
                    </div>
                  )}
                </div>
              )
            })}
            {openings.length === 0 && (
              <div className="text-sm text-gray-500">Проёмы замера не заполнены</div>
            )}
          </div>
        </div>
      </div>

      {viewerFile && (
        <FileViewer
          fileUrl={viewerFile.url}
          fileName={viewerFile.name}
          onClose={() => setViewerFile(null)}
        />
      )}
    </div>
  )
}

export default MeasurementLinkSection
