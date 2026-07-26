import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { Snapshot, Chapter } from '../types'

interface SnapshotState {
  snapshots: Snapshot[]
  isLoading: boolean
  isSaving: boolean
  loadSnapshots: (bookId: string) => Promise<void>
  createSnapshot: (bookId: string, name: string, chapters: Chapter[]) => Promise<void>
  deleteSnapshot: (snapshotId: string, bookId: string) => Promise<void>
  restoreSnapshot: (
    bookId: string,
    snapshot: Snapshot,
    currentChapters: Chapter[],
    onAfterRestore: () => Promise<void>
  ) => Promise<void>
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshots: [],
  isLoading: false,
  isSaving: false,

  loadSnapshots: async (bookId) => {
    set({ isLoading: true })
    try {
      const snapshots = await window.electron.snapshots.list(bookId)
      set({ snapshots })
    } finally {
      set({ isLoading: false })
    }
  },

  createSnapshot: async (bookId, name, chapters) => {
    set({ isSaving: true })
    try {
      const snapshot: Snapshot = {
        id: uuidv4(),
        bookId,
        name,
        createdAt: new Date().toISOString(),
        chapters,
        totalWordCount: chapters.reduce((s, c) => s + (c.wordCount ?? 0), 0),
        chapterCount: chapters.length,
      }
      await window.electron.snapshots.save(snapshot)
      set((state) => ({ snapshots: [snapshot, ...state.snapshots] }))
    } finally {
      set({ isSaving: false })
    }
  },

  deleteSnapshot: async (snapshotId, bookId) => {
    await window.electron.snapshots.delete(snapshotId, bookId)
    set((state) => ({ snapshots: state.snapshots.filter((s) => s.id !== snapshotId) }))
  },

  restoreSnapshot: async (bookId, snapshot, currentChapters, onAfterRestore) => {
    // 1. Auto-backup current content before restoring
    await get().createSnapshot(
      bookId,
      `Auto-save before restore — ${formatSnapshotDateTime(new Date())}`,
      currentChapters
    )
    // 2. Replace chapter files on disk
    await window.electron.snapshots.restore(
      bookId,
      snapshot.chapters,
      currentChapters.map((c) => c.id)
    )
    // 3. Caller reloads chapters and navigates
    await onAfterRestore()
  },
}))

export function formatSnapshotDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatSnapshotDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
