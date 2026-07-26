import { create } from 'zustand'
import { Book, Character, Chapter, Act, TrashedBook, BookTrashItem } from '../types'
import { format } from 'date-fns'

interface BookState {
  books: Book[]
  currentBook: Book | null
  characters: Character[]
  chapters: Chapter[]
  trashedBooks: TrashedBook[]

  loadBooks: () => Promise<void>
  setCurrentBook: (book: Book) => void
  saveBook: (book: Book) => Promise<void>
  deleteBook: (bookId: string) => Promise<void>
  saveCover: (bookId: string, base64: string, ext: string) => Promise<void>
  recoverBook: (bookId: string) => Promise<{ ok: boolean; reason?: string }>
  loadTrashedBooks: () => Promise<void>
  restoreFromTrash: (bookId: string) => Promise<void>
  permanentlyDeleteBook: (bookId: string) => Promise<void>

  bookTrashItems: BookTrashItem[]
  loadBookTrash: (bookId: string) => Promise<void>
  restoreChapterFromTrash: (bookId: string, chapterId: string) => Promise<void>
  restoreCharacterFromTrash: (bookId: string, charId: string) => Promise<void>
  permanentlyDeleteTrashItems: (bookId: string, itemIds: string[]) => Promise<void>

  loadCharacters: (bookId: string) => Promise<void>
  saveCharacter: (character: Character) => Promise<void>
  deleteCharacter: (charId: string) => Promise<void>

  sessionStartTotal: number
  resetSession: () => void

  loadChapters: (bookId: string) => Promise<void>
  saveChapter: (chapter: Chapter) => Promise<void>
  saveManyChapters: (chapters: Chapter[]) => Promise<void>
  deleteChapter: (chapterId: string) => Promise<void>
  updateWordHistory: (totalWords: number) => Promise<void>

  acts: Act[]
  saveAct: (act: Act) => Promise<void>
  saveManyActs: (acts: Act[]) => Promise<void>
  deleteAct: (actId: string) => Promise<void>
}

