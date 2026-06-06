import { useEffect, useMemo, useState } from 'react'
import { Order } from '../../types/orders'
import { Measurement, MeasurementOpening } from '../../types/measurements'
import { measurementOpeningsAPI } from '../../api/measurements'
import { ordersAPI } from '../../api/orders'

interface Props {
  order: Order
  measurement: Measurement
  onApplied: () => void
  onLinksSaved?: () => void
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

  const linkedCount = items.filter((i) => links[i.id] != null).length
  const hasAnyLink = linkedCount > 0

  const handleSaveLinks = async () => {
    setError(null)
    setSuccessMsg(null)
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
        Слева — позиции КП, справа — фактические проёмы замера. Выберите соответствие
        и нажмите «Сохранить связки», затем «Заполнить из Замера» — это перенесёт тип
        двери, открывание и размеры из замера в позиции заказа.
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
                  <div className="text-xs text-gray-500 mb-2 truncate">
                    {item.model_name || '—'} ·{' '}
                    {item.door_height ?? '—'}×{item.door_width ?? '—'} мм
                  </div>
                  <select
                    value={linkedOpId ?? ''}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null
                      setLinks((prev) => ({ ...prev, [item.id]: v }))
                      setSavedOnce(false)
                    }}
                    className="block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value="">— не связано —</option>
                    {openings.map((op) => (
                      <option key={op.id} value={op.id}>
                        № {op.opening_number} — {op.room_name || 'без комнаты'}
                      </option>
                    ))}
                  </select>
                  {linkedOp && (
                    <div className="mt-1.5 text-xs text-cyan-700">
                      → {linkedOp.actual_height ?? '—'}×{linkedOp.actual_width ?? '—'} (факт), открывание{' '}
                      {linkedOp.opening_type || '—'}
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
                  <div className="text-xs text-gray-500">
                    Факт.: {op.actual_height ?? '—'}×{op.actual_width ?? '—'} мм,
                    открывание {op.opening_type || '—'}
                    {op.door_type ? `, ${op.door_type_display}` : ''}
                  </div>
                  <div className="text-xs text-gray-500">
                    Рек. дверь: {op.recommended_door_height ?? '—'}×{op.recommended_door_width ?? '—'}
                  </div>
                  {linkedToItemId && (
                    <div className="text-xs text-cyan-700 mt-1">
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
    </div>
  )
}

export default MeasurementLinkSection
