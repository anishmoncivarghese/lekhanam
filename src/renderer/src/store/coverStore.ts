import { create } from 'zustand'

interface CoverStoreState {
  frontDataUrl: string | null
  backDataUrl: string | null
  spreadDataUrl: string | null
  setFront: (url: string | null) => void
  setBack: (url: string | null) => void
  setSpread: (url: string | null) => void
}

export const useCoverStore = create<CoverStoreState>((set) => ({
  frontDataUrl: null,
  backDataUrl: null,
  spreadDataUrl: null,
  setFront: (url) => set({ frontDataUrl: url }),
  setBack: (url) => set({ backDataUrl: url }),
  setSpread: (url) => set({ spreadDataUrl: url }),
}))
