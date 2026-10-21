<script>
  import {
    getLayerStyle,
    getItemLabel,
    getItemBBox,
    isSublayerChecked,
  } from "./pdfExtractorConstants";

  let {
    availableLayers = $bindable([]),
    activeLayers = $bindable({}),
    sublayerVisibility = $bindable({}),
    executeResponseJson = null,
    dslCompileResponseJson = null,
    showRightLayersPanel = $bindable(true),
    hoveredItem = $bindable(null),
  } = $props();

  let draggedLayerIndex = $state(null);
  let dragOverIndex = $state(null);

  let expandedLayerTree = $state({
    images: true,
    lines: true,
    words: false,
    sentences: false,
    rows: false,
    columns: false,
    tables: false,
  });

  function toggleLayerTree(layerKey) {
    expandedLayerTree = {
      ...expandedLayerTree,
      [layerKey]: !expandedLayerTree[layerKey],
    };
  }

  function setSublayerVisible(layerKey, idx, visible) {
    const layerMap = { ...(sublayerVisibility[layerKey] || {}) };
    layerMap[idx] = visible;
    sublayerVisibility = {
      ...sublayerVisibility,
      [layerKey]: layerMap,
    };
  }

  function toggleAllSublayers(layerKey, visible) {
    const items =
      executeResponseJson?.[layerKey] ||
      dslCompileResponseJson?.results?.[layerKey];
    if (!Array.isArray(items)) return;
    const nextMap = { ...(sublayerVisibility[layerKey] || {}) };
    items.forEach((_, idx) => {
      nextMap[idx] = visible;
    });
    sublayerVisibility = {
      ...sublayerVisibility,
      [layerKey]: nextMap,
    };
  }

  function handleLayerDragStart(event, index) {
    draggedLayerIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleLayerDragOver(event, index) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    if (dragOverIndex !== index) {
      dragOverIndex = index;
    }
  }

  function handleLayerDragLeave(index) {
    if (dragOverIndex === index) {
      dragOverIndex = null;
    }
  }

  function handleLayerDrop(event, targetIndex) {
    event.preventDefault();
    if (draggedLayerIndex === null || draggedLayerIndex === targetIndex) {
      draggedLayerIndex = null;
      dragOverIndex = null;
      return;
    }

    const nextLayers = [...availableLayers];
    const [movedItem] = nextLayers.splice(draggedLayerIndex, 1);
    nextLayers.splice(targetIndex, 0, movedItem);
    availableLayers = nextLayers;

    draggedLayerIndex = null;
    dragOverIndex = null;
  }

  function handleLayerDragEnd() {
    draggedLayerIndex = null;
    dragOverIndex = null;
  }

  function moveLayer(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= availableLayers.length) return;
    const nextLayers = [...availableLayers];
    const [movedItem] = nextLayers.splice(index, 1);
    nextLayers.splice(targetIndex, 0, movedItem);
    availableLayers = nextLayers;
  }
</script>

