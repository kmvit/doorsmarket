import { useEffect, useMemo, useState } from 'react'
import ModalPortal from './ModalPortal'
import { installationsAPI, apiErrorText } from '../../api/installations'
import { Installation, Installer, ScheduleVisit, InstallationPeriod, installerPeriod, formatPeriod, INSTALLATION_STATUS_COLOR } from '../../types/installations'
import ScheduleVisitContent, { scheduleVisitTitle } from './ScheduleVisitContent'
import { useBodyScrollLock } from '../../utils/useBodyScrollLock'
import MonthCalendar, { monthGridRange, monthStart } from './MonthCalendar'
import { authAPI } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'

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
  const setUser = useAuthStore((state) => state.setUser)
  useBodyScrollLock(true)
  // Запланированный монтаж правим (тот же выезд); частично завершённому — новый выезд
  const visit = installation.status === 'planned' ? installation.current_visit : null
  const [installers, setInstallers] = useState<Installer[]>([])
  const [assignments, setAssignments] = useState(() => {
    if (visit) return visit.installers.map((u) => ({ installer_id: u.id, ...installerPeriod(visit, u.id) }))
    return (preset?.installers ?? []).map((id) => ({
      installer_id: id,
      date_from: preset?.dateFrom ?? '',
      date_to: preset?.dateTo ?? '',
    }))
  })
  const [activeId, setActiveId] = useState<number | null>(() => assignments[0]?.installer_id ?? null)
  const active = assignments.find((row) => row.installer_id === activeId)
  const dateFrom = active?.date_from ?? ''
  const dateTo = active?.date_to ?? ''
  const [month, setMonth] = useState(() => monthStart(dateFrom ? new Date(`${dateFrom}T00:00:00`) : new Date()))
  const [busy, setBusy] = useState<ScheduleVisit[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    installationsAPI.getInstallers().then(setInstallers).catch(() => setError('Не удалось загрузить монтажников'))
  }, [])

  // Занятость монтажника, для которого сейчас выбирают даты.
  useEffect(() => {
    setBusy([])
    if (activeId === null) return
    let cancelled = false
    const [from, to] = monthGridRange(month)
    installationsAPI.getSchedule(from, to, [activeId])
      .then((rows) => { if (!cancelled) setBusy(rows.filter((v) => v.installation_id !== installation.id)) })
      .catch(() => { if (!cancelled) setBusy([]) })
    return () => { cancelled = true }
  }, [activeId, month, installation.id])

  const busyOn = (day: string) => busy.filter((v) => dayInRange(day, v.date_from, v.date_to))

  const conflicts = useMemo(() => {
    if (!dateFrom) return []
    const to = dateTo || dateFrom
    return busy.filter((v) => v.date_from <= to && v.date_to >= dateFrom)
  }, [busy, dateFrom, dateTo])

  const updatePeriod = (period: InstallationPeriod) => {
    setAssignments((rows) => rows.map((row) => row.installer_id === activeId ? { ...row, ...period } : row))
  }

  const pickDay = (day: string) => {
    if (!active) return
    if (!dateFrom || (dateTo && dateTo !== dateFrom) || day < dateFrom) {
      updatePeriod({ date_from: day, date_to: day })
    } else {
      updatePeriod({ date_from: dateFrom, date_to: day })
    }
  }

  const editPeriod = (id: number, from: string) => {
    setActiveId(id)
    if (from) setMonth(monthStart(new Date(`${from}T00:00:00`)))
  }

  const toggle = (id: number) => {
    if (assignments.some((row) => row.installer_id === id)) {
      const remaining = assignments.filter((row) => row.installer_id !== id)
      setAssignments(remaining)
      if (activeId === id) {
        const next = remaining[0]
        if (next) editPeriod(next.installer_id, next.date_from)
        else setActiveId(null)
      }
    } else {
      setAssignments([...assignments, { installer_id: id, date_from: '', date_to: '' }])
      setActiveId(id)
    }
  }

  const save = async () => {
    setError(null)
    if (!assignments.length) { setError('Выберите монтажника'); return }
    if (assignments.some((row) => !row.date_from || (row.date_to && row.date_to < row.date_from))) {
      setError('Укажите корректные даты для каждого монтажника')
      return
    }
    setIsSaving(true)
    try {
      // Роль в интерфейсе может устареть, если токен заменился в другой вкладке.
      // Перед назначением сверяем права по текущему токену с сервером.
      const currentUser = await authAPI.getMe()
      setUser(currentUser)
      if (!['service_manager', 'admin'].includes(currentUser.role)) {
        setError(`Сервер видит текущий аккаунт «${currentUser.username}» с ролью «${currentUser.role}». Для назначения нужен сервис-менеджер.`)
        return
      }
      onDone(await installationsAPI.assign(installation.id, assignments.map((row) => ({
        ...row, date_to: row.date_to || row.date_from,
      }))))
    } catch (err) {
      setError(apiErrorText(err, 'Не удалось назначить монтаж'))
    } finally {
      setIsSaving(false)
    }
  }

  const installerName = (id: number) => installers.find((u) => u.id === id)?.full_name || visit?.installers.find((u) => u.id === id)?.full_name || ''

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
                    assignments.some((row) => row.installer_id === u.id)
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

        {assignments.length > 0 && (
          <div className="mb-3 space-y-1">
            {assignments.map((row) => (
              <button key={row.installer_id} type="button" aria-pressed={row.installer_id === activeId}
                onClick={() => editPeriod(row.installer_id, row.date_from)}
                className={`flex w-full flex-wrap justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                  row.installer_id === activeId ? 'border-primary-400 bg-primary-50' : 'border-gray-200'
                }`}>
                <span className="font-medium">{installerName(row.installer_id)}</span>
                <span>{row.date_from ? formatPeriod(row.date_from, row.date_to || row.date_from) : 'Выбрать даты'}</span>
              </button>
            ))}
          </div>
        )}

        {active && <>
        <div className="mb-2 flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700">
            С
            <input type="date" value={dateFrom}
              onChange={(e) => { updatePeriod({ date_from: e.target.value, date_to: dateTo < e.target.value ? e.target.value : dateTo }) }}
              className="block rounded-lg border-gray-300 shadow-sm text-sm" />
          </label>
          <label className="text-sm text-gray-700">
            По
            <input type="date" value={dateTo} min={dateFrom || undefined}
              onChange={(e) => updatePeriod({ date_from: dateFrom, date_to: e.target.value })}
              className="block rounded-lg border-gray-300 shadow-sm text-sm" />
          </label>
          <span className="text-xs text-gray-500 pb-2">или выберите дни в календаре</span>
        </div>

        <div className="overflow-x-auto">
        <div className="min-w-[640px]">
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
            return <div className="space-y-1 mt-0.5">{busyOn(day).map((v) => (
              <div key={v.id} title={scheduleVisitTitle(v)} className={`rounded-md px-1.5 py-1 text-[11px] leading-tight ${
                v.kind === 'complaint'
                  ? 'bg-rose-100 text-rose-900 border-l-2 border-rose-500'
                  : INSTALLATION_STATUS_COLOR[v.status as keyof typeof INSTALLATION_STATUS_COLOR]
              }`}>
                <ScheduleVisitContent visit={v} />
              </div>
            ))}</div>
          }}
        />
        </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          <span className="inline-block w-3 h-3 bg-amber-100 align-middle mr-1 rounded-sm" />
          у этого монтажника уже есть монтаж
        </p>

        {conflicts.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium mb-1">В эти дни уже назначено:</p>
            <ul className="space-y-0.5">
              {conflicts.map((v) => (
                <li key={v.id}>
                  {formatPeriod(v.date_from, v.date_to)} · {installerName(active.installer_id)}
                  {' — '}{v.client_name}{v.address && `, ${v.address}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        </>}

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
