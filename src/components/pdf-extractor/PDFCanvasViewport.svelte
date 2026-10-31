<script>
  import {
    getLayerStyle,
    getItemBBox,
    isSublayerVisible,
    isTableItem,
    getTableElements,
    getElementText,
  } from "./pdfExtractorConstants";
  import { normalizeLayerItems } from "./pdfExtractorService";

  let {
    imageUrl = null,
    imageWidth = 1000,
    imageHeight = 1000,
    pdfWidth = 612,
    pdfHeight = 792,
    zoomLevel = $bindable(1.0),
    strokeWidth = 2,
    globalStrokeColor = "",
    loading = false,
    availableLayers = [],
    activeLayers = {},
    sublayerVisibility = {},
    executeResponseJson = null,
    renderOrderLayers = [],
    showRightLayersPanel = $bindable(true),
    hoveredItem = $bindable(null),
    layoutWindowWidth = $bindable(800),
    rightPaneElement = $bindable(null),
  } = $props();

  let baseWidth = $derived(pdfWidth || imageWidth || 612);
  let baseHeight = $derived(pdfHeight || imageHeight || 792);
  let canvasDisplayWidth = $derived(Math.round(baseWidth * zoomLevel));
  let canvasDisplayHeight = $derived(Math.round(baseHeight * zoomLevel));

  function handleWheelZoom(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      zoomLevel = Math.max(0.2, Math.min(4.0, zoomLevel + delta));
    }
  }

  function fitToLayoutWidth() {
    const bw = pdfWidth || imageWidth || 612;
    if (layoutWindowWidth > 60 && bw > 0) {
      const availableW = layoutWindowWidth - 48;
      zoomLevel = Math.max(0.2, Math.min(4.0, availableW / bw));
    }
  }
</script>

<div
  bind:this={rightPaneElement}
  bind:clientWidth={layoutWindowWidth}
  class="bg-slate-950 flex flex-col h-full w-full overflow-hidden relative"
