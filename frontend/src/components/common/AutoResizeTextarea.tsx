import { useEffect, useRef, TextareaHTMLAttributes } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Минимальная высота в строках (по умолчанию 2) */
  minRows?: number
}

/**
 * Textarea, которая автоматически растёт под объём текста, чтобы
 * содержимое всегда было видно целиком (без обрезки и внутреннего скролла).
 */
const AutoResizeTextarea = ({ value, minRows = 2, className = '', style, ...rest }: Props) => {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Подгоняем высоту при изменении значения (в т.ч. при первичной отрисовке и
  // после программного обновления value).
  useEffect(() => {
    resize()
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      onInput={resize}
      className={`resize-none overflow-hidden leading-snug ${className}`}
      style={style}
      {...rest}
    />
  )
}

export default AutoResizeTextarea
