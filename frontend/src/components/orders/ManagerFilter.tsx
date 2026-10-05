import { useEffect, useState } from 'react'
import { ordersAPI } from '../../api/orders'
import { OrderManager } from '../../types/orders'
import MultiSelect from '../common/MultiSelect'

interface ManagerFilterProps {
  value: string[]
  onChange: (value: string[]) => void
  className?: string
  // Сузить список под выбранные города и салоны
  cities?: string[]
  salons?: string[]
}

/**
 * Фильтр по менеджерам для руководителя в списках заказов, наработок и замеров.
 * В списке — только менеджеры, чьи заказы пользователь видит (свой город).
 */
const ManagerFilter = ({ value, onChange, className = '', cities = [], salons = [] }: ManagerFilterProps) => {
  const [managers, setManagers] = useState<OrderManager[]>([])
  const scopeKey = `${cities.join(',')}|${salons.join(',')}`

  useEffect(() => {
    let cancelled = false
    ordersAPI.getManagers({ cities, salons })
      .then((list) => { if (!cancelled) setManagers(list) })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

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
