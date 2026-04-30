import { CreateOrderItemData, DoorType, OpeningType } from '../../types/orders'

interface Props {
  items: CreateOrderItemData[]
  onChange: (items: CreateOrderItemData[]) => void
}

const emptyItem = (): CreateOrderItemData => ({
  opening_number: 1,
  room_name: '',
  model_name: '',
  quantity: 1,
  price: null,
  amount: null,
  door_type: '',
  opening_type: '',
  door_height: null,
  door_width: null,
  notes: '',
  addons: [],
})

const selectCls = 'rounded border-gray-300 text-sm w-full focus:border-primary-500 focus:ring-primary-500 py-1'
const inputCls = 'rounded border-gray-300 text-sm w-full focus:border-primary-500 focus:ring-primary-500 py-1'

const OrderItemsEditor = ({ items, onChange }: Props) => {
  const addItem = () => {
    const maxNum = items.reduce((m, i) => Math.max(m, i.opening_number || 0), 0)
    onChange([...items, { ...emptyItem(), opening_number: maxNum + 1 }])
  }

  const copyItem = (idx: number) => {
    const copy = { ...items[idx], addons: [...(items[idx].addons || [])] }
    const newItems = [...items]
    newItems.splice(idx + 1, 0, copy)
    onChange(newItems)
  }

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: keyof CreateOrderItemData, value: any) => {
    const updated = items.map((item, i) => {
      if (i !== idx) return item
      const next = { ...item, [field]: value }
      // Автоподсчёт суммы
      if (field === 'price' || field === 'quantity') {
        const price = field === 'price' ? value : item.price
        const qty = field === 'quantity' ? value : item.quantity
        if (price != null && qty != null) next.amount = Number(price) * Number(qty)
      }
      return next
    })
    onChange(updated)
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-sm mb-3">Проёмов нет. Добавьте первый.</p>
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-all"
        >
          <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Добавить проём
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-12">№</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-28">Помещение</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Модель</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-24">Тип двери</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-28">Открывание</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-16">Выс.</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-16">Шир.</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-12">Кол.</th>
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 w-20">Цена</th>
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 w-20">Сумма</th>
              <th className="px-2 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={1}
                    value={item.opening_number}
                    onChange={(e) => updateItem(idx, 'opening_number', Number(e.target.value))}
                    className={inputCls}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={item.room_name}
                    onChange={(e) => updateItem(idx, 'room_name', e.target.value)}
                    className={inputCls}
                    placeholder="Комната"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={item.model_name}
                    onChange={(e) => updateItem(idx, 'model_name', e.target.value)}
                    className={inputCls}
                    placeholder="Модель / артикул"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={item.door_type || ''}
                    onChange={(e) => updateItem(idx, 'door_type', e.target.value as DoorType)}
                    className={selectCls}
                  >
                    <option value="">—</option>
                    <option value="entrance">Входная</option>
                    <option value="interior">Межком.</option>
                    <option value="other">Другое</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={item.opening_type || ''}
                    onChange={(e) => updateItem(idx, 'opening_type', e.target.value as OpeningType)}
                    className={selectCls}
                  >
                    <option value="">—</option>
                    <option value="left">Лев.</option>
                    <option value="right">Прав.</option>
                    <option value="left_inner">Лев. внутр.</option>
                    <option value="right_inner">Прав. внутр.</option>
                    <option value="sliding">Раздвижное</option>
                    <option value="other">Другое</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    value={item.door_height ?? ''}
                    onChange={(e) => updateItem(idx, 'door_height', e.target.value ? Number(e.target.value) : null)}
                    className={inputCls}
                    placeholder="мм"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    value={item.door_width ?? ''}
                    onChange={(e) => updateItem(idx, 'door_width', e.target.value ? Number(e.target.value) : null)}
                    className={inputCls}
                    placeholder="мм"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={1}
                    value={item.quantity || 1}
                    onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                    className={inputCls}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    value={item.price ?? ''}
                    onChange={(e) => updateItem(idx, 'price', e.target.value ? Number(e.target.value) : null)}
                    className={`${inputCls} text-right`}
                    placeholder="₽"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    value={item.amount ?? ''}
                    onChange={(e) => updateItem(idx, 'amount', e.target.value ? Number(e.target.value) : null)}
                    className={`${inputCls} text-right`}
                    placeholder="₽"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyItem(idx)}
                      title="Копировать строку"
                      className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      title="Удалить строку"
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
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
        onClick={addItem}
        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-300 hover:bg-primary-50 rounded-lg transition-all"
      >
        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
        </svg>
        Добавить проём
      </button>
    </div>
  )
}

export default OrderItemsEditor
