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
    let error = $state(null);

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
            // Constrain between 100px and 600px
            sidebarWidth = Math.max(
                100,
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
            // Constrain between 10% and 90%
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
        // Verify it's a vertically scrollable element
        if (target.scrollHeight > target.clientHeight) {
            // Check if we are near the bottom (within 150px)
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
        tables = await sqlProvider.getTables();

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
            resultsContainer.addEventListener("scroll", handleScroll, true); // use capture phase to catch inner scroll
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

            // Find the index of the semicolon before the cursor
            const textBefore = fullText.substring(0, cursorOffset);
            const startIdx = textBefore.lastIndexOf(";");

            // Find the index of the semicolon after the cursor
            const textAfter = fullText.substring(cursorOffset);
            const endIdx = textAfter.indexOf(";");

            // Extract the substring
            // If no semicolon before, start at 0. If no semicolon after, go to end.
            const actualStart = startIdx === -1 ? 0 : startIdx + 1;
            const actualEnd =
                endIdx === -1 ? fullText.length : cursorOffset + endIdx;

            code = fullText.substring(actualStart, actualEnd).trim();
        }

        if (!code) return;

        isLoading = true;
        error = null;
        try {
            const result = await sqlProvider.execute(code);
            if (Array.isArray(result) && result.length > 0) {
                allQueryResult = result;
                currentIndex = Math.min(batchSize, allQueryResult.length);
                queryResult = allQueryResult.slice(0, currentIndex);
                columns = Object.keys(result[0]).map((key) => ({
                    id: key,
                    header: key,
                    resize: true,
                }));
            } else {
                allQueryResult = [];
                queryResult = [];
                // Optional: Provide feedback for non-row-returning queries (UPDATE/INSERT)
                error = "Query executed successfully (no rows returned).";
            }
        } catch (e) {
            error = e.message;
            allQueryResult = [];
            queryResult = [];
        } finally {
            isLoading = false;
        }
    }

    async function refreshTables() {
        tables = await sqlProvider.getTables();
    }

    async function inspectTable(name) {
        selectedTable = name;
        editor.setValue(`SELECT * FROM ${name} LIMIT 1000;`); // Adjusted to 1000 to show pagination
        runQuery();
    }
</script>

<div
    class="wrapper h-screen w-full bg-background text-foreground font-sans overflow-hidden"
    style="grid-template-columns: {sidebarWidth}px 4px 1fr;"
>
    <aside
        class="flex flex-col bg-card border-r border-border overflow-hidden"
    >
        <div
            class="p-4 border-b border-border flex justify-between items-center shrink-0"
        >
            <h2
                class="text-[11px] font-bold text-muted-foreground uppercase tracking-widest"
            >
                Tables
            </h2>
            <button
                onclick={refreshTables}
                class="text-muted-foreground hover:text-ui-focus text-xs">↻</button
            >
        </div>
        <nav class="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
            {#each tables as table}
                <button
                    onclick={() => inspectTable(table)}
                    class="w-full flex items-center px-3 py-1.5 text-sm rounded transition-colors
                    {selectedTable === table
                        ? 'bg-primary text-primary-foreground text-white'
                        : 'text-muted-foreground hover:bg-accent text-accent-foreground'}"
                >
                    <span class="mr-2 text-primary text-[10px]">⊞</span>
                    {table}
                </button>
            {/each}
        </nav>
    </aside>

    <div class="resizer-v" onmousedown={startSidebarResize}></div>

    <main class="flex flex-col min-w-0 overflow-hidden">
        <header
            class="h-12 border-b border-border bg-muted flex items-center px-4 gap-4 shrink-0"
        >
            <button
                onclick={runQuery}
                class="flex items-center gap-2 px-3 py-1 cursor-pointer bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded transition-all active:scale-95"
            >
                <span class="text-[10px]">▶</span> Run Query
            </button>
            <div class="h-4 w-px bg-ui-border"></div>
            <span
                class="text-[10px] font-mono text-muted-foreground uppercase tracking-tighter"
            >
                Ctrl + Enter to Execute
            </span>
            {#if isLoading}
                <div
                    class="ml-auto w-4 h-4 border-2 border-ring border-t-transparent rounded-full animate-spin"
                ></div>
            {/if}
        </header>

        <div
            class="flex-1 grid min-h-0"
            style="grid-template-rows: {editorHeight}% 4px 1fr;"
        >
            <div class="relative overflow-hidden">
                <div bind:this={editorContainer} class="absolute inset-0"></div>
            </div>

            <div class="resizer-h" onmousedown={startVerticalResize}></div>

            <div class="flex flex-col bg-background overflow-hidden">
                <div
                    class="px-4 py-1 bg-card border-b border-border flex justify-between items-center shrink-0"
                >
                    <span class="text-[10px] font-mono text-muted-foreground uppercase"
                        >Results</span
                    >
                    {#if error}
                        <span
                            class="text-[10px] font-mono text-destructive uppercase"
                            >{error}</span
                        >
                    {/if}
                </div>
                <div
                    bind:this={resultsContainer}
                    class="flex-1 w-full overflow-hidden"
                >
                    {#if queryResult.length > 0}
                        <WillowDark>
                            <Grid data={queryResult} {columns} />
                        </WillowDark>
                    {:else}
                        <div
                            class="h-full flex items-center justify-center text-muted-foreground/20 italic text-sm"
                        >
                            No data returned or query not yet run
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
