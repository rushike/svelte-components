<script>
  import { initTheme } from "../lib/themeManager";
  
  let { children } = $props();

  initTheme(); // Runs on client-side mount (ignored on SSR due to window check)
</script>

<div class="contents">
  {@render children()}
</div>