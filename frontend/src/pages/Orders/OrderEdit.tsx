import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { ordersAPI } from '../../api/orders'
import { salonsAPI } from '../../api/salons'
import { Order, Salon, CreateOrderData, OrderStatus } from '../../types/orders'
import OrderItemsEditor from './OrderItemsEditor'

const OrderEdit = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [order, setOrder] = useState<Order | null>(null)
  const [salons, setSalons] = useState<Salon[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    status: 'draft',
    items: [],
  })

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const [orderData, salonsData] = await Promise.all([
          ordersAPI.getById(Number(id)),
          salonsAPI.getAll(),
        ])
        setOrder(orderData)
        setSalons(salonsData)
        const salon = orderData.salon as any
        setForm({
          salon: typeof salon === 'object' ? salon.id : salon,
          kp_number: orderData.kp_number,
          kp_date: orderData.kp_date,
          client_name: orderData.client_name,
          contact_phone: orderData.contact_phone,
          address: orderData.address,
          lift_available: orderData.lift_available,
          stairs_available: orderData.stairs_available,
          floor_readiness: orderData.floor_readiness,
          comment: orderData.comment,
          status: orderData.status,
          items: (orderData.items || []).map((item) => ({
            opening_number: item.opening_number,
            room_name: item.room_name,
            model_name: item.model_name,
            quantity: item.quantity,
            price: item.price,
            amount: item.amount,
            door_type: item.door_type,
            opening_type: item.opening_type,
            door_height: item.door_height,
            door_width: item.door_width,
            notes: item.notes,
            position: item.position,
            addons: item.addons?.map((a) => ({
              kind: a.kind,
              name: a.name,
              quantity: a.quantity,
              price: a.price,
              comment_face: a.comment_face,
              comment_back: a.comment_back,
            })) || [],
          })),
        })
      } catch {
        setError('Заказ не найден')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  const canEdit = user?.role === 'manager' || user?.role === 'admin'

  const setField = (field: keyof CreateOrderData, value: any) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.client_name.trim()) {
      setError('Укажите имя клиента')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await ordersAPI.fullUpdate(Number(id), form)
      navigate(`/orders/${id}`)
    } catch (err: any) {
      const detail = err.response?.data
      if (typeof detail === 'object') {
        setError(Object.values(detail).flat().join(', '))
      } else {
        setError(err.message || 'Ошибка сохранения')
      }
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!canEdit) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-6 rounded-xl">
          Нет доступа к редактированию
        </div>
      </div>
    )
  }

  if (error && !order) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-6 rounded-xl">
          {error}
        </div>
      </div>
    )
  }

  const inputCls = 'block w-full rounded-lg border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500'

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/orders" className="hover:text-primary-600">Заказы</Link>
        <span>/</span>
        <Link to={`/orders/${id}`} className="hover:text-primary-600">#{id}</Link>
        <span>/</span>
        <span className="text-gray-900">Редактирование</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Редактирование заказа #{id}</h1>

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
                <option value="active">Активный</option>
                <option value="cancelled">Отменён</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Клиент *</label>
              <input
                type="text"
                value={form.client_name}
                onChange={(e) => setField('client_name', e.target.value)}
                className={inputCls}
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
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Адрес объекта</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
                className={inputCls}
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
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
            <textarea
              value={form.comment}
              onChange={(e) => setField('comment', e.target.value)}
              className={inputCls}
              rows={3}
            />
          </div>
        </div>

        {/* Позиции */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Позиции</h2>
          <OrderItemsEditor
            items={form.items || []}
            onChange={(items) => setField('items', items)}
          />
        </div>

        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={() => navigate(`/orders/${id}`)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl transition-all"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default OrderEdit
