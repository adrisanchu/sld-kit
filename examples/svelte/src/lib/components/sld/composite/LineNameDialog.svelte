<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    DEFAULT_LINE_NAME_PLACEMENT,
    LINE_NAME_ALONGS,
    LINE_NAME_ORIENTATIONS,
    LINE_NAME_SIDES,
    type LineNameAlong,
    type LineNameOrientation,
    type LineNamePlacement,
    type LineNameSide
  } from '@sld-kit/core';

  /**
   * Edits a composite line's own name and where it sits: position along the
   * line, side, and orientation. The sibling of `DiagramLabelDialog`, with the
   * same contract: it reflects the live `name` / `placement` and dispatches every
   * edit as a full `{ name, placement }` for the editor to commit (undoable via
   * `SetLineNameCommand`, or by materializing a selected auto-link). The name
   * commits on Enter / blur, not per keystroke, so each rename is one undo step.
   */
  export let open: boolean = false;
  export let name: string = '';
  export let placement: LineNamePlacement = DEFAULT_LINE_NAME_PLACEMENT;
  /** Shown as context in the description, e.g. the shared feeder id. */
  export let lineId: string = '';

  const dispatch = createEventDispatcher<{ change: { name: string; placement: LineNamePlacement } }>();

  const ALONG_LABELS: Record<LineNameAlong, string> = { start: 'Start', middle: 'Middle', end: 'End' };
  const SIDE_LABELS: Record<LineNameSide, string> = { above: 'Above the line', below: 'Below the line' };
  const ORIENTATION_LABELS: Record<LineNameOrientation, string> = {
    parallel: 'Parallel (along the line)',
    perpendicular: 'Perpendicular (across the line)',
    horizontal: 'Horizontal'
  };
  const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
    values.map((value) => ({ value, label: labels[value] }));
  const alongOptions = options(LINE_NAME_ALONGS, ALONG_LABELS);
  const sideOptions = options(LINE_NAME_SIDES, SIDE_LABELS);
  const orientationOptions = options(LINE_NAME_ORIENTATIONS, ORIENTATION_LABELS);

  // Local draft for the text field only; re-synced whenever the live name changes
  // (another selection, undo/redo).
  let draft = name;
  $: draft = name;

  function commit(patch: Partial<LineNamePlacement> = {}) {
    dispatch('change', { name: draft.trim(), placement: { ...placement, ...patch } });
  }

  function commitName() {
    if (draft.trim() !== name) commit();
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Line name</Dialog.Title>
      <Dialog.Description>
        Name this line{lineId ? ` (${lineId})` : ''}. “Start” and “Above” follow the reading direction — left to right,
        or bottom to top on a vertical run — so the name stays put when the diagrams swap places.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <div class="space-y-1.5">
        <Label for="line-name">Name</Label>
        <Input
          id="line-name"
          placeholder="e.g. L-400 kV West-South 1"
          bind:value={draft}
          on:blur={commitName}
          on:keydown={(e) => e.key === 'Enter' && commitName()}
        />
      </div>

      <div class="space-y-1.5">
        <Label for="line-name-along">Position</Label>
        <Select.Root
          selected={alongOptions.find((o) => o.value === placement.along)}
          onSelectedChange={(s) => s && commit({ along: s.value })}
        >
          <Select.Trigger id="line-name-along"><Select.Value /></Select.Trigger>
          <Select.Content>
            {#each alongOptions as o}
              <Select.Item value={o.value} label={o.label}>{o.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="space-y-1.5">
        <Label for="line-name-side">Side</Label>
        <Select.Root
          selected={sideOptions.find((o) => o.value === placement.side)}
          onSelectedChange={(s) => s && commit({ side: s.value })}
        >
          <Select.Trigger id="line-name-side"><Select.Value /></Select.Trigger>
          <Select.Content>
            {#each sideOptions as o}
              <Select.Item value={o.value} label={o.label}>{o.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="space-y-1.5">
        <Label for="line-name-orientation">Orientation</Label>
        <Select.Root
          selected={orientationOptions.find((o) => o.value === placement.orientation)}
          onSelectedChange={(s) => s && commit({ orientation: s.value })}
        >
          <Select.Trigger id="line-name-orientation"><Select.Value /></Select.Trigger>
          <Select.Content>
            {#each orientationOptions as o}
              <Select.Item value={o.value} label={o.label}>{o.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
