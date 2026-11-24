import { invoke } from '@tauri-apps/api/core';
import type { BookExt } from './types';

export interface Imported {
  id: string;
  ext: BookExt;
  fileName: string;
  existed: boolean;
}

export const backend = {
  userName: () => invoke<string>('get_user_name'),
  listFonts: () => invoke<string[]>('list_fonts'),
  importBook: (path: string) => invoke<Imported>('import_book', { path }),
  readBook: (id: string, ext: BookExt) => invoke<ArrayBuffer>('read_book', { id, ext }),
  removeBook: (id: string, ext: BookExt) => invoke<void>('remove_book', { id, ext }),
  load: (name: string) => invoke<string | null>('load_data', { name }),
  save: (name: string, content: string) => invoke<void>('save_data', { name, content }),
  setBackground: (path: string) => invoke<string>('set_background', { path }),
  readBackground: (ext: string) => invoke<ArrayBuffer>('read_background', { ext }),
  clearBackground: () => invoke<void>('clear_background'),
};
