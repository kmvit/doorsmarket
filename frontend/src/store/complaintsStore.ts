import { create } from 'zustand'
import { ComplaintListItem, Complaint, ComplaintFilters } from '../types/complaints'
import { complaintsAPI } from '../api/complaints'

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
  clearFilters: () => void
  setPage: (page: number) => void
  clearError: () => void
}

export const useComplaintsStore = create<ComplaintsStore>((set, get) => ({
  complaints: [],
  currentComplaint: null,
  filters: {
    exclude_closed: true,
    ordering: '-created_at',
  },
  isLoading: false,
  error: null,
  totalCount: 0,
  page: 1,
  pageSize: 20,

  fetchComplaints: async (filters?: ComplaintFilters) => {
    set({ isLoading: true, error: null })
    try {
      const currentFilters = filters || get().filters
      const response = await complaintsAPI.getList(currentFilters)
      // DRF возвращает {results: [], count: number} или просто массив
      const complaintsList = Array.isArray(response) ? response : (response.results || [])
      const total = Array.isArray(response) ? response.length : (response.count || 0)
      set({
        complaints: complaintsList,
        totalCount: total,
        isLoading: false,
      })
    } catch (error: any) {
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

  clearFilters: () => {
    set({
      filters: {
        exclude_closed: true,
        ordering: '-created_at',
      },
      page: 1,
    })
  },

  setPage: (page: number) => {
    set({ page })
  },

  clearError: () => {
    set({ error: null })
  },
}))

