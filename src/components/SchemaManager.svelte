<script>
    import { onMount, onDestroy } from "svelte";
    import * as monaco from "monaco-editor";
    import { sqlProvider } from "@rushike/sqlite3-client";
    import { Grid, WillowDark } from "@svar-ui/svelte-grid";

    // --- Svelte 5 State ---
    let tables = $state([]);
    let selectedTable = $state(null);
    let allQueryResult = []; // Store all results here
    let queryResult = $state([]); // Store visible results here
    let columns = $state([]);
    let isLoading = $state(false);
    
    // Feedback & Error State
    let error = $state(null); // { message: string, sql?: string, stack?: string, type?: string } | null
    let successInfo = $state(null); // { message: string, changes?: number, durationMs?: number, count?: number } | null
    let sidebarError = $state(null);
    let copiedNotification = $state(false);

    // Pagination state
    let batchSize = 100;
    let currentIndex = 0;

    // Layout State
    let sidebarWidth = $state(240);
    let editorHeight = $state(50); // percentage of the main area

    let editorContainer;
    let editor;
    let resultsContainer; // For listening to scroll events

    // --- Resize Logic ---
    function startSidebarResize(e) {
        const startX = e.clientX;
        const startWidth = sidebarWidth;

        const onMouseMove = (e) => {
            sidebarWidth = Math.max(
                120,
                Math.min(600, startWidth + (e.clientX - startX)),
            );
        };

        const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }

    function startVerticalResize(e) {
        const startY = e.clientY;
        const startHeight = editorHeight;
        const containerHeight =
            editorContainer.parentElement.parentElement.offsetHeight;

        const onMouseMove = (e) => {
            const deltaY = e.clientY - startY;
            const deltaPercent = (deltaY / containerHeight) * 100;
            editorHeight = Math.max(
                10,
                Math.min(90, startHeight + deltaPercent),
            );
        };

        const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }

    // Ensure Monaco stays sharp when layout changes
    $effect(() => {
        if (editor && (sidebarWidth || editorHeight)) {
            editor.layout();
        }
    });

    // --- Pagination Logic ---
    function loadMore() {
        if (!allQueryResult || currentIndex >= allQueryResult.length) return;

        currentIndex = Math.min(
            currentIndex + batchSize,
            allQueryResult.length,
        );
        queryResult = allQueryResult.slice(0, currentIndex);
    }

    function handleScroll(e) {
        const target = e.target;
        if (target.scrollHeight > target.clientHeight) {
            if (
                target.scrollHeight - target.scrollTop <=
                target.clientHeight + 150
            ) {
                loadMore();
            }
        }
    }

    // --- Database Logic ---
    onMount(async () => {
        await refreshTables();

        editor = monaco.editor.create(editorContainer, {
            value: "SELECT * FROM sqlite_master;",
            language: "sql",
            theme: "vs-dark",
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            backgroundColor: "#1e1e1e",
        });

        editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            runQuery,
        );

        if (resultsContainer) {
            resultsContainer.addEventListener("scroll", handleScroll, true);
        }
    });

    onDestroy(() => {
        if (editor) editor.dispose();
        if (resultsContainer) {
            resultsContainer.removeEventListener("scroll", handleScroll, true);
        }
    });

    async function runQuery() {
        let code = "";
        const selection = editor.getSelection();

        if (!selection.isEmpty()) {
            // 1. If user has selected text, run exactly that
            code = editor.getModel().getValueInRange(selection);
        } else {
            // 2. Find the "block" between semicolons based on cursor position
            const fullText = editor.getValue();
            const cursorOffset = editor
                .getModel()
                .getOffsetAt(editor.getPosition());

            const textBefore = fullText.substring(0, cursorOffset);
            const startIdx = textBefore.lastIndexOf(";");
            const textAfter = fullText.substring(cursorOffset);
            const endIdx = textAfter.indexOf(";");

            const actualStart = startIdx === -1 ? 0 : startIdx + 1;
            const actualEnd =
                endIdx === -1 ? fullText.length : cursorOffset + endIdx;

            code = fullText.substring(actualStart, actualEnd).trim();
            if (!code) {
                code = fullText.trim();
            }
        }

        if (!code) return;

        isLoading = true;
        error = null;
        successInfo = null;

        const startTime = performance.now();

        try {
            const result = await sqlProvider.execute(code);
            const durationMs = Math.round(performance.now() - startTime);

            if (Array.isArray(result)) {
                allQueryResult = result;
                currentIndex = Math.min(batchSize, allQueryResult.length);
                queryResult = allQueryResult.slice(0, currentIndex);
                if (result.length > 0) {
                    columns = Object.keys(result[0]).map((key) => ({
                        id: key,
                        header: key,
                        resize: true,
                    }));
                    successInfo = {
                        message: `Fetched ${result.length} row${result.length === 1 ? '' : 's'}`,
                        durationMs,
                        rowCount: result.length,
                    };
                } else {
                    columns = [];
                    successInfo = {
                        message: "Query returned 0 rows",
                        durationMs,
                        rowCount: 0,
                    };
                }
            } else {
                allQueryResult = [];
                queryResult = [];
                columns = [];
                const changes = result?.changes ?? 0;
                const statementsCount = result?.statementsCount ?? 1;
                successInfo = {
                    message: "Statement executed successfully",
                    changes,
                    statementsCount,
                    durationMs,
                };

                // If schema might have changed, refresh table list automatically
                const lowerCode = code.toLowerCase();
                if (
                    lowerCode.includes("create ") ||
                    lowerCode.includes("drop ") ||
                    lowerCode.includes("alter ")
                ) {
                    refreshTables();
                }
            }
        } catch (e) {
            const durationMs = Math.round(performance.now() - startTime);
            allQueryResult = [];
            queryResult = [];
            columns = [];
            error = {
                message: e?.message || String(e),
                sql: e?.sql || code,
                stack: e?.workerStack || e?.stack || null,
                durationMs,
            };
        } finally {
            isLoading = false;
        }
    }

    async function refreshTables() {
        sidebarError = null;
        try {
            tables = await sqlProvider.getTables();
        } catch (e) {
            sidebarError = e?.message || "Failed to load tables";
        }
    }

    async function inspectTable(name) {
        selectedTable = name;
        editor.setValue(`SELECT * FROM ${name} LIMIT 1000;`);
        runQuery();
    }

    function copyErrorText() {
        if (!error) return;
        const text = `Error: ${error.message}\nSQL: ${error.sql || ''}\n${error.stack || ''}`;
        navigator.clipboard.writeText(text);
        copiedNotification = true;
        setTimeout(() => {
            copiedNotification = false;
        }, 2000);
    }
