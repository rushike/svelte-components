
<script>
  import { Filemanager, Material, getMenuOptions } from "@svar-ui/svelte-filemanager";
  import MyFS from "@rushike/myfs";
  
  const myfs = new MyFS();

  function customMenuOptions(type, item) {
    const options = getMenuOptions(type, item) || [];
    if (type === "folder") {
      if (!options.some(o => o.id === "download")) {
        options.push({ id: "download", icon: "wxi-download", text: "Download" });
      }
    }
    return options;
  }

  function convertToSvarData(data) {
    const flatList = [];

    // Add a 'pId' parameter to track the parent's path
    function flatten(node, pId = "0") {
        if (node.path && node.path !== "/") {
            flatList.push({
                id: node.path,
                parent: pId, // Crucial for SVAR to map the tree
                value: node.name || "/",
                type: node.type === "directory" ? "folder" : "file",
                date: new Date(), 
                size: node.size || 0 
            });
        }        
        
        if (node.children && Array.isArray(node.children)) {
            // Pass the current node's path as the next level's parent ID
            node.children.forEach(child => flatten(child, node.path));
        }
    }

    flatten(data);
    return flatList;
  
  }



  let loaded = $state(false);
  let rawdata = $state([]);
  let api = $state(null);
  
  const drive = {
    used: 19200000000,
    total: 60000000000,
  };

  $effect(()=>{
      myfs.dirtree("opfs:///").then(d => {
        rawdata = convertToSvarData(d);
        loaded = true;
      })
  })

  async function downloadStream(stream, name) {
    try {
      if (window.showSaveFilePicker) {
        // Modern approach: Streams directly to disk without bloating RAM
        const handle = await window.showSaveFilePicker({ suggestedName: name });
        const writable = await handle.createWritable();
        await stream.pipeTo(writable);
      } else {
        // Fallback for browsers that don't support showSaveFilePicker (loads into memory)
        const response = new Response(stream);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error("Download failed:", err);
    }
  }

  function init(api) {
    const lastPath = localStorage.getItem("fm:lastPath");

    if (lastPath && lastPath !== "/") {
      api.exec("set-path", {
        id: lastPath
      });
      
    }
    
    // --- File & Folder Operations ---
    api.on("open-file", (event) => {
      console.log("Opening file ID:", event.id);
        const filePath = event.id; // assuming id === full file path

        const encodedPath = encodeURIComponent(filePath);

        window.location.href = `/editor?file=${encodedPath}`;

    });

    api.on("create-file", async ({file, parent, newId}) => {
      if (file?.type == "folder") {
       await myfs.mkdir("opfs://" + newId)
      }
      else if (file.file instanceof File) { 
        await myfs.writeFile("opfs://" + newId, file.file)
      }
      else if (file.type == "file") {
        await myfs.writeFile("opfs://" + newId, "")
      }   
    });

    api.on("rename-file", (event) => {
      console.log("Renaming ID:", event.id, "to new name:", event.value);
    });

    api.on("delete-files", async (event) => {
      for(let id of event.ids) {
        console.log("deleting id : ", id);
        await myfs.rmdir("opfs://" + id);
        console.log("deleted id : ", id);
        
      }
    });

    api.on("move-files", (event) => {
      console.log("Moving IDs:", event.ids, "into folder:", event.target);
    });

    api.on("copy-files", (event) => {
      console.log("Copying IDs:", event.ids, "into folder:", event.target);
    });

    api.on("download-file", async (event) => {
      console.log("Downloading file ID:", event.id);
      const { stream, name, type } = await myfs.download("opfs://" + event.id);
      await downloadStream(stream, name);
    });

    // --- UI Navigation & Interaction ---
    api.on("select-file", (event) => {
      console.log("User clicked on:", event.id);
    });

    api.on("set-path", (event) => {
      console.log("Breadcrumb changed path to:", event.id);
      localStorage.setItem("fm:lastPath", event.id);
    });

    // api.on("open-tree-folder", (event) => {
    //   console.log("Tree folder ID:", event.id, "is now open:", event.open);
    // });

    api.on("set-active-panel", (event) => {
      console.log("Active panel switched to:", event.panel);
    });

    api.on("set-mode", (event) => {
      console.log("View mode (cards/list) changed to:", event.mode);
    });

    api.on("show-preview", (event) => {
      console.log("Preview panel is visible:", event.show);
    });

    // --- Data, Sorting & Filtering ---
    api.on("filter-files", (event) => {
      console.log("Search query entered:", event.value);
    });

    api.on("sort-files", (event) => {
      console.log("Sorting by:", event.field, "Direction:", event.dir);
    });

    // api.on("request-data", (event) => {
    //   console.log("Component requested data for folder:", event.id);
    // });

    // api.on("provide-data", (event) => {
    //   console.log("External data was successfully injected into the widget");
    // });
    
  }

</script>
{#if loaded}
  <Material>
    <div class="filemanager">
      <Filemanager {init} data={rawdata} {drive} menuOptions={customMenuOptions} />
    </div>
  </Material>
{/if}


<style>
  .filemanager {
    height: 96vh;
    width: 100%;
    max-height: inherit;  
    --wx-fm-background: rgb(207, 209, 221);
    --wx-fm-select-color: rgb(235, 235, 255);
    --wx-table-select-background: rgba(33, 195, 255, 0.1);
    --wx-table-select-focus-background: rgba(33, 195, 255, 0.1);
    /* --wx-fm-toolbar-height : 50px */
  }
 .wx-wrapper {
    height: 40%;
 }

</style>


