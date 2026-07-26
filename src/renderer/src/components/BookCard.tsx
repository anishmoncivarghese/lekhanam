import React from 'react'
import { Book } from '../types'

interface Props {
  book: Book
  onClick: () => void
  onDelete: () => void
  onRecover?: () => void
}

export default function BookCard({ book, onClick, onDelete, onRecover }: Props): React.JSX.Element {
  const initial = book.name.charAt(0).toUpperCase()
  const isRecoverable = book.backupHealth === 'missing' || book.backupHealth === 'corrupted'
  const isUnrecoverable = book.backupHealth === 'unrecoverable'
  const isHealthy = !book.backupHealth || book.backupHealth === 'ok'

  return (
    <div
      className={`group relative rounded-2xl overflow-hidden border transition-all duration-200 bg-[var(--bg-card)] ${
        isUnrecoverable
          ? 'border-red-200 opacity-50 pointer-events-none cursor-default'
          : isRecoverable
          ? 'border-amber-400 shadow-[var(--shadow-card-md)] hover:shadow-[var(--shadow-card-lg)] hover:-translate-y-0.5 cursor-pointer'
          : 'border-[var(--border)] shadow-[var(--shadow-card-md)] hover:shadow-[var(--shadow-card-lg)] hover:-translate-y-0.5 cursor-pointer'
      }`}
      onClick={isHealthy ? onClick : undefined}
    >
      {/* Cover image or placeholder */}
      <div className="h-52 bg-[var(--bg-subtle)] flex items-center justify-center overflow-hidden">
        {book.coverDataUrl ? (
          <img
            src={book.coverDataUrl}
            alt={book.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-6xl font-serif font-bold text-[var(--accent)] opacity-40 select-none">
            {initial}
          </span>
        )}
      </div>

      {/* Recovery banner — shown when folder is missing or corrupted */}
      {isRecoverable && (
        <div className="absolute bottom-[72px] left-0 right-0 bg-amber-500/95 backdrop-blur-sm px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-white text-xs font-medium">
              {book.backupHealth === 'missing' ? 'Folder missing' : 'Files corrupted'}
            </span>
          </div>
          <button
            className="no-drag text-xs font-semibold bg-white text-amber-700 px-2.5 py-1 rounded-lg hover:bg-amber-50 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onRecover?.()
            }}
          >
            Recover
          </button>
        </div>
      )}

      {/* Unrecoverable overlay */}
      {isUnrecoverable && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-card)]/70">
          <span className="text-xs text-red-400 font-medium px-3 text-center">
            Data lost — cannot recover
          </span>
        </div>
      )}

      {/* Card body */}
      <div className="p-4">
        <h3 className="font-semibold text-[var(--fg)] text-base leading-tight truncate">{book.name}</h3>
        {book.synopsis && (
          <p className="mt-1 text-sm text-[var(--fg-muted)] line-clamp-2 leading-snug">{book.synopsis}</p>
        )}
        <p className="mt-2 text-xs text-[var(--fg-faint)]">
          {new Date(book.updatedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })}
        </p>
      </div>

      {/* Delete button */}
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 backdrop-blur rounded-full w-7 h-7 flex items-center justify-center text-[var(--fg-muted)] hover:text-red-500 hover:bg-[var(--bg-card)] shadow-sm no-drag"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        title="Delete book"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
      </button>
    </div>
  )
}
