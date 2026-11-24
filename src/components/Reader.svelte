<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicIn, quintOut } from 'svelte/easing';
  import { app, flushLibrary, goHome, updateBook } from '../lib/store.svelte';
  import { backend } from '../lib/backend';
  import { parseBook } from '../lib/book/parse';
  import { Paginator } from '../lib/reader/paginator';
  import type { Anchor, ParsedBook, TocEntry } from '../lib/types';
  import LeftBar from './LeftBar.svelte';
  import BottomBar from './BottomBar.svelte';

  let { id }: { id: string } = $props();
  const entry = $derived(app.books.find((b) => b.id === id));

  let viewport: HTMLDivElement;
  let host: HTMLDivElement;
  let pag: Paginator | null = null;
  let parsed: ParsedBook | null = null;

  let status = $state<'loading' | 'ready' | 'error'>('loading');
  let errorMsg = $state('');
  /** First column (page) currently on screen, 0-based. */
  let page = $state(0);
  let total = $state(1);
  let perSpread = $state(1);
  let toc = $state<TocEntry[]>([]);
  let tocCols = $state<number[]>([]);
  let bookmarkCol = $state(-1);
  let leftOpen = $state(false);
  let bottomOpen = $state(false);
  let cursorHidden = $state(false);

  /** Backdrop (gradient or image) visible behind a cropped page while reading. */
  const showBg = $derived(app.settings.backgroundInReader);
  const isBookmarked = $derived(bookmarkCol >= 0 && bookmarkCol === page);
  const pageLabel = $derived(perSpread === 2 && page + 1 < total ? `${page + 1}–${page + 2}` : `${page + 1}`);
  const currentChapter = $derived.by(() => {
    const last = page + perSpread - 1;
    let c = -1;
    for (let i = 0; i < tocCols.length; i++) if (tocCols[i] >= 0 && tocCols[i] <= last) c = i;
    return c;
  });

  // ---- paging --------------------------------------------------------------

  const align = (c: number) => c - (c % perSpread);

  function setPage(target: number, animate = false, save = true) {
    if (!pag) return;
    const c = align(Math.max(0, Math.min(total - 1, Math.round(target))));
    const anim = animate && c !== page && Math.abs(c - page) <= perSpread;
    page = c;
    pag.goTo(c, anim);
    if (save) persist();
  }

  /** Saves the reading position — this is the automatic "last read" bookmark. */
  function persist() {
    if (!pag || status !== 'ready') return;
    updateBook(id, {
      resume: pag.anchorAt(page),
      progress: Math.min(1, (page + perSpread) / total),
    });
  }

  const next = () => setPage(page + perSpread, true);
  const prev = () => setPage(page - perSpread, true);

  function relayout(anchor: Anchor | null) {
    if (!pag) return;
    const s = app.settings;
    pag.layout({
      width: viewport.clientWidth,
      height: viewport.clientHeight,
      fontSize: s.fontSize,
      pageWidth: s.pageWidth,
      font: s.font,
      layout: s.layout,
      paged: showBg,
    });
    total = pag.total;
    perSpread = pag.perSpread;
    tocCols = toc.map((t) => pag!.colOfId(t.target));
    const bm = untrack(() => entry?.bookmark);
    bookmarkCol = bm ? align(pag.colOfAnchor(bm)) : -1;
    setPage(anchor ? pag.colOfAnchor(anchor) : 0, false, false);
  }

  let relayoutTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingAnchor: Anchor | null = null;
  /** Re-paginates after a resize or settings change, keeping the reader's place. */
  function scheduleRelayout() {
    if (!pag || status !== 'ready') return;
    pendingAnchor ??= pag.anchorAt(page);
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(() => {
      const a = pendingAnchor;
      pendingAnchor = null;
      relayout(a);
    }, 140);
  }

  $effect(() => {
    void app.settings.font;
    void app.settings.fontSize;
    void app.settings.pageWidth;
    void app.settings.layout;
    void showBg;
    untrack(scheduleRelayout);
  });

  // ---- bookmarks -----------------------------------------------------------

  function toggleBookmark() {
    if (!pag || status !== 'ready') return;
    if (isBookmarked) {
      updateBook(id, { bookmark: null });
      bookmarkCol = -1;
    } else {
      // Only one page bookmark at a time: this replaces any earlier one.
      updateBook(id, { bookmark: pag.anchorAt(page) });
      bookmarkCol = page;
    }
  }

  function toggleChapter(target: string) {
    const marks = entry?.chapterBookmarks ?? [];
    updateBook(id, {
      chapterBookmarks: marks.includes(target) ? marks.filter((m) => m !== target) : [...marks, target],
    });
  }

  function goChapter(i: number) {
    if (tocCols[i] >= 0) setPage(tocCols[i]);
  }

  // ---- bars ----------------------------------------------------------------

  const timers: Record<'left' | 'bottom', ReturnType<typeof setTimeout> | undefined> = { left: undefined, bottom: undefined };
  function openBar(which: 'left' | 'bottom') {
    if (status !== 'ready') return;
    clearTimeout(timers[which]);
    if (which === 'left') leftOpen = true;
    else bottomOpen = true;
  }
  function leaveBar(which: 'left' | 'bottom') {
    clearTimeout(timers[which]);
    timers[which] = setTimeout(() => {
      if (which === 'left') leftOpen = false;
      else bottomOpen = false;
    }, 380);
  }

  // ---- input ---------------------------------------------------------------

  function onKey(e: KeyboardEvent) {
    if (app.settingsOpen || status !== 'ready') return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    switch (e.key) {
      case ' ':
        e.shiftKey ? prev() : next();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
        next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        prev();
        break;
      case 'Home':
        setPage(0);
        break;
      case 'End':
        setPage(total - 1);
        break;
      case 'Escape':
        home();
        break;
      default:
        return;
    }
    e.preventDefault();
    // Stop a focused toolbar button from also reacting to Space.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
  }

  let downAt = { x: 0, y: 0 };
  function onPageClick(e: MouseEvent) {
    if (status !== 'ready' || e.button !== 0) return;
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    if (leftOpen || bottomOpen) {
      leftOpen = bottomOpen = false;
      return;
    }
    const link = e
      .composedPath()
      .find((n): n is Element => n instanceof Element && n.localName === 'a' && (n.hasAttribute('data-fr-link') || n.hasAttribute('data-fr-ext')));
    if (link) {
      e.preventDefault();
      const target = link.getAttribute('data-fr-link');
      if (target && pag) {
        const c = pag.colOfId(target);
        if (c >= 0) setPage(c);
      }
      return;
    }
    const r = viewport.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.35) prev();
    else if (x > 0.65) next();
  }

  let idle: ReturnType<typeof setTimeout> | undefined;
  function wake() {
    cursorHidden = false;
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (!leftOpen && !bottomOpen && !app.settingsOpen) cursorHidden = true;
      else wake();
    }, 2000);
  }

  function home() {
    persist();
    flushLibrary();
    goHome();
  }

  // ---- lifecycle -----------------------------------------------------------

  onMount(() => {
    let cancelled = false;
    wake();

    (async () => {
      const book = untrack(() => entry);
      if (!book) {
        status = 'error';
        errorMsg = 'This book is no longer in your library.';
        return;
      }
      try {
        const bytes = await backend.readBook(book.id, book.ext);
        if (cancelled) return;
        parsed = await parseBook(bytes, book.ext, book.fileName);
        if (cancelled) return parsed.dispose();
        toc = parsed.toc;
        pag = new Paginator(host, parsed);
        await pag.settle();
        if (cancelled) return;
        status = 'ready';
        relayout(untrack(() => entry?.resume ?? null));
        updateBook(id, { lastOpened: Date.now() });
      } catch (err) {
        console.error(err);
        status = 'error';
        errorMsg = err instanceof Error ? err.message : String(err);
      }
    })();

    const ro = new ResizeObserver(() => scheduleRelayout());
    ro.observe(viewport);

    return () => {
      cancelled = true;
      ro.disconnect();
      clearTimeout(relayoutTimer);
      clearTimeout(idle);
      clearTimeout(timers.left);
      clearTimeout(timers.bottom);
      persist();
      flushLibrary();
      // Let the exit animation finish before releasing image blobs.
      const p = parsed;
      setTimeout(() => p?.dispose(), 600);
    };
  });
