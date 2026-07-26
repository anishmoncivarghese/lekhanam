import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { spawn } from 'child_process'

const ICLOUD_CONTAINER = join(
  homedir(), 'Library', 'Mobile Documents',
  'iCloud~app~lekhanam', 'Documents'
)

const LOCAL_DATA_DIR = process.mas
  ? app.getPath('userData')
  : join(homedir(), 'Documents', 'Lekhanam')

const SETTINGS_PATH = join(app.getPath('userData'), 'lekhanam-settings.json')
const JOURNAL_PATH = join(app.getPath('userData'), 'migration-journal.json')

export interface ICloudStatus {
  isMas: boolean
  accountSignedIn: boolean
  enabled: boolean
}

export interface MigrationResult {
  ok: boolean
  moved: number
  error?: string
}

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

interface LekhanamSettings {
  iCloudSyncEnabled: boolean
}

interface MigrationJournal {
  direction: 'toCloud' | 'toLocal'
  startedAt: string
  totalBooks: string[]
  completed: string[]
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(path, 'utf-8')) as T }
  catch { return null }
}

function cliBinaryPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'apple-ai-cli', 'apple-ai-cli')
    : join(app.getAppPath(), 'resources', 'apple-ai-cli', 'apple-ai-cli')
}

export class ICloudService {
  private settingsCache: LekhanamSettings | null = null

  private async readSettings(): Promise<LekhanamSettings> {
    if (this.settingsCache) return this.settingsCache
    const s = await readJson<LekhanamSettings>(SETTINGS_PATH)
    this.settingsCache = s ?? { iCloudSyncEnabled: false }
    return this.settingsCache
  }

