<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { slide, fade } from 'svelte/transition';
  import Maximize from 'lucide-svelte/icons/maximize';
  import Pencil from 'lucide-svelte/icons/pencil';
  import MousePointer2 from 'lucide-svelte/icons/mouse-pointer-2';
  import Grid3x3 from 'lucide-svelte/icons/grid-3x3';
  import Minus from 'lucide-svelte/icons/minus';
  import Square from 'lucide-svelte/icons/square';
  import Spline from 'lucide-svelte/icons/spline';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Undo2 from 'lucide-svelte/icons/undo-2';
  import Redo2 from 'lucide-svelte/icons/redo-2';
  import Download from 'lucide-svelte/icons/download';
  import Zap from 'lucide-svelte/icons/zap';
  import Tag from 'lucide-svelte/icons/tag';
  import X from 'lucide-svelte/icons/x';
  import type { PositionType } from '@sld-kit/core';
  import MatrixCreatorFlyout from './MatrixCreatorFlyout.svelte';
  import ExportFlyout from './ExportFlyout.svelte';
  import PositionTypeFlyout from './PositionTypeFlyout.svelte';
  import {
    DEFAULT_TOOLBAR_LABELS,
    DEFAULT_POSITION_TYPE_LABELS,
    type SldToolbarLabels,
    type ExportFlyoutLabels,
    type MatrixCreatorLabels
  } from './labels';

  export let userRole: string = 'viewer';
  /** Active canvas tool, owned by the editor. */
  export let tool: 'select' | 'busbar' | 'position' | 'connection' = 'select';
  export let canUndo: boolean = false;
  export let canRedo: boolean = false;
  export let hasSelection: boolean = false;
  /** Position type of the "add position" tool, owned by the editor. */
  export let positionType: PositionType = 'line';
  /** Color mode, owned by the editor. */
  export let colorMode: 'by-type' | 'by-voltage' = 'by-type';
  /** Label-visibility mode, owned by the editor. */
  export let labelMode: 'all' | 'topology' | 'none' = 'all';
  /** Selectable position types for the type flyout. */
  export let positionTypes: PositionType[] = ['line', 'transformer', 'central', 'renewable', 'reserve'];
  /** Label per position type (hint bar + type flyout). */
  export let positionTypeLabels: Record<string, string> = DEFAULT_POSITION_TYPE_LABELS;
  /** Toolbar UI strings. */
  export let labels: Partial<SldToolbarLabels> = {};
  /** Export flyout strings. */
  export let exportLabels: Partial<ExportFlyoutLabels> = {};
  /** Matrix creator strings. */
  export let matrixLabels: Partial<MatrixCreatorLabels> = {};

  $: L = { ...DEFAULT_TOOLBAR_LABELS, ...labels };

  const dispatch = createEventDispatcher<{
    settool: 'select' | 'busbar' | 'position' | 'connection';
    settype: PositionType;
    matrix: { rows: number; cols: number };
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

  // Edit mode reveals the mutation tools; closing it returns to select.
  export let editMode = false;
  let showMatrix = false;
  let showExport = false;

  function toggleEdit() {
    editMode = !editMode;
    if (!editMode) {
      showMatrix = false;
      dispatch('settool', 'select');
    }
  }

  function pick(t: 'select' | 'busbar' | 'position' | 'connection') {
    showMatrix = false;
    dispatch('settool', t);
  }

  function handleMatrix(e: CustomEvent<{ rows: number; cols: number }>) {
    showMatrix = false;
    dispatch('matrix', e.detail);
  }

  function toggleExport() {
    showExport = !showExport;
    if (showExport) showMatrix = false;
  }

  // Global shortcuts, guarded against form fields (mirrors DrawingToolbar).
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

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      if (!canEdit) return;
      e.preventDefault();
      toggleEdit();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      dispatch(e.shiftKey ? 'redo' : 'undo');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      dispatch('redo');
      return;
    }
    if (!editMode || !canEdit) return;
    // Single-key tool shortcuts (only while editing).
    if (e.key === 'v' || e.key === 'V') pick('select');
    else if (e.key === 'b' || e.key === 'B') pick('busbar');
    else if (e.key === 'p' || e.key === 'P') pick('position');
    else if (e.key === 'c' || e.key === 'C') pick('connection');
  }

  const btnBase = 'flex h-8 w-8 items-center justify-center rounded-full transition-colors';
  const btnActive = 'bg-primary text-primary-foreground';
  const btnIdle = 'text-muted-foreground hover:bg-accent hover:text-foreground';

  $: activeToolLabel =
    tool === 'busbar'
      ? L.hintBusBar
      : tool === 'position'
        ? L.hintPosition(positionTypeLabels[positionType] ?? positionType)
        : tool === 'connection'
          ? L.hintConnection
          : '';
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Floating hint bar while a placement/connection tool is active -->
{#if tool !== 'select' && activeToolLabel}
  <div class="absolute left-1/2 top-4 z-10 -translate-x-1/2" transition:fade={{ duration: 150 }}>
    <div
      class="flex h-9 items-center gap-2 rounded-full border border-border bg-background/80 px-4 shadow-lg backdrop-blur-sm"
    >
      <span class="text-sm text-muted-foreground">{activeToolLabel}</span>
      <button
        class="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        on:click={() => pick('select')}
      >
        <X class="h-3.5 w-3.5" />
        <span><kbd class="rounded border border-border px-1 font-mono text-xs">{L.escKey}</kbd></span>
      </button>
    </div>
  </div>
{/if}

<div class="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
  <!-- Matrix creator flyout -->
  {#if showMatrix}
    <div
      class="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2"
      transition:slide={{ axis: 'y', duration: 200 }}
    >
      <MatrixCreatorFlyout labels={matrixLabels} on:create={handleMatrix} />
    </div>
  {/if}

  <!-- Export flyout -->
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
    <!-- Zoom to fit — always available -->
    <button title={L.fit} class="{btnBase} {btnIdle}" on:click={() => dispatch('fit')}>
      <span class="sr-only">{L.fit}</span>
      <Maximize class="h-4 w-4" />
    </button>

    <!-- Export (JSON / SVG) — always available -->
    <button title={L.export} class="{btnBase} {showExport ? btnActive : btnIdle}" on:click={toggleExport}>
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

      <!-- Edit mode toggle -->
      <button
        title={editMode ? L.exitEditMode : L.editMode}
        class="{btnBase} {editMode ? btnActive : btnIdle}"
        on:click={toggleEdit}
      >
        <span class="sr-only">{L.editMode}</span>
        <Pencil class="h-4 w-4" />
      </button>

      {#if editMode}
        <div class="flex items-center" transition:slide={{ axis: 'x', duration: 250 }}>
          <div class="mx-1 h-5 w-px shrink-0 bg-border" />

          <!-- Select -->
          <button
            title={L.select}
            class="{btnBase} {tool === 'select' ? btnActive : btnIdle}"
            on:click={() => pick('select')}
          >
            <span class="sr-only">{L.select}</span>
            <MousePointer2 class="h-4 w-4" />
          </button>

          <!-- Matrix creator -->
          <button
            title={L.matrix}
            class="{btnBase} {showMatrix ? btnActive : btnIdle}"
            on:click={() => (showMatrix = !showMatrix)}
          >
            <span class="sr-only">{L.matrix}</span>
            <Grid3x3 class="h-4 w-4" />
          </button>

          <!-- Add bus bar -->
          <button
            title={L.addBusBar}
            class="{btnBase} {tool === 'busbar' ? btnActive : btnIdle}"
            on:click={() => pick('busbar')}
          >
            <span class="sr-only">{L.addBusBar}</span>
            <Minus class="h-4 w-4" />
          </button>

          <!-- Add position (split button + type flyout) -->
          <div class="flex items-center">
            <button
              title={L.addPosition}
              class="{btnBase} {tool === 'position' ? btnActive : btnIdle}"
              on:click={() => pick('position')}
            >
              <span class="sr-only">{L.addPosition}</span>
              <Square class="h-4 w-4" style="color: hsl(var(--sld-pos-{positionType}))" />
            </button>
            <PositionTypeFlyout
              isActive={tool === 'position'}
              {positionType}
              {positionTypes}
              labels={positionTypeLabels}
              on:settype
            />
          </div>

          <!-- Add connection -->
          <button
            title={L.addConnection}
            class="{btnBase} {tool === 'connection' ? btnActive : btnIdle}"
            on:click={() => pick('connection')}
          >
            <span class="sr-only">{L.addConnection}</span>
            <Spline class="h-4 w-4" />
          </button>

          <div class="mx-1 h-5 w-px shrink-0 bg-border" />

          <!-- Delete -->
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
    {/if}
  </div>
</div>
