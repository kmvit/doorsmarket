import BusyInstallers from '../../components/installations/BusyInstallers'
import { canManageService } from '../../types/auth'
import { complaintsAPI } from '../../api/complaints'
import type { Complaint } from '../../types/complaints'
import { useEffect, useMemo, useState } from 'react'
import ModalPortal from '../../components/installations/ModalPortal'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { apiErrorText, installationsAPI } from '../../api/installations'
import {
  ComplaintInstallationRow, Installation, Installer, ScheduleVisit, INSTALLATION_STATUS_COLOR, canEditSchedule, formatPeriod, isoDate, pickPeriodDay,
} from '../../types/installations'
import MonthCalendar, { monthGridRange, monthStart } from '../../components/installations/MonthCalendar'
import AssignModal from '../../components/installations/AssignModal'
import ScheduleVisitContent, { scheduleVisitTitle } from '../../components/installations/ScheduleVisitContent'
import InstallationsTabs from './InstallationsTabs'
import { useBodyScrollLock } from '../../utils/useBodyScrollLock'
import OfflinePrefetchButton from '../../components/common/OfflinePrefetchButton'

/** Выбор незапланированного монтажа на выбранные в календаре даты */
const PickInstallationModal = ({ onClose, onPick, onComplaint }: {
  onClose: () => void
  onPick: (inst: Installation) => void
  onComplaint?: (complaint: Complaint) => void
}) => {
  useBodyScrollLock(true)
  const [items, setItems] = useState<Installation[] | null>(null)
  const [complaints, setComplaints] = useState<ComplaintInstallationRow[]>([])
  const [error, setError] = useState('')
  const includeComplaints = Boolean(onComplaint)
  useEffect(() => {
    const folder = 'to_assign'
    Promise.all([installationsAPI.getList({ folder }), includeComplaints ? installationsAPI.getComplaintRows({ folder }) : []])
      .then(([orders, rows]) => { setItems(orders); setComplaints(rows) })
      .catch(() => setError('Не удалось загрузить монтажи'))
  }, [includeComplaints])
  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Незапланированные монтажи</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="overflow-y-auto">
          {error && <p role="alert" className="p-4 text-red-700">{error}</p>}
          {items === null ? (
            <p className="p-4 text-sm text-gray-500">Загрузка…</p>
          ) : items.length === 0 && complaints.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Все монтажи назначены</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((it) => (
                <li key={it.id}>
                  <button type="button" onClick={() => onPick(it)} className="w-full text-left px-4 py-3 hover:bg-primary-50">
                    <div className="font-medium text-gray-900">#{it.id} · {it.client_name}</div>
                    <div className="text-xs text-gray-500">{it.address}</div>
                    <div className="text-xs text-gray-600 truncate">{it.work_description}</div>
                  </button>
                </li>
              ))}
              {complaints.map(row => <li key={`complaint-${row.id}`}>
                <button type="button" className="w-full text-left px-4 py-3 hover:bg-primary-50" onClick={async () => {
                  try { onComplaint?.(await complaintsAPI.getDetail(row.id)) }
                  catch { setError('Не удалось загрузить рекламацию') }
                }}>
                  <div className="font-medium">Рекламация #{row.id} · {row.client_name}</div>
                  <div className="text-xs text-gray-500">{row.address}</div>
                </button>
              </li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

/**
 * Графики монтажников: слева список монтажников города, справа календарь
 * выбранного. Смотрят все, правит СМ: выделяет свободные дни и ставит на них
 * незапланированный монтаж.
 */
const InstallersSchedule = () => {
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [installers, setInstallers] = useState<Installer[]>([])
  const monthParam = searchParams.get('month')
  const month = useMemo(() => {
    const selected = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)
      ? new Date(`${monthParam}-01T00:00:00`) : new Date()
    return monthStart(selected)
  }, [monthParam])
  const changeMonth = (nextMonth: Date) => {
    const next = new URLSearchParams(searchParams)
    next.set('month', isoDate(nextMonth).slice(0, 7))
    setSearchParams(next, { replace: true })
  }
  const scheduleSearch = new URLSearchParams(searchParams)
  scheduleSearch.set('month', isoDate(month).slice(0, 7))
  const [visits, setVisits] = useState<ScheduleVisit[]>([])
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [picking, setPicking] = useState(false)
  const [assigningComplaint, setAssigningComplaint] = useState<Complaint | null>(null)
  const [assigning, setAssigning] = useState<Installation | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const self = user?.role === 'installer'
  const editable = canEditSchedule(user)

  // Монтажник всегда видит только свой график; выбор коллег доступен сотрудникам.
  const overview = editable && !self && searchParams.get('installer') === 'all'
  const installerId = overview ? null : user?.role === 'installer'
    ? user.id
    : Number(searchParams.get('installer')) || installers[0]?.id || null
  const current = installers.find((u) => u.id === installerId)

  useEffect(() => {
    installationsAPI.getInstallers().then(setInstallers).catch(() => setInstallers([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    setVisits([])
    if (!overview && !installerId) return
    const [from, to] = monthGridRange(month)
    installationsAPI.getSchedule(from, to, installerId ? [installerId] : undefined)
      .then(rows => { if (!cancelled) setVisits(rows) })
      .catch(() => { if (!cancelled) setError('Не удалось загрузить график') })
    return () => { cancelled = true }
  }, [installerId, overview, month, revision])

  const resetSelection = () => {
    setRange(null)
    setComment('')
    setError('')
  }

  const changeBlock = async (block?: ScheduleVisit) => {
    if (!installerId || saving) return
    if (block && !window.confirm(`Снять отметку «${block.client_name}» за ${formatPeriod(block.date_from, block.date_to)}?`)) return
    setSaving(true)
    setError('')
    try {
      if (block?.block_id) await installationsAPI.removeCalendarBlock(block.block_id)
      else if (range) await installationsAPI.addCalendarBlock(installerId, range.from, range.to, comment)
      resetSelection()
      setRevision(value => value + 1)
    } catch (err) {
      setError(apiErrorText(err, 'Не удалось изменить график'))
    } finally {
      setSaving(false)
    }
  }

  const selectInstaller = (id: number | 'all') => {
    resetSelection()
    const next = new URLSearchParams(searchParams)
    next.set('installer', String(id))
    setSearchParams(next, { replace: true })
  }

  const pickDay = (day: string) => {
    setRange((previous) => {
      const period = pickPeriodDay(day, previous ? { date_from: previous.from, date_to: previous.to } : undefined)
      return { from: period.date_from, to: period.date_to }
    })
  }

  const visitsOn = (day: string) => visits.filter((v) => v.date_from <= day && v.date_to >= day)

  return (
    <div className="container mx-auto px-4 py-6 max-w-[1600px]">
      <InstallationsTabs active="installers" />
      {user?.role === 'installer' && <OfflinePrefetchButton target="installations" />}
      <h1 className="text-2xl font-bold text-gray-900 mb-4">
        {user?.role === 'installer' ? 'Мой график монтажей' : 'Графики монтажников'}
      </h1>

      {installers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          В городе нет монтажников
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Список монтажников: на телефоне — лентой над календарём */}
          {user?.role !== 'installer' && <aside className="lg:w-56 shrink-0">
            <ul className="flex lg:flex-col gap-2 overflow-x-auto pb-1">
              {editable && <li className="shrink-0">
                <button type="button" aria-pressed={overview} onClick={() => selectInstaller('all')}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-sm whitespace-nowrap ${overview
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-primary-300'}`}>
                  Все монтажники
                </button>
              </li>}
              {installers.map((u) => (
                <li key={u.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => selectInstaller(u.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl border text-sm whitespace-nowrap transition-all ${
                      u.id === installerId
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-primary-300'
                    }`}
                  >
                    {u.full_name}
                    {user?.role === 'admin' && u.city_name && <span className="block text-xs opacity-75">{u.city_name}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </aside>}

          <section className="flex-1 min-w-0 bg-white rounded-xl shadow-sm border border-gray-200 p-3">
            {current && (
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{current.full_name}</span>
                  {current.phone_number && <> · <a href={`tel:${current.phone_number}`} className="text-primary-600">{current.phone_number}</a></>}
                </div>
                {(editable || self) && (
                  range ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-gray-600">Выбрано: {formatPeriod(range.from, range.to)}</span>
                      {editable && <button type="button" onClick={() => setPicking(true)}
                        className="px-3 py-1.5 rounded-lg text-white bg-primary-600 hover:bg-primary-700">
                        Назначить монтаж
                      </button>}
                      <input aria-label={self ? 'Комментарий к выходному' : 'Причина занятости'}
                        placeholder={self ? 'Комментарий (необязательно)' : 'Причина, например выставка'}
                        value={comment} maxLength={500} onChange={e => setComment(e.target.value)}
                        className="rounded-lg border-gray-300 text-sm" />
                      <button type="button" onClick={() => changeBlock()} disabled={saving || (editable && !comment.trim())}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-50">
                        {self ? 'Отметить выходной' : 'Отметить занятость'}
                      </button>
                      <button type="button" onClick={resetSelection} className="text-gray-500 hover:underline">сбросить</button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">{self ? 'Выберите день или период для выходных' : 'Выберите день или период для монтажа или другой занятости'}</span>
                  )
                )}
              </div>
            )}
            {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <MonthCalendar
                  month={month}
                  onMonthChange={changeMonth}
                  onDayClick={!overview && (editable || self) ? pickDay : undefined}
                  dayClassName={(day) => (range && day >= range.from && day <= range.to ? 'bg-primary-50 ring-1 ring-inset ring-primary-400' : '')}
                  renderDay={(day) => {
                    const entries = visitsOn(day)
                    if (overview) return <BusyInstallers visits={entries} installers={installers} onSelect={selectInstaller} />
                    return (
                    <div className="space-y-1 mt-0.5">
                      {entries.map((v) => v.block_id ? (
                        <div key={v.id} className="rounded-md bg-amber-100 px-1.5 py-1 text-xs text-amber-950">
                          <strong>{v.client_name}</strong>
                          {v.work_description && <div className="break-words">{v.work_description}</div>}
                          {((self && v.kind === 'day_off') || (editable && v.kind === 'other_work')) &&
                            <button type="button" disabled={saving} className="underline"
                              onClick={e => { e.stopPropagation(); changeBlock(v) }}>Снять</button>}
                        </div>
                      ) : v.kind === 'busy' ? (
                        <div key={v.id} className="rounded-md bg-gray-100 px-1.5 py-1 text-[11px] text-gray-700">
                          Занято
                        </div>
                      ) : (
                        <Link
                          key={v.id}
                          to={v.kind === 'complaint' ? `/complaints/${v.complaint_id}` : `/orders/installations/${v.installation_id}`}
                          state={self && v.kind === 'complaint' ? { installationScheduleSearch: scheduleSearch.toString() } : undefined}
                          onClick={(e) => e.stopPropagation()}
                          className={`block rounded-md px-1.5 py-1 text-[11px] leading-tight hover:ring-1 hover:ring-primary-400 ${
                            v.kind === 'complaint'
                              ? 'bg-rose-100 text-rose-900 border-l-2 border-rose-500'
                              : INSTALLATION_STATUS_COLOR[v.status as keyof typeof INSTALLATION_STATUS_COLOR]
                          }`}
                          title={scheduleVisitTitle(v)}
                        >
                          <ScheduleVisitContent visit={v} />
                        </Link>
                      ))}
                    </div>
                    )
                  }}
                />
              </div>
            </div>
          </section>
        </div>
      )}

      {picking && range && installerId && (
        <PickInstallationModal
          onClose={() => setPicking(false)}
          onComplaint={canManageService(user) ? complaint => { setPicking(false); setAssigningComplaint(complaint) } : undefined}
          onPick={(inst) => { setPicking(false); setAssigning(inst) }}
        />
      )}
      {assigningComplaint && range && installerId && (
        <AssignModal complaint={assigningComplaint} preset={{ installers: [installerId], dateFrom: range.from, dateTo: range.to }}
          onClose={() => setAssigningComplaint(null)} onDone={() => {
            setAssigningComplaint(null)
            resetSelection()
            setRevision(value => value + 1)
          }} />
      )}
      {assigning && range && installerId && (
        <AssignModal
          installation={assigning}
          preset={{ installers: [installerId], dateFrom: range.from, dateTo: range.to }}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null)
            setRange(null)
            setRevision(value => value + 1)
          }}
        />
      )}
    </div>
  )
}

export default InstallersSchedule
