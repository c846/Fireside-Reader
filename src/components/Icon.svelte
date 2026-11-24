<script lang="ts">
  let { name, size = 18 }: { name: 'home' | 'settings' | 'search' | 'plus'; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="square"
  stroke-linejoin="miter"
  aria-hidden="true"
>
  {#if name === 'home'}
    <path d="M3.5 11 12 4l8.5 7" />
    <path d="M6 9.5V20h4.5v-5.5h3V20H18V9.5" />
  {:else if name === 'settings'}
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <rect x="14" y="4.5" width="4" height="5" />
    <rect x="6" y="14.5" width="4" height="5" />
  {:else if name === 'search'}
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5.5 5.5" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {/if}
</svg>
