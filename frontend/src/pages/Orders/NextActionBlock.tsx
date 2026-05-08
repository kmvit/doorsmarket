import { useEffect, useState } from 'react'
import { remindersAPI } from '../../api/orders'
import { OrderActionReminder } from '../../types/orders'

interface Props {
  orderId: number
  canEdit: boolean
}

const NextActionBlock = ({ orderId, canEdit }: Props) => {
  const [reminders, setReminders] = useState<OrderActionReminder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [actionText, setActionText] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const load = async () => {
    setIsLoading(true)
    try {
      const data = await remindersAPI.list({ order: orderId })
      setReminders(data)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [orderId])

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!actionText.trim() || !dueAt) {
      setError('Заполните действие и срок')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await remindersAPI.create({ order: orderId, action_text: actionText.trim(), due_at: new Date(dueAt).toISOString() })
      setActionText('')
      setDueAt('')
      setShowForm(false)
      await load()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось создать напоминание')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDone = async (id: number) => {
    await remindersAPI.markDone(id)
    await load()
  }

  const handleReschedule = async (id: number) => {
    const newDate = window.prompt('Новый срок (YYYY-MM-DD HH:MM):')
    if (!newDate) return
    try {
      await remindersAPI.reschedule(id, new Date(newDate).toISOString())
      await load()
    } catch {
      alert('Неверный формат даты')
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Удалить напоминание?')) return
    await remindersAPI.delete(id)
    await load()
  }

  const active = reminders.filter((r) => !r.done)
  const done = reminders.filter((r) => r.done)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Следующее действие</h2>
        {canEdit && !showForm && (
          <button onClick={() => setShowForm(true)} className="text-sm text-primary-600 hover:underline">
            + Добавить
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-3 space-y-2 bg-gray-50 p-3 rounded-lg">
          {error && <div className="text-xs text-red-600">{error}</div>}
          <input
            type="text"
            value={actionText}
            onChange={(e) => setActionText(e.target.value)}
            placeholder="Что сделать..."
            className="w-full rounded border-gray-300 text-sm"
            required
          />
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full rounded border-gray-300 text-sm"
            required
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">
              Отмена
            </button>
            <button type="submit" disabled={isSaving} className="px-3 py-1 text-xs text-white bg-primary-600 hover:bg-primary-700 rounded disabled:opacity-50">
              {isSaving ? '...' : 'Сохранить'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400 py-2">Загрузка...</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">Активных напоминаний нет</p>
      ) : (
        <ul className="space-y-2">
          {active.map((r) => (
            <li key={r.id} className={`flex items-start gap-2 p-2 rounded-lg ${r.is_overdue ? 'bg-red-50' : 'bg-gray-50'}`}>
              <div className="flex-1">
                <div className={`text-sm font-medium ${r.is_overdue ? 'text-red-700' : 'text-gray-900'}`}>{r.action_text}</div>
                <div className={`text-xs ${r.is_overdue ? 'text-red-600' : 'text-gray-500'}`}>
                  {formatDateTime(r.due_at)} {r.is_overdue && '(просрочено)'}
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <button onClick={() => handleDone(r.id)} title="Выполнено" className="p-1 text-green-600 hover:bg-green-100 rounded">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button onClick={() => handleReschedule(r.id)} title="Перенести" className="p-1 text-blue-600 hover:bg-blue-100 rounded">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(r.id)} title="Удалить" className="p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 rounded">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Выполнено ({done.length})</summary>
          <ul className="mt-2 space-y-1">
            {done.map((r) => (
              <li key={r.id} className="text-xs text-gray-500 line-through">{r.action_text} — {formatDateTime(r.due_at)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export default NextActionBlock
