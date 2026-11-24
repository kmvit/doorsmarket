import { useState } from 'react'
import { measurementsAPI } from '../../api/measurements'

interface Props {
  /** Если задан — это уже созданный Measurement (перепланируем). Иначе используем requestId для создания. */
  measurementId?: number
  requestId?: number
  initialDate?: string | null
  initialEnd?: string | null
  contactName?: string
  onClose: () => void
  onScheduled: (id: number) => void
}

const ScheduleMeasurementModal = ({
  measurementId, requestId, initialDate, initialEnd, contactName,
  onClose, onScheduled,
}: Props) => {
  // Формат для datetime-local
  const toLocal = (iso: string | null | undefined) => {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const [date, setDate] = useState(toLocal(initialDate))
  const [isInterval, setIsInterval] = useState(Boolean(initialEnd))
  const [endTime, setEndTime] = useState(toLocal(initialEnd).slice(11))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!date) {
      setError('Укажите дату и время замера')
      return
    }
    const end = isInterval && endTime ? new Date(date.slice(0, 10) + 'T' + endTime) : null
    if (isInterval && (!end || end <= new Date(date))) {
      setError('Укажите время окончания позже начала интервала')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const isoDate = new Date(date).toISOString()
      if (measurementId) {
        const updated = await measurementsAPI.schedule(measurementId, isoDate, end?.toISOString() ?? null)
        onScheduled(updated.id)
      } else if (requestId) {
        const created = await measurementsAPI.createFromRequest(requestId, isoDate, end?.toISOString() ?? null)
        onScheduled(created.id)
      } else {
        setError('Не передан requestId или measurementId')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.measurement_end?.[0] || 'Не удалось сохранить дату')
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-3"
      >
        <h2 className="text-lg font-bold text-gray-900">
          {measurementId ? 'Перенести замер' : 'Назначить дату замера'}
        </h2>
        {contactName && (
          <p className="text-sm text-gray-600">Контактное лицо: <strong>{contactName}</strong></p>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isInterval} onChange={(e) => setIsInterval(e.target.checked)} />
          Интервал
        </label>
        <div>
          <label htmlFor="measurement-start" className="block text-sm font-medium text-gray-700 mb-1">
            {isInterval ? 'Дата и время начала' : 'Дата и время'}
          </label>
          <input
            id="measurement-start"
            type="datetime-local"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="block w-full rounded-lg border-gray-300 text-sm"
            autoFocus
          />
        </div>
        {isInterval && (
          <label className="block text-sm font-medium text-gray-700">
            Время окончания
            <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 block w-full rounded-lg border-gray-300 text-sm" />
          </label>
        )}
        <p className="text-xs text-gray-500">
          Контактному лицу будет отправлено SMS с датой и временем замера.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-1.5 text-sm text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
          >
            {isSaving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ScheduleMeasurementModal
