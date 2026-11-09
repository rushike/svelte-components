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
  let wasmInitializing = $state(false);
  let serverProviderInstance = $derived(
    provider || new ServerPdfProvider(baseUrl)
  );
  let activeProvider = $derived(
    useWasm
      ? (wasmProviderInstance || null)
      : serverProviderInstance
  );

  let sessionCreateLoading = $state(false);
  let emptyStateError = $state('');

  async function getProviderForMode(isWasm: boolean) {
    if (isWasm) {
      if (!wasmProviderInstance) {
        wasmInitializing = true;
        try {
          wasmProviderInstance = await getOrInitWasmEngine();
        } finally {
          wasmInitializing = false;
        }
      }
      return wasmProviderInstance;
    }
    return serverProviderInstance;
  }

  async function switchEngine(targetWasm: boolean) {
    emptyStateError = '';
    useWasm = targetWasm;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_USE_WASM, targetWasm ? 'true' : 'false');
    }

    try {
      const prov = await getProviderForMode(targetWasm);
      if (!prov) return;

      const sessions = await prov.listSessions().catch((err: any) => {
        console.warn(`[PDFExtractorApp] List sessions failed for ${targetWasm ? 'WASM' : 'Server'}:`, err?.message || err);
        return [];
      });

      const key = getActiveSessionStorageKey(targetWasm);
      const savedSessionId = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;

      const targetSessionId = (savedSessionId && sessions.some((s: any) => s.id === savedSessionId))
        ? savedSessionId
        : (sessions.length > 0 ? sessions[0].id : null);

      if (targetSessionId) {
        const data = await prov.getSession(targetSessionId);
        activeSessionId = data.session.id;
        activeFilePath = data.session.file_path || '';
        activePageCount = data.page_count || 1;
        activeDocuments = data.session.config?.documents || data.session.documents || [];
        activeDocumentId = data.session.config?.active_document_id || activeDocuments[0]?.id || null;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, activeSessionId);
        }
      } else {
        activeSessionId = null;
        activeFilePath = '';
        activePageCount = 1;
        activeDocumentId = null;
        activeDocuments = [];
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
        }
      }
    } catch (err: any) {
      console.error('[PDFExtractorApp] switchEngine error:', err);
      activeSessionId = null;
    }
  }

  async function createDefaultSession(targetWasm: boolean) {
    sessionCreateLoading = true;
    emptyStateError = '';
    try {
      useWasm = targetWasm;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_USE_WASM, targetWasm ? 'true' : 'false');
      }

      const prov = await getProviderForMode(targetWasm);
      if (!prov) throw new Error('Provider could not be initialized');

      const data = await prov.createSession('sample.pdf', {});
      activeSessionId = data.session.id;
      activeFilePath = data.session.file_path || 'sample.pdf';
      activePageCount = data.page_count || 1;
      activeDocuments = data.session.config?.documents || data.session.documents || [];
      activeDocumentId = data.session.config?.active_document_id || activeDocuments[0]?.id || null;

      if (typeof localStorage !== 'undefined' && activeSessionId) {
        localStorage.setItem(getActiveSessionStorageKey(targetWasm), activeSessionId);
      }
    } catch (err: any) {
      console.error(`[PDFExtractorApp] Failed to create ${targetWasm ? 'WASM' : 'Server'} default session:`, err);
      const msg = err?.message || String(err);
      if (!targetWasm && (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('404'))) {
        emptyStateError = `Could not connect to backend server (${baseUrl}). Please ensure the local server is running, or switch to WASM (Client) mode.`;
      } else {
        emptyStateError = `Failed to create ${targetWasm ? 'WASM' : 'Server'} session: ${msg}`;
      }
    } finally {
      sessionCreateLoading = false;
    }
  }

  function openCreateModalFor(targetWasm: boolean) {
    emptyStateError = '';
    useWasm = targetWasm;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_USE_WASM, targetWasm ? 'true' : 'false');
    }
    showSessionModal = true;
  }

  let prevEngineState: boolean | null = $state(null);

  // Sync when useWasm is toggled from child components
  $effect(() => {
    const currentWasm = useWasm;
    if (prevEngineState !== null && prevEngineState !== currentWasm) {
      switchEngine(currentWasm);
    }
    prevEngineState = currentWasm;
  });

  onMount(async () => {
    let initialEngine = false;
    if (typeof localStorage !== 'undefined') {
      const savedEngine = localStorage.getItem(STORAGE_KEY_USE_WASM);
      if (savedEngine === 'true') {
        initialEngine = true;
      }
    }
    useWasm = initialEngine;
    prevEngineState = initialEngine;
    await switchEngine(initialEngine);
  });

  function handleSessionSelect(detail: { id: string; file_path: string; page_count: number; document_id?: string | null }) {
    activeSessionId = detail.id;
    activeFilePath = detail.file_path;
    activePageCount = detail.page_count;
    activeDocumentId = detail.document_id || null;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(getActiveSessionStorageKey(useWasm), detail.id);
    }
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
        onwasmtoggle={(enabled) => switchEngine(enabled)}
      />
    {:else}
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-10 text-center text-slate-400 shadow-2xl space-y-6 m-auto max-w-2xl">
        <div class="space-y-2">
          <span class="text-5xl block animate-bounce">📄</span>
          <h3 class="text-lg font-bold text-slate-100">No PDF Session Active</h3>
          <p class="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
            There is currently no active PDF session in the <strong class="text-slate-200">{useWasm ? 'client WebAssembly database (OPFS)' : 'native backend server'}</strong>.
            Choose an engine below and create or open a document session.
          </p>
        </div>

        {#if emptyStateError}
          <div class="bg-red-950/80 border border-red-700/80 text-red-200 text-xs p-3 rounded-lg flex items-center justify-between text-left">
            <div class="flex items-center space-x-2">
              <span class="text-base shrink-0">⚠️</span>
              <span>{emptyStateError}</span>
            </div>
            <button
              onclick={() => (emptyStateError = '')}
              class="text-red-400 hover:text-white font-bold text-sm px-1.5 ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        {/if}

        <!-- Easy Switch Button / Engine Selector -->
        <div class="bg-slate-950 border border-slate-800 p-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
          <div class="space-y-0.5">
            <span class="text-xs font-semibold text-slate-200 block">Active Execution Engine:</span>
            <span class="text-[11px] text-slate-400 block">
              {useWasm
                ? '⚡ WebAssembly (client-side in-browser, no server needed)'
                : `🌐 Native Server (${baseUrl})`}
            </span>
          </div>

          <div class="inline-flex rounded-lg bg-slate-900 p-1 border border-slate-800 space-x-1 shrink-0">
            <button
              type="button"
              onclick={() => switchEngine(false)}
              class="px-3.5 py-1.5 text-xs font-bold rounded-md transition cursor-pointer flex items-center space-x-1.5 {!useWasm ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}"
              title="Switch to Server (API)"
            >
              <span>🌐</span>
              <span>Server (Default)</span>
            </button>

            <button
              type="button"
              onclick={() => switchEngine(true)}
              class="px-3.5 py-1.5 text-xs font-bold rounded-md transition cursor-pointer flex items-center space-x-1.5 {useWasm ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}"
              title="Switch to WASM (Client-Side)"
            >
              <span>⚡</span>
              <span>WASM (Client)</span>
            </button>
          </div>
        </div>

        {#if wasmInitializing}
          <div class="text-xs text-amber-400 animate-pulse flex items-center justify-center space-x-1.5 py-1">
            <span>●</span>
            <span>Initializing WebAssembly runtime...</span>
          </div>
        {/if}

        <!-- Dual Option Cards: Create Server Session vs Create WASM Session -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left pt-1">
          <!-- Card 1: Server Session (Default) -->
          <div class="bg-slate-950/90 border rounded-xl p-4 flex flex-col justify-between space-y-3.5 transition {(!useWasm) ? 'border-sky-500/70 shadow-lg ring-1 ring-sky-500/20' : 'border-slate-800 opacity-80 hover:opacity-100'}">
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-sky-400 flex items-center space-x-1.5">
                  <span>🌐</span>
                  <span>Server Session</span>
                </span>
                <span class="text-[10px] bg-sky-950 text-sky-300 border border-sky-800/60 px-1.5 py-0.5 rounded font-mono font-semibold">
                  Default
                </span>
              </div>
              <p class="text-[11px] text-slate-400 leading-relaxed">
                Processes PDFs using the local backend REST API server on <code>{baseUrl}</code>.
              </p>
            </div>

            <div class="space-y-2 pt-1">
              <button
                onclick={() => createDefaultSession(false)}
                disabled={sessionCreateLoading}
                class="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs px-3.5 py-2 rounded-lg transition shadow flex items-center justify-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                <span>✨</span>
                <span>Load Sample PDF (Server)</span>
              </button>

              <button
                onclick={() => openCreateModalFor(false)}
                class="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3.5 py-2 rounded-lg transition shadow flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <span>📁</span>
                <span>Upload / Open on Server</span>
              </button>
            </div>
          </div>

          <!-- Card 2: WASM Session -->
          <div class="bg-slate-950/90 border rounded-xl p-4 flex flex-col justify-between space-y-3.5 transition {useWasm ? 'border-emerald-500/70 shadow-lg ring-1 ring-emerald-500/20' : 'border-slate-800 opacity-80 hover:opacity-100'}">
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-emerald-400 flex items-center space-x-1.5">
                  <span>⚡</span>
                  <span>WASM Session</span>
                </span>
                <span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono font-semibold">
                  Client-Side
                </span>
              </div>
              <p class="text-[11px] text-slate-400 leading-relaxed">
                Runs 100% in your browser using OPFS SQLite and compiled WebAssembly. No server needed.
              </p>
            </div>

            <div class="space-y-2 pt-1">
              <button
                onclick={() => createDefaultSession(true)}
                disabled={sessionCreateLoading}
                class="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs px-3.5 py-2 rounded-lg transition shadow flex items-center justify-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                <span>✨</span>
                <span>Load Sample PDF (WASM)</span>
              </button>

              <button
                onclick={() => openCreateModalFor(true)}
                class="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3.5 py-2 rounded-lg transition shadow flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <span>📁</span>
                <span>Upload / Open in WASM</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
