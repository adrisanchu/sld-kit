<script lang="ts">
  // Landing page — explains the project and routes to the two examples.
  // Aesthetic: engineering blueprint — schematic grid, monospace labels, an
  // animated single-line diagram motif, staggered load reveals.
  import { base } from '$app/paths';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Code from 'lucide-svelte/icons/code-xml';
  import PencilRuler from 'lucide-svelte/icons/pencil-ruler';
  import Boxes from 'lucide-svelte/icons/boxes';
  import Github from 'lucide-svelte/icons/github';
  import { GITHUB_URL } from '$lib/components/layout/navItems';

  const props = [
    {
      k: '01',
      title: 'No pixels in the model',
      body: 'Elements live in a matrix of rows × columns. A layout engine maps that to pixels — restyling or rescaling is a config change, never a data migration.'
    },
    {
      k: '02',
      title: 'Commands are the only mutator',
      body: 'Every edit runs through a command stack, so undo/redo is always complete and never desynced from the document.'
    },
    {
      k: '03',
      title: 'Office-safe SVG export',
      body: 'Exports use presentation attributes only — no CSS, no classes, no markers. The string pastes straight into PowerPoint.'
    },
    {
      k: '04',
      title: 'Headless & framework-agnostic',
      body: 'A zero-dependency core engine; framework adapters (Svelte first) wrap it with native views. Theming and localization stay yours.'
    }
  ];
</script>

<div class="schematic relative min-h-full overflow-x-hidden">
  <!-- Hero -->
  <section class="mx-auto max-w-6xl px-6 pb-16 pt-16 sm:pt-24">
    <div class="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
      <div class="reveal">
        <p class="mb-5 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          <span class="text-primary">◆</span>&nbsp; Headless SLD engine
        </p>
        <h1 class="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Single-line diagrams,<br />
          <span class="text-primary">as code.</span>
        </h1>
        <p class="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          <span class="font-mono text-foreground">@sld-kit</span> is a toolkit for building single-line
          (electrical) diagrams: a headless document model, layout engine, undo/redo, JSON serialization
          and office-safe SVG export — with a Svelte adapter for live editing.
        </p>
        <div class="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="{base}/showcase"
            class="group inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            Explore the API <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="{base}/sld"
            class="inline-flex items-center gap-2 rounded-md border border-input px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            Open the editor
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 px-2 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Github class="h-4 w-4" /> GitHub
          </a>
        </div>
      </div>

      <!-- Animated single-line diagram motif -->
      <div class="reveal reveal-2 relative">
        <div class="rounded-xl border bg-card/60 p-6 shadow-sm backdrop-blur-sm">
          <div class="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>substation · 400 kV</span><span>svg</span>
          </div>
          <svg viewBox="0 0 320 210" class="w-full" role="img" aria-label="Single-line diagram schematic">
            <!-- bus bars -->
            <line x1="30" y1="40" x2="290" y2="40" class="bar" />
            <line x1="30" y1="170" x2="290" y2="170" class="bar" />
            {#each [80, 160, 240] as x, i}
              <!-- bay chain: top bar → node → node → bottom bar -->
              <line x1={x} y1="40" x2={x} y2="170" class="wire" style="animation-delay:{i * 0.4}s" />
              <rect x={x - 12} y="82" width="24" height="18" rx="3" class="node" />
              <rect x={x - 12} y="112" width="24" height="18" rx="3" class="node" />
              <!-- feeder stub -->
              <line x1={x} y1="40" x2={x} y2="14" class="wire" style="animation-delay:{i * 0.4 + 0.2}s" />
              <circle cx={x} cy="10" r="3" class="terminal" />
            {/each}
            <circle cx="30" cy="40" r="3" class="terminal" />
            <circle cx="290" cy="170" r="3" class="terminal" />
          </svg>
        </div>
      </div>
    </div>
  </section>

  <!-- Examples -->
  <section class="mx-auto max-w-6xl px-6 pb-8">
    <p class="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Examples</p>
    <div class="grid gap-4 md:grid-cols-3">
      <a
        href="{base}/showcase"
        class="reveal group relative flex flex-col rounded-xl border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-md"
      >
        <Code class="mb-4 h-6 w-6 text-primary" />
        <h3 class="text-lg font-semibold">API Showcase</h3>
        <p class="mt-2 flex-1 text-sm text-muted-foreground">
          Edit real builder code and watch the generated JSON and exported SVG update live. Declarative,
          explicit and theming examples.
        </p>
        <span class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
          Open <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </a>

      <a
        href="{base}/sld"
        class="reveal reveal-2 group relative flex flex-col rounded-xl border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-md"
      >
        <PencilRuler class="mb-4 h-6 w-6 text-primary" />
        <h3 class="text-lg font-semibold">Live Editor</h3>
        <p class="mt-2 flex-1 text-sm text-muted-foreground">
          A full editor built on the Svelte adapter: place bays, wire connections, undo/redo, theme and
          export — including composite "diagram of diagrams".
        </p>
        <span class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
          Open <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </a>

      <div class="reveal reveal-3 flex flex-col rounded-xl border border-dashed bg-card/40 p-6">
        <Boxes class="mb-4 h-6 w-6 text-muted-foreground" />
        <h3 class="text-lg font-semibold text-muted-foreground">More soon</h3>
        <p class="mt-2 flex-1 text-sm text-muted-foreground">
          Further examples are on the way — composites, theming galleries and framework adapters beyond
          Svelte.
        </p>
        <span class="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">wip</span>
      </div>
    </div>
  </section>

  <!-- Value props -->
  <section class="mx-auto max-w-6xl px-6 py-16">
    <div class="grid gap-x-10 gap-y-8 sm:grid-cols-2">
      {#each props as p (p.k)}
        <div class="reveal flex gap-4">
          <span class="font-mono text-sm text-primary">{p.k}</span>
          <div>
            <h4 class="font-semibold">{p.title}</h4>
            <p class="mt-1 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <footer class="border-t">
    <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-sm text-muted-foreground">
      <span class="font-mono text-xs">@sld-kit · 2026</span>
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 hover:text-foreground">
        <Github class="h-4 w-4" /> adrisanchu/sld-kit
      </a>
    </div>
  </footer>
</div>

<style>
  /* Blueprint grid backdrop, faint and theme-aware. */
  .schematic {
    background-image:
      linear-gradient(to right, hsl(var(--foreground) / 0.04) 1px, transparent 1px),
      linear-gradient(to bottom, hsl(var(--foreground) / 0.04) 1px, transparent 1px);
    background-size: 28px 28px;
  }

  /* SLD motif strokes use the theme tokens. */
  .bar {
    stroke: hsl(var(--foreground));
    stroke-width: 3;
    stroke-linecap: round;
  }
  .wire {
    stroke: hsl(var(--primary));
    stroke-width: 1.5;
    stroke-dasharray: 5 5;
    animation: flow 1.6s linear infinite;
  }
  .node {
    fill: hsl(var(--card));
    stroke: hsl(var(--foreground) / 0.7);
    stroke-width: 1.5;
  }
  .terminal {
    fill: hsl(var(--primary));
  }

  @keyframes flow {
    to {
      stroke-dashoffset: -20;
    }
  }

  /* Staggered load reveals. */
  .reveal {
    animation: rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .reveal-2 {
    animation-delay: 0.1s;
  }
  .reveal-3 {
    animation-delay: 0.2s;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wire,
    .reveal {
      animation: none;
    }
  }
</style>
