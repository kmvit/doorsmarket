/**
 * Кликабельная ссылка для звонка по номеру телефона.
 * При клике открывает приложение для звонка (tel:).
 */
interface PhoneLinkProps {
  phone: string
  className?: string
  /** Останавливать всплытие события (для использования внутри кликабельных строк таблицы) */
  stopPropagation?: boolean
}

function toTelHref(phone: string): string {
  if (!phone || !phone.trim()) return '#'
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('8') && cleaned.length >= 10) {
    return `tel:+7${cleaned.slice(1)}`
  }
  if (cleaned.startsWith('7') && cleaned.length >= 11) {
    return `tel:+${cleaned}`
  }
  if (cleaned.length >= 10) {
    return `tel:+7${cleaned}`
  }
  return `tel:${phone.replace(/[\s()-]/g, '')}`
}

export default function PhoneLink({ phone, className = '', stopPropagation }: PhoneLinkProps) {
  if (!phone || !phone.trim()) {
    return <span className={className}>—</span>
  }

  const href = toTelHref(phone)

  return (
    <a
      href={href}
      className={`text-blue-600 hover:text-blue-800 hover:underline ${className}`}
      onClick={(e) => stopPropagation && e.stopPropagation()}
    >
      {phone}
    </a>
  )
}
