import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useBookStore } from '../store/bookStore'
import { useUIStore } from '../store/uiStore'
import { Book } from '../types'
import { BOOK_FORMATS, DEFAULT_FORMAT_KEY } from '../constants/bookFormats'

export default function NewBookPage(): React.JSX.Element {
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [format, setFormat] = useState(DEFAULT_FORMAT_KEY)
  const [saving, setSaving] = useState(false)
  const [customLocationEnabled, setCustomLocationEnabled] = useState(false)
  const [chosenParentFolder, setChosenParentFolder] = useState<string | null>(null)
  const [isMas, setIsMas] = useState(false)

  const { saveBook, setCurrentBook, loadCharacters, loadChapters } = useBookStore()

  useEffect(() => {
    window.electron.app.isMas().then(setIsMas)
  }, [])
  const { setPage, setBookTab } = useUIStore()

  const handleChooseFolder = async (): Promise<void> => {
    const folder = await window.electron.books.chooseFolder()
    if (folder) setChosenParentFolder(folder)
  }

  const handleCreate = async (): Promise<void> => {
    if (!name.trim()) return
    if (customLocationEnabled && !chosenParentFolder) return
    setSaving(true)
    const now = new Date().toISOString()

    let customPath: string | undefined
    if (customLocationEnabled && chosenParentFolder) {
      customPath = await window.electron.books.resolveCustomPath(chosenParentFolder, name.trim())
    }

    const book: Book = {
      id: uuidv4(),
      name: name.trim(),
      synopsis: synopsis.trim(),
      author: author.trim() || undefined,
      format,
      createdAt: now,
      updatedAt: now,
      wordHistory: [],
      customPath
    }
    await saveBook(book)
    setCurrentBook(book)
    await Promise.all([loadCharacters(book.id), loadChapters(book.id)])
    setBookTab('dashboard')
    setPage('book')
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      {/* Traffic light region */}
      <div className="drag-region" />

      {/* Back button */}
      <div className="px-8 pt-2 no-drag">
        <button
          onClick={() => setPage('home')}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to library
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-lg">
          <div className="mb-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-amber)] flex items-center justify-center mx-auto mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <path d="M12 6v6M9 9h6" />
              </svg>
            </div>
            <h1 className="text-2xl font-serif font-bold text-[var(--fg)]">Start a new book</h1>
            <p className="text-sm text-[var(--fg-muted)] mt-1">Give your story a name and a brief synopsis</p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[var(--fg)] mb-1.5">
                Book title <span className="text-[var(--accent)]">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. The Lost Garden"
                className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)] transition-all text-base"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--fg)] mb-1.5">
                Author
                <span className="text-[var(--fg-faint)] font-normal ml-1">(optional)</span>
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Jane Austen"
                className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)] transition-all text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--fg)] mb-1.5">
                Synopsis
                <span className="text-[var(--fg-faint)] font-normal ml-1">(optional)</span>
              </label>
              <textarea
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value)}
                placeholder="A brief description of your story — the premise, themes, or what it's about..."
                rows={5}
                className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)] transition-all text-sm resize-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--fg)] mb-1.5">
                Page Format
                <span className="text-[var(--fg-faint)] font-normal ml-1">(optional)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(BOOK_FORMATS).map(([key, fmt]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFormat(key)}
                    className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${
                      format === key
                        ? 'border-[var(--accent)] bg-[var(--bg-amber)]'
                        : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg)]'
                    }`}
                  >
                    <span
                      className={`block text-sm font-medium ${format === key ? 'text-[var(--accent-hover)]' : 'text-[var(--fg)]'}`}
                    >
                      {fmt.name}
                    </span>
                    <span className="block text-xs text-[var(--fg-faint)] mt-0.5">
                      {fmt.widthIn} × {fmt.heightIn}&thinsp;in
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Save Location — hidden in MAS builds (security-scoped bookmarks not implemented) */}
            {!isMas && <div>
              <label className="block text-sm font-medium text-[var(--fg)] mb-1.5">
                Save Location
                <span className="text-[var(--fg-faint)] font-normal ml-1">(optional)</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (customLocationEnabled) {
                      setCustomLocationEnabled(false)
                      setChosenParentFolder(null)
                    } else {
                      setCustomLocationEnabled(true)
                    }
                  }}
                  className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                    customLocationEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                  }`}
                  aria-checked={customLocationEnabled}
                  role="switch"
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      customLocationEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-[var(--fg-muted)]">
                  {customLocationEnabled ? 'Save to a custom folder' : 'Save to default Lekhanam folder'}
                </span>
              </div>

              {customLocationEnabled && (
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm truncate min-w-0">
                    <span className={chosenParentFolder ? 'text-[var(--fg)]' : 'text-[var(--fg-faint)]'}>
                      {chosenParentFolder
                        ? `${chosenParentFolder}/${name.trim() || '<Book Title>'}`
                        : 'No folder chosen'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleChooseFolder}
                    className="flex-shrink-0 px-4 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
                  >
                    Browse…
                  </button>
                </div>
              )}

              {customLocationEnabled && chosenParentFolder && (
                <p className="mt-1.5 text-xs text-[var(--fg-faint)]">
                  A hidden backup folder will be created automatically alongside your book folder.
                </p>
              )}
            </div>}

            <button
              onClick={handleCreate}
              disabled={!name.trim() || saving || (customLocationEnabled && !chosenParentFolder)}
              className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-semibold text-base hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {saving ? 'Creating…' : 'Create Book'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
