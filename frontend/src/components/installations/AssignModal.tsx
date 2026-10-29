import { useEffect, useMemo, useState } from 'react'
import ModalPortal from './ModalPortal'
import { installationsAPI, apiErrorText } from '../../api/installations'
import { Installation, Installer, ScheduleVisit, formatPeriod } from '../../types/installations'
import { useBodyScrollLock } from '../../utils/useBodyScrollLock'
import MonthCalendar, { monthGridRange, monthStart } from './MonthCalendar'

interface Props {
  installation: Pick<Installation, 'id' | 'client_name' | 'address' | 'current_visit' | 'status'>
  /** Предвыбор из календаря монтажника: монтажник и даты */
  preset?: { installers?: number[]; dateFrom?: string; dateTo?: string }
  onClose: () => void
  onDone: (inst: Installation) => void
}

const dayInRange = (day: string, from: string, to: string) => day >= from && day <= to

/**
 * Назначение монтажа: монтажники и интервал дат. Календарь подсвечивает дни,
 * когда выбранные монтажники уже заняты, — на один день монтажей может быть
 * несколько, поэтому это подсказка, а не запрет.
 */
const AssignModal = ({ installation, preset, onClose, onDone }: Props) => {
  useBodyScrollLock(true)
  // Запланированный монтаж правим (тот же выезд); частично завершённому — новый выезд
  const visit = installation.status === 'planned' ? installation.current_visit : null
  const [installers, setInstallers] = useState<Installer[]>([])
  const [selected, setSelected] = useState<number[]>(
    preset?.installers || visit?.installers.map((u) => u.id) || [],
  )
  const [dateFrom, setDateFrom] = useState(preset?.dateFrom || visit?.date_from || '')
  const [dateTo, setDateTo] = useState(preset?.dateTo || visit?.date_to || '')
  const [month, setMonth] = useState(() => monthStart(dateFrom ? new Date(`${dateFrom}T00:00:00`) : new Date()))
  const [busy, setBusy] = useState<ScheduleVisit[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    installationsAPI.getInstallers().then(setInstallers).catch(() => setError('Не удалось загрузить монтажников'))
  }, [])

  // Занятость выбранных монтажников на видимый месяц
  const selectedKey = selected.join(',')
  useEffect(() => {
    if (!selected.length) { setBusy([]); return }
    let cancelled = false
    const [from, to] = monthGridRange(month)
    installationsAPI.getSchedule(from, to, selected)
      .then((rows) => { if (!cancelled) setBusy(rows.filter((v) => v.installation_id !== installation.id)) })
      .catch(() => { if (!cancelled) setBusy([]) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, month, installation.id])

  const busyOn = (day: string) => busy.filter((v) => dayInRange(day, v.date_from, v.date_to))

  const conflicts = useMemo(() => {
    if (!dateFrom) return []
    const to = dateTo || dateFrom
    return busy.filter((v) => v.date_from <= to && v.date_to >= dateFrom)
  }, [busy, dateFrom, dateTo])

  // Клик по дню: первый — начало, второй — конец интервала, дальше — заново
  const pickDay = (day: string) => {
    if (!dateFrom || (dateTo && dateTo !== dateFrom) || day < dateFrom) {
      setDateFrom(day)
      setDateTo(day)
    } else {
      setDateTo(day)
    }
  }

  const toggle = (id: number) =>
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const save = async () => {
    setError(null)
    if (!selected.length) { setError('Выберите монтажника'); return }
    if (!dateFrom) { setError('Выберите дату монтажа'); return }
    setIsSaving(true)
    try {
      onDone(await installationsAPI.assign(installation.id, selected, dateFrom, dateTo || dateFrom))
    } catch (err) {
      setError(apiErrorText(err, 'Не удалось назначить монтаж'))
    } finally {
      setIsSaving(false)
    }
  }

  const installerName = (id: number) => installers.find((u) => u.id === id)?.full_name || ''

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {visit ? 'Изменить назначение' : 'Назначить монтаж'} #{installation.id}
            </h2>
            <p className="text-sm text-gray-500">{installation.client_name}{installation.address && ` · ${installation.address}`}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 mb-1">Монтажники</p>
          {installers.length === 0 ? (
            <p className="text-sm text-gray-400">В городе нет монтажников</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {installers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                    selected.includes(u.id)
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-primary-400'
                  }`}
                >
                  {u.full_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-2 flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700">
            С
            <input type="date" value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); if (!dateTo || dateTo < e.target.value) setDateTo(e.target.value) }}
              className="block rounded-lg border-gray-300 shadow-sm text-sm" />
          </label>
          <label className="text-sm text-gray-700">
            По
            <input type="date" value={dateTo} min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="block rounded-lg border-gray-300 shadow-sm text-sm" />
          </label>
          <span className="text-xs text-gray-500 pb-2">или выберите дни в календаре</span>
        </div>

        <MonthCalendar
          compact
          month={month}
          onMonthChange={setMonth}
          onDayClick={pickDay}
          dayClassName={(day) => {
            if (dateFrom && dayInRange(day, dateFrom, dateTo || dateFrom)) return 'bg-primary-100 ring-1 ring-inset ring-primary-400'
            return busyOn(day).length ? 'bg-amber-100' : ''
          }}
          renderDay={(day) => {
            const n = busyOn(day).length
            return n ? <div className="text-[10px] text-center text-amber-800 leading-tight">занят{n > 1 ? ` ×${n}` : ''}</div> : null
          }}
        />
        <p className="text-xs text-gray-500 mt-1">
          <span className="inline-block w-3 h-3 bg-amber-100 align-middle mr-1 rounded-sm" />
          у выбранных монтажников уже есть монтаж
        </p>

        {conflicts.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium mb-1">В эти дни уже назначено:</p>
            <ul className="space-y-0.5">
              {conflicts.map((v) => (
                <li key={v.id}>
                  {formatPeriod(v.date_from, v.date_to)} · {v.installers.filter((u) => selected.includes(u.id)).map((u) => u.full_name || installerName(u.id)).join(', ')}
                  {' — '}{v.client_name}{v.address && `, ${v.address}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50">Отмена</button>
          <button type="button" onClick={save} disabled={isSaving}
            className="px-5 py-2 text-sm font-medium text-white rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50">
            {isSaving ? 'Сохранение…' : visit ? 'Сохранить' : 'Назначить'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

export default AssignModal
