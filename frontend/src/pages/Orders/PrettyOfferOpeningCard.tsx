import { useEffect, useRef, useState } from 'react'
import AutoResizeTextarea from '../../components/common/AutoResizeTextarea'
import { OrderAddon } from '../../types/orders'
import { PrettyOfferItem, PrettyOfferItemAddonInput } from '../../types/prettyOffer'

interface Props {
  item: PrettyOfferItem
  orderAddons: OrderAddon[]
  onApplyColorToAll: (colorId: number, colorName: string) => void
  onApplyImageToAll: () => void
  onPatch: (patch: Record<string, unknown>) => Promise<void>
  onUploadDoorImage: (side: 'front' | 'back', file: File) => Promise<void>
  onPickFromCatalog: (side: 'front' | 'back') => void
  onAddExtraImage: () => void
  onDeleteExtraImage: (attachmentId: number) => void
}

const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

/** Наименование позиции с размером — без количества: оно правится рядом. */
const addonLabel = (addon: { name: string; kind_display: string; size: string }) => {
  const parts = [addon.name.trim() || addon.kind_display]
  if (addon.size) parts.push(addon.size)
  return parts.join(', ')
}

/** «2», «1,5» — без хвостовых нулей, как приходит из базы («2.00»). */
const quantityText = (value: string | number) => {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('ru-RU') : String(value)
}