export const useBookStore = create<BookState>((set, get) => ({
  books: [],
  currentBook: null,
  characters: [],
  chapters: [],
  acts: [],
  trashedBooks: [],
  sessionStartTotal: 0,
  bookTrashItems: [],

  loadBooks: async () => {
    const books = await window.electron.books.list()
    set({ books })
  },

  setCurrentBook: (book) => set({ currentBook: book }),

  saveBook: async (book) => {
    await window.electron.books.save(book)
    const books = await window.electron.books.list()
    set({ books, currentBook: book })
  },

  deleteBook: async (bookId) => {
    await window.electron.books.delete(bookId)
    set((state) => ({
      books: state.books.filter((b) => b.id !== bookId),
      currentBook: state.currentBook?.id === bookId ? null : state.currentBook
    }))
  },

  recoverBook: async (bookId) => {
    const result = await window.electron.books.recover(bookId)
    if (result.ok) {
      const books = await window.electron.books.list()
      set({ books })
    }
    return result
  },

  loadTrashedBooks: async () => {
    const trashedBooks = await window.electron.books.trashList()
    set({ trashedBooks })
  },

  restoreFromTrash: async (bookId) => {
    await window.electron.books.restore(bookId)
    const [books, trashedBooks] = await Promise.all([
      window.electron.books.list(),
      window.electron.books.trashList()
    ])
    set({ books, trashedBooks })
  },

  permanentlyDeleteBook: async (bookId) => {
    await window.electron.books.deletePermanently(bookId)
    set((s) => ({ trashedBooks: s.trashedBooks.filter((b) => b.id !== bookId) }))
  },

  saveCover: async (bookId, base64, ext) => {
    const filename = await window.electron.books.saveCover(bookId, base64, ext)
    const { currentBook } = get()
    if (currentBook && currentBook.id === bookId) {
      const updated = { ...currentBook, coverPath: filename, coverDataUrl: base64 }
      await window.electron.books.save(updated)
      set({ currentBook: updated })
    }
  },

  loadBookTrash: async (bookId) => {
    const items = await window.electron.bookTrash.list(bookId)
    set({ bookTrashItems: items })
  },

  restoreChapterFromTrash: async (bookId, chapterId) => {
    await window.electron.bookTrash.restoreChapter(bookId, chapterId)
    const [chapters, bookTrashItems] = await Promise.all([
      window.electron.chapters.list(bookId),
      window.electron.bookTrash.list(bookId)
    ])
    set({ chapters, bookTrashItems })
  },

  restoreCharacterFromTrash: async (bookId, charId) => {
    await window.electron.bookTrash.restoreCharacter(bookId, charId)
    const [characters, bookTrashItems] = await Promise.all([
      window.electron.characters.list(bookId),
      window.electron.bookTrash.list(bookId)
    ])
    set({ characters, bookTrashItems })
  },

  permanentlyDeleteTrashItems: async (bookId, itemIds) => {
    await window.electron.bookTrash.deleteItems(bookId, itemIds)
    set((s) => ({ bookTrashItems: s.bookTrashItems.filter((i) => !itemIds.includes(i.id)) }))
  },

  loadCharacters: async (bookId) => {
    const characters = await window.electron.characters.list(bookId)
    set({ characters })
  },

  saveCharacter: async (character) => {
    await window.electron.characters.save(character)
    const { characters } = get()
    const exists = characters.find((c) => c.id === character.id)
    if (exists) {
      set({ characters: characters.map((c) => (c.id === character.id ? character : c)) })
    } else {
      set({ characters: [...characters, character] })
    }
  },

  deleteCharacter: async (charId) => {
    const { currentBook, characters } = get()
    if (!currentBook) return
    await window.electron.characters.delete(charId, currentBook.id)
    set({ characters: characters.filter((c) => c.id !== charId) })
  },

  resetSession: () => {
    const total = get().chapters.reduce((s, c) => s + (c.wordCount || 0), 0)
    set({ sessionStartTotal: total })
  },

  loadChapters: async (bookId) => {
    const [chapters, acts] = await Promise.all([
      window.electron.chapters.list(bookId),
      window.electron.acts.list(bookId)
    ])
    const sessionStartTotal = chapters.reduce((s, c) => s + (c.wordCount || 0), 0)
    set({ chapters, acts, sessionStartTotal })
  },

  saveChapter: async (chapter) => {
    await window.electron.chapters.save(chapter)
    const { chapters } = get()
    const exists = chapters.find((c) => c.id === chapter.id)
    if (exists) {
      set({ chapters: chapters.map((c) => (c.id === chapter.id ? chapter : c)) })
    } else {
      set({ chapters: [...chapters, chapter] })
    }
    // Update word history after saving chapter
    const allChapters = exists
      ? chapters.map((c) => (c.id === chapter.id ? chapter : c))
      : [...chapters, chapter]
    const total = allChapters.reduce((sum, c) => sum + (c.wordCount ?? 0), 0)
    await get().updateWordHistory(total)
  },

  saveManyChapters: async (updated) => {
    for (const ch of updated) {
      await window.electron.chapters.save(ch)
    }
    const { chapters } = get()
    const map = new Map(updated.map((c) => [c.id, c]))
    set({ chapters: chapters.map((c) => map.get(c.id) ?? c) })
  },

  deleteChapter: async (chapterId) => {
    const { currentBook, chapters } = get()
    if (!currentBook) return
    await window.electron.chapters.delete(chapterId, currentBook.id)
    set({ chapters: chapters.filter((c) => c.id !== chapterId) })
  },

  saveAct: async (act) => {
    await window.electron.acts.save(act)
    const { acts } = get()
    const exists = acts.find((a) => a.id === act.id)
    if (exists) {
      set({ acts: acts.map((a) => (a.id === act.id ? act : a)) })
    } else {
      set({ acts: [...acts, act] })
    }
  },

  deleteAct: async (actId) => {
    const { currentBook, acts } = get()
    if (!currentBook) return
    await window.electron.acts.delete(actId, currentBook.id)
    set({ acts: acts.filter((a) => a.id !== actId) })
  },

  saveManyActs: async (updated) => {
    for (const act of updated) {
      await window.electron.acts.save(act)
    }
    const { acts } = get()
    const map = new Map(updated.map((a) => [a.id, a]))
    set({ acts: acts.map((a) => map.get(a.id) ?? a) })
  },

  updateWordHistory: async (totalWords) => {
    const { currentBook } = get()
    if (!currentBook) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const history = [...(currentBook.wordHistory || [])]
    const todayIdx = history.findIndex((h) => h.date === today)
    if (todayIdx >= 0) {
      history[todayIdx] = { date: today, count: totalWords }
    } else {
      history.push({ date: today, count: totalWords })
    }
    const updated = { ...currentBook, wordHistory: history, updatedAt: new Date().toISOString() }
    await window.electron.books.save(updated)
    set({ currentBook: updated })
  }
}))
