<script lang="js">
  import { onMount, onDestroy } from "svelte";
  import * as monaco from "monaco-editor";
  import MyFS from "@rushike/myfs";
  import Editor from "./Editor.svelte";

  const myfs = new MyFS();

  /* -------- PROPS (Svelte 5) -------- */
  let { 
    filePath, 
    // 1. Make content bindable
    onUpdate = (e) => {} 
  } = $props();

  // 2. Create a local "fallback" state if content isn't provided/bound
  let content = $state("");
  
  // 3. Create a helper to get/set the "active" content
  // This logic ensures we use the prop if it exists, otherwise use local state

  let fileExists = $state(false);

  onMount(() => {
    try {
      myfs.readFile(filePath).then(async (file) => {
        const text = typeof file.text === 'function' ? await file.text() : new TextDecoder().decode(file);
        
        // Update the source of truth
       content = text;

        fileExists = true;
      });
    } catch (err) {
      console.error("Failed to load file", err);
    }
  });

  function detectLanguage(file) {
    if (!file) return "plaintext";
    const ext = file.split('.').pop();
    const map = { js: "javascript", ts: "typescript", json: "json", py: "python", sql: "sql" };
    return map[ext] || "plaintext";
  }

  async function saveFile(newContent) {
    await myfs.writeFile(filePath, newContent);
    onUpdate({ target: { value: newContent } });
  }

  // Handle filePath changes
  $effect(() => {
    if (!filePath) return;
    myfs.readFile(filePath).then(async (file) => {
      content = typeof file.text === 'function' ? await file.text() : new TextDecoder().decode(file);
    });
  });

</script>

<!-- <div bind:this={container} class={isComponent ? "component-editor" : "standalone-editor"}></div> -->
<div class="standalone-editor">
  <Editor bind:content = {content} lang = {detectLanguage(filePath)} onUpdate = {e=> saveFile(e.target.value)}></Editor>
</div> 
<style>
  .standalone-editor {
    margin-top: 5px;
    height: 100vh;
    width: 100%;
  }
</style>
