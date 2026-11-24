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
