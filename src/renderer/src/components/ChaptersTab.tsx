import React, { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Book, Chapter, ContentKind, Act } from '../types'
import { useBookStore } from '../store/bookStore'
import { useUIStore } from '../store/uiStore'
import ChapterEditor from './ChapterEditor'
import ActEditor from './ActEditor'
import SnapshotDialog from './SnapshotDialog'
import { PrintPreviewModal } from './PrintPreviewModal'

// ─── Section membership ────────────────────────────────────────────────────────

const FRONT_MATTER: ContentKind[] = ['half-title', 'title-page', 'copyright', 'dedication', 'toc']
const BODY_MATTER: ContentKind[] = ['chapter', 'part-break']
const BACK_MATTER: ContentKind[] = ['appendix', 'glossary', 'bibliography', 'index', 'author-bio']

const KIND_LABELS: Record<ContentKind, string> = {
  'half-title': 'Half Title',
  'title-page': 'Title Page',
  copyright: 'Copyright Page',
  dedication: 'Dedication',
  toc: 'Table of Contents',
  chapter: 'Chapter',
  'part-break': 'Part / Section Break',
  appendix: 'Appendix',
  glossary: 'Glossary',
  bibliography: 'Bibliography',
  index: 'Index',
  'author-bio': 'Author Bio',
}

const ADD_MENU: { section: string; kinds: ContentKind[] }[] = [
  { section: 'Front Matter', kinds: FRONT_MATTER },
  { section: 'Body Matter', kinds: BODY_MATTER },
  { section: 'Back Matter', kinds: BACK_MATTER },
]

function getSection(kind?: ContentKind): 0 | 1 | 2 {
  if (!kind || BODY_MATTER.includes(kind)) return 1
  if (FRONT_MATTER.includes(kind)) return 0
  return 2
}

// ─── Helper functions ──────────────────────────────────────────────────────────

function getNextChapterTitle(chapters: Chapter[]): string {
  const body = chapters.filter((c) => !c.kind || c.kind === 'chapter')
  let max = 0
  for (const c of body) {
    const m = c.title.match(/^Chapter\s+(\d+)/i)
    if (m) max = Math.max(max, parseInt(m[1]))
  }
  return `Chapter ${max + 1}`
}

function getNextOrder(kind: ContentKind, chapters: Chapter[]): number {
  const sec = getSection(kind)
  const same = chapters.filter((c) => getSection(c.kind) === sec)
  return same.length > 0 ? Math.max(...same.map((c) => c.order)) + 1 : 0
}

function renumberChapters(sectionItems: Chapter[]): Chapter[] {
  let n = 0
  return sectionItems.map((c) => {
    if (c.kind && c.kind !== 'chapter') return c
    n++
    const newTitle = c.title.replace(/^Chapter\s+\d+/i, `Chapter ${n}`)
    return newTitle !== c.title ? { ...c, title: newTitle } : c
  })
}

// ─── ProseMirror JSON helpers ──────────────────────────────────────────────────

function pmText(text: string): object {
  return { type: 'text', text }
}
function pmPara(text: string): object {
  return { type: 'paragraph', content: [pmText(text)] }
}
function pmHeading(level: 1 | 2 | 3, text: string): object {
  return { type: 'heading', attrs: { level }, content: [pmText(text)] }
}
function pmDoc(nodes: object[]): object {
  return { type: 'doc', content: nodes }
}

function generateTOC(chapters: Chapter[]): object {
  const items = [...chapters]
    .filter((c) => !c.kind || c.kind === 'chapter' || c.kind === 'part-break')
    .sort((a, b) => a.order - b.order)
  return pmDoc([
    pmHeading(1, 'Table of Contents'),
    ...items.map((c) => pmPara(c.title)),
  ])
}

