import React, { useState, useRef, useEffect } from 'react'
import { BOOK_FORMATS, DEFAULT_FORMAT_KEY } from '../constants/bookFormats'
import { useBookStore } from '../store/bookStore'

export default function FormatSelector(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { currentBook, saveBook } = useBookStore()

  const activeKey = currentBook?.format ?? DEFAULT_FORMAT_KEY
  const activeFormat = BOOK_FORMATS[activeKey] ?? BOOK_FORMATS[DEFAULT_FORMAT_KEY]

  // Close on click-outside
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = async (key: string): Promise<void> => {
    if (!currentBook) return
    setOpen(false)
    await saveBook({ ...currentBook, format: key })
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Change page format"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] transition-colors border border-transparent hover:border-[var(--border)]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
        <span>{activeFormat.name}</span>
        <span className="text-[var(--fg-faint)]">
          {activeFormat.widthIn} × {activeFormat.heightIn}&thinsp;in
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden w-72">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <p className="text-xs font-semibold text-[var(--fg-faint)] uppercase tracking-wide">
              Page Format
            </p>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto">
            {Object.entries(BOOK_FORMATS).map(([key, fmt]) => {
              const isActive = key === activeKey
              return (
                <button
                  key={key}
                  onClick={() => handleSelect(key)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors ${
                    isActive
                      ? 'bg-[var(--bg-amber)]'
                      : 'hover:bg-[var(--bg)]'
                  }`}
                >
                  {/* Page icon proportional to format */}
                  <div
                    className={`shrink-0 mt-0.5 border rounded-sm ${isActive ? 'border-[var(--accent)] bg-[var(--bg-amber)]' : 'border-[#d4ccc4] bg-[var(--bg-card)]'}`}
                    style={{
                      width: `${Math.round((fmt.widthIn / 11) * 24)}px`,
                      height: `${Math.round((fmt.heightIn / 11) * 24)}px`,
                      minWidth: '10px',
                      minHeight: '10px'
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-sm font-medium ${isActive ? 'text-[var(--accent-hover)]' : 'text-[var(--fg)]'}`}
                      >
                        {fmt.name}
                      </span>
                      <span className="text-xs text-[var(--fg-faint)] shrink-0">
                        {fmt.widthIn} × {fmt.heightIn}&thinsp;in
                      </span>
                    </div>
                    <p className="text-xs text-[var(--fg-muted)] leading-snug mt-0.5">{fmt.useCase}</p>
                  </div>
                  {isActive && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 mt-1"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
