import { useState, useRef, useEffect, useCallback } from 'react'
import { SpeechState } from '../types'

// ── Audio constants ──────────────────────────────────────────────────────────
const TARGET_SAMPLE_RATE = 16000
const CHUNK_FLUSH_MS = 250  // send accumulated PCM to main process every 250 ms
const SCRIPT_PROCESSOR_BUFFER = 4096  // frames per ScriptProcessorNode callback

// ── Public API ────────────────────────────────────────────────────────────────
interface UseSpeechOptions {
  sessionId: string
  onFinal: (text: string) => void
  onError: (message: string) => void
  voskModelFilename?: string  // defaults to English model
}

interface UseSpeechResult {
  state: SpeechState
  interimText: string
  startRecording: () => void
  stopRecording: () => void
}

// ── Hook implementation ───────────────────────────────────────────────────────
export function useSpeech({ sessionId, onFinal, onError, voskModelFilename }: UseSpeechOptions): UseSpeechResult {
  const [state, setState] = useState<SpeechState>('idle')
  const [interimText, _setInterimText] = useState('')
  const setInterimText = (t: string): void => { interimTextRef.current = t; _setInterimText(t) }

  const filename = voskModelFilename ?? 'vosk-model-small-en-us-0.15.zip'
  const voskModelUrl = `lekhanam://models/${filename}`

  // Audio pipeline refs
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const accumulatorRef = useRef<Float32Array[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // vosk-browser model / recognizer refs
  const voskModelRef = useRef<import('vosk-browser').Model | null>(null)
  const voskRecRef = useRef<import('vosk-browser').KaldiRecognizer | null>(null)
  const voskLoadedRef = useRef(false)
  const voskLoadingRef = useRef(false)

  // Keep callback refs fresh so the subscription effect never needs to re-run
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal
  const onErrorRef = useRef(onError)

  // Always-current ref for interimText so stopRecording captures it without a stale closure
  const interimTextRef = useRef('')
  onErrorRef.current = onError

  // Subscribe to events from main process — subscribe once on mount, never re-subscribe.
  // Using refs for callbacks avoids the brief unsubscribe/resubscribe gap that would
  // cause state-change events to be silently dropped (e.g. the 'recording' event
  // arriving while the listener was removed due to an inline onError reference changing).
  useEffect(() => {
    const unsubFinal = window.electron.speech.onFinal((text) => {
      setInterimText('')
      onFinalRef.current(text)
    })
    const unsubError = window.electron.speech.onError((err) => {
      onErrorRef.current(err.message)
    })
    const unsubState = window.electron.speech.onStateChange((s) => {
      setState(s)
    })
    return () => {
      unsubFinal()
      unsubError()
      unsubState()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset vosk model when language changes so it reloads on next recording
  const prevFilenameRef = useRef(filename)
  useEffect(() => {
    if (prevFilenameRef.current !== filename) {
      prevFilenameRef.current = filename
      voskModelRef.current?.terminate?.()
      voskModelRef.current = null
      voskRecRef.current?.remove()
      voskRecRef.current = null
      voskLoadedRef.current = false
      voskLoadingRef.current = false
    }
  }, [filename])

  // ── Lazy-load vosk model (only once per session) ──────────────────────────
  const ensureVosk = useCallback(async (): Promise<boolean> => {
    if (voskLoadedRef.current) return true
    if (voskLoadingRef.current) return false
    voskLoadingRef.current = true
    try {
      const { createModel } = await import('vosk-browser')
      const model = await createModel(voskModelUrl)
      voskModelRef.current = model
      voskLoadedRef.current = true
      return true
    } catch (e) {
      // Model not found or network error — not fatal, whisper will still work
      console.warn('[useSpeech] vosk-browser model failed to load:', e)
      return false
    } finally {
      voskLoadingRef.current = false
    }
  }, [voskModelUrl])

  // ── Audio capture helpers ─────────────────────────────────────────────────
  function cleanupAudio(): void {
    if (flushTimerRef.current) clearInterval(flushTimerRef.current)
    flushTimerRef.current = null
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    audioCtxRef.current?.close().catch(() => {})
    processorRef.current = null
    sourceRef.current = null
    streamRef.current = null
    audioCtxRef.current = null
    accumulatorRef.current = []

    // Free vosk recognizer (not the model — model is reused)
    voskRecRef.current?.remove()
    voskRecRef.current = null
  }

  // ── startRecording ────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (state !== 'idle') return

    // 1. Request microphone
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch {
      onError(
        'Microphone permission denied. Allow microphone access in System Settings → Privacy → Microphone.'
      )
      return
    }

    // 2. Tell main process to start session (creates buffer for Whisper)
    const result = await window.electron.speech.start(sessionId)
    if ('code' in result) {
      onError(result.message)
      stream.getTracks().forEach((t) => t.stop())
      return
    }

    // 3. Create AudioContext at native device sample rate
    const nativeRate = stream.getAudioTracks()[0]?.getSettings().sampleRate ?? 44100
    const audioCtx = new AudioContext({ sampleRate: nativeRate })
    const source = audioCtx.createMediaStreamSource(stream)

    // 4. ScriptProcessorNode for raw PCM access (deprecated but works fine in Electron)
    const processor = audioCtx.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER, 1, 1)
    accumulatorRef.current = []

    processor.onaudioprocess = (e) => {
      const raw = e.inputBuffer.getChannelData(0) // Float32 at nativeRate
      const downsampled =
        nativeRate === TARGET_SAMPLE_RATE ? raw.slice() : downsample(raw, nativeRate)
      accumulatorRef.current.push(downsampled)

      // Feed to vosk-browser for interim text (fire-and-forget, no await)
      if (voskRecRef.current) {
        voskRecRef.current.acceptWaveformFloat(downsampled, TARGET_SAMPLE_RATE)
      }
    }

    source.connect(processor)
    processor.connect(audioCtx.destination) // must be connected or callback won't fire

    streamRef.current = stream
    audioCtxRef.current = audioCtx
    sourceRef.current = source
    processorRef.current = processor

    // 5. Try to load vosk-browser for interim text (non-blocking)
    ensureVosk().then((loaded) => {
      if (!loaded || !voskModelRef.current) return
      const KaldiRecognizer = voskModelRef.current.KaldiRecognizer
      const rec = new KaldiRecognizer(TARGET_SAMPLE_RATE)
      rec.on('result', (msg) => {
        const text = (msg.result as { text?: string })?.text ?? ''
        if (text.trim()) setInterimText(text)
      })
      rec.on('partialresult', (msg) => {
        const partial = (msg.result as { partial?: string })?.partial ?? ''
        if (partial.trim()) setInterimText(partial)
      })
      voskRecRef.current = rec
    })

    // 6. Flush accumulated audio to main every CHUNK_FLUSH_MS for Whisper buffer
    flushTimerRef.current = setInterval(async () => {
      const chunks = accumulatorRef.current.splice(0)
      if (chunks.length === 0) return
      const merged = mergeFloat32(chunks)
      const int16 = toInt16(merged)
      await window.electron.speech.sendChunk(int16.buffer)
    }, CHUNK_FLUSH_MS)

    // State change comes from main process via onStateChange event
  }, [state, sessionId, onError, ensureVosk])

  // ── stopRecording ─────────────────────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    if (state !== 'recording') return

    // Capture Vosk interim text before cleanup clears it.
    // In MAS builds, Whisper is disabled and speech:final never fires —
    // we use this as the final result so Convert & Send actually inserts text.
    const lastVoskText = interimTextRef.current

    // Flush remaining audio
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current)
      flushTimerRef.current = null
    }
    const remaining = accumulatorRef.current.splice(0)
    if (remaining.length > 0) {
      const int16 = toInt16(mergeFloat32(remaining))
      await window.electron.speech.sendChunk(int16.buffer)
    }

    cleanupAudio()

    // MAS: Whisper is disabled in the sandbox — fire onFinal with Vosk text
    // BEFORE calling speech.stop() so pendingInsert is set before the idle
    // stateChange arrives (keeps the panel open in review mode).
    const isMas = await window.electron.app.isMas()
    if (isMas && lastVoskText.trim()) {
      setInterimText('')
      onFinalRef.current(lastVoskText.trim())
    }

    await window.electron.speech.stop()
    // setState will be driven by onStateChange events from main process
  }, [state])

  return { state, interimText, startRecording, stopRecording }
}

// ── Audio utilities ───────────────────────────────────────────────────────────

function downsample(input: Float32Array, fromRate: number): Float32Array {
  const ratio = fromRate / TARGET_SAMPLE_RATE
  const length = Math.round(input.length / ratio)
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const pos = i * ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    const a = input[idx] ?? 0
    const b = input[idx + 1] ?? a
    out[i] = a + frac * (b - a) // linear interpolation
  }
  return out
}

function toInt16(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function mergeFloat32(arrays: Float32Array[]): Float32Array {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.length
  }
  return out
}
