import { liveQuery } from 'dexie'
import { db } from '../../services/offline'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { installationsAPI, apiErrorText } from '../../api/installations'
import { QUEUED_MESSAGE, requestQueue, workPhotoIsSending } from '../../services/sync'
import { Installation, PARTIAL_COMPLETION_REASONS, PartialCompletionReason, formatPeriod, formatPeriodForInstaller, installerPeriod } from '../../types/installations'
import { selectCanCreateComplaint, useAuthStore } from '../../store/authStore'
import ModalPortal from './ModalPortal'
import FileViewer from '../common/FileViewer'

interface Props {
  inst: Installation
  onRemove: (id: number, name: string) => Promise<void>
  onFilesChanged: () => Promise<void>
  onChanged: (inst?: Installation) => void
}

type WorkKind = 'act' | 'act_unsigned' | 'result'

const QUEUED_LABEL: Record<WorkKind, string> = { act: 'Акт', act_unsigned: 'Акт без подписи', result: 'Фото/видео' }

const btn = 'px-3 py-2 text-sm rounded-lg border transition-all disabled:opacity-50'
const btnPrimary = `${btn} border-primary-600 bg-primary-600 text-white hover:bg-primary-700`
const btnPlain = `${btn} border-gray-300 text-gray-700 bg-white hover:bg-gray-50`

/**
 * Работа монтажника по запланированному монтажу: позвонить, «не дозвонился»,
 * перенести дату, приложить акт и фото результата (в т.ч. без связи),
 * завершить полностью или частично, завести рекламацию.
 */
