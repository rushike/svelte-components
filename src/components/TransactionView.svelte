<script>
  import { Grid, WillowDark } from "@svar-ui/svelte-grid";
  import {
    getAllDocumentTypes,
    getRecords,
    getTransactions,
    processRecordsToTransactions,
  } from "/myfinsheet-client/remail";

  import { extractDocument } from "/myfinsheet-client/remail/core";

  let documentTypes = $state([]);
  let records = $state(null);
  let transactions = $state(null);
  let selectedDoc = $state(null);
  let isLoading = $state(true);
  let isGridLoading = $state(false);
  let isActionRunning = $state(false);

  // Pagination state
  let currentRecordPage = $state(0);
  let currentTransactionPage = $state(0);
  const PAGE_SIZE = 500;

  // Tabs: 'document', 'records', 'transaction'
  let activeTab = $state("document");

  let recordColumns = [
    { id: "id", width: 60, resize: true },
    { id: "document_code", header: "Doc Code", width: 200, resize: true },
    { id: "document_party_code", header: "Party", width: 120, resize: true },
    { id: "status", header: "Status", width: 120, resize: true },
    { id: "create_ts", header: "Created At", resize: true },
    { id: "json", header: "JSON", resize: true },
  ];

  let transactionColumns = [
    { id: "id", width: 60, resize: true },
    { id: "date", header: "Date", width: 120, resize: true },
    { id: "from_account", header: "From Account", width: 150, resize: true },
    { id: "to_account", header: "To Account", width: 150, resize: true },
    { id: "description", header: "Description", width: 250, resize: true },
    { id: "amount", header: "Amount", width: 100, resize: true },
    { id: "closing_balance", header: "Closing Bal", width: 120, resize: true },
    { id: "transaction_reference", header: "Ref", width: 150, resize: true },
    { id: "transaction_method", header: "Method", width: 120, resize: true },
    { id: "status", header: "Status", width: 100, resize: true },
  ];

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
    await loadTabData();
  }

  async function loadTabData() {
    if (!selectedDoc) return;

    isGridLoading = true;
    try {
      if (activeTab === "records") {
        records = await getRecords({ documentTypeCode: selectedDoc.code });
        currentRecordPage = 0;
      } else if (activeTab === "transaction") {
        transactions = await getTransactions({
          documentTypeCode: selectedDoc.code,
        });
        currentTransactionPage = 0;
      }
    } finally {
      isGridLoading = false;
    }
  }

  function handleTabChange(tab) {
    activeTab = tab;
    loadTabData();
  }

  async function handleProcessRecords() {
    isActionRunning = true;
    try {
      await processRecordsToTransactions({
        documentTypeCode: selectedDoc?.code,
      });
      alert("Processed records to transactions successfully");
      activeTab = "transaction";
      await loadTabData();
    } catch (e) {
      alert("Processing failed: " + e.message);
    } finally {
      isActionRunning = false;
    }
  }

  async function handleProcessTransactions() {
    isActionRunning = true;
    try {
      // Empty implementation as requested
      console.log(
        "Process transactions button clicked, but implementation is empty",
      );
      alert("Transaction processing is currently empty.");
    } catch (e) {
      alert("Processing failed: " + e.message);
    } finally {
      isActionRunning = false;
    }
  }
</script>

<div
  class="flex h-screen w-full bg-background text-foreground font-sans overflow-hidden"
