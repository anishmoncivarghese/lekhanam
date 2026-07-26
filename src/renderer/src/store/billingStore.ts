import { create } from 'zustand'

interface BillingState {
  isPremium: boolean
  setPremium: (v: boolean) => void
}

const STORAGE_KEY = 'lekhanam_premium_unlocked_v1'

export const useBillingStore = create<BillingState>((set) => ({
  isPremium: localStorage.getItem(STORAGE_KEY) === 'true',
  setPremium: (v) => {
    localStorage.setItem(STORAGE_KEY, String(v))
    set({ isPremium: v })
  }
}))
