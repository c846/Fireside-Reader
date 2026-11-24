import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { backend } from './backend';
import { readMeta } from './book/parse';
import type { BookEntry, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'default',
  font: null,
  fontSize: 19,
  layout: 'single',
  pageWidth: 100,
  background: null,
  backgroundInReader: true,
  fullscreen: false,
};

export const BACKGROUND_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

class AppState {
  settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  books = $state<BookEntry[]>([]);
  fonts = $state<string[] | null>(null);
  userName = $state('');
  view = $state<'welcome' | 'dashboard' | 'reader'>('welcome');
  openBookId = $state<string | null>(null);
  settingsOpen = $state(false);
  /** Blob URL of the loaded background image. */
  backgroundUrl = $state<string | null>(null);
}

export const app = new AppState();

let markReady: () => void;
/** Resolves once settings, library and user name have loaded. */
export const ready = new Promise<void>((r) => (markReady = r));

function normalize(b: Partial<BookEntry>): BookEntry | null {
  if (!b.id || (b.ext !== 'epub' && b.ext !== 'txt')) return null;
  return {
    id: b.id,
    ext: b.ext,
    title: b.title || 'Untitled',
    author: b.author || 'Unknown author',
    fileName: b.fileName || b.title || 'Untitled',
    addedAt: b.addedAt ?? Date.now(),
    lastOpened: b.lastOpened ?? 0,
    progress: b.progress ?? 0,
    resume: b.resume ?? null,
    bookmark: b.bookmark ?? null,
    chapterBookmarks: Array.isArray(b.chapterBookmarks) ? b.chapterBookmarks : [],
    hasCover: !!b.hasCover,
  };
}

export async function initApp(): Promise<void> {
  const [name, settingsText, libraryText] = await Promise.all([
    backend.userName().catch(() => ''),
    backend.load('settings.json').catch(() => null),
    backend.load('library.json').catch(() => null),
  ]);
  app.userName = name;
  try {
    if (settingsText) app.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(settingsText) };
  } catch {
    /* keep defaults */
  }
  try {
    const data = libraryText ? JSON.parse(libraryText) : null;
    if (Array.isArray(data?.books)) {
      app.books = data.books.map(normalize).filter((b: BookEntry | null): b is BookEntry => !!b);
    }
  } catch {
    /* start with an empty shelf */
  }
  localStorage.setItem('fr-theme', app.settings.theme);
  if (app.settings.fullscreen) getCurrentWindow().setFullscreen(true).catch(() => {});
  // Load the background before the welcome screen shows so it's there from the start.
  await Promise.race([loadBackground().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  markReady();
  backend
    .listFonts()
    .then((f) => {
      app.fonts = f;
    })
    .catch(() => {
      app.fonts = [];
    });
}

// ---- persistence -----------------------------------------------------------

/** Serialises writes per file so two saves never race on the same temp file. */
const chains = new Map<string, Promise<void>>();
function write(name: string, content: string): Promise<void> {
  const next = (chains.get(name) ?? Promise.resolve())
    .then(() => backend.save(name, content))
    .catch((e) => console.error(`Saving ${name} failed`, e));
  chains.set(name, next);
  return next;
}

function debounced(name: string, snapshot: () => unknown, delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  const flush = () => {
    clearTimeout(timer);
    if (!pending) return chains.get(name) ?? Promise.resolve();
    pending = false;
    return write(name, JSON.stringify(snapshot()));
  };
  const schedule = () => {
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  };
  return { schedule, flush };
}

const librarySaver = debounced('library.json', () => ({ version: 1, books: $state.snapshot(app.books) }), 400);
const settingsSaver = debounced('settings.json', () => $state.snapshot(app.settings), 400);

export const flushLibrary = librarySaver.flush;

export async function flushAll(): Promise<void> {
  await Promise.all([librarySaver.flush(), settingsSaver.flush()]);
}

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(app.settings, patch);
  localStorage.setItem('fr-theme', app.settings.theme);
  settingsSaver.schedule();
}

export function updateBook(id: string, patch: Partial<BookEntry>): void {
  const book = app.books.find((b) => b.id === id);
  if (!book) return;
  Object.assign(book, patch);
  librarySaver.schedule();
}

