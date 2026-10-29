import { useState } from 'react'
import { Link } from 'react-router-dom'
import { installationsAPI, apiErrorText } from '../../api/installations'
import { QUEUED_MESSAGE } from '../../services/sync'
import { Installation, formatPeriod } from '../../types/installations'
import ModalPortal from './ModalPortal'

interface Props {
  inst: Installation
  onChanged: (inst?: Installation) => void
}

const btn = 'px-3 py-2 text-sm rounded-lg border transition-all disabled:opacity-50'
const btnPrimary = `${btn} border-primary-600 bg-primary-600 text-white hover:bg-primary-700`
const btnPlain = `${btn} border-gray-300 text-gray-700 bg-white hover:bg-gray-50`

/**
 * Работа монтажника по запланированному монтажу: позвонить, «не дозвонился»,
 * перенести дату, приложить акт и фото результата (в т.ч. без связи),
 * завершить полностью или частично, завести рекламацию.
 */
const InstallerWorkPanel = ({ inst, onChanged }: Props) => {
  const visit = inst.current_visit
  const [busy, setBusy] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  // Файлы, ушедшие в офлайн-очередь: сервер их ещё не видит, но монтажник
  // приложил акт и должен иметь возможность завершить монтаж
  const [queued, setQueued] = useState<{ kind: 'act' | 'result'; name: string }[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const hasAct = inst.files.some((f) => f.kind === 'act' && f.visit === visit?.id)
    || queued.some((q) => q.kind === 'act')

  const upload = async (kind: 'act' | 'result', files: File[]) => {
    if (!files.length) return
    setBusy(true)
    setNotice(null)
    let wentOffline = false
    try {
      for (const f of files) {
        try {
          await installationsAPI.uploadWorkFile(inst.id, kind, f)
        } catch (err: any) {
          if (err?.message !== QUEUED_MESSAGE) throw err
          wentOffline = true
          setQueued((q) => [...q, { kind, name: f.name }])
        }
      }
      if (wentOffline) {
        setNotice('Нет связи: файлы сохранены в телефоне и отправятся, когда появится интернет.')
      } else {
        onChanged()
      }
    } catch (err) {
      alert(apiErrorText(err, 'Не удалось загрузить файл'))
    } finally {
      setBusy(false)
    }
  }

  const complete = async (partial: boolean) => {
    const question = partial
      ? 'Отметить: часть работ выполнена, монтаж продолжится?'
      : 'Монтаж завершён полностью?'
    if (!window.confirm(question)) return
    setBusy(true)
    try {
      onChanged(await installationsAPI.complete(inst.id, partial))
    } catch (err: any) {
      if (err?.message === QUEUED_MESSAGE) {
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

  const fileButton = (kind: 'act' | 'result', label: string, primary: boolean) => (
    <label className={`${primary ? btnPrimary : btnPlain} cursor-pointer inline-flex items-center ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
      {label}
      <input
        type="file"
        multiple
        className="hidden"
        accept={kind === 'act' ? 'image/*,application/pdf' : 'image/*,video/*'}
        onChange={(e) => { upload(kind, Array.from(e.target.files || [])); e.target.value = '' }}
      />
    </label>
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-primary-200 ring-1 ring-primary-100 p-4 mb-4 space-y-4">
      <h2 className="text-sm font-semibold text-primary-700 uppercase tracking-wider">Работа на монтаже</h2>

      {visit?.reschedule_requested_at && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Перенос на {formatPeriod(visit.date_from, visit.date_to)} ждёт подтверждения сервис-менеджера.
          Клиенту СМС о новой дате уйдёт после подтверждения.
        </p>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-2">Договоритесь с клиентом о времени</p>
        <div className="flex flex-wrap gap-2">
          {inst.contact_phone && (
            <a href={`tel:${inst.contact_phone}`} className={btnPrimary}>📞 Позвонить {inst.contact_name}</a>
          )}
          <button type="button" disabled={busy} onClick={callFailed} className={btnPlain}>
            {inst.installer_notified_at ? 'Повторно отправить уведомление' : 'Не дозвонился — отправить уведомление'}
          </button>
          <button type="button" disabled={busy} onClick={() => setRescheduling(true)} className={btnPlain}>
            Перенести дату
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">По факту работ</p>
        <div className="flex flex-wrap gap-2">
          {fileButton('act', '📎 Прикрепить акт с подписью клиента', !hasAct)}
          {fileButton('result', '📷 Фото/видео дверей', false)}
        </div>
        {queued.length > 0 && (
          <ul className="mt-2 text-xs text-amber-700 space-y-0.5">
            {queued.map((q, i) => <li key={i}>⏳ {q.kind === 'act' ? 'Акт' : 'Фото/видео'}: {q.name} — ждёт связи</li>)}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
        <button type="button" disabled={busy || !hasAct} onClick={() => complete(false)}
          className={`${btn} border-green-600 bg-green-600 text-white hover:bg-green-700`}>
          ✓ Монтаж завершён
        </button>
        <button type="button" disabled={busy || !hasAct} onClick={() => complete(true)} className={btnPlain}>
          Монтаж завершён частично
        </button>
        <Link
          to={`/complaints/create?order=${inst.order}&installation=${inst.id}`}
          className={`${btn} border-red-200 text-red-700 bg-white hover:bg-red-50`}
        >
          Создать рекламацию
        </Link>
      </div>
      {!hasAct && <p className="text-xs text-gray-500">Завершить монтаж можно после того, как приложен акт.</p>}

      {notice && <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{notice}</p>}

      {rescheduling && visit && (
        <RescheduleModal
          inst={inst}
          onClose={() => setRescheduling(false)}
          onDone={(updated) => { setRescheduling(false); onChanged(updated) }}
        />
      )}
    </div>
  )
}

const RescheduleModal = ({ inst, onClose, onDone }: {
  inst: Installation
  onClose: () => void
  onDone: (inst: Installation) => void
}) => {
  const visit = inst.current_visit!
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
