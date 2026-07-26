import { useCallback, useEffect } from 'react'
import { useAiStore } from '../../store/aiStore'

export function useModelActions(): {
  loadModel: (id: string) => Promise<void>
  unloadModel: () => Promise<void>
  downloadModel: (id: string) => Promise<void>
  cancelDownload: () => Promise<void>
} {
  const {
    loadedModelId,
    loadingId,
    downloadingId,
    setLoadedModelId,
    setLoadingId,
    setDownloadingId,
    setDownloadPercent,
    setDownloadedIds,
    setError,
  } = useAiStore()

  const loadModel = useCallback(
    async (id: string) => {
      if (loadingId) return
      if (loadedModelId && loadedModelId !== id) {
        await window.electron.llama.unload()
        setLoadedModelId(null)
      }
      setLoadingId(id)
      setError(null)
      try {
        await window.electron.llama.initById(id)
        // onReady event is the sole signal that marks a model loaded.
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoadingId(null)
      }
    },
    [loadedModelId, loadingId, setLoadedModelId, setLoadingId, setError]
  )

  const unloadModel = useCallback(async () => {
    if (!loadedModelId) return
    try {
      await window.electron.llama.unload()
    } finally {
      setLoadedModelId(null)
    }
  }, [loadedModelId, setLoadedModelId])

  const downloadModel = useCallback(
    async (id: string) => {
      if (downloadingId) return
      setDownloadingId(id)
      setDownloadPercent(0)
      setError(null)
      try {
        // Main-process llama:downloadById is fire-and-forget — it returns
        // { started: true } immediately and streams progress via IPC events.
        // Do NOT clear downloadingId in a `finally` block or the UI will
        // snap back to the Download button the instant the IPC round-trip
        // resolves. onDownloadComplete / onError events are authoritative.
        await window.electron.llama.downloadById(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setDownloadingId(null)
        setDownloadPercent(0)
      }
    },
    [downloadingId, setDownloadingId, setDownloadPercent, setError]
  )

  const cancelDownload = useCallback(async () => {
    // No abort IPC exists — the main-process download continues in the background.
    // onDownloadComplete will still fire and add the id to downloadedIds.
    // This callback only hides the in-progress UI.
    setDownloadingId(null)
    setDownloadPercent(0)
  }, [setDownloadingId, setDownloadPercent])

  useEffect(() => {
    const offProgress = window.electron.llama.onProgress((p) => {
      setDownloadPercent(p.percent)
    })
    const offReady = window.electron.llama.onReady(() => {
      const id = useAiStore.getState().loadingId
      if (id) {
        setLoadedModelId(id)
        setLoadingId(null)
      }
    })
    const offError = window.electron.llama.onError((e) => {
      setError(e.message)
      setLoadingId(null)
      setDownloadingId(null)
    })
    const offDone = window.electron.llama.onDownloadComplete(() => {
      const id = useAiStore.getState().downloadingId
      if (id) {
        const current = useAiStore.getState().downloadedIds
        if (!current.includes(id)) setDownloadedIds([...current, id])
        setDownloadingId(null)
      }
    })
    return () => {
      offProgress?.()
      offReady?.()
      offError?.()
      offDone?.()
    }
  }, [setDownloadPercent, setLoadedModelId, setLoadingId, setError, setDownloadingId, setDownloadedIds])

  return { loadModel, unloadModel, downloadModel, cancelDownload }
}