// ---- covers ----------------------------------------------------------------

const covers = new Map<string, Promise<string | null>>();
export function loadCover(id: string): Promise<string | null> {
  let c = covers.get(id);
  if (!c) {
    c = backend.load(`covers/${id}.txt`).catch(() => null);
    covers.set(id, c);
  }
  return c;
}

// ---- fullscreen ----------------------------------------------------------------

export async function setFullscreen(on: boolean): Promise<void> {
  updateSettings({ fullscreen: on });
  try {
    await getCurrentWindow().setFullscreen(on);
  } catch (e) {
    console.error('Fullscreen change failed', e);
    updateSettings({ fullscreen: !on });
  }
}

export const toggleFullscreen = () => setFullscreen(!app.settings.fullscreen);

/** Keeps the setting honest if the window leaves fullscreen some other way. */
export async function syncFullscreen(): Promise<void> {
  const actual = await getCurrentWindow().isFullscreen();
  if (actual !== app.settings.fullscreen) updateSettings({ fullscreen: actual });
}

// ---- background image --------------------------------------------------------

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

function setBackgroundUrl(url: string | null) {
  const old = app.backgroundUrl;
  app.backgroundUrl = url;
  // Give the outgoing image time to fade before releasing it.
  if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
}

async function loadBackground(): Promise<void> {
  const ext = app.settings.background;
  if (!ext) return setBackgroundUrl(null);
  const bytes = await backend.readBackground(ext);
  setBackgroundUrl(URL.createObjectURL(new Blob([bytes], { type: IMAGE_TYPES[ext] ?? 'image/*' })));
}

/** Lets the user pick an image, stores a copy in the app folder and shows it. */
export async function chooseBackground(): Promise<void> {
  const picked = await open({
    multiple: false,
    directory: false,
    title: 'Choose a background image',
    filters: [{ name: 'Images', extensions: BACKGROUND_EXTS }],
  });
  if (!picked || Array.isArray(picked)) return;
  const ext = await backend.setBackground(picked);
  updateSettings({ background: ext });
  await loadBackground();
}

export async function clearBackground(): Promise<void> {
  await backend.clearBackground();
  updateSettings({ background: null });
  setBackgroundUrl(null);
}

// ---- library actions ---------------------------------------------------------

export function openBook(id: string): void {
  app.openBookId = id;
  app.view = 'reader';
}

export function goHome(): void {
  app.view = 'dashboard';
}

/** Lets the user pick a file, copies it into the library and opens it. */
export async function importAndOpen(): Promise<void> {
  const picked = await open({
    multiple: false,
    directory: false,
    title: 'Start a new book',
    filters: [{ name: 'Books', extensions: ['epub', 'txt'] }],
  });
  if (!picked || Array.isArray(picked)) return;

  const imported = await backend.importBook(picked);
  if (!app.books.some((b) => b.id === imported.id)) {
    let meta;
    try {
      const bytes = await backend.readBook(imported.id, imported.ext);
      meta = await readMeta(bytes, imported.ext, imported.fileName);
    } catch (e) {
      await backend.removeBook(imported.id, imported.ext).catch(() => {});
      throw e;
    }
    if (meta.cover) {
      await write(`covers/${imported.id}.txt`, meta.cover);
      covers.set(imported.id, Promise.resolve(meta.cover));
    }
    app.books.push({
      id: imported.id,
      ext: imported.ext,
      title: meta.title,
      author: meta.author,
      fileName: imported.fileName,
      addedAt: Date.now(),
      lastOpened: Date.now(),
      progress: 0,
      resume: null,
      bookmark: null,
      chapterBookmarks: [],
      hasCover: !!meta.cover,
    });
    librarySaver.schedule();
    await librarySaver.flush();
  }
  openBook(imported.id);
}

export async function removeBook(id: string): Promise<void> {
  const book = app.books.find((b) => b.id === id);
  if (!book) return;
  app.books = app.books.filter((b) => b.id !== id);
  covers.delete(id);
  librarySaver.schedule();
  await Promise.all([librarySaver.flush(), backend.removeBook(book.id, book.ext).catch(() => {})]);
}
