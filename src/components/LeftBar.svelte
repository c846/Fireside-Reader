<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, quintOut } from 'svelte/easing';
  import type { TocEntry } from '../lib/types';

  let {
    title,
    author,
    toc,
    tocCols,
    current,
    marked,
    ongo,
    ontoggle,
    onenter,
    onleave,
  }: {
    title: string;
    author: string;
    toc: TocEntry[];
    tocCols: number[];
    current: number;
    marked: string[];
    ongo: (i: number) => void;
    ontoggle: (target: string) => void;
    onenter: () => void;
    onleave: () => void;
  } = $props();

  let list = $state<HTMLDivElement>();

  $effect(() => {
    // Bring the chapter being read into view when the bar opens.
    list?.querySelector('.current')?.scrollIntoView({ block: 'center' });
  });
</script>

<aside
  class="bar l1 pane-shadow"
  in:fly={{ x: -360, duration: 460, easing: quintOut, opacity: 1 }}
  out:fly={{ x: -360, duration: 260, easing: cubicIn, opacity: 1 }}
  onpointerenter={onenter}
  onpointerleave={onleave}
>
  <div class="meta">
    <h1>{title}</h1>
    <p class="muted">{author}</p>
  </div>
  <div class="label">Chapters</div>
  <div class="list" bind:this={list}>
    {#if toc.length === 0}
      <p class="muted none">This book has no chapter list.</p>
    {/if}
    {#each toc as entry, i (i)}
      {@const isMarked = marked.includes(entry.target)}
      <div class="row rounded" class:current={i === current} class:l2={i === current}>
        <button
          class="go"
          style:padding-left="{12 + entry.depth * 16}px"
          disabled={tocCols[i] < 0}
          onclick={() => ongo(i)}
        >
          <span class="name">{entry.label}</span>
        </button>
        <button
          class="mark"
          class:on={isMarked}
          title={isMarked ? 'Remove chapter bookmark' : 'Bookmark this chapter'}
          aria-pressed={isMarked}
          onclick={() => ontoggle(entry.target)}
        >
          <span class="square"></span>
        </button>
      </div>
    {/each}
  </div>
</aside>

<style>
  .bar {
    position: absolute;
    z-index: 22;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(340px, 82vw);
    display: flex;
    flex-direction: column;
    padding: 28px 10px 18px;
  }
  .meta {
    padding: 0 14px 18px;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 21px;
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .meta p {
    margin: 0;
    font-size: 14px;
  }
  .label {
    padding: 0 14px 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.55;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-right: 2px;
  }
  .none {
    padding: 0 14px;
  }
  .row {
    display: flex;
    align-items: stretch;
    transition:
      background-color 0.18s ease,
      transform 0.22s var(--ease-out);
  }
  .row:hover {
    background: rgba(var(--pane), var(--a2));
    transform: scale(1.02);
  }
  .row.current {
    font-weight: 600;
  }
  .go {
    flex: 1;
    min-width: 0;
    text-align: left;
    padding: 9px 4px 9px 12px;
    line-height: 1.3;
  }
  .go:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .name {
    overflow-wrap: anywhere;
  }
  .mark {
    flex: none;
    width: 34px;
    display: grid;
    place-items: center;
  }
  .square {
    width: 9px;
    height: 9px;
    border-radius: 1.5px;
    background: var(--text);
    opacity: 0;
    transform: scale(0.6);
    transition:
      opacity 0.18s ease,
      transform 0.24s var(--ease-out);
  }
  .row:hover .square {
    opacity: 0.22;
    transform: scale(1);
  }
  .mark:hover .square {
    opacity: 0.5;
    transform: scale(1.2);
  }
  .mark.on .square,
  .row:hover .mark.on .square {
    opacity: 0.85;
    transform: scale(1);
  }
</style>
