<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicIn, quintOut } from 'svelte/easing';

  let { onyes, onno }: { onyes: () => void; onno: () => void } = $props();

  let noBtn: HTMLButtonElement;
  // Start on "No" so a stray Enter doesn't close the app.
  onMount(() => noBtn.focus());

  const travel = Math.round(window.innerHeight * 0.5);
</script>

<div class="backdrop" role="presentation" onclick={onno} transition:fade={{ duration: 200 }}></div>

<div class="center">
  <div
    class="dialog l1 pane-shadow"
    role="alertdialog"
    aria-label="Close Fireside Reader?"
    in:fly={{ y: -travel, duration: 480, easing: quintOut, opacity: 1 }}
    out:fly={{ y: -travel, duration: 280, easing: cubicIn, opacity: 1 }}
  >
    <h2>Close Fireside Reader?</h2>
    <div class="actions">
      <button class="btn l3 rounded grow" onclick={onyes}>Yes</button>
      <button class="btn l2 rounded grow" bind:this={noBtn} onclick={onno}>No</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--scrim);
  }
  .center {
    position: fixed;
    inset: 0;
    z-index: 51;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .dialog {
    pointer-events: auto;
    padding: 26px 30px 28px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-width: 320px;
  }
  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .btn {
    height: 42px;
    font-weight: 600;
  }
</style>
