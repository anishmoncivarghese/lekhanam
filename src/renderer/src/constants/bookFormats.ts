export interface BookFormat {
  name: string
  widthIn: number
  heightIn: number
  useCase: string
}

export const BOOK_FORMATS: Record<string, BookFormat> = {
  'mass-market': {
    name: 'Mass Market',
    widthIn: 4.25,
    heightIn: 6.87,
    useCase: 'Pocket-sized fiction, thrillers, and airport novels.'
  },
  novella: {
    name: 'Novella',
    widthIn: 5.0,
    heightIn: 8.0,
    useCase: 'Shorter works, poetry, and small non-fiction.'
  },
  digest: {
    name: 'Digest',
    widthIn: 5.5,
    heightIn: 8.5,
    useCase: 'Memoirs, journals, and standard personal growth books.'
  },
  'trade-paperback': {
    name: 'Trade Paperback',
    widthIn: 6.0,
    heightIn: 9.0,
    useCase: 'The industry standard for fiction and general non-fiction.'
  },
  royal: {
    name: 'Royal',
    widthIn: 6.14,
    heightIn: 9.21,
    useCase: 'Premium hardcovers and traditional UK fiction.'
  },
  executive: {
    name: 'Executive',
    widthIn: 7.0,
    heightIn: 10.0,
    useCase: 'Technical manuals, workbooks, and textbooks.'
  },
  square: {
    name: 'Square',
    widthIn: 8.5,
    heightIn: 8.5,
    useCase: "Children's picture books, art books, and photography."
  },
  'us-letter': {
    name: 'US Letter',
    widthIn: 8.5,
    heightIn: 11.0,
    useCase: 'Academic papers, reports, and coloring books.'
  }
}

export const DEFAULT_FORMAT_KEY = 'trade-paperback'
