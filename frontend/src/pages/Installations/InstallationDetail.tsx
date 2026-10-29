import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { installationsAPI, apiErrorText } from '../../api/installations'
import {
  CLOSED_INSTALLATION_STATUSES, Installation, InstallationEvent, InstallationFileKind,
  INSTALLATION_FILE_KINDS, INSTALLATION_FILE_KIND_DISPLAY, INSTALLATION_STATUS_COLOR, formatDate, formatPeriod,
  canDecideIrrelevant, canEditSchedule, canSeeInstallations,
} from '../../types/installations'
import AssignModal from '../../components/installations/AssignModal'
import PhoneLink from '../../components/common/PhoneLink'
import FileViewer from '../../components/common/FileViewer'

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const InstallationDetail = () => {
  const { id } = useParams()
  const instId = Number(id)
  const [inst, setInst] = useState<Installation | null>(null)
  const [events, setEvents] = useState<InstallationEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ url: string; name: string } | null>(null)
  const [busyKind, setBusyKind] = useState<InstallationFileKind | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [acting, setActing] = useState(false)
  const { user } = useAuthStore()

  const load = useCallback(async () => {
    try {
      const [data, history] = await Promise.all([
        installationsAPI.getById(instId),
        installationsAPI.getEvents(instId).catch(() => []),
      ])
      setInst(data)
      setEvents(history)
    } catch (err) {
      setError(apiErrorText(err, 'Не удалось загрузить монтаж'))
    }
  }, [instId])

  useEffect(() => { load() }, [load])

  if (error) {
    return <div className="container mx-auto px-4 py-6 max-w-4xl text-red-700">{error}</div>
  }
  if (!inst) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    )
  }

  const editable = !CLOSED_INSTALLATION_STATUSES.includes(inst.status)
  const requiredKinds: InstallationFileKind[] = [
    ...(inst.measurement_blank_required ? ['measurement_blank' as const] : []),
    'final_kp', 'installation_kp',
  ]

  const upload = async (kind: InstallationFileKind, list: File[]) => {
    if (!list.length) return
    setBusyKind(kind)
    try {
      for (const f of list) await installationsAPI.uploadFile(inst.id, kind, f)
      await load()
    } catch (err) {
      alert(apiErrorText(err, 'Не удалось загрузить файл'))
    } finally {
      setBusyKind(null)
    }
  }

  const remove = async (fileId: number) => {
    if (!window.confirm('Удалить файл из пакета документов?')) return
    try {
      await installationsAPI.deleteFile(fileId)
      await load()
    } catch (err) {
      alert(apiErrorText(err, 'Не удалось удалить файл'))
    }
  }

  const run = async (
    name: Parameters<typeof installationsAPI.action>[1],
    body: Record<string, string> = {},
    done?: string,
  ) => {
    setActing(true)
    try {
      setInst(await installationsAPI.action(inst.id, name, body))
      setEvents(await installationsAPI.getEvents(inst.id).catch(() => events))
      if (done) alert(done)
    } catch (err) {
      alert(apiErrorText(err, 'Не удалось выполнить действие'))
    } finally {
      setActing(false)
    }
  }

  const ask = (question: string, name: Parameters<typeof installationsAPI.action>[1], field?: string) => {
    if (field) {
      const text = window.prompt(question)
      if (text === null) return
      run(name, { [field]: text.trim() })
    } else if (window.confirm(question)) {
      run(name)
    }
  }

  const sm = canEditSchedule(user?.role)
  const assignable = ['not_planned', 'partially_done', 'planned'].includes(inst.status)
  const pending = !!inst.irrelevant_requested_at && editable
  const btn = 'px-3 py-1.5 text-sm rounded-lg border transition-all disabled:opacity-50'
  const btnPrimary = `${btn} border-primary-600 bg-primary-600 text-white hover:bg-primary-700`
  const btnPlain = `${btn} border-gray-300 text-gray-700 bg-white hover:bg-gray-50`

  const row = (label: string, value: React.ReactNode) => (
    <div className="py-2 grid grid-cols-1 sm:grid-cols-3 gap-1">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="sm:col-span-2 text-sm text-gray-900 whitespace-pre-line">{value || '—'}</dd>
    </div>
  )

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <Link to="/orders/installations" className="text-sm text-primary-600 hover:underline">← Монтажи</Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Монтаж #{inst.id}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${INSTALLATION_STATUS_COLOR[inst.status]}`}>
              {inst.status_display}
            </span>
            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
              inst.is_paid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
            }`}
            >
              {inst.is_paid ? 'Оплачен' : 'Не оплачен'}
            </span>
          </div>
        </div>
        {editable && (
          <Link
            to={`/orders/installations/${inst.id}/edit`}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-primary-300 text-primary-700 hover:bg-primary-50"
          >
            Редактировать
          </Link>
        )}
      </div>

      {pending && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4">
          <p className="text-sm text-amber-900">
            <span className="font-semibold">{inst.irrelevant_requested_by_name || 'Сервис-менеджер'}</span> пометил монтаж
            неактуальным{inst.irrelevant_reason && <>: «{inst.irrelevant_reason}»</>}. До решения менеджера монтаж в работе.
          </p>
          {canDecideIrrelevant(user?.role) && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" disabled={acting} className={btnPrimary}
                onClick={() => ask('Подтвердить: монтаж не актуален?', 'confirm_irrelevant')}>
                Подтвердить неактуальность
              </button>
              <button type="button" disabled={acting} className={btnPlain}
                onClick={() => ask('Комментарий для сервис-менеджера (необязательно):', 'keep_relevant', 'comment')}>
                Оставить в работе
              </button>
            </div>
          )}
        </div>
      )}

      {inst.status === 'planned' && inst.current_visit && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-4 text-sm text-blue-900">
          Монтаж назначен на <span className="font-semibold">{formatPeriod(inst.current_visit.date_from, inst.current_visit.date_to)}</span>
          {' · '}монтажник: {inst.current_visit.installers.map((u) => u.full_name).join(', ')}
        </div>
      )}

      {editable && (sm || inst.status === 'not_ready') && canSeeInstallations(user?.role) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {sm && assignable && (
            <button type="button" disabled={acting} className={btnPrimary} onClick={() => setAssigning(true)}>
              {inst.status === 'planned' ? 'Изменить назначение' : 'Назначить монтажника'}
            </button>
          )}
          {inst.status === 'not_ready' && (
            <button type="button" disabled={acting} className={btnPrimary}
              onClick={() => ask('Клиент готов? Монтаж снова попадёт в «Назначить монтаж».', 'ready')}>
              Назначить монтаж
            </button>
          )}
          {sm && inst.status === 'planned' && (
            <button type="button" disabled={acting} className={btnPlain}
              onClick={() => ask('Снять монтаж с графика монтажников?', 'unassign')}>
              Снять с графика
            </button>
          )}
          {sm && assignable && (
            <button type="button" disabled={acting} className={btnPlain}
              onClick={() => ask('Клиент не готов к монтажу? Дата в графике освободится.', 'not_ready')}>
              Не готов к монтажу
            </button>
          )}
          {sm && (
            <button type="button" disabled={acting} className={btnPlain}
              onClick={() => ask('Отправить клиенту СМС «Мы не дозвонились, перезвоните»?', 'notify_call_failed')}>
              Не дозвонился — отправить СМС
            </button>
          )}
          {sm && !inst.irrelevant_requested_at && (
            <button type="button" disabled={acting} className={`${btn} border-red-200 text-red-700 bg-white hover:bg-red-50`}
              onClick={() => ask('Почему монтаж не актуален? Решение примет менеджер.', 'request_irrelevant', 'reason')}>
              Не актуален
            </button>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <dl className="divide-y divide-gray-100">
          {row('Заказ', (
            <Link to={`/orders/${inst.order}`} className="text-primary-600 hover:underline">
              #{inst.order}{inst.kp_number && ` · КП ${inst.kp_number}`}
            </Link>
          ))}
          {row('Клиент', inst.client_name)}
          {row('Адрес', inst.address)}
          {row('Контактное лицо', (
            <>
              {inst.contact_name || '—'}
              {inst.contact_phone && <> · <PhoneLink phone={inst.contact_phone} /></>}
            </>
          ))}
          {row('Менеджер', `${inst.manager_name} · ${inst.salon_name}`)}
          {row('Что нужно смонтировать', inst.work_description)}
          {row('Коллекция, покрытие', inst.collection_finish)}
          {row('Плановая дата доставки', formatDate(inst.planned_delivery_date))}
          {row('Желаемая дата монтажа и комментарии', inst.desired_date_comment)}
          {row('Оформил', `${inst.created_by_name || '—'}, ${formatDateTime(inst.created_at)}`)}
          {(inst.visits?.length || 0) > 0 && row('Выезды', (
            <ul>
              {inst.visits!.map((v) => (
                <li key={v.id}>{formatPeriod(v.date_from, v.date_to)} · {v.installers.map((u) => u.full_name).join(', ')}</li>
              ))}
            </ul>
          ))}
        </dl>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Пакет документов</h2>
        {inst.order_documents.length > 0 && (
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-cyan-700 uppercase tracking-wider mb-1">Из заказа</h3>
            <ul className="flex flex-wrap gap-2">
              {inst.order_documents.map((d) => (
                <li key={`${d.kind}-${d.file_url}`}>
                  <button
                    type="button"
                    onClick={() => setViewing({ url: d.file_url, name: d.name })}
                    className="text-sm text-primary-600 hover:underline"
                  >
                    {d.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="divide-y divide-gray-100">
          {INSTALLATION_FILE_KINDS.map((kind) => {
            const list = inst.files.filter((f) => f.kind === kind)
            const required = requiredKinds.includes(kind)
            if (!list.length && !editable) return null
            return (
              <div key={kind} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    {INSTALLATION_FILE_KIND_DISPLAY[kind]}
                    {required && <span className="text-red-500"> *</span>}
                  </span>
                  {editable && (
                    <label className="text-sm text-primary-600 hover:underline cursor-pointer whitespace-nowrap">
                      {busyKind === kind ? 'Загрузка…' : '+ Добавить'}
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        disabled={busyKind !== null}
                        accept={kind === 'photo' ? 'image/*' : kind === 'video' ? 'video/*' : undefined}
                        onChange={(e) => { upload(kind, Array.from(e.target.files || [])); e.target.value = '' }}
                      />
                    </label>
                  )}
                </div>
                {list.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-1">Нет файлов</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {list.map((f) => (
                      <li key={f.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewing({ url: f.file_url || '', name: f.name })}
                          className="text-sm text-primary-600 hover:underline truncate text-left flex-1"
                        >
                          {f.name}
                          {f.file_size && <span className="text-gray-400 ml-1 text-xs">{f.file_size}</span>}
                        </button>
                        {editable && (
                          <button type="button" onClick={() => remove(f.id)} className="text-xs text-red-500 hover:underline">
                            удалить
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">История</h2>
        {events.length === 0 ? (
          <p className="text-sm text-gray-400">Событий нет</p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => (
              <li key={ev.id} className="text-sm">
                <span className="text-gray-500">{formatDateTime(ev.created_at)}</span>
                {' · '}<span className="font-medium text-gray-900">{ev.actor_name}</span>
                {' · '}{ev.kind_display}
                {ev.description && ev.description !== ev.kind_display && (
                  <span className="text-gray-600"> — {ev.description}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {viewing && <FileViewer fileUrl={viewing.url} fileName={viewing.name} onClose={() => setViewing(null)} />}
      {assigning && (
        <AssignModal
          installation={inst}
          onClose={() => setAssigning(false)}
          onDone={() => { setAssigning(false); load() }}
        />
      )}
    </div>
  )
}

export default InstallationDetail
