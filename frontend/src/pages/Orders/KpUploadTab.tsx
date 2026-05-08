import { useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { ordersAPI } from '../../api/orders'
import { Salon, ParsedKpData, ParsedKpItem, ADDON_KIND_DISPLAY, AddonKind } from '../../types/orders'

interface Props {
  salons: Salon[]
  defaultSalonId: number
}

const KpUploadTab = ({ salons, defaultSalonId }: Props) => {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedKpData | null>(null)
  const [salonId, setSalonId] = useState<number>(defaultSalonId || 0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [expandedAddons, setExpandedAddons] = useState<Set<number>>(new Set())

  const handleFile = (f: File | null) => {
    setFile(f)
    setParsed(null)
    setError(null)
  }

  const handleParse = async () => {
    if (!file) {
      setError('Выберите PDF-файл КП')
      return
    }
    setIsParsing(true)
    setError(null)
    try {
      const data = await ordersAPI.parseKp(file)
      setParsed(data)
      if (!data.items?.length) {
        setError('Позиции в PDF не распознаны. Можно поправить вручную или создать заказ без позиций.')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось распарсить PDF')
    } finally {
      setIsParsing(false)
    }
  }

  const updateItem = (idx: number, field: keyof ParsedKpItem, value: any) => {
    if (!parsed) return
    const items = [...parsed.items]
    items[idx] = { ...items[idx], [field]: value }
    setParsed({ ...parsed, items })
  }

  const removeItem = (idx: number) => {
    if (!parsed) return
    setParsed({ ...parsed, items: parsed.items.filter((_, i) => i !== idx) })
  }

  const removeAddon = (itemIdx: number, addonIdx: number) => {
    if (!parsed) return
    const items = [...parsed.items]
    const item = { ...items[itemIdx] }
    item.addons = (item.addons || []).filter((_: any, i: number) => i !== addonIdx)
    items[itemIdx] = item
    setParsed({ ...parsed, items })
  }

  const moveAddon = (fromItemIdx: number, addonIdx: number, toItemIdx: number) => {
    if (!parsed) return
    if (fromItemIdx === toItemIdx) return
    const items = [...parsed.items]
    const fromItem = { ...items[fromItemIdx] }
    const toItem = { ...items[toItemIdx] }
    const addon = (fromItem.addons || [])[addonIdx]
    if (!addon) return
    fromItem.addons = (fromItem.addons || []).filter((_: any, i: number) => i !== addonIdx)
    toItem.addons = [...(toItem.addons || []), addon]
    items[fromItemIdx] = fromItem
    items[toItemIdx] = toItem
    setParsed({ ...parsed, items })
  }

  const toggleExpanded = (idx: number) => {
    const next = new Set(expandedAddons)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setExpandedAddons(next)
  }

  const updateHeader = (field: keyof ParsedKpData, value: any) => {
    if (!parsed) return
    setParsed({ ...parsed, [field]: value })
  }

  const handleCreate = async () => {
    if (!parsed) return
    if (!salonId) {
      setError('Выберите салон')
      return
    }
    setIsCreating(true)
    setError(null)
    try {
      const order = await ordersAPI.createFromParsed({
        ...parsed,
        salon: salonId,
        comment,
      })
      navigate(`/orders/${order.id}`)
    } catch (err: any) {
      const detail = err.response?.data
      if (typeof detail === 'object') {
        setError(Object.values(detail).flat().join(', '))
      } else {
        setError(err.message || 'Ошибка создания')
      }
      setIsCreating(false)
    }
  }

  const inputCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Шаг 1: загрузка файла */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">1. Файл КП</h2>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
            className="block flex-1 text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          />
          <button
            type="button"
            onClick={handleParse}
            disabled={!file || isParsing}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50"
          >
            {isParsing ? 'Распознаю...' : 'Распознать КП'}
          </button>
        </div>
        {file && <p className="text-xs text-gray-500 mt-2">Выбран: {file.name}</p>}
      </div>

      {/* Шаг 2: превью + редактирование */}
      {parsed && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">2. Шапка (можно поправить)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Салон *</label>
                <select
                  value={salonId}
                  onChange={(e) => setSalonId(Number(e.target.value))}
                  className={inputCls}
                  required
                >
                  <option value={0}>— Выберите салон —</option>
                  {salons.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.city_name})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Номер КП</label>
                <input type="text" value={parsed.kp_number} onChange={(e) => updateHeader('kp_number', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Дата КП</label>
                <input type="date" value={parsed.kp_date || ''} onChange={(e) => updateHeader('kp_date', e.target.value || null)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Клиент</label>
                <input type="text" value={parsed.client_name} onChange={(e) => updateHeader('client_name', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                <input type="tel" value={parsed.contact_phone} onChange={(e) => updateHeader('contact_phone', e.target.value)} className={inputCls} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
                <input type="text" value={parsed.address} onChange={(e) => updateHeader('address', e.target.value)} className={inputCls} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} className={inputCls} rows={2} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
              3. Позиции (распознано: {parsed.items.length})
            </h2>
            {parsed.items.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Позиции не распознаны</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs">№</th>
                      <th className="px-2 py-2 text-left text-xs">Помещение</th>
                      <th className="px-2 py-2 text-left text-xs">Модель</th>
                      <th className="px-2 py-2 text-left text-xs w-16">Кол-во</th>
                      <th className="px-2 py-2 text-right text-xs">Цена</th>
                      <th className="px-2 py-2 text-right text-xs">Сумма</th>
                      <th className="px-2 py-2 text-left text-xs w-16">Откр.</th>
                      <th className="px-2 py-2 text-left text-xs w-16">Выс.</th>
                      <th className="px-2 py-2 text-left text-xs w-16">Шир.</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsed.items.map((item, idx) => {
                      const addonsCount = (item.addons || []).length
                      const isExpanded = expandedAddons.has(idx)
                      return (
                      <Fragment key={idx}>
                      <tr>
                        <td className="px-2 py-1.5"><input type="number" value={item.opening_number} onChange={(e) => updateItem(idx, 'opening_number', Number(e.target.value))} className="w-12 rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5"><input type="text" value={item.room_name} onChange={(e) => updateItem(idx, 'room_name', e.target.value)} className="w-full rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5">
                          <input type="text" value={item.model_name} onChange={(e) => updateItem(idx, 'model_name', e.target.value)} className="w-full rounded border-gray-300 text-sm" />
                          {addonsCount > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(idx)}
                              className="mt-1 text-xs text-primary-600 hover:underline"
                            >
                              {isExpanded ? '▾' : '▸'} {addonsCount} {addonsCount === 1 ? 'аддон' : addonsCount < 5 ? 'аддона' : 'аддонов'}
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-1.5"><input type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} className="w-12 rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5"><input type="text" value={item.price ?? ''} onChange={(e) => updateItem(idx, 'price', e.target.value)} className="w-20 rounded border-gray-300 text-sm text-right" /></td>
                        <td className="px-2 py-1.5"><input type="text" value={item.amount ?? ''} onChange={(e) => updateItem(idx, 'amount', e.target.value)} className="w-20 rounded border-gray-300 text-sm text-right" /></td>
                        <td className="px-2 py-1.5">
                          <select value={item.opening_type} onChange={(e) => updateItem(idx, 'opening_type', e.target.value)} className="rounded border-gray-300 text-sm">
                            <option value="">—</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="B_INVERSO">B Inverso</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                            <option value="D_INVERSO">D Inverso</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5"><input type="number" value={item.door_height ?? ''} onChange={(e) => updateItem(idx, 'door_height', e.target.value ? Number(e.target.value) : null)} className="w-16 rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5"><input type="number" value={item.door_width ?? ''} onChange={(e) => updateItem(idx, 'door_width', e.target.value ? Number(e.target.value) : null)} className="w-16 rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5">
                          <button type="button" onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500" title="Удалить">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                      {isExpanded && addonsCount > 0 && (
                        <tr className="bg-gray-50">
                          <td colSpan={10} className="px-3 py-2">
                            <div className="text-xs text-gray-500 mb-1.5">Аддоны проёма #{item.opening_number}:</div>
                            <div className="space-y-1">
                              {(item.addons || []).map((addon: any, ai: number) => (
                                <div key={ai} className="flex items-center gap-2 text-xs">
                                  <span className="inline-flex px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium min-w-[80px]">
                                    {ADDON_KIND_DISPLAY[addon.kind as AddonKind] || addon.kind}
                                  </span>
                                  <span className="flex-1 text-gray-700">{addon.name}</span>
                                  <span className="text-gray-500">{addon.quantity} шт</span>
                                  {addon.price && <span className="text-gray-500">×{addon.price}₽</span>}
                                  {parsed.items.length > 1 && (
                                    <select
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          moveAddon(idx, ai, Number(e.target.value))
                                        }
                                      }}
                                      className="rounded border-gray-300 text-xs"
                                      title="Перенести к другому проёму"
                                    >
                                      <option value="">→ перенести</option>
                                      {parsed.items.map((it, i) => (
                                        i !== idx && (
                                          <option key={i} value={i}>
                                            #{it.opening_number} {it.room_name || it.model_name?.slice(0, 30)}
                                          </option>
                                        )
                                      ))}
                                    </select>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeAddon(idx, ai)}
                                    className="text-gray-400 hover:text-red-500"
                                    title="Удалить"
                                  >
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating || !salonId}
              className="px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm disabled:opacity-50"
            >
              {isCreating ? 'Создание...' : 'Создать заказ'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default KpUploadTab
