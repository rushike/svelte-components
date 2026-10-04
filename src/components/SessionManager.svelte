<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';

  export let baseUrl: string = 'http://localhost:9191';
  export let activeSessionId: string | null = null;
  export let activeFilePath: string = '';
  export let activePageCount: number = 1;

  const dispatch = createEventDispatcher<{
    select: { id: string; file_path: string; page_count: number };
    create: { id: string };
    delete: { id: string };
  }>();

  interface SessionRecord {
    id: string;
    file_path: string;
    status: string;
    created_at: number;
    updated_at: number;
    config?: any;
  }

  let sessions: SessionRecord[] = [];
  let loading = false;
  let errorMsg = '';
  let filePathInput = '';
  let uploadFiles: FileList | null = null;
  let bankHint = '';
  let showModal = false;

  async function fetchSessions() {
    loading = true;
    errorMsg = '';
    try {
      const res = await fetch(`${baseUrl}/api/sessions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      sessions = data.sessions || [];
      if (sessions.length > 0 && !activeSessionId) {
        selectSession(sessions[0].id);
      }
    } catch (err: any) {
      errorMsg = `Failed to fetch sessions: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  async function selectSession(id: string) {
    activeSessionId = id;
    loading = true;
    try {
      const res = await fetch(`${baseUrl}/api/sessions/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      activeFilePath = data.session.file_path || '';
      activePageCount = data.page_count || 1;
      dispatch('select', {
        id: data.session.id,
        file_path: activeFilePath,
        page_count: activePageCount,
      });
      showModal = false;
    } catch (err: any) {
      errorMsg = `Failed to select session ${id}: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  async function createSessionFromPath() {
    if (!filePathInput.trim()) return;
    loading = true;
    errorMsg = '';
    try {
      const body = {
        file_path: filePathInput.trim(),
        config: {
          bank: bankHint.trim() || undefined,
        },
      };
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      filePathInput = '';
      await fetchSessions();
      selectSession(data.session_id);
      dispatch('create', { id: data.session_id });
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
      const formData = new FormData();
      formData.append('file', uploadFiles[0]);
      const res = await fetch(`${baseUrl}/api/sessions/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      uploadFiles = null;
      await fetchSessions();
      selectSession(data.session_id);
      dispatch('create', { id: data.session_id });
    } catch (err: any) {
      errorMsg = `Failed to upload file: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  async function deleteSession(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete session ${id}?`)) return;
    loading = true;
    try {
      const res = await fetch(`${baseUrl}/api/sessions/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (activeSessionId === id) {
        activeSessionId = null;
        activeFilePath = '';
        activePageCount = 1;
      }
      await fetchSessions();
      dispatch('delete', { id });
    } catch (err: any) {
      errorMsg = `Failed to delete session: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchSessions();
  });
</script>

<!-- COMPACT SINGLE-LINE SESSION BAR -->
<div class="session-bar bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 shadow-md flex items-center justify-between text-xs">
  <div class="flex items-center space-x-3 truncate">
    <div class="flex items-center space-x-1.5 font-bold text-indigo-400 shrink-0">
      <span>📄</span>
      <span>Session:</span>
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
      <span class="text-slate-500 italic">No session active. Click Manage Sessions to create one.</span>
    {/if}
  </div>

  <div class="flex items-center space-x-2 shrink-0">
    <button
      on:click={() => (showModal = true)}
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
    on:click|self={() => (showModal = false)}
  >
    <div class="bg-slate-900 border border-indigo-900/80 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
      <!-- Modal Header -->
      <div class="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <span class="text-xl">📁</span>
          <h2 class="text-base font-bold text-white tracking-wide">Session Manager</h2>
          <span class="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
            {sessions.length} registered
          </span>
        </div>

        <button
          on:click={() => (showModal = false)}
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
            <button on:click={() => (errorMsg = '')} class="text-red-400 hover:text-white font-bold ml-2">✕</button>
          </div>
        {/if}

        <!-- Create & Upload Forms -->
        <div class="bg-slate-950 border border-slate-800 p-3.5 rounded-lg space-y-3">
          <div class="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Create / Open New Session</div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <!-- Local Path -->
            <div class="space-y-1">
              <label class="text-xs text-slate-400 block font-medium">Local Server File Path:</label>
              <div class="flex space-x-1.5">
                <input
                  type="text"
                  placeholder="/path/to/file.pdf"
                  bind:value={filePathInput}
                  class="flex-1 bg-slate-900 border border-slate-700 text-xs p-2 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <button
                  on:click={createSessionFromPath}
                  disabled={!filePathInput.trim() || loading}
                  class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-3 rounded font-medium transition"
                >
                  Open
                </button>
              </div>
            </div>

            <!-- Upload File -->
            <div class="space-y-1">
              <label class="text-xs text-slate-400 block font-medium">Upload PDF File:</label>
              <div class="flex space-x-1.5">
                <input
                  type="file"
                  accept=".pdf"
                  on:change={(e) => (uploadFiles = e.currentTarget.files)}
                  class="flex-1 text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 cursor-pointer"
                />
                <button
                  on:click={uploadSessionFile}
                  disabled={!uploadFiles || uploadFiles.length === 0 || loading}
                  class="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 rounded font-medium transition"
                >
                  Upload
                </button>
              </div>
            </div>
          </div>

          <div class="flex items-center space-x-2 pt-1">
            <label class="text-xs text-slate-400 flex items-center space-x-1.5">
              <span>Bank Hint (Optional):</span>
              <input
                type="text"
                placeholder="e.g. sbi"
                bind:value={bankHint}
                class="bg-slate-900 border border-slate-700 text-xs px-2 py-1 rounded text-slate-200 focus:outline-none focus:border-indigo-500 w-28"
              />
            </label>
          </div>
        </div>

        <!-- Sessions Table -->
        <div class="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
          <div class="p-2 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-xs">
            <span class="font-semibold text-slate-300">Registered Sessions</span>
            <button on:click={fetchSessions} class="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1">
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
                  <tr><td colspan="4" class="py-6 text-center text-slate-500 italic">No active sessions. Create or upload a PDF session above.</td></tr>
                {:else}
                  {#each sessions as s (s.id)}
                    <tr
                      on:click={() => selectSession(s.id)}
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
                          on:click={(e) => deleteSession(s.id, e)}
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
          on:click={() => (showModal = false)}
          class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-4 py-1.5 rounded font-medium transition"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
