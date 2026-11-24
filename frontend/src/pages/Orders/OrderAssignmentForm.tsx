import { useState } from 'react'
import { ordersAPI } from '../../api/orders'
import { salonsAPI } from '../../api/salons'
import { Order, OrderManager, Salon } from '../../types/orders'

export default function OrderAssignmentForm({ order, onSaved }: { order: Order; onSaved: () => Promise<void> }) {
  const currentSalon = typeof order.salon === 'number' ? order.salon : order.salon.id
  const [options, setOptions] = useState<{ salons: Salon[]; managers: OrderManager[] } | null>(null)
  const [salon, setSalon] = useState(currentSalon)
  const [manager, setManager] = useState(order.manager.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function open() {
    setBusy(true)
    setError('')
    try {
      const [salons, managers] = await Promise.all([salonsAPI.getAll(), ordersAPI.assignmentManagers()])
      setSalon(currentSalon)
      setManager(order.manager.id)
      setOptions({ salons, managers })
    } catch {
      setError('Не удалось загрузить салоны и менеджеров')
    } finally {
      setBusy(false)
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await ordersAPI.changeAssignment(order.id, {
        ...(salon !== currentSalon && { salon }),
        ...(manager !== order.manager.id && { manager }),
      })
      await onSaved()
      setOptions(null)
    } catch (err: any) {
      const data = err.response?.data
      setError(data?.detail || (data && Object.values(data).flat().join(' ')) || 'Не удалось сохранить изменения')
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'mt-1 block w-full rounded-lg border-gray-300 text-sm'
  return (
    <div className="mt-3 border-t pt-3 text-sm">
      {error && <p role="alert" className="mb-2 text-red-700">{error}</p>}
      {options ? (
        <form onSubmit={save} className="space-y-3">
          <label className="block">Салон
            <select className={inputClass} value={salon} onChange={e => setSalon(Number(e.target.value))}>
              {!options.salons.some(s => s.id === currentSalon) && (
                <option value={currentSalon}>{typeof order.salon === 'object' ? order.salon.name : order.salon_name}</option>
              )}
              {options.salons.map(s => <option key={s.id} value={s.id}>{s.name} ({s.city_name})</option>)}
            </select>
          </label>
          <label className="block">Менеджер
            <select className={inputClass} value={manager} onChange={e => setManager(Number(e.target.value))}>
              {!options.managers.some(m => m.id === order.manager.id) && (
                <option value={order.manager.id}>{order.manager.full_name}</option>
              )}
              {options.managers.map(m => <option key={m.id} value={m.id}>{m.full_name} ({m.username})</option>)}
            </select>
          </label>
          <div className="flex gap-3">
            <button disabled={busy || (salon === currentSalon && manager === order.manager.id)}
              className="rounded-lg bg-primary-600 px-3 py-2 text-white disabled:opacity-50">Сохранить</button>
            <button type="button" disabled={busy} onClick={() => { setOptions(null); setError('') }}>Отмена</button>
          </div>
        </form>
      ) : (
        <button type="button" disabled={busy} onClick={open} className="font-medium text-primary-600">
          {busy ? 'Загрузка…' : 'Изменить салон и менеджера'}
        </button>
      )}
    </div>
  )
}
