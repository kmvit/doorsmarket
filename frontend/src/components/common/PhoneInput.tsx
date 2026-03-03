import { InputHTMLAttributes } from 'react'

/**
 * Нормализует ввод к формату +7 (XXX) XXX-XX-XX
 * Возвращает { display: для отображения, value: +7XXXXXXXXXX для формы }
 */
export function formatPhoneInput(raw: string): { display: string; value: string } {
  const digits = raw.replace(/\D/g, '')
  let num = digits
  if (num.startsWith('8')) {
    num = '7' + num.slice(1)
  } else if (!num.startsWith('7')) {
    num = '7' + num
  }
  num = num.slice(0, 11) // максимум 7 + 10 цифр
  const tenDigits = num.slice(1, 11)
  if (tenDigits.length === 0) {
    return { display: '+7', value: '' }
  }
  const formatted = `+7 (${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6, 8)}-${tenDigits.slice(8, 10)}`
  const value = tenDigits.length >= 10 ? `+7${tenDigits}` : `+7${tenDigits}`
  return { display: formatted, value }
}

/**
 * Нормализует произвольную строку телефона к +7XXXXXXXXXX
 */
export function normalizePhone(phone: string): string {
  const { value } = formatPhoneInput(phone || '')
  return value
}

interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: string
  onChange?: (value: string) => void
  error?: string
}

const PhoneInput = ({ value, onChange, error, className = '', ...props }: PhoneInputProps) => {
  const { display } = formatPhoneInput(value ?? '')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value: newValue } = formatPhoneInput(e.target.value)
    onChange?.(newValue)
  }

  return (
    <div className="w-full">
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={display}
        onChange={handleChange}
        maxLength={18}
        className={`w-full px-4 py-3 border ${
          error ? 'border-red-500' : 'border-gray-300'
        } rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white ${className}`}
        placeholder="+7 (___) ___-__-__"
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

export default PhoneInput
