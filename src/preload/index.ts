import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  books: {
    list: () => ipcRenderer.invoke('books:list'),
    save: (book: unknown) => ipcRenderer.invoke('books:save', book),
    delete: (bookId: string) => ipcRenderer.invoke('books:delete', bookId),
    saveCover: (bookId: string, base64: string, ext: string) =>
      ipcRenderer.invoke('books:saveCover', bookId, base64, ext),
    chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('books:chooseFolder'),
    resolveCustomPath: (parentDir: string, bookName: string): Promise<string> =>
      ipcRenderer.invoke('books:resolveCustomPath', parentDir, bookName),
    recover: (bookId: string): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('books:recover', bookId),
    trashList: () => ipcRenderer.invoke('books:trash:list'),
    restore: (bookId: string): Promise<void> => ipcRenderer.invoke('books:trash:restore', bookId),
    deletePermanently: (bookId: string): Promise<void> => ipcRenderer.invoke('books:trash:delete', bookId)
  },
  characters: {
    list: (bookId: string) => ipcRenderer.invoke('characters:list', bookId),
    save: (character: unknown) => ipcRenderer.invoke('characters:save', character),
    delete: (charId: string, bookId: string) =>
      ipcRenderer.invoke('characters:delete', charId, bookId)
  },
  chapters: {
    list: (bookId: string) => ipcRenderer.invoke('chapters:list', bookId),
    save: (chapter: unknown) => ipcRenderer.invoke('chapters:save', chapter),
    delete: (chapterId: string, bookId: string) =>
      ipcRenderer.invoke('chapters:delete', chapterId, bookId)
  },
  acts: {
    list: (bookId: string) => ipcRenderer.invoke('acts:list', bookId),
    save: (act: unknown) => ipcRenderer.invoke('acts:save', act),
    delete: (actId: string, bookId: string) => ipcRenderer.invoke('acts:delete', actId, bookId)
  },
  snapshots: {
    list: (bookId: string) => ipcRenderer.invoke('snapshots:list', bookId),
    save: (snapshot: unknown) => ipcRenderer.invoke('snapshots:save', snapshot),
    delete: (snapshotId: string, bookId: string) =>
      ipcRenderer.invoke('snapshots:delete', snapshotId, bookId),
    restore: (bookId: string, snapshotChapters: unknown[], currentChapterIds: string[]) =>
      ipcRenderer.invoke('snapshots:restore', bookId, snapshotChapters, currentChapterIds),
  },
  image: {
    openDialog: () => ipcRenderer.invoke('image:open-dialog'),
    save: (bookId: string, entityType: string, base64: string, ext: string) =>
      ipcRenderer.invoke('image:save', bookId, entityType, base64, ext)
  },
  speech: {
    checkModels: () => ipcRenderer.invoke('speech:checkModels'),
    start: (sessionId: string) => ipcRenderer.invoke('speech:start', sessionId),
    sendChunk: (buffer: ArrayBuffer) => ipcRenderer.invoke('speech:chunk', buffer),
    stop: () => ipcRenderer.invoke('speech:stop'),
    onFinal: (cb: (text: string) => void) => {
      const handler = (_: unknown, t: string): void => cb(t)
      ipcRenderer.on('speech:final', handler)
      return () => ipcRenderer.removeListener('speech:final', handler)
    },
    onError: (cb: (err: { code: string; message: string }) => void) => {
      const handler = (_: unknown, e: { code: string; message: string }): void => cb(e)
      ipcRenderer.on('speech:error', handler)
      return () => ipcRenderer.removeListener('speech:error', handler)
    },
    onStateChange: (cb: (state: 'idle' | 'recording' | 'processing') => void) => {
      const handler = (_: unknown, s: 'idle' | 'recording' | 'processing'): void => cb(s)
      ipcRenderer.on('speech:stateChange', handler)
      return () => ipcRenderer.removeListener('speech:stateChange', handler)
    },
    listVoskModels: (): Promise<{ userFiles: string[]; bundledFiles: string[] }> =>
      ipcRenderer.invoke('speech:listVoskModels'),
    downloadVoskModel: (id: string, url: string, filename: string): Promise<{ ok: boolean; message?: string }> =>
      ipcRenderer.invoke('speech:downloadVoskModel', id, url, filename),
    deleteVoskModel: (filename: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('speech:deleteVoskModel', filename),
    onVoskDownloadProgress: (cb: (p: { id: string; percent: number; downloaded: number; total: number }) => void) => {
      const handler = (_: unknown, p: { id: string; percent: number; downloaded: number; total: number }): void => cb(p)
      ipcRenderer.on('speech:voskDownloadProgress', handler)
      return () => ipcRenderer.removeListener('speech:voskDownloadProgress', handler)
    },
  },
  cover: {
    savePng: (bookId: string, dataUrl: string, side: string) =>
      ipcRenderer.invoke('cover:savePng', bookId, dataUrl, side),
    saveDesign: (bookId: string, design: unknown) =>
      ipcRenderer.invoke('cover:saveDesign', bookId, design),
    loadDesign: (bookId: string) =>
      ipcRenderer.invoke('cover:loadDesign', bookId),
    saveRendered: (bookId: string, dataUrl: string, side: string) =>
      ipcRenderer.invoke('cover:saveRendered', bookId, dataUrl, side),
    loadRendered: (bookId: string, side: string) =>
      ipcRenderer.invoke('cover:loadRendered', bookId, side)
  },
  export: {
    savePdf: (fileName: string, base64: string): Promise<{ ok: boolean; filePath?: string }> =>
      ipcRenderer.invoke('export:savePdf', fileName, base64),
    saveDocx: (fileName: string, base64: string): Promise<{ ok: boolean; filePath?: string }> =>
      ipcRenderer.invoke('export:saveDocx', fileName, base64),
    saveEpub: (fileName: string, base64: string): Promise<{ ok: boolean; filePath?: string }> =>
      ipcRenderer.invoke('export:saveEpub', fileName, base64),
  },
  shell: {
    revealFile: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:revealFile', filePath),
    openFile: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:openFile', filePath),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  },
  llama: {
    hardware: () => ipcRenderer.invoke('llama:hardware'),
    isDownloaded: () => ipcRenderer.invoke('llama:isDownloaded'),
    memoryCheck: () => ipcRenderer.invoke('llama:memoryCheck'),
    download: () => ipcRenderer.invoke('llama:download'),
    init: () => ipcRenderer.invoke('llama:init'),
    generate: (sys: string, user: string) => ipcRenderer.invoke('llama:generate', sys, user),
    startInterview: (sys: string) => ipcRenderer.invoke('llama:startInterview', sys),
    sendInterviewMessage: (msg: string) => ipcRenderer.invoke('llama:sendInterviewMessage', msg),
    resetInterview: () => ipcRenderer.invoke('llama:resetInterview'),
    cancel: () => ipcRenderer.invoke('llama:cancel'),
    unload: () => ipcRenderer.invoke('llama:unload'),
    onProgress: (cb: (p: { percent: number; downloaded: number; total: number }) => void) => {
      const handler = (_: unknown, p: { percent: number; downloaded: number; total: number }): void => cb(p)
      ipcRenderer.on('llama:progress', handler)
      return () => ipcRenderer.removeListener('llama:progress', handler)
    },
    onToken: (cb: (t: { token: string; done: boolean }) => void) => {
      const handler = (_: unknown, t: { token: string; done: boolean }): void => cb(t)
      ipcRenderer.on('llama:token', handler)
      return () => ipcRenderer.removeListener('llama:token', handler)
    },
    onReady: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('llama:ready', handler)
      return () => ipcRenderer.removeListener('llama:ready', handler)
    },
    onError: (cb: (e: { message: string }) => void) => {
      const handler = (_: unknown, e: { message: string }): void => cb(e)
      ipcRenderer.on('llama:error', handler)
      return () => ipcRenderer.removeListener('llama:error', handler)
    },
    onDownloadComplete: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('llama:downloadComplete', handler)
      return () => ipcRenderer.removeListener('llama:downloadComplete', handler)
    },
    onInitProgress: (cb: (p: { stage: string }) => void) => {
      const handler = (_: unknown, p: { stage: string }): void => cb(p)
      ipcRenderer.on('llama:initProgress', handler)
      return () => ipcRenderer.removeListener('llama:initProgress', handler)
    },
    modelStatuses: () => ipcRenderer.invoke('llama:modelStatuses'),
    downloadById: (id: string) => ipcRenderer.invoke('llama:downloadById', id),
    uninstall: (id: string) => ipcRenderer.invoke('llama:uninstall', id),
    initById: (id: string) => ipcRenderer.invoke('llama:initById', id),
    generatePipelined: (
      architectPrompt: { sys: string; user: string },
      ghostwriterSys: string,
      editorEnabled: boolean,
      editorSys: string,
      targetWords?: number
    ) => ipcRenderer.invoke('llama:generatePipelined', architectPrompt, ghostwriterSys, editorEnabled, editorSys, targetWords),
    onPipelineStage: (cb: (p: { stage: string; done: boolean }) => void) => {
      const handler = (_: unknown, p: { stage: string; done: boolean }): void => cb(p)
      ipcRenderer.on('llama:pipelineStage', handler)
      return () => ipcRenderer.removeListener('llama:pipelineStage', handler)
    }
  },
  ai: {
    setProvider: (p: 'lekha' | 'qwen'): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('ai:setProvider', p),
  },
  auth: {
    canTouchId: (): Promise<boolean> => ipcRenderer.invoke('auth:can-touch-id'),
    promptTouchId: (reason: string): Promise<void> =>
      ipcRenderer.invoke('auth:prompt-touch-id', reason)
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
    isWelcomed: (): Promise<boolean> => ipcRenderer.invoke('app:isWelcomed'),
    setWelcomed: (): Promise<void> => ipcRenderer.invoke('app:setWelcomed'),
    createDemoBook: (): Promise<void> => ipcRenderer.invoke('app:createDemoBook'),
    isDemoBookLoaded: (): Promise<boolean> => ipcRenderer.invoke('app:isDemoBookLoaded'),
    relaunch: (): Promise<void> => ipcRenderer.invoke('app:relaunch'),
    isMas: (): Promise<boolean> => ipcRenderer.invoke('app:isMas'),
    appleIntelligenceAvailable: (): Promise<{ available: boolean; reason?: string }> =>
      ipcRenderer.invoke('app:appleIntelligenceAvailable'),
  },
  billing: {
    canMakePayments: (): Promise<boolean> => ipcRenderer.invoke('billing:canMakePayments'),
    getProducts: (productIds: string[]): Promise<any[]> => ipcRenderer.invoke('billing:getProducts', productIds),
    purchase: (productId: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('billing:purchase', productId),
    restore: (productId: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('billing:restore', productId)
  },
  bookTrash: {
    list: (bookId: string) => ipcRenderer.invoke('bookTrash:list', bookId),
    restoreChapter: (bookId: string, chapterId: string) =>
      ipcRenderer.invoke('bookTrash:restoreChapter', bookId, chapterId),
    restoreCharacter: (bookId: string, charId: string) =>
      ipcRenderer.invoke('bookTrash:restoreCharacter', bookId, charId),
    deleteItems: (bookId: string, itemIds: string[]) =>
      ipcRenderer.invoke('bookTrash:deleteItems', bookId, itemIds)
  },
  settings: {
    get: (): Promise<{ isMas: boolean; accountSignedIn: boolean; enabled: boolean; booksDir: string }> =>
      ipcRenderer.invoke('settings:get'),
    setICloudSync: (enabled: boolean): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:setICloudSync', enabled),
  },
  icloud: {
    onConflicts: (cb: (conflicts: { bookId: string; bookName: string; files: { relPath: string; originalPath: string; conflictPath: string; conflictDate: string }[] }[]) => void) => {
      const handler = (_: unknown, c: Parameters<typeof cb>[0]): void => cb(c)
      ipcRenderer.on('icloud:conflicts', handler)
      return (): void => { ipcRenderer.removeListener('icloud:conflicts', handler) }
    },
    resolveConflict: (conflictPath: string, action: 'keepOriginal' | 'keepConflict' | 'keepBoth'): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('icloud:resolveConflict', conflictPath, action),
  },
})
