export type BookHealth = 'ok' | 'missing' | 'corrupted' | 'unrecoverable'

export interface BookTrashItem {
  id: string
  type: 'chapter' | 'character'
  name: string
  deletedAt: string
  wordCount?: number
  kind?: string
  role?: string
  photoDataUrl?: string
}

export interface TrashedBook {
  id: string
  name: string
  synopsis: string
  author?: string
  createdAt: string
  trashedAt: string
  coverDataUrl?: string
}

export interface BookStyle {
  fontFamily: string    // e.g. 'EB Garamond'
  fontSize: number      // pt, e.g. 12
  lineSpacing: number   // unitless, e.g. 1.6
  marginTop: number     // inches, e.g. 1.0
  marginBottom: number  // inches, e.g. 1.0
  marginInner: number   // inches (gutter/binding side), e.g. 1.0
  marginOuter: number   // inches (outer/fore-edge side), e.g. 0.75
  structureLabel?: 'act' | 'section'  // 'act' (default) or 'section'
  editorZoom?: number | 'fit'         // saved zoom preference; undefined = first open (auto-fit)
  autoSave?: boolean                  // undefined | true = ON (default), false = manual only
}

export const DEFAULT_BOOK_STYLE: BookStyle = {
  fontFamily: 'EB Garamond',
  fontSize: 12,
  lineSpacing: 1.6,
  marginTop: 1.0,
  marginBottom: 1.0,
  marginInner: 1.0,
  marginOuter: 0.75,
  structureLabel: 'act',
}

export interface Book {
  id: string
  name: string
  synopsis: string
  createdAt: string
  updatedAt: string
  coverPath?: string
  coverDataUrl?: string
  customPath?: string      // persisted — absolute path to book folder (custom location only)
  backupHealth?: BookHealth // runtime-only — injected by books:list, never written to disk
  wordGoals?: {
    daily?: number
    weekly?: number
    monthly?: number
  }
  wordHistory: { date: string; count: number }[]
  format?: string // key into BOOK_FORMATS, defaults to 'trade-paperback'
  author?: string
  style?: BookStyle
  notes?: string  // project-level scratch pad, persisted to book metadata
}

export interface CharacterRelationship {
  charId: string
  description: string
}

export interface Character {
  id: string
  bookId: string
  name: string

  // Tab 1 — Physical
  photoPath?: string
  photoDataUrl?: string
  age?: string
  gender?: string
  hairColor?: string
  eyeColor?: string
  skinColor?: string
  build?: string

  // Tab 2 — Personality
  ghost?: string
  lie?: string
  truth?: string
  motivation?: string
  stakes?: string

  // Tab 3 — Traits & Voice
  voiceProfile?: string
  mannerisms?: string
  behaviour?: string

  // Tab 4 — Story Role & Connections
  role?: string
  arcType?: string
  relationships?: CharacterRelationship[]

  // Tab 5 — Gallery
  galleryPaths?: string[]
  galleryDataUrls?: string[]

  // Legacy (kept for backward compat with existing JSON files)
  attributes?: {
    hairColor?: string
    skinColor?: string
    gender?: string
    build?: string
    behaviour?: string
    age?: string
    eyeColor?: string
    notes?: string
  }

  createdAt: string
}

export type ContentKind =
  | 'half-title' | 'title-page' | 'copyright' | 'dedication' | 'toc'
  | 'chapter' | 'part-break'
  | 'appendix' | 'glossary' | 'bibliography' | 'index' | 'author-bio'

export interface Chapter {
  id: string
  bookId: string
  title: string
  order: number
  kind?: ContentKind
  summary: string
  content: object
  wordCount: number
  wordTarget?: number   // optional per-chapter word-count goal
  createdAt: string
  updatedAt: string
  // Micro-planning fields
  planGoal?: string    // "What must happen by the end of this chapter?"
  planPov?: string     // "Whose eyes do we see through?"
  planBeats?: string   // Markdown: scene beats / plot-point checklists
  notes?: string       // Freeform scratch pad (research, reminders)
  actId?: string       // which act this chapter belongs to (undefined = ungrouped)
  status?: 'draft' | 'revised' | 'final'  // writing status label
}

export interface Act {
  id: string
  bookId: string
  title: string      // e.g. "The Ordinary World" (act number auto-computed from order)
  subtitle?: string  // optional subtitle / epigraph line shown under the title
  content?: object   // ProseMirror JSON for the act separator page body
  summary: string
  order: number      // 0-based; "Act 1" = order 0
  createdAt: string
  updatedAt: string
}

