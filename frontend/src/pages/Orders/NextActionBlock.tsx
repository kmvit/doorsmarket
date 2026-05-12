import { useEffect, useState } from 'react'
import { remindersAPI } from '../../api/orders'
import { OrderActionReminder, OrderStatus, ORDER_STATUS_DISPLAY } from '../../types/orders'

interface Props {
  orderId: number
  canEdit: boolean
  onStatusChanged?: (newStatus: OrderStatus) => void
}

// Список действий-переходов, доступных при закрытии напоминания
const COMPLETE_ACTIONS: { label: string; status?: OrderStatus; promptNext?: boolean }[] = [
  { label: 'Сделано', promptNext: true },
  { label: 'Заказ оплачен', status: 'paid', promptNext: true },
  { label: 'В производстве', status: 'in_production', promptNext: true },
  { label: 'На складе', status: 'on_warehouse', promptNext: true },
  { label: 'Отгружен', status: 'shipped', promptNext: true },
  { label: 'Выполнен', status: 'completed' },
  { label: 'Не актуален', status: 'cancelled' },
]

const NextActionBlock = ({ orderId, canEdit, onStatusChanged }: Props) => {
  const [reminders, setReminders] = useState<OrderActionReminder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [actionText, setActionText] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [nextPrompt, setNextPrompt] = useState<{ reminderId: number; status?: OrderStatus } | null>(null)
  const [promptText, setPromptText] = useState('')
  const [promptDueAt, setPromptDueAt] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [editDueAt, setEditDueAt] = useState('')

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

  // Закрытие напоминания с опциональной сменой статуса; если promptNext — открыть форму нового
  const handleComplete = async (
    reminderId: number,
    action: { label: string; status?: OrderStatus; promptNext?: boolean },
  ) => {
    setOpenMenuId(null)
    if (action.promptNext) {
      setNextPrompt({ reminderId, status: action.status })
      setPromptText('')
      setPromptDueAt('')
      return
    }
    // Сразу закрываем без следующего действия
    try {
      await remindersAPI.markDone(reminderId, action.status ? { new_status: action.status } : undefined)
      if (action.status && onStatusChanged) onStatusChanged(action.status)
      await load()
    } catch {
      alert('Не удалось обновить напоминание')
    }
  }

  const handlePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nextPrompt) return
    if (!promptText.trim() || !promptDueAt) {
      alert('Заполните следующее действие и его срок')
      return
    }
    try {
      await remindersAPI.markDone(nextPrompt.reminderId, {
        new_status: nextPrompt.status,
        next_action_text: promptText.trim(),
        next_action_due_at: new Date(promptDueAt).toISOString(),
      })
      if (nextPrompt.status && onStatusChanged) onStatusChanged(nextPrompt.status)
      setNextPrompt(null)
      setPromptText('')
      setPromptDueAt('')
      await load()
    } catch {
      alert('Не удалось обновить напоминание')
    }
  }

  const startEdit = (r: OrderActionReminder) => {
    setEditingId(r.id)
    setEditText(r.action_text)
    // Конвертируем ISO в формат datetime-local (yyyy-MM-ddTHH:mm)
    const d = new Date(r.due_at)
    const pad = (n: number) => String(n).padStart(2, '0')
    const localValue = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    setEditDueAt(localValue)
    setOpenMenuId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
    setEditDueAt('')
  }

  const handleSaveEdit = async (id: number) => {
    if (!editText.trim() || !editDueAt) {
      alert('Заполните действие и срок')
      return
    }
    try {
      await remindersAPI.update(id, {
        order: orderId,
        action_text: editText.trim(),
        due_at: new Date(editDueAt).toISOString(),
      })
      cancelEdit()
      await load()
    } catch {
      alert('Не удалось сохранить изменения')
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
            <li key={r.id} className={`p-2 rounded-lg ${editingId === r.id ? 'bg-blue-50' : r.is_overdue ? 'bg-red-50' : 'bg-gray-50'}`}>
              {editingId === r.id ? (
                /* Режим редактирования */
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full rounded border-gray-300 text-sm"
                    placeholder="Что сделать..."
                    autoFocus
                  />
                  <input
                    type="datetime-local"
                    value={editDueAt}
                    onChange={(e) => setEditDueAt(e.target.value)}
                    className="w-full rounded border-gray-300 text-sm"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={cancelEdit} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">
                      Отмена
                    </button>
                    <button onClick={() => handleSaveEdit(r.id)} className="px-3 py-1 text-xs text-white bg-primary-600 hover:bg-primary-700 rounded">
                      Сохранить
                    </button>
                  </div>
                </div>
              ) : (
                /* Обычное отображение */
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${r.is_overdue ? 'text-red-700' : 'text-gray-900'} break-words`}>{r.action_text}</div>
                    <div className={`text-xs ${r.is_overdue ? 'text-red-600' : 'text-gray-500'}`}>
                      {formatDateTime(r.due_at)} {r.is_overdue && '· просрочено'}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                          className="px-2 py-1 text-xs text-white bg-green-600 hover:bg-green-700 rounded"
                        >
                          ✓ Закрыть
                        </button>
                        {openMenuId === r.id && (
                          <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px]">
                            {COMPLETE_ACTIONS.map((act) => (
                              <button
                                key={act.label}
                                onClick={() => handleComplete(r.id, act)}
                                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
                              >
                                {act.label}
                                {act.status && (
                                  <span className="ml-1 text-xs text-gray-400">→ {ORDER_STATUS_DISPLAY[act.status]}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => startEdit(r)} title="Редактировать" className="p-1 text-blue-600 hover:bg-blue-100 rounded">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(r.id)} title="Удалить" className="p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 rounded">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
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

      {/* Модалка «Следующее действие» после закрытия */}
      {nextPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setNextPrompt(null)}>
          <form
            onSubmit={handlePromptSubmit}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-3"
          >
            <h3 className="text-lg font-bold text-gray-900">Укажите следующее действие</h3>
            {nextPrompt.status && (
              <p className="text-sm text-gray-600">
                Статус заказа будет изменён на <strong>{ORDER_STATUS_DISPLAY[nextPrompt.status]}</strong>.
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Что сделать *</label>
              <input
                type="text"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Например: Поставить дату запуска в производство"
                className="block w-full rounded-lg border-gray-300 text-sm"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Когда *</label>
              <input
                type="datetime-local"
                value={promptDueAt}
                onChange={(e) => setPromptDueAt(e.target.value)}
                className="block w-full rounded-lg border-gray-300 text-sm"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNextPrompt(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Отмена
              </button>
              <button type="submit" className="px-4 py-1.5 text-sm text-white bg-primary-600 hover:bg-primary-700 rounded-lg">
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default NextActionBlock
