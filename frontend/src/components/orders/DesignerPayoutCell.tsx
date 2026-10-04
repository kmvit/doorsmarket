import { useState } from 'react'
import { ordersAPI } from '../../api/orders'

interface Props {
  orderId: number
  // Выплата сохранена — строку можно убирать из папки
  onPaid: (orderId: number) => void
}

/**
 * Кнопка «Выплачен» в папке «Выплаты дизайнерам»: по нажатию — поле суммы
 * и «Сохранить». Клики не всплывают к строке таблицы.
 */
const DesignerPayoutCell = ({ orderId, onPaid }: Props) => {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const save = async () => {
    const normalized = amount.replace(/\s/g, '').replace(',', '.')
    if (!normalized || !(Number(normalized) > 0)) {
      setError('Введите сумму')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await ordersAPI.markDesignerPaid(orderId, normalized)
      onPaid(orderId)
    } catch (err: any) {
      const data = err.response?.data
      setError(
        data?.amount?.[0] || data?.detail
          || (err.response ? 'Не удалось сохранить' : 'Нет связи — выплату можно отметить только онлайн'),
      )
      setIsSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg whitespace-nowrap"
      >
        Выплачен
      </button>
    )
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="min-w-[220px]">
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d\s.,]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save() }
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder="Введите сумму"
            className="w-36 rounded-lg border-gray-300 shadow-sm text-sm pr-6 focus:border-primary-500 focus:ring-primary-500"
            autoFocus
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">₽</span>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
        >
          {isSaving ? '…' : 'Сохранить'}
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setError(null) }}
          className="text-sm text-gray-500 hover:text-gray-700"
          title="Отмена"
        >
          ✕
        </button>
      </div>
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </div>
  )
}

export default DesignerPayoutCell