>
  <aside
    class="w-72 border-r border-border bg-card flex flex-col shadow-xl"
  >
    <div class="p-6 flex justify-between items-center">
      <h2 class="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
        Document Types
      </h2>
    </div>

    <nav class="flex-1 px-3 space-y-1 overflow-y-auto mt-2">
      {#each documentTypes as doc}
        <button
          onclick={() => onDocumentTypeChange(doc)}
          class="w-full flex items-center px-4 py-2 text-sm font-medium transition-all rounded
            {selectedDoc?.id === doc.id
            ? 'bg-primary text-primary-foreground text-white'
            : 'text-muted-foreground hover:bg-accent text-accent-foreground hover:text-foreground'}"
        >
          <span class="mr-3 flex items-center justify-center w-4">
            <span
              class="text-[10px] {selectedDoc?.id === doc.id
                ? 'text-ui-focus'
                : 'opacity-30'}"
            >
              {selectedDoc?.id === doc.id ? "●" : "○"}
            </span>
          </span>
          {doc.code}
        </button>
      {/each}
    </nav>

    <div class="p-4 bg-background/50 border-t border-border">
      <p class="text-[10px] font-mono leading-tight text-muted-foreground">
        <span class="text-primary">STATUS:</span>
        {isLoading ? "Syncing..." : "Connected"}
      </p>
    </div>
  </aside>

  <main class="flex-1 flex flex-col min-w-0">
    {#if selectedDoc}
      <header
        class="border-b border-border bg-card/50 backdrop-blur-md"
      >
        <div class="h-16 flex items-center justify-between px-8">
          <div class="flex items-center gap-4">
            <div
              class="px-2 py-1 rounded bg-muted text-[10px] font-mono text-muted-foreground border border-border"
            >
              DOC_TYPE
            </div>
            <h1 class="text-lg font-semibold tracking-tight text-white">
              {selectedDoc.code}
            </h1>
            {#if isGridLoading}
              <div
                class="w-4 h-4 border-2 border-ring border-t-transparent rounded-full animate-spin"
              ></div>
            {/if}
          </div>

          <div class="flex space-x-2">
            {#if activeTab === "records"}
              <button
                class="cursor-pointer px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-md shadow-lg shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-50"
                disabled={isActionRunning || isGridLoading}
                onclick={handleProcessRecords}
              >
                Process to Transactions
              </button>
            {:else if activeTab === "transaction"}
              <button
                class="cursor-pointer px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-md shadow-lg shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-50"
                disabled={isActionRunning || isGridLoading}
                onclick={handleProcessTransactions}
              >
                Process Transactions
              </button>
            {/if}
          </div>
        </div>

        <div class="flex px-8 border-t border-border">
          <button
            onclick={() => handleTabChange("document")}
            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab ===
            'document'
              ? 'border-ring text-white'
              : 'border-transparent text-muted-foreground hover:text-foreground'}"
          >
            Document
          </button>
          <button
            onclick={() => handleTabChange("records")}
            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab ===
            'records'
              ? 'border-ring text-white'
              : 'border-transparent text-muted-foreground hover:text-foreground'}"
          >
            Records
          </button>
          <button
            onclick={() => handleTabChange("transaction")}
            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab ===
            'transaction'
              ? 'border-ring text-white'
              : 'border-transparent text-muted-foreground hover:text-foreground'}"
          >
            Transaction
          </button>
        </div>
      </header>

      <div class="flex-1 p-6 flex flex-col min-h-0">
        <div
          class="flex-1 rounded-xl border border-border bg-background shadow-inner flex flex-col overflow-hidden"
        >
          <div
            class="flex items-center justify-between px-4 py-2 bg-card border-b border-border"
          >
            <span class="text-[10px] font-mono text-muted-foreground uppercase">
              {activeTab} Viewer
            </span>
            <span class="text-[10px] font-mono text-muted-foreground/50">
              tabular/data
            </span>
          </div>

          <div class="flex-1 w-full overflow-hidden relative">
            {#if activeTab === "document"}
              <div
                class="flex flex-col items-center justify-center h-full w-full text-muted-foreground/30"
              >
                <div class="text-5xl mb-4">⬚</div>
                <p class="text-sm font-medium">
                  Document View is currently empty
                </p>
              </div>
            {:else if activeTab === "records"}
              {#if records}
                <div class="flex-1 overflow-hidden h-[calc(100%-40px)]">
                  <WillowDark>
                    <Grid
                      data={records.slice(
                        currentRecordPage * PAGE_SIZE,
                        (currentRecordPage + 1) * PAGE_SIZE,
                      )}
                      columns={recordColumns}
                    />
                  </WillowDark>
                </div>
                {#if records.length > PAGE_SIZE}
                  <div
                    class="h-10 border-t border-border flex items-center justify-between px-4 text-xs"
                  >
                    <span
                      >Showing {currentRecordPage * PAGE_SIZE + 1} to {Math.min(
                        (currentRecordPage + 1) * PAGE_SIZE,
                        records.length,
                      )} of {records.length}</span
                    >
                    <div class="flex gap-2">
                      <button
                        class="px-2 py-1 rounded bg-card border border-border disabled:opacity-50"
                        disabled={currentRecordPage === 0}
                        onclick={() => currentRecordPage--}>Prev</button
                      >
                      <button
                        class="px-2 py-1 rounded bg-card border border-border disabled:opacity-50"
                        disabled={(currentRecordPage + 1) * PAGE_SIZE >=
                          records.length}
                        onclick={() => currentRecordPage++}>Next</button
                      >
                    </div>
                  </div>
                {/if}
              {/if}
            {:else if activeTab === "transaction"}
              {#if transactions}
                <div class="flex-1 overflow-hidden h-[calc(100%-40px)]">
                  <WillowDark>
                    <Grid
                      data={transactions.slice(
                        currentTransactionPage * PAGE_SIZE,
                        (currentTransactionPage + 1) * PAGE_SIZE,
                      )}
                      columns={transactionColumns}
                    />
                  </WillowDark>
                </div>
                {#if transactions.length > PAGE_SIZE}
                  <div
                    class="h-10 border-t border-border flex items-center justify-between px-4 text-xs"
                  >
                    <span
                      >Showing {currentTransactionPage * PAGE_SIZE + 1} to {Math.min(
                        (currentTransactionPage + 1) * PAGE_SIZE,
                        transactions.length,
                      )} of {transactions.length}</span
                    >
                    <div class="flex gap-2">
                      <button
                        class="px-2 py-1 rounded bg-card border border-border disabled:opacity-50"
                        disabled={currentTransactionPage === 0}
                        onclick={() => currentTransactionPage--}>Prev</button
                      >
                      <button
                        class="px-2 py-1 rounded bg-card border border-border disabled:opacity-50"
                        disabled={(currentTransactionPage + 1) * PAGE_SIZE >=
                          transactions.length}
                        onclick={() => currentTransactionPage++}>Next</button
                      >
                    </div>
                  </div>
                {/if}
              {/if}
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <div
        class="flex flex-col items-center justify-center h-full w-full text-muted-foreground/30"
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
</style>
