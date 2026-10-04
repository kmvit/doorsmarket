import { Link } from 'react-router-dom'
import { DesignerReportOrder } from '../../api/designerReport'
import { ORDER_STATUS_COLOR } from '../../types/orders'
import { formatDay, formatRub } from './DesignerReportFilters'

/** Заказы дизайнера: когда оформлен, клиент, КП, адрес, статус, сумма и выплаченный бонус. */
const DesignerReportOrders = ({ orders }: { orders: DesignerReportOrder[] }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr className="text-left text-xs font-medium text-gray-500 uppercase">
          <th className="px-3 py-2">№</th>
          <th className="px-3 py-2">Оформлен</th>
          <th className="px-3 py-2">Клиент / адрес</th>
          <th className="px-3 py-2">№ КП</th>
          <th className="px-3 py-2">Салон / менеджер</th>
          <th className="px-3 py-2">Статус</th>
          <th className="px-3 py-2 text-right">Сумма заказа</th>
          <th className="px-3 py-2 text-right">Бонус выплачен</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 bg-white">
        {orders.map((o) => (
          <tr key={o.id} className="align-top">
            <td className="px-3 py-2">
              <Link to={`/orders/${o.id}`} className="text-primary-600 font-medium hover:underline">#{o.id}</Link>
            </td>
            <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDay(o.created_at)}</td>
            <td className="px-3 py-2">
              <div className="font-medium text-gray-900">{o.client_name}</div>
              {o.address && <div className="text-xs text-gray-500 max-w-[260px]">{o.address}</div>}
            </td>
            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{o.kp_number || '—'}</td>
            <td className="px-3 py-2 text-gray-700">
              <div>{o.salon_name}</div>
              <div className="text-xs text-gray-500">{o.manager_name}</div>
            </td>
            <td className="px-3 py-2">
              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${ORDER_STATUS_COLOR[o.status]}`}>
                {o.status_display}
              </span>
            </td>
            <td className="px-3 py-2 text-right whitespace-nowrap text-gray-900">{formatRub(o.amount)}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">
              {o.designer_paid_at ? (
                <>
                  <div className="font-medium text-green-700">{formatRub(o.designer_paid_amount)}</div>
                  <div className="text-xs text-gray-500">{formatDay(o.designer_paid_at)}</div>
                </>
              ) : <span className="text-gray-400">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

export const ReportTile = ({ label, value, accent }: { label: string; value: string | number; accent?: string }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</div>
    <div className={`mt-1 text-2xl font-bold ${accent || 'text-gray-900'}`}>{value}</div>
  </div>
)

export default DesignerReportOrders
