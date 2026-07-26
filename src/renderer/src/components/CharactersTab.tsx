import React, { useState } from 'react'
import { Character } from '../types'
import { useBookStore } from '../store/bookStore'
import CharacterForm from './CharacterForm'

export default function CharactersTab(): React.JSX.Element {
  const { currentBook, characters, deleteCharacter } = useBookStore()
  const [showForm, setShowForm] = useState(false)
  const [editingChar, setEditingChar] = useState<Character | undefined>()
  const [search, setSearch] = useState('')

  if (!currentBook) return <></>

  const openNew = (): void => {
    setEditingChar(undefined)
    setShowForm(true)
  }

  const openEdit = (char: Character): void => {
    setEditingChar(char)
    setShowForm(true)
  }

  const handleDelete = async (charId: string): Promise<void> => {
    if (window.confirm('Delete this character?')) {
      await deleteCharacter(charId)
    }
  }

  if (showForm) {
    return (
      <div className="h-full">
        <CharacterForm
          initial={editingChar}
          bookId={currentBook.id}
          onClose={() => setShowForm(false)}
        />
      </div>
    )
  }

  const filtered = characters.filter((c) => {
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || (c.role ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-semibold text-[var(--fg)]">
          Characters{' '}
          <span className="text-base font-normal text-[var(--fg-muted)]">({characters.length})</span>
        </h2>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white font-medium text-sm hover:bg-[var(--accent-hover)] transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          Add Character
        </button>
      </div>

      {characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-center mb-4">
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
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <p className="text-base font-semibold text-[var(--fg)]">No characters yet</p>
          <p className="text-sm text-[var(--fg-muted)] mt-1 mb-5 max-w-xs">
            Add the people who make your story come alive
          </p>
          <button
            onClick={openNew}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            Add your first character
          </button>
        </div>
      ) : (
        <>
          {/* Quick Search */}
          <div className="relative mb-6 max-w-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#a8a29e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--fg-faint)] text-center py-12">
              No characters match &ldquo;{search}&rdquo;
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
              {filtered.map((char) => (
                <CharacterCard
                  key={char.id}
                  character={char}
                  onEdit={() => openEdit(char)}
                  onDelete={() => handleDelete(char.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CharacterCard({
  character,
  onEdit,
  onDelete
}: {
  character: Character
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  const initial = character.name.charAt(0).toUpperCase()
  return (
    <div className="group relative rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:shadow-md transition-all">
      {/* Photo */}
      <div
        className="h-40 bg-[var(--bg-subtle)] flex items-center justify-center cursor-pointer"
        onClick={onEdit}
      >
        {character.photoDataUrl ? (
          <img src={character.photoDataUrl} alt={character.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl font-serif font-bold text-[var(--accent)] opacity-40">{initial}</span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 cursor-pointer" onClick={onEdit}>
        <p className="font-semibold text-[var(--fg)] text-sm truncate">{character.name}</p>
        {character.gender && (
          <p className="text-xs text-[var(--fg-muted)] mt-0.5">{character.gender}</p>
        )}
        {character.role && (
          <span className="inline-block mt-1.5 text-[10px] font-semibold text-[var(--accent)] bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
            {character.role}
          </span>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-white/80 backdrop-blur rounded-full w-6 h-6 flex items-center justify-center text-[var(--fg-muted)] hover:text-red-500 transition-all shadow-sm"
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
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  )
}
