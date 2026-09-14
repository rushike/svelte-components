<script>
  import Editor from "./Editor.svelte";
  import { exporter, importer } from "@rushike/sqlite3-client";
  import { readFile, writeFile } from "/myfinsheet-client/opfs.js"
    import { act } from "react";

  // --- State Management (Svelte 5 Runes) ---
  let CONFIG_TABLES = ["config", "document_type", "secrets"];
  let BASE_PATH = "/workspace/database/tables"
  let activeTable = $state(CONFIG_TABLES[1]);
  let editorContent = $state('[]');
  let statusMsg = $state('Ready');
  let isLoading = $state(false);

  // --- Logic ---
  let tablePath = $derived(`${BASE_PATH}/${activeTable}.json`);


  async function readFromDatabase(tableName) {
    activeTable = tableName;
    isLoading = true;
    editorContent = await exporter.loadJson(activeTable);
    statusMsg = `Loaded ${activeTable} successfully.`;
    isLoading = false;
  }

  async function readFromOPFS() {
    editorContent = await (await readFile(tablePath)).text()
  }

  async function saveToDatabase() {
    try {
      await importer.fromJson(tablePath);
      statusMsg = `Database updated from ${tablePath}`;
      await readFromDatabase(activeTable);
    } catch (e) {
      statusMsg = `Import Error: ${e.message}`;
    } finally {
      isLoading = false;
    }
  }

  async function saveToOPFS(content) {
    writeFile(tablePath, content)
  }

  $effect(() => {
    readFromDatabase(activeTable);
  });
</script>

<div class="flex h-full bg-background text-foreground antialiased font-sans">
  
  <aside class="w-72 bg-card border-r border-border flex flex-col shadow-xl">
    <div class="p-6">
      <h2 class="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Configuration Tables</h2>
    </div>
    
    <nav class="flex-1 px-2 space-y-0.5">
      {#each CONFIG_TABLES as table}
        <button
          onclick={() => readFromDatabase(table)}
          class="w-full flex items-center px-4 py-2 text-sm transition-colors
            {activeTable === table 
              ? 'bg-primary text-primary-foreground text-white' 
              : 'text-muted-foreground hover:bg-accent text-accent-foreground hover:text-foreground'}"
        >
          <span class="mr-3 text-xs {activeTable === table ? 'text-accent' : 'text-ui-border'}">
            {activeTable === table ? '●' : '○'}
          </span>
          {table}
        </button>
      {/each}
    </nav>

    <div class="p-4 bg-card border-t border-border">
      <p class="text-[11px] font-mono leading-tight {statusMsg.includes('Error') ? 'text-destructive' : 'text-muted-foreground'}">
        <span class="text-primary">LOG:</span> {statusMsg}
      </p>
    </div>
  </aside>

  <main class="flex-1 flex flex-col overflow-hidden">
    <header class="h-12 border-b border-border bg-card flex items-center justify-between px-6">
      <div class="flex items-center gap-3">
        <div class="px-1.5 py-0.5 rounded bg-ui-border text-[10px] font-mono text-muted-foreground">DB</div>
        <h1 class="text-sm font-medium text-foreground">{activeTable}.json</h1>
        {#if isLoading}
          <div class="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
        {/if}
      </div>

      <div class="flex gap-2">
        <button 
          onclick={readFromOPFS}
          class="px-3 py-1.5 text-xs bg-primary hover:bg-primary-hover text-white rounded-sm transition-colors"
        >
          Read OPFS
        </button>
        <button 
          onclick={e => readFromDatabase(activeTable)}
          class="px-3 py-1.5 text-xs bg-primary hover:bg-primary-hover text-white rounded-sm transition-colors"
        >
          Read DB
        </button>
        <button 
          onclick={saveToDatabase}
          class="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded-sm transition-all active:scale-95 shadow-sm"
        >
          Save to Database
        </button>
      </div>
    </header>

    <div class="flex-1 p-4 bg-background flex flex-col">
      <div class="relative flex-1 border border-border bg-background overflow-hidden">
        <div class="absolute bottom-0 right-0 px-2 py-1 bg-accent text-[10px] text-white z-10">
          JSON
        </div>
        <Editor content={editorContent} lang="json" onUpdate = {e => saveToOPFS(e.target.value)}></Editor>
      </div>
    </div>
  </main>
</div>
