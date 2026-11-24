<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicIn, quintOut } from 'svelte/easing';
  import { app, ready } from '../lib/store.svelte';

  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening';

  let show = $state(false);

  onMount(() => {
    let hold: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    Promise.race([ready, new Promise((r) => setTimeout(r, 900))]).then(() => {
      if (cancelled) return;
      show = true;
      hold = setTimeout(() => (show = false), 1900);
    });
    return () => {
      cancelled = true;
      clearTimeout(hold);
    };
  });
</script>

<div class="welcome">
  {#if show}
    <div
      class="stack"
      in:fly={{ y: -140, duration: 760, easing: quintOut, opacity: 0.2 }}
      out:fly={{ y: -110, duration: 380, easing: cubicIn, opacity: 0 }}
      onoutroend={() => (app.view = 'dashboard')}
    >
      <div class="back l1"></div>
      <div class="front l1 pane-shadow" in:fly={{ y: -40, duration: 900, delay: 90, easing: quintOut, opacity: 1 }}>
        <span class="tag l2 rounded">Fireside Reader</span>
        <h1>{greeting} {app.userName || 'reader'}!</h1>
      </div>
    </div>
  {/if}
</div>

<style>
  .welcome {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .stack {
    position: relative;
  }
  .back {
    position: absolute;
    inset: 0;
    transform: translate(18px, 18px);
  }
  .front {
    position: relative;
    padding: 34px 56px 40px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }
  .tag {
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 5px 10px;
  }
  h1 {
    margin: 0;
    font-weight: 600;
    font-size: clamp(28px, 4vw, 44px);
    letter-spacing: -0.01em;
  }
</style>