  private async writeSettings(s: LekhanamSettings): Promise<void> {
    this.settingsCache = s
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(s, null, 2), 'utf-8')
  }

  async isEnabled(): Promise<boolean> {
    const s = await this.readSettings()
    return s.iCloudSyncEnabled
  }

  getBooksDir(): string {
    const enabled = this.settingsCache?.iCloudSyncEnabled ?? false
    return enabled ? join(ICLOUD_CONTAINER, 'books') : join(LOCAL_DATA_DIR, 'books')
  }

  getBooksIndexPath(): string {
    const enabled = this.settingsCache?.iCloudSyncEnabled ?? false
    return enabled ? join(ICLOUD_CONTAINER, 'books.json') : join(LOCAL_DATA_DIR, 'books.json')
  }

  async getStatus(): Promise<ICloudStatus> {
    const settings = await this.readSettings()
    const accountSignedIn = await this.checkICloudAccount()
    return {
      isMas: process.mas === true,
      accountSignedIn,
      enabled: settings.iCloudSyncEnabled,
      booksDir: this.getBooksDir(),
    }
  }

  private async checkICloudAccount(): Promise<boolean> {
    if (!process.mas) return false
    return new Promise((resolve) => {
      const timer = setTimeout(() => { proc.kill(); resolve(false) }, 5000)
      const proc = spawn(cliBinaryPath(), ['--icloud-status'])
      let out = ''
      proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
      proc.on('close', () => {
        clearTimeout(timer)
        try { resolve(JSON.parse(out.trim()).available === true) }
        catch { resolve(false) }
      })
      proc.on('error', () => { clearTimeout(timer); resolve(false) })
    })
  }

  async setEnabled(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
    const result = enabled ? await this.migrateToCloud() : await this.migrateToLocal()
    if (!result.ok) return result
    await this.writeSettings({ iCloudSyncEnabled: enabled })
    return { ok: true }
  }

  async migrateToCloud(): Promise<MigrationResult> {
    const localBooksDir = join(LOCAL_DATA_DIR, 'books')
    const cloudBooksDir = join(ICLOUD_CONTAINER, 'books')
    await ensureDir(ICLOUD_CONTAINER)
    await ensureDir(cloudBooksDir)

    let bookIds: string[] = []
    try { bookIds = await fs.readdir(localBooksDir) } catch { return { ok: true, moved: 0 } }

    const journal: MigrationJournal = {
      direction: 'toCloud', startedAt: new Date().toISOString(),
      totalBooks: bookIds, completed: [],
    }
    await fs.writeFile(JOURNAL_PATH, JSON.stringify(journal, null, 2))

    let moved = 0
    for (const id of bookIds) {
      const src = join(localBooksDir, id)
      const dst = join(cloudBooksDir, id)
      try {
        await fs.cp(src, dst, { recursive: true, force: true } as Parameters<typeof fs.cp>[2])
        const srcEntries = await fs.readdir(src, { recursive: true } as Parameters<typeof fs.readdir>[1])
        const dstEntries = await fs.readdir(dst, { recursive: true } as Parameters<typeof fs.readdir>[1])
        if (srcEntries.length !== dstEntries.length) throw new Error('Copy incomplete')
        await fs.rm(src, { recursive: true })
        journal.completed.push(id)
        await fs.writeFile(JOURNAL_PATH, JSON.stringify(journal, null, 2))
        moved++
      } catch (err) {
        return { ok: false, moved, error: String(err) }
      }
    }

    const localIndex = join(LOCAL_DATA_DIR, 'books.json')
    const cloudIndex = join(ICLOUD_CONTAINER, 'books.json')
    try { await fs.cp(localIndex, cloudIndex); await fs.unlink(localIndex) } catch { /* ok */ }
    await fs.unlink(JOURNAL_PATH).catch(() => {})
    return { ok: true, moved }
  }

  async migrateToLocal(): Promise<MigrationResult> {
    const cloudBooksDir = join(ICLOUD_CONTAINER, 'books')
    const localBooksDir = join(LOCAL_DATA_DIR, 'books')
    await ensureDir(localBooksDir)

    let bookIds: string[] = []
    try { bookIds = await fs.readdir(cloudBooksDir) } catch { return { ok: true, moved: 0 } }

    const journal: MigrationJournal = {
      direction: 'toLocal', startedAt: new Date().toISOString(),
      totalBooks: bookIds, completed: [],
    }
    await fs.writeFile(JOURNAL_PATH, JSON.stringify(journal, null, 2))

    let moved = 0
    for (const id of bookIds) {
      const src = join(cloudBooksDir, id)
      const dst = join(localBooksDir, id)
      try {
        await fs.cp(src, dst, { recursive: true, force: true } as Parameters<typeof fs.cp>[2])
        await fs.rm(src, { recursive: true })
        journal.completed.push(id)
        await fs.writeFile(JOURNAL_PATH, JSON.stringify(journal, null, 2))
        moved++
      } catch (err) {
        return { ok: false, moved, error: String(err) }
      }
    }

    const cloudIndex = join(ICLOUD_CONTAINER, 'books.json')
    const localIndex = join(LOCAL_DATA_DIR, 'books.json')
    try { await fs.cp(cloudIndex, localIndex); await fs.unlink(cloudIndex) } catch { /* ok */ }
    await fs.unlink(JOURNAL_PATH).catch(() => {})
    return { ok: true, moved }
  }

  async resumeJournalIfNeeded(): Promise<void> {
    const journal = await readJson<MigrationJournal>(JOURNAL_PATH)
    if (!journal) return
    console.log(`[ICloudService] Resuming interrupted ${journal.direction} migration`)
    if (journal.direction === 'toCloud') await this.migrateToCloud()
    else await this.migrateToLocal()
  }

  private static CONFLICT_RE = /^(.+) \(conflicted copy (\d{4}-\d{2}-\d{2})\)(\..+)$/

  async scanConflicts(): Promise<ConflictInfo[]> {
    const booksDir = this.getBooksDir()
    let bookIds: string[] = []
    try { bookIds = await fs.readdir(booksDir) } catch { return [] }

    const results: ConflictInfo[] = []
    for (const bookId of bookIds) {
      const bookPath = join(booksDir, bookId)
      let entries: string[] = []
      try { entries = await fs.readdir(bookPath) } catch { continue }

      const conflictFiles: ConflictFile[] = []
      for (const entry of entries) {
        const m = entry.match(ICloudService.CONFLICT_RE)
        if (!m) continue
        const [, base, date, ext] = m
        conflictFiles.push({
          relPath: entry,
          originalPath: join(bookPath, `${base}${ext}`),
          conflictPath: join(bookPath, entry),
          conflictDate: date,
        })
      }

      if (conflictFiles.length > 0) {
        const meta = await readJson<{ name?: string }>(join(bookPath, 'metadata.json'))
        results.push({ bookId, bookName: meta?.name ?? bookId, files: conflictFiles })
      }
    }
    return results
  }

  async resolveConflict(conflictPath: string, action: ConflictAction): Promise<{ ok: boolean }> {
    try {
      const m = conflictPath.match(ICloudService.CONFLICT_RE)
      if (!m) throw new Error('Not a conflict path')
      const [, base, date, ext] = m
      const dir = conflictPath.substring(0, conflictPath.lastIndexOf('/') + 1)
      const originalPath = join(dir, `${base}${ext}`)

      switch (action) {
        case 'keepOriginal':
          await fs.unlink(conflictPath)
          break
        case 'keepConflict': {
          const backup = originalPath + '.bak'
          await fs.rename(originalPath, backup)
          try {
            await fs.rename(conflictPath, originalPath)
            await fs.unlink(backup)
          } catch (innerErr) {
            // Restore original if the swap failed — prevents orphaned .bak
            await fs.rename(backup, originalPath).catch(() => {})
            throw innerErr
          }
          break
        }
        case 'keepBoth': {
          const safeName = join(dir, `${base} (recovered ${date})${ext}`)
          await fs.rename(conflictPath, safeName)
          break
        }
      }
      return { ok: true }
    } catch { return { ok: false } }
  }
}
