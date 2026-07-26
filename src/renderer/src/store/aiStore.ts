import { create } from 'zustand'

// One-time cleanup of deprecated localStorage keys from pre-redesign versions
if (typeof localStorage !== 'undefined') {
  localStorage.removeItem('lekhanam_ai_provider')
  localStorage.removeItem('lekhanam_qwen_default_model')
}

export type ModelStatus =
  | 'unchecked'
  | 'missing'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'error'
  | 'insufficient_ram'

export type AiStyle = 'cinematic' | 'introspective' | 'minimalist' | 'poetic'
export type AiMode = 'closed' | 'assist' | 'ghostwriter' | 'interview'
export type DraftLength = 'flash' | 'short' | 'standard' | 'long'

export const DRAFT_LENGTH_PRESETS: Record<DraftLength, { words: number; label: string }> = {
  flash:    { words: 500,  label: 'Flash' },
  short:    { words: 1200, label: 'Short' },
  standard: { words: 2500, label: 'Standard' },
  long:     { words: 4000, label: 'Long' },
}
export type MemoryHealth = 'green' | 'yellow' | 'red'
export type PipelineStage = 'idle' | 'architect' | 'ghostwriter' | 'editor'

export interface CatalogModelStatus {
  id: string
  label: string
  description: string
  sizeGb: number
  requiredFreeGb: number
  downloaded: boolean
}

interface AiState {
  // Model / hardware
  modelStatus: ModelStatus
  downloadProgress: number // 0–100
  initStage: string // 'loading_library' | 'loading_model' | 'creating_context' | ''
  variant: 'micro' | 'lite' | 'standard' | 'premium' | null
  contextSize: number
  totalRamGb: number
  freeRamGb: number
  freeDiskGb: number
  memoryHealth: MemoryHealth
  recommended: string | null

  // UI mode
  activeMode: AiMode
  aiStyle: AiStyle

  // Streaming
  streamingText: string
  assistText: string
  ghostwriterText: string
  isGenerating: boolean
  generatingMode: 'assist' | 'ghostwriter' | 'interview' | 'chapter-draft' | null

  // Pipeline (for 3-phase chapter generation)
  pipelineStage: PipelineStage

  // Model catalog
  catalogStatuses: CatalogModelStatus[] | null

  // Error
  errorMessage: string | null

  // Editor features
  assistiveWriting: boolean

  // Chapter draft length preset
  draftLength: DraftLength

  // Actions
  setModelStatus: (s: ModelStatus) => void
  setDownloadProgress: (p: number) => void
  setInitStage: (stage: string) => void
  setHardware: (totalGb: number, freeGb: number, recommended: string | null, ctx: number, freeDiskGb: number) => void
  clearError: () => void
  setMemoryHealth: (h: MemoryHealth) => void
  setActiveMode: (m: AiMode) => void
  setAiStyle: (s: AiStyle) => void
  appendToken: (t: string) => void
  clearStream: () => void
  appendAssistToken: (t: string) => void
  clearAssistText: () => void
  appendGhostwriterToken: (t: string) => void
  clearGhostwriterText: () => void
  setIsGenerating: (v: boolean) => void
  setGeneratingMode: (m: 'assist' | 'ghostwriter' | 'interview' | 'chapter-draft' | null) => void
  setPipelineStage: (s: PipelineStage) => void
  setCatalogStatuses: (s: CatalogModelStatus[] | null) => void
  setError: (msg: string | null) => void
  setAssistiveWriting: (v: boolean) => void
  setDraftLength: (l: DraftLength) => void

  // New per-model state (single-model-in-RAM invariant)
  loadedModelId: string | null
  lastLoadedModelId: string | null
  loadingId: string | null
  downloadingId: string | null
  downloadedIds: string[]          // serializable; use array not Set
  downloadPercent: number

  // Panel UI
  panelTab: 'assistant' | 'models'
  otherModelsExpanded: boolean

