import { OrderRefusal, REFUSAL_REASONS, PURCHASE_REASONS } from '../../types/orders'

export const refusalComplete = (value: OrderRefusal) => {
  if (value.reason === 'postponed') return true
  if (value.reason === 'other') return Boolean(value.detail?.trim())
  return value.reason === 'bought_elsewhere' && Boolean(value.store?.trim() && value.purchase_reason)
    && (value.purchase_reason !== 'other' || Boolean(value.detail?.trim()))
}

export function refusalSummary(value?: OrderRefusal) {
  if (!value?.reason) return 'Причина не указана'
  return [REFUSAL_REASONS[value.reason], value.store,
    value.purchase_reason && PURCHASE_REASONS[value.purchase_reason], value.detail].filter(Boolean).join(' · ')
}

export default function OrderRefusalFields({ value, onChange }: {
  value: OrderRefusal
  onChange: (value: OrderRefusal) => void
}) {
  const field = 'mt-1 block w-full rounded-lg border-gray-300 text-sm'
  return (
    <fieldset className="space-y-3 text-sm">
      <label className="block">Причина отказа
        <select required className={field} value={value.reason || ''}
          onChange={e => onChange({ reason: e.target.value as OrderRefusal['reason'] })}>
          <option value="">Выберите причину</option>
          {Object.entries(REFUSAL_REASONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      {value.reason === 'bought_elsewhere' && <>
        <label className="block">Где купил?
          <input required maxLength={500} className={field} value={value.store || ''}
            onChange={e => onChange({ ...value, store: e.target.value })} />
        </label>
        <label className="block">Почему купил в другом месте?
          <select required className={field} value={value.purchase_reason || ''}
            onChange={e => onChange({ ...value, detail: undefined, purchase_reason: e.target.value as OrderRefusal['purchase_reason'] })}>
            <option value="">Выберите причину</option>
            {Object.entries(PURCHASE_REASONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </>}
      {(value.reason === 'other' || value.purchase_reason === 'other') && <label className="block">Уточните причину
        <textarea required maxLength={1000} className={field} value={value.detail || ''}
          onChange={e => onChange({ ...value, detail: e.target.value })} />
      </label>}
    </fieldset>
  )
}
