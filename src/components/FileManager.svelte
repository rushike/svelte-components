
<script>
  import { Filemanager, Material } from "@svar-ui/svelte-filemanager";
  import {dirtree, mkdir, rmdir, readFile, writeFile} from "/myfinsheet-client/opfs.js"
  

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
      dirtree().then(d => {
        rawdata = convertToSvarData(d);
        loaded = true;
      })
  })

  /**
 * Triggers a download for a File or Blob object.
 * @param {File|Blob} file - The file object to download.
 * @param {string} filename - Optional filename (defaults to file.name).
 */
function downloadFile(file, filename) {
  // 1. Create a URL representing the file
  const url = URL.createObjectURL(file);
  
  // 2. Create a temporary anchor (<a>) element
  const anchor = document.createElement('a');
  anchor.href = url;
  
  // 3. Set the download attribute with the desired filename
  anchor.download = filename || file.name || 'download';
  
  // 4. Append to body, click it, and remove it
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  
  // 5. Clean up the URL to free up memory
  URL.revokeObjectURL(url);
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
       await mkdir(newId)
      }
      else if (file.file instanceof File) { 
        await writeFile(newId, file.file)
      }
      else if (file.type == "file") {
        await writeFile(newId, "")
      }   
    });

    api.on("rename-file", (event) => {
      console.log("Renaming ID:", event.id, "to new name:", event.value);
    });

    api.on("delete-files", async (event) => {
      for(let id of event.ids) {
        console.log("deleting id : ", id);
        await rmdir(id);
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
      downloadFile(await readFile(event.id))
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
      <Filemanager  {init} data={rawdata} {drive} />
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


