import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Chapter } from '../types'

// ── ProseMirror JSON helpers ──────────────────────────────────────────────────

type PmNode = { type: string; text?: string; content?: PmNode[] }

function pmExtractText(node: PmNode): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(pmExtractText).join('')
}

function pmReplace(
  node: PmNode,
  pattern: RegExp
): [PmNode, number] {
  if (node.type === 'text' && node.text) {
    const matches = node.text.match(pattern) ?? []
    const newText = node.text.replace(pattern, () => '__REPLACE_PLACEHOLDER__')
    // We return placeholder count; caller passes replacement string separately
    if (matches.length > 0) {
      return [{ ...node, text: newText }, matches.length]
    }
    return [node, 0]
  }
  if (node.content) {
    let total = 0
    const newContent = node.content.map((child) => {
      const [c, cnt] = pmReplace(child, pattern)
      total += cnt
      return c
    })
    return [{ ...node, content: newContent }, total]
  }
  return [node, 0]
}

function pmReplaceText(
  node: PmNode,
  pattern: RegExp,
  replacement: string
): [PmNode, number] {
  if (node.type === 'text' && node.text) {
    const matches = node.text.match(pattern) ?? []
    if (matches.length > 0) {
      return [{ ...node, text: node.text.replace(pattern, replacement) }, matches.length]
    }
    return [node, 0]
  }
  if (node.content) {
    let total = 0
    const newContent = node.content.map((child) => {
      const [c, cnt] = pmReplaceText(child, pattern, replacement)
      total += cnt
      return c
    })
    return [{ ...node, content: newContent }, total]
  }
  return [node, 0]
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  chapterId: string
  chapterTitle: string
  context: string
  matchStart: number
  matchEnd: number
}

interface Props {
  chapters: Chapter[]
  onSaveChapter: (chapter: Chapter) => Promise<void>
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FindReplaceModal({ chapters, onSaveChapter, onClose }: Props): React.JSX.Element {
  const [findText, setFindText]       = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [matchCase, setMatchCase]     = useState(false)
  const [results, setResults]         = useState<SearchResult[]>([])
  const [toast, setToast]             = useState('')
  const [busy, setBusy]               = useState(false)
  const findRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-focus find input on open
  useEffect(() => { findRef.current?.focus() }, [])

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const buildPattern = useCallback((text: string): RegExp | null => {
    if (!text) return null
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(escaped, matchCase ? 'g' : 'gi')
  }, [matchCase])

  const runSearch = useCallback((text: string, caseSensitive: boolean) => {
    if (!text) { setResults([]); return }
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi')

    const found: SearchResult[] = []
    for (const ch of chapters) {
      if (!ch.content) continue
      const fullText = pmExtractText(ch.content as PmNode)
      let match: RegExpExecArray | null
      pattern.lastIndex = 0
      while ((match = pattern.exec(fullText)) !== null) {
        const start = Math.max(0, match.index - 40)
        const end   = Math.min(fullText.length, match.index + match[0].length + 40)
        found.push({
          chapterId: ch.id,
          chapterTitle: ch.title,
          context: fullText.slice(start, end),
          matchStart: match.index - start,
          matchEnd: match.index - start + match[0].length,
        })
        if (found.length >= 200) break  // cap for perf
      }
    }
    setResults(found)
  }, [chapters])

  // Debounced live search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(findText, matchCase), 180)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [findText, matchCase, runSearch])

  const handleReplaceAll = async () => {
    const pattern = buildPattern(findText)
    if (!pattern || !findText) return
    setBusy(true)
    let totalCount = 0
    let chaptersChanged = 0
    for (const ch of chapters) {
      if (!ch.content) continue
      const [newContent, count] = pmReplaceText(ch.content as PmNode, pattern, replaceText)
      if (count > 0) {
        await onSaveChapter({ ...ch, content: newContent as object })
        totalCount += count
        chaptersChanged++
      }
    }
    setBusy(false)
    setToast(`Replaced ${totalCount} occurrence${totalCount !== 1 ? 's' : ''} in ${chaptersChanged} chapter${chaptersChanged !== 1 ? 's' : ''}`)
    setTimeout(() => setToast(''), 3500)
    runSearch(findText, matchCase)
  }

  // Highlight matched portion of context string
  function renderContext(result: SearchResult): React.JSX.Element {
    const { context, matchStart, matchEnd } = result
    return (
      <span className="text-[11px] text-[var(--fg-muted)]">
        {context.slice(0, matchStart)}
        <mark className="bg-[var(--bg-amber)] text-[#92400e] rounded-sm px-0.5 not-italic font-semibold">
          {context.slice(matchStart, matchEnd)}
        </mark>
        {context.slice(matchEnd)}
      </span>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-[var(--overlay-scrim)] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-enter bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-float)] w-[540px] max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)] flex-shrink-0">
          <h2 className="text-sm font-semibold text-[var(--fg)]">Find &amp; Replace</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Inputs */}
        <div className="px-5 pt-4 pb-3 flex flex-col gap-2.5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--fg-muted)] w-16 flex-shrink-0">Find</label>
            <input
              ref={findRef}
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Search all chapters…"
              className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--fg)] placeholder:text-[var(--fg-faint)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--fg-muted)] w-16 flex-shrink-0">Replace</label>
            <input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with…"
              className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--fg)] placeholder:text-[var(--fg-faint)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              <span className="text-xs text-[var(--fg-muted)]">Match case</span>
            </label>
            <span className="text-[11px] text-[var(--fg-faint)]">
              {findText ? `${results.length}${results.length >= 200 ? '+' : ''} match${results.length !== 1 ? 'es' : ''}` : ''}
            </span>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
          {results.length === 0 && findText && (
            <p className="text-xs text-[var(--fg-faint)] text-center py-8">No matches found</p>
          )}
          {results.length === 0 && !findText && (
            <p className="text-xs text-[var(--fg-faint)] text-center py-8">Type to search across all chapters</p>
          )}
          {results.map((r, i) => (
            <div key={i} className="py-2 border-b border-[var(--border)] last:border-0">
              <p className="text-[10px] font-semibold text-[var(--accent)] mb-0.5 truncate">{r.chapterTitle}</p>
              <p className="leading-snug">…{renderContext(r)}…</p>
            </div>
          ))}
        </div>

        {/* Toast */}
        {toast && (
          <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-[var(--bg-amber)] border border-[var(--border-amber)] text-xs text-[#92400e] flex-shrink-0">
            {toast}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-[10px] border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleReplaceAll}
            disabled={!findText || busy}
            className="px-3 py-1.5 text-xs rounded-[10px] bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {busy ? 'Replacing…' : 'Replace All'}
          </button>
        </div>
      </div>
    </div>
  )
}
