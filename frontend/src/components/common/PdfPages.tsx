import { useEffect, useRef, useState } from 'react'

interface Props {
  url: string
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.5

/**
 * PDF постранично на canvas через pdf.js — вместо <iframe>. На iPhone Safari
 * рисует PDF во фрейме системным слоем: видна только первая страница, без
 * прокрутки и масштаба. Canvas — обычная часть страницы: листается, увеличивается
 * кнопками, а шапка просмотрщика с крестиком всегда остаётся сверху.
 *
 * pdf.js 3.x — работает и на iOS 15–16 (4.x требует iOS 17+). Библиотека
 * подгружается только при первом открытии PDF.
 */
const PdfPages = ({ url }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(0)
  const [pageCount, setPageCount] = useState(0)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const docRef = useRef<any>(null)

  // Ширина области — по ней подбираем масштаб страниц («по ширине экрана»)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Загрузка документа
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setPageCount(0)
    setZoom(1)
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.js?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        // isEvalSupported: false — без eval (строгая политика браузера, iOS)
        const doc = await pdfjs.getDocument({ url, isEvalSupported: false }).promise
        if (cancelled) { doc.destroy(); return }
        docRef.current = doc
        setPageCount(doc.numPages)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      docRef.current?.destroy?.()
      docRef.current = null
    }
  }, [url])

  // Отрисовка страниц под текущую ширину и масштаб
  useEffect(() => {
    const doc = docRef.current
    const host = pagesRef.current
    if (!doc || !host || !width || !pageCount) return
    let cancelled = false
    const tasks: any[] = []
    host.innerHTML = ''
    ;(async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      for (let n = 1; n <= pageCount && !cancelled; n++) {
        const page = await doc.getPage(n)
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        const cssWidth = (width - 16) * zoom
        const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(cssWidth)}px`
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`
        canvas.className = 'block mx-auto mb-2 bg-white shadow'
        host.appendChild(canvas)
        const task = page.render({ canvasContext: canvas.getContext('2d')!, viewport })
        tasks.push(task)
        try { await task.promise } catch { /* отменили — перерисовываем заново */ }
      }
    })()
    return () => {
      cancelled = true
      tasks.forEach((t) => t.cancel?.())
    }
  }, [pageCount, width, zoom])

  return (
    <div className="relative w-full h-full flex flex-col">
      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-700 p-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading && <div className="text-center text-gray-200 text-sm py-8">Загружаем PDF…</div>}
        {error && (
          <div className="text-center text-gray-200 text-sm py-8 px-4">
            <p className="mb-2">Не удалось показать PDF</p>
            <a href={url} target="_blank" rel="noreferrer" className="text-primary-300 underline">Открыть файл</a>
          </div>
        )}
        <div ref={pagesRef} />
      </div>
      {pageCount > 0 && (
        <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg bg-gray-900/80 p-1 shadow-lg">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
            disabled={zoom <= MIN_ZOOM}
            className="h-9 w-9 rounded-md text-lg font-semibold text-white hover:bg-white/10 disabled:opacity-40"
            aria-label="Уменьшить"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-xs text-gray-200">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            disabled={zoom >= MAX_ZOOM}
            className="h-9 w-9 rounded-md text-lg font-semibold text-white hover:bg-white/10 disabled:opacity-40"
            aria-label="Увеличить"
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}

export default PdfPages
