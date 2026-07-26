import { create } from 'zustand'

type Page = 'home' | 'new-book' | 'book'
type BookTab = 'dashboard' | 'characters' | 'cover' | 'chapters' | 'snapshots' | 'storyboard'

const THEME_KEY = 'lekhanam_dark_mode'
const SPEECH_LANG_KEY = 'lekhanam_speech_language'

interface UIState {
  currentPage: Page
  activeBookTab: BookTab
  activeChapterId: string | null
  isDark: boolean
  busyTask: string | null
  speechLanguage: string
  focusMode: boolean
  isMas: boolean
  iCloudAccountSignedIn: boolean
  iCloudSyncEnabled: boolean
  setPage: (page: Page) => void
  setBookTab: (tab: BookTab) => void
  setActiveChapter: (id: string | null) => void
  toggleTheme: () => void
  setBusyTask: (task: string | null) => void
  setSpeechLanguage: (lang: string) => void
  toggleFocusMode: () => void
  exitFocusMode: () => void
  setICloudSync: (enable: boolean) => Promise<{ ok: boolean; error?: string }>
  hydrateFromMain: () => Promise<void>
}

export const useUIStore = create<UIState>((set) => ({
  currentPage: 'home',
  activeBookTab: 'dashboard',
  activeChapterId: null,
  isDark: localStorage.getItem(THEME_KEY) === 'true',
  busyTask: null,
  speechLanguage: localStorage.getItem(SPEECH_LANG_KEY) ?? 'en-us',
  focusMode: false,
  isMas: false,
  iCloudAccountSignedIn: false,
  iCloudSyncEnabled: false,
  setPage: (page) => set({ currentPage: page }),
  setBookTab: (tab) => set({ activeBookTab: tab }),
  setActiveChapter: (id) => set({ activeChapterId: id }),
  toggleTheme: () =>
    set((s) => {
      const next = !s.isDark
      localStorage.setItem(THEME_KEY, String(next))
      return { isDark: next }
    }),
  setBusyTask: (task) => set({ busyTask: task }),
  setSpeechLanguage: (lang) => set(() => {
    localStorage.setItem(SPEECH_LANG_KEY, lang)
    return { speechLanguage: lang }
  }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  exitFocusMode: () => set({ focusMode: false }),
  setICloudSync: async (enable: boolean) => {
    const result = await window.electron.settings.setICloudSync(enable)
    if (result.ok) set({ iCloudSyncEnabled: enable })
    return result
  },
  hydrateFromMain: async () => {
    const status = await window.electron.settings.get()
    set({
      isMas: status.isMas,
      iCloudAccountSignedIn: status.accountSignedIn,
      iCloudSyncEnabled: status.enabled,
    })
  },
}))
