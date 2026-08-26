import { useEffect, useRef, useState } from 'react'

export interface FloatingFile {
  url: string
  name: string
}

interface Props {
  file: FloatingFile | null
  onClose: () => void
  /** Текущая высота панели в vh — родитель добавляет столько же отступа снизу,
      чтобы окно не перекрывало последние поля формы. */
  onHeightChange?: (heightVh: number) => void
}

// Высота свёрнутой панели по умолчанию — примерно треть экрана
const DEFAULT_HEIGHT_VH = 35
const MIN_HEIGHT_VH = 18
const MAX_HEIGHT_VH = 92
const MAX_SCALE = 6

const isImage = (name: string, url: string): boolean => {
  const v = `${name} ${url}`.toLowerCase().split('?')[0]
  return /\.(jpg|jpeg|jfif|jpe|png|gif|webp|bmp|heic|heif|avif|svg)/.test(v)
}

const isPdf = (name: string, url: string): boolean =>
  /\.pdf(\?|$)/i.test(name) || /\.pdf(\?|$)/i.test(url)

/**
 * Просмотр файла поверх формы, не закрывая её: панель снизу примерно на треть
 * экрана, разворачивается на весь экран, картинка масштабируется щипком и
 * двигается пальцем. Крестик закрывает — повторное нажатие на файл открывает снова.
 *
 * Сделано отдельно от FileViewer: тот показывает файл модально и блокирует работу
 * с формой, а замерщику нужно видеть план и одновременно вводить размеры.
 */
const FloatingFileViewer = ({ file, onClose, onHeightChange }: Props) => {
  const [expanded, setExpanded] = useState(false)
  const [heightVh, setHeightVh] = useState(DEFAULT_HEIGHT_VH)
  // Масштаб и сдвиг картинки (щипок + перетаскивание)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // Жесты: расстояние между пальцами при старте щипка и точка старта перетаскивания
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null)
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const resizeRef = useRef<{ y: number; height: number } | null>(null)

  // Новый файл — показываем его целиком, без унаследованного масштаба
  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [file?.url])

  useEffect(() => {
    onHeightChange?.(file ? (expanded ? 100 : heightVh) : 0)
  }, [file, expanded, heightVh, onHeightChange])

  if (!file) return null

  const image = isImage(file.name, file.url)
  const pdf = isPdf(file.name, file.url)

  const touchDistance = (touches: React.TouchList): number => {
    const [a, b] = [touches[0], touches[1]]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!image) return
    if (e.touches.length === 2) {
      pinchRef.current = { dist: touchDistance(e.touches), scale }
      panRef.current = null
    } else if (e.touches.length === 1 && scale > 1) {
      // Двигать имеет смысл только увеличенную картинку
      panRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: offset.x, oy: offset.y }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!image) return
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const next = pinchRef.current.scale * (touchDistance(e.touches) / pinchRef.current.dist)
      setScale(Math.min(MAX_SCALE, Math.max(1, next)))
    } else if (e.touches.length === 1 && panRef.current) {
      e.preventDefault()
      const p = panRef.current
      setOffset({ x: p.ox + (e.touches[0].clientX - p.x), y: p.oy + (e.touches[0].clientY - p.y) })
    }
  }

  const handleTouchEnd = () => {
    pinchRef.current = null
    panRef.current = null
    // Вернулись к исходному масштабу — центрируем картинку обратно
    if (scale <= 1) setOffset({ x: 0, y: 0 })
  }

  // Перетаскивание шапки меняет высоту панели (свёрнутый режим)
  const handleResizeStart = (e: React.TouchEvent) => {
    if (expanded) return
    resizeRef.current = { y: e.touches[0].clientY, height: heightVh }
  }

  const handleResizeMove = (e: React.TouchEvent) => {
    if (!resizeRef.current) return
    const deltaVh = ((resizeRef.current.y - e.touches[0].clientY) / window.innerHeight) * 100
    setHeightVh(Math.min(MAX_HEIGHT_VH, Math.max(MIN_HEIGHT_VH, resizeRef.current.height + deltaVh)))
  }

  const handleResizeEnd = () => {
    resizeRef.current = null
  }

  const resetZoom = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div
      className={
        expanded
          ? 'fixed inset-0 z-50 flex flex-col bg-gray-900'
          : 'fixed inset-x-0 bottom-0 z-50 flex flex-col bg-gray-900 rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.35)]'
      }
      style={expanded ? undefined : { height: `${heightVh}vh` }}
    >
      {/* Шапка: имя файла и управление. В свёрнутом виде её можно тянуть, меняя высоту */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 select-none"
        onTouchStart={handleResizeStart}
        onTouchMove={handleResizeMove}
        onTouchEnd={handleResizeEnd}
      >
        {!expanded && (
          <div className="absolute left-1/2 -translate-x-1/2 top-1 h-1 w-10 rounded-full bg-gray-600" />
        )}
        <span className="text-sm text-gray-300 truncate">{file.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {image && scale > 1 && (
            <button
              type="button"
              onClick={resetZoom}
              className="px-2 py-1 text-xs font-medium text-gray-200 bg-white/10 hover:bg-white/20 rounded-lg"
              title="Сбросить масштаб"
            >
              1:1
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="px-2 py-1 text-xs font-medium text-gray-200 bg-white/10 hover:bg-white/20 rounded-lg"
            title={expanded ? 'Свернуть вниз' : 'Развернуть на весь экран'}
          >
            {expanded ? '⤡ Свернуть' : '⤢ Развернуть'}
          </button>
          <a
            href={file.url}
            download={file.name}
            target="_blank"
            rel="noreferrer"
            className="px-2 py-1 text-xs font-medium text-gray-200 bg-white/10 hover:bg-white/20 rounded-lg"
            title="Скачать"
          >
            ↓
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-medium text-gray-800 bg-white hover:bg-gray-100 rounded-lg"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Содержимое */}
      <div
        className="flex-1 overflow-hidden flex items-center justify-center bg-black/40"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {image ? (
          <img
            src={file.url}
            alt={file.name}
            draggable={false}
            className="max-h-full max-w-full object-contain"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: pinchRef.current || panRef.current ? 'none' : 'transform 120ms ease-out',
              touchAction: 'none',
            }}
          />
        ) : pdf ? (
          <iframe src={file.url} title={file.name} className="w-full h-full bg-white" />
        ) : (
          <div className="text-center text-gray-300 text-sm px-4">
            <p className="mb-2">Просмотр этого типа файла недоступен</p>
            <a href={file.url} target="_blank" rel="noreferrer" className="text-primary-300 underline">
              Открыть файл
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default FloatingFileViewer
