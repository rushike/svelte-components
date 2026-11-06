<script lang="ts">
  import { onMount } from 'svelte';
  import SessionManager from './SessionManager.svelte';
  import PDFExtractor from './PDFExtractor.svelte';
  import { ServerPdfProvider } from '../lib/providers';
  import { getOrInitWasmEngine } from './pdf-extractor/pdfExtractorService';
  import {
    STORAGE_KEY_USE_WASM,
    getActiveSessionStorageKey,
  } from './pdf-extractor/pdfExtractorConstants';

  let {
    baseUrl = 'http://localhost:9191',
    provider = null,
    useWasm = $bindable(false),
  }: {
    baseUrl?: string;
    provider?: any;
    useWasm?: boolean;
  } = $props();

  let activeSessionId = $state<string | null>(null);
  let activeFilePath = $state<string>('');
  let activePageCount = $state<number>(1);
  let activeDocumentId = $state<string | null>(null);
  let activeDocuments = $state<any[]>([]);
  let showSessionModal = $state(false);

  let wasmProviderInstance = $state<any>(null);
  let serverProviderInstance = $derived(
    provider || new ServerPdfProvider(baseUrl)
  );
  let activeProvider = $derived(
    useWasm && wasmProviderInstance
      ? wasmProviderInstance
      : serverProviderInstance
  );

  async function ensureWasmProvider() {
    if (useWasm && !wasmProviderInstance) {
      try {
        wasmProviderInstance = await getOrInitWasmEngine();
      } catch (err) {
        console.error('Failed to init WASM engine in PDFExtractorApp:', err);
      }
    }
  }

  $effect(() => {
    if (useWasm) {
      ensureWasmProvider();
    }
  });

  let prevEngineState: boolean | null = $state(null);

  // Switch active session when engine mode changes
  $effect(() => {
    const currentWasm = useWasm;
    if (prevEngineState !== null && prevEngineState !== currentWasm) {
      if (typeof localStorage !== 'undefined') {
        const key = getActiveSessionStorageKey(currentWasm);
        activeSessionId = localStorage.getItem(key);
      }
    }
    prevEngineState = currentWasm;
  });

  onMount(() => {
    if (typeof localStorage !== 'undefined') {
      const savedEngine = localStorage.getItem(STORAGE_KEY_USE_WASM);
      if (savedEngine === 'true') {
        useWasm = true;
      }
      const key = getActiveSessionStorageKey(useWasm);
      const savedSession = localStorage.getItem(key);
      if (savedSession) {
        activeSessionId = savedSession;
      }
    }
  });

  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      const key = getActiveSessionStorageKey(useWasm);
      if (activeSessionId) {
        localStorage.setItem(key, activeSessionId);
      } else {
        localStorage.removeItem(key);
      }
    }
  });

  function handleSessionSelect(detail: { id: string; file_path: string; page_count: number; document_id?: string | null }) {
    activeSessionId = detail.id;
    activeFilePath = detail.file_path;
    activePageCount = detail.page_count;
    activeDocumentId = detail.document_id || null;
  }
</script>

<div class="pdf-extractor-app bg-slate-950 text-slate-100 h-full w-full p-3 flex flex-col space-y-3 font-sans overflow-hidden box-border">
  <!-- Top Component 1: Compact 1-Line Session Manager Bar -->
  <SessionManager
    {baseUrl}
    provider={activeProvider}
    bind:useWasm
    bind:activeSessionId
    bind:activeFilePath
    bind:activePageCount
    bind:activeDocumentId
    bind:activeDocuments
    bind:showModal={showSessionModal}
    on:select={(e) => handleSessionSelect(e.detail)}
  />

  <!-- Main Component 2: PDF Extractor (2-Column Layout with Output Footer Modal) -->
  <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
    {#if activeSessionId}
      <PDFExtractor
        {baseUrl}
        provider={activeProvider}
        bind:useWasm
        sessionId={activeSessionId}
        pageCount={activePageCount}
        documentId={activeDocumentId}
      />
    {:else}
      <div class="bg-slate-900 border border-slate-800 rounded-lg p-16 text-center text-slate-400 shadow-xl space-y-4 m-auto max-w-lg">
        <span class="text-5xl block animate-bounce">📄</span>
        <h3 class="text-base font-bold text-slate-200">No PDF Session Active</h3>
        <p class="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          The <strong>{useWasm ? 'client WebAssembly database (OPFS)' : 'native backend server'}</strong> currently has no active session. Click below to create or upload a PDF document.
        </p>
        <button
          onclick={() => (showSessionModal = true)}
          class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition shadow-lg flex items-center space-x-2 mx-auto cursor-pointer"
        >
          <span>✨</span>
          <span>Create or Open {useWasm ? 'WASM' : 'Server'} Session</span>
        </button>
      </div>
    {/if}
  </div>
</div>