>
  <!-- Top View Control Bar -->
  <div
    class="bg-slate-900/90 border-b border-slate-800 p-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0"
  >
    <!-- Quick Layer Badges Summary -->
    <div class="flex items-center space-x-2">
      <span class="text-[11px] text-slate-400 font-semibold uppercase"
        >Stacking Order (Top ➔ Bottom):</span
      >
      {#if availableLayers.length === 0}
        <span class="text-[11px] text-slate-500 italic"
          >None (click Execute or ⌘R)</span
        >
      {:else}
        {#each availableLayers as layer, i}
          {#if activeLayers[layer]}
            {@const layerItems = normalizeLayerItems(executeResponseJson?.[layer])}
            <span
              class="text-[10px] font-mono px-2 py-0.5 rounded border border-slate-700 bg-slate-950 flex items-center space-x-1 {getLayerStyle(
                layer,
              ).textColor}"
            >
              <span class="text-[9px] text-slate-500 font-sans">#{i + 1}</span>
              <span
                >● {layer} ({layerItems.length})</span
              >
            </span>
          {/if}
        {/each}
      {/if}
    </div>

    <!-- Zoom & Layers Panel Controls -->
    <div class="flex items-center space-x-1.5">
      <div
        class="flex items-center space-x-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300"
      >
        <span
          class="text-[10px] text-slate-500 font-mono pr-1 border-r border-slate-800"
          >W: {layoutWindowWidth}px</span
        >
        <button
          onclick={() => (zoomLevel = Math.max(0.2, zoomLevel - 0.25))}
          title="Zoom out (-25%)"
          class="hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800 font-bold"
          >➖</button
        >
        <span
          class="text-[11px] font-mono w-12 text-center font-semibold text-indigo-300"
          >{Math.round(zoomLevel * 100)}%</span
        >
        <button
          onclick={() => (zoomLevel = Math.min(4.0, zoomLevel + 0.25))}
          title="Zoom in (+25%)"
          class="hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800 font-bold"
          >➕</button
        >
        <button
          onclick={() => (zoomLevel = 1.0)}
          title="Reset zoom (100%)"
          class="hover:text-white text-[10px] px-1.5 py-0.5 rounded border-l border-slate-800 ml-1 hover:bg-slate-800"
          >100%</button
        >
        <button
          onclick={fitToLayoutWidth}
          title="Fit canvas to layout window width"
          class="hover:text-white text-[10px] px-1.5 py-0.5 rounded border-l border-slate-800 text-indigo-400 font-semibold hover:bg-indigo-950/60"
          >Fit Window</button
        >
      </div>

      <button
        onclick={() => (showRightLayersPanel = !showRightLayersPanel)}
        title="Toggle Right Layers Panel"
        class="px-2.5 py-1 rounded text-xs font-semibold transition flex items-center space-x-1 border {showRightLayersPanel
          ? 'bg-indigo-600 text-white border-indigo-500 shadow'
          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'}"
      >
        <span>👁️</span>
        <span>Layers Sidebar</span>
      </button>
    </div>
  </div>

  <!-- Main Canvas Container -->
  <div
    class="flex-1 overflow-auto p-4 bg-slate-950 relative"
    onwheel={handleWheelZoom}
  >
    {#if loading}
      <div
        class="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-30 flex items-center justify-center"
      >
        <div
          class="flex items-center space-x-2 text-indigo-400 font-medium text-sm"
        >
          <span class="animate-spin text-lg">⏳</span>
          <span>Processing PDF page...</span>
        </div>
      </div>
    {/if}

    <div class="flex min-w-full min-h-full p-4">
      <!-- Canvas Image + Interactive SVG BBox Overlay View -->
      {#if imageUrl}
        <div
          class="relative shadow-2xl rounded overflow-hidden shrink-0 m-auto ring-1 ring-slate-800"
          style="width: {canvasDisplayWidth}px; height: {canvasDisplayHeight}px; transition: width 0.15s, height 0.15s;"
        >
          <!-- Background PDF Page Image -->
          <img
            src={imageUrl}
            alt="Rendered page"
            style="max-width: none !important; max-height: none !important; width: 100%; height: 100%; object-fit: fill; display: block;"
            class="block pointer-events-none absolute inset-0 w-full h-full"
          />

          <!-- Interactive SVG Bounding Box Layer -->
          <svg
            class="absolute inset-0 w-full h-full pointer-events-auto"
            viewBox="0 0 {baseWidth} {baseHeight}"
            preserveAspectRatio="none"
          >
            {#each renderOrderLayers as layerKey}
              {@const layerItems = normalizeLayerItems(executeResponseJson?.[layerKey])}
              {#if activeLayers[layerKey] && layerItems.length > 0}
                {#each layerItems as item, idx}
                  {#if isSublayerVisible(layerKey, idx, sublayerVisibility, activeLayers)}
                    {@const b = getItemBBox(item)}
                    {@const isLine =
                      layerKey === "lines" ||
                      item.orientation ||
                      (item.start && item.end) ||
                      b.width === 0 ||
                      b.height === 0}
                    {@const isTable = isTableItem(item)}

                    {#if isTable}
                      {@const tbl = getTableElements(item)}

                      <!-- 1. Very light Table Outer BBox Background -->
                      {#if isSublayerVisible(layerKey, `${idx}_table`, sublayerVisibility, activeLayers)}
                        <rect
                          x={tbl.bbox.x}
                          y={tbl.bbox.y}
                          width={tbl.bbox.width}
                          height={tbl.bbox.height}
                          fill={hoveredItem && (hoveredItem.item === item || hoveredItem.tableParent === item)
                            ? "rgba(99, 102, 241, 0.12)"
                            : "rgba(99, 102, 241, 0.03)"}
                          stroke={globalStrokeColor ||
                            (hoveredItem && (hoveredItem.item === item || hoveredItem.tableParent === item)
                              ? "#818cf8"
                              : "rgba(99, 102, 241, 0.45)")}
                          stroke-width={hoveredItem && (hoveredItem.item === item || hoveredItem.tableParent === item)
                            ? strokeWidth + 1
                            : strokeWidth}
                          stroke-dasharray="6 3"
                          vector-effect="non-scaling-stroke"
                          role="presentation"
                          class="cursor-pointer transition-colors duration-150"
                          onmouseenter={() =>
                            (hoveredItem = {
                              type: "table",
                              text: `Table #${item.id || idx + 1} (${tbl.rows.length} rows, ${tbl.columns.length} columns)`,
                              bbox: tbl.bbox,
                              id: item.id || idx + 1,
                              item: item,
                            })}
                          onmouseleave={() => (hoveredItem = null)}
                        />
                      {/if}

                      <!-- 2. Individual Columns Bounding Boxes -->
                      {#if isSublayerVisible(layerKey, `${idx}_columns`, sublayerVisibility, activeLayers)}
                        {#each tbl.columns as col, colIdx}
                          {#if isSublayerVisible(layerKey, `${idx}_col_${colIdx}`, sublayerVisibility, activeLayers)}
                            {@const cb = getItemBBox(col)}
                            <rect
                              x={cb.x}
                              y={cb.y}
                              width={cb.width}
                              height={cb.height}
                              fill={hoveredItem && hoveredItem.item === col
                                ? "rgba(245, 158, 11, 0.22)"
                                : "rgba(245, 158, 11, 0.04)"}
                              stroke={globalStrokeColor ||
                                (hoveredItem && hoveredItem.item === col
                                  ? "#fbbf24"
                                  : "rgba(245, 158, 11, 0.5)")}
                              stroke-width={hoveredItem && hoveredItem.item === col ? 2 : 1.2}
                              stroke-dasharray="4 3"
                              vector-effect="non-scaling-stroke"
                              role="presentation"
                              class="cursor-pointer transition-colors duration-100"
                              onmouseenter={() =>
                                (hoveredItem = {
                                  type: "table_column",
                                  text: `Column #${col.id || colIdx + 1}: ${getElementText(col) || `Col ${colIdx + 1}`}`,
                                  bbox: cb,
                                  id: col.id || colIdx + 1,
                                  item: col,
                                  tableParent: item,
                                })}
                              onmouseleave={() => (hoveredItem = null)}
                            />
                          {/if}
                        {/each}
                      {/if}

                      <!-- 3. Individual Rows Bounding Boxes -->
                      {#if isSublayerVisible(layerKey, `${idx}_rows`, sublayerVisibility, activeLayers)}
                        {#each tbl.rows as row, rowIdx}
                          {#if isSublayerVisible(layerKey, `${idx}_row_${rowIdx}`, sublayerVisibility, activeLayers)}
                            {@const rb = getItemBBox(row)}
                            {@const isHeader = Boolean(row.is_header || row.header || (rowIdx === 0 && row.is_header !== false && tbl.rows[0]?.is_header))}
                            <rect
                              x={rb.x}
                              y={rb.y}
                              width={rb.width}
                              height={rb.height}
                              fill={hoveredItem && hoveredItem.item === row
                                ? isHeader
                                  ? "rgba(16, 185, 129, 0.28)"
                                  : "rgba(168, 85, 247, 0.25)"
                                : isHeader
                                  ? "rgba(16, 185, 129, 0.12)"
                                  : "rgba(168, 85, 247, 0.05)"}
                              stroke={globalStrokeColor ||
                                (hoveredItem && hoveredItem.item === row
                                  ? isHeader
                                    ? "#34d399"
                                    : "#c084fc"
                                  : isHeader
                                    ? "rgba(16, 185, 129, 0.75)"
                                    : "rgba(168, 85, 247, 0.45)")}
                              stroke-width={hoveredItem && hoveredItem.item === row
                                ? 2
                                : isHeader
                                  ? 1.5
                                  : 1.2}
                              vector-effect="non-scaling-stroke"
                              role="presentation"
                              class="cursor-pointer transition-colors duration-100"
                              onmouseenter={() =>
                                (hoveredItem = {
                                  type: isHeader ? "table_header" : "table_row",
                                  text: `${isHeader ? "Header " : ""}Row #${row.id || rowIdx + 1}: ${getElementText(row)}`,
                                  bbox: rb,
                                  id: row.id || rowIdx + 1,
                                  item: row,
                                  tableParent: item,
                                })}
                              onmouseleave={() => (hoveredItem = null)}
                            />
                          {/if}
                        {/each}
                      {/if}

                    {:else if item.data_base64 || item.data}
                      <image
                        x={b.x}
                        y={b.y}
                        width={b.width}
                        height={b.height}
                        href={item.data_base64 || item.data}
                        preserveAspectRatio="none"
                        role="img"
                        aria-label="Extracted graphic"
                        class="cursor-pointer transition-opacity duration-150 hover:opacity-90"
                        onmouseenter={() =>
                          (hoveredItem = {
                            type: layerKey,
                            text: `Photo #${idx + 1} (${item.pixel_width || Math.round(b.width)}×${item.pixel_height || Math.round(b.height)}px)`,
                            bbox: b,
                            id: idx + 1,
                            item: item,
                          })}
                        onmouseleave={() => (hoveredItem = null)}
                      />
                    {/if}
                    {#if isLine}
                      {@const x1 = item.start?.x ?? b.x1}
                      {@const y1 = item.start?.y ?? b.y1}
                      {@const x2 =
                        item.end?.x ??
                        (item.orientation === "Horizontal"
                          ? b.x2
                          : b.width > 0
                            ? b.x2
                            : b.x1)}
                      {@const y2 =
                        item.end?.y ??
                        (item.orientation === "Vertical"
                          ? b.y2
                          : b.height > 0
                            ? b.y2
                            : b.y1)}
                      <!-- Transparent wider stroke for easy hover hit-testing -->
                      <line
                        {x1}
                        {y1}
                        {x2}
                        {y2}
                        stroke="transparent"
                        stroke-width="14"
                        stroke-linecap="round"
                        vector-effect="non-scaling-stroke"
                        role="presentation"
                        class="cursor-pointer"
                        onmouseenter={() =>
                          (hoveredItem = {
                            type: layerKey,
                            text: `Line #${item.id || idx + 1}${item.orientation ? ` (${item.orientation})` : ""}`,
                            bbox: b,
                            id: item.id || idx + 1,
                            item: item,
                          })}
                        onmouseleave={() => (hoveredItem = null)}
                      />
                      <!-- Visible 5px stroke line -->
                      <line
                        {x1}
                        {y1}
                        {x2}
                        {y2}
                        stroke={globalStrokeColor ||
                          (hoveredItem && hoveredItem.item === item
                            ? getLayerStyle(layerKey).hoverStroke
                            : getLayerStyle(layerKey).stroke)}
                        stroke-width={hoveredItem && hoveredItem.item === item
                          ? 7
                          : 5}
                        stroke-linecap="round"
                        vector-effect="non-scaling-stroke"
                        role="presentation"
                        class="cursor-pointer transition-all duration-100 pointer-events-none"
                      />
                    {:else}
                      <rect
                        x={b.x}
                        y={b.y}
                        width={b.width}
                        height={b.height}
                        fill={hoveredItem && hoveredItem.item === item
                          ? getLayerStyle(layerKey).hoverFill
                          : getLayerStyle(layerKey).fill}
                        stroke={globalStrokeColor ||
                          (hoveredItem && hoveredItem.item === item
                            ? getLayerStyle(layerKey).hoverStroke
                            : getLayerStyle(layerKey).stroke)}
                        stroke-width={hoveredItem && hoveredItem.item === item
                          ? strokeWidth + 1
                          : strokeWidth}
                        stroke-dasharray={item.data_base64 || item.data
                          ? "4 2"
                          : undefined}
                        vector-effect="non-scaling-stroke"
                        role="presentation"
                        class="cursor-pointer transition-colors duration-100"
                        onmouseenter={() =>
                          (hoveredItem = {
                            type: layerKey,
                            text:
                              item.text ||
                              (item.data_base64 ? `Photo #${idx + 1}` : ""),
                            bbox: b,
                            id: idx + 1,
                            item: item,
                          })}
                        onmouseleave={() => (hoveredItem = null)}
                      />
                    {/if}
                  {/if}
                {/each}
              {/if}
            {/each}
          </svg>
        </div>
      {:else}
        <div class="text-center py-20 text-slate-400 italic text-sm m-auto">
          No page rendered. Select a session or click Execute to view PDF page.
        </div>
      {/if}
    </div>
  </div>
</div>
