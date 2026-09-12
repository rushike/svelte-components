<script>
  import { Grid, WillowDark } from "@svar-ui/svelte-grid";
  import {
    fetchDocuments,
    getAllDocumentTypes,
    getDocuments,
    extractDocument,
    extractDocuments,
    getDocumentsByStatus,
  } from "/myfinsheet-client/remail";

  // Svelte 5 State
  let documentTypes = $state([]);
  let documents = $state(null);
  let selectedDoc = $state(null);
  let docLoading = $state({});
  let isLoading = $state(true);
  let isGridLoading = $state(false);
  let isActionRunning = $state(false);
  let selectedAction = $state("fetch");
  let sidebarAction = $state("fetch");

  let documentColumns = [
    { id: "id", width: 40, resize: true },
    { id: "code", header: "Code", width: 200, resize: true },
    { id: "status", header: "Status", width: 120, resize: true },
    { id: "document_type_code", header: "Type Code", width: 180, resize: true },
    { id: "party_code", header: "Party", resize: true },
    { id: "document_date", header: "Date", resize: true },
    { id: "uri", header: "URI", width: 400, resize: true },
    {
      id: "action",
      header: "Action",
      width: 100,
      template: () => "Extract ▶",
    },
  ];

  async function handleExtractLocal(id) {
    console.log("Extracting document", id);
    try {
      await extractDocument({ documentId: id });
      if (selectedDoc) {
        await onDocumentTypeChange(selectedDoc);
      }
    } catch (e) {
      console.error("Extraction failed", e);
      alert("Extraction failed: " + e.message);
    }
  }

  function handleGridClick(e) {
    const cell = e.target.closest('[data-col-id="action"]');
    if (!cell) return;
    const rowId = cell.getAttribute("data-row-id");
    if (rowId) {
      handleExtractLocal(rowId);
    }
  }

  // Initial Data Fetch
  $effect(() => {
    getAllDocumentTypes().then((result) => {
      documentTypes = result;
      if (result.length > 0) {
        onDocumentTypeChange(result[0]);
      }
      isLoading = false;
    });
  });

  async function onDocumentTypeChange(doc) {
    selectedDoc = doc;
    isGridLoading = true;
    try {
      const data = await getDocuments({ documentTypeCode: doc.code });
      documents = data;
    } finally {
      isGridLoading = false;
    }
  }

  async function handleAction() {
    if (!selectedDoc) return;
    isActionRunning = true;
    isGridLoading = true;
    try {
      if (selectedAction === "fetch") {
        await fetchDocuments({ documentTypeCode: selectedDoc.code });
        alert(`Fetched documents for ${selectedDoc.code}`);
      } else if (selectedAction === "extract") {
        await extractDocuments({ documentTypeCode: selectedDoc.code });
        alert(`Extracted documents for ${selectedDoc.code}`);
      }
      const data = await getDocuments({ documentTypeCode: selectedDoc.code });
      documents = data;
    } catch (e) {
      alert("Action failed: " + e.message);
    } finally {
      isGridLoading = false;
      isActionRunning = false;
    }
  }

  async function handleExtractAll() {
    isActionRunning = true;
    isGridLoading = true;
    try {
      await extractDocuments();
      alert("Extracted all documents");
      if (selectedDoc) {
        const data = await getDocumentsByStatus({
          status: "'RECORD_PROCESSING', 'RECORD_EXTRACTION_FAILED','CREATED'",
        });
        documents = data;
      }
    } catch (e) {
      alert("Extraction failed: " + e.message);
    } finally {
      isGridLoading = false;
      isActionRunning = false;
    }
  }

  async function fetchAllDocuments() {
    documentTypes.forEach(async (doc) => {
      let documentTypeCode = doc.code;
      docLoading[documentTypeCode] = true;
      await fetchDocuments({ documentTypeCode });
      docLoading[documentTypeCode] = false;
    });
  }

  async function handleSidebarAction() {
    if (sidebarAction === "fetch") {
      await fetchAllDocuments();
    } else if (sidebarAction === "extract") {
      await handleExtractAll();
    }
  }
</script>

<div
  class="flex h-screen w-full bg-ui-bg text-ui-text font-sans overflow-hidden"
