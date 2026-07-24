<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { slide } from 'svelte/transition';
  import Maximize from 'lucide-svelte/icons/maximize';
  import MousePointer2 from 'lucide-svelte/icons/mouse-pointer-2';
  import ImagePlus from 'lucide-svelte/icons/image-plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Undo2 from 'lucide-svelte/icons/undo-2';
  import Redo2 from 'lucide-svelte/icons/redo-2';
  import Download from 'lucide-svelte/icons/download';
  import Zap from 'lucide-svelte/icons/zap';
  import Tag from 'lucide-svelte/icons/tag';
  import ExportFlyout from '../ExportFlyout.svelte';
  import { DEFAULT_COMPOSITE_TOOLBAR_LABELS, type CompositeToolbarLabels, type ExportFlyoutLabels } from '../labels';

  /**
   * Deliberately poorer than `SldToolbar`: the composite editor has no
   * position/bus-bar/connection drawing tools. Only Import, Select (the sole
   * tool), Remove selected, Undo/Redo, Zoom-to-fit and Export.
   */
  export let userRole: string = 'viewer';
  export let canUndo: boolean = false;
  export let canRedo: boolean = false;
  export let hasSelection: boolean = false;
  /** Color mode, owned by the editor. */
  export let colorMode: 'by-type' | 'by-voltage' = 'by-type';
  /** Label-visibility mode, owned by the editor. */
  export let labelMode: 'all' | 'topology' | 'none' = 'all';
  export let labels: Partial<CompositeToolbarLabels> = {};
  export let exportLabels: Partial<ExportFlyoutLabels> = {};

  $: L = { ...DEFAULT_COMPOSITE_TOOLBAR_LABELS, ...labels };

  const dispatch = createEventDispatcher<{
    import: void;
    delete: void;
    undo: void;
    redo: void;
    fit: void;
    exportJson: void;
    exportSvg: void;
    setcolormode: 'by-type' | 'by-voltage';
    setlabelmode: 'all' | 'topology' | 'none';
  }>();

  // Label visibility cycles all → topology → none → all.
  const NEXT_LABEL_MODE = { all: 'topology', topology: 'none', none: 'all' } as const;

  $: canEdit = userRole !== 'viewer';

  let showExport = false;

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    )
      return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      dispatch(e.shiftKey ? 'redo' : 'undo');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      dispatch('redo');
    }
  }

  const btnBase = 'flex h-8 w-8 items-center justify-center rounded-full transition-colors';
  const btnActive = 'bg-primary text-primary-foreground';
  const btnIdle = 'text-muted-foreground hover:bg-accent hover:text-foreground';
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
  {#if showExport}
    <div class="absolute bottom-full right-0 z-20 mb-2" transition:slide={{ axis: 'y', duration: 200 }}>
      <ExportFlyout
        labels={exportLabels}
        on:json={() => {
          showExport = false;
          dispatch('exportJson');
        }}
        on:svg={() => {
          showExport = false;
          dispatch('exportSvg');
        }}
      />
    </div>
  {/if}

  <div
    class="flex h-10 items-center rounded-full border border-border bg-background/80 px-1 shadow-lg backdrop-blur-sm"
  >
    <!-- Zoom to fit -->
    <button title={L.fit} class="{btnBase} {btnIdle}" on:click={() => dispatch('fit')}>
      <span class="sr-only">{L.fit}</span>
      <Maximize class="h-4 w-4" />
    </button>

    <!-- Export (JSON / SVG) -->
    <button title={L.export} class="{btnBase} {showExport ? btnActive : btnIdle}" on:click={() => (showExport = !showExport)}>
      <span class="sr-only">{L.export}</span>
      <Download class="h-4 w-4" />
    </button>

    <!-- Color mode (by type ↔ by voltage) — always available -->
    <button
      title={L.colorMode}
      class="{btnBase} {colorMode === 'by-voltage' ? btnActive : btnIdle}"
      on:click={() => dispatch('setcolormode', colorMode === 'by-voltage' ? 'by-type' : 'by-voltage')}
    >
      <span class="sr-only">{L.colorMode}</span>
      <Zap class="h-4 w-4" />
    </button>

    <!-- Label visibility cycle — always available -->
    <button
      title={L.labelMode(labelMode)}
      class="{btnBase} {labelMode !== 'all' ? btnActive : btnIdle}"
      on:click={() => dispatch('setlabelmode', NEXT_LABEL_MODE[labelMode])}
    >
      <span class="sr-only">{L.labelMode(labelMode)}</span>
      <Tag class="h-4 w-4" />
    </button>

    {#if canEdit}
      <div class="mx-1 h-5 w-px shrink-0 bg-border" />

      <!-- Select — the only tool, always active -->
      <button title={L.select} class="{btnBase} {btnActive}">
        <span class="sr-only">{L.select}</span>
        <MousePointer2 class="h-4 w-4" />
      </button>

      <!-- Import a diagram -->
      <button title={L.import} class="{btnBase} {btnIdle}" on:click={() => dispatch('import')}>
        <span class="sr-only">{L.import}</span>
        <ImagePlus class="h-4 w-4" />
      </button>

      <div class="mx-1 h-5 w-px shrink-0 bg-border" />

      <!-- Delete selected -->
      <button
        title={L.delete}
        class="{btnBase} {btnIdle} disabled:opacity-40"
        disabled={!hasSelection}
        on:click={() => dispatch('delete')}
      >
        <span class="sr-only">{L.delete}</span>
        <Trash2 class="h-4 w-4" />
      </button>

      <!-- Undo / Redo -->
      <button
        title={L.undo}
        class="{btnBase} {btnIdle} disabled:opacity-40"
        disabled={!canUndo}
        on:click={() => dispatch('undo')}
      >
        <span class="sr-only">{L.undo}</span>
        <Undo2 class="h-4 w-4" />
      </button>
      <button
        title={L.redo}
        class="{btnBase} {btnIdle} disabled:opacity-40"
        disabled={!canRedo}
        on:click={() => dispatch('redo')}
      >
        <span class="sr-only">{L.redo}</span>
        <Redo2 class="h-4 w-4" />
      </button>
    {/if}
  </div>
</div>
