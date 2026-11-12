import { useMemo } from 'react';
import { X } from 'lucide-react';
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

export interface AssetLegendProps {
  tally: AssetLegendTally;
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  tokens?: PositionTokens;
  /** Row label per type; the type string itself is the fallback. */
  typeLabels?: Record<string, string>;
  /**
   * Column order, labels and swatch formats. Tally keys not listed here are
   * appended (labelled by key). With no categories at all — or only the `''`
   * bucket — the card collapses to a single count column.
   */
  categories?: AssetLegendCategory[];
  labels?: Partial<AssetLegendLabels>;
  /** Numeric presentation config; swatches reuse the position box stroke / fill alpha. */
  style?: SldViewStyle;
  onClose?: () => void;
}

const NO_CATEGORIES: AssetLegendCategory[] = [];
const num = 'px-2 py-1 text-right tabular-nums';

/**
 * Position-count card: a type × category cross-tab of a core tally
 * (`tallyComposite` / `tallyPositions`) with row and column totals. Each row's
 * swatch uses the type's colour token and each column's swatch the category's
 * `ElementFormat`, drawn like a position box, so the card doubles as a key.
 *
 * Headless: it only renders the card. The consumer positions it, computes
 * the tally (and so owns what a "category" means) and handles `onClose`.
 */
export function AssetLegend({
  tally,
  tokens = DEFAULT_POSITION_TOKENS,
  typeLabels = DEFAULT_ASSET_LEGEND_TYPE_LABELS,
  categories = NO_CATEGORIES,
  labels,
  style = DEFAULT_VIEW_STYLE,
  onClose
}: AssetLegendProps) {
  const L = useMemo(() => ({ ...DEFAULT_ASSET_LEGEND_LABELS, ...labels }), [labels]);
  const columns = useMemo(
    () => legendColumns(tally, categories, L.uncategorised),
    [tally, categories, L.uncategorised]
  );
  // A lone uncategorised bucket is no axis at all: show one plain count column.
  const crossTab = columns.length > 1 || (columns.length === 1 && columns[0].key !== '');
  const rows = tally.types.filter((t) => countOf(tally.byType, t) > 0);
  const fillAlpha = (fmt?: ElementFormat) => style.position.fillOpacity * (fmt?.fillOpacity ?? 1);

  return (
    <div className="sld-asset-legend flex max-h-full w-max max-w-full flex-col overflow-hidden rounded-lg border border-border bg-background/95 text-xs shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-border py-1 pl-3 pr-1">
        <span className="font-semibold">{L.heading}</span>
        <span className="tabular-nums text-muted-foreground">{tally.total}</span>
        <button
          type="button"
          title={L.close}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => onClose?.()}
        >
          <span className="sr-only">{L.close}</span>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="overflow-auto px-1 py-1">
        {tally.total === 0 ? (
          <p className="px-2 py-1 text-muted-foreground">{L.empty}</p>
        ) : (
          <table className="border-collapse">
            <thead>
              <tr className="text-muted-foreground">
                <th />
                {crossTab &&
                  columns.map((col) => (
                    <th key={col.key} className="px-2 py-1 font-medium">
                      <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        <svg width="16" height="11" className="shrink-0 text-muted-foreground" aria-hidden="true">
                          <rect
                            x="1"
                            y="1"
                            width="14"
                            height="9"
                            rx="2"
                            fill="currentColor"
                            fillOpacity={fillAlpha(col.format)}
                            stroke="currentColor"
                            strokeWidth={col.format?.strokeWidth ?? style.position.strokeWidth}
                            strokeDasharray={col.format?.dashArray}
                          />
                        </svg>
                        {col.label}
                      </span>
                    </th>
                  ))}
                <th className={`${num} font-medium`}>{crossTab ? L.total : L.count}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((type) => (
                <tr key={type} className="border-t border-border/50">
                  <th className="py-1 pl-2 pr-3 text-left font-normal">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      {/* `--sld-pos` is a complete color in this adapter, so alpha
                          rides on fill-opacity (as in PositionView). */}
                      <svg width="16" height="11" className={`shrink-0 ${tokens[type] ?? ''}`} aria-hidden="true">
                        <rect
                          x="1"
                          y="1"
                          width="14"
                          height="9"
                          rx="2"
                          fill="var(--sld-pos)"
                          fillOpacity={fillAlpha()}
                          stroke="var(--sld-pos)"
                          strokeWidth={style.position.strokeWidth}
                        />
                      </svg>
                      {typeLabels[type] ?? type}
                    </span>
                  </th>
                  {crossTab &&
                    columns.map((col) => {
                      const n = countOf(tally.cells[type], col.key);
                      return (
                        <td key={col.key} className={`${num} ${n === 0 ? 'text-muted-foreground/50' : ''}`}>
                          {n === 0 ? '—' : n}
                        </td>
                      );
                    })}
                  <td className={`${num} font-medium`}>{countOf(tally.byType, type)}</td>
                </tr>
              ))}
            </tbody>
            {crossTab && (
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <th className="py-1 pl-2 pr-3 text-left">{L.total}</th>
                  {columns.map((col) => (
                    <td key={col.key} className={num}>
                      {countOf(tally.byCategory, col.key)}
                    </td>
                  ))}
                  <td className={num}>{tally.total}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {tally.unresolved ? (
        <p className="border-t border-border px-3 py-1 text-muted-foreground">{L.unresolved(tally.unresolved)}</p>
      ) : null}
    </div>
  );
}
