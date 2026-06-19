import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  children: ReactNode
  /** Доп. классы для нижнего контейнера с контентом */
  className?: string
}

/**
 * Оборачивает широкий контент (например, таблицу) и добавляет ВТОРУЮ
 * горизонтальную полосу прокрутки сверху, синхронизированную с нижней.
 * Верхняя полоса липкая (sticky) — остаётся видимой при прокрутке длинной
 * таблицы, поэтому не нужно мотать вниз, чтобы добраться до скролла.
 */
const HScrollSync = ({ children, className = '' }: Props) => {
  const topRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [contentWidth, setContentWidth] = useState(0)
  // какой из контейнеров инициировал скролл прямо сейчас (чтобы не зациклить синхронизацию)
  const syncingFrom = useRef<'top' | 'body' | null>(null)

  // Меряем ширину контента и пересчитываем при изменении размеров/состава
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const measure = () => setContentWidth(body.scrollWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(body)
    Array.from(body.children).forEach((c) => ro.observe(c as Element))
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [children])

  const handleScroll = useCallback((src: 'top' | 'body') => {
    if (syncingFrom.current && syncingFrom.current !== src) return
    syncingFrom.current = src
    const top = topRef.current
    const body = bodyRef.current
    if (top && body) {
      if (src === 'top') body.scrollLeft = top.scrollLeft
      else top.scrollLeft = body.scrollLeft
    }
    requestAnimationFrame(() => {
      syncingFrom.current = null
    })
  }, [])

  return (
    <>
      {/* Верхняя (липкая) полоса прокрутки — дублирует горизонтальный скролл таблицы */}
      <div
        ref={topRef}
        onScroll={() => handleScroll('top')}
        className="hscroll-top sticky top-0 z-10 overflow-x-auto overflow-y-hidden"
        style={{ height: 14 }}
      >
        <div style={{ width: contentWidth, height: 1 }} />
      </div>
      <div
        ref={bodyRef}
        onScroll={() => handleScroll('body')}
        className={`overflow-x-auto ${className}`}
      >
        {children}
      </div>
    </>
  )
}

export default HScrollSync
