<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { cubicIn, quintOut } from 'svelte/easing';
  import { app, chooseBackground, clearBackground, toggleFullscreen, updateSettings } from '../lib/store.svelte';
  import type { Layout, ThemeName } from '../lib/types';
  import FontPicker from './FontPicker.svelte';

  const themes: { id: ThemeName; name: string; bg: string; fg: string }[] = [
    { id: 'default', name: 'Default', bg: '#ffffff', fg: '#151515' },
    { id: 'paper', name: 'Paper', bg: '#f5ecd2', fg: '#2f2a1b' },
    { id: 'night', name: 'Night', bg: '#0a1220', fg: '#b4cbe6' },
  ];
  const layouts: { id: Layout; name: string }[] = [
    { id: 'single', name: 'Single page' },
    { id: 'double', name: 'Double column' },
  ];
  const MIN_SIZE = 12;
  const MAX_SIZE = 36;

  // Slide in from above the window, settle in the centre.
  const travel = Math.round(window.innerHeight * 0.7);
  const close = () => (app.settingsOpen = false);
  const setSize = (n: number) => updateSettings({ fontSize: Math.max(MIN_SIZE, Math.min(MAX_SIZE, n)) });

  let bgBusy = $state(false);
  let bgError = $state('');
  async function runBg(action: () => Promise<void>) {
    bgBusy = true;
    bgError = '';
    try {
      await action();
    } catch (e) {
      bgError = e instanceof Error ? e.message : String(e);
    } finally {
      bgBusy = false;
    }
  }
  const pickBackground = () => runBg(chooseBackground);
  const removeBackground = () => runBg(clearBackground);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="backdrop" role="presentation" onclick={close} transition:fade={{ duration: 220 }}></div>

