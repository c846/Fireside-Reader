import JSZip from 'jszip';
import type { BookMeta, ParsedBook, TocEntry } from '../types';
import { dirname, fragmentOf, guessType, isExternal, resolvePath } from './paths';

const OPS_NS = 'http://www.idpf.org/2007/ops';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Elements that never make it into the rendered book. */
const STRIP = new Set(['script', 'style', 'link', 'meta', 'title', 'iframe', 'object', 'embed', 'base']);

interface ManifestItem {
  id: string;
  path: string;
  type: string;
  props: string[];
}

interface Package {
  title: string;
  author: string;
  manifest: Map<string, ManifestItem>;
  byPath: Map<string, ManifestItem>;
  spine: ManifestItem[];
  cover: ManifestItem | null;
  nav: ManifestItem | null;
  ncx: ManifestItem | null;
}

interface RawToc {
  label: string;
  path: string;
  frag: string;
  depth: number;
}

const byName = (root: Document | Element, name: string) =>
  Array.from(root.getElementsByTagNameNS('*', name));
const childrenNamed = (el: Element, name: string) =>
  Array.from(el.children).filter((c) => c.localName === name);
const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function parseMarkup(text: string, xhtml: boolean): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, xhtml ? 'application/xhtml+xml' : 'application/xml');
  if (doc.getElementsByTagName('parsererror').length === 0) return doc;
  // Plenty of real-world ePubs ship malformed XHTML; the HTML parser is forgiving.
  return parser.parseFromString(text, 'text/html');
}

class Archive {
  private lower: Map<string, string>;
  constructor(private zip: JSZip) {
    this.lower = new Map(Object.keys(zip.files).map((n) => [n.toLowerCase(), n]));
  }
  file(path: string): JSZip.JSZipObject | null {
    const direct = this.zip.file(path);
    if (direct) return direct;
    const alt = this.lower.get(path.toLowerCase()) ?? this.lower.get(encodeURI(path).toLowerCase());
    return alt ? this.zip.file(alt) : null;
  }
  async text(path: string): Promise<string> {
    const f = this.file(path);
    if (!f) throw new Error(`Missing file in book: ${path}`);
    return f.async('string');
  }
}

async function openArchive(bytes: ArrayBuffer): Promise<Archive> {
  try {
    return new Archive(await JSZip.loadAsync(bytes));
  } catch {
    throw new Error("This file isn't a readable ePub.");
  }
}

