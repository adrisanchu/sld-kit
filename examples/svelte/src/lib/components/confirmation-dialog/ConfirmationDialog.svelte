<script lang="ts">
  import { cn } from '$lib/utils.js';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let open: boolean = false;
  export let title: string = 'Confirmation required';
  export let description: string = 'Confirm or cancel the action';

  export let confirmText: string = 'Confirm';
  export let cancelText: string = 'Cancel';

  // Used to customize the CSS from the parent
  let className: string | undefined | null = undefined;
  export { className as class };

  function handleCancel() {
    open = false;
    dispatch('cancel');
  }

  function handleConfirm() {
    open = false;
    dispatch('confirm');
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Overlay />
  <Dialog.Content class={cn('max-w-xl', className)}>
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
    </Dialog.Header>
    <slot />
    <Dialog.Footer class="flex flex-col-reverse sm:flex-row sm:justify-between">
      <Dialog.Close class="grid">
        <Button type="button" variant="destructive" on:click={handleCancel}>{cancelText}</Button>
      </Dialog.Close>

      <Button type="button" on:click={handleConfirm}>{confirmText}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
