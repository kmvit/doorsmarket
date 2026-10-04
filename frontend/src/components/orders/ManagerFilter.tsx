import { useEffect, useState } from 'react'
import { ordersAPI } from '../../api/orders'
import { OrderManager } from '../../types/orders'
import MultiSelect from '../common/MultiSelect'

interface ManagerFilterProps {
  value: string[]
  onChange: (value: string[]) => void
  className?: string
}

/**
 * Фильтр по менеджерам для руководителя в списках заказов, наработок и замеров.
 * В списке — только менеджеры, чьи заказы пользователь видит (свой город).
 */
const ManagerFilter = ({ value, onChange, className = '' }: ManagerFilterProps) => {
  const [managers, setManagers] = useState<OrderManager[]>([])

  useEffect(() => {
    ordersAPI.getManagers().then(setManagers).catch(() => {})
  }, [])

  return (
    <MultiSelect
      options={managers.map((m) => ({ value: String(m.id), label: m.full_name }))}
      value={value}
      onChange={onChange}
      placeholder="Все менеджеры"
      className={className}
    />
  )
}

export default ManagerFilter
