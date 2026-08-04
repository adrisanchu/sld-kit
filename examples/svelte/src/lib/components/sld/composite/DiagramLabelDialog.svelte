<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { Label } from '$lib/components/ui/label';
  import RotateCw from 'lucide-svelte/icons/rotate-cw';
  import { LABEL_ANCHORS, type LabelAnchor } from '@sld-kit/core';

  /**
   * Edits where a composite child's always-on name label sits: one of the six
   * frame slots (dropdown) plus a quarter-turn direction (rotate button). The
   * dialog owns no state — it reflects the live `anchor`/`direction` and
   * dispatches every edit as a full placement for the editor to commit
   * (undoable via `SetChildLabelCommand`).
   */
  export let open: boolean = false;
  export let name: string = '';
  export let anchor: LabelAnchor = 'top-left';
  export let direction: number = 0;

  const dispatch = createEventDispatcher<{ change: { anchor: LabelAnchor; direction: number } }>();

  const ANCHOR_LABELS: Record<LabelAnchor, string> = {
    'top-left': 'Top · left',
    'top-center': 'Top · center',
    'top-right': 'Top · right',
    'center-left': 'Middle · left',
    'center-right': 'Middle · right',
    'bottom-left': 'Bottom · left',
    'bottom-center': 'Bottom · center',
    'bottom-right': 'Bottom · right'
  };
  const anchorOptions = LABEL_ANCHORS.map((a) => ({ value: a, label: ANCHOR_LABELS[a] }));

  $: selectedAnchor = anchorOptions.find((o) => o.value === anchor);

  function rotate() {
    dispatch('change', { anchor, direction: direction + 90 });
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Diagram name position</Dialog.Title>
      <Dialog.Description>Place the “{name}” label on its diagram frame.</Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <div class="space-y-1.5">
        <Label for="diagram-anchor">Position</Label>
        <Select.Root
          selected={selectedAnchor}
          onSelectedChange={(s) => s && dispatch('change', { anchor: s.value, direction })}
        >
          <Select.Trigger id="diagram-anchor">
            <Select.Value placeholder="Select a position" />
          </Select.Trigger>
          <Select.Content>
            {#each anchorOptions as o}
              <Select.Item value={o.value} label={o.label}>{o.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Direction <span class="text-muted-foreground">({direction}°)</span></span>
        <button
          class="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          on:click={rotate}
        >
          <RotateCw class="h-4 w-4" />
          Rotate 90°
        </button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
