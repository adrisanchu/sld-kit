<script lang="ts">
  import { tick, createEventDispatcher } from 'svelte';
  import { cn } from '$lib/utils.js';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  const dispatch = createEventDispatcher<{
    create: { name: string; substation?: string; voltageKv?: number };
    cancel: void;
  }>();

  export let open: boolean = false;
  export let title: string = 'New diagram';
  export let description: string = 'Set the diagram metadata. You can change it later.';

  // Used to customize the CSS from the parent.
  let className: string | undefined | null = undefined;
  export { className as class };

  // Local form state — the parent owns creation/persistence; this dialog only
  // collects metadata and dispatches it.
  let name = 'New diagram';
  let substation = '';
  let voltageKv: number | null = null;
  let nameInput: Input;

  // Reset fields each time the dialog (re)opens so a cancelled create leaves no
  // stale state behind, and focus the name field for quick entry.
  let wasOpen = false;
  $: if (open && !wasOpen) {
    wasOpen = true;
    name = 'New diagram';
    substation = '';
    voltageKv = null;
    tick().then(() => nameInput?.focus());
  } else if (!open && wasOpen) {
    wasOpen = false;
  }

  function handleCreate() {
    open = false;
    // make sure to parse the voltage as a number, and only include it in the event if it's a valid number
    const kv = Number(voltageKv);
    dispatch('create', {
      name: name.trim() || 'New diagram',
      substation: substation.trim() || undefined,
      voltageKv: voltageKv === null || Number.isNaN(kv) ? undefined : kv
    });
  }

  function handleCancel() {
    open = false;
    dispatch('cancel');
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Overlay />
  <Dialog.Content class={cn('max-w-xl', className)}>
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
    </Dialog.Header>

    <form class="grid gap-4 py-2" on:submit|preventDefault={handleCreate}>
      <div class="grid gap-2">
        <Label for="new-diagram-name">Name</Label>
        <Input id="new-diagram-name" bind:this={nameInput} bind:value={name} placeholder="New diagram" />
      </div>

      <div class="grid gap-2">
        <Label for="new-diagram-substation">Substation</Label>
        <Input id="new-diagram-substation" bind:value={substation} placeholder="e.g. Example" />
      </div>

      <div class="grid gap-2">
        <Label for="new-diagram-voltage">Voltage (kV)</Label>
        <Input
          id="new-diagram-voltage"
          type="number"
          min="0"
          step="any"
          bind:value={voltageKv}
          placeholder="e.g. 400"
        />
      </div>

      <Dialog.Footer class="flex flex-col-reverse sm:flex-row sm:justify-between">
        <Dialog.Close class="grid">
          <Button type="button" variant="outline" on:click={handleCancel}>Cancel</Button>
        </Dialog.Close>

        <Button type="submit">Create</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
