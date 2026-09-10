import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { doorCatalogAPI } from '../../api/prettyOffer'
import { useBodyScrollLock } from '../../utils/useBodyScrollLock'
import {
  DoorColorRef,
  DoorImageRef,
  DoorModelRef,
  MATCH_PROBLEM_TEXT,
  MatchSide,
} from '../../types/prettyOffer'

interface Props {
  open: boolean
  title: string
  // Что распознал матчер: подсвечиваем проблему и предвыбираем найденное.
  hint?: MatchSide | null
  onPick: (image: DoorImageRef) => void
  onClose: () => void
}

const fieldCls =
  'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

/**
 * Окно уточнения модели и цвета по проёму (п.5 ТЗ).
 *
 * Менеджер идёт по цепочке модель → цвет → вариант полотна и подтверждает
 * выбор кнопкой. Клик по картинке только помечает вариант: на телефоне сетка
 * вариантов уходит под нижний край, и «клик = сохранение» там не читался —
 * казалось, что подтвердить выбор нечем.
 *
 * Если нужной картинки в каталоге нет, здесь же грузится своя (п.7) — она
 * попадает в каталог, и следующему заказу подберётся сама.
 */
const PrettyOfferDoorPicker = ({ open, title, hint, onPick, onClose }: Props) => {
  const [models, setModels] = useState<DoorModelRef[]>([])
  const [colors, setColors] = useState<DoorColorRef[]>([])
  const [images, setImages] = useState<DoorImageRef[]>([])
  const [modelId, setModelId] = useState<number | null>(null)
  const [colorId, setColorId] = useState<number | null>(null)
  const [selectedImage, setSelectedImage] = useState<DoorImageRef | null>(null)
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showUpload, setShowUpload] = useState(false)
  const [uploadVariant, setUploadVariant] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const variantsRef = useRef<HTMLDivElement>(null)

  useBodyScrollLock(open)

  // Открыли окно — грузим модели и предвыбираем то, что распознал матчер.
  useEffect(() => {
    if (!open) return
    setError(null)
    setShowUpload(false)
    setUploadFile(null)
    setSelectedImage(null)
    setUploadVariant(hint?.variant || '')
    setModelId(hint?.model_id ?? null)
    setColorId(hint?.color_id ?? null)
    setIsLoading(true)
    doorCatalogAPI
      .getModels()
      .then(setModels)
      .catch(() => setError('Не удалось загрузить каталог моделей'))
      .finally(() => setIsLoading(false))
  }, [open, hint])

  useEffect(() => {
    if (!open || !modelId) {
      setColors([])
      return
    }
    doorCatalogAPI
      .getColors(modelId)
      .then(setColors)
      .catch(() => setError('Не удалось загрузить цвета'))
  }, [open, modelId])

  useEffect(() => {
    if (!open || !modelId || !colorId) {
      setImages([])
      return
    }
    doorCatalogAPI
      .getImages(modelId, colorId)
      .then((loaded) => {
        setImages(loaded)
        // Вариант один — выбирать не из чего, помечаем сразу. Иначе берём тот,
        // код которого матчер вычитал из КП: цвет там обычно не назван, а
        // вариант («Nova 1ПГ») — почти всегда, и искать его среди сотни
        // картинок вручную не нужно.
        const hinted = hint?.variant
          ? loaded.find((image) => image.variant === hint.variant)
          : undefined
        setSelectedImage(loaded.length === 1 ? loaded[0] : hinted ?? null)
        // Подтягиваем варианты в видимую часть: на телефоне они оказываются
        // ниже списков модели и цвета, и их легко не заметить.
        variantsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      .catch(() => setError('Не удалось загрузить картинки'))
  }, [open, modelId, colorId, hint?.variant])

  const handleUpload = async () => {
    if (!modelId || !colorId || !uploadFile || isUploading) return
    setIsUploading(true)
    setError(null)
    try {
      const image = await doorCatalogAPI.uploadImage({
        doorModelId: modelId,
        colorId,
        variant: uploadVariant.trim(),
        file: uploadFile,
      })
      onPick(image)
    } catch (err: any) {
      setError(
        err?.response?.data?.variant?.[0] ||
          err?.response?.data?.detail ||
          'Не удалось загрузить картинку в каталог',
      )
    } finally {
      setIsUploading(false)
    }
  }

  if (!open) return null

  const visibleModels = search.trim()
    ? models.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase()))
    : models

  // Рендерим в body: если у любого предка окажется transform, filter или
  // backdrop-filter, он становится точкой отсчёта для position:fixed, и окно
  // начинает ездить вместе со страницей (на iOS это и происходило).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      style={{ height: '100dvh' }}
    >
      {/* dvh вместо vh: на телефоне vh считается без учёта панелей браузера,
          и нижняя часть окна вместе с кнопкой подтверждения уезжала под них. */}
      <div
        className="bg-white w-full h-full sm:h-auto sm:max-w-3xl sm:rounded-2xl shadow-xl sm:max-h-[92vh] flex flex-col"
        style={{ maxHeight: '100dvh' }}
      >
        {/* Кнопка подтверждения — в шапке, а не только внизу: низ экрана на
            телефоне занимают панели браузера, и подвал окна туда уезжал. */}
        <div className="flex items-center gap-3 p-3 border-b border-gray-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg shrink-0"
          >
            Отмена
          </button>
          <div className="flex-1 min-w-0 text-center">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
            {hint?.problems?.length ? (
              <p className="text-[11px] text-amber-700 truncate">
                {hint.problems.map((p) => MATCH_PROBLEM_TEXT[p] || p).join(' · ')}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => selectedImage && onPick(selectedImage)}
            disabled={!selectedImage}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            Выбрать
          </button>
        </div>

        {/* min-h-0 обязателен: без него flex-элемент не сжимается, и вместо
            прокрутки содержимое уезжает за нижний край окна. */}
        <div className="p-4 flex-1 min-h-0 overflow-y-auto space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 p-3">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Модель</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию"
                className={`${fieldCls} mb-2`}
              />
              <select
                className={fieldCls}
                size={6}
                value={modelId ?? ''}
                onChange={(e) => {
                  setModelId(e.target.value ? Number(e.target.value) : null)
                  setColorId(null)
                  setSelectedImage(null)
                }}
              >
                {/* Пустой пункт: иначе список показывает первую модель так,
                    будто она уже выбрана, хотя выбора ещё не было. */}
                <option value="">— выберите модель —</option>
                {visibleModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.series_name} / {model.name}
                  </option>
                ))}
              </select>
              {isLoading && <p className="text-xs text-gray-500 mt-1">Загружаем каталог…</p>}
            </div>

            <div>
              <label className={labelCls}>Цвет</label>
              {modelId ? (
                <select
                  className={fieldCls}
                  size={8}
                  value={colorId ?? ''}
                  onChange={(e) => {
                    setColorId(e.target.value ? Number(e.target.value) : null)
                    setSelectedImage(null)
                  }}
                >
                  <option value="">— выберите цвет —</option>
                  {colors.map((color) => (
                    <option key={color.id} value={color.id}>
                      {color.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-500 py-2">Сначала выберите модель</p>
              )}
              {modelId && colors.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">У этой модели нет цветов в каталоге</p>
              )}
            </div>
          </div>

          {modelId && colorId && (
            <div ref={variantsRef}>
              <div className="flex items-center justify-between mb-2">
                <span className={labelCls}>Вариант полотна</span>
                <button
                  type="button"
                  onClick={() => setShowUpload((v) => !v)}
                  className="text-sm text-primary-600 hover:underline"
                >
                  {showUpload ? 'Выбрать из каталога' : 'Нужной картинки нет — загрузить свою'}
                </button>
              </div>

              {showUpload ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
                  <p className="text-xs text-gray-600">
                    Картинка добавится в каталог для выбранных модели и цвета — в следующих
                    заказах она подберётся автоматически.
                  </p>
                  <div>
                    <label className={labelCls}>Вариант полотна (номер или артикул)</label>
                    <input
                      type="text"
                      value={uploadVariant}
                      onChange={(e) => setUploadVariant(e.target.value)}
                      placeholder="12, AC47, Torino TR 702"
                      className={fieldCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Файл</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!uploadFile || isUploading}
                    className="px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-60"
                  >
                    {isUploading ? 'Загружаем…' : 'Загрузить и выбрать'}
                  </button>
                </div>
              ) : images.length === 0 ? (
                <p className="text-sm text-gray-500 py-3">
                  Картинок для этой пары модель + цвет в каталоге нет.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {images.map((image) => {
                    const isSelected = selectedImage?.id === image.id
                    return (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setSelectedImage(image)}
                        className={`border rounded-lg p-1.5 text-left ${
                          isSelected
                            ? 'border-primary-600 ring-2 ring-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-primary-500 hover:shadow'
                        }`}
                      >
                        {image.image_url && (
                          <img
                            src={image.image_url}
                            alt={image.variant}
                            className="w-full h-28 object-contain"
                          />
                        )}
                        <span className="block text-[11px] text-gray-600 truncate mt-1">
                          {image.variant || '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {!showUpload && (
          <div
            className="px-4 py-2 border-t border-gray-200 shrink-0 text-xs text-gray-500 truncate"
            style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
          >
            {selectedImage
              ? `Выбрано: ${selectedImage.model_name} · ${selectedImage.color_name}${
                  selectedImage.variant ? ` · ${selectedImage.variant}` : ''
                }`
              : 'Выберите модель, цвет и вариант полотна'}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default PrettyOfferDoorPicker
