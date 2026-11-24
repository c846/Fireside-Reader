export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i + 1);
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Resolves `rel` against directory `base` (which ends in '/' or is ''). Drops query and fragment. */
export function resolvePath(base: string, rel: string): string {
  let r = safeDecode(rel.split('#')[0].split('?')[0]);
  if (r.startsWith('/')) {
    base = '';
    r = r.slice(1);
  }
  const out: string[] = [];
  for (const part of (base + r).split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

export function fragmentOf(href: string): string {
  const i = href.indexOf('#');
  return i < 0 ? '' : safeDecode(href.slice(i + 1));
}

export const isExternal = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  css: 'text/css',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

export function guessType(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return TYPES[ext] ?? 'application/octet-stream';
}