<div class="center">
  <div
    class="menu l1 pane-shadow"
    role="dialog"
    aria-label="Settings"
    in:fly={{ y: -travel, duration: 560, easing: quintOut, opacity: 1 }}
    out:fly={{ y: -travel, duration: 340, easing: cubicIn, opacity: 1 }}
  >
    <div class="head">
      <h2>Settings</h2>
      <button class="close l2 rounded grow" onclick={close} title="Close">Done</button>
    </div>

    <section>
      <h3>Theme</h3>
      <div class="themes">
        {#each themes as t (t.id)}
          <button
            class="theme rounded grow"
            class:l2={app.settings.theme !== t.id}
            class:l3={app.settings.theme === t.id}
            class:active={app.settings.theme === t.id}
            onclick={() => updateSettings({ theme: t.id })}
          >
            <span class="swatch rounded" style:background={t.bg} style:color={t.fg}>
              <span class="aa">Aa</span>
              <span class="lines"><i></i><i></i><i></i></span>
            </span>
            <span class="tname">{t.name}</span>
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h3>Font</h3>
      <FontPicker value={app.settings.font} onchange={(font) => updateSettings({ font })} />
      <div class="size">
        <button class="step l2 rounded grow" onclick={() => setSize(app.settings.fontSize - 1)} title="Smaller">A−</button>
        <input
          type="range"
          min={MIN_SIZE}
          max={MAX_SIZE}
          step="1"
          value={app.settings.fontSize}
          oninput={(e) => setSize(+e.currentTarget.value)}
          style:--pct="{((app.settings.fontSize - MIN_SIZE) / (MAX_SIZE - MIN_SIZE)) * 100}%"
        />
        <button class="step l2 rounded grow" onclick={() => setSize(app.settings.fontSize + 1)} title="Larger">A+</button>
        <span class="size-val">{app.settings.fontSize}px</span>
      </div>
    </section>

    <section>
      <h3>Background</h3>
      <div class="bg-row">
        <div class="bg-thumb l2 rounded" style:background-image={app.backgroundUrl ? `url(${app.backgroundUrl})` : null}>
          {#if !app.backgroundUrl}<span class="muted">None</span>{/if}
        </div>
        <div class="bg-actions">
          <button class="pill l2 rounded grow" onclick={pickBackground} disabled={bgBusy}>
            {app.settings.background ? 'Change image…' : 'Choose image…'}
          </button>
          {#if app.settings.background}
            <button class="pill l2 rounded grow" onclick={removeBackground} disabled={bgBusy}>Remove</button>
          {/if}
        </div>
      </div>
      <button
        class="toggle-row rounded"
        role="switch"
        aria-checked={app.settings.backgroundInReader}
        disabled={!app.settings.background}
        onclick={() => updateSettings({ backgroundInReader: !app.settings.backgroundInReader })}
      >
        <span class="switch l2" class:on={app.settings.backgroundInReader}><span class="knob"></span></span>
        Show behind the page while reading
      </button>
      {#if bgError}<p class="bg-error">{bgError}</p>{/if}
    </section>

    <section>
      <h3>Window</h3>
      <button class="fs l2 rounded grow" class:l3={app.settings.fullscreen} onclick={toggleFullscreen}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square" aria-hidden="true">
          {#if app.settings.fullscreen}
            <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          {:else}
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          {/if}
        </svg>
        {app.settings.fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        <span class="key muted">F11</span>
      </button>
    </section>

    <section>
      <h3>Page layout</h3>
      <div class="seg">
        {#each layouts as l (l.id)}
          <button
            class="seg-btn rounded grow"
            class:l2={app.settings.layout !== l.id}
            class:l3={app.settings.layout === l.id}
            class:active={app.settings.layout === l.id}
            onclick={() => updateSettings({ layout: l.id })}
          >
            <span class="glyph" class:double={l.id === 'double'}><i></i>{#if l.id === 'double'}<i></i>{/if}</span>
            {l.name}
          </button>
        {/each}
      </div>
    </section>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: var(--scrim);
  }
  .center {
    position: fixed;
    inset: 0;
    z-index: 41;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .menu {
    pointer-events: auto;
    width: min(500px, calc(100vw - 48px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 24px 26px 28px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .fs {
    width: 100%;
    height: 44px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }
  .key {
    margin-left: auto;
    font-size: 12px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 2px;
    background: rgba(var(--pane), var(--a3));
  }
  .bg-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .bg-thumb {
    flex: none;
    width: 96px;
    height: 60px;
    background-size: cover;
    background-position: center;
    display: grid;
    place-items: center;
    font-size: 12px;
  }
  .bg-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pill {
    height: 36px;
    padding: 0 14px;
    font-weight: 600;
  }
  .pill:disabled {
    opacity: 0.55;
    cursor: progress;
  }
  .toggle-row {
    margin-top: 10px;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 4px;
    text-align: left;
    transition: opacity 0.2s ease;
  }
  .toggle-row:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .switch {
    position: relative;
    flex: none;
    width: 40px;
    height: 22px;
    border-radius: 3px;
    transition: background-color 0.2s ease;
  }
  .switch.on {
    background: color-mix(in srgb, var(--text) 50%, transparent);
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 16px;
    border-radius: 2px;
    background: rgba(var(--pane), 1);
    box-shadow: 0 2px 6px -2px rgba(var(--shade), 0.6);
    transition: transform 0.28s var(--ease-out);
  }
  .switch.on .knob {
    transform: translateX(20px);
  }
  .toggle-row:not(:disabled):hover .knob {
    transform: scale(1.12);
  }
  .toggle-row:not(:disabled):hover .switch.on .knob {
    transform: translateX(20px) scale(1.12);
  }
  .bg-error {
    margin: 8px 0 0;
    font-size: 13px;
    opacity: 0.8;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
  }
  h3 {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.6;
  }
  .close {
    padding: 7px 14px;
    font-weight: 600;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .theme {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .theme.active,
  .seg-btn.active {
    box-shadow: 0 8px 20px -10px rgba(var(--shade), 0.5);
  }
  .swatch {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 58px;
    padding: 0 12px;
  }
  .aa {
    font-family: Georgia, serif;
    font-size: 22px;
  }
  .lines {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .lines i {
    display: block;
    height: 3px;
    background: currentColor;
    opacity: 0.55;
  }
  .lines i:last-child {
    width: 60%;
  }
  .tname {
    font-size: 13px;
    font-weight: 600;
  }
  .size {
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .step {
    width: 40px;
    height: 34px;
    font-weight: 600;
    font-size: 13px;
  }
  .size-val {
    width: 44px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }
  input[type='range'] {
    flex: 1;
    appearance: none;
    -webkit-appearance: none;
    height: 22px;
    background: transparent;
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 2px;
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--text) 45%, transparent) var(--pct),
      rgba(var(--pane), var(--a2)) var(--pct)
    );
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 22px;
    margin-top: -8px;
    border-radius: 2px;
    background: rgba(var(--pane), 1);
    box-shadow: 0 3px 10px -3px rgba(var(--shade), 0.55);
    transition: transform 0.2s var(--ease-out);
  }
  input[type='range']:hover::-webkit-slider-thumb {
    transform: scale(1.15);
  }
  .seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .seg-btn {
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-weight: 600;
  }
  .glyph {
    display: flex;
    gap: 3px;
  }
  .glyph i {
    display: block;
    width: 12px;
    height: 16px;
    background: currentColor;
    opacity: 0.55;
    border-radius: 1px;
  }
  .glyph:not(.double) i {
    width: 16px;
  }
</style>
