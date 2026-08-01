<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
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
    type ExternalDirection,
    getCommissioning,
    withCommissioning
  } from '@sld-kit/core';
  import { POSITION_TYPE_LABELS, COMMISSIONING_CATEGORY_OPTIONS } from '$lib/components/sld/theme';

  /**
   * Properties dialog for a single element, opened by double-clicking it.
   * Fields adapt to the element kind; on save it emits the updated JSON,
   * which the editor applies through an undoable UpdateElementCommand.
   */
  export let open = false;
  export let element: SldElement | null = null;

  const dispatch = createEventDispatcher<{ save: { json: ElementJson } }>();

  const positionTypes: PositionType[] = [
    'line',
    'transformer',
    'central',
    'renewable',
    'reserve',
    'storage',
    'demand'
  ];
  const externalAssets: { value: ExternalAssetKind; label: string }[] = [
    { value: 'line', label: 'Line' },
    { value: 'transformer', label: 'Transformer' },
    { value: 'renewable', label: 'Renewable' },
    { value: 'storage', label: 'Storage' },
    { value: 'demand', label: 'Demand' }
  ];
  // `{ value, label }` option lists for the shadcn Select components.
  const positionTypeOptions = positionTypes.map((t) => ({ value: t, label: POSITION_TYPE_LABELS[t] }));
  const directionOptions: { value: 'auto' | ExternalDirection; label: string }[] = [
    { value: 'auto', label: 'Automatic (derived ↑/↓)' },
    { value: 'up', label: 'Up' },
    { value: 'down', label: 'Down' },
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' }
  ];
  const tapOptions: { value: 'auto' | 'above' | 'below'; label: string }[] = [
    { value: 'auto', label: 'Automatic' },
    { value: 'above', label: 'Above' },
    { value: 'below', label: 'Below' }
  ];
  const laneOptions: { value: 'left' | 'right'; label: string }[] = [
    { value: 'right', label: 'Right' },
    { value: 'left', label: 'Left' }
  ];

  let label = '';
  let elId = '';
  let posType: PositionType = 'line';
  let extAsset: ExternalAssetKind = 'line';
  let extLabel = '';
  let extDirection: 'auto' | ExternalDirection = 'auto';
  let extTap: 'auto' | 'above' | 'below' = 'auto';
  let extLaneSide: 'left' | 'right' = 'right';
  let externalSide: 'from' | 'to' | null = null;
  let seededId: string | null = null;
  // Commissioning: the "new vs. existing" axis, stored in
  // data.sld.commissioning and read by the theme to style stroke/fill.
  let commCategory = '';
  let commDate = '';

  // Seed the working fields once when a new element opens.
  $: if (element && element.id !== seededId) {
    seededId = element.id;
    elId = element.id;
    label = element.label;
    externalSide = null;
    extTap = 'auto';
    extLaneSide = 'right';
    const comm = getCommissioning(element);
    commCategory = comm?.category ?? '';
    commDate = comm?.date ?? '';
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

  // Current selection objects for each Select (bits-ui wants `{ value, label }`).
  $: selectedPosType = positionTypeOptions.find((o) => o.value === posType);
  $: selectedAsset = externalAssets.find((o) => o.value === extAsset);
  $: selectedDirection = directionOptions.find((o) => o.value === extDirection);
  $: selectedTap = tapOptions.find((o) => o.value === extTap);
  $: selectedLaneSide = laneOptions.find((o) => o.value === extLaneSide);
  $: selectedComm = COMMISSIONING_CATEGORY_OPTIONS.find((o) => o.value === commCategory);

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
    json.id = elId.trim() || element.id;
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
    // Commissioning tag lives in the opaque data.sld namespace; the theme reads
    // it to style the element. `withCommissioning` preserves other data keys and
    // drops the tag when both fields are empty.
    const nextData = withCommissioning(json.data, {
      category: commCategory || undefined,
      date: commDate || undefined
    });
    if (nextData === undefined) delete json.data;
    else json.data = nextData;
    dispatch('save', { json });
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Overlay class="z-[60]" />
  <!-- Capped to the viewport (dvh handles mobile browser chrome); the header and
       footer stay put while the fields scroll — one column, works down to phones. -->
  <Dialog.Content class="z-[60] flex max-h-[85dvh] max-w-sm flex-col">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
    </Dialog.Header>

    <!-- Scrollable field region. `min-h-0` lets the flex child shrink so it
         actually scrolls; `-mx-6 px-6` keeps the scrollbar at the dialog edge. -->
    <div class="-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-6">
      <div class="space-y-1.5 pt-2">
        <Label for="sld-id">Identifier</Label>
        <Input id="sld-id" bind:value={elId} placeholder="e.g. cn-atp1-400-220" />
        <p class="text-xs text-muted-foreground">
          Unique within the diagram. Two diagrams sharing the same identifier become connected in the
          composite model.
        </p>
      </div>

      {#if kind === 'position'}
        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label for="sld-name">Name / code</Label>
            <Input id="sld-name" bind:value={label} placeholder="e.g. L1" />
          </div>
          <div class="space-y-1.5">
            <Label for="sld-type">Type</Label>
            <Select.Root selected={selectedPosType} onSelectedChange={(s) => s && (posType = s.value)}>
              <Select.Trigger id="sld-type">
                <Select.Value placeholder="Select a type" />
              </Select.Trigger>
              <Select.Content>
                {#each positionTypeOptions as o}
                  <Select.Item value={o.value} label={o.label}>{o.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      {:else if kind === 'busbar'}
        <div class="space-y-1.5">
          <Label for="sld-name">Name</Label>
          <Input id="sld-name" bind:value={label} placeholder="e.g. BB1" />
        </div>
      {:else if kind === 'connection' && externalSide}
        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label for="sld-name">Name</Label>
            <Input id="sld-name" bind:value={extLabel} placeholder="e.g. FEEDER A" />
          </div>
          <div class="space-y-1.5">
            <Label for="sld-asset">Asset</Label>
            <Select.Root selected={selectedAsset} onSelectedChange={(s) => s && (extAsset = s.value)}>
              <Select.Trigger id="sld-asset">
                <Select.Value placeholder="Select an asset" />
              </Select.Trigger>
              <Select.Content>
                {#each externalAssets as a}
                  <Select.Item value={a.value} label={a.label}>{a.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div class="space-y-1.5">
            <Label for="sld-dir">Direction</Label>
            <Select.Root selected={selectedDirection} onSelectedChange={(s) => s && (extDirection = s.value)}>
              <Select.Trigger id="sld-dir">
                <Select.Value placeholder="Select a direction" />
              </Select.Trigger>
              <Select.Content>
                {#each directionOptions as o}
                  <Select.Item value={o.value} label={o.label}>{o.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div class="space-y-1.5">
            <Label for="sld-tap">Connection point</Label>
            <Select.Root selected={selectedTap} onSelectedChange={(s) => s && (extTap = s.value)}>
              <Select.Trigger id="sld-tap">
                <Select.Value placeholder="Select a connection point" />
              </Select.Trigger>
              <Select.Content>
                {#each tapOptions as o}
                  <Select.Item value={o.value} label={o.label}>{o.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div class="space-y-1.5">
            <Label for="sld-lane">Lane side</Label>
            <Select.Root
              selected={selectedLaneSide}
              disabled={extDirection === 'left' || extDirection === 'right'}
              onSelectedChange={(s) => s && (extLaneSide = s.value)}
            >
              <Select.Trigger id="sld-lane">
                <Select.Value placeholder="Select a lane side" />
              </Select.Trigger>
              <Select.Content>
                {#each laneOptions as o}
                  <Select.Item value={o.value} label={o.label}>{o.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      {:else}
        <div class="space-y-1.5">
          <Label for="sld-name">Label</Label>
          <Input id="sld-name" bind:value={label} placeholder="(no label)" />
        </div>
      {/if}

      <div class="space-y-3 border-t pt-3">
        <div class="space-y-1.5">
          <Label for="sld-comm-category">Commissioning</Label>
          <Select.Root selected={selectedComm} onSelectedChange={(s) => s && (commCategory = s.value)}>
            <Select.Trigger id="sld-comm-category">
              <Select.Value placeholder="Untagged" />
            </Select.Trigger>
            <Select.Content>
              {#each COMMISSIONING_CATEGORY_OPTIONS as o}
                <Select.Item value={o.value} label={o.label}>{o.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <p class="text-xs text-muted-foreground">
            Distinguishes new vs. existing assets — drives the border/opacity in the diagram and export.
          </p>
        </div>
        <div class="space-y-1.5">
          <Label for="sld-comm-date">Commissioning date (optional)</Label>
          <Input id="sld-comm-date" type="date" bind:value={commDate} />
        </div>
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
      <Button on:click={save}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
