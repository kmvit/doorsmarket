import { useEffect, useRef, useState } from 'react'
import AutoResizeTextarea from '../../components/common/AutoResizeTextarea'
import { PrettyOfferItem } from '../../types/prettyOffer'

interface Props {
  item: PrettyOfferItem
  onPatch: (patch: Partial<PrettyOfferItem>) => Promise<void>
  onUploadDoorImage: (side: 'front' | 'back', file: File) => Promise<void>
  onPickFromCatalog: (side: 'front' | 'back') => void
  onAddExtraImage: () => void
  onDeleteExtraImage: (attachmentId: number) => void
}

const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

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
  onPatch,
  onUploadDoorImage,
  onPickFromCatalog,
  onAddExtraImage,
  onDeleteExtraImage,
}: Props) => {
  const [description, setDescription] = useState(item.description)

  // Описание могли поменять снаружи (пересборка КП) — подхватываем.
  useEffect(() => setDescription(item.description), [item.description])

  const size = [item.door_height, item.door_width].filter(Boolean).join(' × ')

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
          <label className={labelCls}>Описание по проёму</label>
          <AutoResizeTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== item.description) onPatch({ description })
            }}
            placeholder="Выводится в КП рядом с моделью"
            minRows={3}
            className="block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
          />

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
