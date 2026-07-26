import { ipcMain, dialog, BrowserWindow, app, systemPreferences, net, shell, inAppPurchase } from 'electron'
import { promises as fs, existsSync } from 'fs'
import { join, extname, dirname, basename } from 'path'
import { homedir } from 'os'
import { v4 as uuidv4 } from 'uuid'
import { SpeechService, MODELS_DIR } from './SpeechService'
import { LlamaService, ModelVariant } from './LlamaService'
import { ICloudService } from './ICloudService'
let currentProvider: 'lekha' | 'qwen' = 'lekha'
const icloud = new ICloudService()

// === PATH HELPERS ===
const OLD_BOOKLY_DIR = join(homedir(), 'Documents', 'Bookly')
// MAS builds: data lives in ~/Library/Application Support/Lekhanam (app container)
// DMG builds: data lives in ~/Documents/Lekhanam (user-visible)
const LEKHANAM_DIR = process.mas
  ? app.getPath('userData')
  : join(homedir(), 'Documents', 'Lekhanam')
const USER_MODELS_DIR = join(LEKHANAM_DIR, 'models')
// booksIndexPath() removed — use booksIndexPath() below
const booksIndexPath = (): string => icloud.getBooksIndexPath()
const TRASH_DIR = join(LEKHANAM_DIR, 'trash')
const TRASH_INDEX_PATH = join(LEKHANAM_DIR, 'trash.json')
const trashBookDir = (id: string): string => join(TRASH_DIR, id)

// One-time data migration: rename ~/Documents/Bookly → ~/Documents/Lekhanam if needed
async function migrateDataDir(): Promise<void> {
  try {
    await fs.access(OLD_BOOKLY_DIR)
    // Old dir exists — check if new dir already exists
    try {
      await fs.access(LEKHANAM_DIR)
      // Both exist — do nothing (user may have data in both)
    } catch {
      // New dir doesn't exist — rename old to new
      await fs.rename(OLD_BOOKLY_DIR, LEKHANAM_DIR)
    }
  } catch {
    // Old dir doesn't exist — nothing to migrate
  }
}

const bookDir = (id: string): string => join(icloud.getBooksDir(), id)

// === CUSTOM PATH CACHE ===
// bookId → absolute path to the book folder (populated on books:list and books:save)
const bookDirCache = new Map<string, string>()
// Per-book debounce timers for backup sync
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>()

function resolveBookDir(id: string): string {
  return bookDirCache.get(id) ?? bookDir(id)
}

const metadataPath = (id: string): string => join(resolveBookDir(id), 'metadata.json')
const coverDir = (id: string): string => resolveBookDir(id)
const charsDir = (id: string): string => join(resolveBookDir(id), 'characters')
const charPath = (bookId: string, charId: string): string =>
  join(charsDir(bookId), `${charId}.json`)
const photosDir = (bookId: string): string => join(charsDir(bookId), 'photos')
const galleryDir = (bookId: string): string => join(charsDir(bookId), 'gallery')
const chaptersDir = (id: string): string => join(resolveBookDir(id), 'chapters')
const chapterPath = (bookId: string, chapterId: string): string =>
  join(chaptersDir(bookId), `${chapterId}.json`)
const chapterImagesDir = (bookId: string): string => join(chaptersDir(bookId), 'images')
const actsDir = (bookId: string): string => join(resolveBookDir(bookId), 'acts')
const actPath = (bookId: string, actId: string): string => join(actsDir(bookId), `${actId}.json`)
const snapshotsDir = (bookId: string): string => join(resolveBookDir(bookId), 'snapshots')
const snapshotPath = (bookId: string, snapshotId: string): string =>
  join(snapshotsDir(bookId), `${snapshotId}.json`)

// === BOOK TRASH HELPERS ===
const bookTrashDir = (id: string): string => join(resolveBookDir(id), '.trash')
const bookTrashIndex = (id: string): string => join(bookTrashDir(id), 'trash-index.json')
const bookTrashChaptersDir = (id: string): string => join(bookTrashDir(id), 'chapters')
const bookTrashCharsDir = (id: string): string => join(bookTrashDir(id), 'characters')
const bookTrashPhotosDir = (id: string): string => join(bookTrashCharsDir(id), 'photos')
const bookTrashGalleryDir = (id: string): string => join(bookTrashCharsDir(id), 'gallery')

// === BACKUP HELPERS ===

function sanitizeFolderName(name: string): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Untitled'
  )
}

function backupDirFor(mainDir: string): string {
  return join(dirname(mainDir), `.${basename(mainDir)}.backup`)
}

async function syncToBackup(mainDir: string, backupDir: string): Promise<void> {
  await ensureDir(backupDir)
  const entries = await fs.readdir(mainDir, { withFileTypes: true })
  for (const entry of entries) {
    const src = join(mainDir, entry.name)
    const dst = join(backupDir, entry.name)
    if (entry.isDirectory()) {
      await syncToBackup(src, dst)
    } else {
      let copy = true
      try {
        const [ss, ds] = await Promise.all([fs.stat(src), fs.stat(dst)])
        copy = ss.mtimeMs > ds.mtimeMs
      } catch {
        // dst doesn't exist — copy unconditionally
      }
      if (copy) {
        await ensureDir(dirname(dst))
        await fs.copyFile(src, dst)
      }
    }
  }
}

async function recoverFromBackup(backupDir: string, mainDir: string): Promise<void> {
  await ensureDir(mainDir)
  const entries = await fs.readdir(backupDir, { withFileTypes: true })
  for (const entry of entries) {
    const src = join(backupDir, entry.name)
    const dst = join(mainDir, entry.name)
    if (entry.isDirectory()) {
      await recoverFromBackup(src, dst)
    } else {
      let copy = true
      try {
        const [ss, ds] = await Promise.all([fs.stat(src), fs.stat(dst)])
        copy = ss.mtimeMs > ds.mtimeMs
      } catch {
        // dst doesn't exist — copy unconditionally
      }
      if (copy) {
        await ensureDir(dirname(dst))
        await fs.copyFile(src, dst)
      }
    }
  }
}

function scheduleSyncToBackup(bookId: string, mainDir: string): void {
  const t = syncTimers.get(bookId)
  if (t) clearTimeout(t)
  syncTimers.set(
    bookId,
    setTimeout(async () => {
      syncTimers.delete(bookId)
      try {
        await syncToBackup(mainDir, backupDirFor(mainDir))
      } catch {
        // Backup failure is non-fatal
      }
    }, 3000)
  )
}

async function resolveUniqueFolderPath(parentDir: string, folderName: string): Promise<string> {
  let candidate = join(parentDir, folderName)
  let suffix = 2
  while (true) {
    try {
      await fs.access(candidate)
      candidate = join(parentDir, `${folderName} ${suffix++}`)
    } catch {
      return candidate
    }
  }
}

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true })
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function safeMove(src: string, dst: string): Promise<void> {
  try {
    await fs.rename(src, dst)
  } catch {
    await fs.copyFile(src, dst)
    await fs.unlink(src)
  }
}

async function fileToBase64(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath)
  const ext = extname(filePath).slice(1).toLowerCase()
  const mime = ext === 'jpg' ? 'jpeg' : ext
  return `data:image/${mime};base64,${buf.toString('base64')}`
}

