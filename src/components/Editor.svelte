<script>

  import { onMount, onDestroy } from "svelte";
  import * as monaco from "monaco-editor";

  import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
  import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

  let { 
      // 1. Make content bindable
      content = $bindable(), 
      lang = $bindable(),
      onUpdate = (e) => {} 
    } = $props();

  // let internalContent = $state(content);
  let container = $state();
  let editor; // init in createMonacoInstance
  let model; // init in createMonacoInstance

if (typeof window !== 'undefined') {
  self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new jsonWorker();
      return new editorWorker();
    }
  };
}

  onMount(() => {
    try {
        createMonacoInstance();
    } catch (err) {
      console.error("Failed to load file", err);
    }
  });

  onDestroy(() => {
    model?.dispose();
    editor?.dispose();
  });

  // 1. React to EXTERNAL changes (File loading finishes or parent updates content)
  $effect(() => {
    // If the editor exists and the content prop is different from what's inside the editor
    if (model && content !== undefined && content !== model.getValue()) {
      // pushEditOperations is better than setValue because it preserves the Undo stack
      model.pushEditOperations([], [{
        range: model.getFullModelRange(),
        text: content
      }], () => null);
    }
  });

  // 2. React to LANGUAGE changes
  $effect(() => {
    if (model && lang) {
      monaco.editor.setModelLanguage(model, lang);
    }
  });


  function createMonacoInstance() {
    // Use the derived currentContent for initial load
    model = monaco.editor.createModel(
      content,
      lang,
      monaco.Uri.parse(`inmemory://dummy`)
    );

    editor = monaco.editor.create(container, {
      model,
      theme: "vs-dark",
      // automaticLayout: true,
      
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onUpdate({target : {value : model.getValue()}}));
  }
</script>
<div bind:this={container} class="editor"></div>

<style>
  .editor {
    margin-top: 5px;
    height: 100%;
    width: 100%;

    overflow: hidden; 
    position: relative;
    min-height: 0;
  }
</style>