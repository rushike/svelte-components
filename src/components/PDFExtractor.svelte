<script>
  import { onMount } from "svelte";
  import ResizableSplitPane from "./ResizableSplitPane.svelte";
  import { ServerPdfProvider } from "../lib/providers";

  import {
    STORAGE_KEY_DSL,
    STORAGE_KEY_USE_WASM,
    DEFAULT_DSL_QUERY,
  } from "./pdf-extractor/pdfExtractorConstants";

  import {
    getOrInitWasmEngine,
    syncLayersFromResponse,
    buildSublayersVisibility,
    extractPasswordFromDsl,
  } from "./pdf-extractor/pdfExtractorService";

  import PDFExtractorToolbar from "./pdf-extractor/PDFExtractorToolbar.svelte";
  import PDFEditorPane from "./pdf-extractor/PDFEditorPane.svelte";
  import PDFPlanInspector from "./pdf-extractor/PDFPlanInspector.svelte";
  import PDFCanvasViewport from "./pdf-extractor/PDFCanvasViewport.svelte";
  import PDFLayersSidebar from "./pdf-extractor/PDFLayersSidebar.svelte";
  import PDFNodeInspectorBar from "./pdf-extractor/PDFNodeInspectorBar.svelte";
  import PDFOutputModal from "./pdf-extractor/PDFOutputModal.svelte";

  let {
    baseUrl = "http://localhost:9191",
    provider = null,
    sessionId = null,
    pageCount = 1,
    useWasm = $bindable(false),
  } = $props();

  // Engine & Provider instances
  let wasmInitializing = $state(false);
  let wasmProviderInstance = $state(null);

  let currentBaseUrl = $state(baseUrl);
  let serverProviderInstance = $state(new ServerPdfProvider(baseUrl));

  $effect(() => {
    if (baseUrl !== currentBaseUrl) {
      currentBaseUrl = baseUrl;
      serverProviderInstance = new ServerPdfProvider(baseUrl);
    }
  });

  let activeProvider = $derived(
    provider
      ? provider
      : useWasm && wasmProviderInstance
        ? wasmProviderInstance
        : serverProviderInstance,
  );

  $effect(() => {
    if (useWasm && !wasmProviderInstance && !provider) {
      setEngineWasm(true);
    }
  });

  async function setEngineWasm(enabled) {
    useWasm = enabled;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_USE_WASM, enabled ? "true" : "false");
    }

    if (enabled && !wasmProviderInstance) {
      wasmInitializing = true;
      try {
        wasmProviderInstance = await getOrInitWasmEngine();
      } catch (err) {
        console.error("Failed to initialize WASM engine:", err);
        errorMsg = `Failed to initialize WASM engine: ${err.message}`;
        useWasm = false;
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEY_USE_WASM, "false");
        }
      } finally {
        wasmInitializing = false;
      }
    }
  }

  // Render & execution state
  let currentPage = $state(0);
  let currentDpi = $state(300);
  let strokeWidth = $state(2);
  let globalStrokeColor = $state("");

  function getInitialDsl() {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(STORAGE_KEY_DSL) || DEFAULT_DSL_QUERY;
    }
    return DEFAULT_DSL_QUERY;
  }

  // DSL state
  let dslBodyText = $state(getInitialDsl());
  let bottomLeftTab = $state("ast");
  let saveNotification = $state(false);

  // Results state
  let dslCompileResponseJson = $state(null);
  let executeResponseJson = $state(null);
  let executionSummary = $state("");

  // Canvas View & Layout state
  let imageUrl = $state(null);
  let imageWidth = $state(1000);
  let imageHeight = $state(1000);
  let pdfWidth = $state(612);
  let pdfHeight = $state(792);
  let zoomLevel = $state(1.0);
  let layoutWindowWidth = $state(800);
  let rightPaneElement = $state(null);
  let renderedSessionId = $state(null);
  let renderedPage = $state(null);
  let renderedDpi = $state(null);

  let isImageLoading = $state(false);
  let isExecuting = $state(false);
  let loading = $derived(isImageLoading || isExecuting);
  let errorMsg = $state("");
  let showOutputModal = $state(false);
  let showRightLayersPanel = $state(true);
  let hoveredItem = $state(null);

  // Dynamic layers
  let availableLayers = $state([]);
  let activeLayers = $state({});
  let sublayerVisibility = $state({});
  let renderOrderLayers = $derived([...availableLayers].reverse());

  let isInitialized = $state(false);

  function saveCurrentConfig() {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_DSL, dslBodyText);
        saveNotification = true;
        setTimeout(() => {
          saveNotification = false;
        }, 2000);
      } catch (e) {}
    }
  }

  function handleKeyDown(e) {
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (key === "r") {
        e.preventDefault();
        executeDslQuery();
      } else if (key === "s") {
        e.preventDefault();
        saveCurrentConfig();
      }
    }
  }

  async function loadRawPageImage() {
    if (!sessionId || isImageLoading) return;
    isImageLoading = true;
    errorMsg = "";
    try {
      const targetW =
        layoutWindowWidth > 100
          ? Math.round(layoutWindowWidth - 48)
          : undefined;
      const pwd = extractPasswordFromDsl(dslBodyText);
      const renderRes = await activeProvider.renderPage(
        sessionId,
        currentPage,
        currentDpi,
        targetW,
        pwd,
      );
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = renderRes.url;
      imageWidth = renderRes.width || 1000;
      imageHeight = renderRes.height || 1000;
      renderedSessionId = sessionId;
      renderedPage = currentPage;
      renderedDpi = currentDpi;
    } catch (err) {
      const msg = typeof err === "string" ? err : err?.message || String(err);
      errorMsg = `Failed to load PDF page image: ${msg}`;
    } finally {
      isImageLoading = false;
    }
  }

  async function executeDslQuery() {
    if (isExecuting) return;
    isExecuting = true;
    errorMsg = "";
    dslCompileResponseJson = null;

    try {
      const needsRender =
        Boolean(sessionId) &&
        (!imageUrl ||
          renderedSessionId !== sessionId ||
          renderedPage !== currentPage ||
          renderedDpi !== currentDpi);

      const renderPromise = needsRender
        ? loadRawPageImage().catch((err) => {
            console.warn("[PDFExtractor] renderPage error:", err);
          })
        : Promise.resolve();

      const dslPromise = sessionId
        ? activeProvider.executeDsl(sessionId, dslBodyText)
        : activeProvider.compileDsl(dslBodyText);

      const [_, data] = await Promise.all([renderPromise, dslPromise]);

      dslCompileResponseJson = data;

      if (data.pdf_width && data.pdf_height) {
        pdfWidth = data.pdf_width;
        pdfHeight = data.pdf_height;
      }

      if (!data.success && (data.error || data.errmsg)) {
        const msg = data.errmsg || data.error;
        errorMsg = `DSL Compilation/Execution Error: ${msg}`;
        executeResponseJson = {
          errmsg: msg,
          trace: data.trace || [msg],
        };
      } else if (data.results) {
        executeResponseJson = data.results;
        sublayerVisibility = buildSublayersVisibility(
          data.results,
          sublayerVisibility,
        );

        const sync = syncLayersFromResponse(
          data.results,
          availableLayers,
          activeLayers,
        );
        availableLayers = sync.availableLayers;
        activeLayers = sync.activeLayers;

        executionSummary = `DSL Compiled & Executed — ${sync.totalNodes} extracted nodes across ${availableLayers.length} layers (${availableLayers.join(", ")})`;
      } else {
        executionSummary =
          "DSL Compiled successfully (AST & Query Plan updated)";
      }
    } catch (err) {
      let errObj = err;
      if (typeof err === "string") {
        try {
          errObj = JSON.parse(err);
        } catch (_) {
          errObj = { errmsg: err, trace: [err] };
        }
      }
      const msg = errObj?.errmsg || errObj?.message || String(err);
      const trace = Array.isArray(errObj?.trace)
        ? errObj.trace
        : [msg];

      errorMsg = `DSL Query Error: ${msg}`;
      executeResponseJson = {
        errmsg: msg,
        trace,
      };
      dslCompileResponseJson = {
        success: false,
        error: msg,
        errmsg: msg,
        trace,
        results: executeResponseJson,
      };
    } finally {
      isExecuting = false;
    }
  }

  onMount(() => {
    if (typeof localStorage !== "undefined") {
      const savedDsl = localStorage.getItem(STORAGE_KEY_DSL);
      if (savedDsl) dslBodyText = savedDsl;

      const savedEngine = localStorage.getItem(STORAGE_KEY_USE_WASM);
      if (savedEngine === "true") setEngineWasm(true);
    }
    isInitialized = true;

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", handleKeyDown);
      }
    };
  });

  let saveDslTimeout = null;
  $effect(() => {
    if (isInitialized && dslBodyText && typeof localStorage !== "undefined") {
      clearTimeout(saveDslTimeout);
      saveDslTimeout = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY_DSL, dslBodyText);
        } catch (e) {}
      }, 500);
    }
  });

