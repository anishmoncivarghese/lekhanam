import { create } from 'zustand'

interface SecurityState {
  isEnabled: boolean  // persisted to localStorage
  isLocked: boolean   // transient — always false on app launch
  setEnabled: (v: boolean) => void
  lock: () => void
  unlock: () => void
}

const STORAGE_KEY = 'lekhanam_security_enabled'

export const useSecurityStore = create<SecurityState>((set) => ({
  isEnabled: localStorage.getItem(STORAGE_KEY) === 'true',
  isLocked: localStorage.getItem(STORAGE_KEY) === 'true', // start locked whenever feature is on
  setEnabled: (v) => {
    localStorage.setItem(STORAGE_KEY, String(v))
    set({ isEnabled: v, isLocked: false })
  },
  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),
}))