function getTemplateContent(kind: ContentKind, book: Book, chapters: Chapter[]): object {
  const year = new Date().getFullYear()
  const title = book.name
  const author = book.author ?? '[Author Name]'
  switch (kind) {
    case 'half-title':
      return pmDoc([pmHeading(1, title)])
    case 'title-page':
      return pmDoc([pmHeading(1, title), pmPara(`by ${author}`)])
    case 'copyright':
      return pmDoc([
        pmPara(`Copyright © ${year} ${author}`),
        pmPara('All rights reserved.'),
        pmPara(
          'No part of this publication may be reproduced, distributed, or transmitted in any form or by any means without the prior written permission of the publisher.'
        ),
        pmPara('ISBN: [ISBN-13]'),
        pmPara('First published [Year]'),
      ])
    case 'dedication':
      return pmDoc([pmPara('For [Dedicatee],'), pmPara('[Dedication message]')])
    case 'toc':
      return generateTOC(chapters)
    case 'chapter':
      return pmDoc([pmHeading(1, getNextChapterTitle(chapters))])
    case 'part-break':
      return pmDoc([pmHeading(1, 'Part I'), pmPara('[Part subtitle or epigraph]')])
    case 'appendix':
      return pmDoc([pmHeading(1, 'Appendix')])
    case 'glossary':
      return pmDoc([pmHeading(1, 'Glossary'), pmPara('[Term]: [Definition]')])
    case 'bibliography':
      return pmDoc([pmHeading(1, 'Bibliography')])
    case 'index':
      return pmDoc([pmHeading(1, 'Index')])
    case 'author-bio':
      return pmDoc([pmHeading(1, 'About the Author'), pmPara(`${author} is…`)])
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ChaptersTab(): React.JSX.Element {
  const { currentBook, chapters, acts, saveChapter, saveManyChapters, deleteChapter, saveAct } = useBookStore()
  const { activeChapterId, setActiveChapter } = useUIStore()

  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [actPickerOpen, setActPickerOpen] = useState(false)
  const [pendingKind, setPendingKind] = useState<ContentKind | null>(null)
  const [activeActId, setActiveActId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showPrintPreview, setShowPrintPreview] = useState(false)

  const addMenuRef = useRef<HTMLDivElement>(null)

  // Close add-menu when clicking outside
  useEffect(() => {
    if (!showAddMenu) return
    const handler = (e: MouseEvent): void => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAddMenu])

  if (!currentBook) return <></>

  const structureLabel = (currentBook.style?.structureLabel ?? 'act') as 'act' | 'section'
  const structureLabelCap = structureLabel === 'section' ? 'Section' : 'Act'

  // Group and sort by section
  const frontMatter = chapters
    .filter((c) => getSection(c.kind) === 0)
    .sort((a, b) => a.order - b.order)
  const bodyMatter = chapters
    .filter((c) => getSection(c.kind) === 1)
    .sort((a, b) => a.order - b.order)
  const backMatter = chapters
    .filter((c) => getSection(c.kind) === 2)
    .sort((a, b) => a.order - b.order)

  const activeChapter =
    chapters.find((c) => c.id === activeChapterId) ??
    bodyMatter[0] ??
    frontMatter[0] ??
    null

  // ── Actions ────────────────────────────────────────────────────────────────

  const sortedActsForPicker = [...acts].sort((a, b) => a.order - b.order)

  const createChapter = async (kind: ContentKind, actId?: string): Promise<void> => {
    const title = kind === 'chapter' ? getNextChapterTitle(chapters) : KIND_LABELS[kind]
    const order = getNextOrder(kind, chapters)
    const content = getTemplateContent(kind, currentBook!, chapters)
    const chapter: Chapter = {
      id: uuidv4(),
      bookId: currentBook!.id,
      title, order, kind,
      summary: '', content, wordCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(actId ? { actId } : {}),
    }
    await saveChapter(chapter)
    setActiveChapter(chapter.id)
  }

  const createAct = async (): Promise<Act> => {
    const now = new Date().toISOString()
    const act: Act = {
      id: uuidv4(),
      bookId: currentBook!.id,
      title: `${structureLabelCap} ${sortedActsForPicker.length + 1}`,
      summary: '', order: sortedActsForPicker.length,
      createdAt: now, updatedAt: now,
    }
    await saveAct(act)
    return act
  }

  const addContent = async (kind: ContentKind): Promise<void> => {
    setShowAddMenu(false)
    if (BODY_MATTER.includes(kind)) {
      if (acts.length === 0) {
        const act = await createAct()
        await createChapter(kind, act.id)
      } else {
        setPendingKind(kind)
        setActPickerOpen(true)
      }
      return
    }
    await createChapter(kind)
  }

  const handleAddAct = async (): Promise<void> => {
    setShowAddMenu(false)
    await createAct()
  }

  const handleActPick = async (actId: string | 'new'): Promise<void> => {
    if (!pendingKind) return
    setActPickerOpen(false)
    const targetActId = actId === 'new' ? (await createAct()).id : actId
    await createChapter(pendingKind, targetActId)
    setPendingKind(null)
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm('Delete this item? This cannot be undone.')) return
    await deleteChapter(id)
    if (activeChapterId === id) {
      const remaining = chapters.filter((c) => c.id !== id)
      setActiveChapter(
        remaining.find((c) => getSection(c.kind) === 1)?.id ??
          remaining[0]?.id ??
          null
      )
    }
  }

  const startEdit = (chapter: Chapter): void => {
    setEditingId(chapter.id)
    setTitleDraft(chapter.title)
  }

  const commitTitle = async (chapter: Chapter): Promise<void> => {
    if (titleDraft.trim() && titleDraft.trim() !== chapter.title) {
      await saveChapter({ ...chapter, title: titleDraft.trim() })
    }
    setEditingId(null)
  }

  const handleRefreshTOC = async (toc: Chapter): Promise<void> => {
    await saveChapter({
      ...toc,
      content: generateTOC(chapters),
      updatedAt: new Date().toISOString(),
    })
  }

  const handleDrop = async (fromId: string, toId: string): Promise<void> => {
    if (fromId === toId) return
    const from = chapters.find((c) => c.id === fromId)
    const to = chapters.find((c) => c.id === toId)
    if (!from || !to) return
    if (getSection(from.kind) !== getSection(to.kind)) return

    const sectionItems = [frontMatter, bodyMatter, backMatter][getSection(from.kind)]
    const fi = sectionItems.findIndex((c) => c.id === fromId)
    const ti = sectionItems.findIndex((c) => c.id === toId)
    const arr = [...sectionItems]
    const [moved] = arr.splice(fi, 1)
    arr.splice(ti, 0, moved)

    const reordered = arr.map((c, i) => ({ ...c, order: i }))
    const renumbered = renumberChapters(reordered)
    await saveManyChapters(renumbered)
  }

  // ── Sidebar item ───────────────────────────────────────────────────────────

  const renderItem = (chapter: Chapter): React.JSX.Element => {
    const isActive = activeChapter?.id === chapter.id
    const isDragOver = dragOverId === chapter.id && dragId !== chapter.id

    return (
      <div
        key={chapter.id}
        draggable
        onDragStart={() => setDragId(chapter.id)}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOverId(chapter.id)
        }}
        onDragEnd={() => {
          setDragId(null)
          setDragOverId(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragId) handleDrop(dragId, chapter.id)
          setDragId(null)
          setDragOverId(null)
        }}
        onClick={() => { setActiveChapter(chapter.id); setActiveActId(null) }}
        className={`group relative flex items-center gap-1 px-2 py-1.5 mx-1 rounded-lg cursor-pointer select-none transition-colors ${
          isActive
            ? 'bg-[var(--bg-amber)] text-[#b45309]'
            : 'text-[var(--fg)] hover:bg-[var(--bg-subtle)]'
        } ${isDragOver ? 'ring-1 ring-[#d97706] ring-inset' : ''}`}
      >
        {/* Drag handle indicator */}
        <span className="text-[#d4cec8] flex-shrink-0 cursor-grab text-[10px]">⠿</span>

        {/* Title or inline edit */}
        {editingId === chapter.id ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => commitTitle(chapter)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle(chapter)
              if (e.key === 'Escape') setEditingId(null)
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 text-xs bg-[var(--bg-card)] border border-[#d97706] rounded px-1 py-0.5 outline-none text-[var(--fg)]"
          />
        ) : (
          <span
            className={`flex-1 min-w-0 text-xs truncate ${isActive ? 'font-semibold' : 'font-normal'}`}
            onDoubleClick={(e) => {
              e.stopPropagation()
              startEdit(chapter)
            }}
          >
            {chapter.title}
          </span>
        )}

        {/* Word count badge */}
        {chapter.wordCount > 0 && editingId !== chapter.id && (
          <span className="text-[9px] text-[var(--fg-faint)] flex-shrink-0">
            {chapter.wordCount.toLocaleString()}w
          </span>
        )}

        {/* TOC refresh button */}
        {chapter.kind === 'toc' && editingId !== chapter.id && (
          <button
            title="Refresh Table of Contents from chapters"
            onClick={(e) => {
              e.stopPropagation()
              handleRefreshTOC(chapter)
            }}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-[var(--fg-faint)] hover:text-[#d97706] transition-opacity"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
          </button>
        )}

        {/* Delete button */}
        {editingId !== chapter.id && (
          <button
            title="Delete"
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(chapter.id)
            }}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-[var(--fg-faint)] hover:text-red-400 transition-opacity"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </div>
    )
  }

  // ── Section header ─────────────────────────────────────────────────────────

  const renderSection = (label: string, items: Chapter[]): React.JSX.Element | null => {
    if (items.length === 0) return null
    return (
      <div key={label} className="mb-1">
        <p className="px-3 pt-2 pb-0.5 text-[9px] font-semibold tracking-widest text-[var(--fg-faint)] uppercase select-none">
          {label}
        </p>
        {items.map(renderItem)}
      </div>
    )
  }

  const renderBodyMatter = (): React.JSX.Element | null => {
    const sortedActs: Act[] = [...acts].sort((a, b) => a.order - b.order)
    if (bodyMatter.length === 0 && sortedActs.length === 0) return null

    // No acts — fall back to flat list
    if (sortedActs.length === 0) {
      return renderSection('Body Matter', bodyMatter)
    }

    const ungrouped = bodyMatter.filter(
      (c) => !c.actId || !acts.find((a) => a.id === c.actId)
    )

    return (
      <div className="mb-1">
        <p className="px-3 pt-2 pb-0.5 text-[9px] font-semibold tracking-widest text-[var(--fg-faint)] uppercase select-none">
          Body Matter
        </p>
        {sortedActs.map((act, idx) => {
          const actChapters = bodyMatter.filter((c) => c.actId === act.id)
          const isActActive = activeActId === act.id
          return (
            <div key={act.id}>
              <button
                onClick={() => setActiveActId(isActActive ? null : act.id)}
                className={`w-full text-left px-3 pt-2 pb-1 text-[9px] font-medium tracking-wider flex items-center gap-1 transition-colors rounded-lg mx-1 ${
                  isActActive
                    ? 'bg-[var(--bg-amber)] text-[#b45309]'
                    : 'text-[#d97706]/80 hover:bg-[var(--bg-subtle)]'
                }`}
                style={{ width: 'calc(100% - 8px)' }}
              >
                <span className="font-bold">{structureLabelCap} {idx + 1}</span>
                {act.title && act.title !== `${structureLabelCap} ${idx + 1}` && (
                  <span className={isActActive ? 'text-[#b45309]/70' : 'text-[var(--fg-faint)]'}>· {act.title}</span>
                )}
              </button>
              {actChapters.length === 0 && (
                <p className="px-3 py-1 text-[10px] text-[var(--fg-faint)] italic select-none">No chapters yet</p>
              )}
              {actChapters.map(renderItem)}
            </div>
          )
        })}
        {ungrouped.length > 0 && (
          <div>
            <p className="px-3 pt-2 pb-0.5 text-[9px] font-medium tracking-wider text-[var(--fg-faint)] select-none">
              Ungrouped
            </p>
            {ungrouped.map(renderItem)}
          </div>
        )}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* ── Sidebar ── */}
      <div className={`relative flex-shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--bg)] overflow-hidden transition-all duration-250 ease-in-out ${sidebarCollapsed ? 'w-4' : 'w-52'}`}>
        <div className={`w-52 flex flex-col flex-1 min-h-0 transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {/* Add Content + Save Snapshot */}
        <div className="flex-shrink-0 border-b border-[var(--border)]">
        <div className="relative p-2 pb-1" ref={addMenuRef}>
          <button
            onClick={() => setShowAddMenu((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d97706] text-white text-xs font-semibold hover:bg-[#b45309] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
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
            Add Content
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
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {showAddMenu && (
            <div className="absolute top-full left-2 right-2 mt-1 z-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg py-1 overflow-hidden">
              <button
                onClick={handleAddAct}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-[#d97706] hover:bg-[var(--bg-amber)] transition-colors"
              >
                + {structureLabelCap}
              </button>
              <div className="mx-2 my-1 border-t border-[var(--border)]" />
              {ADD_MENU.map(({ section, kinds }) => (
                <div key={section}>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-widest text-[var(--fg-muted)] uppercase select-none">
                    {section}
                  </p>
                  {kinds.map((kind) => (
                    <button
                      key={kind}
                      onClick={() => addContent(kind)}
                      className="w-full text-left px-3 py-1.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-amber)] hover:text-[#b45309] transition-colors"
                    >
                      {KIND_LABELS[kind]}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save Snapshot button */}
        <div className="px-2 pb-2">
          <button
            onClick={() => setShowSnapshotDialog(true)}
            title="Save a named snapshot of all chapters"
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--fg-muted)] text-xs font-medium hover:bg-[var(--bg-subtle)] hover:border-[#d97706]/50 hover:text-[#d97706] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
            Save Snapshot
          </button>
        </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto py-1">
          {chapters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <p className="text-xs text-[var(--fg-faint)]">No content yet.</p>
              <p className="text-xs text-[var(--fg-faint)] mt-0.5">Click "Add Content" to begin.</p>
            </div>
          ) : (
            <>
              {renderSection('Front Matter', frontMatter)}
              {renderBodyMatter()}
              {renderSection('Back Matter', backMatter)}
            </>
          )}
        </div>

        {/* Read & Export — pinned output action */}
        <div className="flex-shrink-0 border-t border-[var(--border)] p-2">
          <button
            onClick={() => setShowPrintPreview(true)}
            title="Read & Export — read your manuscript and export"
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--fg)] text-[var(--bg)] text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            Read &amp; Export
          </button>
        </div>
        </div>
      </div>

      {/* ── Editor panel ── */}
      <div className="flex-1 min-w-0 relative flex bg-[var(--bg-card)]">
        {/* Read & Export fallback when sidebar is collapsed */}
        {sidebarCollapsed && (
          <button
            onClick={() => setShowPrintPreview(true)}
            title="Read & Export — read your manuscript and export"
            className="absolute bottom-3 left-1 z-20 w-7 h-7 flex items-center justify-center rounded-md bg-[var(--fg)] text-[var(--bg)] shadow-sm hover:opacity-90 transition-opacity"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        )}
        <button
          onClick={() => setSidebarCollapsed(v => !v)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-all duration-150 group"
          style={{ left: -10, zIndex: 20 }}
        >
          <div className="flex items-center justify-center w-[18px] h-9 rounded-full bg-[var(--bg-card)] border border-[var(--border)] shadow-sm group-hover:border-[var(--accent)]/60 group-hover:shadow-md transition-all duration-150">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-muted)] group-hover:text-[#d97706] transition-colors">
              {sidebarCollapsed ? <path d="m9 18 6-6-6-6" /> : <path d="m15 18-6-6 6-6" />}
            </svg>
          </div>
        </button>
        <div className="flex-1 overflow-hidden w-full h-full flex flex-col">
        {activeActId && acts.find(a => a.id === activeActId) ? (
          <ActEditor
            key={activeActId}
            act={acts.find(a => a.id === activeActId)!}
            actIndex={sortedActsForPicker.findIndex(a => a.id === activeActId) + 1}
            structureLabel={structureLabel}
            onSave={async (updated) => { await saveAct(updated) }}
          />
        ) : activeChapter ? (
          <ChapterEditor key={activeChapter.id} chapter={activeChapter} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d97706"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" x2="12" y1="18" y2="12" />
                <line x1="9" x2="15" y1="15" y2="15" />
              </svg>
            </div>
            <p className="text-[var(--fg)] font-medium">No content yet</p>
            <p className="text-sm text-[var(--fg-muted)] mt-1 mb-5">
              Use "Add Content" to create your first page
            </p>
            <button
              onClick={() => setShowAddMenu(true)}
              className="px-4 py-2 rounded-xl bg-[#d97706] text-white text-sm font-medium hover:bg-[#b45309] transition-colors"
            >
              Add Content
            </button>
          </div>
        )}
        </div>
      </div>

      {showPrintPreview && (
        <PrintPreviewModal onClose={() => setShowPrintPreview(false)} />
      )}

      {showSnapshotDialog && (
        <SnapshotDialog
          bookId={currentBook.id}
          chapters={chapters}
          onClose={() => setShowSnapshotDialog(false)}
          onSaved={() => setShowSnapshotDialog(false)}
        />
      )}

      {/* Act picker overlay */}
      {actPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setActPickerOpen(false)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-xl p-4 w-56"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-[var(--fg)] mb-3">Add chapter to…</p>
            {sortedActsForPicker.map((act, idx) => (
              <button
                key={act.id}
                onClick={() => handleActPick(act.id)}
                className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-[var(--fg)] hover:bg-[var(--bg-amber)] hover:text-[#b45309] transition-colors mb-1"
              >
                {structureLabelCap} {idx + 1}{act.title ? ` · ${act.title}` : ''}
              </button>
            ))}
            <div className="my-2 border-t border-[var(--border)]" />
            <button
              onClick={() => handleActPick('new')}
              className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-[#d97706] hover:bg-[var(--bg-amber)] transition-colors"
            >
              + New {structureLabelCap}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
