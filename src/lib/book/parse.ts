import type { BookExt, ParsedBook } from '../types';
import { epubMeta, parseEpub } from './epub';
import { parseTxt, txtMeta } from './txt';

export function parseBook(bytes: ArrayBuffer, ext: BookExt, fileName: string): Promise<ParsedBook> {
  return ext === 'epub' ? parseEpub(bytes, fileName) : Promise.resolve(parseTxt(bytes, fileName));
}

export interface ReadMeta {
  title: string;
  author: string;
  /** JPEG data URL thumbnail. */
  cover: string | null;
}

export async function readMeta(bytes: ArrayBuffer, ext: BookExt, fileName: string): Promise<ReadMeta> {
  if (ext === 'txt') return { ...txtMeta(bytes, fileName), cover: null };
  const m = await epubMeta(bytes);
  return {
    title: m.title || fileName,
    author: m.author || 'Unknown author',
    cover: m.cover ? await thumbnail(m.cover).catch(() => null) : null,
  };
}

/** Shrinks a cover image so the library stays small. */
async function thumbnail(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const nw = img.naturalWidth || 400;
    const nh = img.naturalHeight || 600;
    const w = Math.min(420, nw);
    const h = Math.round((w * nh) / nw);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}
