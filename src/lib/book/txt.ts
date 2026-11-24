import type { ParsedBook, TocEntry } from '../types';

const HEADING =
  /^(chapter|book|part|volume|prologue|epilogue|introduction|preface|foreword|afterword|appendix|act|letter|interlude|conclusion)\b/i;
const ROMAN = /^[IVXLCDM]{1,7}\.?$/;

function decode(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

interface Prepared {
  text: string;
  title: string;
  author: string;
}

/** Normalises line endings and trims Project Gutenberg boilerplate when present. */
function prepare(bytes: ArrayBuffer, fileName: string): Prepared {
  let text = decode(bytes).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const head = text.slice(0, 8000);
  const title = head.match(/^\s*Title:\s*(.+)$/m)?.[1].trim() || fileName;
  const author = head.match(/^\s*Author:\s*(.+)$/m)?.[1].trim() || 'Unknown author';

  const start = text.search(/^\*{3}\s*START OF.*$/m);
  if (start >= 0) text = text.slice(text.indexOf('\n', start) + 1);
  const end = text.search(/^\*{3}\s*END OF.*$/m);
  if (end >= 0) text = text.slice(0, end);
  return { text, title, author };
}

export function txtMeta(bytes: ArrayBuffer, fileName: string) {
  const { title, author } = prepare(bytes, fileName);
  return { title, author };
}

function isHeading(block: string[]): boolean {
  if (block.length > 2) return false;
  const first = block[0].trim();
  if (first.length > 90) return false;
  if (HEADING.test(first)) return block.length === 1 || block[1].trim().length <= 90;
  return block.length === 1 && ROMAN.test(first);
}

export function parseTxt(bytes: ArrayBuffer, fileName: string): ParsedBook {
  const { text, title, author } = prepare(bytes, fileName);
  const lines = text.split('\n');
  const blankCount = lines.reduce((n, l) => n + (l.trim() ? 0 : 1), 0);

  // Files with almost no blank lines put one paragraph per line;
  // otherwise paragraphs are separated by blank lines.
  let blocks: string[][];
  if (blankCount < lines.length * 0.04) {
    blocks = lines.filter((l) => l.trim()).map((l) => [l]);
  } else {
    blocks = [];
    let cur: string[] = [];
    for (const l of lines) {
      if (l.trim()) cur.push(l);
      else if (cur.length) {
        blocks.push(cur);
        cur = [];
      }
    }
    if (cur.length) blocks.push(cur);
  }

  const heads = blocks.map(isHeading);
  // A run of headings with nothing between them is a printed table of contents.
  for (let i = 0; i < heads.length - 1; i++) if (heads[i] && heads[i + 1]) heads[i] = false;

  const sections: HTMLElement[] = [];
  const toc: TocEntry[] = [];
  let current: HTMLElement | null = null;
  const newSection = (label: string | null) => {
    const i = sections.length;
    current = document.createElement('section');
    current.className = 'fr-sec fr-txt';
    current.id = `fr-s${i}`;
    sections.push(current);
    if (label) {
      const h = document.createElement('h2');
      h.className = 'fr-txt-h';
      h.textContent = label;
      current.appendChild(h);
      toc.push({ label, depth: 0, target: current.id });
    }
    return current;
  };

  blocks.forEach((block, i) => {
    if (heads[i]) {
      newSection(block.map((l) => l.trim()).join(': '));
      return;
    }
    const sec = current ?? newSection(null);
    const p = document.createElement('p');
    const poem = block.length > 1 && block.every((l) => l.trimEnd().length < 55);
    if (poem) {
      block.forEach((l, j) => {
        if (j) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(l.trim()));
      });
    } else {
      p.textContent = block.map((l) => l.trim()).join(' ');
    }
    sec.appendChild(p);
  });

  if (!sections.length) newSection(null);
  // Text before the first heading still deserves a place in the chapter list.
  if (toc.length && toc[0].target !== 'fr-s0') toc.unshift({ label: 'Opening', depth: 0, target: 'fr-s0' });

  return { title, author, css: '', sections, toc, dispose() {} };
}
