import React, { useState } from 'react'
import { ConflictInfo, ConflictFile, ConflictAction } from '../types'

interface Props {
  conflicts: ConflictInfo[]
  onClose: () => void
  onResolved: () => void
}

export default function ConflictReviewModal({ conflicts, onClose, onResolved }: Props): React.JSX.Element {
  const [resolving, setResolving] = useState<string | null>(null) // conflictPath being resolved
  const [resolved, setResolved] = useState<Set<string>>(new Set())

  const allResolved = conflicts.every(c => c.files.every(f => resolved.has(f.conflictPath)))

  const handleResolve = async (file: ConflictFile, action: ConflictAction): Promise<void> => {
    setResolving(file.conflictPath)
    try {
      await window.electron.icloud.resolveConflict(file.conflictPath, action)
      setResolved(prev => new Set([...prev, file.conflictPath]))
    } catch {
      alert('Failed to resolve conflict. Please try again.')
    } finally {
      setResolving(null)
    }
  }

  const actionLabel = (action: ConflictAction): string => {
    switch (action) {
      case 'keepOriginal': return 'Keep original'
      case 'keepConflict': return 'Keep conflict copy'
      case 'keepBoth': return 'Keep both'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="w-[480px] max-h-[80vh] bg-[var(--bg-card)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--fg)]">iCloud Conflicts</h2>
            <p className="text-[10px] text-[var(--fg-muted)] mt-0.5">
              {conflicts.length} book{conflicts.length > 1 ? 's' : ''} with conflicting edits
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {conflicts.map((conflict) => (
            <div key={conflict.bookId}>
              <p className="text-xs font-semibold text-[var(--fg)] mb-2">{conflict.bookName}</p>
              <div className="space-y-2">
                {conflict.files.map((file) => {
                  const isResolved = resolved.has(file.conflictPath)
                  const isResolving = resolving === file.conflictPath
                  return (
                    <div
                      key={file.conflictPath}
                      className="rounded-xl p-3"
                      style={{
                        background: 'var(--bg-subtle)',
                        border: `1px solid ${isResolved ? 'var(--accent)' : 'var(--border)'}`,
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-medium text-[var(--fg)]">{file.relPath}</p>
                        {isResolved && (
                          <span className="text-[9px] font-semibold text-[var(--accent)]">Resolved</span>
                        )}
                        <p className="text-[9px] text-[var(--fg-faint)]">Conflict: {file.conflictDate}</p>
                      </div>
                      {!isResolved && (
                        <div className="flex gap-1.5 flex-wrap">
                          {(['keepOriginal', 'keepConflict', 'keepBoth'] as ConflictAction[]).map((action) => (
                            <button
                              key={action}
                              onClick={() => handleResolve(file, action)}
                              disabled={!!isResolving}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors disabled:opacity-50"
                              style={{
                                background: action === 'keepBoth' ? 'var(--accent)' : 'var(--bg-card)',
                                color: action === 'keepBoth' ? 'white' : 'var(--fg-muted)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {isResolving ? '…' : actionLabel(action)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)]">
          <button
            onClick={allResolved ? onResolved : onClose}
            className="w-full py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: allResolved ? 'var(--accent)' : 'var(--bg-subtle)',
              color: allResolved ? 'white' : 'var(--fg-muted)',
            }}
          >
            {allResolved ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
