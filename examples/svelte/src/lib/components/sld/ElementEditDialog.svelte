<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    BusBar,
    Position,
    Connection,
    type SldElement,
    type ElementJson,
    type ConnectionJson,
    type PositionType,
    type ExternalAssetKind,
    type ExternalDirection
  } from '@sld-kit/core';
  import { POSITION_TYPE_LABELS } from '$lib/components/sld/theme';

  /**
   * Properties dialog for a single element, opened by double-clicking it.
   * Fields adapt to the element kind; on save it emits the updated JSON,
   * which the editor applies through an undoable UpdateElementCommand.
   */
  export let open = false;
  export let element: SldElement | null = null;

  const dispatch = createEventDispatcher<{ save: { json: ElementJson } }>();

  const positionTypes: PositionType[] = ['line', 'transformer', 'central', 'renewable', 'reserve'];
  const externalAssets: { value: ExternalAssetKind; label: string }[] = [
    { value: 'line', label: 'Line' },
    { value: 'transformer', label: 'Transformer' },
    { value: 'renewable', label: 'Renewable' },
    { value: 'storage', label: 'Storage' },
    { value: 'demand', label: 'Demand' }
  ];

  let label = '';
  let posType: PositionType = 'line';
  let extAsset: ExternalAssetKind = 'line';
  let extLabel = '';
  let extDirection: 'auto' | ExternalDirection = 'auto';
  let extTap: 'auto' | 'above' | 'below' = 'auto';
  let extLaneSide: 'left' | 'right' = 'right';
  let externalSide: 'from' | 'to' | null = null;
  let seededId: string | null = null;

  // Seed the working fields once when a new element opens.
  $: if (element && element.id !== seededId) {
    seededId = element.id;
    label = element.label;
    externalSide = null;
    extTap = 'auto';
    extLaneSide = 'right';
    if (element instanceof Position) posType = element.type;
    if (element instanceof Connection) {
      externalSide = element.from.kind === 'external' ? 'from' : element.to.kind === 'external' ? 'to' : null;
      const ext = externalSide === 'from' ? element.from : externalSide === 'to' ? element.to : null;
      if (ext && ext.kind === 'external') {
        extAsset = ext.asset;
        extLabel = ext.label;
        extDirection = ext.direction ?? 'auto';
        extLaneSide = ext.side ?? 'right';
      }
      // The tap lives on the element (non-external) endpoint.
      const posEnd = externalSide === 'from' ? element.to : externalSide === 'to' ? element.from : null;
      if (posEnd && posEnd.kind === 'element') extTap = posEnd.tap ?? 'auto';
    }
  }
  $: if (!open) seededId = null;

  $: kind = element?.kind ?? null;
  $: title =
    kind === 'busbar'
      ? 'Edit bus bar'
      : kind === 'position'
        ? 'Edit position'
        : externalSide
          ? 'Edit external asset'
          : 'Edit connection';

  function save() {
    if (!element) return;
    const json = element.toJSON();
    json.label = label;
    if (json.kind === 'position') {
      json.type = posType;
    } else if (json.kind === 'connection' && externalSide) {
      const conn = json as ConnectionJson;
      // 'auto' direction → omit so the layout derives it; horizontal exits
      // ignore `side` (the direction itself picks the edge).
      const dirToSave: ExternalDirection | undefined = extDirection !== 'auto' ? extDirection : undefined;
      const isHorizontal = dirToSave === 'left' || dirToSave === 'right';
      conn[externalSide] = {
        kind: 'external',
        asset: extAsset,
        label: extLabel.trim() || 'NEW',
        ...(dirToSave !== undefined ? { direction: dirToSave } : {}),
        ...(!isHorizontal && extLaneSide !== 'right' ? { side: extLaneSide } : {})
      };
      // Write the tap override onto the element endpoint; 'auto' means derived.
      const elKey = externalSide === 'from' ? 'to' : 'from';
      const elEnd = conn[elKey];
      if (elEnd.kind === 'element') {
        conn[elKey] = { kind: 'element', id: elEnd.id, ...(extTap === 'auto' ? {} : { tap: extTap }) };
      }
    }
    dispatch('save', { json });
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Overlay class="z-[60]" />
  <Dialog.Content class="z-[60] max-w-sm">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
    </Dialog.Header>

    {#if kind === 'position'}
      <div class="space-y-3 py-2">
        <div class="space-y-1.5">
          <Label for="sld-name">Name / code</Label>
          <Input id="sld-name" bind:value={label} placeholder="e.g. L1" />
        </div>
        <div class="space-y-1.5">
          <Label for="sld-type">Type</Label>
          <select
            id="sld-type"
            bind:value={posType}
            class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {#each positionTypes as t}
              <option value={t}>{POSITION_TYPE_LABELS[t]}</option>
            {/each}
          </select>
        </div>
      </div>
    {:else if kind === 'busbar'}
      <div class="space-y-1.5 py-2">
        <Label for="sld-name">Name</Label>
        <Input id="sld-name" bind:value={label} placeholder="e.g. BB1" />
      </div>
    {:else if kind === 'connection' && externalSide}
      <div class="space-y-3 py-2">
        <div class="space-y-1.5">
          <Label for="sld-name">Name</Label>
          <Input id="sld-name" bind:value={extLabel} placeholder="e.g. FEEDER A" />
        </div>
        <div class="space-y-1.5">
          <Label for="sld-asset">Asset</Label>
          <select
            id="sld-asset"
            bind:value={extAsset}
            class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {#each externalAssets as a}
              <option value={a.value}>{a.label}</option>
            {/each}
          </select>
        </div>
        <div class="space-y-1.5">
          <Label for="sld-dir">Direction</Label>
          <select
            id="sld-dir"
            bind:value={extDirection}
            class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="auto">Automatic (derived ↑/↓)</option>
            <option value="up">Up</option>
            <option value="down">Down</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div class="space-y-1.5">
          <Label for="sld-tap">Connection point</Label>
          <select
            id="sld-tap"
            bind:value={extTap}
            class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="auto">Automatic</option>
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
        </div>
        <div class="space-y-1.5">
          <Label for="sld-lane">Lane side</Label>
          <select
            id="sld-lane"
            bind:value={extLaneSide}
            disabled={extDirection === 'left' || extDirection === 'right'}
            class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </div>
      </div>
    {:else}
      <div class="space-y-1.5 py-2">
        <Label for="sld-name">Label</Label>
        <Input id="sld-name" bind:value={label} placeholder="(no label)" />
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
      <Button on:click={save}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
