<script>
  let {
    currentPage = $bindable(0),
    pageCount = 1,
    currentDpi = $bindable(300),
    strokeWidth = $bindable(2),
    useWasm = $bindable(false),
    wasmInitializing = false,
    errorMsg = $bindable(""),
    onwasmtoggle = () => {},
  } = $props();

  function handleWasmCheckboxChange(e) {
    const checked = e.target.checked;
    useWasm = checked;
    onwasmtoggle(checked);
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
  </div>

  <!-- Engine Switcher: Server vs WASM -->
  <div
    class="flex items-center space-x-2.5 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1 shadow-inner"
    title="Toggle execution between native backend server and WebAssembly (client-side in-browser)"
  >
    <span class="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">Engine:</span>
    <label class="inline-flex items-center cursor-pointer select-none">
      <input
        type="checkbox"
        checked={useWasm}
        onchange={handleWasmCheckboxChange}
        class="sr-only peer"
      />
      <div
        class="relative w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"
      ></div>
      <span
        class="ms-2 font-bold text-xs transition-colors {useWasm ? 'text-emerald-400' : 'text-sky-400'}"
      >
        {useWasm ? "WASM (Client)" : "Server (API)"}
      </span>
    </label>
    {#if wasmInitializing}
      <span class="text-[10px] text-amber-400 animate-pulse font-medium">● Loading WASM...</span>
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
