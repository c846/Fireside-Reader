<script lang="ts">
  import { fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { app } from '../lib/store.svelte';

  let { value, onchange }: { value: string | null; onchange: (font: string | null) => void } = $props();

  let open = $state(false);
  let q = $state('');
  let root: HTMLDivElement;
  let search = $state<HTMLInputElement>();

  const fonts = $derived((app.fonts ?? []).filter((f) => f.toLowerCase().includes(q.trim().toLowerCase())));
  const familyCss = (f: string | null) => (f ? `"${f.replace(/["\\]/g, '')}", Georgia, serif` : 'Georgia, serif');

  $effect(() => {
    if (open) search?.focus();
  });

  function pick(f: string | null) {
    onchange(f);
    open = false;
    q = '';
  }
</script>

<svelte:window
  onpointerdown={(e) => {
    if (open && !root.contains(e.target as Node)) open = false;
  }}
/>

<div class="picker" bind:this={root}>
  <button class="current l2 rounded" style:font-family={familyCss(value)} onclick={() => (open = !open)}>
    <span>{value ?? 'Book default'}</span>
    <span class="caret" class:up={open}></span>
  </button>
  {#if open}
    <div class="drop l3 rounded pane-shadow" transition:fly={{ y: -12, duration: 240, easing: quintOut }}>
      <input
        class="find l2 rounded"
        placeholder="Search installed fonts"
        bind:value={q}
        bind:this={search}
        spellcheck="false"
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            open = false;
          }
        }}
      />
      <div class="list">
        {#if !q.trim()}
          <button class="opt rounded" class:sel={value === null} onclick={() => pick(null)}>Book default</button>
        {/if}
        {#if app.fonts === null}
          <p class="note muted">Loading fonts…</p>
        {:else if fonts.length === 0}
          <p class="note muted">No fonts match.</p>
        {/if}
        {#each fonts as f (f)}
          <button class="opt rounded" class:sel={f === value} style:font-family={familyCss(f)} onclick={() => pick(f)}>
            {f}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
  }
  .current {
    width: 100%;
    height: 40px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 16px;
    transition:
      transform 0.2s var(--ease-out),
      background-color 0.2s ease;
  }
  .current:hover {
    transform: scale(1.02);
    background: rgba(var(--pane), var(--a3));
  }
  .caret {
    width: 8px;
    height: 8px;
    border-right: 1.6px solid currentColor;
    border-bottom: 1.6px solid currentColor;
    transform: translateY(-2px) rotate(45deg);
    transition: transform 0.25s var(--ease-out);
  }
  .caret.up {
    transform: translateY(2px) rotate(225deg);
  }
  .drop {
    position: absolute;
    z-index: 5;
    left: 0;
    right: 0;
    top: calc(100% + 6px);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    backdrop-filter: blur(24px);
  }
  .find {
    height: 34px;
    padding: 0 10px;
  }
  .find::placeholder {
    color: var(--text);
    opacity: 0.45;
  }
  .list {
    max-height: 260px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .opt {
    text-align: left;
    padding: 7px 10px;
    font-size: 16px;
    flex: none;
    content-visibility: auto;
    contain-intrinsic-size: auto 36px;
    transition:
      background-color 0.15s ease,
      transform 0.2s var(--ease-out);
  }
  .opt:hover {
    background: rgba(var(--pane), 1);
    transform: translateX(3px);
  }
  .opt.sel {
    font-weight: 700;
  }
  .note {
    margin: 6px 10px;
    font-size: 13px;
  }
</style>
