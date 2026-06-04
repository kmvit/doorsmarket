import { CreateOrderItemData, DoorType, OpeningType, OPENING_TYPE_DISPLAY } from '../../types/orders'
import AutoResizeTextarea from '../../components/common/AutoResizeTextarea'

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
  recommended_opening_height: null,
  recommended_opening_width: null,
  notes: '',
})

const fieldCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const OrderItemsEditor = ({ items, onChange }: Props) => {
  const addItem = () => {
    const maxNum = items.reduce((m, i) => Math.max(m, i.opening_number || 0), 0)
    onChange([...items, { ...emptyItem(), opening_number: maxNum + 1 }])
  }

  const copyItem = (idx: number) => {
    const copy = { ...items[idx] }
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
      const next: CreateOrderItemData = { ...item, [field]: value }
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
    <div className="space-y-4">
      {items.map((item, idx) => (
        <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          {/* Шапка карточки */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">№ проёма:</label>
                <input
                  type="number"
                  min={1}
                  value={item.opening_number}
                  onChange={(e) => updateItem(idx, 'opening_number', Number(e.target.value))}
                  className="w-16 rounded border-gray-300 text-sm py-1"
                />
              </div>
              <h3 className="text-sm font-semibold text-gray-700">
                Позиция {idx + 1}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => copyItem(idx)}
                title="Копировать"
                className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                title="Удалить"
                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* Основное: Помещение, Кол-во, Цена, Сумма */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="col-span-2 md:col-span-2">
              <label className={labelCls}>Помещение</label>
              <input
                type="text"
                value={item.room_name}
                onChange={(e) => updateItem(idx, 'room_name', e.target.value)}
                className={fieldCls}
                placeholder="Например: Спальня, Гостиная"
              />
            </div>
            <div>
              <label className={labelCls}>Кол-во</label>
              <input
                type="number"
                min={1}
                value={item.quantity || 1}
                onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                className={fieldCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Цена</label>
                <input
                  type="number"
                  min={0}
                  value={item.price ?? ''}
                  onChange={(e) => updateItem(idx, 'price', e.target.value ? Number(e.target.value) : null)}
                  className={`${fieldCls} text-right`}
                  placeholder="₽"
                />
              </div>
              <div>
                <label className={labelCls}>Сумма</label>
                <input
                  type="number"
                  min={0}
                  value={item.amount ?? ''}
                  onChange={(e) => updateItem(idx, 'amount', e.target.value ? Number(e.target.value) : null)}
                  className={`${fieldCls} text-right`}
                  placeholder="₽"
                />
              </div>
            </div>
          </div>

          {/* Модель — авто-растущая textarea */}
          <div className="mb-3">
            <label className={labelCls}>Модель / Наименование</label>
            <AutoResizeTextarea
              value={item.model_name}
              onChange={(e) => updateItem(idx, 'model_name', e.target.value)}
              className={fieldCls}
              placeholder="Полное название модели полотна"
            />
          </div>

          {/* Тип двери, Открывание, Размер двери */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
              <label className={labelCls}>Тип двери</label>
              <select
                value={item.door_type || ''}
                onChange={(e) => updateItem(idx, 'door_type', e.target.value as DoorType)}
                className={fieldCls}
              >
                <option value="">—</option>
                <option value="entrance">Входная</option>
                <option value="interior">Межкомнатная</option>
                <option value="other">Другое</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Открывание</label>
              <select
                value={item.opening_type || ''}
                onChange={(e) => updateItem(idx, 'opening_type', e.target.value as OpeningType)}
                className={fieldCls}
                title={item.opening_type ? OPENING_TYPE_DISPLAY[item.opening_type] : ''}
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
              <label className={labelCls}>Высота полотна, мм</label>
              <input
                type="number"
                min={0}
                value={item.door_height ?? ''}
                onChange={(e) => updateItem(idx, 'door_height', e.target.value ? Number(e.target.value) : null)}
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls}>Ширина полотна, мм</label>
              <input
                type="number"
                min={0}
                value={item.door_width ?? ''}
                onChange={(e) => updateItem(idx, 'door_width', e.target.value ? Number(e.target.value) : null)}
                className={fieldCls}
              />
            </div>
          </div>

          {/* Рек. размер проёма */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelCls}>Рек. высота проёма, мм</label>
              <input
                type="number"
                min={0}
                value={item.recommended_opening_height ?? ''}
                onChange={(e) => updateItem(idx, 'recommended_opening_height', e.target.value ? Number(e.target.value) : null)}
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls}>Рек. ширина проёма, мм</label>
              <input
                type="number"
                min={0}
                value={item.recommended_opening_width ?? ''}
                onChange={(e) => updateItem(idx, 'recommended_opening_width', e.target.value ? Number(e.target.value) : null)}
                className={fieldCls}
              />
            </div>
          </div>

          {/* Примечание */}
          <div>
            <label className={labelCls}>Примечание</label>
            <AutoResizeTextarea
              value={item.notes ?? ''}
              onChange={(e) => updateItem(idx, 'notes', e.target.value)}
              className={fieldCls}
              placeholder="Комментарий по этой двери..."
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addItem}
        className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary-600 border border-primary-300 hover:bg-primary-50 rounded-xl transition-all"
      >
        <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
        </svg>
        Добавить проём
      </button>
    </div>
  )
}

export default OrderItemsEditor
