import { CreateOrderAddonData, AddonKind, OpeningType, ADDON_KIND_DISPLAY } from '../../types/orders'
import AutoResizeTextarea from '../../components/common/AutoResizeTextarea'

interface Props {
  addons: CreateOrderAddonData[]
  onChange: (addons: CreateOrderAddonData[]) => void
}

const emptyAddon = (): CreateOrderAddonData => ({
  kind: 'extra',
  name: '',
  quantity: 1,
  size: '',
  opening_type: '',
  price: null,
  amount: null,
  comment: '',
})

const fieldCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const OrderAddonsEditor = ({ addons, onChange }: Props) => {
  const addAddon = () => onChange([...addons, emptyAddon()])
  const copyAddon = (idx: number) => {
    const copy = { ...addons[idx] }
    const next = [...addons]
    next.splice(idx + 1, 0, copy)
    onChange(next)
  }
  const removeAddon = (idx: number) => onChange(addons.filter((_, i) => i !== idx))
  const updateAddon = (idx: number, field: keyof CreateOrderAddonData, value: any) => {
    const next = addons.map((a, i) => {
      if (i !== idx) return a
      const updated: CreateOrderAddonData = { ...a, [field]: value }
      // Автоподсчёт суммы
      if (field === 'price' || field === 'quantity') {
        const price = field === 'price' ? value : a.price
        const qty = field === 'quantity' ? value : a.quantity
        if (price != null && qty != null && price !== '' && qty !== '') {
          updated.amount = Number(price) * Number(qty)
        }
      }
      return updated
    })
    onChange(next)
  }

  if (addons.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-gray-500 mb-3">Сопутствующих позиций нет</p>
        <button
          type="button"
          onClick={addAddon}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-300 hover:bg-primary-50 rounded-lg"
        >
          + Добавить позицию
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {addons.map((addon, idx) => (
        <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          {/* Шапка */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 flex-1">
              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">
                {ADDON_KIND_DISPLAY[addon.kind as AddonKind]}
              </span>
              <span className="text-xs text-gray-500">Позиция #{idx + 1}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => copyAddon(idx)}
                title="Копировать"
                className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => removeAddon(idx)}
                title="Удалить"
                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* Тип и наименование */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className={labelCls}>Тип</label>
              <select
                value={addon.kind}
                onChange={(e) => updateAddon(idx, 'kind', e.target.value as AddonKind)}
                className={fieldCls}
              >
                {(Object.keys(ADDON_KIND_DISPLAY) as AddonKind[]).map((k) => (
                  <option key={k} value={k}>{ADDON_KIND_DISPLAY[k]}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Наименование</label>
              <AutoResizeTextarea
                value={addon.name}
                onChange={(e) => updateAddon(idx, 'name', e.target.value)}
                className={fieldCls}
                placeholder="Например: Короб STANDARD PRO 80мм"
              />
            </div>
          </div>

          {/* Количество, размер, открывание, цена, сумма */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
            <div>
              <label className={labelCls}>Кол-во</label>
              <input
                type="text"
                value={addon.quantity ?? ''}
                onChange={(e) => updateAddon(idx, 'quantity', e.target.value)}
                className={`${fieldCls} text-right`}
              />
            </div>
            <div>
              <label className={labelCls}>Размер</label>
              <input
                type="text"
                value={addon.size ?? ''}
                onChange={(e) => updateAddon(idx, 'size', e.target.value)}
                className={fieldCls}
                placeholder="мм"
              />
            </div>
            <div>
              <label className={labelCls}>Открывание</label>
              <select
                value={addon.opening_type ?? ''}
                onChange={(e) => updateAddon(idx, 'opening_type', e.target.value as OpeningType)}
                className={fieldCls}
              >
                <option value="">—</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="B_INVERSO">B Inverso</option>
                <option value="C">C</option>
                <option value="D">D</option>
                <option value="D_INVERSO">D Inverso</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Цена</label>
              <input
                type="text"
                value={addon.price ?? ''}
                onChange={(e) => updateAddon(idx, 'price', e.target.value)}
                className={`${fieldCls} text-right`}
                placeholder="₽"
              />
            </div>
            <div>
              <label className={labelCls}>Сумма</label>
              <input
                type="text"
                value={addon.amount ?? ''}
                onChange={(e) => updateAddon(idx, 'amount', e.target.value)}
                className={`${fieldCls} text-right`}
                placeholder="₽"
              />
            </div>
          </div>

          {/* Комментарий */}
          <div>
            <label className={labelCls}>Комментарий</label>
            <AutoResizeTextarea
              value={addon.comment ?? ''}
              onChange={(e) => updateAddon(idx, 'comment', e.target.value)}
              className={fieldCls}
              placeholder="Комментарий по позиции..."
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addAddon}
        className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary-600 border border-primary-300 hover:bg-primary-50 rounded-xl"
      >
        + Добавить позицию
      </button>
    </div>
  )
}

export default OrderAddonsEditor
