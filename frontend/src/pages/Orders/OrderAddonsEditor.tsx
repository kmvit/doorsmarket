import { CreateOrderAddonData, AddonKind, OpeningType, ADDON_KIND_DISPLAY } from '../../types/orders'

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
    const next = addons.map((a, i) => (i === idx ? { ...a, [field]: value } : a))
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

  const cellInput = 'w-full rounded border-gray-300 text-sm'

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-32">Тип</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 min-w-[280px]">Наименование</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-20">Кол.</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-24">Размер</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-20">Откр.</th>
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 w-20">Цена</th>
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 w-20">Сумма</th>
              <th className="px-2 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {addons.map((addon, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-2 py-1.5 align-top">
                  <select
                    value={addon.kind}
                    onChange={(e) => updateAddon(idx, 'kind', e.target.value as AddonKind)}
                    className="rounded border-gray-300 text-sm"
                  >
                    {(Object.keys(ADDON_KIND_DISPLAY) as AddonKind[]).map((k) => (
                      <option key={k} value={k}>{ADDON_KIND_DISPLAY[k]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5 align-top">
                  <textarea
                    value={addon.name}
                    onChange={(e) => updateAddon(idx, 'name', e.target.value)}
                    rows={2}
                    className="w-full min-w-[280px] rounded border-gray-300 text-sm leading-snug resize-y whitespace-pre-wrap break-words"
                    placeholder="Наименование"
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <input
                    type="text"
                    value={addon.quantity ?? ''}
                    onChange={(e) => updateAddon(idx, 'quantity', e.target.value)}
                    className={`${cellInput} text-right`}
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <input
                    type="text"
                    value={addon.size ?? ''}
                    onChange={(e) => updateAddon(idx, 'size', e.target.value)}
                    className={cellInput}
                    placeholder="мм"
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <select
                    value={addon.opening_type ?? ''}
                    onChange={(e) => updateAddon(idx, 'opening_type', e.target.value as OpeningType)}
                    className="rounded border-gray-300 text-sm"
                  >
                    <option value="">—</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="B_INVERSO">B Inv.</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                    <option value="D_INVERSO">D Inv.</option>
                  </select>
                </td>
                <td className="px-2 py-1.5 align-top">
                  <input
                    type="text"
                    value={addon.price ?? ''}
                    onChange={(e) => updateAddon(idx, 'price', e.target.value)}
                    className={`${cellInput} text-right`}
                    placeholder="₽"
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <input
                    type="text"
                    value={addon.amount ?? ''}
                    onChange={(e) => updateAddon(idx, 'amount', e.target.value)}
                    className={`${cellInput} text-right`}
                    placeholder="₽"
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyAddon(idx)}
                      title="Копировать"
                      className="p-1 text-gray-400 hover:text-primary-600"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAddon(idx)}
                      title="Удалить"
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

export default OrderAddonsEditor