>
  <aside
    class="w-72 border-r border-ui-border bg-ui-surface flex flex-col shadow-xl"
  >
    <div class="p-6 flex justify-between items-center">
      <h2 class="text-[11px] font-bold text-ui-muted uppercase tracking-widest">
        Document Types
      </h2>
      <div class="flex items-center gap-1.5">
        <select
          bind:value={sidebarAction}
          disabled={isActionRunning}
          class="bg-ui-bg text-[10px] px-1.5 py-1 rounded border border-ui-border focus:outline-none focus:border-ui-focus text-ui-text cursor-pointer"
        >
          <option value="fetch">Fetch ALL</option>
          <option value="extract">Extract ALL</option>
        </select>
        <button
          class="text-[10px] cursor-pointer px-2 py-1 font-medium bg-accent hover:bg-accent-hover text-white rounded shadow-lg shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-50"
          onclick={handleSidebarAction}
          disabled={isActionRunning}
        >
          Run
        </button>
      </div>
    </div>

    <nav class="flex-1 px-3 space-y-1 overflow-y-auto">
      {#each documentTypes as doc}
        <button
          onclick={() => onDocumentTypeChange(doc)}
          class="w-full flex items-center px-4 py-2 text-sm font-medium transition-all rounded
            {selectedDoc?.id === doc.id
            ? 'bg-ui-active text-white'
            : 'text-ui-muted hover:bg-ui-hover hover:text-ui-text'}"
        >
          <!-- <span class="mr-3 text-[10px] {selectedDoc?.id === doc.id ? 'text-ui-focus' : 'opacity-30'}">
            {selectedDoc?.id === doc.id ? '●' : '○'}
          </span> -->
          <span class="mr-3 flex items-center justify-center w-4">
            {#if docLoading[doc.code]}
              <svg
                class="animate-spin h-3 w-3 text-current"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            {:else}
              <span
                class="text-[10px] {selectedDoc?.id === doc.id
                  ? 'text-ui-focus'
                  : 'opacity-30'}"
              >
                {selectedDoc?.id === doc.id ? "●" : "○"}
              </span>
            {/if}
          </span>
          {doc.code}
        </button>
      {/each}
    </nav>

    <div class="p-4 bg-ui-bg/50 border-t border-ui-border">
      <p class="text-[10px] font-mono leading-tight text-ui-muted">
        <span class="text-ui-log-key">STATUS:</span>
        {isLoading ? "Syncing..." : "Connected"}
      </p>
    </div>
  </aside>

  <main class="flex-1 flex flex-col min-w-0">
    {#if selectedDoc}
      <header
        class="h-16 border-b border-ui-border bg-ui-surface/50 flex items-center justify-between px-8 backdrop-blur-md"
      >
        <div class="flex items-center gap-4">
          <div
            class="px-2 py-1 rounded bg-ui-header text-[10px] font-mono text-ui-muted border border-ui-border"
          >
            DOC_TYPE
          </div>
          <h1 class="text-lg font-semibold tracking-tight text-white">
            {selectedDoc.code}
          </h1>
          {#if isGridLoading}
            <div
              class="w-4 h-4 border-2 border-ui-focus border-t-transparent rounded-full animate-spin"
            ></div>
          {/if}
        </div>

        <div class="flex items-center gap-2">
          <select
            bind:value={selectedAction}
            disabled={isActionRunning || isGridLoading}
            class="bg-ui-bg text-sm px-3 py-2 rounded border border-ui-border focus:outline-none focus:border-ui-focus text-ui-text"
          >
            <option value="fetch">Fetch Documents</option>
            <option value="extract">Extract All</option>
          </select>
          <button
            class="cursor-pointer px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-md shadow-lg shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-50"
            disabled={isActionRunning || isGridLoading}
            onclick={handleAction}
          >
            Execute
          </button>
        </div>
      </header>

      <div class="flex-1 p-6 flex flex-col min-h-0">
        <div
          class="flex-1 rounded-xl border border-ui-border bg-ui-bg shadow-inner flex flex-col overflow-hidden"
        >
          <div
            class="flex items-center justify-between px-4 py-2 bg-ui-surface border-b border-ui-border"
          >
            <span class="text-[10px] font-mono text-ui-muted uppercase"
              >Metadata Viewer</span
            >
            <span class="text-[10px] font-mono text-ui-muted/50"
              >application/json</span
            >
          </div>

          <div
            class="flex-1 w-full overflow-hidden"
            onclick={handleGridClick}
            onkeydown={(e) => e.key === "Enter" && handleGridClick(e)}
            role="button"
            tabindex="0"
          >
            {#if documents}
              <WillowDark>
                <Grid data={documents} columns={documentColumns} />
              </WillowDark>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <div
        class="flex flex-col items-center justify-center h-full w-full text-ui-muted/30"
      >
        <div class="text-5xl mb-4">⬚</div>
        <p class="text-sm font-medium">
          Select a configuration from the sidebar
        </p>
      </div>
    {/if}
  </main>
</div>

<style>
  /* Ensure the Grid component respects the container height */
  :global(.svar_grid) {
    height: 100% !important;
    border: none !important;
  }

  /* Style the action column to look clickable */
  :global([data-col-id="action"]) {
    cursor: pointer !important;
    color: #60a5fa !important;
    font-weight: 600;
    text-align: center;
    transition: all 0.2s;
  }

  :global([data-col-id="action"]:hover) {
    color: #93c5fd !important;
    background-color: rgba(59, 130, 246, 0.1) !important;
  }
</style>
