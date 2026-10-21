<script>
  import { onMount, onDestroy } from "svelte";
  import * as monaco from "monaco-editor";

  import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
  import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

  let {
    content = "",
    readOnly = true,
  } = $props();

  let container = $state(null);
  let editor = $state(null);
  let model = $state(null);

  if (typeof window !== "undefined" && !self.MonacoEnvironment) {
    self.MonacoEnvironment = {
      getWorker(_, label) {
        if (label === "json") return new jsonWorker();
        return new editorWorker();
      },
    };
  }

  function initEditor() {
    if (!container) return;

    const m = monaco.editor.createModel(
      content || "",
      "json",
      monaco.Uri.parse(`inmemory://json-viewer-${Math.random().toString(36).slice(2)}`)
    );

    const ed = monaco.editor.create(container, {
      model: m,
      theme: "vs-dark",
      readOnly,
      domReadOnly: readOnly,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      lineNumbers: "on",
      folding: true,
      wordWrap: "on",
      tabSize: 2,
      renderLineHighlight: "all",
      contextmenu: true,
      selectOnLineNumbers: true,
    });

    model = m;
    editor = ed;
  }

  $effect(() => {
    // Unconditionally access content to track it as a reactive dependency in Svelte 5
    const text = content ?? "";
    if (model) {
      if (model.getValue() !== text) {
        model.setValue(text);
        editor?.setScrollTop(0);
        editor?.setScrollLeft(0);
      }
    }
  });

  $effect(() => {
    const isReadOnly = readOnly;
    if (editor) {
      editor.updateOptions({ readOnly: isReadOnly, domReadOnly: isReadOnly });
    }
  });

  onMount(() => {
    initEditor();
  });

  onDestroy(() => {
    model?.dispose();
    editor?.dispose();
  });
</script>

<div bind:this={container} class="monaco-json-viewer h-full w-full"></div>

<style>
  .monaco-json-viewer {
    height: 100%;
    width: 100%;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }
</style>
