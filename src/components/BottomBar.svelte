<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, quintOut } from 'svelte/easing';
  import Icon from './Icon.svelte';

  let {
    page,
    total,
    bookmarkCol,
    onhome,
    onsettings,
    onseek,
    onenter,
    onleave,
  }: {
    page: number;
    total: number;
    bookmarkCol: number;
    onhome: () => void;
    onsettings: () => void;
    /** `commit` is false while dragging, true when the user lets go. */
    onseek: (col: number, commit: boolean) => void;
    onenter: () => void;
    onleave: () => void;
  } = $props();

  let track: HTMLDivElement;
  let dragging = $state(false);
  let draft = $state('');
  let editing = $state(false);

  const frac = (col: number) => (total > 1 ? col / (total - 1) : 0);
  const pct = $derived(`${frac(page) * 100}%`);

  $effect(() => {
    if (!editing) draft = String(page + 1);
  });

  function colFromX(x: number) {
    const r = track.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (x - r.left) / r.width));
    return Math.round(f * (total - 1));
  }

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    track.setPointerCapture(e.pointerId);
    dragging = true;
    onseek(colFromX(e.clientX), false);
  }
  function move(e: PointerEvent) {
    if (dragging) onseek(colFromX(e.clientX), false);
  }
  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    onseek(colFromX(e.clientX), true);
  }

  function commitDraft() {
    editing = false;
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onseek(n - 1, true);
    draft = String(page + 1);
  }
</script>

<div
  class="bar l1 pane-shadow"
  in:fly={{ y: 100, duration: 420, easing: quintOut, opacity: 1 }}
  out:fly={{ y: 100, duration: 240, easing: cubicIn, opacity: 1 }}
  onpointerenter={onenter}
  onpointerleave={onleave}
  role="toolbar"
  tabindex="-1"
>
  <button class="btn l2 rounded grow" title="Back to dashboard" onclick={onhome}><Icon name="home" size={20} /></button>
  <button class="btn l2 rounded grow" title="Settings" onclick={onsettings}><Icon name="settings" size={20} /></button>

  <div
    class="track-hit"
    class:dragging
    bind:this={track}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    role="slider"
    tabindex="-1"
    aria-valuemin={1}
    aria-valuemax={total}
    aria-valuenow={page + 1}
  >
    <div class="track l2 rounded">
      <div class="fill" style:width={pct}></div>
    </div>
    {#if bookmarkCol >= 0}
      <button
        class="bm"
        style:left="{frac(bookmarkCol) * 100}%"
        title="Go to bookmarked page {bookmarkCol + 1}"
        aria-label="Go to bookmark"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => onseek(bookmarkCol, true)}
      ></button>
    {/if}
    <div class="thumb l3" style:left={pct}></div>
  </div>

  <div class="count l2 rounded">
    <input
      aria-label="Current page"
      bind:value={draft}
      style:width="{Math.max(2, String(total).length) + 0.5}ch"
      onfocus={(e) => {
        editing = true;
        e.currentTarget.select();
      }}
      onblur={commitDraft}
      onkeydown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          draft = String(page + 1);
          editing = false;
          e.currentTarget.blur();
        }
        e.stopPropagation();
      }}
    />
    <span class="muted">/ {total}</span>
  </div>
</div>

<style>
  .bar {
    position: absolute;
    z-index: 21;
    left: 0;
    right: 0;
    bottom: 0;
    height: 68px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 18px;
  }
  .btn {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    flex: none;
  }
  .track-hit {
    position: relative;
    flex: 1;
    height: 42px;
    margin: 0 14px;
    display: flex;
    align-items: center;
    cursor: pointer;
    touch-action: none;
  }
  .track {
    width: 100%;
    height: 6px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--text);
    opacity: 0.4;
  }
  .thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 26px;
    border-radius: 2px;
    translate: -50% -50%;
    box-shadow: 0 4px 12px -4px rgba(var(--shade), 0.6);
    transition: transform 0.2s var(--ease-out);
    pointer-events: none;
  }
  .track-hit:hover .thumb,
  .dragging .thumb {
    transform: scale(1.15);
  }
  .bm {
    position: absolute;
    top: 3px;
    width: 8px;
    height: 10px;
    translate: -50% 0;
    background: var(--text);
    opacity: 0.7;
    border-radius: 1px;
    transition: transform 0.2s var(--ease-out);
  }
  .bm:hover {
    transform: scale(1.35);
  }
  .count {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 42px;
    padding: 0 14px;
    font-variant-numeric: tabular-nums;
    transition: transform 0.22s var(--ease-out);
  }
  .count:hover {
    transform: scale(1.05);
  }
  .count input {
    text-align: right;
    font-weight: 600;
  }
</style>
