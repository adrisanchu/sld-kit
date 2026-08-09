<script lang="ts">
  // Landing page — explains the project and routes to the two examples.
  // Aesthetic: engineering blueprint — schematic grid, monospace labels, an
  // animated single-line diagram motif, staggered load reveals.
  import { base } from '$app/paths';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Code from 'lucide-svelte/icons/code-xml';
  import PencilRuler from 'lucide-svelte/icons/pencil-ruler';
  import Zap from 'lucide-svelte/icons/zap';
  import Github from 'lucide-svelte/icons/github';
  import { GITHUB_URL } from '$lib/components/layout/navItems';
  import InstallBox from '$lib/components/landing/InstallBox.svelte';
  import OpenInCodePen from '$lib/components/landing/OpenInCodePen.svelte';
  import CodeBlock from '$lib/components/showcase/CodeBlock.svelte';
  // Single-sourced from the runnable Node example so the two never drift.
  import quickstart from '../../../node/index.ts?raw';

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
          <svg viewBox="0 0 320 228" class="w-full" role="img" aria-label="Single-line diagram schematic">
            <!-- bus bars -->
            <line x1="30" y1="62" x2="290" y2="62" class="bar" />
            <line x1="30" y1="178" x2="290" y2="178" class="bar" />

            <!-- bays: vertical wire + two central nodes -->
            {#each [80, 160, 240] as x, i}
              <line x1={x} y1={i % 2 != 0 ? "62" : "178"} x2={x} y2={i % 2 == 0  ? "62" : "178"} class="wire" style="animation-delay:{i * 0.4}s" />
              <rect x={x - 12} y="90" width="24" height="18" rx="3" class="node" />
              <rect x={x - 12} y="128" width="24" height="18" rx="3" class="node" />
            {/each}

            <!-- Feeder ends (the app's external symbols): 2 lines leaving, a
                 generator and a storage replacing dots, plus two plain terminals. -->

            <!-- top-left · line leaving upward (tip aligned with the top symbols) -->
            <line x1="80" y1="62" x2="80" y2="31" class="wire" style="animation-delay:.6s" />
            <path d="M 80 17 L 74.5 31 L 85.5 31 Z" class="glyph-fill" />

            <!-- top-mid · generator (renewable: circle + sine) -->
            <line x1="160" y1="36" x2="160" y2="62" class="wire" style="animation-delay:.8s" />
            <g transform="translate(148 14)" class="glyph">
              <circle cx="12" cy="12" r="9" />
              <path d="M 6.5 12 C 8.5 8, 10.5 8, 12 12 C 13.5 16, 15.5 16, 17.5 12" />
            </g>

            <!-- top-right · storage (battery) -->
            <line x1="240" y1="62" x2="240" y2="33" class="wire" style="animation-delay:1s" />
            <g transform="translate(228 13)" class="glyph">
              <path d="M 5 8 H 19 V 19 H 5 Z" />
              <line x1="9.5" y1="8" x2="9.5" y2="5" />
              <line x1="14.5" y1="8" x2="14.5" y2="5" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </g>

            <!-- bottom-left · terminal -->
            <line x1="80" y1="178" x2="80" y2="206" class="wire" style="animation-delay:.7s" />
            <circle cx="80" cy="210" r="3.5" class="terminal" />

            <!-- bottom-mid · line leaving downward (tip aligned with the terminals) -->
            <line x1="160" y1="178" x2="160" y2="206" class="wire" style="animation-delay:.9s" />
            <path d="M 160 218 L 154.5 206 L 165.5 206 Z" class="glyph-fill" />

            <!-- bottom-right · terminal -->
            <line x1="240" y1="178" x2="240" y2="206" class="wire" style="animation-delay:1.1s" />
            <circle cx="240" cy="210" r="3.5" class="terminal" />
          </svg>
        </div>
      </div>
    </div>
  </section>

  <!-- Install & Quickstart -->
  <section class="mx-auto max-w-6xl px-6 pb-8">
    <p class="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Install</p>
    <div class="grid items-start gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <div class="reveal">
        <InstallBox />
        <p class="mt-4 text-sm leading-relaxed text-muted-foreground">
          Zero-dependency ESM core · Node ≥ 20. The snippet builds a diagram and exports an
          office-safe SVG — no browser or framework required.
        </p>
        <div class="mt-5 flex flex-wrap items-center gap-3">
          <OpenInCodePen />
          <a
            href="{base}/showcase"
            class="group inline-flex items-center gap-2 px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Or edit it live <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>

      <!-- min-w-0 lets the grid track shrink below its content width so the code
           block scrolls horizontally instead of overflowing the viewport. -->
      <div class="reveal reveal-2 min-w-0">
        <div class="overflow-hidden rounded-xl border bg-card/60 p-1 shadow-sm backdrop-blur-sm">
          <div class="flex items-center justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>quickstart · index.ts</span><span>@sld-kit/core</span>
          </div>
          <div class="h-[22rem] min-w-0">
            <CodeBlock lang="typescript" text={quickstart} />
          </div>
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

      <a
        href="{base}/power-flow"
        class="reveal reveal-3 group relative flex flex-col rounded-xl border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-md"
      >
        <Zap class="mb-4 h-6 w-6 text-primary" />
        <h3 class="text-lg font-semibold">Power flow</h3>
        <p class="mt-2 flex-1 text-sm text-muted-foreground">
          Operate a read-only grid: fly into a substation, open/close line switches, and watch the flow
          animate and re-route — generic interaction + animation primitives driven by the opaque data channel.
        </p>
        <span class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
          Open <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </a>
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
  /* External equipment glyphs (generator, storage) — outlined like the app's. */
  .glyph {
    fill: none;
    stroke: hsl(var(--foreground) / 0.75);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* Filled arrowheads on lines leaving the substation. */
  .glyph-fill {
    fill: hsl(var(--primary));
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
