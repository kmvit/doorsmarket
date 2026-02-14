import { useState, useEffect } from 'react'
import { ComplaintFilters as FiltersType } from '../../types/complaints'
import { useComplaintsStore } from '../../store/complaintsStore'
import { referencesAPI } from '../../api/references'
import { ProductionSite, ComplaintReason } from '../../types/complaints'
import Input from '../common/Input'
import Button from '../common/Button'

interface ComplaintFiltersProps {
  onApply: () => void
}

const ComplaintFilters = ({ onApply }: ComplaintFiltersProps) => {
  const { filters, setFilters, clearFilters } = useComplaintsStore()
  const [productionSites, setProductionSites] = useState<ProductionSite[]>([])
  const [reasons, setReasons] = useState<ComplaintReason[]>([])
  const [localFilters, setLocalFilters] = useState<FiltersType>(filters)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const loadReferences = async () => {
      try {
        const [sites, reasonsData] = await Promise.all([
          referencesAPI.getProductionSites(),
          referencesAPI.getComplaintReasons(),
        ])
        setProductionSites(sites)
        setReasons(reasonsData)
      } catch (error) {
        console.error('Error loading references:', error)
      }
    }
    loadReferences()
  }, [])

  const handleFilterChange = (key: keyof FiltersType, value: any) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleApply = () => {
    setFilters(localFilters)
    onApply()
    setIsOpen(false)
  }

  const handleClear = () => {
    clearFilters()
    setLocalFilters({
      exclude_closed: true,
      ordering: '-created_at',
    })
    onApply()
    setIsOpen(false)
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Фильтры</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? 'Скрыть' : 'Показать фильтры'}
        </Button>
      </div>

      {isOpen && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input
              label="Поиск"
              type="text"
              value={localFilters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Номер заказа, клиент..."
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Статус
              </label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                value={localFilters.status || ''}
                onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
              >
                <option value="">Все статусы</option>
                <option value="new">Новая</option>
                <option value="in_progress">В работе</option>
                <option value="in_production">В производстве</option>
                <option value="on_warehouse">На складе</option>
                <option value="shipping_planned">Отгрузка запланирована</option>
                <option value="installation_planned">Монтаж запланирован</option>
                <option value="both_planned">Отгрузка и монтаж запланированы</option>
                <option value="under_sm_review">На проверке у СМ</option>
                <option value="completed">Выполнена</option>
                <option value="resolved">Решена</option>
                <option value="closed">Закрыта</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Тип рекламации
              </label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                value={localFilters.complaint_type || ''}
                onChange={(e) => handleFilterChange('complaint_type', e.target.value || undefined)}
              >
                <option value="">Все типы</option>
                <option value="manager">Менеджер</option>
                <option value="installer">Монтажник</option>
                <option value="factory">Фабрика</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Производственная площадка
              </label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                value={localFilters.production_site || ''}
                onChange={(e) => handleFilterChange('production_site', e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Все площадки</option>
                {productionSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Причина
              </label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                value={localFilters.reason || ''}
                onChange={(e) => handleFilterChange('reason', e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Все причины</option>
                {reasons.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {reason.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Сортировка
              </label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                value={localFilters.ordering || '-created_at'}
                onChange={(e) => handleFilterChange('ordering', e.target.value)}
              >
                <option value="-created_at">Новые сначала</option>
                <option value="created_at">Старые сначала</option>
                <option value="-updated_at">Недавно обновленные</option>
                <option value="order_number">По номеру заказа</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-4 pt-4 border-t border-gray-200">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="my_complaints"
                checked={localFilters.my_complaints || false}
                onChange={(e) => handleFilterChange('my_complaints', e.target.checked || undefined)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="my_complaints" className="ml-2 text-sm text-gray-700">
                Только мои рекламации
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="my_orders"
                checked={localFilters.my_orders || false}
                onChange={(e) => handleFilterChange('my_orders', e.target.checked || undefined)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="my_orders" className="ml-2 text-sm text-gray-700">
                Мои заказы
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="exclude_closed"
                checked={localFilters.exclude_closed !== false}
                onChange={(e) => handleFilterChange('exclude_closed', e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="exclude_closed" className="ml-2 text-sm text-gray-700">
                Исключить закрытые
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" onClick={handleClear}>
              Сбросить
            </Button>
            <Button onClick={handleApply}>
              Применить
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ComplaintFilters

