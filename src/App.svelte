<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { app, flushAll, initApp, syncFullscreen, toggleFullscreen } from './lib/store.svelte';
  import Welcome from './components/Welcome.svelte';
  import Dashboard from './components/Dashboard.svelte';
  import Reader from './components/Reader.svelte';
  import SettingsMenu from './components/SettingsMenu.svelte';

  $effect(() => {
    document.documentElement.dataset.theme = app.settings.theme;
  });

  onMount(() => {
    initApp();
    // Make sure the last-read position and settings hit the disk before the window goes away.
    const unlisteners: (() => void)[] = [];
    const win = getCurrentWindow();
    win
      .onCloseRequested(async () => {
        await flushAll();
      })
      .then((u) => unlisteners.push(u))
      .catch(() => {});
    win
      .onResized(() => {
        syncFullscreen().catch(() => {});
      })
      .then((u) => unlisteners.push(u))
      .catch(() => {});
    return () => unlisteners.forEach((u) => u());
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'F11') {
      e.preventDefault();
      toggleFullscreen();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- Default backdrop; cross-fades when the theme changes. -->
{#key app.settings.theme}
  <div class="app-grad grad-{app.settings.theme}" transition:fade={{ duration: 450 }}></div>
{/key}

{#if app.backgroundUrl}
  {#key app.backgroundUrl}
    <div class="app-bg" style:background-image="url({app.backgroundUrl})" transition:fade={{ duration: 500 }}></div>
  {/key}
{/if}

{#if app.view === 'welcome'}
  <Welcome />
{:else if app.view === 'dashboard'}
  <Dashboard />
{:else if app.view === 'reader' && app.openBookId}
  {#key app.openBookId}
    <Reader id={app.openBookId} />
  {/key}
{/if}

{#if app.settingsOpen}
  <SettingsMenu />
{/if}

<style>
  /*
   * Three-colour backdrop: one colour pooled in the top-left corner, the
   * theme's own colour through the middle, another in the bottom-right.
   * Each corner colour is strongest right at the edge and eases out well
   * before the centre, so the glass panes have something soft to blur.
   */
  .app-grad {
    position: fixed;
    inset: 0;
    z-index: -2;
    background-color: var(--mid);
    background-image:
      radial-gradient(
        ellipse 80% 75% at 0% 0%,
        rgba(var(--tl), 0.9) 0%,
        rgba(var(--tl), 0.5) 22%,
        rgba(var(--tl), 0.18) 48%,
        rgba(var(--tl), 0) 75%
      ),
      radial-gradient(
        ellipse 80% 75% at 100% 100%,
        rgba(var(--br), 0.9) 0%,
        rgba(var(--br), 0.5) 22%,
        rgba(var(--br), 0.18) 48%,
        rgba(var(--br), 0) 75%
      );
  }
  /* soft aqua · white · soft orange */
  .grad-default {
    --tl: 128, 216, 214;
    --mid: #ffffff;
    --br: 255, 180, 118;
  }
  /* burnt yellow · paper yellow · orange */
  .grad-paper {
    --tl: 214, 158, 48;
    --mid: #f5ecd2;
    --br: 240, 138, 44;
  }
  /* lighter blue · night blue · dark orange */
  .grad-night {
    --tl: 38, 76, 132;
    --mid: #0a1220;
    --br: 120, 50, 12;
  }
  .app-bg {
    position: fixed;
    inset: 0;
    z-index: -1;
    background-size: cover;
    background-position: center;
  }
  /* A light wash in the theme colour keeps text on glass panes legible. */
  .app-bg::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(var(--bg-rgb), 0.22);
    transition: background-color 0.4s ease;
  }
</style>