/** Одна сторона полотна: картинка + кнопки выбора и загрузки. */
const DoorSide = ({
  label,
  url,
  onPick,
  onUpload,
}: {
  label: string
  url: string | null
  onPick: () => void
  onUpload: (file: File) => void
}) => {
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="border border-gray-200 rounded-lg bg-gray-50 h-40 flex items-center justify-center overflow-hidden">
        {url ? (
          <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-amber-700 text-center px-2">Картинка не подобрана</span>
        )}
      </div>
      <div className="flex gap-2 mt-1.5">
        <button
          type="button"
          onClick={onPick}
          className="flex-1 px-2 py-1.5 text-xs font-medium text-primary-600 border border-primary-300 hover:bg-primary-50 rounded-lg"
        >
          Из каталога
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg"
        >
          Своя
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUpload(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

/**
 * Проём в редакторе красивого КП: что уйдёт на его слайд (п.8, 9, 11 ТЗ).
 * Название модели, размер и открывание берутся из КП и не редактируются —
 * их правят в самом заказе.
 */
const PrettyOfferOpeningCard = ({
  item,
  orderAddons,
  onApplyColorToAll,
  onApplyImageToAll,
  onPatch,
  onUploadDoorImage,
  onPickFromCatalog,
  onAddExtraImage,
  onDeleteExtraImage,
}: Props) => {
  const [description, setDescription] = useState(item.description)
  const [addonsOpen, setAddonsOpen] = useState(false)
  // Количества правятся в полях, поэтому держим их строками: пока менеджер
  // стирает «2», чтобы набрать «12», поле законно пустое.
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  // Клик по позиции комплектации уводит фокус из описания, и его blur успевает
  // уйти отдельным запросом раньше. Два PATCH-а на один проём возвращаются не
  // обязательно по порядку, и ответ первого затирал бы в списке только что
  // выбранные позиции — поэтому такой blur пропускаем, а текст уходит вместе
  // с позициями одним запросом: поле-то теперь одно.
  const savingWithAddons = useRef(false)

  // Описание могли поменять снаружи (пересборка КП) — подхватываем.
  useEffect(() => setDescription(item.description), [item.description])

  useEffect(() => {
    setQuantities(
      Object.fromEntries(item.addons.map((row) => [row.addon, quantityText(row.quantity)])),
    )
  }, [item.addons])

  const saveDescription = () => {
    // Флаг одноразовый: если до клика дело так и не дошло (курсор увели с
    // позиции), следующий blur должен сохранить описание как обычно.
    const skip = savingWithAddons.current
    savingWithAddons.current = false
    if (skip || description === item.description) return
    onPatch({ description })
  }

  const selectedAddons = new Map(item.addons.map((row) => [row.addon, row]))

  // Комплектацию шлём списком целиком: сервер её так и переписывает.
  const saveAddons = (rows: PrettyOfferItemAddonInput[]) => {
    savingWithAddons.current = false
    const patch: Record<string, unknown> = { addons: rows }
    if (description !== item.description) patch.description = description
    onPatch(patch)
  }

  const currentRows = (): PrettyOfferItemAddonInput[] =>
    item.addons.map((row) => ({
      addon: row.addon,
      quantity: quantities[row.addon] ?? quantityText(row.quantity),
    }))

  const toggleAddon = (addonId: number) => {
    if (selectedAddons.has(addonId)) {
      saveAddons(currentRows().filter((row) => row.addon !== addonId))
      return
    }
    // Новая позиция входит в проём в количестве 1: сколько на самом деле —
    // знает менеджер, а общее количество по заказу сюда ставить нельзя, оно
    // разложено по всем проёмам.
    saveAddons([...currentRows(), { addon: addonId, quantity: '1' }])
  }

  // Количество сохраняем по уходу из поля: иначе запрос уходил бы на каждую
  // набранную цифру.
  const saveQuantity = (addonId: number) => {
    const row = selectedAddons.get(addonId)
    if (!row) return
    const raw = (quantities[addonId] ?? '').trim().replace(',', '.')
    const value = Number(raw)
    if (!raw || !Number.isFinite(value) || value <= 0) {
      // Пустое или бессмысленное значение откатываем к сохранённому.
      setQuantities((prev) => ({ ...prev, [addonId]: quantityText(row.quantity) }))
      return
    }
    if (Number(row.quantity) === value) return
    saveAddons(currentRows().map((r) => (r.addon === addonId ? { ...r, quantity: raw } : r)))
  }

  const size = [item.door_height, item.door_width].filter(Boolean).join(' × ')
  // Цвета в КП нет, но внутри заказа он обычно один: подобрали дверь на одном
  // проёме — предлагаем разнести этот цвет по остальным.
  const catalogColor = item.front_image_detail

  return (
    <div
      className={`rounded-xl border p-4 ${
        item.needs_clarification ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">
              Проём № {item.opening_number}
            </span>
            {item.room_name && (
              <span className="text-sm text-gray-600 truncate">{item.room_name}</span>
            )}
            {item.needs_clarification && (
              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-800">
                Нужно уточнить
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-900 mt-1.5 break-words">
            {item.model_name || '—'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {size ? `${size} мм` : 'размер не указан'}
            {item.opening_type_display ? ` · ${item.opening_type_display}` : ''}
            {item.amount ? ` · ${Number(item.amount).toLocaleString('ru-RU')} ₽` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
        {item.front_image_url && (
          <button
            type="button"
            onClick={onApplyImageToAll}
            className="text-xs text-primary-600 hover:underline whitespace-nowrap"
            title="Поставить эту картинку всем проёмам КП — потом любой можно заменить"
          >
            Эта картинка — всем
          </button>
        )}
        {catalogColor && (
          <button
            type="button"
            onClick={() => onApplyColorToAll(catalogColor.color, catalogColor.color_name)}
            className="text-xs text-primary-600 hover:underline whitespace-nowrap"
            title={`Проставить цвет «${catalogColor.color_name}» остальным проёмам, где картинка не подобрана`}
          >
            Этот цвет — всем
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
          <input
            type="checkbox"
            checked={item.two_sided}
            onChange={(e) => onPatch({ two_sided: e.target.checked })}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Двусторонняя
        </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex gap-3">
          <DoorSide
            label={item.two_sided ? 'Лицо' : 'Полотно'}
            url={item.front_image_url}
            onPick={() => onPickFromCatalog('front')}
            onUpload={(file) => onUploadDoorImage('front', file)}
          />
          {item.two_sided && (
            <DoorSide
              label="Оборот"
              url={item.back_image_url}
              onPick={() => onPickFromCatalog('back')}
              onUpload={(file) => onUploadDoorImage('back', file)}
            />
          )}
        </div>

        <div>
          <label className={labelCls}>Комплектация и описание по проёму</label>
          <AutoResizeTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
            placeholder="Уходит в блок «Комплектация и описание» на слайде проёма"
            minRows={3}
            className="block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
          />

          {/* Сопутствующие позиции заказа: к тексту описания менеджер добавляет
              сами позиции — короба, наличники, петли, — и они уходят на слайд
              проёма списком под описанием. */}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`${labelCls} mb-0`}>
                Позиции из заказа
                {item.addons.length > 0 ? ` (${item.addons.length})` : ''}
              </span>
              {orderAddons.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAddonsOpen((open) => !open)}
                  className="text-xs text-primary-600 hover:underline"
                >
                  {addonsOpen ? 'Свернуть' : 'Выбрать'}
                </button>
              )}
            </div>

            {orderAddons.length === 0 ? (
              <p className="text-xs text-gray-500">В заказе нет сопутствующих позиций</p>
            ) : (
              <>
                {item.addons.length === 0 ? (
                  <p className="text-xs text-gray-500">Не выбрано</p>
                ) : (
                  <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {item.addons.map((row) => (
                      <div key={row.addon} className="flex items-center gap-2 px-2 py-1.5">
                        <span className="flex-1 min-w-0 text-xs text-gray-700">
                          {addonLabel(row)}
                          {/* Общее количество по заказу — подсказка, из чего
                              менеджер раскладывает позицию по проёмам. */}
                          <span className="text-gray-400">
                            {' '}· в заказе {quantityText(row.order_quantity)}
                          </span>
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={quantities[row.addon] ?? ''}
                          onChange={(e) =>
                            setQuantities((prev) => ({ ...prev, [row.addon]: e.target.value }))
                          }
                          onMouseDown={() => (savingWithAddons.current = true)}
                          onBlur={() => saveQuantity(row.addon)}
                          aria-label="Количество в проёме"
                          className="w-16 shrink-0 rounded-lg border-gray-300 shadow-sm text-xs text-right focus:border-primary-500 focus:ring-primary-500"
                        />
                        <span className="text-xs text-gray-500 shrink-0">шт.</span>
                        <button
                          type="button"
                          onMouseDown={() => (savingWithAddons.current = true)}
                          onClick={() => toggleAddon(row.addon)}
                          className="text-gray-400 hover:text-red-600 leading-none shrink-0 px-1"
                          title="Убрать из комплектации"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {addonsOpen && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {orderAddons.map((addon) => (
                      <label
                        key={addon.id}
                        onMouseDown={() => (savingWithAddons.current = true)}
                        className="flex items-start gap-2 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAddons.has(addon.id)}
                          onChange={() => toggleAddon(addon.id)}
                          className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="min-w-0">
                          <span className="text-gray-400">{addon.kind_display}: </span>
                          {addonLabel(addon)}
                          <span className="text-gray-400">
                            {' '}· в заказе {quantityText(addon.quantity)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className={labelCls}>Дополнительные картинки</span>
              <button
                type="button"
                onClick={onAddExtraImage}
                className="text-xs text-primary-600 hover:underline"
              >
                + Добавить
              </button>
            </div>
            {item.attachments.length === 0 ? (
              <p className="text-xs text-gray-500">Нет</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {item.attachments.map((attachment) => (
                  <div key={attachment.id} className="relative">
                    {attachment.image_url && (
                      <img
                        src={attachment.image_url}
                        alt={attachment.caption}
                        className="h-16 w-16 object-cover rounded border border-gray-200"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteExtraImage(attachment.id)}
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
      </div>
    </div>
  )
}

export default PrettyOfferOpeningCard