</script>

<svelte:window onkeydown={onKey} onmousemove={wake} onpointerdown={wake} />

<div
  class="reader"
  class:nocursor={cursorHidden}
  class:show-bg={showBg}
  in:fly|global={{ y: 56, duration: 560, easing: quintOut }}
  out:fly|global={{ y: 56, duration: 300, easing: cubicIn }}
>
  <div
    class="viewport"
    bind:this={viewport}
    role="presentation"
    onpointerdown={(e) => (downAt = { x: e.clientX, y: e.clientY })}
    onclick={onPageClick}
  >
    <div class="host" class:shown={status === 'ready'} class:nocursor={cursorHidden} bind:this={host}></div>
  </div>

  {#if status === 'loading'}
    <div class="status" out:fly={{ y: -16, duration: 200 }}>
      <div class="status-pane l1">Opening {entry?.title ?? 'book'}…</div>
    </div>
  {:else if status === 'error'}
    <div class="status">
      <div class="status-pane l1 pane-shadow">
        <strong>Couldn't open this book</strong>
        <span class="muted">{errorMsg}</span>
        <button class="back l2 rounded grow" onclick={home}>Back to dashboard</button>
      </div>
    </div>
  {/if}

  {#if status === 'ready'}
    <button
      class="pageno rounded grow"
      class:l1={!isBookmarked}
      class:l3={isBookmarked}
      class:marked={isBookmarked}
      title={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
      onclick={toggleBookmark}
      in:fly={{ y: -30, duration: 420, easing: quintOut }}
    >
      <span class="ribbon"></span>
      {pageLabel}
    </button>
  {/if}

  <!-- Edge zones: hover or press to reveal the bars. -->
  <div class="zone zone-left" role="presentation" onpointerenter={() => openBar('left')} onpointerdown={() => openBar('left')}></div>
  <div class="zone zone-bottom" role="presentation" onpointerenter={() => openBar('bottom')} onpointerdown={() => openBar('bottom')}></div>

  {#if leftOpen}
    <LeftBar
      title={entry?.title ?? ''}
      author={entry?.author ?? ''}
      {toc}
      {tocCols}
      current={currentChapter}
      marked={entry?.chapterBookmarks ?? []}
      ongo={goChapter}
      ontoggle={toggleChapter}
      onenter={() => openBar('left')}
      onleave={() => leaveBar('left')}
    />
  {/if}

  {#if bottomOpen}
    <BottomBar
      {page}
      {total}
      {bookmarkCol}
      onhome={home}
      onsettings={() => (app.settingsOpen = true)}
      onseek={(c, commit) => setPage(c, false, commit)}
      onenter={() => openBar('bottom')}
      onleave={() => leaveBar('bottom')}
    />
  {/if}
</div>

<style>
  .reader {
    position: absolute;
    inset: 0;
    background: var(--bg);
    transition: background-color 0.4s ease;
  }
  .reader.show-bg {
    background: transparent;
  }
  .reader.nocursor,
  .reader.nocursor * {
    cursor: none !important;
  }
  .viewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .host {
    position: absolute;
    inset: 0;
    opacity: 0;
    transform: translateY(18px);
    transition:
      opacity 0.35s ease,
      transform 0.6s var(--ease-out);
  }
  .host.shown {
    opacity: 1;
    transform: none;
  }
  .status {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .status-pane {
    pointer-events: auto;
    padding: 18px 26px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    max-width: 480px;
    text-align: center;
  }
  .back {
    margin-top: 6px;
    padding: 8px 16px;
    font-weight: 600;
  }
  .pageno {
    position: absolute;
    z-index: 15;
    top: 16px;
    right: 18px;
    min-width: 44px;
    height: 32px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 13.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .ribbon {
    width: 0;
    height: 12px;
    background: var(--text);
    border-radius: 1px;
    margin-right: -8px;
    transition:
      width 0.25s var(--ease-out),
      margin 0.25s var(--ease-out);
  }
  .pageno.marked .ribbon {
    width: 7px;
    margin-right: 0;
  }
  .zone {
    position: absolute;
    z-index: 10;
  }
  .zone-left {
    left: 0;
    top: 0;
    bottom: 0;
    width: 18px;
  }
  .zone-bottom {
    left: 0;
    right: 0;
    bottom: 0;
    height: 18px;
  }
</style>
