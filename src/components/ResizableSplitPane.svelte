<script>
  import { onMount, createEventDispatcher } from 'svelte';

  let {
    direction = 'horizontal',
    initialLeftPercent = 42,
    minLeftPx = 280,
    minRightPx = 320,
    storageKey = null,
    dividerThickness = 8,
    leftPercent = $bindable(initialLeftPercent),
    onresize,
    left,
    right,
    children
  } = $props();

  const legacyDispatch = createEventDispatcher();

  let containerElement = $state(null);
  let isDragging = $state(false);

  // Restore saved width from localStorage if storageKey is provided
  onMount(() => {
    if (storageKey && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed > 5 && parsed < 95) {
          leftPercent = parsed;
        }
      }
    }
  });

  // Save leftPercent to localStorage when changed
  $effect(() => {
    if (storageKey && typeof localStorage !== 'undefined' && leftPercent) {
      try {
        localStorage.setItem(storageKey, leftPercent.toString());
      } catch (e) {
        // Ignore storage quota errors
      }
    }
  });

  function startResize(e) {
    if (!containerElement) return;
    e.preventDefault();
    isDragging = true;

    const rect = containerElement.getBoundingClientRect();
    const totalSize = direction === 'horizontal' ? rect.width : rect.height;
    const startPos = direction === 'horizontal' ? rect.left : rect.top;

    const onMove = (moveEvent) => {
      const clientPos =
        'touches' in moveEvent
          ? direction === 'horizontal'
            ? moveEvent.touches[0].clientX
            : moveEvent.touches[0].clientY
          : direction === 'horizontal'
            ? moveEvent.clientX
            : moveEvent.clientY;

      const offset = clientPos - startPos;
      let newPercent = (offset / totalSize) * 100;

      // Apply min pixel constraints
      const minPercent = (minLeftPx / totalSize) * 100;
      const maxPercent = ((totalSize - minRightPx) / totalSize) * 100;

      leftPercent = Math.max(minPercent, Math.min(maxPercent, newPercent));

      const detail = {
        leftPercent,
        containerWidth: rect.width,
        containerHeight: rect.height,
      };
      onresize?.(detail);
      legacyDispatch('resize', detail);
    };

    const onEnd = () => {
      isDragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  }
</script>

<div
  bind:this={containerElement}
  class="resizable-split-pane flex w-full h-full min-h-0 overflow-hidden relative {isDragging ? 'dragging' : ''} {direction === 'vertical' ? 'direction-vertical' : 'direction-horizontal'}"
  class:flex-row={direction === 'horizontal'}
  class:flex-col={direction === 'vertical'}
>
  <!-- Fullscreen drag overlay to prevent pointer capture issues during fast dragging -->
  {#if isDragging}
    <div
      class="fixed inset-0 z-[99999] select-none"
      style="cursor: {direction === 'horizontal' ? 'col-resize' : 'row-resize'} !important;"
    ></div>
  {/if}

  <!-- First / Left Pane -->
  <div
    class="pane-first overflow-hidden flex flex-col shrink-0"
    style="{direction === 'horizontal' ? `width: ${leftPercent}%;` : `height: ${leftPercent}%;`}"
  >
    {#if left}
      {@render left()}
    {:else if children}
      {@render children()}
    {/if}
  </div>

  <!-- Draggable Divider Handle Zone -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="divider-handle group shrink-0 relative flex items-center justify-center z-30 select-none touch-none transition-all duration-150"
    style="{direction === 'horizontal' ? `width: ${dividerThickness}px;` : `height: ${dividerThickness}px;`}; cursor: {direction === 'horizontal' ? 'col-resize' : 'row-resize'} !important;"
    onmousedown={startResize}
    ontouchstart={startResize}
  >
    <!-- Expanded Hit Area (Invisible boundary for easy grab) -->
    <div
      class="absolute inset-0 pointer-events-auto"
      style="{direction === 'horizontal' ? 'margin-left: -6px; margin-right: -6px; cursor: col-resize !important;' : 'margin-top: -6px; margin-bottom: -6px; cursor: row-resize !important;'}"
    ></div>

    <!-- Visible Edge Line (Expands on hover/drag) -->
    <div
      class="divider-line rounded-full transition-all duration-150 flex items-center justify-center
        {isDragging 
          ? 'bg-indigo-500 shadow-[0_0_14px_rgba(99,102,241,0.9)] w-2.5 h-full' 
          : 'bg-slate-700/80 border-x border-slate-600/50 group-hover:bg-indigo-500 group-hover:shadow-[0_0_12px_rgba(99,102,241,0.8)] group-hover:w-2.5 group-hover:h-full w-1.5 h-full'}"
      style="cursor: {direction === 'horizontal' ? 'col-resize' : 'row-resize'} !important;"
      class:w-full={direction === 'vertical'}
      class:h-1.5={direction === 'vertical' && !isDragging}
      class:group-hover:h-2.5={direction === 'vertical'}
    ></div>

    <!-- Center Grip Pill with Dots -->
    <div
      class="absolute rounded-full bg-slate-950 border border-slate-700 group-hover:border-indigo-400 group-hover:bg-indigo-950 group-hover:scale-125 transition-all duration-150 flex items-center justify-center pointer-events-auto shadow-lg z-10"
      style="cursor: {direction === 'horizontal' ? 'col-resize' : 'row-resize'} !important;"
      class:w-3.5={direction === 'horizontal'}
      class:h-8={direction === 'horizontal'}
      class:h-3.5={direction === 'vertical'}
      class:w-8={direction === 'vertical'}
      class:border-indigo-400={isDragging}
      class:bg-indigo-950={isDragging}
      class:scale-125={isDragging}
    >
      <!-- Grip lines / dots -->
      <div
        class="flex gap-0.5 pointer-events-none"
        class:flex-col={direction === 'horizontal'}
        class:flex-row={direction === 'vertical'}
      >
        <span class="w-1 h-1 rounded-full bg-slate-400 group-hover:bg-indigo-200 {isDragging ? 'bg-indigo-200' : ''}"></span>
        <span class="w-1 h-1 rounded-full bg-slate-400 group-hover:bg-indigo-200 {isDragging ? 'bg-indigo-200' : ''}"></span>
        <span class="w-1 h-1 rounded-full bg-slate-400 group-hover:bg-indigo-200 {isDragging ? 'bg-indigo-200' : ''}"></span>
      </div>
    </div>
  </div>

  <!-- Second / Right Pane -->
  <div
    class="pane-second flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col"
  >
    {#if right}
      {@render right()}
    {/if}
  </div>
</div>

<style>
  .resizable-split-pane.dragging {
    user-select: none !important;
  }

  .divider-handle,
  .divider-handle * {
    cursor: col-resize !important;
  }

  .direction-vertical .divider-handle,
  .direction-vertical .divider-handle * {
    cursor: row-resize !important;
  }
</style>
