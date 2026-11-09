<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type { PdfProvider, SessionRecord, SessionDocument } from '../lib/providers';
  import { ServerPdfProvider, WasmPdfProvider } from '../lib/providers';
  import { getOrInitWasmEngine } from './pdf-extractor/pdfExtractorService';
  import {
    STORAGE_KEY_USE_WASM,
    getActiveSessionStorageKey,
  } from './pdf-extractor/pdfExtractorConstants';

  let {
    baseUrl = 'http://localhost:9191',
    provider = null,
    useWasm = $bindable(false),
    activeSessionId = $bindable(null),
    activeFilePath = $bindable(''),
    activePageCount = $bindable(1),
    activeDocumentId = $bindable(null),
    activeDocuments = $bindable<SessionDocument[]>([]),
    showModal = $bindable(false),
  }: {
    baseUrl?: string;
    provider?: PdfProvider | null;
    useWasm?: boolean;
    activeSessionId?: string | null;
    activeFilePath?: string;
    activePageCount?: number;
    activeDocumentId?: string | null;
    activeDocuments?: SessionDocument[];
    showModal?: boolean;
  } = $props();

  let wasmProvider = $state<WasmPdfProvider | null>(null);
  let wasmInitializing = $state(false);
  let autoCreateAttempted = $state(false);

  let activeProvider = $derived(
    useWasm
      ? wasmProvider
      : (provider || new ServerPdfProvider(baseUrl))
  );

  async function setEngineMode(enabled: boolean) {
    if (useWasm === enabled) return;
    useWasm = enabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_USE_WASM, enabled ? 'true' : 'false');
    }
  }

  async function createDefaultSampleSession() {
    loading = true;
    errorMsg = '';
    try {
      if (useWasm && !wasmProvider) {
        wasmProvider = await getOrInitWasmEngine();
      }
      const prov = activeProvider;
      if (!prov) throw new Error('Provider not available');
      const data = await prov.createSession('sample.pdf', {});
      await fetchSessions();
      await selectSession(data.session.id);
      dispatch('create', { id: data.session.id });
    } catch (err: any) {
      errorMsg = `Failed to create default session: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  const dispatch = createEventDispatcher<{
    select: { id: string; file_path: string; page_count: number; document_id?: string | null };
    create: { id: string };
    delete: { id: string };
  }>();

  let sessions = $state<SessionRecord[]>([]);
  let loading = $state(false);
  let errorMsg = $state('');
  let filePathInput = $state('');
  let uploadFiles = $state<FileList | null>(null);
  let bankHint = $state('');
  let passwordInput = $state('');

  async function syncEngine() {
    if (useWasm && !wasmProvider) {
      wasmInitializing = true;
      try {
        wasmProvider = await getOrInitWasmEngine();
      } catch (err: any) {
        errorMsg = `Failed to initialize WASM engine: ${err.message}`;
        useWasm = false;
      } finally {
        wasmInitializing = false;
      }
    }
    await fetchSessions();
  }

  async function fetchSessions() {
    if (useWasm && !wasmProvider && !provider) {
      return;
    }
    loading = true;
    errorMsg = '';
    try {
      const prov = activeProvider;
      if (!prov) return;
      sessions = await prov.listSessions();
      if (sessions.length > 0) {
        const storageKey = getActiveSessionStorageKey(useWasm);
        const savedSessionId = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
        const targetId = (activeSessionId && sessions.some(s => s.id === activeSessionId))
          ? activeSessionId
          : (savedSessionId && sessions.some(s => s.id === savedSessionId))
            ? savedSessionId
            : sessions[0].id;

        selectSession(targetId);
      } else {
        activeSessionId = null;
        activeFilePath = '';
        activePageCount = 1;
        activeDocumentId = null;
        activeDocuments = [];
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(getActiveSessionStorageKey(useWasm));
        }
      }
    } catch (err: any) {
      errorMsg = `Failed to fetch ${useWasm ? 'WASM' : 'Server'} sessions: ${err.message}`;
      sessions = [];
      activeSessionId = null;
      activeFilePath = '';
      activePageCount = 1;
      activeDocumentId = null;
      activeDocuments = [];
    } finally {
      loading = false;
    }
  }

  async function selectSession(id: string) {
    activeSessionId = id;
    loading = true;
    try {
      const prov = activeProvider;
      if (!prov) return;
      const data = await prov.getSession(id);
      activeFilePath = data.session.file_path || '';
      activePageCount = data.page_count || 1;
      activeDocuments = data.session.config?.documents || data.session.documents || [];
      activeDocumentId = data.session.config?.active_document_id || activeDocuments[0]?.id || null;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(getActiveSessionStorageKey(useWasm), id);
      }
      dispatch('select', {
        id: data.session.id,
        file_path: activeFilePath,
        page_count: activePageCount,
        document_id: activeDocumentId,
      });
      showModal = false;
    } catch (err: any) {
      errorMsg = `Failed to select session ${id}: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  let copiedSnippet = $state('');

  function copyLoadSnippet(name: string) {
    const snippet = `LOAD "${name}" AS doc`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(snippet);
      copiedSnippet = name;
      setTimeout(() => {
        if (copiedSnippet === name) copiedSnippet = '';
      }, 2000);
    }
  }

  async function createSessionFromPath() {
    if (!filePathInput.trim()) return;
    loading = true;
    errorMsg = '';
    try {
      const config = {
        bank: bankHint.trim() || undefined,
        password: passwordInput.trim() || undefined,
      };
      const prov = activeProvider;
      if (!prov) return;
      const paths = filePathInput
        .split(/[\n,]+/)
        .map((p) => p.trim())
        .filter(Boolean);

      if (paths.length === 0) return;

      if (activeSessionId) {
        await prov.addSessionFiles(activeSessionId, paths);
        filePathInput = '';
        await selectSession(activeSessionId);
        return;
      }
      const data = await prov.createSession(paths.length === 1 ? paths[0] : paths, config);
      filePathInput = '';
      await fetchSessions();
      selectSession(data.session.id);
      dispatch('create', { id: data.session.id });
    } catch (err: any) {
      errorMsg = `Failed to create session: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  async function uploadSessionFile() {
    if (!uploadFiles || uploadFiles.length === 0) return;
    loading = true;
    errorMsg = '';
    try {
      const prov = activeProvider;
      if (!prov) return;
      const config = {
        bank: bankHint.trim() || undefined,
        password: passwordInput.trim() || undefined,
      };
      const filesArray = Array.from(uploadFiles);
      if (activeSessionId) {
        await prov.addSessionFiles(activeSessionId, filesArray);
        uploadFiles = null;
        await selectSession(activeSessionId);
        return;
      }
      const data = await prov.createSession(filesArray.length === 1 ? filesArray[0] : filesArray, config);
      uploadFiles = null;
      await fetchSessions();
      selectSession(data.session.id);
      dispatch('create', { id: data.session.id });
    } catch (err: any) {
      errorMsg = `Failed to upload file(s): ${err.message}`;
    } finally {
      loading = false;
    }
  }

  async function activateDocument(documentId: string) {
    if (!activeSessionId) return;
    loading = true;
    try {
      const data = await activeProvider.activateSessionFile(activeSessionId, documentId);
      await selectSession(data.session.id);
    } catch (err: any) {
      errorMsg = `Failed to select PDF: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  async function removeDocument(documentId: string, e: MouseEvent) {
    e.stopPropagation();
    if (!activeSessionId) return;
    if (activeDocuments.length <= 1) {
      errorMsg = 'Cannot remove the only PDF in a session.';
      return;
    }
    loading = true;
    try {
      const data = await activeProvider.deleteSessionFile(activeSessionId, documentId);
      await selectSession(data.session.id);
    } catch (err: any) {
      errorMsg = `Failed to remove PDF: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  async function deleteSession(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete session ${id}?`)) return;
    loading = true;
    try {
      const prov = activeProvider;
      if (!prov) return;
      await prov.deleteSession(id);
      if (activeSessionId === id) {
        activeSessionId = null;
        activeFilePath = '';
        activePageCount = 1;
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(getActiveSessionStorageKey(useWasm));
        }
      }
      await fetchSessions();
      dispatch('delete', { id });
    } catch (err: any) {
      errorMsg = `Failed to delete session: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  // React to engine toggle
  $effect(() => {
    // When useWasm changes, sync engine and load corresponding session list
    syncEngine();
  });

  onMount(() => {
    if (typeof localStorage !== 'undefined') {
      const savedEngine = localStorage.getItem(STORAGE_KEY_USE_WASM);
      if (savedEngine === 'true') {
        useWasm = true;
      }
    }
    syncEngine();
  });
</script>

<!-- COMPACT SINGLE-LINE SESSION BAR -->
<div class="session-bar bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 shadow-md flex items-center justify-between text-xs">
  <div class="flex items-center space-x-3 truncate">
    <div class="flex items-center space-x-1.5 font-bold text-indigo-400 shrink-0">
      <span>📄</span>
      <span>Session:</span>
    </div>

    <!-- Engine Mode Switcher -->
    <div class="inline-flex rounded bg-slate-950 p-0.5 border border-slate-800 shrink-0" title="Switch Session Engine (Server vs WebAssembly)">
      <button
        type="button"
        onclick={() => setEngineMode(false)}
        class="px-2 py-0.5 text-[10px] font-semibold rounded transition cursor-pointer flex items-center space-x-1 {!useWasm ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}"
        title="Switch to Server (API)"
      >
        <span>🌐</span>
        <span>Server</span>
      </button>
      <button
        type="button"
        onclick={() => setEngineMode(true)}
        class="px-2 py-0.5 text-[10px] font-semibold rounded transition cursor-pointer flex items-center space-x-1 {useWasm ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}"
        title="Switch to WASM (Client-Side)"
      >
        <span>⚡</span>
        <span>WASM</span>
      </button>
    </div>

    {#if activeSessionId}
      <div class="flex items-center space-x-2 truncate">
        <span class="font-mono text-emerald-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 shrink-0" title={activeSessionId}>
          {activeSessionId.substring(0, 14)}...
        </span>
        <span class="text-slate-300 truncate max-w-xs" title={activeFilePath}>
          {activeFilePath.split('/').pop()}
        </span>
        <span class="bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 px-1.5 py-0.5 rounded text-[10px] shrink-0 font-medium">
          {activePageCount} {activePageCount === 1 ? 'page' : 'pages'}
        </span>
      </div>
    {:else}
      <span class="text-slate-500 italic">No session active.</span>
    {/if}
  </div>

  <div class="flex items-center space-x-2 shrink-0">
    {#if sessions.length === 0}
      <!-- Option to create either Server or WASM session -->
      <div class="flex items-center space-x-1.5">
        <button
          onclick={() => { setEngineMode(false); showModal = true; }}
          class="bg-sky-700 hover:bg-sky-600 text-white font-semibold text-xs px-2.5 py-1.5 rounded transition shadow flex items-center space-x-1 cursor-pointer"
          title="Create or open session on backend server"
        >
          <span>🌐</span>
          <span>+ Server Session</span>
        </button>
        <button
          onclick={() => { setEngineMode(true); showModal = true; }}
          class="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs px-2.5 py-1.5 rounded transition shadow flex items-center space-x-1 cursor-pointer"
          title="Create or open session in client WebAssembly"
        >
          <span>⚡</span>
          <span>+ WASM Session</span>
        </button>
      </div>
    {/if}

    <button
      onclick={() => (showModal = true)}
      class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3 py-1.5 rounded transition shadow flex items-center space-x-1.5"
    >
      <span>🔁</span>
      <span>Manage Sessions ({sessions.length})</span>
    </button>
  </div>
</div>

<!-- SESSION MANAGER MODAL POPUP -->
{#if showModal}
  <div
    style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; z-index: 999999; background: rgba(2, 6, 23, 0.88); backdrop-filter: blur(4px);"
    class="flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    tabindex="0"
    onclick={(e) => {
      if (e.target === e.currentTarget) showModal = false;
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') showModal = false;
    }}
  >
    <div class="bg-slate-900 border border-indigo-900/80 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
      <!-- Modal Header -->
      <div class="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <span class="text-xl">📁</span>
          <h2 class="text-base font-bold text-white tracking-wide">Session Manager</h2>
          <span class="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
            {sessions.length} in {useWasm ? 'WASM SQLite DB' : 'Server'}
          </span>
          {#if wasmInitializing}
            <span class="text-[10px] text-amber-400 animate-pulse font-medium">● Loading WASM DB...</span>
          {/if}
        </div>

        <button
          onclick={() => (showModal = false)}
          class="text-slate-400 hover:text-white text-lg font-bold px-2 py-0.5 rounded transition hover:bg-slate-800"
        >
          ✕
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-4 overflow-y-auto space-y-4 flex-1">
        {#if errorMsg}
          <div class="bg-red-950/80 border border-red-700 text-red-200 text-xs p-2.5 rounded flex items-center justify-between">
            <span>❌ {errorMsg}</span>
            <button onclick={() => (errorMsg = '')} class="text-red-400 hover:text-white font-bold ml-2">✕</button>
          </div>
        {/if}

        <!-- Target Engine Selector in Modal -->
        <div class="bg-slate-950 border border-slate-800 p-3 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div class="space-y-0.5">
            <div class="text-xs font-semibold text-slate-200 flex items-center space-x-2">
              <span>Execution Engine:</span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded border {useWasm ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80' : 'bg-sky-950/80 text-sky-400 border-sky-800/80'}">
                {useWasm ? '⚡ WebAssembly (In-Browser OPFS)' : '🌐 REST Server (localhost:9191)'}
              </span>
            </div>
            <p class="text-[11px] text-slate-400">
              {useWasm
                ? 'Runs completely client-side in the browser using WASM. No backend server needed.'
                : 'Connects to local Rust backend server on http://localhost:9191.'}
            </p>
          </div>
          <div class="inline-flex rounded-lg bg-slate-900 p-1 border border-slate-800 space-x-1 shrink-0">
            <button
              type="button"
              onclick={() => setEngineMode(true)}
              class="px-3 py-1.5 text-xs font-bold rounded transition cursor-pointer flex items-center space-x-1.5 {useWasm ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}"
            >
              <span>⚡</span>
              <span>WASM (Client)</span>
            </button>
            <button
              type="button"
              onclick={() => setEngineMode(false)}
              class="px-3 py-1.5 text-xs font-bold rounded transition cursor-pointer flex items-center space-x-1.5 {!useWasm ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}"
            >
              <span>🌐</span>
              <span>Server (API)</span>
            </button>
          </div>
        </div>

        <!-- Empty Sessions Callout Indicator -->
        {#if sessions.length === 0 && !loading}
          <div class="bg-indigo-950/60 border border-indigo-700/60 p-3.5 rounded-lg flex items-center justify-between text-xs text-indigo-200">
            <div class="flex items-center space-x-2">
              <span class="text-lg">💡</span>
              <span>No active sessions found in <strong>{useWasm ? 'WASM SQLite DB' : 'Server REST API'}</strong>. Enter a path, load sample PDF, or upload below to create one.</span>
            </div>
          </div>
        {/if}

        <!-- Create & Upload Forms -->
        <div class="bg-slate-950 border border-slate-800 p-3.5 rounded-lg space-y-3">
          <div class="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center justify-between">
            <span>{activeSessionId ? 'Add PDF to Session' : `Create / Open New ${useWasm ? 'WASM' : 'Server'} Session`}</span>
            <span class="text-[11px] text-slate-500 font-normal">Target: {useWasm ? '⚡ Client WASM OPFS DB' : '🌐 Server API'}</span>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <!-- Local Path -->
            <div class="space-y-1">
              <label class="text-xs text-slate-400 block font-medium">
                {useWasm ? 'MyFS Virtual Path:' : 'Local Server File Path:'}
              </label>
              <div class="flex space-x-1.5">
                <input
                  type="text"
                  placeholder={useWasm ? "sample.pdf" : "/path/to/file.pdf"}
                  bind:value={filePathInput}
                  class="flex-1 bg-slate-900 border border-slate-700 text-xs p-2 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onclick={createSessionFromPath}
                  disabled={!filePathInput.trim() || loading}
                  class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-3 rounded font-medium transition"
                >
                  Open
                </button>
              </div>
            </div>

            <!-- Upload File -->
            <div class="space-y-1">
              <label class="text-xs text-slate-400 block font-medium">
                {activeSessionId ? 'Attach PDF File(s):' : 'Upload PDF File(s):'}
              </label>
              <div class="flex space-x-1.5">
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  onchange={(e) => (uploadFiles = (e.currentTarget as HTMLInputElement).files)}
                  class="flex-1 text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 cursor-pointer"
                />
                <button
                  onclick={uploadSessionFile}
                  disabled={!uploadFiles || uploadFiles.length === 0 || loading}
                  class="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 rounded font-medium transition"
                >
                  {activeSessionId
                    ? (uploadFiles && uploadFiles.length > 1 ? `Attach (${uploadFiles.length})` : 'Attach')
                    : (uploadFiles && uploadFiles.length > 1 ? `Upload (${uploadFiles.length})` : 'Upload')}
                </button>
              </div>
            </div>
          </div>

          <div class="flex items-center space-x-4 pt-1">
            <label class="text-xs text-slate-400 flex items-center space-x-1.5">
              <span>Bank Hint (Optional):</span>
              <input
                type="text"
                placeholder="e.g. sbi"
                bind:value={bankHint}
                class="bg-slate-900 border border-slate-700 text-xs px-2 py-1 rounded text-slate-200 focus:outline-none focus:border-indigo-500 w-28"
              />
            </label>

            <label class="text-xs text-slate-400 flex items-center space-x-1.5">
              <span>Password (Optional):</span>
              <input
                type="password"
                placeholder="PDF Password"
                bind:value={passwordInput}
                class="bg-slate-900 border border-slate-700 text-xs px-2 py-1 rounded text-slate-200 focus:outline-none focus:border-indigo-500 w-36"
              />
            </label>
          </div>

          <!-- Quick Load Sample PDF Buttons -->
          <div class="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
            <span class="text-[11px] text-slate-400">
              Start instantly with bundled sample PDF:
            </span>
            <div class="flex items-center space-x-2">
              <button
                type="button"
                onclick={async () => {
                  setEngineMode(false);
                  await createDefaultSampleSession();
                }}
                disabled={loading}
                class="bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-sky-200 border border-slate-700 text-xs px-2.5 py-1 rounded font-medium transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
              >
                <span>🌐</span>
                <span>Load Server Sample</span>
              </button>
              <button
                type="button"
                onclick={async () => {
                  setEngineMode(true);
                  await createDefaultSampleSession();
                }}
                disabled={loading}
                class="bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 border border-slate-700 text-xs px-2.5 py-1 rounded font-medium transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
              >
                <span>⚡</span>
                <span>Load WASM Sample</span>
              </button>
            </div>
          </div>

          {#if activeSessionId && activeDocuments.length > 0}
            <div class="bg-slate-950 border border-slate-800 p-3 rounded-lg space-y-2.5">
              <div class="flex items-center justify-between">
                <div class="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center space-x-2">
                  <span>🔒 Session Sandbox Files ({activeDocuments.length})</span>
                </div>
                <span class="text-[10px] text-slate-400">
                  Only these files are accessible in DSL via <code>LOAD "filename"</code>
                </span>
              </div>

              <div class="flex flex-wrap gap-2">
                {#each activeDocuments as document (document.id)}
                  <div
                    class="group flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded border transition {activeDocumentId === document.id ? 'bg-indigo-900/70 text-indigo-100 border-indigo-500 shadow-sm' : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'}"
                  >
                    <!-- Click to activate for viewport preview -->
                    <button
                      onclick={() => activateDocument(document.id)}
                      class="flex items-center space-x-1.5 hover:text-white"
                      title={`Preview in Canvas (${document.file_path})`}
                    >
                      <span class={activeDocumentId === document.id ? 'text-emerald-400' : 'text-slate-500'}>
                        {activeDocumentId === document.id ? '👁️' : '📄'}
                      </span>
                      <span class="font-medium truncate max-w-[140px]">{document.name}</span>
                    </button>

                    <!-- Copy LOAD snippet button -->
                    <button
                      onclick={() => copyLoadSnippet(document.name)}
                      title={`Copy: LOAD "${document.name}" AS doc`}
                      class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white font-mono transition border border-slate-700"
                    >
                      {copiedSnippet === document.name ? '✓ Copied' : 'LOAD'}
                    </button>

                    <!-- Remove document button (if more than 1 document) -->
                    {#if activeDocuments.length > 1}
                      <button
                        onclick={(e) => removeDocument(document.id, e)}
                        title="Remove file from session"
                        class="text-slate-500 hover:text-red-400 pl-1 font-bold transition text-xs"
                      >
                        ✕
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Sessions Table -->
        <div class="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
          <div class="p-2 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-xs">
            <span class="font-semibold text-slate-300">
              Registered Sessions ({sessions.length})
            </span>
            <button onclick={fetchSessions} class="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1">
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          </div>

          <div class="max-h-56 overflow-y-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-900/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold sticky top-0">
                <tr>
                  <th class="py-2 px-3">Session ID</th>
                  <th class="py-2 px-3">File Path</th>
                  <th class="py-2 px-3">Status</th>
                  <th class="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                {#if loading && sessions.length === 0}
                  <tr><td colspan="4" class="py-6 text-center text-slate-500 italic">Loading sessions...</td></tr>
                {:else if sessions.length === 0}
                  <tr>
                    <td colspan="4" class="py-8 text-center text-slate-400 italic space-y-2">
                      <p>No active sessions found in {useWasm ? 'WASM DB' : 'Server'}.</p>
                      <p class="text-xs text-emerald-400 font-sans not-italic font-semibold">
                        ▲ Use the form above to open or upload your first PDF document.
                      </p>
                    </td>
                  </tr>
                {:else}
                  {#each sessions as s (s.id)}
                    <tr
                      onclick={() => selectSession(s.id)}
                      class="cursor-pointer transition hover:bg-slate-800/70 {activeSessionId === s.id ? 'bg-indigo-950/70 font-semibold border-l-4 border-l-indigo-500' : ''}"
                    >
                      <td class="py-2 px-3 font-mono text-indigo-300 truncate max-w-[140px]" title={s.id}>
                        {s.id.substring(0, 18)}...
                      </td>
                      <td class="py-2 px-3 text-slate-300 truncate max-w-[260px]" title={s.file_path}>
                        {s.file_path.split('/').pop()}
                        <span class="text-[10px] text-slate-500 block truncate">{s.file_path}</span>
                      </td>
                      <td class="py-2 px-3">
                        <span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                          ● {s.status}
                        </span>
                      </td>
                      <td class="py-2 px-3 text-right">
                        <button
                          onclick={(e) => deleteSession(s.id, e)}
                          title="Destroy Session"
                          class="text-slate-400 hover:text-red-400 p-1 rounded transition hover:bg-red-950/50"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
        <button
          onclick={() => (showModal = false)}
          class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-4 py-1.5 rounded font-medium transition"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
