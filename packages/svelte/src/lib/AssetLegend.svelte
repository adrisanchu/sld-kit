<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import X from 'lucide-svelte/icons/x';
  import type { ElementFormat } from '@sld-kit/core';
  import {
    DEFAULT_POSITION_TOKENS,
    DEFAULT_ASSET_LEGEND_LABELS,
    DEFAULT_ASSET_LEGEND_TYPE_LABELS,
    type PositionTokens,
    type AssetLegendLabels
  } from './labels';
  import { DEFAULT_VIEW_STYLE, type SldViewStyle } from './style';
  import { countOf, legendColumns, type AssetLegendCategory, type AssetLegendTally } from './legend';

  /**
   * Position-count card: a type × category cross-tab of a core tally
   * (`tallyComposite` / `tallyPositions`) with row and column totals. Each row's
   * swatch uses the type's colour token and each column's swatch the category's
   * `ElementFormat`, drawn like a position box, so the card doubles as a key.
   *
   * Headless: it only renders the card. The consumer positions it, computes
   * the tally (and so owns what a "category" means) and handles `close`.
   */
  export let tally: AssetLegendTally;
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  export let tokens: PositionTokens = DEFAULT_POSITION_TOKENS;
  /** Row label per type; the type string itself is the fallback. */
  export let typeLabels: Record<string, string> = DEFAULT_ASSET_LEGEND_TYPE_LABELS;
  /**
   * Column order, labels and swatch formats. Tally keys not listed here are
   * appended (labelled by key). With no categories at all — or only the `''`
   * bucket — the card collapses to a single count column.
   */
  export let categories: AssetLegendCategory[] = [];
  export let labels: Partial<AssetLegendLabels> = {};
  /** Numeric presentation config; swatches reuse the position box stroke / fill alpha. */
  export let style: SldViewStyle = DEFAULT_VIEW_STYLE;

  $: L = { ...DEFAULT_ASSET_LEGEND_LABELS, ...labels };

  const dispatch = createEventDispatcher<{ close: void }>();

  $: columns = legendColumns(tally, categories, L.uncategorised);
  // A lone uncategorised bucket is no axis at all: show one plain count column.
  $: crossTab = columns.length > 1 || (columns.length === 1 && columns[0].key !== '');
  $: rows = tally.types.filter((t) => countOf(tally.byType, t) > 0);

  const cell = (type: string, key: string) => countOf(tally.cells[type], key);
  const fillAlpha = (fmt?: ElementFormat) => style.position.fillOpacity * (fmt?.fillOpacity ?? 1);

  const num = 'px-2 py-1 text-right tabular-nums';
</script>

<div
  class="sld-asset-legend flex max-h-full w-max max-w-full flex-col overflow-hidden rounded-lg border border-border bg-background/95 text-xs shadow-lg backdrop-blur-sm"
>
  <div class="flex items-center gap-2 border-b border-border py-1 pl-3 pr-1">
    <span class="font-semibold">{L.heading}</span>
    <span class="tabular-nums text-muted-foreground">{tally.total}</span>
    <button
      title={L.close}
      class="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      on:click={() => dispatch('close')}
    >
      <span class="sr-only">{L.close}</span>
      <X class="h-3.5 w-3.5" />
    </button>
  </div>

  <div class="overflow-auto px-1 py-1">
    {#if tally.total === 0}
      <p class="px-2 py-1 text-muted-foreground">{L.empty}</p>
    {:else}
      <table class="border-collapse">
        <thead>
          <tr class="text-muted-foreground">
            <th />
            {#if crossTab}
              {#each columns as col (col.key)}
                <th class="px-2 py-1 font-medium">
                  <span class="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    <svg width="16" height="11" class="shrink-0 text-muted-foreground" aria-hidden="true">
                      <rect
                        x="1"
                        y="1"
                        width="14"
                        height="9"
                        rx="2"
                        fill="currentColor"
                        fill-opacity={fillAlpha(col.format)}
                        stroke="currentColor"
                        stroke-width={col.format?.strokeWidth ?? style.position.strokeWidth}
                        stroke-dasharray={col.format?.dashArray}
                      />
                    </svg>
                    {col.label}
                  </span>
                </th>
              {/each}
            {/if}
            <th class="{num} font-medium">{crossTab ? L.total : L.count}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as type (type)}
            <tr class="border-t border-border/50">
              <th class="py-1 pl-2 pr-3 text-left font-normal">
                <span class="flex items-center gap-1.5 whitespace-nowrap">
                  <svg width="16" height="11" class="shrink-0 {tokens[type] ?? ''}" aria-hidden="true">
                    <rect
                      x="1"
                      y="1"
                      width="14"
                      height="9"
                      rx="2"
                      style="fill: hsl(var(--sld-pos) / {fillAlpha()}); stroke: hsl(var(--sld-pos));"
                      stroke-width={style.position.strokeWidth}
                    />
                  </svg>
                  {typeLabels[type] ?? type}
                </span>
              </th>
              {#if crossTab}
                {#each columns as col (col.key)}
                  {@const n = cell(type, col.key)}
                  <td class="{num} {n === 0 ? 'text-muted-foreground/50' : ''}">{n === 0 ? '—' : n}</td>
                {/each}
              {/if}
              <td class="{num} font-medium">{countOf(tally.byType, type)}</td>
            </tr>
          {/each}
        </tbody>
        {#if crossTab}
          <tfoot>
            <tr class="border-t border-border font-medium">
              <th class="py-1 pl-2 pr-3 text-left">{L.total}</th>
              {#each columns as col (col.key)}
                <td class={num}>{countOf(tally.byCategory, col.key)}</td>
              {/each}
              <td class={num}>{tally.total}</td>
            </tr>
          </tfoot>
        {/if}
      </table>
    {/if}
  </div>

  {#if tally.unresolved}
    <p class="border-t border-border px-3 py-1 text-muted-foreground">{L.unresolved(tally.unresolved)}</p>
  {/if}
</div>
