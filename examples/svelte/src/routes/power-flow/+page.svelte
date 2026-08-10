<script lang="ts">
  // Example 03 — Power-flow visualization over a composite diagram.
  //
  // "This grid exists in the real world; I can't edit it — I can only operate it
  // (open/close a switch) and watch the flow." A read-only `CompositeExplorer`
  // (from @sld-kit/svelte) renders the whole grid; clicking a diagram flies into
  // it; clicking a switch toggles it through a command; a toy model recomputes
  // the flow and the generic overlay animates it. All power-flow *meaning* lives
  // here in the example — the library stays domain-agnostic.
  import { onMount } from 'svelte';
  import {
    CompositeLayoutEngine,
    LayoutEngine,
    CommandStack,
    UpdateElementCommand,
    type CompositeDocument,
    type CompositeLayout,
    type ChildLayout,
    type SldDocument
  } from '@sld-kit/core';
  import { CompositeExplorer, type FlowResolver } from '@sld-kit/svelte';
  import { Button } from '$lib/components/ui/button';
  import { POSITION_TYPE_TOKENS, SLD_VIEW_STYLE, SLD_CHILD_NOT_FOUND, voltageToken } from '$lib/components/sld/theme';
  import { buildPowerFlowDemo } from '$lib/powerflow/fixture';
  import { getFlow, withFlowState, flowFormat, applyPowerFlow } from '$lib/powerflow/flow-data';
  import { POWER_FLOW_READINGS } from '$lib/powerflow/readings';
  import { computeFlowMap, type FlowMap } from '$lib/powerflow/model';

  let composite: CompositeDocument;
  const engine = new CompositeLayoutEngine(new LayoutEngine());
  const stack = new CommandStack<SldDocument>();
  let ready = false;
  let flowTick = 0; // bumped after a mutation to a child doc to force re-layout
  let focusedId: string | null = null;
  let explorer: CompositeExplorer;

  // Stop animating when the flow isn't actually on screen (tab hidden or the
  // canvas scrolled out of view) — hundreds of CSS animations cost nothing when
  // paused, and it keeps a backgrounded tab from spinning the compositor.
  let canvasWrap: HTMLDivElement;
  let onScreen = true;
  let tabVisible = true;
  $: paused = !onScreen || !tabVisible;

  onMount(() => {
    const demo = buildPowerFlowDemo();
    composite = demo.composite;
    for (const inst of composite.allChildren()) {
      inst.resolve(demo.resolver);
      // Fold the external power-flow feed into each diagram's `data.flow`.
      if (inst.resolved) applyPowerFlow(inst.resolved, POWER_FLOW_READINGS);
    }
    ready = true;

    const io = new IntersectionObserver(([e]) => (onScreen = e.isIntersecting), { threshold: 0 });
    if (canvasWrap) io.observe(canvasWrap);
    const onVis = () => (tabVisible = document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  });

  // Re-derive on flowTick: mutating a *child* doc doesn't notify the composite,
  // so we recompute the layout (and thus the flow map) explicitly after a toggle.
  // `relayout` takes flowTick only to declare the reactive dependency.
  const relayout = (_tick: number): CompositeLayout => engine.layout(composite);
  $: layout = ready ? relayout(flowTick) : null;
  $: flowMap = layout ? computeFlowMap(layout) : (new Map() as FlowMap);

  // A fresh closure each time the map changes so the overlay re-derives its dots.
  function makeResolver(map: FlowMap): FlowResolver {
    return (key) => {
      const f = map.get(key);
      if (!f || !f.active) return { active: false };
      const load = f.capacity ? f.magnitude / f.capacity : 0;
      const colorClass = load > 0.9 ? 'pf-flow-over' : load > 0.7 ? 'pf-flow-warn' : null;
      return {
        active: true,
        direction: f.direction,
        speed: 0.7 + Math.min(load, 1.3),
        intensity: Math.max(0.3, Math.min(1, load)),
        colorClass
      };
    };
  }
  $: resolveFlow = makeResolver(flowMap);

  const childColorClass = (child: ChildLayout): string | null => voltageToken(child.instance.resolved?.meta.voltageKv);

  /** Toggle an operable switch through a command, then recompute the flow. */
  function onActivate(instanceId: string, elementId: string) {
    const childDoc = composite.getChild(instanceId)?.resolved;
    const el = childDoc?.getElement(elementId);
    if (!childDoc || !el) return;
    const f = getFlow(el);
    if (!f?.operable) return; // only switches operate; other clicks are inert
    const before = el.toJSON();
    const next = f.state === 'open' ? 'closed' : 'open';
    stack.execute(new UpdateElementCommand(before, { ...before, data: withFlowState(before.data, next) }), childDoc);
    flowTick++;
  }

  /** Close every switch back to the nominal all-connected state. */
  function reset() {
    for (const inst of composite.allChildren()) {
      const d = inst.resolved;
      if (!d) continue;
      for (const pos of d.positions()) {
        const f = getFlow(pos);
        if (f?.operable && f.state === 'open') {
          const before = pos.toJSON();
          stack.execute(
            new UpdateElementCommand(before, { ...before, data: withFlowState(before.data, 'closed') }),
            d
          );
        }
      }
    }
    flowTick++;
  }
</script>

<svelte:head>
  <title>Power flow · SLD-KIT</title>
</svelte:head>

<div class="flex h-screen flex-col">
  <header class="border-b px-6 py-4">
    <p class="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Example 03</p>
    <h1 class="mt-1 text-xl font-semibold tracking-tight">Power flow</h1>
    <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
      A read-only grid you can only <em>operate</em>. Click a substation to fly in, click a line switch to
      open/close it, and watch the (toy) flow re-route. Animation and interaction are generic
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">@sld-kit/svelte</code> primitives; the power-flow
      meaning lives entirely in this example.
    </p>
  </header>

  <div bind:this={canvasWrap} class="relative min-h-0 flex-1">
    {#if layout}
      <CompositeExplorer
        bind:this={explorer}
        bind:focusedId
        {layout}
        {resolveFlow}
        {paused}
        formatResolver={flowFormat}
        {childColorClass}
        tokens={POSITION_TYPE_TOKENS}
        style={SLD_VIEW_STYLE}
        notFoundLabel={SLD_CHILD_NOT_FOUND}
        on:elementactivate={(e) => onActivate(e.detail.instanceId, e.detail.elementId)}
      />

      <!-- Floating controls (the explorer canvas fills the panel underneath). -->
      <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div>
          {#if focusedId}
            <Button variant="secondary" class="pointer-events-auto" on:click={() => explorer?.blur()}>
              ← Back to grid
            </Button>
          {/if}
        </div>
        <div class="pointer-events-auto flex items-center gap-3 rounded-lg border bg-card/90 px-3 py-2 shadow-sm backdrop-blur">
          <div class="flex items-center gap-4 text-xs text-muted-foreground">
            <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-primary"></span>flowing</span>
            <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-amber-500"></span>loaded</span>
            <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-red-500"></span>overloaded</span>
            <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-muted-foreground/40"></span>open</span>
          </div>
          <Button variant="outline" size="sm" on:click={reset}>Reset</Button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Live overload colours for the travelling dots. The overlay sets the line's
     colour from `--sld-pos`, so these must be global (they style a child of the
     library component, out of this file's scope). */
  :global(.pf-flow-warn) {
    --sld-pos: 38 92% 50%;
  }
  :global(.pf-flow-over) {
    --sld-pos: 0 84% 60%;
  }
</style>
