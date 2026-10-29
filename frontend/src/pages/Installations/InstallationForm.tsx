import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { installationsAPI, apiErrorText } from '../../api/installations'
import {
  InstallationFields, InstallationFileKind, INSTALLATION_FILE_KIND_DISPLAY,
} from '../../types/installations'
import PhoneInput from '../../components/common/PhoneInput'

const EMPTY: InstallationFields = {
  is_paid: false,
  work_description: '',
  collection_finish: '',
  planned_delivery_date: null,
  desired_date_comment: '',
  contact_name: '',
  contact_phone: '',
}

// Файлы при оформлении: обязательные помечаются звёздочкой (бланк — только без замера)
const OPTIONAL_KINDS: InstallationFileKind[] = ['drawings', 'extra', 'photo', 'video']

const inputClass = 'w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'
const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

/** Оформление монтажа (/orders/installations/new?order=ID) и правка (/orders/installations/:id/edit) */
const InstallationForm = () => {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const orderId = Number(searchParams.get('order')) || null

  const [fields, setFields] = useState<InstallationFields>(EMPTY)
  // При оформлении «оплачен / не оплачен» не выбрано, пока менеджер не ответит
  const [paidAnswer, setPaidAnswer] = useState<'' | 'yes' | 'no'>('')
  const [header, setHeader] = useState<{ order: number; client: string; address: string; count: number } | null>(null)
  const [blankRequired, setBlankRequired] = useState(false)
  const [files, setFiles] = useState<Partial<Record<InstallationFileKind, File[]>>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        if (isEdit) {
          const inst = await installationsAPI.getById(Number(id))
          setFields({
            is_paid: inst.is_paid,
            work_description: inst.work_description,
            collection_finish: inst.collection_finish,
            planned_delivery_date: inst.planned_delivery_date,
            desired_date_comment: inst.desired_date_comment,
            contact_name: inst.contact_name,
            contact_phone: inst.contact_phone,
          })
          setPaidAnswer(inst.is_paid ? 'yes' : 'no')
          setHeader({ order: inst.order, client: inst.client_name, address: inst.address, count: 0 })
        } else if (orderId) {
          const p = await installationsAPI.prefill(orderId)
          setFields({ ...EMPTY, contact_name: p.contact_name, contact_phone: p.contact_phone })
          setBlankRequired(p.measurement_blank_required)
          setHeader({ order: p.order, client: p.client_name, address: p.address, count: p.installations_count })
        } else {
          setError('Не выбран заказ')
        }
      } catch (err) {
        setError(apiErrorText(err, 'Не удалось загрузить данные'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, orderId, isEdit])

  const set = <K extends keyof InstallationFields>(key: K, value: InstallationFields[K]) =>
    setFields((f) => ({ ...f, [key]: value }))

  const requiredKinds: InstallationFileKind[] = [
    ...(blankRequired ? ['measurement_blank' as const] : []),
    'final_kp', 'installation_kp',
  ]

  // Файлы копируем сразу: после сброса input.value FileList уже пуст, а
  // функция обновления состояния выполняется позже
  const addFiles = (kind: InstallationFileKind, list: FileList | null) => {
    const added = Array.from(list || [])
    if (!added.length) return
    setFiles((prev) => ({ ...prev, [kind]: [...(prev[kind] || []), ...added] }))
  }
  const removeFile = (kind: InstallationFileKind, index: number) =>
    setFiles((prev) => ({ ...prev, [kind]: (prev[kind] || []).filter((_, i) => i !== index) }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!paidAnswer) {
      setError('Укажите, оплачен монтаж или нет')
      return
    }
    if (!isEdit) {
      const missing = requiredKinds.filter((k) => !files[k]?.length)
      if (missing.length) {
        setError(`Приложите: ${missing.map((k) => INSTALLATION_FILE_KIND_DISPLAY[k]).join(', ')}`)
        return
      }
    }
    const payload = { ...fields, is_paid: paidAnswer === 'yes' }
    setIsSaving(true)
    try {
      const inst = isEdit
        ? await installationsAPI.update(Number(id), payload)
        : await installationsAPI.create(orderId!, payload, files)
      navigate(`/orders/installations/${inst.id}`, { replace: true })
    } catch (err) {
      setError(apiErrorText(err, 'Не удалось сохранить монтаж'))
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    )
  }

  const renderKind = (kind: InstallationFileKind, required: boolean) => (
    <div key={kind} className="py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-700">
          {INSTALLATION_FILE_KIND_DISPLAY[kind]}
          {required && <span className="text-red-500"> *</span>}
        </span>
        <label className="text-sm text-primary-600 hover:underline cursor-pointer whitespace-nowrap">
          + Добавить
          <input
            type="file"
            multiple
            className="hidden"
            accept={kind === 'photo' ? 'image/*' : kind === 'video' ? 'video/*' : undefined}
            onChange={(e) => { addFiles(kind, e.target.files); e.target.value = '' }}
          />
        </label>
      </div>
      {(files[kind] || []).map((f, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-gray-600 mt-1">
          <span className="truncate flex-1">{f.name}</span>
          <button type="button" onClick={() => removeFile(kind, i)} className="text-red-500 hover:underline">
            убрать
          </button>
        </div>
      ))}
    </div>
  )

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{isEdit ? `Монтаж #${id}` : 'Оформить монтаж'}</h1>
      {header && (
        <p className="text-sm text-gray-500 mb-6">
          Заказ <Link to={`/orders/${header.order}`} className="text-primary-600 hover:underline">#{header.order}</Link>
          {' · '}{header.client}{header.address && ` · ${header.address}`}
        </p>
      )}
      {!isEdit && header && header.count > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          По этому заказу уже оформлено монтажей: {header.count}. Будет создан ещё один.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>
      )}

      {(header || isEdit) && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
            <div>
              <span className={labelClass}>Монтаж оплачен? <span className="text-red-500">*</span></span>
              <div className="flex gap-2">
                {([['yes', 'Оплачен'], ['no', 'Не оплачен']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPaidAnswer(value)}
                    className={`px-4 py-2 text-sm rounded-lg border transition-all ${
                      paidAnswer === value
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-primary-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Что нужно смонтировать <span className="text-red-500">*</span></label>
              <textarea
                required
                rows={3}
                value={fields.work_description}
                onChange={(e) => set('work_description', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Коллекция, покрытие <span className="text-red-500">*</span></label>
              <input
                required
                type="text"
                value={fields.collection_finish}
                onChange={(e) => set('collection_finish', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Плановая дата доставки</label>
                <input
                  type="date"
                  value={fields.planned_delivery_date || ''}
                  onChange={(e) => set('planned_delivery_date', e.target.value || null)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Желаемая дата монтажа и прочие комментарии</label>
              <textarea
                rows={2}
                value={fields.desired_date_comment}
                onChange={(e) => set('desired_date_comment', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Контактное лицо</label>
                <input
                  type="text"
                  value={fields.contact_name}
                  onChange={(e) => set('contact_name', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Телефон контактного лица</label>
                <PhoneInput value={fields.contact_phone} onChange={(v) => set('contact_phone', v)} className={inputClass} />
              </div>
            </div>
          </div>

          {!isEdit && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-1">Пакет документов</h2>
              {!blankRequired && (
                <p className="text-xs text-gray-500 mb-2">
                  Бланк выполненного замера и КП заказа попадут в пакет сами.
                </p>
              )}
              <div className="divide-y divide-gray-100">
                {requiredKinds.map((k) => renderKind(k, true))}
                {OPTIONAL_KINDS.map((k) => renderKind(k, false))}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-sm rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-sm font-medium text-white rounded-xl bg-gradient-to-r from-primary-600 to-cyan-600 hover:from-primary-700 hover:to-cyan-700 shadow-md disabled:opacity-50"
            >
              {isSaving ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Оформить монтаж'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default InstallationForm
