import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { ComplaintListItem, Complaint, ComplaintFilters } from '../types/complaints'
import { complaintsAPI } from '../api/complaints'

const DEFAULT_FILTERS: ComplaintFilters = {
  exclude_closed: true,
  ordering: '-created_at',
}

/**
 * «Папочные» параметры приходят из URL при заходе с дашборда (?my_tasks=review и
 * т.п.). Это разовая выборка, а не выбор пользователя в панели фильтров, поэтому
 * их не сохраняем — иначе при следующем открытии списка он молча окажется
 * сужённым до папки, из которой заходили вчера.
 */
export const stripFolderScope = (f: ComplaintFilters): ComplaintFilters =>
  ({ ...f, my_tasks: undefined, my_orders: undefined, needs_planning: undefined } as any)

interface ComplaintsStore {
  complaints: ComplaintListItem[]
  currentComplaint: Complaint | null
  filters: ComplaintFilters
  isLoading: boolean
  error: string | null
  totalCount: number
  page: number
  pageSize: number

  // Actions
  fetchComplaints: (filters?: ComplaintFilters) => Promise<void>
  fetchComplaint: (id: number) => Promise<void>
  setFilters: (filters: ComplaintFilters) => void
  replaceFilters: (filters: ComplaintFilters) => void
  clearFilters: () => void
  setPage: (page: number) => void
  clearError: () => void
}

export const useComplaintsStore = create<ComplaintsStore>()(persist((set, get) => ({
  complaints: [],
  currentComplaint: null,
  filters: DEFAULT_FILTERS,
  isLoading: false,
  error: null,
  totalCount: 0,
  page: 1,
  pageSize: 20,

  fetchComplaints: async (filters?: ComplaintFilters) => {
    set({ isLoading: true, error: null })
    try {
      const currentFilters = filters || get().filters
      console.log('[ComplaintsStore] Загрузка рекламаций с фильтрами:', currentFilters)
      const response = await complaintsAPI.getList(currentFilters)
      // DRF возвращает {results: [], count: number} или просто массив
      const complaintsList = Array.isArray(response) ? response : (response.results || [])
      const total = Array.isArray(response) ? response.length : (response.count || 0)
      console.log(`[ComplaintsStore] Загружено ${complaintsList.length} рекламаций, всего: ${total}`)
      set({
        complaints: complaintsList,
        totalCount: total,
        isLoading: false,
      })
    } catch (error: any) {
      console.error('[ComplaintsStore] Ошибка загрузки рекламаций:', error)
      set({
        error: error.response?.data?.detail || 'Ошибка загрузки рекламаций',
        isLoading: false,
      })
    }
  },

  fetchComplaint: async (id: number) => {
    set({ isLoading: true, error: null })
    try {
      const complaint = await complaintsAPI.getDetail(id)
      set({
        currentComplaint: complaint,
        isLoading: false,
      })
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Ошибка загрузки рекламации',
        isLoading: false,
      })
    }
  },

  setFilters: (filters: ComplaintFilters) => {
    set({ filters: { ...get().filters, ...filters }, page: 1 })
  },

  // Заход в папку с дашборда: выборку задаёт URL целиком, а сохранённые фильтры
  // пользователя не должны её дополнительно сужать (иначе папка выглядит пустой)
  replaceFilters: (filters: ComplaintFilters) => {
    set({ filters, page: 1 })
  },

  clearFilters: () => {
    set({ filters: DEFAULT_FILTERS, page: 1 })
  },

  setPage: (page: number) => {
    set({ page })
  },

  clearError: () => {
    set({ error: null })
  },
}), {
  // Фильтры переживают уход в карточку и перезагрузку вкладки, но не живут
  // дольше сеанса. Сами рекламации не кешируем — их всегда тянем с сервера.
  name: 'complaints-filters',
  storage: createJSONStorage(() => sessionStorage),
  partialize: (state) => ({ filters: stripFolderScope(state.filters) }),
}))