async function readPackage(ar: Archive): Promise<Package> {
  const container = parseMarkup(await ar.text('META-INF/container.xml'), false);
  const rootfile = byName(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!rootfile) throw new Error("This ePub is missing its package file.");
  const opfPath = resolvePath('', rootfile);
  const base = dirname(opfPath);
  const opf = parseMarkup(await ar.text(opfPath), false);

  const metadata = byName(opf, 'metadata')[0] ?? opf.documentElement;
  const title = clean(byName(metadata, 'title')[0]?.textContent);
  const author = byName(metadata, 'creator')
    .map((e) => clean(e.textContent))
    .filter(Boolean)
    .join(', ');

  const manifest = new Map<string, ManifestItem>();
  const byPath = new Map<string, ManifestItem>();
  for (const el of byName(opf, 'item')) {
    const item: ManifestItem = {
      id: el.getAttribute('id') ?? '',
      path: resolvePath(base, el.getAttribute('href') ?? ''),
      type: el.getAttribute('media-type') ?? '',
      props: (el.getAttribute('properties') ?? '').split(/\s+/).filter(Boolean),
    };
    manifest.set(item.id, item);
    byPath.set(item.path, item);
  }
  const items = [...manifest.values()];

  const spineEl = byName(opf, 'spine')[0];
  const spine = spineEl
    ? byName(spineEl, 'itemref')
        .map((r) => manifest.get(r.getAttribute('idref') ?? ''))
        .filter((i): i is ManifestItem => !!i)
    : [];

  let cover = items.find((i) => i.props.includes('cover-image')) ?? null;
  if (!cover) {
    const ref = byName(metadata, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
    if (ref) cover = manifest.get(ref) ?? byPath.get(resolvePath(base, ref)) ?? null;
  }
  if (!cover) cover = items.find((i) => i.type.startsWith('image/') && /cover/i.test(i.id + i.path)) ?? null;
  if (cover && !cover.type.startsWith('image/')) cover = null;

  const nav = items.find((i) => i.props.includes('nav')) ?? null;
  const ncx =
    manifest.get(spineEl?.getAttribute('toc') ?? '') ??
    items.find((i) => i.type === 'application/x-dtbncx+xml') ??
    null;

  return { title, author, manifest, byPath, spine, cover, nav, ncx };
}

async function readToc(ar: Archive, pkg: Package): Promise<RawToc[]> {
  const out: RawToc[] = [];

  if (pkg.nav) {
    try {
      const doc = parseMarkup(await ar.text(pkg.nav.path), true);
      const dir = dirname(pkg.nav.path);
      const navs = byName(doc, 'nav');
      const nav =
        navs.find((n) =>
          (n.getAttributeNS(OPS_NS, 'type') ?? n.getAttribute('epub:type') ?? '').split(/\s+/).includes('toc'),
        ) ?? navs[0];
      const walk = (ol: Element, depth: number) => {
        for (const li of childrenNamed(ol, 'li')) {
          const link = childrenNamed(li, 'a')[0] ?? childrenNamed(li, 'span')[0];
          const href = link?.getAttribute('href');
          if (link && href) {
            out.push({ label: clean(link.textContent), path: resolvePath(dir, href), frag: fragmentOf(href), depth });
          }
          for (const sub of childrenNamed(li, 'ol')) walk(sub, depth + 1);
        }
      };
      const ol = nav && byName(nav, 'ol')[0];
      if (ol) walk(ol, 0);
      if (out.length) return out;
    } catch {
      /* fall through to NCX */
    }
  }

  if (pkg.ncx) {
    try {
      const doc = parseMarkup(await ar.text(pkg.ncx.path), false);
      const dir = dirname(pkg.ncx.path);
      const walk = (parent: Element, depth: number) => {
        for (const np of childrenNamed(parent, 'navPoint')) {
          const label = clean(childrenNamed(np, 'navLabel')[0]?.textContent);
          const src = childrenNamed(np, 'content')[0]?.getAttribute('src');
          if (src) out.push({ label, path: resolvePath(dir, src), frag: fragmentOf(src), depth });
          walk(np, depth + 1);
        }
      };
      const navMap = byName(doc, 'navMap')[0];
      if (navMap) walk(navMap, 0);
    } catch {
      /* no usable table of contents */
    }
  }
  return out;
}

const CSS_URL = /url\(\s*(['"]?)(.*?)\1\s*\)/g;

async function rewriteCss(
  css: string,
  dir: string,
  getUrl: (path: string) => Promise<string | null>,
): Promise<string> {
  css = css.replace(/@import[^;]*;/g, '').replace(/@charset[^;]*;/g, '');
  const map = new Map<string, string>();
  for (const m of css.matchAll(CSS_URL)) {
    const ref = m[2];
    if (!ref || map.has(ref) || isExternal(ref) || ref.startsWith('#')) continue;
    const url = await getUrl(resolvePath(dir, ref));
    if (url) map.set(ref, url);
  }
  return css.replace(CSS_URL, (all, _q, ref) => (map.has(ref) ? `url("${map.get(ref)}")` : all));
}

export async function epubMeta(bytes: ArrayBuffer): Promise<BookMeta> {
  const ar = await openArchive(bytes);
  const pkg = await readPackage(ar);
  let cover: Blob | null = null;
  const file = pkg.cover && ar.file(pkg.cover.path);
  if (pkg.cover && file) cover = new Blob([await file.async('arraybuffer')], { type: pkg.cover.type });
  return { title: pkg.title, author: pkg.author, cover };
}

export async function parseEpub(bytes: ArrayBuffer, fallbackTitle: string): Promise<ParsedBook> {
  const ar = await openArchive(bytes);
  const pkg = await readPackage(ar);
  if (!pkg.spine.length) throw new Error('This ePub has no readable content.');

  const urls = new Map<string, string>();
  const getUrl = async (path: string): Promise<string | null> => {
    const known = urls.get(path);
    if (known) return known;
    const f = ar.file(path);
    if (!f) return null;
    const type = pkg.byPath.get(path)?.type || guessType(path);
    const url = URL.createObjectURL(new Blob([await f.async('arraybuffer')], { type }));
    urls.set(path, url);
    return url;
  };

  const sectionOf = new Map<string, number>();
  pkg.spine.forEach((item, i) => sectionOf.set(item.path, i));

  const cssParts: string[] = [];
  const seenCss = new Set<string>();
  const sections: HTMLElement[] = [];

  for (let i = 0; i < pkg.spine.length; i++) {
    const item = pkg.spine[i];
    const section = document.createElement('section');
    section.className = 'fr-sec';
    section.id = `fr-s${i}`;
    sections.push(section);

    if (item.type.startsWith('image/')) {
      const url = await getUrl(item.path);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        section.appendChild(img);
      }
      continue;
    }

    let doc: Document;
    try {
      doc = parseMarkup(await ar.text(item.path), true);
    } catch {
      continue;
    }
    const dir = dirname(item.path);

    for (const link of byName(doc, 'link')) {
      if (!(link.getAttribute('rel') ?? '').toLowerCase().includes('stylesheet')) continue;
      const path = resolvePath(dir, link.getAttribute('href') ?? '');
      if (seenCss.has(path)) continue;
      seenCss.add(path);
      try {
        cssParts.push(await rewriteCss(await ar.text(path), dirname(path), getUrl));
      } catch {
        /* missing stylesheet */
      }
    }
    for (const style of byName(doc, 'style')) {
      const text = style.textContent ?? '';
      if (seenCss.has(text)) continue;
      seenCss.add(text);
      cssParts.push(await rewriteCss(text, dir, getUrl));
    }

    const body = byName(doc, 'body')[0];
    if (!body) continue;
    const bodyClass = body.getAttribute('class');
    if (bodyClass) section.className += ' ' + bodyClass;

    for (const el of Array.from(body.getElementsByTagName('*'))) {
      const name = el.localName;
      if (STRIP.has(name)) {
        el.remove();
        continue;
      }
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
      }
      const id = el.getAttribute('id');
      if (id) el.setAttribute('id', `s${i}__${id}`);

      if (name === 'img' || name === 'source' || name === 'video' || name === 'audio') {
        el.removeAttribute('srcset');
        const src = el.getAttribute('src');
        if (src && !isExternal(src)) {
          const url = await getUrl(resolvePath(dir, src));
          if (url) el.setAttribute('src', url);
        }
      } else if (name === 'image') {
        const href = el.getAttributeNS(XLINK_NS, 'href') ?? el.getAttribute('href');
        if (href && !isExternal(href)) {
          const url = await getUrl(resolvePath(dir, href));
          if (url) {
            el.removeAttributeNS(XLINK_NS, 'href');
            el.setAttribute('href', url);
          }
        }
      } else if (name === 'a') {
        const href = el.getAttribute('href') ?? el.getAttributeNS(XLINK_NS, 'href');
        if (href == null) continue;
        if (isExternal(href)) {
          el.setAttribute('data-fr-ext', href);
        } else {
          const filePart = href.split('#')[0];
          const target = filePart ? resolvePath(dir, filePart) : item.path;
          const si = sectionOf.get(target);
          const frag = fragmentOf(href);
          if (si !== undefined) el.setAttribute('data-fr-link', frag ? `s${si}__${frag}` : `fr-s${si}`);
        }
        el.removeAttributeNS(XLINK_NS, 'href');
        el.setAttribute('href', '#');
      }
    }

    for (const child of Array.from(body.childNodes)) section.appendChild(document.importNode(child, true));
  }

  // Chromium ignores @font-face inside shadow roots, so embedded fonts go in the main document.
  let css = cssParts.join('\n');
  const fontFaces: string[] = [];
  css = css.replace(/@font-face\s*\{[^}]*\}/gi, (rule) => {
    fontFaces.push(rule);
    return '';
  });
  let fontStyle: HTMLStyleElement | null = null;
  if (fontFaces.length) {
    fontStyle = document.createElement('style');
    fontStyle.dataset.frFonts = '';
    fontStyle.textContent = fontFaces.join('\n');
    document.head.appendChild(fontStyle);
  }

  const toc: TocEntry[] = [];
  for (const t of await readToc(ar, pkg)) {
    const si = sectionOf.get(t.path);
    if (si === undefined) continue;
    toc.push({ label: t.label || 'Untitled', depth: t.depth, target: t.frag ? `s${si}__${t.frag}` : `fr-s${si}` });
  }
  if (!toc.length) {
    sections.forEach((s, i) => {
      const label = clean(s.querySelector('h1,h2,h3')?.textContent);
      if (label) toc.push({ label, depth: 0, target: `fr-s${i}` });
    });
  }

  return {
    title: pkg.title || fallbackTitle,
    author: pkg.author || 'Unknown author',
    css,
    sections,
    toc,
    dispose() {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      fontStyle?.remove();
    },
  };
}
