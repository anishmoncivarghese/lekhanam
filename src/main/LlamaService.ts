import os from 'os'
import fs from 'fs'
import https from 'https'
import http from 'http'
import { join } from 'path'
import { execSync } from 'child_process'
import { app, BrowserWindow } from 'electron'

// Type-only imports — zero runtime cost, TypeScript erases these at compile time
import type { LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp'

// Module-level cache so we only pay the dynamic-import cost once
let llamaModCache: typeof import('node-llama-cpp') | null = null

async function getLlamaMod(): Promise<typeof import('node-llama-cpp')> {
  if (!llamaModCache) {
    llamaModCache = await import('node-llama-cpp')
  }
  return llamaModCache
}

// ─── Constants ──────────────────────────────────────────────────────────────
// MAS builds: store models in app container; DMG builds: ~/Documents/Lekhanam/models/
const MODEL_DIR = process.mas
  ? join(app.getPath('userData'), 'models')
  : join(os.homedir(), 'Documents', 'Lekhanam', 'models')

export const MODEL_CATALOG = {
  'lekha-2b': {
    id: 'lekha-2b' as const,
    label: 'Lekha AI 2B',
    description: 'Our fine-tuned model for creative writing. Understands story structure, characters, prose.',
    filename: 'lekha-ai-2b-Q4_K_M.gguf',
    url: 'https://huggingface.co/anishmoncivarghese/lekha-ai-2b-gguf/resolve/main/lekha-ai-2b-Q4_K_M.gguf',
    sizeGb: 1.5,
    requiredFreeGb: 2.0,
    contextSize: 4096
  },
  micro: {
    id: 'micro' as const,
    label: 'Qwen2.5-1.5B Micro',
    description: 'Fastest. Works on any Mac.',
    filename: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    sizeGb: 0.98,
    // 0.98 GB weights + 4096-token KV cache (~250 MB) + Metal working buffers +
    // tokenizer/graph overhead. 1.5 GB is the weights-only floor and fails to
    // allocate on Metal when free RAM is that tight.
    requiredFreeGb: 2.0,
    contextSize: 4096
  },
  lite: {
    id: 'lite' as const,
    label: 'Qwen2.5-3B Lite',
    description: 'Balanced. For 8 GB Macs.',
    filename: 'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf',
    sizeGb: 1.9,
    requiredFreeGb: 2.5,
    contextSize: 4096
  },
  standard: {
    id: 'standard' as const,
    label: 'Qwen2.5-7B Standard',
    description: 'Higher quality. For 8–16 GB Macs.',
    filename: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    sizeGb: 4.7,
    requiredFreeGb: 5.0,
    contextSize: 4096
  },
  premium: {
    id: 'premium' as const,
    label: 'Qwen2.5-7B Premium',
    description: 'Best quality, 16k context. 16 GB+ Macs.',
    filename: 'Qwen2.5-7B-Instruct-Q8_0.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q8_0.gguf',
    sizeGb: 8.1,
    requiredFreeGb: 8.5,
    contextSize: 16384
  }
} as const

export type ModelVariant = keyof typeof MODEL_CATALOG

export interface HardwareProfile {
  totalGb: number
  freeGb: number
  freeDiskGb: number
  recommended: ModelVariant
  contextSize: number
}

export interface ModelStatus {
  id: ModelVariant
  label: string
  description: string
  sizeGb: number
  requiredFreeGb: number
  downloaded: boolean
}

// ─── LlamaService ────────────────────────────────────────────────────────────
// Minimal interface — we only need dispose() from LlamaContextSequence
type SeqRef = { dispose(): void }

export class LlamaService {
  private window: BrowserWindow
  private model?: LlamaModel
  private context?: LlamaContext
  // session for single-shot generation (Magic Wand, Ghostwriter, Chapter Gen)
  private singleSession?: LlamaChatSession
  // session for Character Interview (persists across turns)
  private interviewSession?: LlamaChatSession
  // context sequences — must be explicitly disposed to free the slot back to the pool
  private singleSeq?: SeqRef
  private interviewSeq?: SeqRef
  private abortController?: AbortController
  private profile: HardwareProfile
  private activeVariant: ModelVariant | null = null
  private isInitialized = false
  private isGenerating = false
  // Dedupe concurrent download requests per variant. A second callsite
  // asking to download an already-in-flight variant joins the existing
  // promise instead of spawning a parallel HTTP request that would
  // truncate the destination file and interleave progress events.
  private activeDownloads = new Map<ModelVariant, Promise<void>>()

  constructor(window: BrowserWindow) {
    this.window = window
    this.profile = LlamaService.detectHardware()
  }

  // ─── Hardware Detection ──────────────────────────────────────────────────
  private getDiskFreeGb(): number {
    try {
      // df -k reports in 1K-blocks; column 3 (0-indexed) is "Available"
      const out = execSync(`df -k "${os.homedir()}"`, { encoding: 'utf8' })
      const lines = out.trim().split('\n')
      const cols = lines[lines.length - 1].trim().split(/\s+/)
      const availableKb = parseInt(cols[3], 10)
      return availableKb / (1024 * 1024) // KB → GB
    } catch {
      return 999 // unknown — don't block
    }
  }

  static detectHardware(): HardwareProfile {
    const totalGb = os.totalmem() / 1073741824
    const freeGb = os.freemem() / 1073741824
    // Pick the best model the system can support based on total RAM
    let recommended: ModelVariant
    let contextSize: number
    if (totalGb < 3) {
      recommended = 'micro'
      contextSize = 4096
    } else if (totalGb < 6) {
      recommended = 'micro'
      contextSize = 4096
    } else if (totalGb < 9) {
      recommended = 'lite'
      contextSize = 4096
    } else if (totalGb < 14) {
      recommended = 'standard'
      contextSize = 4096
    } else {
      recommended = 'premium'
      contextSize = 16384
    }
    return { totalGb, freeGb, freeDiskGb: 999, recommended, contextSize }
  }

  getProfile(): HardwareProfile {
    return { ...this.profile, freeGb: os.freemem() / 1073741824, freeDiskGb: this.getDiskFreeGb() }
  }

  private getAvailableMemGb(): number {
    if (process.platform === 'darwin') {
      try {
        const out = execSync('vm_stat', { encoding: 'utf8' })
        // macOS page size is 16 KB (16384 bytes) on Apple Silicon and Intel
        const pageSize = 16384
        const extract = (label: string): number => {
          const m = out.match(new RegExp(`${label}:\\s+(\\d+)`))
          return m ? parseInt(m[1]) * pageSize : 0
        }
        const free = extract('Pages free')
        const inactive = extract('Pages inactive')
        const speculative = extract('Pages speculative')
        return (free + inactive + speculative) / 1073741824
      } catch {
        // fall through to os.freemem()
      }
    }
    return os.freemem() / 1073741824
  }

  getMemoryStatus(): 'green' | 'yellow' | 'red' {
    const freeGb = this.getAvailableMemGb()
    if (freeGb > 2) return 'green'
    if (freeGb > 1) return 'yellow'
    return 'red'
  }

  getActiveVariant(): ModelVariant | null {
    return this.activeVariant
  }

  // ─── Model Catalog ────────────────────────────────────────────────────────
  modelPath(variant: ModelVariant): string {
    return join(MODEL_DIR, MODEL_CATALOG[variant].filename)
  }

  async isModelDownloaded(): Promise<boolean> {
    return this.isModelDownloadedById(this.profile.recommended)
  }

  async isModelDownloadedById(variant: ModelVariant): Promise<boolean> {
    const path = this.modelPath(variant)
    try {
      const stat = await fs.promises.stat(path)
      const expectedBytes = MODEL_CATALOG[variant].sizeGb * 1024 * 1024 * 1024
      // Accept the file only if it's at least 90% of the expected size.
      // Anything smaller is a stub, aborted download, or corrupt file — delete
      // it so the UI offers Download again instead of a broken Load.
      if (stat.size < expectedBytes * 0.9) {
        console.warn(
          `[LlamaService] ${variant} file is ${stat.size} bytes (expected ~${Math.round(expectedBytes)}), treating as corrupt and removing.`
        )
        try { await fs.promises.unlink(path) } catch { /* best-effort */ }
        return false
      }
      return true
    } catch {
      return false
    }
  }

  async getAllModelStatuses(): Promise<ModelStatus[]> {
    return Promise.all(
      (Object.keys(MODEL_CATALOG) as ModelVariant[]).map(async (id) => {
        const m = MODEL_CATALOG[id]
        const downloaded = await this.isModelDownloadedById(id)
        return {
          id,
          label: m.label,
          description: m.description,
          sizeGb: m.sizeGb,
          requiredFreeGb: m.requiredFreeGb,
          downloaded
        }
      })
    )
  }

  async uninstallModel(variant: ModelVariant): Promise<void> {
    if (process.mas) throw new Error('On-device AI is not available in the App Store edition yet.')
    const path = this.modelPath(variant)
    try {
      await fs.promises.unlink(path)
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException
      if (e.code !== 'ENOENT') throw err
    }
  }

  // ─── Download ────────────────────────────────────────────────────────────
  async downloadModel(): Promise<void> {
    return this.downloadModelById(this.profile.recommended)
  }

  async downloadModelById(variant: ModelVariant): Promise<void> {
    // Block before any disk I/O so MAS users don't waste bandwidth on a
    // multi-GB GGUF that can never be loaded (initialize() rejects in MAS).
    if (process.mas) throw new Error('On-device AI is not available in the App Store edition yet.')
    const existing = this.activeDownloads.get(variant)
    if (existing) return existing
    const p = this.runDownload(variant)
    this.activeDownloads.set(variant, p)
    p.finally(() => {
      this.activeDownloads.delete(variant)
    })
    return p
  }

  private async runDownload(variant: ModelVariant): Promise<void> {
    const { filename, url } = MODEL_CATALOG[variant]
    await fs.promises.mkdir(MODEL_DIR, { recursive: true })
    const destPath = join(MODEL_DIR, filename)

    await new Promise<void>((resolve, reject) => {
      let settled = false
      let downloaded = 0
      let lastUpdate = 0

      const fail = (err: Error): void => {
        if (settled) return
        settled = true
        fs.unlink(destPath, () => {})
        reject(err)
      }

      // Follow redirects manually; HuggingFace CDN uses 1-2 hops
      const makeRequest = (currentUrl: string, hops = 0): void => {
        if (hops > 10) { fail(new Error('Too many redirects')); return }

        const lib = currentUrl.startsWith('https:') ? https : http
        lib.get(currentUrl, { headers: { 'User-Agent': 'curl/8.0' } }, (res) => {
          // Redirect
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
            res.resume() // drain so the socket is freed
            const loc = res.headers.location
            if (!loc) { fail(new Error('Redirect with no location header')); return }
            makeRequest(new URL(loc, currentUrl).toString(), hops + 1)
            return
          }

          if (res.statusCode !== 200) {
            fail(new Error(`Download failed: HTTP ${res.statusCode}`))
            return
          }

          const total = parseInt(res.headers['content-length'] ?? '0', 10)
          const file = fs.createWriteStream(destPath)

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length

            // Backpressure: pause the source if the disk write buffer is full
            if (!file.write(chunk)) {
              res.pause()
              file.once('drain', () => res.resume())
            }

            // Throttle IPC to at most once per second (avoids flooding the renderer)
            const now = Date.now()
            if (now - lastUpdate >= 1000) {
              lastUpdate = now
              this.send('llama:progress', {
                percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
                downloaded,
                total
              })
            }
          })

          res.on('end', () => {
            file.end(() => {
              if (settled) return
              settled = true
              this.send('llama:progress', { percent: 100, downloaded, total: downloaded })
              this.send('llama:downloadComplete', { variant })
              resolve()
            })
          })

          res.on('error', (err: Error) => { file.destroy(); fail(err) })
          file.on('error', (err: Error) => fail(err))
        }).on('error', (err: Error) => fail(err))
      }

      makeRequest(url)
    })
  }

  // ─── Initialization ──────────────────────────────────────────────────────
  async initialize(variant?: ModelVariant): Promise<void> {
    // node-llama-cpp dlopens libllama/libggml dylibs that do not pass MAS
    // library validation. The native binaries are also stripped from the MAS
    // bundle in scripts/after-pack-mas.js. Fail fast with a user-readable
    // message instead of crashing inside the dynamic import.
    if (process.mas) {
      throw new Error('On-device AI is not available in the App Store edition yet.')
    }
    if (this.isInitialized) return
    const targetVariant = variant ?? this.profile.recommended
    this.send('llama:initProgress', { stage: 'loading_library' })

    const { getLlama } = await getLlamaMod()
    const llama = await getLlama({ gpu: 'metal' })

    this.send('llama:initProgress', { stage: 'loading_model' })
    this.model = await llama.loadModel({ modelPath: this.modelPath(targetVariant) })

    this.send('llama:initProgress', { stage: 'creating_context' })
    this.context = await this.model.createContext({
      contextSize: MODEL_CATALOG[targetVariant].contextSize
    })

    this.activeVariant = targetVariant
    this.isInitialized = true
    this.send('llama:ready', { variant: targetVariant })
  }

  // ─── Single-shot Generation (Magic Wand, Ghostwriter, Chapter Gen) ───────
  async generate(systemPrompt: string, userPrompt: string): Promise<void> {
    if (!this.context) throw new Error('Model not initialized')
    if (this.isGenerating) {
      this.abortController?.abort()
      await new Promise(r => setTimeout(r, 100))
    }

    // Release the previous sequence so the slot is free for the new session
    this.singleSeq?.dispose()
    this.singleSeq = undefined

    this.abortController = new AbortController()
    this.isGenerating = true

    const { LlamaChatSession } = await getLlamaMod()
    const seq = this.context.getSequence()
    this.singleSeq = seq as unknown as SeqRef
    this.singleSession = new LlamaChatSession({
      contextSequence: seq,
      systemPrompt
    })

    try {
      await this.singleSession.prompt(userPrompt, {
        onTextChunk: (text) => {
          this.send('llama:token', { token: text, done: false })
        },
        signal: this.abortController.signal
      })
      this.send('llama:token', { token: '', done: true })
    } catch (err: unknown) {
      const name = (err as Error)?.name
      if (name !== 'AbortError' && name !== 'TimeoutError') {
        this.send('llama:error', { message: String(err) })
      } else {
        this.send('llama:token', { token: '', done: true })
      }
    } finally {
      this.isGenerating = false
      // Return the sequence slot to the pool so the next call can acquire it
      this.singleSeq?.dispose()
      this.singleSeq = undefined
    }
  }

  // ─── Pipelined Generation (Architect → Ghostwriter → Editor) ─────────────
  // All three phases run on the same loaded model using different system prompts.
  // The architect's output is fed into the ghostwriter's input;
  // the ghostwriter's prose is fed into the editor's input.
  async generatePipelined(
    architectPrompt: { sys: string; user: string },
    ghostwriterSys: string,
    editorEnabled: boolean,
    editorSys: string,
    targetWords?: number
  ): Promise<void> {
    if (!this.context) throw new Error('Model not initialized')
    if (this.isGenerating) {
      this.abortController?.abort()
      await new Promise(r => setTimeout(r, 100))
    }

    this.isGenerating = true
    const { LlamaChatSession } = await getLlamaMod()

    const runPhase = async (
      sys: string,
      user: string,
      stage: 'architect' | 'ghostwriter' | 'editor'
    ): Promise<string> => {
      this.abortController = new AbortController()
      this.send('llama:pipelineStage', { stage, done: false })

      // Release any prior phase's sequence before acquiring a new one
      this.singleSeq?.dispose()
      this.singleSeq = undefined

      const seq = this.context!.getSequence()
      this.singleSeq = seq as unknown as SeqRef
      const session = new LlamaChatSession({ contextSequence: seq, systemPrompt: sys })
      let output = ''

      try {
        await session.prompt(user, {
          onTextChunk: (text) => {
            output += text
            this.send('llama:token', { token: text, done: false })
          },
          signal: this.abortController.signal
        })
        this.send('llama:pipelineStage', { stage, done: true })
      } catch (err: unknown) {
        const name = (err as Error)?.name
        if (name !== 'AbortError' && name !== 'TimeoutError') {
          this.send('llama:error', { message: String(err) })
          throw err
        }
      } finally {
        this.singleSeq?.dispose()
        this.singleSeq = undefined
      }
      return output
    }

    try {
      // Phase 1: Architect
      const architectNotes = await runPhase(
        architectPrompt.sys,
        architectPrompt.user,
        'architect'
      )
      if (!architectNotes) { this.send('llama:token', { token: '', done: true }); return }

      // Phase 2: Ghostwriter
      const lengthDirective = targetWords && targetWords > 0
        ? `\n\nTarget length: approximately ${targetWords} words. Do not stop early — develop the scene fully with dialogue, beats, and sensory detail until you reach this length.`
        : ''
      const ghostwriterUser = `Story notes from continuity review:\n${architectNotes}\n\nNow write the full prose for this scene.${lengthDirective}`
      const prose = await runPhase(ghostwriterSys, ghostwriterUser, 'ghostwriter')
      if (!prose) { this.send('llama:token', { token: '', done: true }); return }

      // Phase 3: Editor (optional)
      if (editorEnabled) {
        const editorUser = `Review this passage:\n\n${prose}`
        await runPhase(editorSys, editorUser, 'editor')
      }

      this.send('llama:token', { token: '', done: true })
    } catch {
      // Error already sent in runPhase
    } finally {
      this.isGenerating = false
    }
  }

  // ─── Character Interview (multi-turn) ────────────────────────────────────
  async startInterview(systemPrompt: string): Promise<void> {
    if (!this.context) throw new Error('Model not initialized')

    // Cancel any ongoing single-shot generation, then release its sequence
    if (this.isGenerating) {
      this.abortController?.abort()
      await new Promise(r => setTimeout(r, 100))
    }
    this.singleSeq?.dispose()
    this.singleSeq = undefined

    // Release any previous interview session's sequence
    this.interviewSeq?.dispose()
    this.interviewSeq = undefined

    const { LlamaChatSession } = await getLlamaMod()
    const seq = this.context.getSequence()
    this.interviewSeq = seq as unknown as SeqRef
    this.interviewSession = new LlamaChatSession({
      contextSequence: seq,
      systemPrompt
    })
  }

  async sendInterviewMessage(userMessage: string): Promise<void> {
    if (!this.interviewSession) throw new Error('Interview session not started')
    if (this.isGenerating) return

    this.abortController = new AbortController()
    this.isGenerating = true

    try {
      await this.interviewSession.prompt(userMessage, {
        onTextChunk: (text) => {
          this.send('llama:token', { token: text, done: false })
        },
        signal: this.abortController.signal
      })
      this.send('llama:token', { token: '', done: true })
    } catch (err: unknown) {
      const name = (err as Error)?.name
      if (name !== 'AbortError') {
        this.send('llama:error', { message: String(err) })
      } else {
        this.send('llama:token', { token: '', done: true })
      }
    } finally {
      this.isGenerating = false
    }
  }

  resetInterview(): void {
    this.interviewSeq?.dispose()
    this.interviewSeq = undefined
    this.interviewSession = undefined
  }

  // ─── Cancel / Cleanup ────────────────────────────────────────────────────
  cancel(): void {
    this.abortController?.abort()
  }

  dispose(): void {
    this.abortController?.abort()
    this.singleSession = undefined
    this.interviewSession = undefined
    this.singleSeq?.dispose()
    this.singleSeq = undefined
    this.interviewSeq?.dispose()
    this.interviewSeq = undefined
    // Explicit C++ memory free (node-llama-cpp v3 supports dispose on model/context)
    try { (this.context as unknown as { dispose?: () => void })?.dispose?.() } catch {}
    this.context = undefined
    try { (this.model as unknown as { dispose?: () => void })?.dispose?.() } catch {}
    this.model = undefined
    this.activeVariant = null
    this.isInitialized = false
  }

  // ─── Private helpers ─────────────────────────────────────────────────────
  private send(channel: string, payload: unknown): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload)
    }
  }
}
