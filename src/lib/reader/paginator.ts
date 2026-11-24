import type { Anchor, Layout, ParsedBook } from '../types';

/**
 * The whole book is laid out once as a single CSS multi-column flow inside a
 * shadow root (so the book's own CSS can't leak into the app). Every column is
 * one page; turning pages is just translating the flow sideways. This keeps
 * page counts exact for the current font, size and window.
 */

const ANCHOR_SEL = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,img,svg,figure,table,dt,dd,hr,div,section';

export const PAD_TOP = 64;
export const PAD_BOTTOM = 64;
/**
 * Inner padding of the page pane used when a background image shows behind
 * the book. Horizontal padding must stay below the smallest column gap (56px)
 * so neighbouring pages never peek into it.
 */
const PANE_X = 40;
const PANE_Y = 30;

export interface LayoutOpts {
  width: number;
  height: number;
  fontSize: number;
  font: string | null;
  layout: Layout;
  /** Column width as a percentage of the default (100). */
  pageWidth: number;
  /** Put the text on its own pane so a background image can show around it. */
  paged: boolean;
}

function lowerBound(arr: number[], value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function baseCss(o: LayoutOpts, colW: number, gap: number, h: number): string {
  const family = o.font ? `"${o.font.replace(/["\\]/g, '')}", Georgia, serif` : `Georgia, "Times New Roman", serif`;
  return `
:host { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: ${PAD_TOP}px 0 ${PAD_BOTTOM}px; box-sizing: border-box; }
:host(.nocursor), :host(.nocursor) * { cursor: none !important; }
.clip { position: relative; overflow: hidden; flex: none; }
${
  o.paged
    ? `.clip { box-sizing: content-box; padding: ${PANE_Y}px ${PANE_X}px;
  background: rgba(var(--bg-rgb), 0.93); backdrop-filter: blur(22px) saturate(1.2);
  box-shadow: 0 30px 70px -24px rgba(var(--shade), 0.45), 0 2px 10px rgba(var(--shade), 0.08);
  transition: background-color .4s ease; }`
    : ''
}
.flow {
  width: ${colW}px; height: ${h}px;
  column-width: ${colW}px; column-gap: ${gap}px; column-fill: auto;
  color: var(--text); font-family: ${family}; font-size: ${o.fontSize}px; line-height: 1.62;
  overflow-wrap: break-word; hyphens: auto; user-select: none; -webkit-user-select: none;
  will-change: transform;
}
.flow.anim { transition: transform 300ms cubic-bezier(.16, 1, .3, 1); }
.fr-sec + .fr-sec { break-before: column; }
.fr-end { height: 0; }
.flow * { color: inherit !important; background-color: transparent !important; border-color: currentColor;
  max-width: 100% !important; }
${o.font ? `.flow *:not(pre):not(code):not(kbd):not(samp):not(tt) { font-family: inherit !important; }` : ''}
.flow img, .flow svg, .flow video { max-width: 100% !important; max-height: ${h - 4}px !important;
  height: auto; object-fit: contain; break-inside: avoid; }
.flow a { text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); cursor: pointer; }
.flow a:not([data-fr-link]):not([data-fr-ext]) { text-decoration: none; cursor: inherit; }
.flow pre { white-space: pre-wrap; }
.flow h1, .flow h2, .flow h3, .flow h4 { break-after: avoid; }
.flow p { orphans: 2; widows: 2; }
.fr-txt p { margin: 0 0 0.85em; }
.fr-txt-h { text-align: center; font-size: 1.35em; font-weight: 600; margin: 1.6em 0 1.4em; letter-spacing: .01em; }
`;
}

export class Paginator {
  readonly root: ShadowRoot;
  private flow: HTMLDivElement;
  private clip: HTMLDivElement;
  private base: HTMLStyleElement;
  private end: HTMLDivElement;
  private anchors: Element[];
  /** Index into `anchors` of every laid-out anchor, and its column. Both ascending. */
  private aIdx: number[] = [];
  private aCol: number[] = [];

  colW = 600;
  gap = 64;
  perSpread = 1;
  total = 1;

  constructor(host: HTMLElement, book: ParsedBook) {
    this.root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    this.root.replaceChildren();
    const bookStyle = document.createElement('style');
    bookStyle.textContent = book.css;
    this.base = document.createElement('style');
    this.clip = document.createElement('div');
    this.clip.className = 'clip';
    this.flow = document.createElement('div');
    this.flow.className = 'flow';
    this.flow.append(...book.sections);
    this.end = document.createElement('div');
    this.end.className = 'fr-end';
    this.flow.appendChild(this.end);
    this.clip.appendChild(this.flow);
    this.root.append(bookStyle, this.base, this.clip);
    this.anchors = Array.from(this.flow.querySelectorAll(ANCHOR_SEL));
  }

  /** Waits for images and fonts so measurements are stable. */
  async settle(): Promise<void> {
    const imgs = Array.from(this.flow.querySelectorAll('img'));
    const loads = imgs.map((img) => (img.complete ? null : img.decode().catch(() => {})));
    await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 5000))]);
    await document.fonts.ready;
  }

  layout(o: LayoutOpts): void {
    const padX = o.width < 900 ? 36 : 72;
    const paneX = o.paged ? PANE_X * 2 : 0;
    const paneY = o.paged ? PANE_Y * 2 : 0;
    const availW = Math.max(200, o.width - padX * 2 - paneX);
    const h = Math.max(160, Math.floor(o.height - PAD_TOP - PAD_BOTTOM - paneY));

    let n = o.layout === 'double' ? 2 : 1;
    let gap = 64;
    let colW = 0;
    if (n === 2) {
      gap = Math.round(Math.min(112, Math.max(56, availW * 0.07)));
      colW = Math.min((availW - gap) / 2, o.fontSize * 34 * (o.pageWidth / 100));
      // Too narrow for two readable columns: fall back to one.
      if (colW < o.fontSize * 15) n = 1;
    }
    if (n === 1) {
      gap = 64;
      colW = Math.min(availW, o.fontSize * 36 * (o.pageWidth / 100));
    }
    colW = Math.floor(colW);

    this.colW = colW;
    this.gap = gap;
    this.perSpread = n;
    this.base.textContent = baseCss(o, colW, gap, h);
    this.clip.style.width = `${n * colW + (n - 1) * gap}px`;
    this.clip.style.height = `${h}px`;
    this.measure();
  }

  private colAt(left: number, flowLeft: number): number {
    return Math.max(0, Math.floor((left - flowLeft + this.gap / 2) / (this.colW + this.gap)));
  }

  private measure(): void {
    const fl = this.flow.getBoundingClientRect().left;
    this.aIdx = [];
    this.aCol = [];
    for (let i = 0; i < this.anchors.length; i++) {
      const rects = this.anchors[i].getClientRects();
      if (!rects.length) continue;
      const c = this.colAt(rects[0].left, fl);
      if (this.aCol.length && c < this.aCol[this.aCol.length - 1]) continue;
      this.aIdx.push(i);
      this.aCol.push(c);
    }
    this.total = this.colAt(this.end.getBoundingClientRect().left, fl) + 1;
  }

  goTo(col: number, animate: boolean): void {
    this.flow.classList.toggle('anim', animate);
    this.flow.style.transform = `translate3d(${-col * (this.colW + this.gap)}px, 0, 0)`;
  }

  /** A layout-independent description of the page starting at `col`. */
  anchorAt(col: number): Anchor {
    const k = lowerBound(this.aCol, col);
    if (k < this.aCol.length && this.aCol[k] === col) return { el: this.aIdx[k], skip: 0 };
    if (k > 0) return { el: this.aIdx[k - 1], skip: col - this.aCol[k - 1] };
    if (k < this.aCol.length) return { el: this.aIdx[k], skip: 0 };
    return { el: 0, skip: col };
  }

  colOfAnchor(a: Anchor): number {
    const k = lowerBound(this.aIdx, a.el);
    if (k >= this.aIdx.length) return this.total - 1;
    let col = this.aCol[k];
    if (this.aIdx[k] === a.el && a.skip > 0) {
      // Never skip past the element's own last page: at a smaller font size
      // a paragraph that used to span pages may now fit on one.
      const rects = this.anchors[a.el].getClientRects();
      const fl = this.flow.getBoundingClientRect().left;
      const lastCol = rects.length ? this.colAt(rects[rects.length - 1].left, fl) : col;
      col = Math.min(col + a.skip, Math.max(col, lastCol));
    }
    return Math.min(this.total - 1, Math.max(0, col));
  }

  colOfElement(el: Element | null): number {
    const rect = el?.getClientRects()[0];
    if (!rect) return -1;
    return Math.min(this.total - 1, this.colAt(rect.left, this.flow.getBoundingClientRect().left));
  }

  colOfId(id: string): number {
    return this.colOfElement(this.root.getElementById(id));
  }
}
