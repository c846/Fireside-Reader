<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, quintOut } from 'svelte/easing';
  import { app, importAndOpen, openBook, removeBook } from '../lib/store.svelte';
  import BookCard from './BookCard.svelte';
  import Icon from './Icon.svelte';

  let query = $state('');
  let busy = $state(false);
  let error = $state('');
  let menu = $state<{ x: number; y: number; id: string; confirm: boolean } | null>(null);

  const visible = $derived(
    [...app.books]
      .sort((a, b) => b.lastOpened - a.lastOpened)
      .filter((b) => b.title.toLowerCase().includes(query.trim().toLowerCase())),
  );

  async function start() {
    if (busy) return;
    error = '';
    busy = true;
    try {
      await importAndOpen();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function showMenu(e: MouseEvent, id: string) {
    e.preventDefault();
    menu = { x: Math.min(e.clientX, innerWidth - 220), y: Math.min(e.clientY, innerHeight - 80), id, confirm: false };
  }

  async function onRemove(e: MouseEvent) {
    e.stopPropagation();
    if (!menu) return;
    if (!menu.confirm) {
      menu.confirm = true;
      return;
    }
    const id = menu.id;
    menu = null;
    await removeBook(id);
  }
</script>

<svelte:window
  onpointerdown={(e) => {
    if (!(e.target as Element).closest?.('.ctx')) menu = null;
  }}
  onkeydown={(e) => e.key === 'Escape' && (menu = null)}
/>

<div class="dash" out:fly|global={{ y: -36, duration: 320, easing: cubicIn }}>
  <header in:fly|global={{ y: -28, duration: 620, easing: quintOut }}>
    <label class="search l1 lift">
      <Icon name="search" />
      <input placeholder="Search books by title" bind:value={query} spellcheck="false" />
    </label>
    <button class="settings l1 lift grow" title="Settings" onclick={() => (app.settingsOpen = true)}>
      <Icon name="settings" size={20} />
    </button>
  </header>

  <section class="shelf">
    {#if app.books.length === 0}
      <div class="empty" in:fly|global={{ y: -20, duration: 600, delay: 120, easing: quintOut }}>
        <div class="empty-pane l1">
          <h2>Your shelf is empty</h2>
          <p class="muted">Open an ePub or text file below and it will live here from now on.</p>
        </div>
      </div>
    {:else if visible.length === 0}
      <p class="none muted">No books match “{query}”.</p>
    {:else}
      <div class="grid">
        {#each visible as book, i (book.id)}
          <div in:fly|global={{ y: -24, duration: 560, delay: 90 + Math.min(i, 14) * 45, easing: quintOut }}>
            <BookCard {book} onopen={() => openBook(book.id)} oncontext={(e) => showMenu(e, book.id)} />
          </div>
        {/each}
      </div>
    {/if}
  </section>

  {#if error}
    <div class="error l2 rounded lift" in:fly={{ y: 20, duration: 300, easing: quintOut }} out:fly={{ y: 20, duration: 200 }}>
      {error}
      <button class="dismiss" onclick={() => (error = '')}>Dismiss</button>
    </div>
  {/if}

  <button class="start l2" onclick={start} disabled={busy} in:fly|global={{ y: 90, duration: 640, delay: 60, easing: quintOut, opacity: 1 }}>
    <span class="start-inner"><Icon name="plus" size={20} /> {busy ? 'Opening…' : 'Start a new book!'}</span>
  </button>

  {#if menu}
    <div class="ctx l1 pane-shadow" style:left="{menu.x}px" style:top="{menu.y}px" in:fly={{ y: -10, duration: 220, easing: quintOut }}>
      <button class="ctx-item rounded" class:danger={menu.confirm} onclick={onRemove}>
        {menu.confirm ? 'Click again to remove' : 'Remove from library'}
      </button>
    </div>
  {/if}
</div>

<style>
  .dash {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
  header {
    flex: none;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    padding: 26px 24px 18px;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    width: min(520px, 62vw);
    height: 44px;
    padding: 0 14px;
    cursor: text;
  }
  .search input {
    flex: 1;
    height: 100%;
  }
  .search input::placeholder {
    color: var(--text);
    opacity: 0.45;
  }
  .settings {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
  }
  .shelf {
    flex: 1;
    overflow-y: auto;
    padding: 18px 56px 40px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 34px 30px;
    max-width: 1400px;
    margin: 0 auto;
  }
  .empty {
    height: 100%;
    display: grid;
    place-items: center;
  }
  .empty-pane {
    padding: 28px 40px;
    text-align: center;
  }
  .empty-pane h2 {
    margin: 0 0 6px;
    font-weight: 600;
  }
  .empty-pane p {
    margin: 0;
  }
  .none {
    text-align: center;
    margin-top: 60px;
  }
  .start {
    flex: none;
    width: 100%;
    height: 76px;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.01em;
    backdrop-filter: blur(24px) saturate(1.35);
    transition:
      height 0.26s var(--ease-out),
      background-color 0.22s ease;
  }
  .start:hover:not(:disabled) {
    height: 86px;
    background: rgba(var(--pane), var(--a3));
  }
  .start:disabled {
    cursor: progress;
  }
  .start-inner {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    transition: transform 0.26s var(--ease-out);
  }
  .start:hover:not(:disabled) .start-inner {
    transform: scale(1.05);
  }
  .error {
    position: absolute;
    left: 50%;
    bottom: 96px;
    translate: -50% 0;
    padding: 12px 16px;
    display: flex;
    gap: 16px;
    align-items: center;
    max-width: 80vw;
  }
  .dismiss {
    font-weight: 600;
    opacity: 0.75;
  }
  .ctx {
    position: fixed;
    z-index: 30;
    padding: 6px;
    min-width: 200px;
  }
  .ctx-item {
    width: 100%;
    text-align: left;
    padding: 9px 12px;
    transition:
      background-color 0.18s ease,
      transform 0.2s var(--ease-out);
  }
  .ctx-item:hover {
    background: rgba(var(--pane), var(--a2));
    transform: scale(1.03);
  }
  .ctx-item.danger {
    background: rgba(var(--pane), var(--a3));
    font-weight: 600;
  }
</style>
