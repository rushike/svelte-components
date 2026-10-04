<script lang="ts">
  import SessionManager from './SessionManager.svelte';
  import PDFExtractor from './PDFExtractor.svelte';

  export let baseUrl: string = 'http://localhost:9191';

  let activeSessionId: string | null = null;
  let activeFilePath: string = '';
  let activePageCount: number = 1;

  function handleSessionSelect(event: CustomEvent<{ id: string; file_path: string; page_count: number }>) {
    activeSessionId = event.detail.id;
    activeFilePath = event.detail.file_path;
    activePageCount = event.detail.page_count;
  }
</script>

<div class="pdf-extractor-app bg-slate-950 text-slate-100 h-full w-full p-3 flex flex-col space-y-3 font-sans overflow-hidden box-border">
  <!-- Top Component 1: Compact 1-Line Session Manager Bar -->
  <SessionManager
    {baseUrl}
    bind:activeSessionId
    bind:activeFilePath
    bind:activePageCount
    on:select={handleSessionSelect}
  />

  <!-- Main Component 2: PDF Extractor (2-Column Layout with Output Footer Modal) -->
  <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
    {#if activeSessionId}
      <PDFExtractor
        {baseUrl}
        sessionId={activeSessionId}
        pageCount={activePageCount}
      />
    {:else}
      <div class="bg-slate-900 border border-slate-800 rounded-lg p-16 text-center text-slate-400 shadow-xl space-y-3">
        <span class="text-4xl block">📄</span>
        <h3 class="text-base font-bold text-slate-200">No Session Selected</h3>
        <p class="text-xs text-slate-400 max-w-md mx-auto">
          Please click <strong>Manage Sessions</strong> in the bar above to open an existing PDF session or upload a new PDF document.
        </p>
      </div>
    {/if}
  </div>
</div>
