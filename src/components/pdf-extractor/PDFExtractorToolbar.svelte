<script>
  let {
    currentPage = $bindable(0),
    pageCount = 1,
    currentDpi = $bindable(300),
    strokeWidth = $bindable(2),
    useWasm = $bindable(false),
    wasmInitializing = false,
    errorMsg = $bindable(""),
    password = $bindable(""),
    onwasmtoggle = () => {},
    onpasswordchange = () => {},
  } = $props();

  function handleEngineSwitch(targetWasm) {
    if (useWasm === targetWasm) return;
    useWasm = targetWasm;
    onwasmtoggle(targetWasm);
  }
</script>

<div
  class="controls-bar bg-slate-950 border-b border-slate-800 p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
>
  <!-- Page & Resolution Controls -->
  <div class="flex items-center space-x-3">
    <label class="flex items-center space-x-1.5 font-medium">
      <span class="text-slate-400">Page:</span>
      <select
        bind:value={currentPage}
        class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 focus:border-indigo-500 focus:outline-none"
      >
        {#each Array(pageCount || 1) as _, i}
          <option value={i}>Page {i + 1} of {pageCount || 1}</option>
        {/each}
      </select>
    </label>

    <label class="flex items-center space-x-1.5 font-medium">
      <span class="text-slate-400">DPI:</span>
      <select
        bind:value={currentDpi}
        class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 focus:border-indigo-500 focus:outline-none"
      >
        <option value={72}>72 DPI (Standard)</option>
        <option value={144}>144 DPI (Retina 2×)</option>
        <option value={150}>150 DPI (Medium)</option>
        <option value={300}>300 DPI (High Res)</option>
        <option value={600}>600 DPI (Ultra)</option>
      </select>
    </label>

    <label class="flex items-center space-x-1.5 font-medium">
      <span class="text-slate-400">Stroke Width:</span>
      <input
        type="number"
        min="1"
        max="8"
        bind:value={strokeWidth}
        class="w-12 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center text-slate-100 focus:border-indigo-500 focus:outline-none"
      />
    </label>

    <label class="flex items-center space-x-1.5 font-medium" title="Password for encrypted PDFs">
      <span class="text-slate-400">Password:</span>
      <input
        type="password"
        placeholder="Optional"
        bind:value={password}
        onchange={() => onpasswordchange(password)}
        onkeydown={(e) => { if (e.key === 'Enter') onpasswordchange(password); }}
        class="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
      />
    </label>
  </div>

  <!-- Engine Switcher: Server vs WASM -->
  <div
    class="flex items-center space-x-2 bg-slate-900 border border-slate-700/80 rounded-lg p-1 shadow-inner"
    title="Switch Execution Engine (Server vs WebAssembly)"
  >
    <span class="text-slate-400 font-semibold text-[11px] uppercase tracking-wider px-1">Engine:</span>
    <div class="inline-flex rounded-md bg-slate-950 p-0.5 border border-slate-800">
      <button
        type="button"
        onclick={() => handleEngineSwitch(false)}
        class="px-2.5 py-1 text-xs font-semibold rounded transition cursor-pointer flex items-center space-x-1.5 {!useWasm ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}"
        title="Switch to Server (API)"
      >
        <span>🌐</span>
        <span>Server</span>
      </button>
      <button
        type="button"
        onclick={() => handleEngineSwitch(true)}
        class="px-2.5 py-1 text-xs font-semibold rounded transition cursor-pointer flex items-center space-x-1.5 {useWasm ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}"
        title="Switch to WASM (Client-side)"
      >
        <span>⚡</span>
        <span>WASM</span>
      </button>
    </div>
    {#if wasmInitializing}
      <span class="text-[10px] text-amber-400 animate-pulse font-medium px-1">● Loading WASM...</span>
    {/if}
  </div>
</div>

{#if errorMsg}
  <div
    class="bg-red-950/90 border-b border-red-700 text-red-200 text-xs px-4 py-2 flex items-center justify-between shrink-0"
  >
    <span>⚠️ {errorMsg}</span>
    <button
      onclick={() => (errorMsg = "")}
      class="text-red-400 hover:text-white font-bold ml-2">✕</button
    >
  </div>
{/if}