  // Selectors + new actions
  statusOf: (id: string) => 'not_downloaded' | 'downloading' | 'downloaded' | 'loading' | 'loaded' | 'error'
  setLoadedModelId: (id: string | null) => void
  setLastLoadedModelId: (id: string | null) => void
  setLoadingId: (id: string | null) => void
  setDownloadingId: (id: string | null) => void
  setDownloadPercent: (p: number) => void
  setDownloadedIds: (ids: string[]) => void
  setPanelTab: (t: 'assistant' | 'models') => void
  setOtherModelsExpanded: (v: boolean) => void
  syncDownloaded: () => Promise<void>
}

export const useAiStore = create<AiState>((set) => ({
  modelStatus: 'unchecked',
  downloadProgress: 0,
  initStage: '',
  variant: null,
  contextSize: 4096,
  totalRamGb: 0,
  freeRamGb: 0,
  freeDiskGb: 999,
  memoryHealth: 'green',
  recommended: null,
  activeMode: 'closed',
  aiStyle: ((typeof localStorage !== 'undefined' && localStorage.getItem('lekhanam_ai_style')) as AiStyle | null) || 'cinematic',
  streamingText: '',
  assistText: '',
  ghostwriterText: '',
  isGenerating: false,
  generatingMode: null,
  pipelineStage: 'idle',
  catalogStatuses: null,
  errorMessage: null,
  assistiveWriting: false,
  draftLength: ((typeof localStorage !== 'undefined' && localStorage.getItem('lekhanam_draft_length')) as DraftLength | null) || 'short',

  // New per-model state
  loadedModelId: null,
  lastLoadedModelId: (typeof localStorage !== 'undefined' && localStorage.getItem('lekhanam_last_loaded_model')) || null,
  loadingId: null,
  downloadingId: null,
  downloadedIds: [],
  downloadPercent: 0,

  panelTab: ((typeof localStorage !== 'undefined' && localStorage.getItem('lekhanam_ai_panel_tab')) as 'assistant' | 'models' | null) || 'assistant',
  otherModelsExpanded: (typeof localStorage !== 'undefined' && localStorage.getItem('lekhanam_other_models_expanded')) === 'true',

  setModelStatus: (s) => set({ modelStatus: s }),
  setDownloadProgress: (p) => set({ downloadProgress: p }),
  setInitStage: (stage) => set({ initStage: stage }),
  setHardware: (totalGb, freeGb, recommended, ctx, freeDiskGb) =>
    set({
      totalRamGb: totalGb,
      freeRamGb: freeGb,
      recommended,
      contextSize: ctx,
      freeDiskGb,
    }),
  setMemoryHealth: (h) => set({ memoryHealth: h }),
  setActiveMode: (m) => set({ activeMode: m }),
  setAiStyle: (s) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('lekhanam_ai_style', s)
    set({ aiStyle: s })
  },
  appendToken: (t) => set((state) => ({ streamingText: state.streamingText + t })),
  clearStream: () => set({ streamingText: '' }),
  appendAssistToken: (t) => set((state) => ({ assistText: state.assistText + t })),
  clearAssistText: () => set({ assistText: '' }),
  appendGhostwriterToken: (t) => set((state) => ({ ghostwriterText: state.ghostwriterText + t })),
  clearGhostwriterText: () => set({ ghostwriterText: '' }),
  setIsGenerating: (v) => set({ isGenerating: v }),
  setGeneratingMode: (m) => set({ generatingMode: m }),
  setPipelineStage: (s) => set({ pipelineStage: s }),
  setCatalogStatuses: (s) => set({ catalogStatuses: s }),
  setError: (msg) => set({ errorMessage: msg }),
  clearError: () => set({ errorMessage: null }),
  setAssistiveWriting: (v) => set({ assistiveWriting: v }),
  setDraftLength: (l) => {
    localStorage.setItem('lekhanam_draft_length', l)
    set({ draftLength: l })
  },

  statusOf: (id) => {
    const s = useAiStore.getState()
    if (s.loadedModelId === id) return 'loaded'
    if (s.loadingId === id) return 'loading'
    if (s.downloadingId === id) return 'downloading'
    if (s.downloadedIds.includes(id)) return 'downloaded'
    return 'not_downloaded'
  },

  setLoadedModelId: (id) => {
    if (id) {
      localStorage.setItem('lekhanam_last_loaded_model', id)
      set({ loadedModelId: id, lastLoadedModelId: id })
    } else {
      set({ loadedModelId: null })
    }
  },
  setLastLoadedModelId: (id) => {
    if (id) localStorage.setItem('lekhanam_last_loaded_model', id)
    else localStorage.removeItem('lekhanam_last_loaded_model')
    set({ lastLoadedModelId: id })
  },
  setLoadingId: (id) => set({ loadingId: id }),
  setDownloadingId: (id) => set({ downloadingId: id, downloadPercent: 0 }),
  setDownloadPercent: (p) => set({ downloadPercent: p }),
  setDownloadedIds: (ids) => set({ downloadedIds: ids }),

  setPanelTab: (t) => {
    localStorage.setItem('lekhanam_ai_panel_tab', t)
    set({ panelTab: t })
  },
  setOtherModelsExpanded: (v) => {
    localStorage.setItem('lekhanam_other_models_expanded', String(v))
    set({ otherModelsExpanded: v })
  },

  syncDownloaded: async () => {
    try {
      const statuses = await window.electron.llama.modelStatuses() as CatalogModelStatus[]
      const downloadedIds = statuses.filter((s) => s.downloaded).map((s) => s.id)
      // Cache the full catalog too so UI components can read names, sizes,
      // and RAM requirements without duplicating the main-process constants.
      set({ downloadedIds, catalogStatuses: statuses })
    } catch (err) {
      console.error('[aiStore] syncDownloaded failed', err)
    }
  },
}))