{#if showRightLayersPanel}
  <div
    class="w-64 bg-slate-900 border-l border-slate-800 flex flex-col h-full shrink-0 z-20 shadow-2xl select-none"
  >
    <!-- Sidebar Header -->
    <div
      class="p-2.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between"
    >
      <div
        class="flex items-center space-x-1.5 font-bold text-xs uppercase tracking-wider text-indigo-300"
      >
        <span>👁️</span>
        <span>Layers (Drag to reorder)</span>
      </div>
      <button
        onclick={() => (showRightLayersPanel = false)}
        title="Hide Layers Sidebar"
        class="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition font-bold"
      >
        ✕
      </button>
    </div>

    <!-- Tree View Body -->
    <div class="flex-1 overflow-y-auto p-2 space-y-2 font-mono text-xs">
      {#if availableLayers.length === 0}
        <div class="text-slate-500 italic p-4 text-center text-xs">
          No extracted layers. Click Execute or ⌘R to inspect layers.
        </div>
      {:else}
        {#each availableLayers as layerKey, index}
          {@const items = executeResponseJson?.[layerKey]}
          {@const isArray = Array.isArray(items) && items.length > 0}
          <div
            role="listitem"
            draggable="true"
            ondragstart={(e) => handleLayerDragStart(e, index)}
            ondragover={(e) => handleLayerDragOver(e, index)}
            ondragleave={() => handleLayerDragLeave(index)}
            ondrop={(e) => handleLayerDrop(e, index)}
            ondragend={handleLayerDragEnd}
            class="bg-slate-950 border rounded-lg overflow-hidden shadow-sm transition-all duration-150 {dragOverIndex ===
            index
              ? 'border-indigo-500 scale-[1.01] bg-slate-900 ring-1 ring-indigo-500'
              : 'border-slate-800'} {draggedLayerIndex === index
              ? 'opacity-40'
              : ''}"
          >
            <!-- Top Layer Node Header -->
            <div
              class="p-2 flex items-center justify-between hover:bg-slate-900/80 transition"
            >
              <div class="flex items-center space-x-1.5 truncate">
                <!-- Drag Handle -->
                <span
                  class="cursor-grab active:cursor-grabbing text-slate-500 hover:text-indigo-400 select-none text-xs px-0.5"
                  title="Drag up/down to change layer stacking order"
                >
                  ⠿
                </span>

                <label
                  class="flex items-center space-x-2 cursor-pointer font-medium {getLayerStyle(
                    layerKey,
                  ).textColor} truncate"
                >
                  <input
                    type="checkbox"
                    bind:checked={activeLayers[layerKey]}
                    class="{getLayerStyle(layerKey).accentClass} rounded"
                  />
                  <span
                    class="w-2 h-2 rounded-full shrink-0"
                    style="background-color: {getLayerStyle(layerKey).stroke};"
                  ></span>
                  <span class="capitalize font-bold text-xs">{layerKey}</span>
                  <span
                    class="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800"
                  >
                    {items?.length || 0}
                  </span>
                </label>
              </div>

              <div class="flex items-center space-x-1 shrink-0">
                <!-- Up / Down buttons -->
                <button
                  disabled={index === 0}
                  onclick={() => moveLayer(index, -1)}
                  class="text-slate-500 hover:text-white disabled:opacity-20 text-[10px] px-1 py-0.5 rounded hover:bg-slate-800 leading-none"
                  title="Bring layer forward (higher on top)"
                >
                  ▲
                </button>
                <button
                  disabled={index === availableLayers.length - 1}
                  onclick={() => moveLayer(index, 1)}
                  class="text-slate-500 hover:text-white disabled:opacity-20 text-[10px] px-1 py-0.5 rounded hover:bg-slate-800 leading-none"
                  title="Send layer backward (lower on bottom)"
                >
                  ▼
                </button>

                {#if isArray}
                  <button
                    onclick={() => toggleLayerTree(layerKey)}
                    class="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 font-mono ml-1"
                    title="Toggle Sub-layers"
                  >
                    {expandedLayerTree[layerKey] ? "▼" : "▶"}
                  </button>
                {/if}
              </div>
            </div>

            <!-- Nested Sub-layers List for each item / photo in array -->
            {#if isArray && expandedLayerTree[layerKey]}
              <div
                class="border-t border-slate-800/80 bg-slate-900/50 p-2 space-y-1.5"
              >
                <div
                  class="flex items-center justify-between pb-1 px-0.5 border-b border-slate-800/60 text-[10px]"
                >
                  <span class="text-slate-400 font-sans font-semibold uppercase"
                    >Sub-layers ({items.length})</span
                  >
                  <div class="flex space-x-1.5 font-sans">
                    <button
                      onclick={() => toggleAllSublayers(layerKey, true)}
                      class="text-indigo-400 hover:underline">Select All</button
                    >
                    <span class="text-slate-600">|</span>
                    <button
                      onclick={() => toggleAllSublayers(layerKey, false)}
                      class="text-slate-400 hover:underline">Hide All</button
                    >
                  </div>
                </div>

                <div class="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {#each items as item, idx}
                    {@const isPhoto =
                      item.data_base64 || item.data || layerKey === "images"}
                    <label
                      class="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 cursor-pointer transition text-xs font-mono text-slate-200 border {hoveredItem?.item ===
                      item
                        ? 'bg-indigo-950/80 border-indigo-600'
                        : 'border-slate-800/60 bg-slate-950/60'}"
                      onmouseenter={() =>
                        (hoveredItem = {
                          type: layerKey,
                          text:
                            item.text || (isPhoto ? `Photo #${idx + 1}` : ""),
                          bbox: getItemBBox(item),
                          id: idx + 1,
                          item: item,
                        })}
                      onmouseleave={() => (hoveredItem = null)}
                    >
                      <div class="flex items-center space-x-2 truncate">
                        <input
                          type="checkbox"
                          checked={isSublayerChecked(
                            layerKey,
                            idx,
                            sublayerVisibility,
                          )}
                          onclick={(e) => e.stopPropagation()}
                          onchange={(e) =>
                            setSublayerVisible(
                              layerKey,
                              idx,
                              e.currentTarget.checked,
                            )}
                          class="accent-indigo-500 rounded cursor-pointer"
                        />
                        {#if item.data_base64 || item.data}
                          <img
                            src={item.data_base64 || item.data}
                            alt="Preview"
                            class="w-5 h-5 object-cover rounded border border-slate-700 shrink-0 bg-slate-900"
                          />
                        {/if}
                        <span
                          class="font-semibold truncate {isPhoto
                            ? 'text-blue-300'
                            : layerKey === 'lines'
                              ? 'text-teal-300'
                              : 'text-slate-200'}"
                        >
                          {getItemLabel(layerKey, item, idx)}
                        </span>
                      </div>
                      <span class="text-[9px] text-slate-400 shrink-0 pl-1">
                        {#if layerKey === "lines" || item.orientation || item.start}
                          {@const len = Math.round(
                            item.orientation === "Horizontal"
                              ? getItemBBox(item).width
                              : item.orientation === "Vertical"
                                ? getItemBBox(item).height
                                : Math.hypot(
                                    getItemBBox(item).width,
                                    getItemBBox(item).height,
                                  ),
                          )}
                          {len}pt
                        {:else}
                          {Math.round(getItemBBox(item).width)}×{Math.round(
                            getItemBBox(item).height,
                          )}
                        {/if}
                      </span>
                    </label>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}
