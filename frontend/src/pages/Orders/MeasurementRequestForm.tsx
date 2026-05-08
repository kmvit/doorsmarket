import { useEffect, useState } from 'react'
import { ordersAPI } from '../../api/orders'
import { MeasurementRequest, MeasurementPayer, CreateMeasurementRequestData } from '../../types/orders'

interface Props {
  orderId: number
  defaultClientName?: string
  defaultPhone?: string
  existing?: MeasurementRequest | null
  onClose: () => void
  onSaved: (mr: MeasurementRequest) => void
}

const MeasurementRequestForm = ({ orderId, defaultClientName = '', defaultPhone = '', existing, onClose, onSaved }: Props) => {
  const [form, setForm] = useState<CreateMeasurementRequestData>({
    contact_name: existing?.contact_name || defaultClientName,
    contact_position: existing?.contact_position || '',
    contact_phone: existing?.contact_phone || defaultPhone,
    desired_date: existing?.desired_date || null,
    payer: (existing?.payer as MeasurementPayer) || 'client',
    comment: existing?.comment || '',
  })
  const [openingPlan, setOpeningPlan] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const setField = <K extends keyof CreateMeasurementRequestData>(field: K, value: CreateMeasurementRequestData[K]) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.contact_name.trim()) { setError('ФИО контактного лица обязательно'); return }
    if (!form.contact_phone.trim()) { setError('Телефон обязателен'); return }
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await ordersAPI.saveMeasurementRequest(orderId, form, openingPlan)
      onSaved(result)
      onClose()
    } catch (err: any) {
      const detail = err.response?.data
      setError(typeof detail === 'object' ? Object.values(detail).flat().join(', ') : (err.message || 'Ошибка сохранения'))
      setIsSubmitting(false)
    }
  }

  const inputCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{existing ? 'Заявка на замер' : 'Создать заявку на замер'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ФИО контактного лица *</label>
            <input type="text" value={form.contact_name} onChange={(e) => setField('contact_name', e.target.value)} className={inputCls} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Должность</label>
              <input type="text" value={form.contact_position} onChange={(e) => setField('contact_position', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Телефон *</label>
              <input type="tel" value={form.contact_phone} onChange={(e) => setField('contact_phone', e.target.value)} className={inputCls} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Желаемая дата</label>
              <input type="date" value={form.desired_date || ''} onChange={(e) => setField('desired_date', e.target.value || null)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Кто оплачивает</label>
              <select value={form.payer} onChange={(e) => setField('payer', e.target.value as MeasurementPayer)} className={inputCls}>
                <option value="client">Клиент</option>
                <option value="salon">Салон</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">План открывания (PDF/JPG)</label>
            {existing?.opening_plan_url && (
              <a href={existing.opening_plan_url} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline mb-1 block">Текущий файл</a>
            )}
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setOpeningPlan(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-primary-50 file:text-primary-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
            <textarea value={form.comment} onChange={(e) => setField('comment', e.target.value)} className={inputCls} rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl">Отмена</button>
            <button type="submit" disabled={isSubmitting} className="px-5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">
              {isSubmitting ? 'Сохранение...' : (existing ? 'Сохранить' : 'Создать заявку')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MeasurementRequestForm
