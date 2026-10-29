import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { installationsAPI, apiErrorText } from '../../api/installations'
import { Installation, INSTALLATION_STATUS_COLOR, formatDate } from '../../types/installations'

interface Props {
  orderId: number
  orderStatus: string
  notNeededAt: string | null | undefined
  canCreate: boolean
  onChanged?: () => void
}

/**
 * Монтажи заказа в его карточке. Менеджер оформляет монтаж по заказу с любым
 * статусом; пока монтажа нет — может отметить «Монтаж не нужен» и отменить это.
 */
const OrderInstallationsBlock = ({ orderId, orderStatus, notNeededAt, canCreate, onChanged }: Props) => {
  const [items, setItems] = useState<Installation[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(() => {
    installationsAPI.getList({ order: orderId }).then(setItems).catch(() => setItems([]))
  }, [orderId])

  useEffect(() => { load() }, [load])

  const setNotNeeded = async (value: boolean) => {
    setIsSaving(true)
    try {
      await installationsAPI.setNotNeeded(orderId, value)
      onChanged?.()
    } catch (err) {
      alert(apiErrorText(err, 'Не удалось сохранить'))
    } finally {
      setIsSaving(false)
    }
  }

  if (items === null) return null
  // Заказ на складе или отгружен — монтаж пора оформлять
  const due = orderStatus === 'on_warehouse' || orderStatus === 'shipped'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Монтаж</h2>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            {items.length === 0 && !notNeededAt && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setNotNeeded(true)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Монтаж не нужен
              </button>
            )}
            <Link
              to={`/orders/installations/new?order=${orderId}`}
              className="px-3 py-1.5 text-sm font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700"
            >
              Оформить монтаж
            </Link>
          </div>
        )}
      </div>

      {notNeededAt && items.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>Отмечено «Монтаж не нужен» — {formatDate(notNeededAt)}</span>
          {canCreate && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setNotNeeded(false)}
              className="text-primary-600 hover:underline disabled:opacity-50"
            >
              Монтаж снова нужен
            </button>
          )}
        </div>
      )}

      {items.length === 0 && !notNeededAt && (
        <p className={`text-sm ${due ? 'text-amber-700' : 'text-gray-400'}`}>
          {due ? 'Заказ на складе или отгружен — монтаж ещё не оформлен.' : 'Монтаж не оформлен.'}
        </p>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {items.map((it) => (
            <li key={it.id} className="py-2">
              <Link to={`/orders/installations/${it.id}`} className="flex flex-wrap items-center gap-2 group">
                <span className="font-medium text-primary-600 group-hover:underline">Монтаж #{it.id}</span>
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${INSTALLATION_STATUS_COLOR[it.status]}`}>
                  {it.status_display}
                </span>
                <span className={`text-xs ${it.is_paid ? 'text-green-700' : 'text-red-600'}`}>
                  {it.is_paid ? 'оплачен' : 'не оплачен'}
                </span>
                <span className="text-sm text-gray-600 truncate w-full sm:w-auto">{it.work_description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default OrderInstallationsBlock
