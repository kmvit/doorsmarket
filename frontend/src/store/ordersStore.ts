import { create } from 'zustand'
import { OrderListItem, OrderFilters } from '../types/orders'
import { ordersAPI } from '../api/orders'

interface OrdersStore {
  orders: OrderListItem[]
  isLoading: boolean
  error: string | null
  filters: OrderFilters

  fetchOrders: () => Promise<void>
  setFilters: (filters: Partial<OrderFilters>) => void
  clearError: () => void
}

export const useOrdersStore = create<OrdersStore>((set, get) => ({
  orders: [],
  isLoading: false,
  error: null,
  filters: {},

  fetchOrders: async () => {
    set({ isLoading: true, error: null })
    try {
      const orders = await ordersAPI.getList(get().filters)
      set({ orders, isLoading: false })
    } catch (err: any) {
      set({ error: err.message || 'Ошибка загрузки заказов', isLoading: false })
    }
  },

  setFilters: (filters) => {
    set((state) => ({ filters: { ...state.filters, ...filters } }))
  },

  clearError: () => set({ error: null }),
}))
