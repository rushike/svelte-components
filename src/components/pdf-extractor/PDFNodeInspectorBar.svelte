<script>
  let {
    hoveredItem = null,
    executionSummary = "",
    executeResponseJson = null,
    onviewoutput = () => {},
  } = $props();
</script>

<div
  class="bg-slate-950 border-t border-slate-800 p-2 px-3 text-xs flex items-center justify-between text-slate-400 shrink-0 select-none"
>
  <div class="flex items-center space-x-3 overflow-hidden">
    {#if hoveredItem}
      <div
        class="flex items-center space-x-2 text-indigo-300 font-mono truncate"
      >
        <span class="font-bold uppercase tracking-wider text-indigo-400">
          [{hoveredItem.type}]
        </span>
        <span class="text-white truncate">{hoveredItem.text}</span>
        <span class="text-slate-500 font-sans">
          (BBox: [{Math.round(hoveredItem.bbox.x1)}, {Math.round(
            hoveredItem.bbox.y1,
          )}] ➔ [{Math.round(hoveredItem.bbox.x2)}, {Math.round(
            hoveredItem.bbox.y2,
          )}])
        </span>
        {#if hoveredItem.item?.orientation}
          <span class="text-slate-500 font-sans">
            Orientation: <strong class="text-teal-300"
              >{hoveredItem.item.orientation}</strong
            >
          </span>
        {/if}
        {#if hoveredItem.item?.pixel_width}
          <span class="text-slate-500 font-sans">
            Pixels: {hoveredItem.item.pixel_width}×{hoveredItem.item
              .pixel_height}
          </span>
        {/if}
      </div>
    {:else}
      <span
        >{executionSummary ||
          "Ready. Select options and click Execute or ⌘R."}</span
      >
    {/if}
  </div>

  {#if executeResponseJson}
    <button
      onclick={onviewoutput}
      class="bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/60 font-semibold px-3 py-1 rounded transition shadow flex items-center space-x-1.5"
    >
      <span>📋</span>
      <span>View Output JSON</span>
    </button>
  {/if}
</div>