// ─── System Prompts ───────────────────────────────────────────────────────────
const BASE_SYSTEM = `You are a professional fiction editor and ghostwriter helping an author write their novel.

Core rules you ALWAYS follow:
1. Show, don't tell: Express emotion through physical sensation, behavior, and subtext—never name feelings directly.
2. Active voice: Use strong, precise verbs. Eliminate filtering language like "he felt", "she saw", "he noticed", "it seemed", "she thought".
3. Natural rhythm: Vary sentence length deliberately. Short sentences for impact and tension. Longer, flowing sentences to build momentum and interiority.`

const STYLE_SUFFIX: Record<AiStyle, string> = {
  cinematic:
    'Write with visual precision and kinetic energy. Prioritize action beats, sharp dialogue, and clear blocking. Each paragraph should play like a film shot: we see exactly what happens, in what order.',
  introspective:
    "Dive deep into the character's psychology. Explore the gap between what they say and what they feel. Let their past wounds ('The Ghost') distort how they interpret the present scene.",
  minimalist:
    "Write like Hemingway. Short, declarative sentences. No adverbs. Trust the reader to feel what is unsaid. The iceberg theory: show only the surface; let the depth be felt.",
  poetic:
    'Use rich metaphor, layered sensory imagery, and rhythmic cadence. Elevate the language. Every word must earn its place. Let the prose feel like music.'
}

export function buildSystemPrompt(style: AiStyle): string {
  return `${BASE_SYSTEM}\n\nStyle directive: ${STYLE_SUFFIX[style]}`
}

export const MAGIC_WAND_PROMPTS = {
  expand: (text: string): string =>
    `Expand this passage with more sensory detail and emotional depth, keeping the same voice and style:\n\n"${text}"\n\nExpanded version:`,
  shorten: (text: string): string =>
    `Tighten this passage to its essential meaning, eliminating every unnecessary word:\n\n"${text}"\n\nTightened version:`,
  sensory: (text: string): string =>
    `Rewrite this passage to be vivid with specific sensory details—sight, sound, smell, texture, temperature. Keep the meaning intact:\n\n"${text}"\n\nSensory version:`
}

// ─── Pipeline System Prompts ──────────────────────────────────────────────────
export const ARCHITECT_SYSTEM = `You are a story continuity editor. Given character profiles and a chapter outline, identify: character names used, any factual inconsistencies, timeline issues, and key emotional beats to hit. Output brief bullet-point notes only — no prose, no dialogue.`

export const EDITOR_SYSTEM = `You are a prose editor. Scan this passage for: overused words (very, just, really, seemed, felt), repeated sentence structures, and pacing issues. Output a concise list of 3–5 specific improvements. Be direct and practical.`