// === REGISTRATION ===
export async function registerIpcHandlers(mainWindow: BrowserWindow): Promise<void> {
  if (!process.mas) await migrateDataDir() // MAS: no access to old ~/Documents/Bookly

  // Warm ICloudService settings cache and resume any interrupted migration
  await icloud.getStatus()
  await icloud.resumeJournalIfNeeded()

  const speech = new SpeechService(mainWindow)
  const llama = new LlamaService(mainWindow)
  app.on('before-quit', () => {
    speech.dispose()
    llama.dispose()
  })

  ipcMain.handle('ai:setProvider', (_, provider: 'lekha' | 'qwen') => {
    currentProvider = provider
    return { ok: true }
  })

  // ---- BOOKS ----

  ipcMain.handle('books:list', async () => {
    await ensureDir(LEKHANAM_DIR)
    const index = await readJson<{ books: Array<{ id: string; customPath?: string }> }>(booksIndexPath())
    if (!index || !index.books) return []

    const books = await Promise.all(
      index.books.map(async (entry) => {
        // Populate cache from index (fast — no metadata read needed)
        if (entry.customPath) {
          bookDirCache.set(entry.id, entry.customPath)
        }

        const dir = resolveBookDir(entry.id)
        const mPath = metadataPath(entry.id)

        // Health check: verify main folder and metadata
        let mainExists = false
        let metaReadable = false
        try {
          await fs.access(dir)
          mainExists = true
          const testMeta = await readJson<unknown>(mPath)
          metaReadable = testMeta !== null
        } catch {
          // mainExists stays false
        }

        const backupDir = backupDirFor(dir)
        let backupExists = false
        try {
          await fs.access(join(backupDir, 'metadata.json'))
          backupExists = true
        } catch {
          // backup absent
        }

        type BH = 'ok' | 'missing' | 'corrupted' | 'unrecoverable'
        let backupHealth: BH
        if (mainExists && metaReadable) {
          backupHealth = 'ok'
        } else if (backupExists) {
          backupHealth = mainExists ? 'corrupted' : 'missing'
        } else {
          backupHealth = 'unrecoverable'
        }

        // If unrecoverable, return a stub so the UI can show it disabled
        if (backupHealth === 'unrecoverable') {
          return { ...entry, wordHistory: [], backupHealth }
        }

        // Read metadata from main (if ok) or backup (if not)
        const sourceMeta = metaReadable
          ? await readJson<{ id: string; coverPath?: string; coverDataUrl?: string }>(mPath)
          : await readJson<{ id: string; coverPath?: string; coverDataUrl?: string }>(
              join(backupDir, 'metadata.json')
            )

        if (!sourceMeta) return null

        const book = { ...sourceMeta, backupHealth }

        // Hydrate cover
        if (book.coverPath) {
          try {
            book.coverDataUrl = await fileToBase64(join(resolveBookDir(book.id), book.coverPath))
          } catch {
            // Try backup cover
            if (backupHealth !== 'ok') {
              try {
                book.coverDataUrl = await fileToBase64(join(backupDir, book.coverPath))
              } catch {
                book.coverDataUrl = undefined
              }
            } else {
              book.coverDataUrl = undefined
            }
          }
        }

        return book
      })
    )
    // Async conflict scan — fire-and-forget, does not delay response
    icloud.isEnabled().then(enabled => {
      if (enabled) {
        icloud.scanConflicts().then((conflicts) => {
          if (conflicts.length > 0) {
            mainWindow.webContents.send('icloud:conflicts', conflicts)
          }
        }).catch(() => { /* non-fatal */ })
      }
    }).catch(() => {})

    return books.filter(Boolean)
  })

  ipcMain.handle('books:save', async (_, book: { id: string; name: string; synopsis: string; createdAt: string; updatedAt: string; customPath?: string }) => {
    const { coverDataUrl, backupHealth, ...toSave } = book as {
      coverDataUrl?: string
      backupHealth?: string
    } & typeof book
    void coverDataUrl
    void backupHealth

    // Determine actual directory for this book
    let dir: string
    if (toSave.customPath) {
      dir = toSave.customPath
      bookDirCache.set(toSave.id, dir)
    } else {
      dir = bookDir(toSave.id)
      // No cache entry needed — resolveBookDir falls back to bookDir()
    }

    await ensureDir(dir)
    await writeJson(join(dir, 'metadata.json'), toSave)

    // Update index (always in LEKHANAM_DIR regardless of customPath)
    const existing = (await readJson<{ books: unknown[] }>(booksIndexPath())) ?? { books: [] }
    const entry = {
      id: toSave.id,
      name: toSave.name,
      synopsis: toSave.synopsis,
      createdAt: toSave.createdAt,
      updatedAt: toSave.updatedAt,
      ...(toSave.customPath ? { customPath: toSave.customPath } : {})
    }
    const idx = existing.books.findIndex((b) => (b as { id: string }).id === toSave.id)
    const isNew = idx < 0
    if (!isNew) existing.books[idx] = entry
    else existing.books.push(entry)
    await writeJson(booksIndexPath(), existing)

    // New books get an immediate backup so it exists even if app closes quickly
    if (isNew) {
      try { await syncToBackup(dir, backupDirFor(dir)) } catch { /* non-fatal */ }
    } else {
      scheduleSyncToBackup(toSave.id, dir)
    }
  })

  ipcMain.handle('books:delete', async (_, bookId: string) => {
    // Move to recycle bin (not permanent delete)
    const dir = resolveBookDir(bookId)
    const backupDir = backupDirFor(dir)

    // Read metadata to capture book info for trash index
    const meta = await readJson<{ id: string; name: string; synopsis: string; author?: string; createdAt: string }>(join(dir, 'metadata.json'))

    // Remove from books index
    const existing = (await readJson<{ books: unknown[] }>(booksIndexPath())) ?? { books: [] }
    existing.books = existing.books.filter((b) => (b as { id: string }).id !== bookId)
    await writeJson(booksIndexPath(), existing)

    // Copy book folder to trash
    await ensureDir(trashBookDir(bookId))
    try { await syncToBackup(dir, trashBookDir(bookId)) } catch { /* copy what we can */ }

    // Delete main folder and backup
    await fs.rm(dir, { recursive: true, force: true })
    await fs.rm(backupDir, { recursive: true, force: true })
    bookDirCache.delete(bookId)

    // Add to trash index
    const trashIndex = (await readJson<{ trash: unknown[] }>(TRASH_INDEX_PATH)) ?? { trash: [] }
    trashIndex.trash.push({
      id: bookId,
      name: meta?.name ?? 'Untitled',
      synopsis: meta?.synopsis ?? '',
      author: meta?.author,
      createdAt: meta?.createdAt ?? new Date().toISOString(),
      trashedAt: new Date().toISOString()
    })
    await writeJson(TRASH_INDEX_PATH, trashIndex)
  })

  ipcMain.handle('books:trash:list', async () => {
    await ensureDir(TRASH_DIR)
    const trashIndex = await readJson<{ trash: Array<{ id: string; coverPath?: string }> }>(TRASH_INDEX_PATH)
    if (!trashIndex || !trashIndex.trash) return []

    return Promise.all(
      trashIndex.trash.map(async (entry) => {
        // Try to hydrate cover
        let coverDataUrl: string | undefined
        try {
          const meta = await readJson<{ coverPath?: string }>(join(trashBookDir(entry.id), 'metadata.json'))
          if (meta?.coverPath) {
            coverDataUrl = await fileToBase64(join(trashBookDir(entry.id), meta.coverPath))
          }
        } catch { /* no cover */ }
        return { ...entry, coverDataUrl }
      })
    )
  })

  ipcMain.handle('books:trash:restore', async (_, bookId: string) => {
    const trashIndex = (await readJson<{ trash: Array<{ id: string; name: string; synopsis: string; author?: string; createdAt: string; trashedAt: string }> }>(TRASH_INDEX_PATH)) ?? { trash: [] }
    const entry = trashIndex.trash.find((b) => b.id === bookId)
    if (!entry) return

    // Restore to default path (custom path may no longer exist)
    const destDir = bookDir(bookId)
    await ensureDir(destDir)
    try { await syncToBackup(trashBookDir(bookId), destDir) } catch { /* copy what we can */ }

    // Strip customPath from restored metadata.json so future saves use default path
    try {
      const restoredMeta = await readJson<Record<string, unknown>>(join(destDir, 'metadata.json'))
      if (restoredMeta && restoredMeta.customPath) {
        delete restoredMeta.customPath
        await writeJson(join(destDir, 'metadata.json'), restoredMeta)
      }
    } catch { /* non-fatal */ }

    // Delete from trash folder
    await fs.rm(trashBookDir(bookId), { recursive: true, force: true })

    // Add back to books index (without customPath)
    const booksIndex = (await readJson<{ books: unknown[] }>(booksIndexPath())) ?? { books: [] }
    booksIndex.books.push({
      id: entry.id,
      name: entry.name,
      synopsis: entry.synopsis,
      createdAt: entry.createdAt,
      updatedAt: new Date().toISOString()
    })
    await writeJson(booksIndexPath(), booksIndex)

    // Remove from trash index
    trashIndex.trash = trashIndex.trash.filter((b) => b.id !== bookId)
    await writeJson(TRASH_INDEX_PATH, trashIndex)

    // Immediate backup for restored book
    try { await syncToBackup(destDir, backupDirFor(destDir)) } catch { /* non-fatal */ }
  })

  ipcMain.handle('books:trash:delete', async (_, bookId: string) => {
    // Permanently delete — Touch ID is verified on renderer side before calling this
    const trashIndex = (await readJson<{ trash: unknown[] }>(TRASH_INDEX_PATH)) ?? { trash: [] }
    trashIndex.trash = trashIndex.trash.filter((b) => (b as { id: string }).id !== bookId)
    await writeJson(TRASH_INDEX_PATH, trashIndex)
    await fs.rm(trashBookDir(bookId), { recursive: true, force: true })
  })

  ipcMain.handle('books:saveCover', async (_, bookId: string, base64DataUrl: string, ext: string) => {
    const rawBase64 = base64DataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buf = Buffer.from(rawBase64, 'base64')
    const filename = `cover.${ext}`
    await ensureDir(coverDir(bookId))
    await fs.writeFile(join(coverDir(bookId), filename), buf)
    scheduleSyncToBackup(bookId, resolveBookDir(bookId))
    return filename
  })

  ipcMain.handle('books:chooseFolder', async () => {
    if (process.mas) return null // custom paths require security-scoped bookmarks in MAS
    mainWindow.focus()
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose folder for this book',
      buttonLabel: 'Select Folder'
    })
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
  })

  ipcMain.handle('books:resolveCustomPath', async (_, parentDir: string, bookName: string) => {
    return resolveUniqueFolderPath(parentDir, sanitizeFolderName(bookName))
  })

  ipcMain.handle('books:recover', async (_, bookId: string) => {
    const dir = resolveBookDir(bookId)
    const backupDir = backupDirFor(dir)
    try {
      await fs.access(join(backupDir, 'metadata.json'))
    } catch {
      return { ok: false, reason: 'no-backup' }
    }
    try {
      await ensureDir(dir)
      await recoverFromBackup(backupDir, dir)
      return { ok: true }
    } catch (err) {
      return { ok: false, reason: String(err) }
    }
  })

  // ---- CHARACTERS ----

  ipcMain.handle('characters:list', async (_, bookId: string) => {
    await ensureDir(charsDir(bookId))
    let entries: string[] = []
    try {
      entries = await fs.readdir(charsDir(bookId))
    } catch {
      return []
    }
    const chars = await Promise.all(
      entries
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          const c = await readJson<{
            id: string
            photoPath?: string
            photoDataUrl?: string
            galleryPaths?: string[]
            galleryDataUrls?: string[]
            age?: string
            gender?: string
            hairColor?: string
            eyeColor?: string
            skinColor?: string
            build?: string
            behaviour?: string
            attributes?: {
              hairColor?: string; skinColor?: string; gender?: string
              build?: string; behaviour?: string; age?: string; eyeColor?: string; notes?: string
            }
          }>(join(charsDir(bookId), f))
          if (!c) return null

          // Hydrate profile photo
          if (c.photoPath) {
            try {
              c.photoDataUrl = await fileToBase64(join(photosDir(bookId), c.photoPath))
            } catch {
              c.photoDataUrl = undefined
            }
          }

          // Legacy migration: promote attributes.* to top-level flat fields
          if (c.attributes) {
            const a = c.attributes
            if (!c.age && a.age) c.age = a.age
            if (!c.gender && a.gender) c.gender = a.gender
            if (!c.hairColor && a.hairColor) c.hairColor = a.hairColor
            if (!c.eyeColor && a.eyeColor) c.eyeColor = a.eyeColor
            if (!c.skinColor && a.skinColor) c.skinColor = a.skinColor
            if (!c.build && a.build) c.build = a.build
            if (!c.behaviour && a.behaviour) c.behaviour = a.behaviour
          }

          // Hydrate gallery images
          if (c.galleryPaths?.length) {
            const urls = await Promise.all(
              c.galleryPaths.map(async (p) => {
                try {
                  return await fileToBase64(join(galleryDir(bookId), p))
                } catch {
                  return null
                }
              })
            )
            c.galleryDataUrls = urls.filter(Boolean) as string[]
          }

          return c
        })
    )
    return chars.filter(Boolean)
  })

  ipcMain.handle('characters:save', async (_, character: {
    id: string; bookId: string; photoDataUrl?: string; galleryDataUrls?: string[]; galleryPaths?: string[]
  }) => {
    await ensureDir(charsDir(character.bookId))
    const { photoDataUrl, galleryDataUrls, ...toSave } = character
    void photoDataUrl
    void galleryDataUrls

    // Clean up orphaned gallery images (files removed from gallery)
    const existing = await readJson<{ galleryPaths?: string[] }>(charPath(character.bookId, character.id))
    if (existing?.galleryPaths?.length) {
      const newPaths = new Set(toSave.galleryPaths ?? [])
      for (const p of existing.galleryPaths) {
        if (!newPaths.has(p)) {
          try { await fs.unlink(join(galleryDir(character.bookId), p)) } catch {}
        }
      }
    }

    await writeJson(charPath(character.bookId, character.id), toSave)
    scheduleSyncToBackup(character.bookId, resolveBookDir(character.bookId))
  })

  ipcMain.handle('characters:delete', async (_, charId: string, bookId: string) => {
    const c = await readJson<{ name?: string; photoPath?: string; galleryPaths?: string[]; role?: string }>(charPath(bookId, charId))
    if (!c) return
    // Move character JSON to trash
    await ensureDir(bookTrashCharsDir(bookId))
    await safeMove(charPath(bookId, charId), join(bookTrashCharsDir(bookId), `${charId}.json`))
    // Move photo
    if (c.photoPath) {
      await ensureDir(bookTrashPhotosDir(bookId))
      try { await safeMove(join(photosDir(bookId), c.photoPath), join(bookTrashPhotosDir(bookId), c.photoPath)) } catch {}
    }
    // Move gallery images
    if (c.galleryPaths?.length) {
      await ensureDir(bookTrashGalleryDir(bookId))
      for (const p of c.galleryPaths) {
        try { await safeMove(join(galleryDir(bookId), p), join(bookTrashGalleryDir(bookId), p)) } catch {}
      }
    }
    // Update trash index
    const idx = await readJson<{ items: unknown[] }>(bookTrashIndex(bookId)) ?? { items: [] }
    idx.items.push({ id: charId, type: 'character', name: c.name ?? charId, role: c.role, photoPath: c.photoPath, deletedAt: new Date().toISOString() })
    await ensureDir(bookTrashDir(bookId))
    await writeJson(bookTrashIndex(bookId), idx)
    scheduleSyncToBackup(bookId, resolveBookDir(bookId))
  })

  // ---- IMAGES ----

  ipcMain.handle('image:open-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return fileToBase64(result.filePaths[0])
  })

  ipcMain.handle(
    'image:save',
    async (_, bookId: string, entityType: 'character' | 'chapter' | 'character-gallery', base64DataUrl: string, ext: string) => {
      const rawBase64 = base64DataUrl.replace(/^data:image\/\w+;base64,/, '')
      const buf = Buffer.from(rawBase64, 'base64')
      const filename = `${uuidv4()}.${ext}`
      const destDir =
        entityType === 'character' ? photosDir(bookId)
        : entityType === 'character-gallery' ? galleryDir(bookId)
        : chapterImagesDir(bookId)
      await ensureDir(destDir)
      await fs.writeFile(join(destDir, filename), buf)
      scheduleSyncToBackup(bookId, resolveBookDir(bookId))
      return filename
    }
  )

  // ---- CHAPTERS ----

  ipcMain.handle('chapters:list', async (_, bookId: string) => {
    await ensureDir(chaptersDir(bookId))
    let entries: string[] = []
    try {
      entries = await fs.readdir(chaptersDir(bookId))
    } catch {
      return []
    }
    const chapters = await Promise.all(
      entries
        .filter((f) => f.endsWith('.json'))
        .map((f) => readJson(join(chaptersDir(bookId), f)))
    )
    return chapters
      .filter(Boolean)
      .sort((a, b) => ((a as { order: number }).order ?? 0) - ((b as { order: number }).order ?? 0))
  })

  ipcMain.handle('chapters:save', async (_, chapter: { id: string; bookId: string }) => {
    await ensureDir(chaptersDir(chapter.bookId))
    await writeJson(chapterPath(chapter.bookId, chapter.id), chapter)
    scheduleSyncToBackup(chapter.bookId, resolveBookDir(chapter.bookId))
  })

  ipcMain.handle('chapters:delete', async (_, chapterId: string, bookId: string) => {
    const ch = await readJson<{ title?: string; wordCount?: number; order?: number; kind?: string }>(chapterPath(bookId, chapterId))
    if (!ch) return
    // Move chapter JSON to trash
    await ensureDir(bookTrashChaptersDir(bookId))
    await safeMove(chapterPath(bookId, chapterId), join(bookTrashChaptersDir(bookId), `${chapterId}.json`))
    // Update trash index
    const idx = await readJson<{ items: unknown[] }>(bookTrashIndex(bookId)) ?? { items: [] }
    idx.items.push({ id: chapterId, type: 'chapter', name: ch.title ?? chapterId, wordCount: ch.wordCount, kind: ch.kind, deletedAt: new Date().toISOString() })
    await ensureDir(bookTrashDir(bookId))
    await writeJson(bookTrashIndex(bookId), idx)
    scheduleSyncToBackup(bookId, resolveBookDir(bookId))
  })

  // ---- ACTS ----

  ipcMain.handle('acts:list', async (_, bookId: string) => {
    await ensureDir(actsDir(bookId))
    let entries: string[] = []
    try {
      entries = await fs.readdir(actsDir(bookId))
    } catch {
      return []
    }
    const acts = await Promise.all(
      entries
        .filter((f) => f.endsWith('.json'))
        .map((f) => readJson(join(actsDir(bookId), f)))
    )
    return acts
      .filter(Boolean)
      .sort((a, b) => ((a as { order: number }).order ?? 0) - ((b as { order: number }).order ?? 0))
  })

  ipcMain.handle('acts:save', async (_, act: { id: string; bookId: string }) => {
    await ensureDir(actsDir(act.bookId))
    await writeJson(actPath(act.bookId, act.id), act)
    scheduleSyncToBackup(act.bookId, resolveBookDir(act.bookId))
  })

  ipcMain.handle('acts:delete', async (_, actId: string, bookId: string) => {
    try {
      await fs.unlink(actPath(bookId, actId))
    } catch {}
    scheduleSyncToBackup(bookId, resolveBookDir(bookId))
  })

  // ---- BOOK TRASH ----

  ipcMain.handle('bookTrash:list', async (_, bookId: string) => {
    const idx = await readJson<{ items: Array<{ id: string; type: string; photoPath?: string; deletedAt: string }> }>(bookTrashIndex(bookId))
    if (!idx?.items?.length) return []
    const items = await Promise.all(idx.items.map(async (item) => {
      if (item.type === 'character' && item.photoPath) {
        const photoFile = join(bookTrashPhotosDir(bookId), item.photoPath)
        try { return { ...item, photoDataUrl: await fileToBase64(photoFile) } } catch {}
      }
      return item
    }))
    return items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())
  })

  ipcMain.handle('bookTrash:restoreChapter', async (_, bookId: string, chapterId: string) => {
    await ensureDir(chaptersDir(bookId))
    await safeMove(join(bookTrashChaptersDir(bookId), `${chapterId}.json`), chapterPath(bookId, chapterId))
    const idx = await readJson<{ items: Array<{ id: string }> }>(bookTrashIndex(bookId))
    if (idx) {
      idx.items = idx.items.filter((i) => i.id !== chapterId)
      await writeJson(bookTrashIndex(bookId), idx)
    }
    scheduleSyncToBackup(bookId, resolveBookDir(bookId))
  })

  ipcMain.handle('bookTrash:restoreCharacter', async (_, bookId: string, charId: string) => {
    await ensureDir(charsDir(bookId))
    await safeMove(join(bookTrashCharsDir(bookId), `${charId}.json`), charPath(bookId, charId))
    const c = await readJson<{ photoPath?: string; galleryPaths?: string[] }>(charPath(bookId, charId))
    if (c?.photoPath) {
      await ensureDir(photosDir(bookId))
      try { await safeMove(join(bookTrashPhotosDir(bookId), c.photoPath), join(photosDir(bookId), c.photoPath)) } catch {}
    }
    if (c?.galleryPaths?.length) {
      await ensureDir(galleryDir(bookId))
      for (const p of c.galleryPaths) {
        try { await safeMove(join(bookTrashGalleryDir(bookId), p), join(galleryDir(bookId), p)) } catch {}
      }
    }
    const idx = await readJson<{ items: Array<{ id: string }> }>(bookTrashIndex(bookId))
    if (idx) {
      idx.items = idx.items.filter((i) => i.id !== charId)
      await writeJson(bookTrashIndex(bookId), idx)
    }
    scheduleSyncToBackup(bookId, resolveBookDir(bookId))
  })

  ipcMain.handle('bookTrash:deleteItems', async (_, bookId: string, itemIds: string[]) => {
    const idx = await readJson<{ items: Array<{ id: string; type: string; photoPath?: string }> }>(bookTrashIndex(bookId))
    if (!idx) return
    for (const id of itemIds) {
      const item = idx.items.find((i) => i.id === id)
      if (!item) continue
      if (item.type === 'chapter') {
        const chFile = join(bookTrashChaptersDir(bookId), `${id}.json`)
        try { await fs.unlink(chFile) } catch {}
      } else {
        // Read character JSON for gallery paths before unlinking
        const cFile = join(bookTrashCharsDir(bookId), `${id}.json`)
        const c = await readJson<{ photoPath?: string; galleryPaths?: string[] }>(cFile)
        if (c?.photoPath) try { await fs.unlink(join(bookTrashPhotosDir(bookId), c.photoPath)) } catch {}
        if (c?.galleryPaths?.length) {
          for (const p of c.galleryPaths) {
            try { await fs.unlink(join(bookTrashGalleryDir(bookId), p)) } catch {}
          }
        }
        try { await fs.unlink(cFile) } catch {}
      }
    }
    idx.items = idx.items.filter((i) => !itemIds.includes(i.id))
    await writeJson(bookTrashIndex(bookId), idx)
    scheduleSyncToBackup(bookId, resolveBookDir(bookId))
  })

  // ---- SNAPSHOTS ----

  ipcMain.handle('snapshots:list', async (_, bookId: string) => {
    await ensureDir(snapshotsDir(bookId))
    let entries: string[] = []
    try {
      entries = await fs.readdir(snapshotsDir(bookId))
    } catch {
      return []
    }
    const snapshots = await Promise.all(
      entries.filter((f) => f.endsWith('.json')).map((f) => readJson(join(snapshotsDir(bookId), f)))
    )
    return (snapshots.filter(Boolean) as Array<{ createdAt: string }>)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  })

  ipcMain.handle('snapshots:save', async (_, snapshot: { id: string; bookId: string }) => {
    await ensureDir(snapshotsDir(snapshot.bookId))
    await writeJson(snapshotPath(snapshot.bookId, snapshot.id), snapshot)
    scheduleSyncToBackup(snapshot.bookId, resolveBookDir(snapshot.bookId))
  })

  ipcMain.handle('snapshots:delete', async (_, snapshotId: string, bookId: string) => {
    try {
      await fs.unlink(snapshotPath(bookId, snapshotId))
    } catch {}
  })

  ipcMain.handle(
    'snapshots:restore',
    async (
      _,
      bookId: string,
      snapshotChapters: Array<{ id: string }>,
      currentChapterIds: string[]
    ) => {
      for (const id of currentChapterIds) {
        try { await fs.unlink(chapterPath(bookId, id)) } catch {}
      }
      await ensureDir(chaptersDir(bookId))
      for (const ch of snapshotChapters) {
        await writeJson(chapterPath(bookId, ch.id), ch)
      }
    }
  )

  // ---- SPEECH ----

  ipcMain.handle('speech:checkModels', async () => {
    return speech.checkModels()
  })

  ipcMain.handle('speech:start', async (_, sessionId: string) => {
    return speech.start(sessionId)
  })

  ipcMain.handle('speech:chunk', async (_, buffer: ArrayBuffer) => {
    await speech.processChunk(buffer)
  })

  ipcMain.handle('speech:stop', async () => {
    await speech.stop()
  })

  ipcMain.handle('speech:listVoskModels', async () => {
    await fs.mkdir(USER_MODELS_DIR, { recursive: true })
    const userFiles = await fs.readdir(USER_MODELS_DIR).catch(() => [] as string[])
    const bundledFiles = await fs.readdir(MODELS_DIR).catch(() => [] as string[])
    return { userFiles, bundledFiles }
  })

  ipcMain.handle('speech:downloadVoskModel', async (_event, id: string, url: string, filename: string) => {
    await fs.mkdir(USER_MODELS_DIR, { recursive: true })
    const destPath = join(USER_MODELS_DIR, filename)
    try {
      const response = await net.fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const total = parseInt(response.headers.get('content-length') ?? '0', 10)
      const reader = response.body!.getReader()
      const chunks: Buffer[] = []
      let downloaded = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(Buffer.from(value))
        downloaded += value.length
        const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0
        mainWindow.webContents.send('speech:voskDownloadProgress', { id, percent, downloaded, total })
      }
      await fs.writeFile(destPath, Buffer.concat(chunks))
      mainWindow.webContents.send('speech:voskDownloadProgress', { id, percent: 100, downloaded, total: downloaded })
      return { ok: true }
    } catch (err) {
      // Remove partial file on failure
      try { await fs.unlink(destPath) } catch {}
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('speech:deleteVoskModel', async (_event, filename: string) => {
    const filePath = join(USER_MODELS_DIR, filename)
    if (existsSync(filePath)) await fs.unlink(filePath)
    return { ok: true }
  })

  // ---- COVER ----

  ipcMain.handle('cover:savePng', async (_, bookId: string, dataUrl: string, side: string) => {
    void bookId
    const saveResult = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `cover-${side}.png`,
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    })
    if (saveResult.canceled || !saveResult.filePath) return { success: false }
    const rawBase64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buf = Buffer.from(rawBase64, 'base64')
    await fs.writeFile(saveResult.filePath, buf)
    return { success: true }
  })

  ipcMain.handle('cover:saveDesign', async (_, bookId: string, design: unknown) => {
    const dir = resolveBookDir(bookId)
    await fs.mkdir(dir, { recursive: true })
    await writeJson(join(dir, 'cover-design.json'), design)
    scheduleSyncToBackup(bookId, dir)
    return { success: true }
  })

  ipcMain.handle('cover:loadDesign', async (_, bookId: string) => {
    const filePath = join(resolveBookDir(bookId), 'cover-design.json')
    return readJson(filePath)
  })

  ipcMain.handle('cover:saveRendered', async (_, bookId: string, dataUrl: string, side: string) => {
    const dir = resolveBookDir(bookId)
    await fs.mkdir(dir, { recursive: true })
    const rawBase64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buf = Buffer.from(rawBase64, 'base64')
    await fs.writeFile(join(dir, `cover-${side}.png`), buf)
    scheduleSyncToBackup(bookId, dir)
    return { success: true }
  })

  ipcMain.handle('cover:loadRendered', async (_, bookId: string, side: string) => {
    const filePath = join(resolveBookDir(bookId), `cover-${side}.png`)
    try { return await fileToBase64(filePath) } catch { return null }
  })

  // ---- EXPORT ----

  ipcMain.handle('export:savePdf', async (_, fileName: string, base64: string) => {
    try {
      const saveResult = await dialog.showSaveDialog(mainWindow, {
        title: 'Save PDF',
        defaultPath: `${fileName}.pdf`,
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
      })
      if (saveResult.canceled || !saveResult.filePath) return { ok: false }
      const buf = Buffer.from(base64, 'base64')
      await fs.writeFile(saveResult.filePath, buf)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Save failed' }
    }
  })

  ipcMain.handle('export:saveDocx', async (_, fileName: string, base64: string) => {
    try {
      const saveResult = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Word Document',
        defaultPath: `${fileName}.docx`,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      })
      if (saveResult.canceled || !saveResult.filePath) return { ok: false }
      await fs.writeFile(saveResult.filePath, Buffer.from(base64, 'base64'))
      return { ok: true, filePath: saveResult.filePath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Save failed' }
    }
  })

  ipcMain.handle('export:saveEpub', async (_, fileName: string, base64: string) => {
    try {
      const safeName = fileName.replace(/[^a-z0-9 ]/gi, '').trim().replace(/\s+/g, '_') || 'book'
      const saveResult = await dialog.showSaveDialog(mainWindow, {
        title: 'Save ePub',
        defaultPath: `${safeName}.epub`,
        filters: [{ name: 'ePub', extensions: ['epub'] }],
      })
      if (saveResult.canceled || !saveResult.filePath) return { ok: false }
      await fs.writeFile(saveResult.filePath, Buffer.from(base64, 'base64'))
      return { ok: true, filePath: saveResult.filePath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Save failed' }
    }
  })

  ipcMain.handle('shell:revealFile', async (_, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('shell:openFile', async (_, filePath: string) => {
    await shell.openPath(filePath)
  })

  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    await shell.openExternal(url)
  })

  // ---- AI (LLAMA) ----

  ipcMain.handle('llama:hardware', async () => llama.getProfile())

  ipcMain.handle('llama:isDownloaded', async () => llama.isModelDownloaded())

  ipcMain.handle('llama:memoryCheck', async () => llama.getMemoryStatus())

  ipcMain.handle('llama:download', async () => {
    llama.downloadModel().catch((err: unknown) => {
      mainWindow.webContents.send('llama:error', { message: String(err) })
    })
    return { started: true }
  })

  ipcMain.handle('llama:init', async () => {
    try {
      await llama.initialize()
      return { ok: true }
    } catch (err: unknown) {
      return { ok: false, message: String(err) }
    }
  })

  ipcMain.handle('llama:generate', async (_, systemPrompt: string, userPrompt: string) => {
    llama.generate(systemPrompt, userPrompt).catch((err: unknown) => {
      mainWindow.webContents.send('llama:error', { message: String(err) })
    })
    return { started: true }
  })

  ipcMain.handle('llama:startInterview', async (_, systemPrompt: string) => {
    try {
      await llama.startInterview(systemPrompt)
      return { ok: true }
    } catch (err: unknown) {
      return { ok: false, message: String(err) }
    }
  })

  ipcMain.handle('llama:sendInterviewMessage', async (_, userMessage: string) => {
    llama.sendInterviewMessage(userMessage).catch((err: unknown) => {
      mainWindow.webContents.send('llama:error', { message: String(err) })
    })
    return { started: true }
  })

  ipcMain.handle('llama:resetInterview', async () => {
    llama.resetInterview()
  })

  ipcMain.handle('llama:cancel', async () => {
    llama.cancel()
  })

  ipcMain.handle('llama:unload', async () => {
    llama.dispose()
    return { ok: true }
  })

  ipcMain.handle('llama:modelStatuses', async () => {
    return llama.getAllModelStatuses()
  })

  ipcMain.handle('llama:downloadById', async (_, id: string) => {
    llama.downloadModelById(id as ModelVariant).catch((err: unknown) => {
      mainWindow.webContents.send('llama:error', { message: String(err) })
    })
    return { started: true }
  })

  ipcMain.handle('llama:uninstall', async (_, id: string) => {
    await llama.uninstallModel(id as ModelVariant)
  })

  ipcMain.handle('llama:initById', async (_, id: string) => {
    try {
      await llama.initialize(id as ModelVariant)
      return { ok: true }
    } catch (err: unknown) {
      // Emit so the renderer's onError listener unsticks the Loading… spinner
      // and surfaces the message. Also re-throw so the awaited IPC call rejects
      // in the caller's try/catch — belt-and-suspenders for the UI.
      const message = err instanceof Error ? err.message : String(err)
      mainWindow.webContents.send('llama:error', { message })
      throw err
    }
  })

  ipcMain.handle('llama:generatePipelined', async (
    _,
    architectPrompt: { sys: string; user: string },
    ghostwriterSys: string,
    editorEnabled: boolean,
    editorSys: string,
    targetWords?: number
  ) => {
    llama.generatePipelined(architectPrompt, ghostwriterSys, editorEnabled, editorSys, targetWords).catch((err: unknown) => {
      mainWindow.webContents.send('llama:error', { message: String(err) })
    })
    return { started: true }
  })

  // === AUTH / TOUCH ID ===
  ipcMain.handle('auth:can-touch-id', () => {
    return systemPreferences.canPromptTouchID()
  })

  ipcMain.handle('auth:prompt-touch-id', async (_, reason: string) => {
    await systemPreferences.promptTouchID(reason)
  })

  ipcMain.handle('app:isMas', () => process.mas === true)

  // ── iCloud Settings ───────────────────────────────────────────────────────
  ipcMain.handle('settings:get', async () => icloud.getStatus())

  ipcMain.handle('settings:setICloudSync', async (_, enabled: boolean) => {
    return icloud.setEnabled(enabled)
  })

  ipcMain.handle('icloud:resolveConflict', async (_, conflictPath: string, action: string) => {
    return icloud.resolveConflict(
      conflictPath,
      action as import('./ICloudService').ConflictAction
    )
  })

  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })

  const WELCOMED_FLAG = join(LEKHANAM_DIR, '.welcomed')
  ipcMain.handle('app:isWelcomed', async () => {
    try { await fs.access(WELCOMED_FLAG); return true } catch { return false }
  })
  ipcMain.handle('app:setWelcomed', async () => {
    await fs.mkdir(LEKHANAM_DIR, { recursive: true })
    await fs.writeFile(WELCOMED_FLAG, '1', 'utf8')
  })

  // ── Demo book v2 ──────────────────────────────────────────────────────────
  ipcMain.handle('app:isDemoBookLoaded', async () => {
    try { await fs.access(join(bookDir('demo-lekhanam-v2'), 'metadata.json')); return true } catch { return false }
  })

  ipcMain.handle('app:createDemoBook', async () => {
    const DEMO_ID = 'demo-lekhanam-v2'
    const demoDir = bookDir(DEMO_ID)

    try { await fs.access(join(demoDir, 'metadata.json')); return } catch {}

    const now = new Date().toISOString()

    // Encode an inline SVG as a base64 data URL for character portraits
    const svgPhoto = (svg: string): string =>
      `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

    // ── Character portraits (simple illustrated avatars) ──
    const elenaPhoto = svgPhoto(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="220" viewBox="0 0 180 220"><rect width="180" height="220" fill="#f5ede0" rx="12"/><path d="M0 220 L0 165 C20 148 45 140 70 140 L90 145 L110 140 C135 140 160 148 180 165 L180 220 Z" fill="#2c3e50"/><rect x="75" y="132" width="30" height="18" rx="8" fill="#c8956a"/><ellipse cx="90" cy="100" rx="40" ry="46" fill="#c8956a"/><ellipse cx="90" cy="80" rx="43" ry="35" fill="#231409"/><rect x="47" y="72" width="12" height="58" rx="6" fill="#231409"/><rect x="121" y="72" width="12" height="58" rx="6" fill="#231409"/><ellipse cx="90" cy="63" rx="40" ry="18" fill="#231409"/><ellipse cx="50" cy="102" rx="5" ry="8" fill="#b8855a"/><ellipse cx="130" cy="102" rx="5" ry="8" fill="#b8855a"/><ellipse cx="72" cy="100" rx="9" ry="7" fill="#f8f8f0"/><ellipse cx="108" cy="100" rx="9" ry="7" fill="#f8f8f0"/><circle cx="72" cy="100" r="5.5" fill="#7a9e7e"/><circle cx="108" cy="100" r="5.5" fill="#7a9e7e"/><circle cx="72" cy="100" r="3" fill="#1a1a1a"/><circle cx="108" cy="100" r="3" fill="#1a1a1a"/><circle cx="73" cy="98.5" r="1.2" fill="white"/><circle cx="109" cy="98.5" r="1.2" fill="white"/><path d="M62 90 Q72 86 82 90" stroke="#1e0e04" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M98 90 Q108 86 118 90" stroke="#1e0e04" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M90 108 Q86 115 88 119 Q90 121 92 119 Q94 115 90 108" fill="#b8855a"/><path d="M78 128 Q90 135 102 128" stroke="#a06048" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M80 128 Q90 132 100 128" fill="#c47858"/><ellipse cx="62" cy="112" rx="9" ry="6" fill="#e8a080" opacity="0.25"/><ellipse cx="118" cy="112" rx="9" ry="6" fill="#e8a080" opacity="0.25"/></svg>`)

    const thomasPhoto = svgPhoto(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="220" viewBox="0 0 180 220"><rect width="180" height="220" fill="#e8ebee" rx="12"/><path d="M0 220 L0 158 C15 140 40 132 65 132 L90 138 L115 132 C140 132 165 140 180 158 L180 220 Z" fill="#1a1e2a"/><rect x="74" y="126" width="32" height="18" rx="8" fill="#b88a65"/><ellipse cx="90" cy="96" rx="42" ry="48" fill="#b88a65"/><rect x="47" y="58" width="14" height="48" rx="7" fill="#9aa5b0"/><rect x="119" y="58" width="14" height="48" rx="7" fill="#9aa5b0"/><ellipse cx="90" cy="54" rx="43" ry="22" fill="#9aa5b0"/><ellipse cx="48" cy="99" rx="5" ry="8" fill="#a07a55"/><ellipse cx="132" cy="99" rx="5" ry="8" fill="#a07a55"/><ellipse cx="72" cy="97" rx="9" ry="7" fill="#f0f0e8"/><ellipse cx="108" cy="97" rx="9" ry="7" fill="#f0f0e8"/><circle cx="72" cy="97" r="5.5" fill="#4a2c0a"/><circle cx="108" cy="97" r="5.5" fill="#4a2c0a"/><circle cx="72" cy="97" r="3" fill="#1a0800"/><circle cx="108" cy="97" r="3" fill="#1a0800"/><circle cx="73" cy="95.5" r="1.2" fill="white"/><circle cx="109" cy="95.5" r="1.2" fill="white"/><path d="M62 87 Q72 82 83 86" stroke="#6a5040" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M97 86 Q108 82 118 87" stroke="#6a5040" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M90 106 Q85 114 87 119 Q90 122 93 119 Q95 114 90 106" fill="#a07a55"/><path d="M76 126 Q90 133 104 126" stroke="#8a6040" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M78 126 Q90 130 102 126" fill="#b07858"/></svg>`)

    const margotPhoto = svgPhoto(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="220" viewBox="0 0 180 220"><rect width="180" height="220" fill="#e8eef4" rx="12"/><path d="M0 220 L0 166 C18 150 42 142 68 142 L90 147 L112 142 C138 142 162 150 180 166 L180 220 Z" fill="#5b9ea0"/><rect x="76" y="134" width="28" height="18" rx="7" fill="#d4a87e"/><ellipse cx="90" cy="98" rx="38" ry="44" fill="#d4a87e"/><ellipse cx="90" cy="76" rx="42" ry="32" fill="#7a4e32"/><path d="M48 80 Q42 100 44 120 Q46 135 50 142 Q54 148 56 145 Q54 130 52 118 Q50 100 52 84 Z" fill="#7a4e32"/><path d="M132 80 Q138 100 136 120 Q134 135 130 142 Q126 148 124 145 Q126 130 128 118 Q130 100 128 84 Z" fill="#7a4e32"/><ellipse cx="90" cy="62" rx="40" ry="20" fill="#7a4e32"/><ellipse cx="52" cy="100" rx="5" ry="7" fill="#c4986e"/><ellipse cx="128" cy="100" rx="5" ry="7" fill="#c4986e"/><ellipse cx="73" cy="98" rx="9" ry="7" fill="#f8f8f0"/><ellipse cx="107" cy="98" rx="9" ry="7" fill="#f8f8f0"/><circle cx="73" cy="98" r="5.5" fill="#7a4e22"/><circle cx="107" cy="98" r="5.5" fill="#7a4e22"/><circle cx="73" cy="98" r="3" fill="#1a0a00"/><circle cx="107" cy="98" r="3" fill="#1a0a00"/><circle cx="74" cy="96.5" r="1.2" fill="white"/><circle cx="108" cy="96.5" r="1.2" fill="white"/><path d="M64 88 Q73 84 82 87" stroke="#5a3020" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M98 87 Q107 84 116 88" stroke="#5a3020" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M90 106 Q87 112 88 116 Q90 118 92 116 Q93 112 90 106" fill="#c4986e"/><path d="M79 124 Q90 131 101 124" stroke="#a07858" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M81 124 Q90 128 99 124" fill="#c48868"/><ellipse cx="64" cy="110" rx="9" ry="6" fill="#e89878" opacity="0.3"/><ellipse cx="116" cy="110" rx="9" ry="6" fill="#e89878" opacity="0.3"/></svg>`)

    const rayPhoto = svgPhoto(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="220" viewBox="0 0 180 220"><rect width="180" height="220" fill="#f0e8d8" rx="12"/><path d="M0 220 L0 160 C18 144 42 136 66 136 L90 142 L114 136 C138 136 162 144 180 160 L180 220 Z" fill="#2a3a52"/><path d="M76 144 L90 158 L104 144 L94 136 L86 136 Z" fill="#3a4a62"/><rect x="74" y="128" width="32" height="20" rx="8" fill="#5c3820"/><ellipse cx="90" cy="96" rx="40" ry="46" fill="#6b3e22"/><ellipse cx="90" cy="58" rx="40" ry="22" fill="#140a04"/><rect x="50" y="56" width="10" height="32" rx="5" fill="#140a04"/><rect x="120" y="56" width="10" height="32" rx="5" fill="#140a04"/><ellipse cx="50" cy="98" rx="5" ry="8" fill="#5a3418"/><ellipse cx="130" cy="98" rx="5" ry="8" fill="#5a3418"/><ellipse cx="72" cy="97" rx="9" ry="7" fill="#f0f0e8"/><ellipse cx="108" cy="97" rx="9" ry="7" fill="#f0f0e8"/><circle cx="72" cy="97" r="5.5" fill="#3a1a08"/><circle cx="108" cy="97" r="5.5" fill="#3a1a08"/><circle cx="72" cy="97" r="3" fill="#100600"/><circle cx="108" cy="97" r="3" fill="#100600"/><circle cx="73" cy="95.5" r="1.2" fill="white"/><circle cx="109" cy="95.5" r="1.2" fill="white"/><path d="M63 87 Q72 82 82 86" stroke="#0e0604" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M98 86 Q108 82 117 87" stroke="#0e0604" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M90 106 Q84 114 86 119 Q90 122 94 119 Q96 114 90 106" fill="#5a3418"/><ellipse cx="86" cy="117" rx="3" ry="2" fill="#4a2a10" opacity="0.5"/><ellipse cx="94" cy="117" rx="3" ry="2" fill="#4a2a10" opacity="0.5"/><path d="M77 126 Q90 133 103 126" stroke="#3a2010" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M79 126 Q90 130 101 126" fill="#7a4828"/></svg>`)

    // ── Book metadata ──
    const metadata = {
      id: DEMO_ID,
      name: '✦ The Last Letter  (Demo — feel free to delete)',
      synopsis: 'When journalist Elena Marsh receives a cryptic letter from her missing sister, she follows the trail to Greyhaven — a coastal town with secrets buried deeper than the tides. This is a sample book showing what Lekhanam can do. Feel free to explore or delete it.',
      author: 'Demo',
      format: 'trade-paperback',
      createdAt: now, updatedAt: now,
      wordHistory: [],
      wordGoals: { daily: 500 },
      style: {
        fontFamily: 'EB Garamond', fontSize: 12, lineSpacing: 1.6,
        marginTop: 1.0, marginBottom: 1.0, marginInner: 1.0, marginOuter: 0.75,
      }
    }

    // ── Acts ──
    const act1 = {
      id: 'demo-act-1', bookId: DEMO_ID, title: 'The Arrival', order: 0,
      summary: 'Elena follows a cryptic letter to Greyhaven, a coastal town that feels wrong from the moment she steps off the ferry. She finds her sister\'s name erased from every record — and a powerful local man who already seems to know she\'s coming.',
      createdAt: now, updatedAt: now
    }
    const act2 = {
      id: 'demo-act-2', bookId: DEMO_ID, title: 'The Reckoning', order: 1,
      summary: 'Old wounds are reopened. A detective warns Elena off the case, and Thomas Vane grows bolder in his attempts to redirect her. She digs deeper — and finds something that changes everything.',
      createdAt: now, updatedAt: now
    }
    const act3 = {
      id: 'demo-act-3', bookId: DEMO_ID, title: 'The Truth', order: 2,
      summary: 'Confrontation. Revelation. The full cost of seven years of silence. Elena faces what she came for — and what she must now do with it.',
      createdAt: now, updatedAt: now
    }

    // ── Characters ──
    const elena = {
      id: 'demo-char-elena', bookId: DEMO_ID, name: 'Elena Marsh', role: 'Protagonist',
      age: '32', gender: 'Female', build: 'Lean, always in motion',
      hairColor: 'Dark brown, usually tied back', eyeColor: 'Grey-green',
      ghost: 'She abandoned her sister seven years ago to chase her career — and never looked back until now.',
      lie: 'She believes she is too late to fix anything between them.',
      truth: 'Her sister never stopped trusting her. The letter proves it.',
      motivation: 'Find her sister before whoever sent the letter does.',
      stakes: 'If she fails, she loses the only family she has left — and the truth about what happened that night.',
      voiceProfile: 'Measured, precise. Speaks in short sentences when anxious. Reveals emotion through what she doesn\'t say.',
      mannerisms: 'Taps her pen when thinking. Never sits with her back to a door.',
      behaviour: 'Hyper-observant. Records everything in a small notebook. Distrusts charm.',
      photoDataUrl: elenaPhoto, createdAt: now
    }
    const thomas = {
      id: 'demo-char-thomas', bookId: DEMO_ID, name: 'Thomas Vane', role: 'Antagonist',
      age: '48', gender: 'Male', build: 'Broad-shouldered, moves like he owns the room',
      hairColor: 'Silver-grey, well-kept', eyeColor: 'Dark brown, unreadable',
      ghost: 'He was the last person to see Margot Cole — and has spent years making sure no one finds out.',
      lie: 'He tells himself he had no choice. That it was an accident. That he protected everyone by staying quiet.',
      truth: 'He had every choice. He made the wrong one.',
      motivation: 'Keep the secret buried at any cost.',
      stakes: 'If Elena finds the truth, everything he has built — reputation, business, freedom — collapses.',
      voiceProfile: 'Deliberate, unhurried. Uses silence as a weapon. Never asks a question he doesn\'t already know the answer to.',
      mannerisms: 'Maintains eye contact slightly too long. Smiles before he speaks.',
      behaviour: 'Charming in public, controlled in private. Offers help as a way to monitor threats.',
      photoDataUrl: thomasPhoto, createdAt: now
    }
    const margot = {
      id: 'demo-char-margot', bookId: DEMO_ID, name: 'Margot Cole', role: 'Missing Person',
      age: '28', gender: 'Female', build: 'Slight, quick — Elena\'s younger sister by four years',
      hairColor: 'Medium brown, wavy', eyeColor: 'Warm brown',
      ghost: 'She trusted the wrong person with the wrong secret — and paid for it alone.',
      lie: 'She told herself she could handle it without pulling Elena in.',
      truth: 'She knew Elena would come if she sent the letter. She sent it anyway.',
      motivation: 'She wanted the truth to survive, even if she didn\'t.',
      stakes: 'Her safety, her freedom — possibly her life.',
      voiceProfile: 'Warmer than Elena. Talks in loops when nervous. Laughs at the wrong moments.',
      mannerisms: 'Pulls at the hem of her sleeves. Leaves notes in margins rather than speaking.',
      behaviour: 'Curious to a fault. Keeps secrets badly except when it truly counts.',
      photoDataUrl: margotPhoto, createdAt: now
    }
    const ray = {
      id: 'demo-char-ray', bookId: DEMO_ID, name: 'DS Ray Okafor', role: 'Detective',
      age: '40', gender: 'Male', build: 'Stocky, methodical — looks unhurried even when he isn\'t',
      hairColor: 'Very short, dark', eyeColor: 'Dark brown',
      ghost: 'He closed the original case too fast — he knew something was wrong and filed it anyway.',
      lie: 'He tells himself he lacked evidence. The truth is he lacked courage.',
      truth: 'He\'s been waiting for someone like Elena to show up and reopen it.',
      motivation: 'Contain the situation — but maybe let it go just far enough.',
      stakes: 'His career, his conscience, his complicity.',
      voiceProfile: 'Even, patient. Says very little. Asks questions by saying nothing.',
      mannerisms: 'Always holds a coffee cup even when it\'s empty. Never writes anything down in front of suspects.',
      behaviour: 'Appears to obstruct but leaves small doors open. Ally or obstacle — Elena can\'t tell.',
      photoDataUrl: rayPhoto, createdAt: now
    }

    // ── TipTap content helpers ──
    const makeDoc = (paragraphs: string[]) => ({
      type: 'doc',
      content: paragraphs.map((text) =>
        text === ''
          ? { type: 'paragraph' }
          : { type: 'paragraph', content: [{ type: 'text', text }] }
      )
    })
    const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

    // ── Chapters ──
    const chap01 = {
      id: 'demo-chap-01', bookId: DEMO_ID, title: 'The Letter', order: 0, kind: 'chapter',
      actId: 'demo-act-1', status: 'final',
      summary: 'Elena arrives in Greyhaven by ferry, re-reading her missing sister\'s cryptic letter for the eleventh time. The harbour town feels ominous. She steps off with dread and resolve.',
      planGoal: 'Establish Elena\'s motivation and the unsettling atmosphere of Greyhaven.',
      planPov: 'Elena Marsh — close third person',
      planBeats: '- [x] Elena on the ferry, re-reading the letter\n- [x] First glimpse of Greyhaven from the water\n- [x] She decides to go in despite the fear',
      notes: 'Keep the prose tight. The letter is a mystery — don\'t over-explain.',
      wordCount: 148,
      content: makeDoc([
        'The ferry arrived twenty minutes late, which gave Elena Marsh time to read the letter again.',
        'She had read it eleven times already. The handwriting was her sister\'s — she was certain of that — but the words felt borrowed, chosen carefully the way someone chooses words when they know they\'re being watched.',
        'I found something, El. Come to Greyhaven. Don\'t tell anyone. Don\'t call. Just come.',
        'No date. No return address. Postmarked from a town she had never heard of, three weeks ago.',
        'The ferry horn sounded. Through the salt-fogged window, the harbour of Greyhaven appeared — a grey smear of rooftops against a greyer sky, the kind of place that looked like it had been waiting for something bad to happen and had grown tired of waiting.',
        'Elena folded the letter into her coat pocket, picked up her bag, and went to meet whatever came next.',
        '— Try clicking ✨ AI in the top bar to generate a new chapter, or open the AI panel to explore Ghostwriter and Character Interview features.'
      ]),
      createdAt: now, updatedAt: now
    }
    const chap02 = {
      id: 'demo-chap-02', bookId: DEMO_ID, title: 'First Night', order: 1, kind: 'chapter',
      actId: 'demo-act-1', status: 'revised',
      summary: 'Elena checks in at the only hotel. Her sister\'s name is not on the register. From the window she spots Thomas Vane — who looks up as though he already knew she was coming.',
      planGoal: 'Introduce Thomas Vane and create immediate unease without him doing anything overtly threatening.',
      planPov: 'Elena Marsh — close third person',
      planBeats: '- [x] Hotel check-in — sister\'s name missing from register\n- [x] Elena at window, watching the square\n- [x] Thomas Vane looks up — their eyes meet\n- [x] Elena notes his name in her notebook',
      notes: 'Vane should feel dangerous without doing anything obviously threatening. The eye contact is the scene.',
      wordCount: 133,
      content: makeDoc([
        'Her sister\'s name was not on the hotel register.',
        'Elena stood at the front desk of the Greyhaven Arms — the only accommodation in a town with three streets and one working traffic light — and asked the question three different ways. The answer was the same each time: polite, flat, final.',
        '"No one by that name. Sorry, love."',
        'She took the room anyway. Third floor, facing the harbour. She set her bag on the bed without unpacking it, stood at the window, and watched a man in a dark coat cross the square below.',
        'He stopped at the edge of the square, looked up, and met her eyes as though he had expected her to be there.',
        'He didn\'t wave. He didn\'t look away. He simply stood for a moment — measuring something — and then walked on.',
        'Elena pulled out her notebook and wrote one line: Thomas Vane. Who is he, and how did he know to look up?',
        '— Open the Characters tab to read the full character profiles, or use the Storyboard to plan the next acts.'
      ]),
      createdAt: now, updatedAt: now
    }
    const chap03 = {
      id: 'demo-chap-03', bookId: DEMO_ID, title: 'The Keeper', order: 2, kind: 'chapter',
      actId: 'demo-act-2', status: 'draft',
      summary: 'Elena visits the local records office and finds the file on her sister\'s last address has been pulled. DS Okafor appears — apparently coincidentally — and walks her out with a gentle but clear warning to leave.',
      planGoal: 'Escalate stakes. Elena learns the cover-up is institutional. Introduce Ray as an ambiguous ally/obstacle.',
      planPov: 'Elena Marsh — close third person',
      planBeats: '- [ ] Records office — file pulled, clerk nervous\n- [ ] DS Okafor appears — calm, too calm\n- [ ] He walks her out, gives her nothing and everything\n- [ ] Elena decides to stay',
      notes: 'Ray should be sympathetic but clearly afraid of something. He\'s not the villain — he\'s someone who made a choice he regrets.',
      wordCount: 112,
      content: makeDoc([
        'The records office smelled of damp paper and old decisions.',
        'Elena had given her press credentials at the desk and asked for the housing register from three years back — the period covering Margot\'s last known address. The clerk, a young woman with careful eyes, had gone to check. She came back empty-handed.',
        '"That box is currently with another department. I can\'t say when it will be back."',
        'Elena wrote the name of the department down. The clerk watched her do it.',
        '"You should probably," the clerk said, and then stopped. Started again. "There\'s a coffee shop on Harbour Street. Opens at eight."',
        '— Continue drafting this chapter. Use the Beats checklist in the Story Board to track your progress.'
      ]),
      createdAt: now, updatedAt: now
    }
    const chap04 = {
      id: 'demo-chap-04', bookId: DEMO_ID, title: 'What the Harbour Knows', order: 3, kind: 'chapter',
      actId: 'demo-act-2', status: 'draft',
      summary: 'Following the clerk\'s hint, Elena talks to an elderly fisherman who knew her sister. He gives her a name she already has — but also a location: the old lighthouse, condemned three years ago.',
      planGoal: 'Move Elena closer to the truth. Plant the lighthouse as the physical climax location.',
      planPov: 'Elena Marsh — close third person',
      planBeats: '- [ ] Elena at the harbour at dawn\n- [ ] Old fisherman, reluctant to talk\n- [ ] He describes Margot — gets emotional\n- [ ] He gives her the lighthouse location, warns her off',
      notes: 'The fisherman knew Margot well. That\'s the emotional gut-punch. She was real to him. Make Elena feel that.',
      wordCount: 0, content: emptyDoc, createdAt: now, updatedAt: now
    }
    const chap05 = {
      id: 'demo-chap-05', bookId: DEMO_ID, title: 'The Confession', order: 4, kind: 'chapter',
      actId: 'demo-act-3',
      summary: 'Elena reaches the lighthouse. What she finds forces a confrontation with Thomas Vane — and with the truth about what happened seven years ago.',
      planGoal: 'Climax. The full truth emerges. Vane is cornered. Elena\'s ghost is confronted head-on.',
      planPov: 'Elena Marsh — close third person',
      planBeats: '- [ ] Elena at the lighthouse — finds evidence\n- [ ] Vane arrives — was expecting her\n- [ ] Confrontation: he tells her — or enough of it\n- [ ] Elena\'s choice: what to do with the truth',
      notes: 'The revelation should be earned, not delivered. Show Vane\'s self-justification unravelling as he speaks.',
      wordCount: 0, content: emptyDoc, createdAt: now, updatedAt: now
    }
    const chap06 = {
      id: 'demo-chap-06', bookId: DEMO_ID, title: 'What Remains', order: 5, kind: 'chapter',
      actId: 'demo-act-3',
      summary: 'Aftermath. Elena does what she came to do. The letter finally makes sense. She leaves Greyhaven the same way she arrived — alone — but something has changed.',
      planGoal: 'Resolution. Close Elena\'s ghost arc. Leave the reader with weight, not comfort.',
      planPov: 'Elena Marsh — close third person',
      planBeats: '- [ ] Aftermath of the confrontation\n- [ ] Elena calls the one person she should have called seven years ago\n- [ ] Final image: the ferry, the letter, the harbour receding',
      notes: 'Mirror the opening. Ferry. Letter. But everything means something different now.',
      wordCount: 0, content: emptyDoc, createdAt: now, updatedAt: now
    }

    // ── Write all files ──
    await ensureDir(demoDir)
    await ensureDir(join(demoDir, 'acts'))
    await ensureDir(join(demoDir, 'characters'))
    await ensureDir(join(demoDir, 'chapters'))

    await writeJson(join(demoDir, 'metadata.json'), metadata)

    await writeJson(join(demoDir, 'acts', 'demo-act-1.json'), act1)
    await writeJson(join(demoDir, 'acts', 'demo-act-2.json'), act2)
    await writeJson(join(demoDir, 'acts', 'demo-act-3.json'), act3)

    await writeJson(join(demoDir, 'characters', 'demo-char-elena.json'), elena)
    await writeJson(join(demoDir, 'characters', 'demo-char-thomas.json'), thomas)
    await writeJson(join(demoDir, 'characters', 'demo-char-margot.json'), margot)
    await writeJson(join(demoDir, 'characters', 'demo-char-ray.json'), ray)

    await writeJson(join(demoDir, 'chapters', 'demo-chap-01.json'), chap01)
    await writeJson(join(demoDir, 'chapters', 'demo-chap-02.json'), chap02)
    await writeJson(join(demoDir, 'chapters', 'demo-chap-03.json'), chap03)
    await writeJson(join(demoDir, 'chapters', 'demo-chap-04.json'), chap04)
    await writeJson(join(demoDir, 'chapters', 'demo-chap-05.json'), chap05)
    await writeJson(join(demoDir, 'chapters', 'demo-chap-06.json'), chap06)

    // ── Add to books index ──
    await ensureDir(LEKHANAM_DIR)
    const index = (await readJson<{ books: unknown[] }>(booksIndexPath())) ?? { books: [] }
    const alreadyInIndex = (index.books as { id: string }[]).some((b) => b.id === DEMO_ID)
    if (!alreadyInIndex) {
      index.books.unshift({
        id: metadata.id, name: metadata.name, synopsis: metadata.synopsis,
        createdAt: metadata.createdAt, updatedAt: metadata.updatedAt
      })
      await writeJson(booksIndexPath(), index)
    }
  })

  // === BILLING (IN-APP PURCHASES) ===
  ipcMain.handle('billing:canMakePayments', () => {
    if (!process.mas) return true // In dev/DMG builds, always allow for testing
    return inAppPurchase.canMakePayments()
  })

  ipcMain.handle('billing:getProducts', async (_, productIds: string[]) => {
    if (!process.mas) {
      // Mock product for dev testing
      return [{
        productIdentifier: productIds[0],
        localizedTitle: 'Lekhanam Pro (Dev Mock)',
        localizedDescription: 'Unlock export formats',
        price: 0,
        formattedPrice: '$0.00'
      }]
    }
    try {
      return await inAppPurchase.getProducts(productIds)
    } catch {
      return []
    }
  })

  ipcMain.handle('billing:purchase', async (_, productId: string) => {
    if (!process.mas) {
      return { success: true } // Mock success in dev/DMG
    }
    try {
      if (!inAppPurchase.canMakePayments()) {
        return { success: false, message: 'In-App Purchasing is disabled on this device.' }
      }
      
      const isPurchased = await inAppPurchase.purchaseProduct(productId)
      return { success: isPurchased }
    } catch (err: any) {
      return { success: false, message: err?.message || 'Transaction failed.' }
    }
  })

  ipcMain.handle('billing:restore', async (_, productId: string) => {
    // For Non-Consumables in Electron without a native restoreTransactions pipeline, 
    // retrieving the product via a standard purchase intent acts natively as a restore 
    // ("You already bought this, tap OK to redownload for free").
    if (!process.mas) return { success: true }
    try {
      const isPurchased = await inAppPurchase.purchaseProduct(productId, 1)
      return { success: isPurchased }
    } catch (err: any) {
      return { success: false, message: err?.message || 'Restore failed.' }
    }
  })
}