</script>

<div
  class="pdf-extractor bg-slate-900 border border-slate-700 text-slate-100 rounded-lg shadow-2xl overflow-hidden flex flex-col flex-1 h-full min-h-0"
>
  <!-- Top Parameters Controls Bar -->
  <PDFExtractorToolbar
    bind:currentPage
    {pageCount}
    bind:currentDpi
    bind:strokeWidth
    bind:useWasm
    {wasmInitializing}
    bind:errorMsg
    onwasmtoggle={setEngineWasm}
  />

  <!-- 2-COLUMN MAIN RESIZABLE LAYOUT -->
  <div class="split-pane flex-1 flex w-full min-h-0 overflow-hidden">
    <ResizableSplitPane
      direction="horizontal"
      initialLeftPercent={42}
      minLeftPx={300}
      minRightPx={350}
      storageKey="pdf_extractor_left_width"
    >
      <!-- LEFT COLUMN: Top (DSL Editor) + Bottom (AST/Plan Output) Split -->
      {#snippet left()}
        <div class="bg-slate-950 flex flex-col h-full w-full overflow-hidden">
          <ResizableSplitPane
            direction="vertical"
            initialLeftPercent={50}
            minLeftPx={150}
            minRightPx={150}
            storageKey="pdf_extractor_left_vertical_split"
          >
            {#snippet left()}
              <PDFEditorPane
                bind:dslBodyText
                {saveNotification}
                loading={isExecuting || wasmInitializing}
                onsave={saveCurrentConfig}
                onexecute={executeDslQuery}
              />
            {/snippet}

            {#snippet right()}
              <PDFPlanInspector
                bind:bottomLeftTab
                {dslCompileResponseJson}
                {executeResponseJson}
              />
            {/snippet}
          </ResizableSplitPane>
        </div>
      {/snippet}

      <!-- RIGHT COLUMN: PDF Canvas Image + Layers Sidebar -->
      {#snippet right()}
        <div class="flex flex-row h-full w-full overflow-hidden relative">
          <PDFCanvasViewport
            {imageUrl}
            {imageWidth}
            {imageHeight}
            {pdfWidth}
            {pdfHeight}
            bind:zoomLevel
            {strokeWidth}
            {globalStrokeColor}
            {loading}
            {availableLayers}
            {activeLayers}
            {sublayerVisibility}
            {executeResponseJson}
            {renderOrderLayers}
            bind:showRightLayersPanel
            bind:hoveredItem
            bind:layoutWindowWidth
            bind:rightPaneElement
          />

          <PDFLayersSidebar
            bind:availableLayers
            bind:activeLayers
            bind:sublayerVisibility
            {executeResponseJson}
            {dslCompileResponseJson}
            bind:showRightLayersPanel
            bind:hoveredItem
          />
        </div>
      {/snippet}
    </ResizableSplitPane>
  </div>

  <!-- Status & Hover Info Footer -->
  <PDFNodeInspectorBar
    {hoveredItem}
    {executionSummary}
    {executeResponseJson}
    onviewoutput={() => (showOutputModal = true)}
  />
</div>

<!-- OUTPUT JSON MODAL DIALOG -->
<PDFOutputModal
  bind:show={showOutputModal}
  {executeResponseJson}
/>
