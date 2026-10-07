<script>
  import { onMount } from 'svelte';
  import ResizableSplitPane from './ResizableSplitPane.svelte';

  export let baseUrl = 'http://localhost:9191';
  export let sessionId = null;
  export let pageCount = 1;

  // Render & execution state
  let currentPage = 0;
  let currentDpi = 300;
  let untilStep = 0;
  let strokeWidth = 2;
  let globalStrokeColor = '';

  // Storage keys for persistent configs
  const STORAGE_KEY = 'mypdfutils_pipeline_json_config';
  const STORAGE_KEY_DSL = 'mypdfutils_pipeline_dsl_config';

  const DEFAULT_DSL_QUERY = `LOAD "sample.pdf" AS pdf
EXTRACT WORDS FROM pdf AS words
FIND SENTENCES FROM words AS sentences
FIND ROWS FROM sentences AS rows
FIND COLUMNS FROM rows AS cols
RETURN rows, cols`;

  function getInitialDslBodyText() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_DSL);
      if (saved) return saved;
    }
    return DEFAULT_DSL_QUERY;
  }

  // DSL & Pane tabs state
  let dslBodyText = getInitialDslBodyText();
  let topLeftTab = 'dsl'; // 'dsl' | 'json'
  let bottomLeftTab = 'ast'; // 'ast' | 'logical' | 'physical' | 'output'
  let dslCompileResponseJson = null;

  // View & Layout state
  let imageUrl = null;
  let imageWidth = 1000;
  let imageHeight = 1000;
  let zoomLevel = 1.0;
  let loading = false;
  let errorMsg = '';
  let showOutputModal = false;
  let rightPaneElement = null;
  let layoutWindowWidth = 800;
  let pdfWidth = 612;
  let pdfHeight = 792;

  $: baseWidth = pdfWidth || imageWidth || 612;
  $: baseHeight = pdfHeight || imageHeight || 792;
  $: canvasDisplayWidth = Math.round(baseWidth * zoomLevel);
  $: canvasDisplayHeight = Math.round(baseHeight * zoomLevel);

  function handleWheelZoom(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      zoomLevel = Math.max(0.2, Math.min(4.0, zoomLevel + delta));
    }
  }

  let saveNotification = false;

  function saveCurrentConfig() {
    if (typeof localStorage !== 'undefined') {
      try {
        if (topLeftTab === 'dsl') {
          localStorage.setItem(STORAGE_KEY_DSL, dslBodyText);
        } else {
          localStorage.setItem(STORAGE_KEY, jsonBodyText);
        }
        saveNotification = true;
        setTimeout(() => {
          saveNotification = false;
        }, 2000);
      } catch (e) {
        // Ignore storage quota errors
      }
    }
  }

  function handleCompileOrExecute() {
    if (topLeftTab === 'dsl') {
      executeDslQuery();
    } else {
      executePipeline();
    }
  }

  // Keyboard shortcut (Cmd+R / Ctrl+R to execute/compile, Cmd+S / Ctrl+S to save) handler
  function handleKeyDown(e) {
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        handleCompileOrExecute();
      } else if (key === 's') {
        e.preventDefault();
        saveCurrentConfig();
      }
    }
  }

  // Dynamic layer controls & visibility toggles
  let availableLayers = [];
  let activeLayers = {};

  const layerStyles = {
    words: {
      stroke: '#00C800',
      fill: 'rgba(0, 200, 0, 0.12)',
      hoverStroke: '#00FF78',
      hoverFill: 'rgba(0, 255, 120, 0.45)',
      textColor: 'text-emerald-400',
      accentClass: 'accent-emerald-500',
    },
    sentences: {
      stroke: '#00A0DC',
      fill: 'rgba(0, 160, 220, 0.12)',
      hoverStroke: '#00E0FF',
      hoverFill: 'rgba(0, 200, 255, 0.45)',
      textColor: 'text-sky-400',
      accentClass: 'accent-sky-500',
    },
    rows: {
      stroke: '#C800C8',
      fill: 'rgba(200, 0, 200, 0.12)',
      hoverStroke: '#FF00FF',
      hoverFill: 'rgba(255, 0, 255, 0.45)',
      textColor: 'text-purple-400',
      accentClass: 'accent-purple-500',
    },
    columns: {
      stroke: '#FF8000',
      fill: 'rgba(255, 128, 0, 0.12)',
      hoverStroke: '#FFAA00',
      hoverFill: 'rgba(255, 170, 0, 0.45)',
      textColor: 'text-amber-400',
      accentClass: 'accent-amber-500',
    },
    tables: {
      stroke: '#FF0000',
      fill: 'rgba(255, 0, 0, 0.08)',
      hoverStroke: '#FF4444',
      hoverFill: 'rgba(255, 60, 60, 0.40)',
      textColor: 'text-red-400',
      accentClass: 'accent-red-500',
    },
    lines: {
      stroke: '#00D2FF',
      fill: 'rgba(0, 210, 255, 0.12)',
      hoverStroke: '#60EFFF',
      hoverFill: 'rgba(96, 239, 255, 0.45)',
      textColor: 'text-teal-400',
      accentClass: 'accent-teal-500',
    },
  };

  function getLayerStyle(layer) {
    return (
      layerStyles[layer] || {
        stroke: '#A855F7',
        fill: 'rgba(168, 85, 247, 0.12)',
        hoverStroke: '#C084FC',
        hoverFill: 'rgba(192, 132, 252, 0.45)',
        textColor: 'text-indigo-400',
        accentClass: 'accent-indigo-500',
      }
    );
  }

  // Hovered item tooltip state
  let hoveredItem = null;

  // Execution JSON result
  let executeResponseJson = null;
  let executionSummary = '';

  // Default JSON Body template
  const DEFAULT_PIPELINE_JSON = JSON.stringify(
    {
      config: {
        parser: {
          horizontal_gap_tolerance: 3.0,
          vertical_gap_tolerance: 2.0,
          row_y_tolerance: 1.5,
          column_x_tolerance: 10.0,
        },
      },
      params: {
        page: 0,
        dpi: 300,
        until_step: 0,
        stroke_width: 2,
      },
      apply: [
        { function: 'extract_words', args: {} },
        { function: 'cluster_sentences', args: {} },
        { function: 'cluster_rows', args: {} },
        { function: 'detect_columns', args: {} },
        { function: 'build_table_structure', args: {} },
      ],
    },
    null,
    2
  );

  function getInitialJsonBodyText() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return saved;
    }
    return DEFAULT_PIPELINE_JSON;
  }

  // JSON Body Editor string
  let jsonBodyText = getInitialJsonBodyText();
  let isInitialized = false;

  // Synchronize JSON body params when top controls change
  function updateJsonFromControls() {
    try {
      const parsed = JSON.parse(jsonBodyText);
      parsed.params = parsed.params || {};
      parsed.params.page = currentPage;
      parsed.params.dpi = currentDpi;
      parsed.params.until_step = untilStep;
      parsed.params.stroke_width = strokeWidth;
      if (globalStrokeColor) {
        parsed.params.stroke_color = globalStrokeColor;
      } else {
        delete parsed.params.stroke_color;
      }
      jsonBodyText = JSON.stringify(parsed, null, 2);
    } catch (e) {
      // Ignore parse errors while user typing
    }
  }

  function updateLayoutWidth() {
    if (rightPaneElement) {
      layoutWindowWidth = rightPaneElement.clientWidth || 800;
    }
  }

  function fitToLayoutWidth() {
    updateLayoutWidth();
    const bw = pdfWidth || imageWidth || 612;
    if (layoutWindowWidth > 60 && bw > 0) {
      const availableW = layoutWindowWidth - 48;
      zoomLevel = Math.max(0.2, Math.min(4.0, availableW / bw));
    }
  }

  onMount(() => {
    // Restore JSON config from LocalStorage if present
    if (typeof localStorage !== 'undefined') {
      const savedConfig = localStorage.getItem(STORAGE_KEY);
      if (savedConfig) {
        jsonBodyText = savedConfig;
      }
    }
    isInitialized = true;

    // Attach global keyboard shortcut (Cmd+R / Ctrl+R to execute, Cmd+S / Ctrl+S to save) listener
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    updateLayoutWidth();
    let observer = null;
    if (typeof ResizeObserver !== 'undefined' && rightPaneElement) {
      observer = new ResizeObserver(() => {
        updateLayoutWidth();
      });
      observer.observe(rightPaneElement);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
      }
      if (observer) observer.disconnect();
    };
  });

  // Persist jsonBodyText changes to LocalStorage only after initialization
  $: if (isInitialized && jsonBodyText && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, jsonBodyText);
    } catch (e) {
      // Ignore storage quota errors
    }
  }

  // Fetch raw page background image for SVG canvas view
  async function loadRawPageImage() {
    if (!sessionId) return;
    loading = true;
    errorMsg = '';
    try {
      updateLayoutWidth();
      let url = `${baseUrl}/api/sessions/${sessionId}/render?page=${currentPage}&dpi=${currentDpi}`;
      if (layoutWindowWidth > 100) {
        const targetW = Math.round(layoutWindowWidth - 48);
        url += `&target_width=${targetW}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const headerW = res.headers.get('X-Pdf-Width') || res.headers.get('x-pdf-width');
      const headerH = res.headers.get('X-Pdf-Height') || res.headers.get('x-pdf-height');
      if (headerW && headerH) {
        const parsedW = parseFloat(headerW);
        const parsedH = parseFloat(headerH);
        if (parsedW > 0 && parsedH > 0) {
          pdfWidth = parsedW;
          pdfHeight = parsedH;
        }
      }

      const blob = await res.blob();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(blob);

      // Measure natural dimensions
      const img = new Image();
      img.src = imageUrl;
      await img.decode().catch(() => {});
      imageWidth = img.naturalWidth || 1000;
      imageHeight = img.naturalHeight || 1000;
    } catch (err) {
      errorMsg = `Failed to load PDF page image: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  // Execute pipeline via JSON body (`POST /api/sessions/:id/execute`)
  async function executePipeline() {
    if (!sessionId) return;
    loading = true;
    errorMsg = '';
    executeResponseJson = null;
    executionSummary = '';

    try {
      await loadRawPageImage();
      const body = JSON.parse(jsonBodyText);
      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      executeResponseJson = data;

      if (data.pdf_width && data.pdf_height) {
        pdfWidth = data.pdf_width;
        pdfHeight = data.pdf_height;
      }

      // Parse dynamic layer keys from response
      const metaKeys = new Set(['session_id', 'function', 'page', 'page_count', 'text', 'pdf_width', 'pdf_height']);
      const newAvailableLayers = Object.keys(data).filter(
        (key) => Array.isArray(data[key]) && data[key].length > 0 && !metaKeys.has(key)
      );

      availableLayers = newAvailableLayers;

      // Clean activeLayers so only currently returned layers remain active
      const nextActiveLayers = {};
      let totalNodes = 0;
      newAvailableLayers.forEach((layer) => {
        nextActiveLayers[layer] = activeLayers[layer] !== undefined ? activeLayers[layer] : true;
        totalNodes += data[layer].length;
      });
      activeLayers = nextActiveLayers;

      executionSummary = `Executed '${data.function}' — ${totalNodes} extracted nodes across ${availableLayers.length} layers (${availableLayers.join(', ')})`;
    } catch (err) {
      errorMsg = `Pipeline Execution Error: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  // Compile and execute PDF DSL query
  async function executeDslQuery() {
    loading = true;
    errorMsg = '';
    dslCompileResponseJson = null;

    try {
      if (sessionId) {
        await loadRawPageImage();
      }
      const endpoint = sessionId
        ? `${baseUrl}/api/sessions/${sessionId}/dsl`
        : `${baseUrl}/api/dsl/compile`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: dslBodyText }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      dslCompileResponseJson = data;

      if (data.pdf_width && data.pdf_height) {
        pdfWidth = data.pdf_width;
        pdfHeight = data.pdf_height;
      }

      if (!data.success && data.error) {
        errorMsg = `DSL Compilation/Execution Error: ${data.error}`;
      } else if (data.results) {
        executeResponseJson = data.results;

        // Parse dynamic layer keys from results
        const newAvailableLayers = Object.keys(data.results).filter(
          (key) => Array.isArray(data.results[key]) && data.results[key].length > 0
        );

        availableLayers = newAvailableLayers;

        const nextActiveLayers = {};
        let totalNodes = 0;
        newAvailableLayers.forEach((layer) => {
          nextActiveLayers[layer] = activeLayers[layer] !== undefined ? activeLayers[layer] : true;
          totalNodes += data.results[layer].length;
        });
        activeLayers = nextActiveLayers;

        executionSummary = `DSL Compiled & Executed — ${totalNodes} extracted nodes across ${availableLayers.length} layers (${availableLayers.join(', ')})`;
      } else {
        executionSummary = 'DSL Compiled successfully (AST & Query Plan updated)';
      }
    } catch (err) {
      errorMsg = `DSL Query Error: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  // Parse returned nodes into overlay lists
  function parseResultNodes(result) {
    extractedWords = [];
    extractedSentences = [];
    extractedRows = [];
    extractedColumns = [];
    extractedTables = [];
    extractedTableCells = [];

    if (!result) return;

    // Handle JsonResponse default page format
    if (result.page && result.groups) {
      if (result.page.words) extractedWords = result.page.words;
      if (result.page.sentences) extractedSentences = result.page.sentences;
      if (result.page.rows) extractedRows = result.page.rows;
      if (result.page.columns) extractedColumns = result.page.columns;
      if (result.page.table_structures) {
        extractedTables = result.page.table_structures;
        for (const t of extractedTables) {
          if (t.cells) extractedTableCells.push(...t.cells);
        }
      }
      return;
    }

    // Direct entity arrays or objects
    if (Array.isArray(result)) {
      if (result.length === 0) return;
      const first = result[0];
      if (first.character !== undefined || (first.text && first.bbox && !first.words && !first.texts)) {
        extractedWords = result;
      } else if (first.words && Array.isArray(first.words)) {
        extractedSentences = result;
      } else if (first.texts && Array.isArray(first.texts)) {
        extractedRows = result;
      }
    } else if (typeof result === 'object') {
      if (result.rows || result.columns || result.cells) {
        extractedTables = [result];
        if (result.rows) extractedRows = result.rows;
        if (result.columns) extractedColumns = result.columns;
        if (result.cells) extractedTableCells = result.cells;
      }
      if (result.words) extractedWords = result.words;
      if (result.sentences) extractedSentences = result.sentences;
    }
  }

  function copyOutputJson() {
    if (executeResponseJson) {
      navigator.clipboard.writeText(JSON.stringify(executeResponseJson, null, 2));
    }
  }

  // Robust bounding box extractor for any node item (Word, Sentence, Row, Column, NodeItem, TableCell)
  function getItemBBox(item) {
    if (!item) return { x: 0, y: 0, width: 0, height: 0, x1: 0, y1: 0, x2: 0, y2: 0 };
    const b = item.bbox || item;
    const x1 = b.x1 !== undefined ? b.x1 : (b.x !== undefined ? b.x : 0);
    const y1 = b.y1 !== undefined ? b.y1 : (b.y !== undefined ? b.y : 0);
    const x2 = b.x2 !== undefined ? b.x2 : (b.width !== undefined ? x1 + b.width : x1);
    const y2 = b.y2 !== undefined ? b.y2 : (b.height !== undefined ? y1 + b.height : y1);
    const width = Math.max(0, x2 - x1);
    const height = Math.max(0, y2 - y1);
    return { x: x1, y: y1, width, height, x1, y1, x2, y2 };
  }

  $: if (sessionId && currentPage !== undefined) {
    loadRawPageImage();
  }
</script>

<div class="pdf-extractor bg-slate-900 border border-slate-700 text-slate-100 rounded-lg shadow-2xl overflow-hidden flex flex-col flex-1 h-full min-h-0">
  <!-- Top Parameters Controls Bar -->
  <div class="controls-bar bg-slate-950 border-b border-slate-800 p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
    <!-- Page & Resolution Controls -->
    <div class="flex items-center space-x-3">
      <label class="flex items-center space-x-1.5 font-medium">
        <span class="text-slate-400">Page:</span>
        <select
          bind:value={currentPage}
          on:change={updateJsonFromControls}
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
          on:change={updateJsonFromControls}
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
        <span class="text-slate-400">Until Step:</span>
        <input
          type="number"
          min="0"
          max="10"
          bind:value={untilStep}
          on:input={updateJsonFromControls}
          title="0 = execute all steps"
          class="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center text-slate-100 focus:border-indigo-500 focus:outline-none"
        />
      </label>

      <label class="flex items-center space-x-1.5 font-medium">
        <span class="text-slate-400">Stroke Width:</span>
        <input
          type="number"
          min="1"
          max="8"
          bind:value={strokeWidth}
          on:input={updateJsonFromControls}
          class="w-12 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center text-slate-100 focus:border-indigo-500 focus:outline-none"
        />
      </label>
    </div>
  </div>

  {#if errorMsg}
    <div class="bg-red-950/90 border-b border-red-700 text-red-200 text-xs px-4 py-2 flex items-center justify-between shrink-0">
      <span>⚠️ {errorMsg}</span>
      <button on:click={() => (errorMsg = '')} class="text-red-400 hover:text-white font-bold ml-2">✕</button>
    </div>
  {/if}

  <!-- 2-COLUMN MAIN RESIZABLE LAYOUT -->
  <div class="split-pane flex-1 flex w-full min-h-0 overflow-hidden">
    <ResizableSplitPane
      direction="horizontal"
      initialLeftPercent={42}
      minLeftPx={300}
      minRightPx={350}
      storageKey="pdf_extractor_left_width"
      on:resize={updateLayoutWidth}
    >
      <!-- LEFT COLUMN: Top (DSL/JSON Editor) + Bottom (AST/Plan Output) Split -->
      {#snippet left()}
        <div class="bg-slate-950 flex flex-col h-full w-full overflow-hidden">
          <ResizableSplitPane
            direction="vertical"
            initialLeftPercent={50}
            minLeftPx={150}
            minRightPx={150}
            storageKey="pdf_extractor_left_vertical_split"
          >
            <!-- TOP PANE: DSL / JSON Editor with Tabs -->
            {#snippet left()}
              <div class="bg-slate-950 flex flex-col h-full w-full overflow-hidden border-b border-slate-800">
                <!-- Action Header & Top Tabs -->
                <div class="p-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 shrink-0">
                  <div class="flex items-center space-x-1.5">
                    <button
                      on:click={() => (topLeftTab = 'dsl')}
                      class="px-3 py-1 rounded text-xs font-bold transition flex items-center space-x-1.5 {topLeftTab === 'dsl' ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}"
                    >
                      <span>📜</span>
                      <span>DSL Query</span>
                    </button>

                    <button
                      on:click={() => (topLeftTab = 'json')}
                      class="px-3 py-1 rounded text-xs font-bold transition flex items-center space-x-1.5 {topLeftTab === 'json' ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}"
                    >
                      <span>⚙️</span>
                      <span>JSON Request</span>
                    </button>

                    {#if saveNotification}
                      <span class="text-[11px] font-semibold text-emerald-400 bg-emerald-950/90 border border-emerald-700/60 px-2 py-0.5 rounded shadow-sm animate-pulse">
                        ✓ Saved!
                      </span>
                    {/if}
                  </div>

                  <div class="flex items-center space-x-1.5">
                    <button
                      on:click={saveCurrentConfig}
                      title="Save Code to LocalStorage (⌘S / Ctrl+S)"
                      class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded font-medium border border-slate-700 transition shadow flex items-center space-x-1"
                    >
                      <span>💾</span>
                      <span>Save</span>
                      <span class="text-[10px] bg-slate-900 px-1 py-0.5 rounded font-mono text-slate-400">⌘S</span>
                    </button>

                    <button
                      on:click={handleCompileOrExecute}
                      disabled={loading}
                      title="Compile & Run Query (⌘R / Ctrl+R)"
                      class="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 py-1 rounded font-semibold transition shadow flex items-center space-x-1.5"
                    >
                      <span>⚡</span>
                      <span>{topLeftTab === 'dsl' ? 'Compile (⌘R)' : 'Execute (⌘R)'}</span>
                    </button>
                  </div>
                </div>

                <!-- Editor Textarea Area -->
                <div class="flex-1 p-2.5 flex flex-col min-h-0 bg-slate-950">
                  {#if topLeftTab === 'dsl'}
                    <textarea
                      bind:value={dslBodyText}
                      spellcheck="false"
                      placeholder="Enter PDF DSL query code..."
                      class="w-full flex-1 bg-slate-900 border border-slate-800 rounded p-3 text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                    ></textarea>
                  {:else}
                    <textarea
                      bind:value={jsonBodyText}
                      spellcheck="false"
                      class="w-full flex-1 bg-slate-900 border border-slate-800 rounded p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                    ></textarea>
                  {/if}
                </div>
              </div>
            {/snippet}

            <!-- BOTTOM PANE: AST, Query Plan, Output Tabs -->
            {#snippet right()}
              <div class="bg-slate-950 flex flex-col h-full w-full overflow-hidden">
                <!-- Bottom Tabs Bar -->
                <div class="p-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
                  <div class="flex items-center space-x-1">
                    <button
                      on:click={() => (bottomLeftTab = 'ast')}
                      class="px-2.5 py-1 rounded text-[11px] font-semibold transition {bottomLeftTab === 'ast' ? 'bg-indigo-900/90 text-indigo-200 border border-indigo-700/80' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
                    >
                      <span>🌳 AST</span>
                    </button>

                    <button
                      on:click={() => (bottomLeftTab = 'logical')}
                      class="px-2.5 py-1 rounded text-[11px] font-semibold transition {bottomLeftTab === 'logical' ? 'bg-indigo-900/90 text-indigo-200 border border-indigo-700/80' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
                    >
                      <span>📐 Logical Plan</span>
                    </button>

                    <button
                      on:click={() => (bottomLeftTab = 'physical')}
                      class="px-2.5 py-1 rounded text-[11px] font-semibold transition {bottomLeftTab === 'physical' ? 'bg-indigo-900/90 text-indigo-200 border border-indigo-700/80' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
                    >
                      <span>⚙️ Physical Plan</span>
                    </button>

                    <button
                      on:click={() => (bottomLeftTab = 'output')}
                      class="px-2.5 py-1 rounded text-[11px] font-semibold transition {bottomLeftTab === 'output' ? 'bg-indigo-900/90 text-indigo-200 border border-indigo-700/80' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}"
                    >
                      <span>📊 Output</span>
                    </button>
                  </div>

                  {#if dslCompileResponseJson}
                    <span class="text-[10px] font-mono px-2 py-0.5 rounded border {dslCompileResponseJson.success ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-red-950 text-red-300 border-red-800'}">
                      {dslCompileResponseJson.success ? '✓ Valid' : '❌ Error'}
                    </span>
                  {/if}
                </div>

                <!-- Bottom Tab Content Display Area -->
                <div class="flex-1 p-3 overflow-auto font-mono text-xs bg-slate-950">
                  {#if bottomLeftTab === 'ast'}
                    {#if dslCompileResponseJson?.ast}
                      <pre class="text-emerald-300 whitespace-pre-wrap leading-relaxed">{JSON.stringify(dslCompileResponseJson.ast, null, 2)}</pre>
                    {:else if dslCompileResponseJson?.error}
                      <div class="text-red-400 bg-red-950/60 p-3 rounded border border-red-800 leading-relaxed">
                        ⚠️ {dslCompileResponseJson.error}
                      </div>
                    {:else}
                      <div class="text-slate-500 italic py-8 text-center">
                        Press ⌘R or click Compile to view AST.
                      </div>
                    {/if}

                  {:else if bottomLeftTab === 'logical'}
                    {#if dslCompileResponseJson?.logical_plan}
                      <pre class="text-sky-300 whitespace-pre-wrap leading-relaxed">{JSON.stringify(dslCompileResponseJson.logical_plan, null, 2)}</pre>
                    {:else if dslCompileResponseJson?.error}
                      <div class="text-red-400 bg-red-950/60 p-3 rounded border border-red-800 leading-relaxed">
                        ⚠️ {dslCompileResponseJson.error}
                      </div>
                    {:else}
                      <div class="text-slate-500 italic py-8 text-center">
                        Press ⌘R or click Compile to view Logical Plan.
                      </div>
                    {/if}

                  {:else if bottomLeftTab === 'physical'}
                    {#if dslCompileResponseJson?.physical_plan}
                      <pre class="text-purple-300 whitespace-pre-wrap leading-relaxed">{JSON.stringify(dslCompileResponseJson.physical_plan, null, 2)}</pre>
                    {:else if dslCompileResponseJson?.error}
                      <div class="text-red-400 bg-red-950/60 p-3 rounded border border-red-800 leading-relaxed">
                        ⚠️ {dslCompileResponseJson.error}
                      </div>
                    {:else}
                      <div class="text-slate-500 italic py-8 text-center">
                        Press ⌘R or click Compile to view Physical Plan.
                      </div>
                    {/if}

                  {:else if bottomLeftTab === 'output'}
                    {#if dslCompileResponseJson?.results || executeResponseJson}
                      <pre class="text-indigo-200 whitespace-pre-wrap leading-relaxed">{JSON.stringify(dslCompileResponseJson?.results || executeResponseJson, null, 2)}</pre>
                    {:else if dslCompileResponseJson?.error}
                      <div class="text-red-400 bg-red-950/60 p-3 rounded border border-red-800 leading-relaxed">
                        ⚠️ {dslCompileResponseJson.error}
                      </div>
                    {:else}
                      <div class="text-slate-500 italic py-8 text-center">
                        Press ⌘R or click Execute to view Output JSON.
                      </div>
                    {/if}
                  {/if}
                </div>
              </div>
            {/snippet}
          </ResizableSplitPane>
        </div>
      {/snippet}

      <!-- RIGHT COLUMN: PDF Canvas Image + Interactive SVG Overlay Layer -->
      {#snippet right()}
        <div
          bind:this={rightPaneElement}
          class="bg-slate-950 flex flex-col h-full w-full overflow-hidden relative"
        >
        <!-- Layer Filter & View Control Bar -->
        <div class="bg-slate-900/90 border-b border-slate-800 p-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <!-- Visibility Toggles (Dynamically Derived from Response) -->
          <div class="flex items-center space-x-2.5">
            <span class="text-[11px] text-slate-400 font-semibold uppercase">Layers:</span>
            {#if availableLayers.length === 0}
              <span class="text-[11px] text-slate-500 italic">None (click Execute or ⌘R)</span>
            {:else}
              {#each availableLayers as layer}
                <label class="flex items-center space-x-1 cursor-pointer font-medium {getLayerStyle(layer).textColor}">
                  <input
                    type="checkbox"
                    bind:checked={activeLayers[layer]}
                    class="{getLayerStyle(layer).accentClass} rounded"
                  />
                  <span class="capitalize">{layer} ({executeResponseJson[layer]?.length || 0})</span>
                </label>
              {/each}
            {/if}
          </div>

          <!-- Zoom Controls -->
          <div class="flex items-center space-x-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
            <span class="text-[10px] text-slate-500 font-mono pr-1 border-r border-slate-800">W: {layoutWindowWidth}px</span>
            <button on:click={() => (zoomLevel = Math.max(0.2, zoomLevel - 0.25))} title="Zoom out (-25%)" class="hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800 font-bold">➖</button>
            <span class="text-[11px] font-mono w-12 text-center font-semibold text-indigo-300">{Math.round(zoomLevel * 100)}%</span>
            <button on:click={() => (zoomLevel = Math.min(4.0, zoomLevel + 0.25))} title="Zoom in (+25%)" class="hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800 font-bold">➕</button>
            <button on:click={() => (zoomLevel = 1.0)} title="Reset zoom (100%)" class="hover:text-white text-[10px] px-1.5 py-0.5 rounded border-l border-slate-800 ml-1 hover:bg-slate-800">100%</button>
            <button on:click={fitToLayoutWidth} title="Fit canvas to layout window width" class="hover:text-white text-[10px] px-1.5 py-0.5 rounded border-l border-slate-800 text-indigo-400 font-semibold hover:bg-indigo-950/60">Fit Window</button>
          </div>
        </div>

        <!-- Main Canvas / Image Viewport Container -->
        <div
          class="flex-1 overflow-auto p-4 bg-slate-950 relative"
          on:wheel={handleWheelZoom}
        >
          {#if loading}
            <div class="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-30 flex items-center justify-center">
              <div class="flex items-center space-x-2 text-indigo-400 font-medium text-sm">
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
                  alt="PDF Page"
                  style="max-width: none !important; max-height: none !important; width: 100%; height: 100%; object-fit: fill; display: block;"
                  class="block pointer-events-none absolute inset-0 w-full h-full"
                />

                <!-- Interactive SVG Bounding Box Layer -->
                <svg
                  class="absolute inset-0 w-full h-full pointer-events-auto"
                  viewBox="0 0 {baseWidth} {baseHeight}"
                  preserveAspectRatio="none"
                >
                  {#each availableLayers as layerKey}
                    {#if activeLayers[layerKey] && executeResponseJson && executeResponseJson[layerKey]}
                      {#each executeResponseJson[layerKey] as item, idx}
                        {@const b = getItemBBox(item)}
                        <rect
                          x={b.x}
                          y={b.y}
                          width={b.width}
                          height={b.height}
                          fill={hoveredItem && hoveredItem.item === item ? getLayerStyle(layerKey).hoverFill : getLayerStyle(layerKey).fill}
                          stroke={hoveredItem && hoveredItem.item === item ? getLayerStyle(layerKey).hoverStroke : getLayerStyle(layerKey).stroke}
                          stroke-width={hoveredItem && hoveredItem.item === item ? strokeWidth + 1 : strokeWidth}
                          vector-effect="non-scaling-stroke"
                          class="cursor-pointer transition-colors duration-100"
                          on:mouseenter={() =>
                            (hoveredItem = {
                              type: layerKey,
                              text: item.text || '',
                              bbox: b,
                              id: idx + 1,
                              item: item,
                            })}
                          on:mouseleave={() => (hoveredItem = null)}
                        />
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

        <!-- Hover Tooltip Overlay (Fixed on Right Pane Viewport, Immune to Canvas Zoom & Scroll) -->
        {#if hoveredItem}
          <div class="absolute bottom-4 left-4 z-40 bg-slate-900/95 border-2 border-indigo-500/80 p-3.5 rounded-xl shadow-2xl max-w-md backdrop-blur-md text-xs space-y-2 pointer-events-none">
            <div class="flex items-center justify-between border-b border-slate-800 pb-1.5 space-x-4">
              <div class="flex items-center space-x-2">
                <span class="w-2.5 h-2.5 rounded-full inline-block" style="background-color: {getLayerStyle(hoveredItem.type).stroke};"></span>
                <span class="capitalize font-extrabold text-sm text-indigo-300 tracking-wide">
                  {hoveredItem.type} {hoveredItem.id !== undefined ? `#${hoveredItem.id}` : ''}
                </span>
              </div>
              <span class="text-[10px] font-mono text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 font-semibold">
                [{Math.round(hoveredItem.bbox?.x1 || 0)}, {Math.round(hoveredItem.bbox?.y1 || 0)}] ➔ [{Math.round(hoveredItem.bbox?.x2 || 0)}, {Math.round(hoveredItem.bbox?.y2 || 0)}]
              </span>
            </div>
            {#if hoveredItem.text}
              <div class="text-emerald-300 font-mono text-xs font-semibold leading-relaxed break-words bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 max-h-32 overflow-y-auto">
                "{hoveredItem.text}"
              </div>
            {/if}
            <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono font-medium pt-0.5">
              <span>Width: {Math.round((hoveredItem.bbox?.x2 || 0) - (hoveredItem.bbox?.x1 || 0))} pt</span>
              <span>Height: {Math.round((hoveredItem.bbox?.y2 || 0) - (hoveredItem.bbox?.y1 || 0))} pt</span>
            </div>
          </div>
        {/if}
      </div>
      {/snippet}
    </ResizableSplitPane>
  </div>

  <!-- OUTPUT FOOTER BAR -->
  <div class="output-footer bg-slate-950 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-xs">
    <div class="flex items-center space-x-2 text-slate-300 font-mono truncate">
      <span class="text-emerald-400 font-bold">STATUS:</span>
      {#if executionSummary}
        <span class="text-indigo-300 truncate">{executionSummary}</span>
      {:else}
        <span class="text-slate-500 italic">Ready. Click Execute (JSON) to run extraction.</span>
      {/if}
    </div>

    {#if executeResponseJson}
      <button
        on:click={() => (showOutputModal = true)}
        class="bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/60 font-semibold px-3 py-1 rounded transition shadow flex items-center space-x-1.5"
      >
        <span>📋</span>
        <span>View Output JSON</span>
      </button>
    {/if}
  </div>
</div>

<!-- OUTPUT JSON MODAL DIALOG -->
{#if showOutputModal && executeResponseJson}
  <div
    style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; z-index: 999999; background: rgba(2, 6, 23, 0.88); backdrop-filter: blur(4px);"
    class="flex items-center justify-center p-4"
    on:click|self={() => (showOutputModal = false)}
  >
    <div class="bg-slate-900 border border-indigo-900/80 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]">
      <!-- Modal Header -->
      <div class="p-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
        <div class="flex items-center space-x-2 font-bold text-xs uppercase tracking-wider text-indigo-400">
          <span>📋</span>
          <span>Pipeline Output JSON ({executeResponseJson.function})</span>
        </div>

        <div class="flex items-center space-x-2">
          <button
            on:click={copyOutputJson}
            class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1 rounded transition flex items-center space-x-1"
          >
            <span>📄</span>
            <span>Copy JSON</span>
          </button>

          <button
            on:click={() => (showOutputModal = false)}
            class="text-slate-400 hover:text-white text-lg font-bold px-2 py-0.5 rounded transition hover:bg-slate-800"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="p-4 overflow-y-auto flex-1 bg-slate-950 font-mono text-xs">
        <pre class="text-indigo-200 whitespace-pre-wrap leading-relaxed">{JSON.stringify(executeResponseJson, null, 2)}</pre>
      </div>

      <!-- Modal Footer -->
      <div class="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
        <button
          on:click={() => (showOutputModal = false)}
          class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-1.5 rounded font-medium transition"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
