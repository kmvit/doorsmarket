import { useState } from 'react'
import { installationsAPI, apiErrorText } from '../../api/installations'
import { Installation } from '../../types/installations'

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * «Отправить акт на оплату»: монтаж завершён (или частично), есть подписанный
 * акт выезда. Письмо бухгалтеру города — акт во вложении, смета в теле.
 */
const PaymentBlock = ({ inst, onChanged }: { inst: Installation; onChanged: (inst: Installation) => void }) => {
  const payment = inst.payment
  const [open, setOpen] = useState(false)
  const [estimate, setEstimate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!payment) return null

  const send = async () => {
    if (!estimate.trim()) { setError('Распишите смету работ'); return }
    setBusy(true)
    setError(null)
    try {
      onChanged(await installationsAPI.action(inst.id, 'send_to_payment', { estimate: estimate.trim() }))
      setOpen(false)
      setEstimate('')
    } catch (err) {
      setError(apiErrorText(err, 'Не удалось отправить акт на оплату'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Акт на оплату</h2>
          <p className="text-xs text-gray-500 mt-1">
            {payment.sent_at
              ? `Отправлен ${formatDateTime(payment.sent_at)}${payment.sent_by_name ? ` · ${payment.sent_by_name}` : ''}`
              : payment.available ? `Бухгалтеру: ${payment.accountant_email || 'почта не указана'}`
                : 'Нет подписанного акта — без него на оплату не отправить.'}
          </p>
        </div>
        {payment.available && !open && (
          <button type="button" onClick={() => setOpen(true)}
            className="px-3 py-2 text-sm rounded-lg border border-primary-600 bg-primary-600 text-white hover:bg-primary-700">
            {payment.sent_at ? 'Отправить повторно' : 'Отправить акт на оплату'}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3">
          <label className="block text-sm text-gray-700 mb-1">Смета работ <span className="text-red-500">*</span></label>
          <textarea rows={4} value={estimate} onChange={(e) => setEstimate(e.target.value)}
            placeholder="Работы, количество, стоимость"
            className="w-full rounded-lg border-gray-300 shadow-sm text-sm" />
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50">Отмена</button>
            <button type="button" onClick={send} disabled={busy}
              className="px-3 py-2 text-sm rounded-lg border border-primary-600 bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
              {busy ? 'Отправка…' : 'Отправить'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PaymentBlock
