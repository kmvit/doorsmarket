import { isQueuedError } from '../../services/sync'
import { useState } from 'react'
import ModalPortal from '../installations/ModalPortal'
import { OrderRefusal } from '../../types/orders'
import OrderRefusalFields, { refusalComplete } from './OrderRefusalFields'

export default function OrderRefusalDialog({ onSave, onClose }: {
  onSave: (value: OrderRefusal) => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState<OrderRefusal>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <ModalPortal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <form role="dialog" aria-modal="true" aria-label="Заказ не актуален" className="w-full max-w-md space-y-4 overflow-y-auto max-h-full rounded-xl bg-white p-5" onSubmit={async e => {
      e.preventDefault()
      if (busy || !refusalComplete(value)) return
      setBusy(true)
      try { await onSave(value); onClose() }
      catch (err: any) {
        if (isQueuedError(err)) {
          window.alert('Нет связи. Статус и причина отказа сохранены для отправки при подключении.')
          onClose()
          return
        }
        const data = err.response?.data
        setError(data && typeof data === 'object' ? Object.values(data).flat().join(' ') : err.message || 'Не удалось сохранить причину')
      } finally { setBusy(false) }
    }}>
      <h3 className="text-lg font-semibold">Заказ не актуален</h3>
      <OrderRefusalFields value={value} onChange={setValue} />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" disabled={busy} onClick={onClose}>Отмена</button>
        <button disabled={busy || !refusalComplete(value)} className="rounded-lg bg-primary-600 px-4 py-2 text-white disabled:opacity-50">Сохранить</button>
      </div>
    </form>
  </div></ModalPortal>
}
