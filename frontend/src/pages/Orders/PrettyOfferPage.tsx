import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ordersAPI } from '../../api/orders'
import { prettyOfferAPI } from '../../api/prettyOffer'
import AutoResizeTextarea from '../../components/common/AutoResizeTextarea'
import { Order } from '../../types/orders'
import {
  Clarification,
  DoorImageRef,
  PrettyOffer,
  PrettyOfferItem,
  SourceImage,
  TOTALS_ROWS,
  TotalsOverrideField,
} from '../../types/prettyOffer'
import PrettyOfferDoorPicker from './PrettyOfferDoorPicker'
import PrettyOfferImagePicker from './PrettyOfferImagePicker'
import PrettyOfferOpeningCard from './PrettyOfferOpeningCard'

const fieldCls =
  'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'

const formatMoney = (value: string | null) =>
  value == null || value === '' ? '—' : `${Number(value).toLocaleString('ru-RU')} ₽`

// Поля, по которым сервер может вернуть претензию, — по-русски: менеджеру
// «addons: …» ни о чём не говорит.
const FIELD_NAMES: Record<string, string> = {
  addons: 'позиции комплектации',
  description: 'описание',
  front_image: 'картинка полотна',
  back_image: 'картинка оборота',
  front_custom_image: 'своя картинка полотна',
  back_custom_image: 'своя картинка оборота',
  two_sided: 'двусторонняя дверь',
}

/**
 * Причина отказа человеческим языком.
 *
 * Раньше показывали одну общую фразу: сервер возвращает претензии по полям
 * (`{"addons": ["..."]}`), а не `detail`, и на экране оставалось «не удалось
 * сохранить проём» — без намёка, что именно не так. Сеть от отказа сервера
 * тоже не отличали, хотя действия разные: перезагрузить или поправить данные.
 */
const errorText = (err: any, fallback: string): string => {
  const data = err?.response?.data
  if (typeof data === 'string' && data.trim()) return data
  if (data?.detail) return String(data.detail)
  if (data && typeof data === 'object') {
    const entry = Object.entries(data)[0]
    if (entry) {
      const [field, value] = entry
      const text = Array.isArray(value) ? value.join(' ') : String(value)
      const name = FIELD_NAMES[field]
      return name ? `${name} — ${text}` : text
    }
  }
  if (!err?.response) {
    return err?.code === 'ECONNABORTED'
      ? 'сервер не ответил за 20 секунд. Красивое КП правится только онлайн — проверьте связь и повторите'
      : 'нет связи с сервером. Красивое КП правится только онлайн — проверьте связь и повторите'
  }
  if (err.response.status >= 500) return 'ошибка на сервере, правка не сохранилась'
  return fallback
}

/**
 * Редактор красивого КП (п.3, 5, 7, 9, 10, 11 ТЗ).
 *
 * Правки сохраняются точечно, по мере ввода: отдельной кнопки «Сохранить» нет,
 * чтобы менеджер не терял работу, уйдя со страницы.
 */
