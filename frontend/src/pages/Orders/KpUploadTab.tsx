import { useState, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { ordersAPI } from '../../api/orders'
import {
  Salon, ParsedKpData, ParsedKpItem, ParsedKpAddon,
  ADDON_KIND_DISPLAY, AddonKind, OpeningType, DOOR_TYPE_DISPLAY,
} from '../../types/orders'
import AutoResizeTextarea from '../../components/common/AutoResizeTextarea'
import HScrollSync from '../../components/common/HScrollSync'

interface Props {
  salons: Salon[]
  defaultSalonId: number
  // Режим замены КП: id существующего заказа. Вместо создания нового заказа
  // данные распарсенного КП заменяют шапку и позиции этого заказа.
  replaceOrderId?: number
  // Режим добавления КП: позиции дописываются к уже имеющимся в заказе.
  appendOrderId?: number
  // Наименования сопутствующих позиций, которые в заказе уже есть — подсвечиваем,
  // чтобы менеджер не задвоил доставку и подъём из каждого КП.
  existingAddonNames?: string[]
}

const normalizeName = (value: string): string => (value || '').toLowerCase().replace(/\s+/g, ' ').trim()

const KpUploadTab = ({
  salons, defaultSalonId, replaceOrderId, appendOrderId, existingAddonNames = [],
}: Props) => {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedKpData | null>(null)
  const [salonId, setSalonId] = useState<number>(defaultSalonId || 0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [nextActionText, setNextActionText] = useState('')
  const [nextActionDueAt, setNextActionDueAt] = useState('')
  const [nextActionError, setNextActionError] = useState(false)
  const nextActionRef = useRef<HTMLDivElement>(null)

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
      if (!data.items?.length && !data.addons?.length) {
        setError('Содержимое PDF не распознано. Попробуйте другой файл или создайте заказ вручную.')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось распарсить PDF')
    } finally {
      setIsParsing(false)
    }
  }

  // ---- items ----
  const updateItem = (idx: number, field: keyof ParsedKpItem, value: any) => {
    if (!parsed) return
    const items = [...parsed.items]
    items[idx] = { ...items[idx], [field]: value }
    setParsed({ ...parsed, items })
  }
  const removeItem = (idx: number) =>
    parsed && setParsed({ ...parsed, items: parsed.items.filter((_, i) => i !== idx) })
  const copyItem = (idx: number) => {
    if (!parsed) return
    const copy = { ...parsed.items[idx] }
    const items = [...parsed.items]
    items.splice(idx + 1, 0, copy)
    setParsed({ ...parsed, items })
  }
  const addItem = () => {
    if (!parsed) return
    const max = parsed.items.reduce((m, it) => Math.max(m, it.opening_number || 0), 0)
    setParsed({
      ...parsed,
      items: [...parsed.items, {
        opening_number: max + 1, room_name: '', model_name: '', quantity: 1,
        price: null, amount: null, door_type: '', opening_type: '',
        door_height: null, door_width: null,
        recommended_opening_height: null, recommended_opening_width: null,
        notes: '',
      }],
    })
  }

  // ---- addons ----
  const updateAddon = (idx: number, field: keyof ParsedKpAddon, value: any) => {
    if (!parsed) return
    const addons = [...parsed.addons]
    addons[idx] = { ...addons[idx], [field]: value }
    setParsed({ ...parsed, addons })
  }
  const removeAddon = (idx: number) =>
    parsed && setParsed({ ...parsed, addons: parsed.addons.filter((_, i) => i !== idx) })
  const copyAddon = (idx: number) => {
    if (!parsed) return
    const copy = { ...parsed.addons[idx] }
    const addons = [...parsed.addons]
    addons.splice(idx + 1, 0, copy)
    setParsed({ ...parsed, addons })
  }
  const addAddon = (kind: AddonKind = 'extra') => {
    if (!parsed) return
    setParsed({
      ...parsed,
      addons: [...parsed.addons, {
        kind, name: '', quantity: 1, size: '', opening_type: '',
        price: null, amount: null, comment: '',
      }],
    })
  }

  const updateHeader = (field: keyof ParsedKpData, value: any) => {
    parsed && setParsed({ ...parsed, [field]: value })
  }

  const handleReplace = async () => {
    if (!parsed || !replaceOrderId) return
    if (!window.confirm(
      `Заменить КП в заказе #${replaceOrderId}?\n\n` +
      'Шапка и все позиции заказа будут заменены данными нового КП. ' +
      'Замер и его проёмы сохранятся, но связки проёмов с позициями КП сбросятся — их нужно будет привязать заново.',
    )) return
    setIsCreating(true)
    setError(null)
    try {
      await ordersAPI.replaceFromParsed(replaceOrderId, { ...parsed, comment: comment || undefined } as any)
      navigate(`/orders/${replaceOrderId}`)
    } catch (err: any) {
      const detail = err.response?.data
      setError(typeof detail === 'object' ? Object.values(detail).flat().join(', ') : (err.message || 'Ошибка замены КП'))
      setIsCreating(false)
    }
  }

  const handleAppend = async () => {
    if (!parsed || !appendOrderId) return
    if (!parsed.items.length && !parsed.addons.length) {
      setError('Нечего добавлять: удалите лишнее, но хотя бы одна позиция должна остаться.')
      return
    }
    if (!window.confirm(
      `Добавить позиции этого КП в заказ #${appendOrderId}?\n\n` +
      `Позиций — ${parsed.items.length}, сопутствующих — ${parsed.addons.length}. ` +
      'Имеющиеся позиции заказа сохранятся, нумерация проёмов продолжится с последнего. ' +
      'Лишние строки (например, повторную доставку) удалите до добавления.',
    )) return
    setIsCreating(true)
    setError(null)
    try {
      const result = await ordersAPI.appendFromParsed(appendOrderId, parsed)
      if (result?.kp_number_warning) alert(result.kp_number_warning)
      navigate(`/orders/${appendOrderId}`)
    } catch (err: any) {
      const detail = err.response?.data
      setError(typeof detail === 'object' ? Object.values(detail).flat().join(', ') : (err.message || 'Ошибка добавления КП'))
      setIsCreating(false)
    }
  }

  const handleCreate = async () => {
    if (!parsed) return
    if (replaceOrderId) return handleReplace()
    if (appendOrderId) return handleAppend()
    if (!salonId) { setError('Выберите салон'); return }
    if (!nextActionText.trim() || !nextActionDueAt) {
      setNextActionError(true)
      nextActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setNextActionError(false)
    setIsCreating(true)
    setError(null)
    try {
      const order = await ordersAPI.createFromParsed({
        ...parsed,
        salon: salonId,
        comment,
        next_action_text: nextActionText.trim(),
        next_action_due_at: new Date(nextActionDueAt).toISOString(),
      } as any)
      navigate(`/orders/${order.id}`)
    } catch (err: any) {
      const detail = err.response?.data
      setError(typeof detail === 'object' ? Object.values(detail).flat().join(', ') : (err.message || 'Ошибка создания'))
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

      {parsed && (
        <>
          {/* Шапка */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">2. Шапка (можно поправить)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!replaceOrderId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Салон *</label>
                  <select value={salonId} onChange={(e) => setSalonId(Number(e.target.value))} className={inputCls} required>
                    <option value={0}>— Выберите салон —</option>
                    {salons.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.city_name})</option>)}
                  </select>
                </div>
              )}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий к заказу</label>
                <AutoResizeTextarea value={comment} onChange={(e) => setComment(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Позиции (двери) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                3. Позиции — двери и панели ({parsed.items.length})
              </h2>
              <button type="button" onClick={addItem} className="text-sm text-primary-600 hover:underline">+ Добавить проём</button>
            </div>
            {parsed.items.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Позиции не распознаны</p>
            ) : (
              <HScrollSync>
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs w-12">№</th>
                      <th className="px-2 py-2 text-left text-xs min-w-[160px]">Помещение</th>
                      <th className="px-2 py-2 text-left text-xs min-w-[260px]">Модель</th>
                      <th className="px-2 py-2 text-left text-xs w-16">Кол.</th>
                      <th className="px-2 py-2 text-right text-xs w-20">Цена</th>
                      <th className="px-2 py-2 text-right text-xs w-20">Сумма</th>
                      <th className="px-2 py-2 text-left text-xs w-28">Тип двери</th>
                      <th className="px-2 py-2 text-left text-xs w-24">Откр.</th>
                      <th className="px-2 py-2 text-left text-xs w-16">Выс. полотна</th>
                      <th className="px-2 py-2 text-left text-xs w-16">Шир. полотна</th>
                      <th className="px-2 py-2 text-left text-xs w-16">Рек. выс. проёма</th>
                      <th className="px-2 py-2 text-left text-xs w-16">Рек. шир. проёма</th>
                      <th className="px-2 py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsed.items.map((item, idx) => (
                      <Fragment key={idx}>
                      <tr>
                        <td className="px-2 py-1.5 align-top"><input type="number" value={item.opening_number} onChange={(e) => updateItem(idx, 'opening_number', Number(e.target.value))} className="w-12 rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5 align-top">
                          <AutoResizeTextarea value={item.room_name} onChange={(e) => updateItem(idx, 'room_name', e.target.value)} className="w-full min-w-[160px] rounded border-gray-300 text-sm" />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <AutoResizeTextarea value={item.model_name} onChange={(e) => updateItem(idx, 'model_name', e.target.value)} className="w-full min-w-[300px] rounded border-gray-300 text-sm" />
                        </td>
                        <td className="px-2 py-1.5 align-top"><input type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} className="w-12 rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5 align-top"><input type="text" value={item.price ?? ''} onChange={(e) => updateItem(idx, 'price', e.target.value)} className="w-20 rounded border-gray-300 text-sm text-right" /></td>
                        <td className="px-2 py-1.5 align-top"><input type="text" value={item.amount ?? ''} onChange={(e) => updateItem(idx, 'amount', e.target.value)} className="w-20 rounded border-gray-300 text-sm text-right" /></td>
                        <td className="px-2 py-1.5 align-top">
                          <select value={item.door_type} onChange={(e) => updateItem(idx, 'door_type', e.target.value)} className="rounded border-gray-300 text-sm">
                            <option value="">—</option>
                            {Object.entries(DOOR_TYPE_DISPLAY).map(([k, label]) => (
                              <option key={k} value={k}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <select value={item.opening_type} onChange={(e) => updateItem(idx, 'opening_type', e.target.value)} className="rounded border-gray-300 text-sm">
                            <option value="">—</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="B_INVERSO">B Inv.</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                            <option value="D_INVERSO">D Inv.</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 align-top"><input type="number" value={item.door_height ?? ''} onChange={(e) => updateItem(idx, 'door_height', e.target.value ? Number(e.target.value) : null)} className="w-16 rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5 align-top"><input type="number" value={item.door_width ?? ''} onChange={(e) => updateItem(idx, 'door_width', e.target.value ? Number(e.target.value) : null)} className="w-16 rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5 align-top"><input type="number" value={item.recommended_opening_height ?? ''} onChange={(e) => updateItem(idx, 'recommended_opening_height', e.target.value ? Number(e.target.value) : null)} className="w-16 rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5 align-top"><input type="number" value={item.recommended_opening_width ?? ''} onChange={(e) => updateItem(idx, 'recommended_opening_width', e.target.value ? Number(e.target.value) : null)} className="w-16 rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5 align-top">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => copyItem(idx)} className="text-gray-400 hover:text-primary-600" title="Копировать">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </button>
                            <button type="button" onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500" title="Удалить">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className="bg-gray-50/50">
                        <td colSpan={2} className="px-2 pb-2 text-xs text-right text-gray-500 align-top pt-1">Примечание по проёму:</td>
                        <td colSpan={11} className="px-2 pb-2">
                          <AutoResizeTextarea
                            value={item.notes ?? ''}
                            onChange={(e) => updateItem(idx, 'notes' as keyof ParsedKpItem, e.target.value)}
                            minRows={1}
                            placeholder="Комментарий по этой двери..."
                            className="w-full rounded border-gray-200 text-xs"
                          />
                        </td>
                      </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </HScrollSync>
            )}
          </div>

          {/* Сопутствующие позиции (аддоны) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                4. Сопутствующие позиции — короба, наличники, добор, петли, услуги ({parsed.addons.length})
              </h2>
              <button type="button" onClick={() => addAddon('extra')} className="text-sm text-primary-600 hover:underline">+ Добавить</button>
            </div>
            {parsed.addons.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Сопутствующих позиций не распознано</p>
            ) : (
              <HScrollSync>
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs w-32">Тип</th>
                      <th className="px-2 py-2 text-left text-xs min-w-[280px]">Наименование</th>
                      <th className="px-2 py-2 text-left text-xs w-20">Кол.</th>
                      <th className="px-2 py-2 text-left text-xs w-24">Размер</th>
                      <th className="px-2 py-2 text-left text-xs w-20">Откр.</th>
                      <th className="px-2 py-2 text-right text-xs w-20">Цена</th>
                      <th className="px-2 py-2 text-right text-xs w-20">Сумма</th>
                      <th className="px-2 py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsed.addons.map((addon, idx) => {
                      const isDuplicate = appendOrderId
                        && existingAddonNames.some((n) => normalizeName(n) === normalizeName(addon.name))
                      return (
                      <tr key={idx} className={isDuplicate ? 'bg-amber-50' : undefined}
                          title={isDuplicate ? 'Такая позиция в заказе уже есть — удалите строку, если добавлять её не нужно' : undefined}>
                        <td className="px-2 py-1.5 align-top">
                          <select value={addon.kind} onChange={(e) => updateAddon(idx, 'kind', e.target.value as AddonKind)} className="rounded border-gray-300 text-sm">
                            {(Object.keys(ADDON_KIND_DISPLAY) as AddonKind[]).map((k) => (
                              <option key={k} value={k}>{ADDON_KIND_DISPLAY[k]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <AutoResizeTextarea value={addon.name} onChange={(e) => updateAddon(idx, 'name', e.target.value)} className="w-full min-w-[280px] rounded border-gray-300 text-sm" />
                          {isDuplicate && (
                            <p className="text-xs text-amber-700 mt-1">Уже есть в заказе</p>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top"><input type="text" value={addon.quantity ?? ''} onChange={(e) => updateAddon(idx, 'quantity', e.target.value)} className="w-16 rounded border-gray-300 text-sm text-right" /></td>
                        <td className="px-2 py-1.5 align-top"><input type="text" value={addon.size} onChange={(e) => updateAddon(idx, 'size', e.target.value)} className="w-24 rounded border-gray-300 text-sm" /></td>
                        <td className="px-2 py-1.5 align-top">
                          <select value={addon.opening_type} onChange={(e) => updateAddon(idx, 'opening_type', e.target.value as OpeningType)} className="rounded border-gray-300 text-sm">
                            <option value="">—</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="B_INVERSO">B Inv.</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                            <option value="D_INVERSO">D Inv.</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 align-top"><input type="text" value={addon.price ?? ''} onChange={(e) => updateAddon(idx, 'price', e.target.value)} className="w-20 rounded border-gray-300 text-sm text-right" /></td>
                        <td className="px-2 py-1.5 align-top"><input type="text" value={addon.amount ?? ''} onChange={(e) => updateAddon(idx, 'amount', e.target.value)} className="w-20 rounded border-gray-300 text-sm text-right" /></td>
                        <td className="px-2 py-1.5 align-top">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => copyAddon(idx)} className="text-gray-400 hover:text-primary-600" title="Копировать">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </button>
                            <button type="button" onClick={() => removeAddon(idx)} className="text-gray-400 hover:text-red-500" title="Удалить">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </HScrollSync>
            )}
          </div>

          {/* Следующее действие (обязательно; при замене и добавлении КП заказ уже существует — не требуется) */}
          {!replaceOrderId && !appendOrderId && (
          <div
            ref={nextActionRef}
            className={`rounded-xl shadow-sm p-5 ${nextActionError ? 'bg-red-50 border-2 border-red-400' : 'bg-amber-50 border border-amber-200'}`}
          >
            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${nextActionError ? 'text-red-700' : 'text-amber-800'}`}>
              5. Следующее действие * <span className="font-normal text-xs normal-case">— что и когда нужно сделать по заказу</span>
            </h2>
            {nextActionError && (
              <div className="mb-3 text-sm font-medium text-red-700">
                Заполните «следующее действие» и срок — без этого заказ не создать.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-amber-900 mb-1">Что сделать *</label>
                <input
                  type="text"
                  value={nextActionText}
                  onChange={(e) => { setNextActionText(e.target.value); if (nextActionError) setNextActionError(false) }}
                  className={`${inputCls} ${nextActionError && !nextActionText.trim() ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                  placeholder="Например: Позвонить клиенту, уточнить детали"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-amber-900 mb-1">Когда (дата и время) *</label>
                <input
                  type="datetime-local"
                  value={nextActionDueAt}
                  onChange={(e) => { setNextActionDueAt(e.target.value); if (nextActionError) setNextActionError(false) }}
                  className={`${inputCls} ${nextActionError && !nextActionDueAt ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                  required
                />
              </div>
            </div>
          </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating || (!replaceOrderId && !appendOrderId && !salonId)}
              className="px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm disabled:opacity-50"
            >
              {isCreating
                ? (replaceOrderId ? 'Заменяем…' : appendOrderId ? 'Добавляем…' : 'Создание...')
                : replaceOrderId ? `Заменить КП в заказе #${replaceOrderId}`
                  : appendOrderId ? `Добавить в заказ #${appendOrderId}`
                    : 'Создать заказ'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default KpUploadTab
