import { useEffect, useRef, useState } from 'react'

export interface MultiSelectOption<T extends string> {
  value: T
  label: string
}

interface MultiSelectProps<T extends string> {
  options: MultiSelectOption<T>[]
  value: T[]
  onChange: (value: T[]) => void
  // Надпись, когда ничего не выбрано (= фильтр не применён)
  placeholder?: string
  className?: string
}

/**
 * Выпадающий список с галочками — замена <select> там, где нужно выбрать
 * несколько значений сразу (фильтр по статусам в списках).
 * Пустой выбор означает «все».
 */
function MultiSelect<T extends string>({
  options, value, onChange, placeholder = 'Все', className = '',
}: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (v: T) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label)
  const caption = selectedLabels.length === 0
    ? placeholder
    : selectedLabels.length === 1 ? selectedLabels[0] : `Выбрано: ${selectedLabels.length}`

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={selectedLabels.join(', ')}
        className={`flex items-center justify-between gap-2 text-left bg-white border ${className}`}
      >
        <span className={`truncate ${selectedLabels.length ? 'text-gray-900' : 'text-gray-700'}`}>{caption}</span>
        <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 min-w-full w-max max-w-[90vw] max-h-80 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="block w-full px-3 py-1.5 text-left text-xs font-medium text-primary-600 hover:bg-gray-50"
            >
              Сбросить выбор
            </button>
          )}
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="whitespace-nowrap">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/** Значение фильтра из старого формата (одна строка) или нового (массив) → массив. */
export function toArray<T extends string>(v: T | T[] | '' | null | undefined): T[] {
  if (Array.isArray(v)) return v
  return v ? [v] : []
}

export default MultiSelect
