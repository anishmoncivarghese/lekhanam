import { BrowserWindow, app } from 'electron'
import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { spawn } from 'child_process'

// ── Model paths ──────────────────────────────────────────────────────────────
// In dev:  {project}/resources/models/   (out/main/ → ../../resources/models)
// In prod: {app.app}/Contents/Resources/models/  (via extraResources in electron-builder)
export const MODELS_DIR = app.isPackaged
  ? join(process.resourcesPath, 'models')
  : join(__dirname, '../../resources/models')

export const WHISPER_MODEL_PATH = join(MODELS_DIR, 'ggml-base.en.bin')
// vosk-browser loads the model from a .zip archive via lekhanam:// custom protocol
export const VOSK_MODEL_ZIP = join(MODELS_DIR, 'vosk-model-small-en-us-0.15.zip')

// Temp WAV written here before Whisper processes it
const TEMP_WAV_PATH = join(app.getPath('temp'), 'lekhanam_recording.wav')

// Resolved path to the compiled whisper-cli binary inside nodejs-whisper
// In packaged app, nodejs-whisper is in app.asar.unpacked (asarUnpack), not app.asar
const WHISPER_BIN = resolve(
  require.resolve('nodejs-whisper/package.json').replace('app.asar', 'app.asar.unpacked'),
  '../cpp/whisper.cpp/build/bin/whisper-cli'
)

// ── Types ────────────────────────────────────────────────────────────────────
export type SpeechState = 'idle' | 'recording' | 'processing'

interface SpeechError {
  code: string
  message: string
}

// ── SpeechService ────────────────────────────────────────────────────────────
export class SpeechService {
  private window: BrowserWindow
  private isRecording = false
  private pcmBuffer: Int16Array[] = []
  private activeSessionId: string | null = null

  constructor(window: BrowserWindow) {
    this.window = window
  }

  // ── Model availability ───────────────────────────────────────────────────

  async checkModels(): Promise<{ vosk: boolean; whisper: boolean }> {
    const [vosk, whisper] = await Promise.all([
      fs
        .access(VOSK_MODEL_ZIP)
        .then(() => true)
        .catch(() => false),
      fs
        .access(WHISPER_MODEL_PATH)
        .then(() => true)
        .catch(() => false)
    ])
    return { vosk, whisper }
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────

  async start(sessionId: string): Promise<{ ok: true } | SpeechError> {
    if (this.isRecording) {
      if (this.activeSessionId === sessionId) {
        return { ok: true }
      }
      // Different chapter started — stop previous session first
      await this.stop()
    }

    this.pcmBuffer = []
    this.activeSessionId = sessionId
    this.isRecording = true
    this.sendStateChange('recording')
    return { ok: true }
  }

  // Called from IPC with each audio chunk (ArrayBuffer of Int16 PCM at 16 kHz)
  async processChunk(arrayBuffer: ArrayBuffer): Promise<void> {
    if (!this.isRecording) return
    this.pcmBuffer.push(new Int16Array(arrayBuffer))
  }

  async stop(): Promise<void> {
    if (!this.isRecording) return

    this.isRecording = false
    this.activeSessionId = null
    this.sendStateChange('processing')

    // Bail early if no audio was captured
    if (this.pcmBuffer.length === 0) {
      this.sendStateChange('idle')
      return
    }

    // MAS builds: whisper-cli binary is not available in the sandbox.
    // vosk-browser (renderer-side WASM) already provided interim transcription — return idle.
    if (process.mas) {
      this.pcmBuffer = []
      this.sendStateChange('idle')
      return
    }

    const models = await this.checkModels()
    if (!models.whisper) {
      this.sendError({
        code: 'MODEL_NOT_FOUND',
        message: `Whisper model not found at:\n${WHISPER_MODEL_PATH}\n\nDownload ggml-base.en.bin and place it there.`
      })
      this.pcmBuffer = []
      this.sendStateChange('idle')
      return
    }

    try {
      await this.writeWav(this.pcmBuffer, TEMP_WAV_PATH)
      const text = await this.runWhisper(TEMP_WAV_PATH)
      if (text.trim()) {
        this.sendFinal(text.trim())
      }
    } catch (err) {
      this.sendError({ code: 'WHISPER_FAILED', message: String(err) })
    } finally {
      this.pcmBuffer = []
      fs.unlink(TEMP_WAV_PATH).catch(() => {})
      this.sendStateChange('idle')
    }
  }

  dispose(): void {
    // Nothing to free — no persistent native resources in this service
  }

  // ── WAV file writer (pure Node.js, no external package) ──────────────────

  private async writeWav(chunks: Int16Array[], outputPath: string): Promise<void> {
    // Merge all chunks into one contiguous Int16Array
    const totalSamples = chunks.reduce((sum, c) => sum + c.length, 0)
    const merged = new Int16Array(totalSamples)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    const sampleRate = 16000
    const numChannels = 1
    const bitsPerSample = 16
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
    const blockAlign = numChannels * (bitsPerSample / 8)
    const dataBytes = merged.buffer.byteLength
    const header = Buffer.alloc(44)
    let p = 0

    header.write('RIFF', p); p += 4
    header.writeUInt32LE(36 + dataBytes, p); p += 4
    header.write('WAVE', p); p += 4
    header.write('fmt ', p); p += 4
    header.writeUInt32LE(16, p); p += 4          // PCM subchunk size
    header.writeUInt16LE(1, p); p += 2            // PCM format
    header.writeUInt16LE(numChannels, p); p += 2
    header.writeUInt32LE(sampleRate, p); p += 4
    header.writeUInt32LE(byteRate, p); p += 4
    header.writeUInt16LE(blockAlign, p); p += 2
    header.writeUInt16LE(bitsPerSample, p); p += 2
    header.write('data', p); p += 4
    header.writeUInt32LE(dataBytes, p)

    const pcmBuf = Buffer.from(merged.buffer)
    await fs.writeFile(outputPath, Buffer.concat([header, pcmBuf]))
  }

  // ── Whisper invocation ────────────────────────────────────────────────────

  private runWhisper(wavPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '-m', WHISPER_MODEL_PATH,
        '-f', wavPath,
        '--no-timestamps',
        '-l', 'auto',
        '--output-txt',
        '-of', wavPath  // outputs wavPath.txt
      ]

      const proc = spawn(WHISPER_BIN, args)
      let stderr = ''

      proc.stderr.on('data', (d: Buffer) => {
        stderr += d.toString()
      })

      proc.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`whisper-cli exited ${code}: ${stderr.slice(-300)}`))
          return
        }
        // Read the .txt output file whisper wrote
        const txtPath = wavPath + '.txt'
        try {
          const text = await fs.readFile(txtPath, 'utf-8')
          await fs.unlink(txtPath).catch(() => {})
          resolve(text.trim())
        } catch (e) {
          reject(new Error(`Could not read whisper output: ${e}`))
        }
      })

      proc.on('error', (e) => reject(e))
    })
  }

  // ── Push helpers ──────────────────────────────────────────────────────────

  private send(channel: string, payload: unknown): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload)
    }
  }

  private sendFinal(text: string): void {
    this.send('speech:final', text)
  }

  private sendError(error: SpeechError): void {
    this.send('speech:error', error)
  }

  private sendStateChange(state: SpeechState): void {
    this.send('speech:stateChange', state)
  }
}
