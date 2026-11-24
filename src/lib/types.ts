export type ThemeName = 'default' | 'paper' | 'night';
export type Layout = 'single' | 'double';
export type BookExt = 'epub' | 'txt';

export interface Settings {
  theme: ThemeName;
  /** Installed font family, or null to keep the book's own fonts. */
  font: string | null;
  fontSize: number;
  layout: Layout;
  /** Width of the text column as a percentage of the default. */
  pageWidth: number;
  /** Extension of the stored background image, or null for none. */
  background: string | null;
  /** Show the background behind the book while reading. */
  backgroundInReader: boolean;
  /** Window fills the screen; restored on next launch. */
  fullscreen: boolean;
}

/**
 * A reading position that survives re-pagination: the index of a block
 * element in the rendered book, plus how many pages past that element's
 * first page the position was (for very long paragraphs).
 */
export interface Anchor {
  el: number;
  skip: number;
}

export interface BookEntry {
  id: string;
  ext: BookExt;
  title: string;
  author: string;
  fileName: string;
  addedAt: number;
  lastOpened: number;
  /** 0..1 */
  progress: number;
  /** Where reading resumes; saved automatically. */
  resume: Anchor | null;
  /** The single user-placed page bookmark. */
  bookmark: Anchor | null;
  /** TOC target ids of bookmarked chapters. */
  chapterBookmarks: string[];
  hasCover: boolean;
}

export interface TocEntry {
  label: string;
  depth: number;
  /** Element id inside the rendered book. */
  target: string;
}

export interface ParsedBook {
  title: string;
  author: string;
  css: string;
  sections: HTMLElement[];
  toc: TocEntry[];
  dispose(): void;
}

export interface BookMeta {
  title: string;
  author: string;
  cover: Blob | null;
}
