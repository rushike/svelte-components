<script>
  import { onMount } from 'svelte';
  // Assuming these utilities exist based on your reference
  import { exporter, importer } from "@rushike/sqlite3-client";

  // --- State (Svelte 5 Runes) ---
  let secrets = $state([]);
  let isLoading = $state(false);
  let statusMsg = $state('Ready');
  let searchQuery = $state('');
  let selectedSecret = $state(null);

  // Filtered list based on search
  let filteredSecrets = $derived(
    secrets.filter(s => 
      s.key?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.source?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  // --- Logic ---
  async function loadSecrets() {
    isLoading = true;
    try {
      // Fetching the raw data from the 'secrets' table
      const data = await exporter.loadJson('secrets');
      secrets = JSON.parse(data);
      statusMsg = `Loaded ${secrets.length} secrets.`;
    } catch (e) {
      statusMsg = `Error: ${e.message}`;
    } finally {
      isLoading = false;
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    statusMsg = "Value copied to clipboard";
    setTimeout(() => statusMsg = "Ready", 2000);
  }

  $effect(() => {
    loadSecrets();
  });
</script>

<div class="flex flex-col h-full bg-ui-bg text-ui-text antialiased font-sans">
  <header class="h-14 border-b border-ui-border bg-ui-surface flex items-center justify-between px-6 shrink-0">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <span class="text-accent text-xl">󰒘</span> 
        <h1 class="text-lg font-normal text-white">Secret Manager</h1>
      </div>
      <div class="h-6 w-[1px] bg-ui-border mx-2"></div>
      
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-ui-muted text-xs">🔍</span>
        <input 
          bind:value={searchQuery}
          placeholder="Filter secrets..."
          class="bg-ui-bg border border-ui-border rounded-md pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:border-accent w-64 transition-all"
        />
      </div>
    </div>

    <div class="flex gap-2">
      <button 
        onclick={loadSecrets}
        class="px-4 py-2 text-xs font-medium bg-ui-btn hover:bg-ui-btn-hover text-white rounded transition-colors flex items-center gap-2"
      >
        <span>↻</span> Refresh
      </button>
      <button 
        class="px-4 py-2 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded shadow-sm transition-all active:scale-95"
      >
        + Create Secret
      </button>
    </div>
  </header>

  <main class="flex-1 overflow-auto p-6">
    <div class="max-w-7xl mx-auto">
      
      {#if statusMsg !== 'Ready'}
        <div class="mb-4 px-4 py-2 rounded border {statusMsg.includes('Error') ? 'border-ui-error/50 bg-ui-error/10 text-ui-error' : 'border-accent/50 bg-accent/10 text-accent'} text-xs font-mono">
          {statusMsg}
        </div>
      {/if}

      <div class="bg-ui-surface border border-ui-border rounded-lg overflow-hidden shadow-sm">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-ui-header border-b border-ui-border text-[11px] uppercase tracking-wider text-ui-muted font-bold">
              <th class="px-6 py-3 w-10"><input type="checkbox" class="rounded border-ui-border bg-ui-bg" /></th>
              <th class="px-6 py-3">Name (Key)</th>
              <th class="px-6 py-3">Type</th>
              <th class="px-6 py-3">Source</th>
              <th class="px-6 py-3">Version</th>
              <th class="px-6 py-3">Created</th>
              <th class="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="text-sm">
            {#each filteredSecrets as secret}
              <tr class="border-b border-ui-border hover:bg-ui-hover transition-colors group">
                <td class="px-6 py-4"><input type="checkbox" class="rounded border-ui-border bg-ui-bg" /></td>
                <td class="px-6 py-4 font-medium text-white">
                  <div class="flex flex-col">
                    <span>{secret.key}</span>
                    <span class="text-[10px] text-ui-muted font-mono">{secret.source_id || 'no-id'}</span>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <span class="px-2 py-0.5 rounded-full bg-ui-header border border-ui-border text-[10px] text-ui-log-key uppercase">
                    {secret.secret_type || 'generic'}
                  </span>
                </td>
                <td class="px-6 py-4 text-ui-muted">{secret.source}</td>
                <td class="px-6 py-4">
                  <span class="text-ui-text italic">v{secret.version}</span>
                </td>
                <td class="px-6 py-4 text-ui-muted text-xs">
                  {new Date(secret.create_ts).toLocaleDateString()}
                </td>
                <td class="px-6 py-4 text-right">
                  <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onclick={() => copyToClipboard(secret.value)}
                      title="Copy Secret Value"
                      class="p-1.5 hover:bg-ui-active rounded text-ui-muted hover:text-white"
                    >
                      📋
                    </button>
                    <button 
                      class="p-1.5 hover:bg-ui-active rounded text-ui-muted hover:text-white"
                    >
                      ⋮
                    </button>
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="7" class="px-6 py-20 text-center text-ui-muted">
                  <div class="flex flex-col items-center gap-2">
                    <span class="text-3xl">∅</span>
                    <p>No secrets found matching your criteria.</p>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <footer class="h-8 border-t border-ui-border bg-ui-surface flex items-center px-6 text-[10px] text-ui-muted">
    <div class="flex gap-4">
      <span>Total: {secrets.length}</span>
      <span>Storage: SQLite (Local)</span>
      {#if isLoading}
        <span class="text-accent animate-pulse">Syncing...</span>
      {/if}
    </div>
  </footer>
</div>

<style>
  /* Custom scrollbar to match VS Code dark style */
  main::-webkit-scrollbar {
    width: 10px;
  }
  main::-webkit-scrollbar-thumb {
    background: var(--border-main);
  }
  main::-webkit-scrollbar-thumb:hover {
    background: var(--btn-hover);
  }
</style>