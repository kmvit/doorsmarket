import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { prettyOfferAPI } from '../../api/prettyOffer'
import { useBodyScrollLock } from '../../utils/useBodyScrollLock'
import { SourceImage } from '../../types/prettyOffer'

interface Props {
  open: boolean
  orderId: number
  // Куда добавляем: к проёму или ко всему КП.
  title: string
  onAdd: (payload: { file?: File; source?: SourceImage; caption?: string }) => Promise<void>
  onClose: () => void
}

const fieldCls =
  'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'

/**
 * Выбор дополнительной картинки для КП (п.11 ТЗ): либо копия того, что уже
 * вложено в заказ или замер, либо файл со стороны.
 */
const PrettyOfferImagePicker = ({ open, orderId, title, onAdd, onClose }: Props) => {
  const [sources, setSources] = useState<SourceImage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [caption, setCaption] = useState('')

  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    setError(null)
    setCaption('')
    setIsLoading(true)
    prettyOfferAPI
      .getSourceImages(orderId)
      .then(setSources)
      .catch(() => setError('Не удалось загрузить вложения заказа'))
      .finally(() => setIsLoading(false))
  }, [open, orderId])

  const handle = async (payload: { file?: File; source?: SourceImage }) => {
    if (isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      await onAdd({ ...payload, caption: caption.trim() })
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Не удалось добавить картинку')
    } finally {
      setIsSaving(false)
    }
  }

  if (!open) return null

  // В body: transform у любого предка ломает position:fixed, и окно начинает
  // ездить вместе со страницей.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      style={{ height: '100dvh' }}
    >
      {/* dvh вместо vh: на телефоне vh считается без учёта панелей браузера,
          и низ окна уезжал под них. */}
      <div
        className="bg-white w-full h-full sm:h-auto sm:max-w-2xl sm:rounded-2xl shadow-xl sm:max-h-[92vh] flex flex-col"
        style={{ maxHeight: '100dvh' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {/* min-h-0 — иначе flex-элемент не сжимается и содержимое уезжает за край. */}
        <div
          className="p-4 flex-1 min-h-0 overflow-y-auto space-y-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 p-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Подпись (необязательно)
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Схема открывания, чертёж…"
              className={fieldCls}
            />
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Загрузить свой файл</p>
            <input
              type="file"
              accept="image/*"
              disabled={isSaving}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handle({ file })
              }}
              className="block w-full text-sm"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">
              Или взять из вложений заказа и замера
            </p>
            {isLoading ? (
              <p className="text-sm text-gray-500">Загружаем…</p>
            ) : sources.length === 0 ? (
              <p className="text-sm text-gray-500">
                В заказе и замере нет картинок, которые можно вставить.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {sources.map((source) => (
                  <button
                    key={`${source.kind}-${source.id}`}
                    type="button"
                    disabled={isSaving}
                    onClick={() => handle({ source })}
                    className="border border-gray-200 rounded-lg p-1.5 hover:border-primary-500 hover:shadow text-left disabled:opacity-60"
                  >
                    <img
                      src={source.url}
                      alt={source.name}
                      className="w-full h-24 object-contain"
                    />
                    <span className="block text-[11px] text-gray-500 truncate mt-1">
                      {source.source}
                    </span>
                    <span className="block text-[11px] text-gray-700 truncate">
                      {source.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default PrettyOfferImagePicker