const InstallerWorkPanel = ({ inst, onChanged, onRemove, onFilesChanged }: Props) => {
  const visit = inst.current_visit
  const installerId = useAuthStore((state) => state.user?.id)
  const canCreateComplaint = useAuthStore(selectCanCreateComplaint)
  const [busy, setBusy] = useState(false)
  const [choosingReason, setChoosingReason] = useState(false)
  const [reason, setReason] = useState<PartialCompletionReason | ''>('')
  const [rescheduling, setRescheduling] = useState(false)
  // Файлы, ушедшие в офлайн-очередь: сервер их ещё не видит, но монтажник
  // приложил акт и должен иметь возможность завершить монтаж
  const [queued, setQueued] = useState<{ kind: WorkKind; name: string }[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ url: string; name: string } | null>(null)

  const [pendingPhotos, setPendingPhotos] = useState<{ id: number; name: string; sending: boolean }[]>([])
  const visitId = visit?.id
  useEffect(() => {
    if (!visitId || !installerId) return
    let previous: number[] = []
    const sub = liveQuery(async () => {
      const rows = await db.pendingRequests.where('url').equals('/installation-files/').filter(row =>
        row.workPhoto?.installation === inst.id && row.workPhoto.visit === visitId && row.workPhoto.owner === installerId
      ).toArray()
      return rows.map(row => ({ id: row.id!, name: row.workPhoto!.name, sending: workPhotoIsSending(row) }))
    }).subscribe({
      next: photos => {
        setPendingPhotos(photos)
        if (previous.some(id => !photos.some(photo => photo.id === id))) void onFilesChanged()
        previous = photos.map(photo => photo.id)
      },
      error: () => setNotice('Не удалось прочитать список фото, ожидающих отправки.'),
    })
    return () => sub.unsubscribe()
  }, [inst.id, installerId, visitId, onFilesChanged])

  const removePendingPhoto = async (id: number, name: string) => {
    if (!installerId || !window.confirm(`Отменить отправку файла «${name}»?`)) return
    try {
      const removed = await requestQueue.cancelWorkPhoto(id, installerId)
      setNotice(removed ? 'Отправка файла отменена.' : 'Отправка уже началась. После загрузки файл можно удалить.')
    } catch (err) {
      alert(apiErrorText(err, 'Не удалось отменить отправку файла'))
    }
  }

  const visitFiles = inst.files.filter((f) => f.visit === visit?.id)
  // Акт засчитывается, если его приложил сотрудник или подпись клиента проверена
  const hasAct = visitFiles.some((f) => f.kind === 'act' && (f.review_status === '' || f.review_status === 'approved'))
    || queued.some((q) => q.kind === 'act')
  const unsignedAct = visitFiles.some((f) => f.kind === 'act_unsigned') || queued.some((q) => q.kind === 'act_unsigned')
  const toReview = visitFiles.filter((f) => f.kind === 'act' && f.review_status === 'pending')
  const awaiting = inst.status === 'awaiting_signature'

  const upload = async (kind: WorkKind, files: File[]) => {
    if (!files.length || !visit || !installerId) return
    setBusy(true)
    setNotice(null)
    let uploaded = false
    let wentOffline = false
    try {
      for (const f of files) {
        try {
          await installationsAPI.uploadWorkFile(inst.id, kind, f, visit.id, installerId)
          uploaded = true
        } catch (err: any) {
          if (err?.message !== QUEUED_MESSAGE) throw err
          wentOffline = true
          if (kind !== 'result') setQueued((q) => [...q, { kind, name: f.name }])
        }
      }
      if (wentOffline) {
        setNotice('Нет связи: файлы сохранены в телефоне и отправятся, когда появится интернет.')
      }
    } catch (err) {
      alert(apiErrorText(err, 'Не удалось загрузить файл'))
    } finally {
      if (uploaded) await onFilesChanged()
      setBusy(false)
    }
  }

  const complete = async (partialReason?: PartialCompletionReason) => {
    if (!visit || (!partialReason && !window.confirm('Монтаж завершён полностью?'))) return
    setBusy(true)
    try {
      onChanged(await installationsAPI.complete(inst.id, visit.id, partialReason))
      setChoosingReason(false)
    } catch (err: any) {
      if (err?.message === QUEUED_MESSAGE) {
        setChoosingReason(false)
        setNotice('Нет связи: отметка о завершении отправится, когда появится интернет.')
      } else {
        alert(apiErrorText(err, 'Не удалось завершить монтаж'))
      }
    } finally {
      setBusy(false)
    }
  }

  const callFailed = async () => {
    if (!window.confirm('Отправить клиенту СМС: «Монтажник до вас не дозвонился, перезвоните»?')) return
    setBusy(true)
    try {
      onChanged(await installationsAPI.action(inst.id, 'installer_call_failed'))
      setNotice('Уведомление клиенту отправлено.')
    } catch (err) {
      alert(apiErrorText(err, 'Не удалось отправить уведомление'))
    } finally {
      setBusy(false)
    }
  }

  const sendToClient = async () => {
    const again = awaiting
    if (!window.confirm(again
      ? 'Отправить клиенту ссылку на подпись акта ещё раз?'
      : 'Отправить клиенту акт и фото на подпись? Монтаж перейдёт в «Ожидает подписи клиента».')) return
    setBusy(true)
    try {
      onChanged(await installationsAPI.action(inst.id, 'send_act_to_client'))
      setNotice('Клиенту отправлена ссылка на подпись акта.')
    } catch (err) {
      alert(apiErrorText(err, 'Не удалось отправить акт клиенту'))
    } finally {
      setBusy(false)
    }
  }

  const review = async (fileId: number, approve: boolean) => {
    let body: Record<string, string> = { file: String(fileId) }
    if (approve) {
      if (!window.confirm('Подпись клиента в акте на месте?')) return
    } else {
      const reason = window.prompt('Что не так с актом? Это увидит клиент, ему снова уйдёт ссылка.')
      if (!reason?.trim()) return
      body = { ...body, reason: reason.trim() }
    }
    setBusy(true)
    try {
      onChanged(await installationsAPI.action(inst.id, approve ? 'approve_act' : 'reject_act', body))
    } catch (err) {
      alert(apiErrorText(err, 'Не удалось сохранить проверку'))
    } finally {
      setBusy(false)
    }
  }

  const fileButton = (kind: WorkKind, label: string, primary: boolean) => (
    <label className={`${primary ? btnPrimary : btnPlain} cursor-pointer inline-flex items-center ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
      {label}
      <input
        type="file"
        multiple
        className="hidden"
        accept={kind === 'result' ? 'image/*,video/*' : 'image/*,application/pdf'}
        onChange={(e) => { upload(kind, Array.from(e.target.files || [])); e.target.value = '' }}
      />
    </label>
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-primary-200 ring-1 ring-primary-100 p-4 mb-4 space-y-4">
      <h2 className="text-sm font-semibold text-primary-700 uppercase tracking-wider">Работа на монтаже</h2>

      {visit?.reschedule_requested_at && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Перенос на {formatPeriodForInstaller(visit, visit.reschedule_requested_by)} ждёт подтверждения сервис-менеджера.
          Клиенту СМС о новой дате уйдёт после подтверждения.
        </p>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-2">{awaiting ? 'Связаться с клиентом' : 'Договоритесь с клиентом о времени'}</p>
        <div className="flex flex-wrap gap-2">
          {inst.contact_phone && (
            <a href={`tel:${inst.contact_phone}`} className={btnPrimary}>📞 Позвонить {inst.contact_name}</a>
          )}
          {/* Договариваться о времени и переносить имеет смысл, пока монтаж не сделан */}
          {!awaiting && (
            <>
              <button type="button" disabled={busy} onClick={callFailed} className={btnPlain}>
                {inst.installer_notified_at ? 'Повторно отправить уведомление' : 'Не дозвонился — отправить уведомление'}
              </button>
              <button type="button" disabled={busy} onClick={() => setRescheduling(true)} className={btnPlain}>
                Перенести дату
              </button>
            </>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">По факту работ</p>
        <div className="flex flex-wrap gap-2">
          {fileButton('act', '📎 Прикрепить акт с подписью клиента', !hasAct)}
          {fileButton('result', '📷 Фото/видео дверей', false)}
        </div>
        <ul className="mt-2 space-y-1 text-sm">
          {visitFiles.filter(file => file.kind === 'result').map(file => (
            <li key={file.id} className="flex items-center gap-2">
              <button type="button" disabled={!file.file_url}
                onClick={() => file.file_url && setViewing({ url: file.file_url, name: file.name })}
                className="min-w-0 flex-1 break-all text-left text-primary-700 hover:underline">{file.name}</button>
              {file.uploaded_by === installerId && (
                <button type="button" disabled={busy} className={`${btn} text-red-700`}
                  aria-label={`Удалить ${file.name}`} onClick={async () => {
                    setBusy(true)
                    try { await onRemove(file.id, file.name) } finally { setBusy(false) }
                  }}>Удалить</button>
              )}
            </li>
          ))}
          {pendingPhotos.map(photo => (
            <li key={photo.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 break-all text-amber-700">
                {photo.name} — {photo.sending ? 'отправляется' : 'ждёт связи'}
              </span>
              <button type="button" disabled={busy} className={`${btn} text-red-700`}
                onClick={() => removePendingPhoto(photo.id, photo.name)}>Отменить отправку</button>
            </li>
          ))}
        </ul>
        {queued.length > 0 && (
          <ul className="mt-2 text-xs text-amber-700 space-y-0.5">
            {queued.map((q, i) => <li key={i}>⏳ {QUEUED_LABEL[q.kind]}: {q.name} — ждёт связи</li>)}
          </ul>
        )}
      </div>

      {/* Клиент приложил подписанный акт — проверить подпись */}
      {toReview.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900 mb-2">Клиент приложил подписанный акт — проверьте подпись</p>
          <ul className="space-y-2">
            {toReview.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-700 flex-1 truncate">
                  {f.name}
                </span>
                <button type="button" onClick={() => f.file_url && setViewing({ url: f.file_url, name: f.name })}
                  disabled={!f.file_url} className={`${btn} border-primary-300 text-primary-700 bg-white hover:bg-primary-50`}>
                  Посмотреть
                </button>
                <button type="button" disabled={busy} onClick={() => review(f.id, true)}
                  className={`${btn} border-green-600 bg-green-600 text-white hover:bg-green-700`}>Подпись на месте</button>
                <button type="button" disabled={busy} onClick={() => review(f.id, false)} className={btnPlain}>Не принять</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Работу не приняли на месте: акт без подписи — клиенту по ссылке */}
      <div>
        <p className="text-xs text-gray-500 mb-2">
          {awaiting ? 'Акт отправлен клиенту на подпись' : 'Работу не приняли или некому подписать акт'}
        </p>
        {awaiting && (
          <p className="text-sm text-gray-700 mb-2">
            {inst.client_confirmed_at
              ? '✓ Клиент подтвердил выполнение работ по ссылке. '
              : 'Клиент ещё не открывал ссылку или не подтвердил. '}
            {inst.client_link && (
              <button type="button" className="text-primary-600 hover:underline"
                onClick={() => { navigator.clipboard?.writeText(inst.client_link!); setNotice('Ссылка скопирована') }}>
                Скопировать ссылку
              </button>
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!awaiting && fileButton('act_unsigned', '📄 Акт без подписи', false)}
          <button type="button" disabled={busy || !unsignedAct} onClick={sendToClient} className={btnPlain}>
            {awaiting ? 'Отправить ссылку повторно' : 'Отправить акт клиенту на подпись'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
        <button type="button" disabled={busy || !hasAct} onClick={() => complete()}
          className={`${btn} border-green-600 bg-green-600 text-white hover:bg-green-700`}>
          ✓ Монтаж завершён
        </button>
        <button type="button" disabled={busy || !hasAct} onClick={() => { setReason(''); setChoosingReason(true) }} className={btnPlain}>
          Монтаж завершён частично
        </button>
        {canCreateComplaint ? (
          <Link
            to={`/complaints/create?order=${inst.order}&installation=${inst.id}`}
            className={`${btn} border-red-200 text-red-700 bg-white hover:bg-red-50`}
          >
            Создать рекламацию
          </Link>
        ) : null}
      </div>
      {choosingReason && (
        <fieldset className="mt-3 space-y-3 rounded-lg border border-gray-200 p-3" disabled={busy}>
          <legend className="px-1 text-sm font-medium">Почему монтаж завершён частично?</legend>
          {(Object.keys(PARTIAL_COMPLETION_REASONS) as PartialCompletionReason[]).map(value => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="partial-reason" checked={reason === value} onChange={() => setReason(value)} />
              {PARTIAL_COMPLETION_REASONS[value]}
            </label>
          ))}
          {reason === 'short_delivery' && <p className="text-sm text-gray-600">Менеджер заказа получит задание оформить повторный монтаж.</p>}
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} disabled={!reason || !hasAct}
              onClick={() => reason && complete(reason)}>Подтвердить</button>
            <button type="button" className={btnPlain} onClick={() => setChoosingReason(false)}>Отмена</button>
          </div>
        </fieldset>
      )}
      {!hasAct && <p className="text-xs text-gray-500">Завершить монтаж можно после того, как приложен акт.</p>}

      {notice && <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{notice}</p>}

      {rescheduling && visit && (
        <RescheduleModal
          inst={inst}
          installerId={installerId}
          onClose={() => setRescheduling(false)}
          onDone={(updated) => { setRescheduling(false); onChanged(updated) }}
        />
      )}
      <FileViewer
        fileUrl={viewing?.url || null}
        fileName={viewing?.name}
        onClose={() => setViewing(null)}
      />
    </div>
  )
}

const RescheduleModal = ({ inst, installerId, onClose, onDone }: {
  inst: Installation
  installerId?: number
  onClose: () => void
  onDone: (inst: Installation) => void
}) => {
  const visit = installerPeriod(inst.current_visit!, installerId)
  const [dateFrom, setDateFrom] = useState(visit.date_from)
  const [dateTo, setDateTo] = useState(visit.date_to)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!reason.trim()) { setError('Укажите причину переноса'); return }
    setSaving(true)
    setError(null)
    try {
      onDone(await installationsAPI.action(inst.id, 'reschedule', {
        date_from: dateFrom, date_to: dateTo < dateFrom ? dateFrom : dateTo, reason: reason.trim(),
      }))
    } catch (err) {
      setError(apiErrorText(err, 'Не удалось перенести дату'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Перенести монтаж #{inst.id}</h2>
          <p className="text-sm text-gray-500 mb-3">
            Сейчас: {formatPeriod(visit.date_from, visit.date_to)}. Новую дату подтвердит сервис-менеджер.
          </p>
          <div className="flex gap-3 mb-3">
            <label className="text-sm text-gray-700 flex-1">
              С
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); if (dateTo < e.target.value) setDateTo(e.target.value) }}
                className="block w-full rounded-lg border-gray-300 shadow-sm text-sm" />
            </label>
            <label className="text-sm text-gray-700 flex-1">
              По
              <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)}
                className="block w-full rounded-lg border-gray-300 shadow-sm text-sm" />
            </label>
          </div>
          <label className="block text-sm text-gray-700 mb-3">
            Причина переноса <span className="text-red-500">*</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              className="block w-full rounded-lg border-gray-300 shadow-sm text-sm" />
          </label>
          {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={btnPlain}>Отмена</button>
            <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
              {saving ? 'Сохранение…' : 'Перенести'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

export default InstallerWorkPanel