export interface Snapshot {
  id: string
  bookId: string
  name: string
  createdAt: string
  chapters: Chapter[]
  totalWordCount: number
  chapterCount: number
}

export interface TextLayer {
  id: string
  type: 'text'
  x: number
  y: number
  rotation: number
  visible: boolean
  text: string
  fontSize: number
  fontFamily: string
  fill: string
  letterSpacing: number
  lineHeight: number
  width: number
  fontStyle?: string           // '' | 'bold' | 'italic' | 'bold italic'
  textDecoration?: string      // '' | 'underline'
  align?: 'left' | 'center' | 'right'
  opacity?: number             // 0–1, default 1
  locked?: boolean             // true = synced with book metadata
  metadataKey?: 'title' | 'author'
}

export interface ImageLayer {
  id: string
  type: 'image'
  x: number
  y: number
  rotation: number
  visible: boolean
  src: string
  width: number
  height: number
  brightness: number
  contrast: number
  grayscale: boolean
  opacity?: number             // 0–1, default 1
  locked?: boolean
}

export type CoverLayer = TextLayer | ImageLayer

export type SpeechState = 'idle' | 'recording' | 'processing'

export type ConflictAction = 'keepOriginal' | 'keepConflict' | 'keepBoth'

export interface ConflictFile {
  relPath: string
  originalPath: string
  conflictPath: string
  conflictDate: string
}

export interface ConflictInfo {
  bookId: string
  bookName: string
  files: ConflictFile[]
}

