import { useEffect, useRef, useState } from 'react'
import { designersAPI } from '../../api/orders'
import {
  Designer, OrderProbability, OrderSalesFields, ORDER_PROBABILITY_DISPLAY,
} from '../../types/orders'
import PhoneInput from '../common/PhoneInput'

/** Состояние блока в форме: дизайнер хранится целиком, чтобы показать карточку. */
export interface SalesFieldsValue {
  has_designer: boolean | null
  designer: Designer | null
  payment_month: string | null
  order_probability: OrderProbability | ''
}

export const EMPTY_SALES_FIELDS: SalesFieldsValue = {
  has_designer: null,
  designer: null,
  payment_month: null,
  order_probability: '',
}

/** Значение блока → поля запроса на сервер. */
export function salesFieldsPayload(v: SalesFieldsValue): OrderSalesFields {
  return {
    has_designer: v.has_designer,
    designer: v.has_designer ? v.designer?.id ?? null : null,
    payment_month: v.payment_month,
    order_probability: v.order_probability,
  }
}

/**
 * Ошибка заполнения или null. При создании заказа ответ «есть ли дизайнер»
 * обязателен; при редактировании старого заказа его можно оставить пустым.
 */
export function salesFieldsError(v: SalesFieldsValue, requireAnswer: boolean): string | null {
  if (requireAnswer && v.has_designer === null) return 'Укажите, есть ли у заказа дизайнер'
  if (v.has_designer && !v.designer) return 'Выберите дизайнера из списка или заведите на него карточку'
  return null
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

const monthValue = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`

export const formatPaymentMonth = (value: string | null) => {
  if (!value) return ''
  const [y, m] = value.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** Месяцы для выбора: с текущего на полтора года вперёд (+ уже сохранённый, если он раньше). */
function monthOptions(current: string | null) {
  const now = new Date()
  const values: string[] = []
  for (let i = 0; i < 18; i++) {
    values.push(monthValue(new Date(now.getFullYear(), now.getMonth() + i, 1)))
  }
  if (current && !values.includes(current)) values.unshift(current)
  return values.map((value) => ({ value, label: formatPaymentMonth(value) }))
}

interface Props {
  value: SalesFieldsValue
  onChange: (value: SalesFieldsValue) => void
  // Подсветить незаполненное (после попытки сохранить)
  showErrors?: boolean
  requireAnswer?: boolean
  title?: string
}

const inputCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'

const OrderSalesFieldsBlock = ({ value, onChange, showErrors = false, requireAnswer = true, title = 'Дизайнер и оплата' }: Props) => {
  const set = (patch: Partial<SalesFieldsValue>) => onChange({ ...value, ...patch })
  const error = showErrors ? salesFieldsError(value, requireAnswer) : null

  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 ${error ? 'border-2 border-red-400' : 'border border-gray-200'}`}>
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">{title}</h2>
      {error && <div className="mb-3 text-sm font-medium text-red-600">{error}</div>}

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Дизайнер{requireAnswer ? ' *' : ''}
        </label>
        <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5 text-sm">
          {[
            { v: true, label: 'Да' },
            { v: false, label: 'Нет' },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => set({ has_designer: opt.v, designer: opt.v ? value.designer : null })}
              className={`px-5 py-1.5 rounded-md font-medium transition-all ${
                value.has_designer === opt.v ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {value.has_designer && (
        <div className="mb-4">
          <DesignerPicker value={value.designer} onChange={(designer) => set({ designer })} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Когда клиент планирует оплачивать?</label>
          <select
            value={value.payment_month || ''}
            onChange={(e) => set({ payment_month: e.target.value || null })}
            className={inputCls}
          >
            <option value="">Не указано</option>
            {monthOptions(value.payment_month).map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Вероятность оформления заказа</label>
          <select
            value={value.order_probability}
            onChange={(e) => set({ order_probability: e.target.value as OrderProbability | '' })}
            className={inputCls}
          >
            <option value="">Не указано</option>
            {(Object.keys(ORDER_PROBABILITY_DISPLAY) as OrderProbability[]).map((p) => (
              <option key={p} value={p}>{ORDER_PROBABILITY_DISPLAY[p]}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

// ---------- Выбор дизайнера: поиск по списку или новая карточка ----------

const DesignerPicker = ({ value, onChange }: { value: Designer | null; onChange: (d: Designer | null) => void }) => {
  const [creating, setCreating] = useState(false)

  if (value) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3">
        <DesignerSummary designer={value} />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-sm font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap"
        >
          Изменить
        </button>
      </div>
    )
  }

  if (creating) {
    return (
      <DesignerCreateForm
        onCancel={() => setCreating(false)}
        onCreated={(d) => { setCreating(false); onChange(d) }}
      />
    )
  }

  return <DesignerSearch onSelect={onChange} onCreate={() => setCreating(true)} />
}

const DesignerSummary = ({ designer }: { designer: Designer }) => (
  <div className="text-sm">
    <div className="font-medium text-gray-900">{designer.full_name}</div>
    <div className="text-gray-600">
      {designer.phone}
      {designer.studio && <> · {designer.studio}</>}
      {designer.bonus_percent != null && <> · бонус {designer.bonus_percent}%</>}
    </div>
  </div>
)

const DesignerSearch = ({ onSelect, onCreate }: { onSelect: (d: Designer) => void; onCreate: () => void }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Designer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const id = ++requestId.current
    const t = setTimeout(async () => {
      setIsLoading(true)
      try {
        const data = await designersAPI.search(query.trim())
        // Ответ на устаревший запрос (пользователь уже печатает дальше) не показываем
        if (id === requestId.current) { setResults(data); setLoadError(false) }
      } catch {
        if (id === requestId.current) setLoadError(true)
      } finally {
        if (id === requestId.current) setIsLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск дизайнера: фамилия, имя, студия или телефон"
        className={inputCls}
        autoFocus
      />
      <div className="mt-2 max-h-60 overflow-auto divide-y divide-gray-100">
        {isLoading && results.length === 0 && <div className="py-2 text-sm text-gray-500">Ищем…</div>}
        {loadError && <div className="py-2 text-sm text-red-600">Не удалось загрузить список дизайнеров</div>}
        {!isLoading && !loadError && results.length === 0 && (
          <div className="py-2 text-sm text-gray-500">
            {query.trim() ? 'Никого не нашли — заведите карточку' : 'Дизайнеров пока нет — заведите первую карточку'}
          </div>
        )}
        {results.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelect(d)}
            className="block w-full text-left px-2 py-2 hover:bg-primary-50 rounded"
          >
            <DesignerSummary designer={d} />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700"
      >
        + Новый дизайнер
      </button>
    </div>
  )
}

const DesignerCreateForm = ({ onCancel, onCreated }: { onCancel: () => void; onCreated: (d: Designer) => void }) => {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [studio, setStudio] = useState('')
  const [bonus, setBonus] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  const save = async () => {
    const next: Record<string, string> = {}
    if (!fullName.trim()) next.full_name = 'Укажите фамилию и имя'
    if (phone.length !== 12) next.phone = 'Укажите телефон полностью'
    if (bonus && !/^\d{1,2}$/.test(bonus)) next.bonus_percent = 'Бонус — число от 0 до 99'
    setErrors(next)
    if (Object.keys(next).length) return

    setIsSaving(true)
    try {
      const designer = await designersAPI.create({
        full_name: fullName.trim(),
        phone,
        studio: studio.trim(),
        bonus_percent: bonus ? Number(bonus) : null,
      })
      onCreated(designer)
    } catch (err: any) {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        setErrors(Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.join(' ') : String(v)]),
        ))
      } else {
        setErrors({ form: err.message || 'Не удалось сохранить дизайнера' })
      }
    } finally {
      setIsSaving(false)
    }
  }

  const fieldError = (key: string) => errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]}</p>

  // Это не <form>: блок живёт внутри формы заказа, а вложенные формы запрещены —
  // Enter или «Сохранить» отправили бы весь заказ
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="text-sm font-semibold text-gray-800 mb-3">Новый дизайнер</div>
      {errors.form && <div className="mb-2 text-sm text-red-600">{errors.form}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Фамилия и имя *</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} autoFocus />
          {fieldError('full_name')}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Телефон *</label>
          <PhoneInput value={phone} onChange={setPhone} className="!px-3 !py-2 !rounded-lg text-sm" />
          {fieldError('phone')}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Студия</label>
          <input type="text" value={studio} onChange={(e) => setStudio(e.target.value)} className={inputCls} />
          {fieldError('studio')}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Бонус, %</label>
          <input
            type="text"
            inputMode="numeric"
            value={bonus}
            onChange={(e) => setBonus(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="Например, 10"
            className={inputCls}
          />
          {fieldError('bonus_percent')}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
        >
          {isSaving ? 'Сохранение…' : 'Сохранить дизайнера'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg"
        >
          Отмена
        </button>
      </div>
    </div>
  )
}

export default OrderSalesFieldsBlock
