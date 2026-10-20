<script lang="ts">
  // "Adapters" section drawn in the page's own SLD vocabulary: @sld-kit/core is
  // the bus bar, each framework adapter is a bay hanging off it through a closed
  // breaker and an energised (animated) feeder. The last bay is an *open*
  // disconnector — a slot for the next adapter, not yet connected.
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import CopyButton from './CopyButton.svelte';
  import { GITHUB_URL } from '$lib/components/layout/navItems';

  const tree = `${GITHUB_URL}/tree/main/packages`;

  interface Bay {
    name: string;
    pkg: string;
    tag: string;
    features: { text: string; pending?: boolean; accent?: boolean }[];
    install: string;
    href: string;
    note?: string;
  }

  const bays: Bay[] = [
    {
      name: 'React',
      pkg: '@sld-kit/react',
      tag: '18 · 19',
      features: [
        { text: 'Canvas, editor chrome, composite & flow overlays' },
        { text: 'Grid-level box view', accent: true },
        { text: '"use client" · Tailwind v4 / shadcn' }
      ],
      install: 'npm i @sld-kit/core @sld-kit/react lucide-react',
      href: `${tree}/react`
    },
    {
      name: 'Svelte',
      pkg: '@sld-kit/svelte',
      tag: '4',
      features: [
        { text: 'Canvas, editor chrome, composite & flow overlays' },
        { text: 'Grid-level box view — coming', pending: true },
        { text: 'SvelteKit · Tailwind v3 / shadcn-svelte' }
      ],
      install: 'npm i @sld-kit/core @sld-kit/svelte lucide-svelte',
      href: `${tree}/svelte`,
      note: 'This site runs on it'
    }
  ];
</script>

<div class="bus">
  <!-- The bus bar: the shared engine every adapter connects to. -->
  <div class="relative flex items-center">
    <span
      class="relative z-10 rounded-md border border-foreground/80 bg-background px-2.5 py-1 font-mono text-xs font-medium"
    >
      @sld-kit/core
    </span>
    <span class="bar-line h-[3px] flex-1 rounded-full bg-foreground" aria-hidden="true"></span>
    <span
      class="relative z-10 hidden bg-background pl-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:inline"
    >
      zero deps · esm · node ≥ 20
    </span>
  </div>

  <div class="grid gap-4 md:grid-cols-3 md:gap-6">
    {#each bays as bay, i (bay.pkg)}
      <div class="reveal flex flex-col" style="animation-delay:{0.1 * (i + 1)}s">
        <!-- Feeder: energised wire with a closed breaker. -->
        <svg viewBox="0 0 24 56" class="mx-auto hidden h-14 w-6 md:block" aria-hidden="true">
          <line x1="12" y1="0" x2="12" y2="56" class="feed" style="animation-delay:{i * 0.35}s" />
          <rect x="6" y="22" width="12" height="12" rx="2" class="breaker" />
        </svg>

        <div
          class="bay mt-4 flex flex-1 flex-col rounded-xl border bg-card p-5 transition-all hover:border-primary/50 md:mt-0"
        >
          <div class="flex items-baseline justify-between gap-3">
            <h3 class="text-2xl font-semibold tracking-tight">{bay.name}</h3>
            <span class="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{bay.tag}</span>
          </div>
          <p class="mt-0.5 font-mono text-xs text-primary">{bay.pkg}</p>

          <ul class="mt-4 flex-1 space-y-1.5 text-sm">
            {#each bay.features as f (f.text)}
              <li class="flex gap-2 {f.pending ? 'text-muted-foreground/70' : 'text-muted-foreground'}">
                <span class="mt-[7px] h-1.5 w-1.5 shrink-0 rotate-45 {f.pending ? 'border border-muted-foreground/60' : 'bg-primary'}"></span>
                <span class={f.accent ? 'font-medium text-foreground' : ''}>{f.text}</span>
              </li>
            {/each}
          </ul>

          {#if bay.note}
            <p class="mt-3 font-mono text-[10px] uppercase tracking-widest text-primary/80">◆ {bay.note}</p>
          {/if}

          <div class="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 py-1.5 pl-3 pr-1.5">
            <code class="min-w-0 flex-1 break-words font-mono text-xs leading-relaxed">{bay.install}</code>
            <CopyButton text={bay.install} label={`Copy ${bay.name} install command`} />
          </div>

          <a
            href={bay.href}
            target="_blank"
            rel="noopener noreferrer"
            class="group mt-4 inline-flex w-fit items-center gap-1 text-sm font-medium text-primary"
          >
            README <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    {/each}

    <!-- Spare bay: an open disconnector — the next adapter isn't wired in yet. -->
    <div class="reveal flex flex-col" style="animation-delay:0.3s">
      <svg viewBox="0 0 24 56" class="mx-auto hidden h-14 w-6 md:block" aria-hidden="true">
        <line x1="12" y1="0" x2="12" y2="20" class="idle" />
        <line x1="12" y1="36" x2="12" y2="56" class="idle" />
        <line x1="12" y1="36" x2="21" y2="21" class="blade" />
        <circle cx="12" cy="20" r="1.8" class="pivot" />
      </svg>

      <a
        href="{GITHUB_URL}/blob/main/packages/README.md#porting-an-adapter"
        target="_blank"
        rel="noopener noreferrer"
        class="group mt-4 flex flex-1 flex-col rounded-xl border border-dashed p-5 transition-colors hover:border-primary/50 hover:bg-card/60 md:mt-0"
      >
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="text-2xl font-semibold tracking-tight text-muted-foreground">Your framework</h3>
          <span class="rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">open</span>
        </div>
        <p class="mt-0.5 font-mono text-xs text-muted-foreground">@sld-kit/…</p>
        <p class="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
          Vue, Svelte 5, Solid… The engine is framework-agnostic, and the porting contract is written down — the React
          adapter was ported 1:1 from it.
        </p>
        <span class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
          Porting guide <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </a>
    </div>
  </div>
</div>

<style>
  .feed {
    stroke: hsl(var(--primary));
    stroke-width: 1.5;
    stroke-dasharray: 5 5;
    animation: flow 1.6s linear infinite;
  }
  .breaker {
    fill: hsl(var(--primary));
    stroke: hsl(var(--background));
    stroke-width: 1.5;
  }
  .idle,
  .blade {
    stroke: hsl(var(--muted-foreground) / 0.6);
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .idle {
    stroke-dasharray: 3 4;
  }
  .pivot {
    fill: hsl(var(--muted-foreground) / 0.8);
  }
  /* The bay a pointer is on draws a little more current. */
  .bay:hover {
    box-shadow: 0 -2px 0 hsl(var(--primary)) inset, 0 4px 16px hsl(var(--foreground) / 0.06);
  }

  @keyframes flow {
    to {
      stroke-dashoffset: -20;
    }
  }

  .reveal {
    animation: rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
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
    .feed,
    .reveal {
      animation: none;
    }
  }
</style>