</script>

<div
    class="wrapper h-screen w-full bg-background text-foreground font-sans overflow-hidden"
    style="grid-template-columns: {sidebarWidth}px 4px 1fr;"
>
    <!-- Left Sidebar: Tables -->
    <aside
        class="flex flex-col bg-card border-r border-border overflow-hidden"
    >
        <div
            class="p-3 border-b border-border flex justify-between items-center shrink-0 bg-muted/30"
        >
            <div class="flex items-center gap-1.5">
                <span class="text-xs text-primary">🗄</span>
                <h2
                    class="text-[11px] font-bold text-muted-foreground uppercase tracking-widest"
                >
                    Tables ({tables.length})
                </h2>
            </div>
            <button
                onclick={refreshTables}
                title="Refresh tables"
                class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted text-xs transition-colors"
            >
                ↻
            </button>
        </div>

        {#if sidebarError}
            <div class="m-2 p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive text-[11px]">
                <p class="font-semibold">Failed to load:</p>
                <p class="font-mono text-[10px] break-all">{sidebarError}</p>
                <button
                    onclick={refreshTables}
                    class="mt-1 px-2 py-0.5 bg-destructive/20 hover:bg-destructive/30 rounded text-[10px]"
                >
                    Retry
                </button>
            </div>
        {/if}

        <nav class="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
            {#each tables as table}
                <button
                    onclick={() => inspectTable(table)}
                    class="w-full flex items-center px-2.5 py-1.5 text-xs rounded transition-colors text-left truncate
                    {selectedTable === table
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'}"
                >
                    <span class="mr-2 text-primary/70 text-[10px]">⊞</span>
                    <span class="truncate">{table}</span>
                </button>
            {:else}
                {#if !sidebarError}
                    <div class="p-3 text-center text-muted-foreground/60 text-xs italic">
                        No tables found in database
                    </div>
                {/if}
            {/each}
        </nav>
    </aside>

    <!-- Sidebar Resizer -->
    <div class="resizer-v" onmousedown={startSidebarResize}></div>

    <!-- Main Section -->
    <main class="flex flex-col min-w-0 overflow-hidden">
        <!-- Top Action Bar -->
        <header
            class="h-12 border-b border-border bg-card/60 backdrop-blur flex items-center px-4 gap-3 shrink-0"
        >
            <button
                onclick={runQuery}
                disabled={isLoading}
                class="flex items-center gap-2 px-3.5 py-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
                {#if isLoading}
                    <div class="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                    <span>Running...</span>
                {:else}
                    <span class="text-[10px]">▶</span>
                    <span>Run Query</span>
                {/if}
            </button>

            <div class="h-4 w-px bg-border"></div>

            <span
                class="text-[11px] font-mono text-muted-foreground tracking-tight flex items-center gap-1"
            >
                <kbd class="px-1.5 py-0.5 text-[10px] bg-muted border border-border rounded font-mono">Ctrl</kbd>
                +
                <kbd class="px-1.5 py-0.5 text-[10px] bg-muted border border-border rounded font-mono">Enter</kbd>
                to Execute
            </span>

            {#if error}
                <div class="ml-auto flex items-center gap-2 px-2.5 py-1 rounded bg-destructive/15 border border-destructive/30 text-destructive text-xs font-mono">
                    <span class="w-2 h-2 rounded-full bg-destructive animate-pulse"></span>
                    <span class="truncate max-w-[300px]">Error: {error.message}</span>
                </div>
            {:else if successInfo}
                <div class="ml-auto flex items-center gap-2 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
                    <span>✓</span>
                    <span>{successInfo.message}</span>
                    <span class="text-muted-foreground">({successInfo.durationMs}ms)</span>
                </div>
            {/if}
        </header>

        <!-- Vertical Grid: Editor (top) + Results (bottom) -->
        <div
            class="flex-1 grid min-h-0"
            style="grid-template-rows: {editorHeight}% 4px 1fr;"
        >
            <!-- SQL Monaco Editor -->
            <div class="relative overflow-hidden bg-[#1e1e1e]">
                <div bind:this={editorContainer} class="absolute inset-0"></div>
            </div>

            <!-- Horizontal Resizer -->
            <div class="resizer-h" onmousedown={startVerticalResize}></div>

            <!-- Results & Error View Container -->
            <div class="flex flex-col bg-background overflow-hidden">
                <!-- Results Bar Header -->
                <div
                    class="px-4 py-1.5 bg-card border-b border-border flex justify-between items-center shrink-0"
                >
                    <div class="flex items-center gap-3">
                        <span class="text-[11px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
                            Results
                        </span>
                        {#if queryResult.length > 0}
                            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                Showing 1–{queryResult.length} of {allQueryResult.length} rows
                            </span>
                        {/if}
                    </div>

                    {#if error}
                        <button
                            onclick={copyErrorText}
                            class="text-[10px] font-mono px-2 py-0.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
                        >
                            {copiedNotification ? "✓ Copied Error" : "Copy Error Details"}
                        </button>
                    {/if}
                </div>

                <!-- Main Content Pane -->
                <div
                    bind:this={resultsContainer}
                    class="flex-1 w-full overflow-auto"
                >
                    <!-- 1. ERROR STATE: Prominently displayed instead of data -->
                    {#if error}
                        <div class="p-6 max-w-4xl mx-auto space-y-4 animate-in fade-in duration-200">
                            <div class="p-4 rounded-lg bg-destructive/10 border border-destructive/30 space-y-3">
                                <div class="flex items-start gap-3">
                                    <div class="p-2 rounded bg-destructive/20 text-destructive shrink-0 mt-0.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="12" cy="12" r="10"/>
                                            <line x1="12" y1="8" x2="12" y2="12"/>
                                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                                        </svg>
                                    </div>
                                    <div class="flex-1 min-w-0 space-y-1">
                                        <h3 class="text-sm font-semibold text-destructive tracking-tight">
                                            SQL Execution Failed
                                        </h3>
                                        <p class="text-xs font-mono text-destructive-foreground/90 whitespace-pre-wrap break-words leading-relaxed bg-destructive/15 p-3 rounded border border-destructive/20">
                                            {error.message}
                                        </p>
                                    </div>
                                </div>

                                <!-- Failed SQL Query Snippet -->
                                {#if error.sql}
                                    <div class="space-y-1 pt-2 border-t border-destructive/20">
                                        <div class="flex justify-between items-center">
                                            <span class="text-[10px] font-mono uppercase text-muted-foreground font-medium">
                                                Executed Query
                                            </span>
                                        </div>
                                        <pre class="p-3 rounded bg-black/40 border border-border text-[11px] font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap max-h-48">{error.sql}</pre>
                                    </div>
                                {/if}

                                <!-- Optional Stack Trace -->
                                {#if error.stack}
                                    <details class="pt-1 text-[11px] font-mono text-muted-foreground cursor-pointer">
                                        <summary class="hover:text-foreground">View Stack Trace</summary>
                                        <pre class="mt-2 p-2 rounded bg-black/50 border border-border text-[10px] text-zinc-400 overflow-x-auto whitespace-pre max-h-36">{error.stack}</pre>
                                    </details>
                                {/if}
                            </div>
                        </div>

                    <!-- 2. SUCCESS (NO ROWS / DDL / MUTATIONS) STATE -->
                    {:else if successInfo && queryResult.length === 0}
                        <div class="h-full flex items-center justify-center p-6 animate-in fade-in duration-200">
                            <div class="p-6 rounded-xl bg-card border border-border shadow-sm max-w-md w-full text-center space-y-4">
                                <div class="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl">
                                    ✓
                                </div>
                                <div class="space-y-1">
                                    <h3 class="text-sm font-medium text-foreground">
                                        {successInfo.message}
                                    </h3>
                                    <p class="text-xs text-muted-foreground">
                                        The statement completed without returning row data.
                                    </p>
                                </div>
                                <div class="flex justify-center gap-3 pt-2 text-xs font-mono text-muted-foreground">
                                    {#if successInfo.changes !== undefined}
                                        <span class="px-2.5 py-1 rounded bg-muted border border-border">
                                            Changes: <strong class="text-foreground">{successInfo.changes}</strong>
                                        </span>
                                    {/if}
                                    {#if successInfo.statementsCount !== undefined && successInfo.statementsCount > 1}
                                        <span class="px-2.5 py-1 rounded bg-muted border border-border">
                                            Statements: <strong class="text-foreground">{successInfo.statementsCount}</strong>
                                        </span>
                                    {/if}
                                    <span class="px-2.5 py-1 rounded bg-muted border border-border">
                                        Time: <strong class="text-foreground">{successInfo.durationMs}ms</strong>
                                    </span>
                                </div>
                            </div>
                        </div>

                    <!-- 3. DATA GRID STATE -->
                    {:else if queryResult.length > 0}
                        <WillowDark>
                            <Grid data={queryResult} {columns} />
                        </WillowDark>

                    <!-- 4. INITIAL EMPTY STATE -->
                    {:else}
                        <div
                            class="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 text-muted-foreground"
                        >
                            <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg text-muted-foreground/60">
                                ⌨
                            </div>
                            <div class="space-y-1">
                                <p class="text-xs font-medium text-foreground/80">
                                    No query executed yet
                                </p>
                                <p class="text-xs text-muted-foreground/60 max-w-sm">
                                    Select a table from the sidebar or type a SQL statement in the editor and press <kbd class="px-1 py-0.5 text-[10px] bg-muted border border-border rounded font-mono text-foreground">Ctrl+Enter</kbd> to run.
                                </p>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </main>
</div>

<style>
    .wrapper {
        display: grid;
    }

    /* Vertical Resizer */
    .resizer-v {
        cursor: col-resize;
        background: transparent;
        transition: background 0.2s;
        z-index: 10;
    }
    .resizer-v:hover {
        background: rgba(59, 130, 246, 0.5); /* Blue tint on hover */
    }

    /* Horizontal Resizer */
    .resizer-h {
        cursor: row-resize;
        background: transparent;
        transition: background 0.2s;
        z-index: 10;
    }
    .resizer-h:hover {
        background: rgba(59, 130, 246, 0.5);
    }

    :global(.svar_grid) {
        height: 100% !important;
        border: none !important;
    }
</style>
