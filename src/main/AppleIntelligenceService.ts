import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { join } from 'path'
import { app, BrowserWindow } from 'electron'

function cliBinaryPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'apple-ai-cli', 'apple-ai-cli')
    : join(app.getAppPath(), 'resources', 'apple-ai-cli', 'apple-ai-cli')
}

export class AppleIntelligenceService {
  private win: BrowserWindow
  private activeProc: ChildProcessWithoutNullStreams | null = null
  private sessionProc: ChildProcessWithoutNullStreams | null = null
  private generationId = 0

  constructor(win: BrowserWindow) { this.win = win }

  private send(channel: string, payload: unknown): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        proc.kill()
        resolve({ available: false, reason: 'Apple Intelligence availability check timed out.' })
      }, 5000)
      const proc = spawn(cliBinaryPath(), ['--check'])
      let out = ''
      proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
      proc.on('close', () => {
        clearTimeout(timer)
        try { resolve(JSON.parse(out.trim())) }
        catch { resolve({ available: false, reason: 'Unexpected response from Apple Intelligence.' }) }
      })
      proc.on('error', (err) => {
        clearTimeout(timer)
        resolve({ available: false, reason: `Could not launch Apple Intelligence: ${err.message}` })
      })
    })
  }

  async initialize(): Promise<void> {
    const result = await this.checkAvailability()
    if (!result.available) throw new Error(result.reason ?? 'Apple Intelligence is not available.')
    this.send('llama:initProgress', { stage: 'loading_library' })
    this.send('llama:initProgress', { stage: 'loading_model' })
    this.send('llama:initProgress', { stage: 'creating_context' })
    this.send('llama:ready', { variant: 'apple-intelligence' })
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<void> {
    this.abortGenerate()
    const genId = ++this.generationId
    const proc = spawn(cliBinaryPath(), ['--generate'])
    this.activeProc = proc
    proc.stdin.on('error', (err) => {
      if (genId !== this.generationId) return
      this.send('llama:error', { message: `Apple Intelligence write error: ${err.message}` })
    })
    this.wireStreamEvents(proc, genId)
    proc.stdin.write(JSON.stringify({ system: systemPrompt, user: userPrompt }) + '\n')
    proc.stdin.end()
  }

  async generateStage(systemPrompt: string, userPrompt: string): Promise<string> {
    const genId = ++this.generationId
    return new Promise((resolve, reject) => {
      const proc = spawn(cliBinaryPath(), ['--generate'])
      this.activeProc = proc
      let fullText = ''
      let sawDone = false
      proc.stdout.on('data', (chunk: Buffer) => {
        if (genId !== this.generationId) return
        for (const line of chunk.toString().split('\n').filter(Boolean)) {
          try {
            const msg = JSON.parse(line)
            if (msg.token !== undefined) { fullText += msg.token; this.send('llama:token', { token: msg.token, done: false }) }
            if (msg.done) { sawDone = true; this.send('llama:token', { token: '', done: true }) }
            if (msg.error) { reject(new Error(msg.error)); return }
          } catch { /* skip malformed */ }
        }
      })
      proc.on('close', (code) => {
        // Resolve even if stale so the promise never hangs
        if (genId !== this.generationId) { resolve(''); return }
        if (!sawDone) {
          const msg = code !== 0 ? `Apple Intelligence exited unexpectedly (code ${code})` : 'Apple Intelligence ended without completing.'
          this.send('llama:error', { message: msg })
          this.send('llama:token', { token: '', done: true })
        }
        resolve(fullText)
      })
      proc.on('error', (err) => { if (genId !== this.generationId) { resolve(''); return } reject(err) })
      proc.stdin.on('error', (err) => {
        if (genId !== this.generationId) return
        this.send('llama:error', { message: `Apple Intelligence write error: ${err.message}` })
      })
      proc.stdin.write(JSON.stringify({ system: systemPrompt, user: userPrompt }) + '\n')
      proc.stdin.end()
    })
  }

  async startInterview(systemPrompt: string): Promise<void> {
    this.resetInterview()
    const proc = spawn(cliBinaryPath(), ['--session'])
    this.sessionProc = proc

    // Single persistent handler with a ready-state flag avoids the race where
    // a chunk contains both {"ready":true} and a first token — removing the
    // initial listener and re-adding a second one would drop the token.
    await new Promise<void>((resolve, reject) => {
      let buf = ''
      let ready = false

      proc.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString()
        let i: number
        while ((i = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, i)
          buf = buf.slice(i + 1)
          try {
            const msg = JSON.parse(line)
            if (!ready) {
              if (msg.ready) { ready = true; resolve() }
              else if (msg.error) reject(new Error(msg.error))
              continue
            }
            if (msg.token !== undefined) this.send('llama:token', { token: msg.token, done: false })
            if (msg.done) this.send('llama:token', { token: '', done: true })
            if (msg.error) this.send('llama:error', { message: msg.error })
          } catch { /* skip malformed lines */ }
        }
      })

      proc.on('error', reject)
      proc.on('close', (code) => {
        if (!ready) reject(new Error(`Session failed to start (code ${code})`))
        else if (code !== 0) this.send('llama:error', { message: `Interview session ended unexpectedly (code ${code})` })
      })
      proc.stdin.write(JSON.stringify({ system: systemPrompt }) + '\n')
    })
  }

  async sendInterviewMessage(userMessage: string): Promise<void> {
    if (!this.sessionProc) throw new Error('No active interview session.')
    this.sessionProc.stdin.write(JSON.stringify({ user: userMessage }) + '\n')
  }

  resetInterview(): void {
    if (this.sessionProc) { this.sessionProc.kill('SIGKILL'); this.sessionProc = null }
  }

  abortGenerate(): void {
    if (this.activeProc) { this.activeProc.kill('SIGKILL'); this.activeProc = null }
    ++this.generationId
  }

  dispose(): void {
    this.abortGenerate()
    this.resetInterview()
  }

  private wireStreamEvents(proc: ChildProcessWithoutNullStreams, genId: number): void {
    let sawDone = false
    proc.stdout.on('data', (chunk: Buffer) => {
      if (genId !== this.generationId) return
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        try {
          const msg = JSON.parse(line)
          if (msg.token !== undefined) this.send('llama:token', { token: msg.token, done: false })
          if (msg.done) { sawDone = true; this.send('llama:token', { token: '', done: true }) }
          if (msg.error) this.send('llama:error', { message: msg.error })
        } catch { /* skip malformed */ }
      }
    })
    proc.on('close', (code) => {
      if (genId !== this.generationId) return
      if (!sawDone) {
        if (code !== 0) this.send('llama:error', { message: `Apple Intelligence exited (code ${code})` })
        this.send('llama:token', { token: '', done: true })
      }
    })
    proc.on('error', (err) => {
      if (genId !== this.generationId) return
      this.send('llama:error', { message: err.message })
    })
  }
}
