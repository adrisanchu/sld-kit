<script lang="ts">
  // "Adapters" section drawn in the page's own SLD vocabulary: @sld-kit/core is
  // the bus bar, each framework adapter is a bay hanging off it through a closed
  // breaker and an energised (animated) feeder. The last bay is an *open*
  // disconnector: no adapter in between, you wire the core in yourself.
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import CopyButton from './CopyButton.svelte';
  import { FRAMEWORK_ICONS, type FrameworkIcon } from './frameworkIcons';
  import { GITHUB_URL } from '$lib/components/layout/navItems';

  const tree = `${GITHUB_URL}/tree/main/packages`;

  interface Bay {
    name: string;
    icon: FrameworkIcon;
    brand: string;
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
      icon: 'react',
      brand: '#61DAFB',
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
      icon: 'svelte',
      brand: '#FF3E00',
      pkg: '@sld-kit/svelte',
      tag: '4',
      features: [
        { text: 'Canvas, editor chrome, composite & flow overlays' },
        { text: 'Grid-level box view — coming', pending: true },
        { text: 'SvelteKit · Tailwind v3 / shadcn-svelte' }
      ],
      install: 'npm i @sld-kit/core @sld-kit/svelte lucide-svelte',
      href: `${tree}/svelte`,
      note: 'Svelte 5 (runes) · Tailwind v4 — coming'
    }
  ];

  // Marks shown on the "any framework" bay: the core is plain TypeScript.
  const elsewhere: { icon: FrameworkIcon; label: string; brand: string }[] = [
    { icon: 'javascript', label: 'Vanilla JS', brand: '#F7DF1E' },
    { icon: 'vue', label: 'Vue', brand: '#4FC08D' },
    { icon: 'solid', label: 'Solid', brand: '#518AC8' },
    { icon: 'angular', label: 'Angular', brand: '#DD0031' }
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
          <div class="flex items-center justify-between gap-3">
            <h3 class="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              <svg viewBox="0 0 24 24" class="mark h-6 w-6" style="--brand:{bay.brand}" aria-hidden="true">
                <path d={FRAMEWORK_ICONS[bay.icon]} />
              </svg>
              {bay.name}
            </h3>
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
            <p class="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">◇ {bay.note}</p>
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

    <!-- Spare bay: an open disconnector, no adapter in between. -->
    <div class="reveal flex flex-col" style="animation-delay:0.3s">
      <svg viewBox="0 0 24 56" class="mx-auto hidden h-14 w-6 md:block" aria-hidden="true">
        <line x1="12" y1="0" x2="12" y2="20" class="idle" />
        <line x1="12" y1="36" x2="12" y2="56" class="idle" />
        <line x1="12" y1="36" x2="21" y2="21" class="blade" />
        <circle cx="12" cy="20" r="1.8" class="pivot" />
      </svg>

      <div class="mt-4 flex flex-1 flex-col rounded-xl border border-dashed p-5 md:mt-0">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-2xl font-semibold tracking-tight">Anywhere else</h3>
          <span class="rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">core</span>
        </div>
        <p class="mt-0.5 font-mono text-xs text-primary">@sld-kit/core</p>
        <p class="mt-4 text-sm leading-relaxed text-muted-foreground">
          Plain TypeScript, zero dependencies. If it runs JavaScript, it can draw a substation.
        </p>

        <ul class="mt-5 grid flex-1 grid-cols-4 content-start gap-2">
          {#each elsewhere as fw (fw.icon)}
            <li class="fw flex flex-col items-center gap-2 rounded-lg py-3" style="--brand:{fw.brand}">
              <svg viewBox="0 0 24 24" class="mark h-7 w-7" aria-hidden="true">
                <path d={FRAMEWORK_ICONS[fw.icon]} />
              </svg>
              <span class="text-center text-[11px] leading-tight text-muted-foreground">{fw.label}</span>
            </li>
          {/each}
        </ul>

        <a
          href="{GITHUB_URL}/tree/main/packages/core#quickstart"
          target="_blank"
          rel="noopener noreferrer"
          class="group mt-4 inline-flex w-fit items-center gap-1 text-sm font-medium text-primary"
        >
          Use the core directly <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>
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
  /* Framework marks in their brand colour; a slight lift on hover. */
  .mark {
    fill: var(--brand);
    transition: transform 0.2s ease;
  }
  .bay:hover .mark,
  .fw:hover .mark {
    transform: scale(1.08);
  }
  .fw {
    transition: background-color 0.2s ease;
  }
  .fw:hover {
    background-color: hsl(var(--foreground) / 0.04);
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
