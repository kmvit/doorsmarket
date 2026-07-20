import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { ordersAPI } from '../../api/orders'
import { salonsAPI } from '../../api/salons'
import { Salon, CreateOrderData, OrderStatus } from '../../types/orders'
import OrderItemsEditor from './OrderItemsEditor'
import OrderAddonsEditor from './OrderAddonsEditor'
import AutoResizeTextarea from '../../components/common/AutoResizeTextarea'
import KpUploadTab from './KpUploadTab'

type CreateTab = 'manual' | 'kp'

const OrderCreate = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [salons, setSalons] = useState<Salon[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<CreateTab>('kp')
  const [nextActionText, setNextActionText] = useState('')
  const [nextActionDueAt, setNextActionDueAt] = useState('')
  const [nextActionError, setNextActionError] = useState(false)
  const nextActionRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState<CreateOrderData>({
    salon: 0,
    kp_number: '',
    kp_date: null,
    client_name: '',
    contact_phone: '',
    address: '',
    lift_available: null,
    stairs_available: null,
    floor_readiness: '',
    comment: '',
    status: 'active',
    items: [],
    addons: [],
  })

  useEffect(() => {
    salonsAPI.getAll().then((data) => {
      setSalons(data)
      if (data.length === 1) {
        setForm((f) => ({ ...f, salon: data[0].id }))
      }
      // Если у пользователя есть салон — предзаполняем
      if (user && (user as any).salon_id) {
        setForm((f) => ({ ...f, salon: (user as any).salon_id }))
      }
    }).catch(() => {})
  }, [user])

  const setField = (field: keyof CreateOrderData, value: any) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.salon) {
      setError('Выберите салон')
      return
    }
    if (!form.client_name.trim()) {
      setError('Укажите имя клиента')
      return
    }
    if (!nextActionText.trim() || !nextActionDueAt) {
      setNextActionError(true)
      nextActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setNextActionError(false)
    setIsSubmitting(true)
    setError(null)
    try {
      const order = await ordersAPI.create({
        ...form,
        next_action_text: nextActionText.trim(),
        next_action_due_at: new Date(nextActionDueAt).toISOString(),
      } as any)
      navigate(`/orders/${order.id}`)
    } catch (err: any) {
      const detail = err.response?.data
      if (typeof detail === 'object') {
        setError(Object.values(detail).flat().join(', '))
      } else {
        setError(err.message || 'Ошибка создания заказа')
      }
      setIsSubmitting(false)
    }
  }

  const inputCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'

  const defaultSalonId = (user as any)?.salon_id || (salons.length === 1 ? salons[0].id : 0)

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Новый заказ</h1>
      </div>

      {/* Переключатель вкладок */}
      <div className="flex rounded-xl border border-gray-200 bg-gray-100 p-0.5 text-sm font-medium mb-6 max-w-md">
        <button
          type="button"
          onClick={() => setTab('kp')}
          className={`flex-1 px-3 py-2 rounded-lg transition-all ${tab === 'kp' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Загрузить КП
        </button>
        <button
          type="button"
          onClick={() => setTab('manual')}
          className={`flex-1 px-3 py-2 rounded-lg transition-all ${tab === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Вручную
        </button>
      </div>

      {tab === 'kp' ? (
        <KpUploadTab salons={salons} defaultSalonId={defaultSalonId} />
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Основное */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Основное</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Салон *</label>
              <select
                value={form.salon}
                onChange={(e) => setField('salon', Number(e.target.value))}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
              <select
                value={form.status}
                onChange={(e) => setField('status', e.target.value as OrderStatus)}
                className={inputCls}
              >
                <option value="draft">Черновик</option>
                <option value="active">Создан</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Клиент *</label>
              <input
                type="text"
                value={form.client_name}
                onChange={(e) => setField('client_name', e.target.value)}
                className={inputCls}
                placeholder="ФИО или компания"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={(e) => setField('contact_phone', e.target.value)}
                className={inputCls}
                placeholder="+7..."
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Адрес объекта</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
                className={inputCls}
                placeholder="Улица, дом, квартира"
              />
            </div>
          </div>
        </div>

        {/* КП */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">КП</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Номер КП</label>
              <input
                type="text"
                value={form.kp_number}
                onChange={(e) => setField('kp_number', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата КП</label>
              <input
                type="date"
                value={form.kp_date || ''}
                onChange={(e) => setField('kp_date', e.target.value || null)}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Объект */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Объект</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Лифт</label>
              <select
                value={form.lift_available === null ? '' : String(form.lift_available)}
                onChange={(e) => setField('lift_available', e.target.value === '' ? null : e.target.value === 'true')}
                className={inputCls}
              >
                <option value="">Не указано</option>
                <option value="true">Есть</option>
                <option value="false">Нет</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Лестница</label>
              <select
                value={form.stairs_available === null ? '' : String(form.stairs_available)}
                onChange={(e) => setField('stairs_available', e.target.value === '' ? null : e.target.value === 'true')}
                className={inputCls}
              >
                <option value="">Не указано</option>
                <option value="true">Есть</option>
                <option value="false">Нет</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Готовность пола</label>
              <input
                type="text"
                value={form.floor_readiness}
                onChange={(e) => setField('floor_readiness', e.target.value)}
                className={inputCls}
                placeholder="Черновой / чистовой..."
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
            <AutoResizeTextarea
              value={form.comment}
              onChange={(e) => setField('comment', e.target.value)}
              className={inputCls}
              minRows={3}
            />
          </div>
        </div>

        {/* Позиции */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Позиции — двери и панели</h2>
          <OrderItemsEditor
            items={form.items || []}
            onChange={(items) => setField('items', items)}
          />
        </div>

        {/* Сопутствующие позиции */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
            Сопутствующие позиции
          </h2>
          <OrderAddonsEditor
            addons={form.addons || []}
            onChange={(addons) => setField('addons', addons)}
          />
        </div>

        {/* Следующее действие (обязательно) */}
        <div
          ref={nextActionRef}
          className={`rounded-xl shadow-sm p-5 ${nextActionError ? 'bg-red-50 border-2 border-red-400' : 'bg-amber-50 border border-amber-200'}`}
        >
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${nextActionError ? 'text-red-700' : 'text-amber-800'}`}>
            Следующее действие *{' '}
            <span className="font-normal text-xs normal-case">— что и когда нужно сделать по заказу</span>
          </h2>
          {nextActionError && (
            <div className="mb-3 text-sm font-medium text-red-600">
              ⚠️ Заполните поля ниже — без следующего действия заказ не сохранится
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1 text-gray-700">Что сделать *</label>
              <input
                type="text"
                value={nextActionText}
                onChange={(e) => { setNextActionText(e.target.value); if (e.target.value.trim()) setNextActionError(false) }}
                className={`${inputCls} ${nextActionError && !nextActionText.trim() ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                placeholder="Например: Позвонить клиенту, уточнить детали"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Когда *</label>
              <input
                type="datetime-local"
                value={nextActionDueAt}
                onChange={(e) => { setNextActionDueAt(e.target.value); if (e.target.value) setNextActionError(false) }}
                className={`${inputCls} ${nextActionError && !nextActionDueAt ? 'border-red-400 ring-1 ring-red-400' : ''}`}
              />
            </div>
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl transition-all"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Сохранение...' : 'Создать заказ'}
          </button>
        </div>
      </form>
      )}
    </div>
  )
}

export default OrderCreate
