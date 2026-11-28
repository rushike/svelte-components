<script lang="ts">
  import { onMount, mount, unmount } from 'svelte';
  import { DockviewComponent, createDockview } from 'dockview-core';
  import 'dockview-core/dist/styles/dockview.css';

  // Import your Svelte 5 components to host in panes
  // import Navigator from './Navigator.svelte';
  // import QueryEditor from './QueryEditor.svelte';
  // import ResultsViewer from './ResultsViewer.svelte';
  import Editor from './Editor.svelte';

  let container: HTMLDivElement;
  let api: any;
  const STORAGE_KEY = 'dbeaver-layout-state';

  // Map of component names to Svelte 5 Components
  const componentMap : any = {
    navigator: Editor,
    queryEditor: Editor,
    resultsViewer: Editor
  };

  onMount(() => {
    // 1. Initialize Dockview Core
    api = createDockview(container, {
      createComponent: (options : any) => {
        const component = componentMap[options.name];
        const div = document.createElement('div');
        div.style.height = '100%';
        
        // Svelte 5: Mount the component into the panel's div
        const instance = mount(component, {
          target: div,
          props: { ...options.params, api: options.accessor }
        });

        return {
          element: div,
          dispose: () => unmount(instance)
        };
      }
    });

    // 2. Load saved layout or set default DBeaver layout
    const savedLayout = localStorage.getItem(STORAGE_KEY);
    if (savedLayout) {
      api.fromJSON(JSON.parse(savedLayout));
    } else {
      setupDefaultLayout();
    }

    // 3. Persist changes
    api.onDidLayoutChange(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(api.toJSON()));
    });
  });

  function setupDefaultLayout() {
    // Left Sidebar (Navigator)
    const nav = api.addPanel({
      id: 'nav_1',
      component: 'navigator',
      title: 'Database Navigator'
    });

    // Right Top (Query Editor) - position right of Navigator
    const query = api.addPanel({
      id: 'query_1',
      component: 'queryEditor',
      title: 'SQL Editor',
      position: { referencePanel: nav, direction: 'right' }
    });

    // Right Bottom (Results) - position below Query Editor
    api.addPanel({
      id: 'results_1',
      component: 'resultsViewer',
      title: 'Results',
      position: { referencePanel: query, direction: 'below' }
    });
  }

  // API to add a new "Plugged" window from elsewhere
  export function addNewWindow(id, type, title) {
    api.addPanel({ id, component: type, title });
  }
</script>

<div bind:this={container} class="dockview-container"></div>

<style>
  .dockview-container {
    height: 100vh;
    width: 100vw;
    /* Use a dockview theme */
    --dv-background-color: #1e1e1e;
  }
  :global(.dockview-theme-abyss) { /* Optional theme class */ }
</style>