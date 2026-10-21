<script>
  import JsonMonacoViewer from "../JsonMonacoViewer.svelte";

  let {
    show = $bindable(false),
    executeResponseJson = null,
  } = $props();

  function copyOutputJson() {
    if (executeResponseJson) {
      navigator.clipboard.writeText(
        JSON.stringify(executeResponseJson, null, 2),
      );
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      show = false;
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      show = false;
    }
  }
</script>

{#if show && executeResponseJson}
  <div
    style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; z-index: 999999; background: rgba(2, 6, 23, 0.88); backdrop-filter: blur(4px);"
    class="flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    tabindex="0"
    onclick={handleBackdropClick}
    onkeydown={handleKeyDown}
  >
    <div
      class="bg-slate-900 border border-indigo-900/80 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]"
    >
      <!-- Modal Header -->
      <div
        class="p-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between"
      >
        <div
          class="flex items-center space-x-2 font-bold text-xs uppercase tracking-wider text-indigo-400"
        >
          <span>📋</span>
          <span>Pipeline Output JSON ({executeResponseJson.function || "Results"})</span>
        </div>

        <div class="flex items-center space-x-2">
          <button
            onclick={copyOutputJson}
            class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1 rounded transition flex items-center space-x-1"
          >
            <span>📄</span>
            <span>Copy JSON</span>
          </button>

          <button
            onclick={() => (show = false)}
            class="text-slate-400 hover:text-white text-lg font-bold px-2 py-0.5 rounded transition hover:bg-slate-800"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="h-[60vh] w-full bg-slate-950 overflow-hidden relative">
        <JsonMonacoViewer content={JSON.stringify(executeResponseJson, null, 2)} />
      </div>

      <!-- Modal Footer -->
      <div class="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
        <button
          onclick={() => (show = false)}
          class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-1.5 rounded font-medium transition"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
