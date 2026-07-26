import React, { useState, useEffect, useRef, useCallback } from 'react'
import { VOSK_MODELS } from '../utils/voskModels'
import { useUIStore } from '../store/uiStore'

interface DownloadState {
  [id: string]: { downloading: boolean; percent: number }
}

export default function VoskLanguageSelector(): React.JSX.Element {
  const { speechLanguage, setSpeechLanguage } = useUIStore()
  const [open, setOpen] = useState(false)
  const [downloadedFiles, setDownloadedFiles] = useState<Set<string>>(new Set())
  const [downloads, setDownloads] = useState<DownloadState>({})
  const panelRef = useRef<HTMLDivElement>(null)

  const refreshModels = useCallback(async () => {
    const { userFiles, bundledFiles } = await window.electron.speech.listVoskModels()
    setDownloadedFiles(new Set([...userFiles, ...bundledFiles]))
  }, [])

  useEffect(() => {
    refreshModels()
  }, [refreshModels])

  // Subscribe to download progress
  useEffect(() => {
    const unsub = window.electron.speech.onVoskDownloadProgress((p) => {
      setDownloads((prev) => ({ ...prev, [p.id]: { downloading: p.percent < 100, percent: p.percent } }))
      if (p.percent >= 100) {
        refreshModels()
        setDownloads((prev) => {
          const next = { ...prev }
          delete next[p.id]
          return next
        })
      }
    })
    return unsub
  }, [refreshModels])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleDownload = async (id: string, url: string, filename: string): Promise<void> => {
    setDownloads((prev) => ({ ...prev, [id]: { downloading: true, percent: 0 } }))
    await window.electron.speech.downloadVoskModel(id, url, filename)
  }

  const handleDelete = async (filename: string, id: string): Promise<void> => {
    await window.electron.speech.deleteVoskModel(filename)
    if (speechLanguage === id) setSpeechLanguage('en-us')
    await refreshModels()
  }

  const activeModel = VOSK_MODELS.find((m) => m.id === speechLanguage) ?? VOSK_MODELS[0]

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Voice language: ${activeModel.label}`}
        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors text-xs font-semibold ${
          open
            ? 'bg-[var(--bg-subtle)] text-[var(--fg)]'
            : 'text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]'
        }`}
      >
        {/* Globe icon */}
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-lg overflow-hidden"
          style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
        >
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <p className="text-[9px] uppercase tracking-widest font-semibold text-[var(--fg-faint)]">
              Voice Language
            </p>
          </div>
          <div className="py-1 max-h-72 overflow-y-auto">
            {VOSK_MODELS.map((model) => {
              const isDownloaded = downloadedFiles.has(model.filename)
              const isActive = speechLanguage === model.id
              const dl = downloads[model.id]
              const isEnglish = model.id === 'en-us' // bundled, can't delete

              return (
                <div
                  key={model.id}
                  className={`flex items-center justify-between px-3 py-2 gap-2 ${
                    isDownloaded ? 'hover:bg-[var(--bg-subtle)] cursor-pointer' : ''
                  }`}
                  onClick={() => {
                    if (isDownloaded && !dl?.downloading) {
                      setSpeechLanguage(model.id)
                      setOpen(false)
                    }
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Active checkmark */}
                    <div className="w-3 flex-shrink-0 flex items-center justify-center">
                      {isActive && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs truncate ${isActive ? 'text-[var(--fg)] font-medium' : 'text-[var(--fg-muted)]'}`}>
                        {model.label}
                      </p>
                      <p className="text-[10px] text-[var(--fg-faint)]">~{model.sizeMb} MB</p>
                    </div>
                  </div>

                  {/* Status / action */}
                  <div className="flex-shrink-0">
                    {dl?.downloading ? (
                      <div className="flex items-center gap-1">
                        <div className="w-16 h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] rounded-full transition-all"
                            style={{ width: `${dl.percent}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-[var(--fg-faint)] w-7 text-right">{dl.percent}%</span>
                      </div>
                    ) : isDownloaded ? (
                      !isEnglish && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(model.filename, model.id)
                          }}
                          title="Remove model"
                          className="w-5 h-5 flex items-center justify-center rounded text-[var(--fg-faint)] hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        </button>
                      )
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownload(model.id, model.url, model.filename)
                        }}
                        title="Download model"
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-[var(--accent)] border border-[var(--accent)]/40 hover:bg-[var(--accent)]/10 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
                        </svg>
                        Get
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="px-3 py-2 border-t border-[var(--border)]">
            <p className="text-[9px] text-[var(--fg-faint)]">
              Powered by Vosk · Models download to ~/Documents/Lekhanam/models/
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
