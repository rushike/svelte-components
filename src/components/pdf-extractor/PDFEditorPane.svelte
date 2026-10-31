<script>
  let {
    dslBodyText = $bindable(""),
    saveNotification = false,
    loading = false,
    onsave = () => {},
    onexecute = () => {},
  } = $props();
</script>

<div
  class="bg-slate-950 flex flex-col h-full w-full overflow-hidden border-b border-slate-800"
>
  <!-- Action Header -->
  <div
    class="p-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 shrink-0"
  >
    <div class="flex items-center space-x-2">
      <div
        class="px-2.5 py-1 rounded text-xs font-bold bg-indigo-600/90 text-white shadow flex items-center space-x-1.5"
      >
        <span>📜</span>
        <span>DSL Query</span>
      </div>

      {#if saveNotification}
        <span
          class="text-[11px] font-semibold text-emerald-400 bg-emerald-950/90 border border-emerald-700/60 px-2 py-0.5 rounded shadow-sm animate-pulse"
        >
          ✓ Saved!
        </span>
      {/if}
    </div>

    <div class="flex items-center space-x-1.5">
      <button
        onclick={onsave}
        title="Save Code to LocalStorage (⌘S / Ctrl+S)"
        class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded font-medium border border-slate-700 transition shadow flex items-center space-x-1"
      >
        <span>💾</span>
        <span>Save</span>
        <span
          class="text-[10px] bg-slate-900 px-1 py-0.5 rounded font-mono text-slate-400"
          >⌘S</span
        >
      </button>

      <button
        onclick={onexecute}
        disabled={loading}
        title="Execute DSL Query (⌘R / Ctrl+R)"
        class="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 py-1 rounded font-semibold transition shadow flex items-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
      >
        <span>⚡</span>
        <span>{loading ? "Executing..." : "Execute Query (⌘R)"}</span>
      </button>
    </div>
  </div>

  <!-- Editor Textarea Area -->
  <div class="flex-1 p-2.5 flex flex-col min-h-0 bg-slate-950">
    <textarea
      bind:value={dslBodyText}
      spellcheck="false"
      placeholder="Enter PDF DSL query code..."
      class="w-full flex-1 bg-slate-900 border border-slate-800 rounded p-3 text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
    ></textarea>
  </div>
</div>
