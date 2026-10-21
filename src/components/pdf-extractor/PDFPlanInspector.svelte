<script>
  import JsonMonacoViewer from "../JsonMonacoViewer.svelte";

  let {
    bottomLeftTab = $bindable("ast"),
    dslCompileResponseJson = null,
    executeResponseJson = null,
  } = $props();

  let activeData = $derived.by(() => {
    if (bottomLeftTab === "ast") {
      return dslCompileResponseJson?.ast;
    }
    if (bottomLeftTab === "logical") {
      return dslCompileResponseJson?.logical_plan;
    }
    if (bottomLeftTab === "physical") {
      return dslCompileResponseJson?.physical_plan;
    }
    if (bottomLeftTab === "output") {
      if (dslCompileResponseJson?.results) return dslCompileResponseJson.results;
      if (executeResponseJson) return executeResponseJson;
      if (dslCompileResponseJson?.errmsg || dslCompileResponseJson?.error) {
        return {
          errmsg: dslCompileResponseJson.errmsg || dslCompileResponseJson.error,
          trace: dslCompileResponseJson.trace || [],
        };
      }
      return null;
    }
    return null;
  });

  let activeJsonString = $derived(
    activeData ? JSON.stringify(activeData, null, 2) : ""
  );

  const tabLabels = {
    ast: "AST",
    logical: "Logical Plan",
    physical: "Physical Plan",
    output: "Output",
  };
</script>

<div class="bg-slate-950 flex flex-col h-full w-full overflow-hidden">
  <!-- Bottom Tabs Bar -->
  <div
    class="p-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0"
  >
    <div class="flex items-center space-x-1">
      <button
        onclick={() => (bottomLeftTab = "ast")}
        class="px-2.5 py-1 rounded text-[11px] font-semibold transition {bottomLeftTab ===
        'ast'
          ? 'bg-indigo-900/90 text-indigo-200 border border-indigo-700/80'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
      >
        <span>🌳 AST</span>
      </button>

      <button
        onclick={() => (bottomLeftTab = "logical")}
        class="px-2.5 py-1 rounded text-[11px] font-semibold transition {bottomLeftTab ===
        'logical'
          ? 'bg-indigo-900/90 text-indigo-200 border border-indigo-700/80'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
      >
        <span>📐 Logical Plan</span>
      </button>

      <button
        onclick={() => (bottomLeftTab = "physical")}
        class="px-2.5 py-1 rounded text-[11px] font-semibold transition {bottomLeftTab ===
        'physical'
          ? 'bg-indigo-900/90 text-indigo-200 border border-indigo-700/80'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
      >
        <span>⚙️ Physical Plan</span>
      </button>

      <button
        onclick={() => (bottomLeftTab = "output")}
        class="px-2.5 py-1 rounded text-[11px] font-semibold transition {bottomLeftTab ===
        'output'
          ? 'bg-indigo-900/90 text-indigo-200 border border-indigo-700/80'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
      >
        <span>📊 Output</span>
      </button>
    </div>

    {#if dslCompileResponseJson}
      <span
        class="text-[10px] font-mono px-2 py-0.5 rounded border {dslCompileResponseJson.success
          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
          : 'bg-red-950 text-red-300 border-red-800'}"
      >
        {dslCompileResponseJson.success ? "✓ Valid" : "❌ Error"}
      </span>
    {/if}
  </div>

  <!-- Bottom Tab Content Display Area with Monaco JSON Viewer -->
  <div class="flex-1 min-h-0 overflow-hidden bg-slate-950 flex flex-col relative">
    {#if activeData}
      <JsonMonacoViewer content={activeJsonString} />
    {:else if dslCompileResponseJson?.error}
      <div class="p-3">
        <div
          class="text-red-400 bg-red-950/60 p-3 rounded border border-red-800 leading-relaxed font-mono text-xs"
        >
          ⚠️ {dslCompileResponseJson.error}
        </div>
      </div>
    {:else}
      <div class="text-slate-500 italic py-8 text-center font-mono text-xs m-auto">
        Press ⌘R or click Compile to view {tabLabels[bottomLeftTab] || "content"}.
      </div>
    {/if}
  </div>
</div>
