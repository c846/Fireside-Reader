<script lang="ts">
  import { loadCover } from '../lib/store.svelte';
  import type { BookEntry } from '../lib/types';

  let {
    book,
    onopen,
    oncontext,
  }: { book: BookEntry; onopen: () => void; oncontext: (e: MouseEvent) => void } = $props();

  let cover = $state<string | null>(null);

  $effect(() => {
    const id = book.id;
    if (!book.hasCover) return;
    let live = true;
    loadCover(id).then((c) => live && (cover = c));
    return () => (live = false);
  });
</script>

<button class="card" onclick={onopen} oncontextmenu={oncontext} title={book.title}>
  <div class="frame l1 lift">
    {#if cover}
      <img src={cover} alt="" draggable="false" />
    {:else}
      <div class="placeholder l2">
        <div class="ph-pane l2 rounded">
          <span class="ph-title">{book.title}</span>
          <span class="ph-author">{book.author}</span>
        </div>
      </div>
    {/if}
    {#if book.progress > 0}
      <div class="progress l3"><div class="fill" style:width="{Math.round(book.progress * 100)}%"></div></div>
    {/if}
  </div>
  <div class="title">{book.title}</div>
  <div class="author muted">{book.author}</div>
</button>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    text-align: center;
    transition: transform 0.24s var(--ease-out);
  }
  .card:hover {
    transform: scale(1.045) translateY(-2px);
  }
  .card:active {
    transform: scale(0.99);
    transition-duration: 0.08s;
  }
  .frame {
    position: relative;
    padding: 7px;
    margin-bottom: 8px;
    transition: box-shadow 0.24s var(--ease-out);
  }
  .card:hover .frame {
    box-shadow: 0 16px 32px -14px rgba(var(--shade), 0.45);
  }
  img,
  .placeholder {
    display: block;
    width: 100%;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    border-radius: var(--r);
  }
  .placeholder {
    display: grid;
    place-items: center;
    padding: 14px;
  }
  .ph-pane {
    width: 100%;
    padding: 18px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ph-title {
    font-family: Georgia, serif;
    font-size: 16px;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .ph-author {
    font-size: 11px;
    opacity: 0.65;
  }
  .progress {
    position: absolute;
    left: 7px;
    right: 7px;
    bottom: 7px;
    height: 4px;
    border-radius: 0 0 var(--r) var(--r);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--text);
    opacity: 0.55;
  }
  .title {
    font-weight: 600;
    font-size: 14px;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .author {
    font-size: 12.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