const PrettyOfferPage = () => {
  const { id } = useParams<{ id: string }>()
  const orderId = Number(id)

  const [order, setOrder] = useState<Order | null>(null)
  const [offer, setOffer] = useState<PrettyOffer | null>(null)
  const [clarifications, setClarifications] = useState<Clarification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isBuilding, setIsBuilding] = useState(false)
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const [applyColorNotice, setApplyColorNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [comment, setComment] = useState('')
  const [overrides, setOverrides] = useState<Record<TotalsOverrideField, string>>({
    goods_amount_override: '',
    services_amount_override: '',
    total_amount_override: '',
    total_with_discount_override: '',
  })

  const [doorPicker, setDoorPicker] = useState<{ itemId: number; side: 'front' | 'back' } | null>(
    null,
  )
  const [imagePicker, setImagePicker] = useState<{ offerItemId?: number } | null>(null)

  const applyOffer = useCallback((data: PrettyOffer) => {
    setOffer(data)
    setComment(data.comment)
    setOverrides({
      goods_amount_override: data.goods_amount_override ?? '',
      services_amount_override: data.services_amount_override ?? '',
      total_amount_override: data.total_amount_override ?? '',
      total_with_discount_override: data.total_with_discount_override ?? '',
    })
  }, [])

  const loadClarifications = useCallback(async () => {
    try {
      setClarifications(await prettyOfferAPI.getClarifications(orderId))
    } catch {
      setClarifications([])
    }
  }, [orderId])

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    setIsLoading(true)
    Promise.all([ordersAPI.getById(orderId), prettyOfferAPI.get(orderId)])
      .then(([orderData, offerData]) => {
        if (cancelled) return
        setOrder(orderData)
        if (offerData) {
          applyOffer(offerData)
          loadClarifications()
        }
      })
      .catch(() => !cancelled && setError('Не удалось загрузить заказ'))
      .finally(() => !cancelled && setIsLoading(false))
    return () => {
      cancelled = true
    }
  }, [orderId, applyOffer, loadClarifications])

  const handleBuild = async () => {
    if (isBuilding) return
    setIsBuilding(true)
    setError(null)
    try {
      applyOffer(await prettyOfferAPI.build(orderId))
      await loadClarifications()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Не удалось сформировать красивое КП')
    } finally {
      setIsBuilding(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (isPdfLoading) return
    setIsPdfLoading(true)
    try {
      await prettyOfferAPI.openPdf(orderId, order?.kp_number)
    } catch {
      setError('Не удалось сформировать PDF')
    } finally {
      setIsPdfLoading(false)
    }
  }

  const patchOffer = async (patch: Partial<PrettyOffer>) => {
    if (!offer) return
    try {
      const updated = await prettyOfferAPI.update(offer.id, patch)
      applyOffer(updated)
      setError(null)
    } catch (err: any) {
      setError(`Не удалось сохранить КП: ${errorText(err, 'непонятная ошибка')}`)
    }
  }

  // Позицию обновляем точечно, не перезагружая всё КП: так не мигает
  // список и не теряется наведённый фокус.
  const replaceItem = (updated: PrettyOfferItem) => {
    setOffer((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item) => (item.id === updated.id ? updated : item)),
            needs_clarification_count: prev.items.filter((item) =>
              item.id === updated.id ? updated.needs_clarification : item.needs_clarification,
            ).length,
          }
        : prev,
    )
  }

  // Номер проёма в сообщении обязателен: проёмов в КП десяток, и «не удалось
  // сохранить проём» без номера не говорит, к какому возвращаться.
  const openingLabel = (itemId: number) => {
    const number = offer?.items.find((item) => item.id === itemId)?.opening_number
    return number ? `Проём № ${number}` : 'Проём'
  }

  const patchItem = async (itemId: number, patch: Partial<PrettyOfferItem>) => {
    try {
      replaceItem(await prettyOfferAPI.updateItem(itemId, patch))
      setError(null)
      await loadClarifications()
    } catch (err: any) {
      setError(
        `${openingLabel(itemId)} не сохранился: ${errorText(err, 'непонятная ошибка')}`,
      )
      // Позиции заказа могли пересоздаться (замена КП) — тогда на открытой
      // странице лежат уже несуществующие id, и любая правка будет падать,
      // пока не подтянем свежее КП.
      if (err?.response?.data?.addons) {
        const fresh = await prettyOfferAPI.get(orderId)
        if (fresh) applyOffer(fresh)
      }
    }
  }

  const uploadDoorImage = async (itemId: number, side: 'front' | 'back', file: File) => {
    try {
      replaceItem(await prettyOfferAPI.uploadItemImage(itemId, side, file))
      setError(null)
      await loadClarifications()
    } catch (err: any) {
      setError(
        `${openingLabel(itemId)}: не удалось загрузить картинку — ` +
          errorText(err, 'непонятная ошибка'),
      )
    }
  }

  const handlePickDoorImage = async (image: DoorImageRef) => {
    if (!doorPicker) return
    const field = doorPicker.side === 'front' ? 'front_image' : 'back_image'
    setDoorPicker(null)
    await patchItem(doorPicker.itemId, { [field]: image.id } as Partial<PrettyOfferItem>)
  }

  const handleAddImage = async (payload: {
    file?: File
    source?: SourceImage
    caption?: string
  }) => {
    if (!offer) return
    try {
      await prettyOfferAPI.addImage(offer.id, {
        ...payload,
        offerItemId: imagePicker?.offerItemId,
      })
      applyOffer((await prettyOfferAPI.get(orderId)) as PrettyOffer)
      setError(null)
      setImagePicker(null)
    } catch (err: any) {
      setError(`Не удалось добавить картинку: ${errorText(err, 'непонятная ошибка')}`)
    }
  }

  // Цвета в КП фабрики нет, а внутри заказа он обычно один на все двери:
  // подобрали дверь на одном проёме — разносим этот цвет по остальным.
  const handleApplyColorToAll = async (colorId: number, colorName: string) => {
    if (!offer) return
    const pending = offer.items.filter((item) => item.needs_clarification).length
    if (!pending) {
      setApplyColorNotice('Все проёмы уже с картинками — разносить цвет некуда.')
      return
    }
    if (!confirm(`Проставить цвет «${colorName}» остальным проёмам (${pending})? Уже выбранное не изменится.`)) return
    setError(null)
    try {
      const { stats, offer: updated } = await prettyOfferAPI.applyColor(offer.id, colorId)
      applyOffer(updated)
      await loadClarifications()
      const rest: string[] = []
      if (stats.variant_ambiguous) rest.push(`${stats.variant_ambiguous} — не понять вариант полотна`)
      if (stats.color_unavailable) rest.push(`${stats.color_unavailable} — модели нет в этом цвете`)
      if (stats.no_model) rest.push(`${stats.no_model} — модель не из каталога`)
      setApplyColorNotice(
        `Заполнено проёмов: ${stats.filled}.` + (rest.length ? ` Осталось вручную: ${rest.join(', ')}.` : ''),
      )
    } catch (err: any) {
      setError(`Не удалось проставить цвет: ${errorText(err, 'непонятная ошибка')}`)
    }
  }

  // Подобрали картинку на одном проёме — ставим её всем: внутри заказа двери
  // обычно одинаковые. Потом любой проём правится как обычно.
  const handleApplyImageToAll = async (itemId: number, openingNumber: number) => {
    if (!offer) return
    const others = offer.items.length - 1
    if (others < 1) {
      setApplyColorNotice('В КП всего один проём — разносить картинку некуда.')
      return
    }
    if (
      !confirm(
        `Поставить картинку проёма № ${openingNumber} остальным проёмам (${others})? ` +
          'Уже выбранные картинки заменятся — потом любой проём можно поправить.',
      )
    )
      return
    setError(null)
    try {
      const { changed, offer: updated } = await prettyOfferAPI.applyImage(offer.id, itemId)
      applyOffer(updated)
      await loadClarifications()
      setApplyColorNotice(
        changed
          ? `Картинка проставлена проёмам: ${changed}.`
          : 'Во всех проёмах уже стояла эта картинка.',
      )
    } catch (err: any) {
      setError(`Не удалось разнести картинку: ${errorText(err, 'непонятная ошибка')}`)
    }
  }

  const handleDeleteImage = async (attachmentId: number) => {
    if (!offer) return
    try {
      await prettyOfferAPI.deleteImage(attachmentId)
      applyOffer((await prettyOfferAPI.get(orderId)) as PrettyOffer)
      setError(null)
    } catch (err: any) {
      setError(`Не удалось убрать картинку: ${errorText(err, 'непонятная ошибка')}`)
    }
  }

  const saveOverride = (field: TotalsOverrideField) => {
    const raw = overrides[field].trim().replace(',', '.')
    const current = offer?.[field] ?? ''
    if (raw === (current ?? '')) return
    patchOffer({ [field]: raw === '' ? null : raw } as Partial<PrettyOffer>)
  }

  // Подсказка матчера для окна уточнения — по нужной стороне полотна.
  const activeHint = (() => {
    if (!doorPicker) return null
    const row = clarifications.find((c) => c.offer_item_id === doorPicker.itemId)
    if (!row) return null
    return doorPicker.side === 'front' ? row.match.front : row.match.back
  })()

  const activeItem = doorPicker
    ? offer?.items.find((item) => item.id === doorPicker.itemId)
    : undefined

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500">Загрузка…</div>
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link to={`/orders/${orderId}`} className="text-sm text-primary-600 hover:underline">
            ← К заказу
          </Link>
          <h1 className="text-xl font-semibold text-gray-900 mt-1">Красивое КП</h1>
          <p className="text-sm text-gray-500">
            {order?.client_name}
            {order?.kp_number ? ` · КП № ${order.kp_number}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBuild}
            disabled={isBuilding}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl disabled:opacity-60"
          >
            {isBuilding
              ? 'Формируем…'
              : offer
                ? 'Обновить из заказа'
                : 'Сформировать красивое КП'}
          </button>
          {offer && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isPdfLoading}
              className="px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-60"
            >
              {isPdfLoading ? 'Готовим PDF…' : 'Скачать PDF'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 p-3 flex items-start justify-between gap-3">
          <span>{error}</span>
          {/* Крестик обязателен: сообщение об одной осечке висело до перезагрузки
              страницы — даже когда следующая правка уже сохранилась. */}
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 shrink-0"
          >
            ×
          </button>
        </div>
      )}

      {!offer ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-600 mb-4">
            Красивое КП по этому заказу ещё не формировали.
          </p>
          <button
            type="button"
            onClick={handleBuild}
            disabled={isBuilding}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-60"
          >
            {isBuilding ? 'Формируем…' : 'Сформировать красивое КП'}
          </button>
        </div>
      ) : (
        <>
          {applyColorNotice && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-900 p-3 flex items-start justify-between gap-3">
              <span>{applyColorNotice}</span>
              <button
                type="button"
                onClick={() => setApplyColorNotice(null)}
                className="text-blue-500 hover:text-blue-700 shrink-0"
              >
                ×
              </button>
            </div>
          )}

          {offer.needs_clarification_count > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 p-3">
              По {offer.needs_clarification_count}{' '}
              {offer.needs_clarification_count === 1 ? 'проёму' : 'проёмам'} не удалось подобрать
              картинку — уточните модель и цвет, иначе в КП вместо двери будет пустое место.
            </div>
          )}

          <div className="space-y-3">
            {offer.items.map((item) => (
              <PrettyOfferOpeningCard
                key={item.id}
                item={item}
                orderAddons={order?.addons ?? []}
                onApplyColorToAll={handleApplyColorToAll}
                onApplyImageToAll={() => handleApplyImageToAll(item.id, item.opening_number)}
                onPatch={(patch) => patchItem(item.id, patch)}
                onUploadDoorImage={(side, file) => uploadDoorImage(item.id, side, file)}
                onPickFromCatalog={(side) => setDoorPicker({ itemId: item.id, side })}
                onAddExtraImage={() => setImagePicker({ offerItemId: item.id })}
                onDeleteExtraImage={handleDeleteImage}
              />
            ))}
          </div>

          {/* Итоги (п.10 ТЗ) */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Стоимость
            </h2>
            <div className="space-y-2">
              {TOTALS_ROWS.map((row) => (
                <div key={row.key} className="flex items-center gap-3 flex-wrap">
                  <span className="flex-1 min-w-[200px] text-sm text-gray-700">{row.label}</span>
                  <span className="text-sm text-gray-500 w-32 text-right">
                    {formatMoney(offer.totals[row.key])}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={overrides[row.override]}
                    onChange={(e) =>
                      setOverrides((prev) => ({ ...prev, [row.override]: e.target.value }))
                    }
                    onBlur={() => saveOverride(row.override)}
                    placeholder="из КП"
                    className={`${fieldCls} w-36`}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Слева — что уйдёт в КП. В поле справа впишите свою сумму, если её нужно поправить;
              пустое поле означает «взять из КП».
            </p>
          </div>

          {/* Комментарий и общие картинки (п.9, п.11 ТЗ) */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Комментарий и картинки по КП
            </h2>
            <AutoResizeTextarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onBlur={() => {
                if (comment !== offer.comment) patchOffer({ comment })
              }}
              placeholder="Выводится внизу, под всеми проёмами"
              minRows={3}
              className={fieldCls}
            />

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">Картинки по КП в целом</span>
                <button
                  type="button"
                  onClick={() => setImagePicker({})}
                  className="text-sm text-primary-600 hover:underline"
                >
                  + Добавить
                </button>
              </div>
              {offer.attachments.length === 0 ? (
                <p className="text-xs text-gray-500">Нет</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {offer.attachments.map((attachment) => (
                    <div key={attachment.id} className="relative">
                      {attachment.image_url && (
                        <img
                          src={attachment.image_url}
                          alt={attachment.caption}
                          className="h-20 w-20 object-cover rounded border border-gray-200"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteImage(attachment.id)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-white border border-gray-300 text-gray-500 hover:text-red-600 text-xs leading-none"
                        title="Убрать"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <PrettyOfferDoorPicker
        open={!!doorPicker}
        title={
          activeItem
            ? `Проём № ${activeItem.opening_number}: ${
                doorPicker?.side === 'back' ? 'оборот' : 'лицо'
              }`
            : 'Выбор двери'
        }
        hint={activeHint}
        onPick={handlePickDoorImage}
        onClose={() => setDoorPicker(null)}
      />

      <PrettyOfferImagePicker
        open={!!imagePicker}
        orderId={orderId}
        title={
          imagePicker?.offerItemId ? 'Картинка по проёму' : 'Картинка по КП в целом'
        }
        onAdd={handleAddImage}
        onClose={() => setImagePicker(null)}
      />
    </div>
  )
}

export default PrettyOfferPage
