import { SldDocument } from '../SldDocument';
import { LayoutEngine, type DiagramLayout } from '../layout/LayoutEngine';
import { arrowheadPath } from '../layout/geometry';
import type { Rect } from '../layout/geometry';
import { SvgBuilder } from './SvgBuilder';
import { SymbolRegistry } from '../symbols/SymbolRegistry';
import { createDefaultSymbolRegistry } from '../symbols/defaults';
import { SLD_LAYOUT, type SldLayoutConfig } from '../layout';
import { DEFAULT_THEME, positionColors, resolveTheme, type SldTheme } from '../theme';

export interface SvgExportOptions {
  /** Paint an opaque background rect (default true — slides are light). */
  background?: boolean;
  /** Partial theme deep-merged over `DEFAULT_THEME` for this export. */
  theme?: Partial<SldTheme>;
}

/**
 * Renders a document to a standalone SVG string, independent of the live
 * DOM. Constraints for PowerPoint/Office import compatibility:
 *  - presentation attributes only — no <style>, classes, CSS variables or
 *    currentColor;
 *  - arrowheads as explicit filled paths, never <marker>;
 *  - no <foreignObject>; text as plain <text> with a websafe font stack;
 *  - explicit pixel width/height on the root (Office sizes by them).
 *
 * Geometry comes from the same LayoutEngine the live view uses, so the
 * export always matches what is on screen — only the styling pipeline
 * differs (baked colors resolved from the injected `SldTheme`, defaulting to
 * `DEFAULT_THEME`).
 */
export class SvgExporter {
  constructor(
    private engine: LayoutEngine = new LayoutEngine(),
    private symbols: SymbolRegistry = createDefaultSymbolRegistry(),
    private cfg: SldLayoutConfig = SLD_LAYOUT,
    private theme: SldTheme = DEFAULT_THEME
  ) {}

  export(doc: SldDocument, options: SvgExportOptions = {}): string {
    const theme = options.theme ? resolveTheme(options.theme) : this.theme;
    const layout = this.engine.layout(doc);
    const { width, height } = layout.size;
    const b = new SvgBuilder();

    b.open('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width,
      height,
      viewBox: `0 0 ${width} ${height}`
    });

    if (options.background !== false) {
      b.element('rect', { x: 0, y: 0, width, height, fill: theme.structure.background });
    }

    this.renderContent(b, doc, layout, 0, theme);

