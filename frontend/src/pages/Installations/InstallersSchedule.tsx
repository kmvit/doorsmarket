import { useCallback, useEffect, useState } from 'react'
import ModalPortal from '../../components/installations/ModalPortal'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { installationsAPI } from '../../api/installations'
import {
  Installation, Installer, ScheduleVisit, INSTALLATION_STATUS_COLOR, canEditSchedule, formatPeriod,
} from '../../types/installations'
import MonthCalendar, { monthGridRange, monthStart } from '../../components/installations/MonthCalendar'
import AssignModal from '../../components/installations/AssignModal'
import InstallationsTabs from './InstallationsTabs'
import { useBodyScrollLock } from '../../utils/useBodyScrollLock'

/** Выбор незапланированного монтажа на выбранные в календаре даты */
const PickInstallationModal = ({ onClose, onPick }: { onClose: () => void; onPick: (inst: Installation) => void }) => {
  useBodyScrollLock(true)
  const [items, setItems] = useState<Installation[] | null>(null)
  useEffect(() => {
    installationsAPI.getList({ folder: 'to_assign' }).then(setItems).catch(() => setItems([]))
  }, [])
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
          {items === null ? (
            <p className="p-4 text-sm text-gray-500">Загрузка…</p>
          ) : items.length === 0 ? (
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
  const [month, setMonth] = useState(() => monthStart(new Date()))
  const [visits, setVisits] = useState<ScheduleVisit[]>([])
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [picking, setPicking] = useState(false)
  const [assigning, setAssigning] = useState<Installation | null>(null)
  const editable = canEditSchedule(user?.role)

  // Монтажник открывает свой график, остальные — первого в списке
  const own = user?.role === 'installer' ? installers.find((u) => u.id === user.id)?.id : undefined
  const installerId = Number(searchParams.get('installer')) || own || installers[0]?.id || null
  const current = installers.find((u) => u.id === installerId)

  useEffect(() => {
    installationsAPI.getInstallers().then(setInstallers).catch(() => setInstallers([]))
  }, [])

  const loadVisits = useCallback(() => {
    if (!installerId) return
    const [from, to] = monthGridRange(month)
    installationsAPI.getSchedule(from, to, [installerId]).then(setVisits).catch(() => setVisits([]))
  }, [installerId, month])

  useEffect(() => { loadVisits() }, [loadVisits])

  const selectInstaller = (id: number) => {
    setRange(null)
    setSearchParams({ installer: String(id) }, { replace: true })
  }

  const pickDay = (day: string) => {
    if (!range || range.from !== range.to || day < range.from) setRange({ from: day, to: day })
    else setRange({ from: range.from, to: day })
  }

  const visitsOn = (day: string) => visits.filter((v) => v.date_from <= day && v.date_to >= day)

  return (
    <div className="container mx-auto px-4 py-6 max-w-[1600px]">
      <InstallationsTabs active="installers" />
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Графики монтажников</h1>

      {installers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          В городе нет монтажников
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Список монтажников: на телефоне — лентой над календарём */}
          <aside className="lg:w-56 shrink-0">
            <ul className="flex lg:flex-col gap-2 overflow-x-auto pb-1">
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
          </aside>

          <section className="flex-1 min-w-0 bg-white rounded-xl shadow-sm border border-gray-200 p-3">
            {current && (
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{current.full_name}</span>
                  {current.phone_number && <> · <a href={`tel:${current.phone_number}`} className="text-primary-600">{current.phone_number}</a></>}
                </div>
                {editable && (
                  range ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600">Выбрано: {formatPeriod(range.from, range.to)}</span>
                      <button type="button" onClick={() => setPicking(true)}
                        className="px-3 py-1.5 rounded-lg text-white bg-primary-600 hover:bg-primary-700">
                        Назначить монтаж
                      </button>
                      <button type="button" onClick={() => setRange(null)} className="text-gray-500 hover:underline">сбросить</button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">Выделите свободные дни, чтобы назначить монтаж</span>
                  )
                )}
              </div>
            )}
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <MonthCalendar
                  month={month}
                  onMonthChange={setMonth}
                  onDayClick={editable ? pickDay : undefined}
                  dayClassName={(day) => (range && day >= range.from && day <= range.to ? 'bg-primary-50 ring-1 ring-inset ring-primary-400' : '')}
                  renderDay={(day) => (
                    <div className="space-y-1 mt-0.5">
                      {visitsOn(day).map((v) => (
                        <Link
                          key={v.id}
                          to={v.kind === 'complaint' ? `/complaints/${v.complaint_id}` : `/orders/installations/${v.installation_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`block rounded-md px-1.5 py-1 text-[11px] leading-tight hover:ring-1 hover:ring-primary-400 ${
                            v.kind === 'complaint'
                              ? 'bg-rose-100 text-rose-900 border-l-2 border-rose-500'
                              : INSTALLATION_STATUS_COLOR[v.status as keyof typeof INSTALLATION_STATUS_COLOR]
                          }`}
                          title={`${v.kind === 'complaint' ? `Рекламация #${v.complaint_id}, ${v.window}\n` : ''}${v.client_name}\n${v.address}\n${v.work_description}`}
                        >
                          {v.kind === 'complaint' && <span className="block font-semibold">Рекламация</span>}
                          <span className="font-semibold block truncate">{v.client_name}</span>
                          <span className="block truncate">{v.address}</span>
                          <span className="block truncate opacity-80">{v.work_description}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                />
              </div>
            </div>
          </section>
        </div>
      )}

      {picking && range && installerId && (
        <PickInstallationModal
          onClose={() => setPicking(false)}
          onPick={(inst) => { setPicking(false); setAssigning(inst) }}
        />
      )}
      {assigning && range && installerId && (
        <AssignModal
          installation={assigning}
          preset={{ installers: [installerId], dateFrom: range.from, dateTo: range.to }}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null)
            setRange(null)
            loadVisits()
          }}
        />
      )}
    </div>
  )
}

export default InstallersSchedule
