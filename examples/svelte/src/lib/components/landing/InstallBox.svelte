<script lang="ts">
  // npm-style install box with a package-manager toggle (npm / pnpm / yarn),
  // built on the shadcn-svelte Tabs primitive. Each command is copy-able.
  import { Tabs, TabsList, TabsContent, TabsTrigger } from '$lib/components/ui/tabs';
  import CopyButton from './CopyButton.svelte';

  const managers = [
    { id: 'npm', cmd: 'npm i @sld-kit/core' },
    { id: 'pnpm', cmd: 'pnpm add @sld-kit/core' },
    { id: 'yarn', cmd: 'yarn add @sld-kit/core' }
  ];
</script>

<Tabs value="npm" class="w-full">
  <TabsList class="h-9">
    {#each managers as m (m.id)}
      <TabsTrigger value={m.id} class="font-mono text-xs">{m.id}</TabsTrigger>
    {/each}
  </TabsList>

  {#each managers as m (m.id)}
    <TabsContent value={m.id}>
      <div class="flex items-center gap-2 rounded-md border border-border bg-muted/40 py-2 pl-3 pr-2">
        <span aria-hidden="true" class="select-none font-mono text-sm text-primary">&gt;</span>
        <code class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-foreground">{m.cmd}</code>
        <CopyButton text={m.cmd} label={`Copy ${m.id} command`} />
      </div>
    </TabsContent>
  {/each}
</Tabs>