    b.close();
    return b.toString();
  }

  /**
   * Render a document's body (connections, bars, positions) into an existing
   * builder, WITHOUT the `<svg>` wrapper or background. `export()` calls this
   * between opening the root and closing it; the composite exporter calls it
   * once per child inside a rotated `<g>`, so both paths share one geometry
   * and styling pipeline.
   *
   * `labelAngleDeg` counter-rotates every label about its anchor — the composite
   * passes `-childAngle` so names stay horizontal in the export exactly as on
   * screen. 0 (the default) leaves single-diagram exports untouched.
   *
   * `theme` defaults to this exporter's theme; the composite passes its own so
   * children paint with a single, consistent palette.
   */
  renderContent(
    b: SvgBuilder,
    doc: SldDocument,
    layout: DiagramLayout,
    labelAngleDeg = 0,
    theme: SldTheme = this.theme
  ): void {
    const cfg = this.cfg;

    // Connections first (under bars and boxes).
    for (const conn of doc.connections()) {
      const geo = layout.geometry.get(conn.id);
      if (geo?.kind !== 'connection') continue;

      b.element('polyline', {
        points: geo.points.map((p) => `${p.x},${p.y}`).join(' '),
        fill: 'none',
        stroke: theme.structure.connection,
        'stroke-width': 2
      });

      if (geo.arrow) {
        b.element('path', {
          d: arrowheadPath(geo.arrow.at, geo.arrow.angle, cfg.arrowSize),
          fill: theme.structure.connection
        });
      }

      if (geo.dot) {
        b.element('circle', {
          cx: geo.dot.x,
          cy: geo.dot.y,
          r: cfg.nodeDotRadius,
          fill: theme.structure.connection
        });
      }

      if (geo.symbol) {
        this.renderSymbol(b, geo.symbol.key, geo.symbol.box, theme);
      }

      if (geo.labelAt) {
        const label =
          conn.from.kind === 'external' ? conn.from.label : conn.to.kind === 'external' ? conn.to.label : conn.label;
        if (label) {
          this.emitLabel(
            b,
            {
              x: geo.labelAt.at.x,
              y: geo.labelAt.at.y,
              'text-anchor': geo.labelAt.anchor,
              'font-family': cfg.fontFamily,
              'font-size': cfg.labelFontSize,
              fill: theme.structure.label
            },
            label,
            geo.labelAt.at.x,
            geo.labelAt.at.y,
            labelAngleDeg
          );
        }
      }
    }

    // Bus bars.
    for (const bar of doc.busBars()) {
      const geo = layout.geometry.get(bar.id);
      if (geo?.kind !== 'busbar') continue;
      b.element('rect', {
        x: geo.rect.x,
        y: geo.rect.y,
        width: geo.rect.width,
        height: geo.rect.height,
        fill: theme.structure.busbar
      });
      if (bar.label) {
        this.emitLabel(
          b,
          {
            x: geo.labelAt.x,
            y: geo.labelAt.y,
            'text-anchor': 'start',
            'font-family': cfg.fontFamily,
            'font-size': cfg.busLabelFontSize,
            'font-weight': 'bold',
            fill: theme.structure.label
          },
          bar.label,
          geo.labelAt.x,
          geo.labelAt.y,
          labelAngleDeg
        );
      }
    }

    // Positions on top.
    for (const pos of doc.positions()) {
      const geo = layout.geometry.get(pos.id);
      if (geo?.kind !== 'position') continue;
      const colors = positionColors(theme, pos.type);
      b.element('rect', {
        x: geo.rect.x,
        y: geo.rect.y,
        width: geo.rect.width,
        height: geo.rect.height,
        rx: cfg.positionCornerRadius,
        fill: colors.fill,
        stroke: colors.stroke,
        'stroke-width': 1.5
      });
      if (pos.label) {
        // Shrink long labels a bit instead of overflowing the box.
        const fontSize = pos.label.length > 13 ? cfg.labelFontSize - 2 : cfg.labelFontSize;
        this.emitLabel(
          b,
          {
            x: geo.rect.x + geo.rect.width / 2,
            // Baseline trick for vertical centering — `dominant-baseline`
            // is poorly supported by Office importers.
            y: geo.rect.y + geo.rect.height / 2 + fontSize * 0.35,
            'text-anchor': 'middle',
            'font-family': cfg.fontFamily,
            'font-size': fontSize,
            fill: colors.text
          },
          pos.label,
          geo.rect.x + geo.rect.width / 2,
          geo.rect.y + geo.rect.height / 2,
          labelAngleDeg
        );
      }
    }
  }

  /**
   * Emit a `<text>` label, optionally wrapped in a `<g>` that counter-rotates
   * it about (cx, cy) — used by composites to keep names horizontal under a
   * rotated child. A 0 angle emits the bare text, unchanged.
   */
  private emitLabel(
    b: SvgBuilder,
    attrs: Record<string, string | number | undefined>,
    text: string,
    cx: number,
    cy: number,
    labelAngleDeg: number
  ): void {
    if (labelAngleDeg % 360 === 0) {
      b.textElement('text', attrs, text);
      return;
    }
    b.open('g', { transform: `rotate(${labelAngleDeg} ${cx} ${cy})` });
    b.textElement('text', attrs, text);
    b.close();
  }

  /**
   * Draw a registry glyph scaled into `box`, over an opaque backing rect
   * that masks the connection stem passing underneath.
   */
  private renderSymbol(b: SvgBuilder, key: string, box: Rect, theme: SldTheme): void {
    const def = this.symbols.get(key);
    if (!def) return;
    b.element('rect', {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      fill: theme.structure.background
    });
    const scale = Math.min(box.width / def.size[0], box.height / def.size[1]);
    b.open('g', {
      transform: `translate(${box.x} ${box.y}) scale(${Math.round(scale * 1000) / 1000})`,
      stroke: theme.structure.connection,
      fill: 'none'
    });
    for (const shape of def.shapes) {
      const fill = shape.type !== 'line' && shape.fill === 'token' ? theme.structure.connection : 'none';
      if (shape.type === 'path') {
        b.element('path', { d: shape.d, fill, 'stroke-width': shape.strokeWidth ?? 1.6 });
      } else if (shape.type === 'circle') {
        b.element('circle', { cx: shape.cx, cy: shape.cy, r: shape.r, fill, 'stroke-width': shape.strokeWidth ?? 1.6 });
      } else {
        b.element('line', {
          x1: shape.x1,
          y1: shape.y1,
          x2: shape.x2,
          y2: shape.y2,
          'stroke-width': shape.strokeWidth ?? 1.6
        });
      }
    }
    b.close();
  }
}