export interface ICloudStatus {
  isMas: boolean
  accountSignedIn: boolean
  enabled: boolean
  booksDir: string
}
export interface ElectronAPI {
  books: {
    list: () => Promise<Book[]>
    save: (book: Book) => Promise<void>
    delete: (bookId: string) => Promise<void>
    saveCover: (bookId: string, base64: string, ext: string) => Promise<string>
    chooseFolder: () => Promise<string | null>
    resolveCustomPath: (parentDir: string, bookName: string) => Promise<string>
    recover: (bookId: string) => Promise<{ ok: boolean; reason?: string }>
    trashList: () => Promise<TrashedBook[]>
    restore: (bookId: string) => Promise<void>
    deletePermanently: (bookId: string) => Promise<void>
  }
  characters: {
    list: (bookId: string) => Promise<Character[]>
    save: (character: Character) => Promise<void>
    delete: (charId: string, bookId: string) => Promise<void>
  }
  chapters: {
    list: (bookId: string) => Promise<Chapter[]>
    save: (chapter: Chapter) => Promise<void>
    delete: (chapterId: string, bookId: string) => Promise<void>
  }
  acts: {
    list: (bookId: string) => Promise<Act[]>
    save: (act: Act) => Promise<void>
    delete: (actId: string, bookId: string) => Promise<void>
  }
  image: {
    openDialog: () => Promise<string | null>
    save: (
      bookId: string,
      entityType: 'character' | 'chapter' | 'character-gallery',
      base64: string,
      ext: string
    ) => Promise<string>
  }
  speech: {
    checkModels: () => Promise<{ vosk: boolean; whisper: boolean }>
    start: (sessionId: string) => Promise<{ ok: true } | { code: string; message: string }>
    sendChunk: (buffer: ArrayBuffer) => Promise<void>
    stop: () => Promise<void>
    onFinal: (cb: (text: string) => void) => () => void
    onError: (cb: (err: { code: string; message: string }) => void) => () => void
    onStateChange: (cb: (state: SpeechState) => void) => () => void
    listVoskModels: () => Promise<{ userFiles: string[]; bundledFiles: string[] }>
    downloadVoskModel: (id: string, url: string, filename: string) => Promise<{ ok: boolean; message?: string }>
    deleteVoskModel: (filename: string) => Promise<{ ok: boolean }>
    onVoskDownloadProgress: (cb: (p: { id: string; percent: number; downloaded: number; total: number }) => void) => () => void
  }
  cover: {
    savePng: (bookId: string, dataUrl: string, side: string) => Promise<{ success: boolean }>
    saveDesign: (bookId: string, design: unknown) => Promise<{ success: boolean }>
    loadDesign: (bookId: string) => Promise<unknown>
    saveRendered: (bookId: string, dataUrl: string, side: string) => Promise<{ success: boolean }>
    loadRendered: (bookId: string, side: string) => Promise<string | null>
  }
  export: {
    savePdf: (fileName: string, base64: string) => Promise<{ ok: boolean; filePath?: string }>
    saveDocx: (fileName: string, base64: string) => Promise<{ ok: boolean; filePath?: string }>
    saveEpub: (fileName: string, base64: string) => Promise<{ ok: boolean; filePath?: string }>
  }
  shell: {
    revealFile: (filePath: string) => Promise<void>
    openFile: (filePath: string) => Promise<void>
    openExternal: (url: string) => Promise<void>
  }
  llama: {
    hardware: () => Promise<{ totalGb: number; freeGb: number; freeDiskGb: number; recommended: string; contextSize: number }>
    isDownloaded: () => Promise<boolean>
    memoryCheck: () => Promise<'green' | 'yellow' | 'red'>
    download: () => Promise<{ started: boolean }>
    init: () => Promise<{ ok: boolean; message?: string }>
    initById: (id: string) => Promise<{ ok: boolean; message?: string }>
    generate: (sys: string, user: string) => Promise<{ started: boolean }>
    generatePipelined: (
      architectPrompt: { sys: string; user: string },
      ghostwriterSys: string,
      editorEnabled: boolean,
      editorSys: string,
      targetWords?: number
    ) => Promise<{ started: boolean }>
    startInterview: (sys: string) => Promise<{ ok: boolean; message?: string }>
    sendInterviewMessage: (msg: string) => Promise<{ started: boolean }>
    resetInterview: () => Promise<void>
    cancel: () => Promise<void>
    unload: () => Promise<void>
    modelStatuses: () => Promise<Array<{
      id: string
      label: string
      description: string
      sizeGb: number
      requiredFreeGb: number
      downloaded: boolean
    }>>
    downloadById: (id: string) => Promise<{ started: boolean }>
    uninstall: (id: string) => Promise<void>
    onProgress: (cb: (p: { percent: number; downloaded: number; total: number }) => void) => () => void
    onToken: (cb: (t: { token: string; done: boolean }) => void) => () => void
    onReady: (cb: () => void) => () => void
    onError: (cb: (e: { message: string }) => void) => () => void
    onDownloadComplete: (cb: () => void) => () => void
    onInitProgress: (cb: (p: { stage: string }) => void) => () => void
    onPipelineStage: (cb: (p: { stage: string; done: boolean }) => void) => () => void
  }
  ai: {
    setProvider: (p: 'lekha' | 'qwen') => Promise<{ ok: boolean }>
  }
  snapshots: {
    list: (bookId: string) => Promise<Snapshot[]>
    save: (snapshot: Snapshot) => Promise<void>
    delete: (snapshotId: string, bookId: string) => Promise<void>
    restore: (bookId: string, snapshotChapters: Chapter[], currentChapterIds: string[]) => Promise<void>
  }
  auth: {
    canTouchId: () => Promise<boolean>
    promptTouchId: (reason: string) => Promise<void>
  }
  bookTrash: {
    list: (bookId: string) => Promise<BookTrashItem[]>
    restoreChapter: (bookId: string, chapterId: string) => Promise<void>
    restoreCharacter: (bookId: string, charId: string) => Promise<void>
    deleteItems: (bookId: string, itemIds: string[]) => Promise<void>
  }
  app: {
    getVersion: () => Promise<string>
    isWelcomed: () => Promise<boolean>
    setWelcomed: () => Promise<void>
    createDemoBook: () => Promise<void>
    isDemoBookLoaded: () => Promise<boolean>
    relaunch: () => Promise<void>
    isMas: () => Promise<boolean>
    appleIntelligenceAvailable: () => Promise<{ available: boolean; reason?: string }>
  }
  settings: {
    get: () => Promise<ICloudStatus>
    setICloudSync: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
  }
  icloud: {
    onConflicts: (cb: (conflicts: ConflictInfo[]) => void) => () => void
    resolveConflict: (conflictPath: string, action: ConflictAction) => Promise<{ ok: boolean }>
  }
  billing: {
    canMakePayments: () => Promise<boolean>
    getProducts: (productIds: string[]) => Promise<any[]>
    purchase: (productId: string) => Promise<{ success: boolean; message?: string }>
    restore: (productId: string) => Promise<{ success: boolean; message?: string }>
  }
  settings: {
    get: () => Promise<ICloudStatus>
    setICloudSync: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
  }
  icloud: {
    onConflicts: (cb: (conflicts: ConflictInfo[]) => void) => () => void
    resolveConflict: (conflictPath: string, action: ConflictAction) => Promise<{ ok: boolean }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
