<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { slide } from 'svelte/transition';
  import Maximize from 'lucide-svelte/icons/maximize';
  import MousePointer2 from 'lucide-svelte/icons/mouse-pointer-2';
  import ImagePlus from 'lucide-svelte/icons/image-plus';
  import Spline from 'lucide-svelte/icons/spline';
  import Type from 'lucide-svelte/icons/type';
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
   * position/bus-bar/connection drawing tools. Only Import, Select, Draw line,
   * Remove selected, Undo/Redo, Zoom-to-fit and Export.
   */
  export let userRole: string = 'viewer';
  export let canUndo: boolean = false;
  export let canRedo: boolean = false;
  export let hasSelection: boolean = false;
  /** Whether a *child diagram* (not a line/link) is selected — gates the name button. */
  export let childSelected: boolean = false;
  /** Whether the draw-line tool is active (owned by the editor). */
  export let drawActive: boolean = false;
  /** Color mode, owned by the editor. */
  export let colorMode: 'by-type' | 'by-voltage' = 'by-type';
  /** Label-visibility mode, owned by the editor. */
  export let labelMode: 'all' | 'topology' | 'none' = 'all';
  export let labels: Partial<CompositeToolbarLabels> = {};
  export let exportLabels: Partial<ExportFlyoutLabels> = {};

  $: L = { ...DEFAULT_COMPOSITE_TOOLBAR_LABELS, ...labels };

  const dispatch = createEventDispatcher<{
    import: void;
    drawline: void;
    delete: void;
    /** Open the name-placement editor for the selected child. */
    editlabel: void;
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

  // This toolbar has fewer buttons than SldToolbar, so the single pill fits down
  // to a smaller width: it stays one pill to ~420px and only then splits into two
  // stacked, full-width pills (each spreading its buttons edge to edge) so nothing
  // clips on small phones.
  const groupPill =
    'flex min-h-10 flex-wrap items-center gap-y-1 rounded-full border border-border bg-background/80 px-1.5 shadow-lg backdrop-blur-sm min-[420px]:h-auto min-[420px]:min-h-0 min-[420px]:w-auto min-[420px]:flex-nowrap min-[420px]:justify-start min-[420px]:px-0 min-[420px]:rounded-none min-[420px]:border-0 min-[420px]:bg-transparent min-[420px]:shadow-none min-[420px]:backdrop-blur-none';
  const divider = 'mx-1 h-5 w-px shrink-0 bg-border';
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="absolute inset-x-2 bottom-4 z-10 min-[420px]:inset-x-auto min-[420px]:left-1/2 min-[420px]:-translate-x-1/2">
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

  <!-- Responsive shell: one pill on ≥sm; below sm the view and edit clusters
       split into two stacked pills (view on the bottom) so nothing clips. -->
  <div
    class="flex flex-col-reverse items-center gap-2 min-[420px]:h-10 min-[420px]:flex-row min-[420px]:items-center min-[420px]:gap-0 min-[420px]:rounded-full min-[420px]:border min-[420px]:border-border min-[420px]:bg-background/80 min-[420px]:px-1 min-[420px]:shadow-lg min-[420px]:backdrop-blur-sm"
  >
    <!-- View / navigation cluster (always visible) -->
    <div class={groupPill + ' justify-stretch'}>
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

      <!-- Label visibility cycle — always available. Kept visually neutral in all
           three states; the glyph alone conveys the state. -->
      <button
        title={L.labelMode(labelMode)}
        class="{btnBase} {btnIdle}"
        on:click={() => dispatch('setlabelmode', NEXT_LABEL_MODE[labelMode])}
      >
        <span class="sr-only">{L.labelMode(labelMode)}</span>
        <Tag class="h-4 w-4">
          <!-- `all` shows the plain tag; `topology` adds a corner dot for "some
               labels" (position labels hidden); `none` adds a lucide-style slash. -->
          {#if labelMode === 'topology'}
            <circle cx="18.5" cy="18.5" r="4.5" fill="currentColor" stroke="none" />
          {:else if labelMode === 'none'}
            <path d="m2 22 20 -20" stroke-width="2.5" />
          {/if}
        </Tag>
      </button>
    </div>

    <!-- Edit cluster: mutation tools. Inside the shared pill on ≥sm; its own pill
         (stacked above the view row) below sm. -->
    {#if canEdit}
      <div class={groupPill + ' justify-between'}>
        <div class="{divider} hidden min-[420px]:block" />

        <!-- Select — the default tool; active unless the draw tool is engaged -->
        <button
          title={L.select}
          class="{btnBase} {drawActive ? btnIdle : btnActive}"
          on:click={() => drawActive && dispatch('drawline')}
        >
          <span class="sr-only">{L.select}</span>
          <MousePointer2 class="h-4 w-4" />
        </button>

        <!-- Draw a manual line between substations -->
        <button
          title={L.drawLine}
          class="{btnBase} {drawActive ? btnActive : btnIdle}"
          on:click={() => dispatch('drawline')}
        >
          <span class="sr-only">{L.drawLine}</span>
          <Spline class="h-4 w-4" />
        </button>

        <!-- Import a diagram -->
        <button title={L.import} class="{btnBase} {btnIdle}" on:click={() => dispatch('import')}>
          <span class="sr-only">{L.import}</span>
          <ImagePlus class="h-4 w-4" />
        </button>

        <div class={divider} />

        <!-- Diagram name position — enabled only when a child diagram is selected -->
        <button
          title={L.editLabel}
          class="{btnBase} {btnIdle} disabled:opacity-40"
          disabled={!childSelected}
          on:click={() => dispatch('editlabel')}
        >
          <span class="sr-only">{L.editLabel}</span>
          <Type class="h-4 w-4" />
        </button>

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
      </div>
    {/if}
  </div>
</div>
