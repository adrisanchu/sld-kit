import { SvgBuilder } from '../export/SvgBuilder';
import { SvgExporter } from '../export/SvgExporter';
import { SLD_LAYOUT, type SldLayoutConfig } from '../layout';
import type { Rect } from '../layout/geometry';
import { connectionPath } from '../layout/paths';
import { SymbolRegistry } from '../symbols/SymbolRegistry';
import { createDefaultSymbolRegistry } from '../symbols/defaults';
import { DEFAULT_THEME, firstFormat, resolveTheme, type SldTheme } from '../theme';
import { CompositeDocument } from './CompositeDocument';
import {
  CompositeLayoutEngine,
  linkConnections,
  lineConnections,
  type ChildLayout,
  type CompositeLineLayout,
  type LineGlyph
} from './CompositeLayoutEngine';

export interface CompositeSvgExportOptions {
  /** Paint an opaque background rect (default true — slides are light). */
  background?: boolean;
  /** Partial theme deep-merged over `DEFAULT_THEME` for this export. */
  theme?: Partial<SldTheme>;
  /**
   * Draw every child as a simplified box (name + sub-label) instead of its full
   * internals — the grid-level view. Defaults to the document's `meta.boxMode`.
   */
  boxMode?: boolean;
  /**
   * Box fill per child (e.g. a voltage colour). Keeps the core domain-agnostic —
   * the consumer supplies the colour, mirroring the live view's `childColorClass`.
   * Falls back to the theme background.
   */
  boxFill?: (child: ChildLayout) => string | undefined;
  /** Secondary line under the box name (e.g. an integer bus ID). */
  boxSubLabel?: (child: ChildLayout) => string | null | undefined;
}

/**
 * Renders a composite to a standalone, PowerPoint-safe SVG. Same discipline as
 * `SvgExporter`: presentation attributes only, explicit pixel width/height,
 * arrowheads as paths, no CSS / <use> / <foreignObject>. Each child renders
 * inside a rotated `<g>` via `SvgExporter.renderContent`, so a child looks
 * identical exported and on screen. A rotated `<g>` with plain shapes inside
 * is Office-safe (no nested `<svg>`).
 */
export class CompositeSvgExporter {
  constructor(
    private engine: CompositeLayoutEngine = new CompositeLayoutEngine(),
    private childExporter: SvgExporter = new SvgExporter(),
    private cfg: SldLayoutConfig = SLD_LAYOUT,
    private theme: SldTheme = DEFAULT_THEME,
    private symbols: SymbolRegistry = createDefaultSymbolRegistry()
  ) {}

  export(doc: CompositeDocument, options: CompositeSvgExportOptions = {}): string {
    const theme = options.theme ? resolveTheme(options.theme) : this.theme;
    const boxMode = options.boxMode ?? doc.meta.boxMode ?? false;
    const layout = this.engine.layout(doc);
    const pad = 40;
    const bounds = layout.bounds;
    const hasContent = bounds.width > 0 || bounds.height > 0;
    const width = (hasContent ? bounds.width : 400) + pad * 2;
    const height = (hasContent ? bounds.height : 300) + pad * 2;
    const minX = (hasContent ? bounds.x : 0) - pad;
    const minY = (hasContent ? bounds.y : 0) - pad;

    const b = new SvgBuilder();
    b.open('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width,
      height,
      viewBox: `${minX} ${minY} ${width} ${height}`
    });

    if (options.background !== false) {
      b.element('rect', { x: minX, y: minY, width, height, fill: theme.structure.background });
    }

    // Links first (underneath the children). A commissioning overlay on the
    // shared child connection restyles the whole tie-line (dash / width).
    for (const link of layout.links) {
      const lf = firstFormat(linkConnections(link, layout.children), theme.resolveElementFormat);
      b.element('polyline', {
        points: link.points.map((p) => `${p.x},${p.y}`).join(' '),
        fill: 'none',
        stroke: theme.structure.connection,
        'stroke-width': lf?.strokeWidth ?? 2,
        'stroke-dasharray': lf?.dashArray ?? '6 4'
      });
      for (const p of link.points) {
        b.element('circle', { cx: p.x, cy: p.y, r: this.cfg.nodeDotRadius, fill: theme.structure.connection });
      }
    }

    // Manual lines: the kind drives the stroke style (cable → dashed) and any
    // structural glyph (transformer circles, demand triangle); a commissioning
    // tag on the anchored child connection can still override dash / width.
    for (const line of layout.lines) {
      const lf = firstFormat(lineConnections(line.line, layout.children), theme.resolveElementFormat);
      b.element('path', {
        d: connectionPath(line.points, undefined, this.cfg.hopRadius),
        fill: 'none',
        stroke: theme.structure.connection,
        'stroke-width': lf?.strokeWidth ?? theme.structure.connectionStrokeWidth,
        'stroke-dasharray': lf?.dashArray ?? line.dashArray
      });
      this.renderLineGlyphs(b, line, theme);
    }

    // Each child inside its rigid transform — a box when boxMode, else the full
    // internals (or a placeholder when unresolved).
    for (const child of layout.children) {
      b.open('g', { transform: child.transform.toSvgTransform() });
      if (boxMode && child.layout && child.instance.resolved) {
        this.renderBox(b, child, theme, options);
      } else if (child.layout && child.instance.resolved) {
        // {0,180} label flip, exactly like the view (see CompositeLayoutEngine).
        this.childExporter.renderContent(b, child.instance.resolved, child.layout, child.labelAngleDeg, theme);
        this.renderNameLabel(b, child, theme);
      } else {
        this.renderPlaceholder(b, child, theme);
        this.renderNameLabel(b, child, theme);
      }
      b.close();
    }

    b.close();
    return b.toString();
  }

  /**
   * Always-on diagram name at its chosen slot, larger and bold so it stands out
   * from the element labels. Rides with the child's orientation plus the label's
   * own `rotation` (direction + {0,180} readability flip). Independent of the
   * labels-visibility toggle. Office-safe: plain `<text>`, presentation
   * attributes only.
   */
  private renderNameLabel(b: SvgBuilder, child: ChildLayout, theme: SldTheme): void {
    const { x, y, textAnchor, rotation, fontSize } = child.nameLabel;
    const attrs = {
      x,
      y,
      'text-anchor': textAnchor,
      'font-family': this.cfg.fontFamily,
      'font-size': fontSize,
      'font-weight': 700,
      fill: theme.structure.label
    };
    if (rotation % 360 === 0) {
      b.textElement('text', attrs, child.name);
      return;
    }
    b.open('g', { transform: `rotate(${rotation} ${x} ${y})` });
    b.textElement('text', attrs, child.name);
    b.close();
  }

  /** Draw the kind glyphs a decorated line carries (transformer / demand). */
  private renderLineGlyphs(b: SvgBuilder, line: CompositeLineLayout, theme: SldTheme): void {
    if (line.glyph) this.renderGlyph(b, line.glyph, theme);
    if (line.terminus) this.renderGlyph(b, line.terminus, theme);
  }

  /**
   * Draw a registry glyph centred on `glyph.at`, sized to `symbolSize`, upright
   * (orientation is available in the layout for future polish). Same office-safe
   * shape emission as `SvgExporter.renderSymbol`: plain circles/paths/lines over
   * an opaque backing rect that masks the line passing underneath.
   */
  private renderGlyph(b: SvgBuilder, glyph: LineGlyph, theme: SldTheme): void {
    const def = this.symbols.get(glyph.key);
    if (!def) return;
    const s = this.cfg.symbolSize;
    const box: Rect = { x: glyph.at.x - s / 2, y: glyph.at.y - s / 2, width: s, height: s };
    b.element('rect', { x: box.x, y: box.y, width: box.width, height: box.height, fill: theme.structure.background });
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
        b.element('line', { x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2, 'stroke-width': shape.strokeWidth ?? 1.6 });
      }
    }
    b.close();
  }

  /**
   * A child as a simplified box: a rounded rect over the child frame filled with
   * the consumer's colour (or the theme background), the diagram name centred and
   * bold, and an optional sub-label (e.g. a bus ID) beneath it.
   */
  private renderBox(b: SvgBuilder, child: ChildLayout, theme: SldTheme, options: CompositeSvgExportOptions): void {
    const { frame } = child;
    const cx = frame.x + frame.width / 2;
    const cy = frame.y + frame.height / 2;
    const sub = options.boxSubLabel?.(child);
    b.element('rect', {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      rx: 8,
      fill: options.boxFill?.(child) ?? theme.structure.background,
      stroke: theme.structure.label,
      'stroke-width': 2
    });
    b.textElement(
      'text',
      {
        x: cx,
        y: sub ? cy - 2 : cy + this.cfg.busLabelFontSize * 0.35,
        'text-anchor': 'middle',
        'font-family': this.cfg.fontFamily,
        'font-size': this.cfg.busLabelFontSize,
        'font-weight': 700,
        fill: theme.structure.label
      },
      child.name
    );
    if (sub) {
      b.textElement(
        'text',
        {
          x: cx,
          y: cy + this.cfg.labelFontSize + 2,
          'text-anchor': 'middle',
          'font-family': this.cfg.fontFamily,
          'font-size': this.cfg.labelFontSize,
          fill: theme.structure.label
        },
        sub
      );
    }
  }

  private renderPlaceholder(b: SvgBuilder, child: ChildLayout, theme: SldTheme): void {
    const { frame } = child;
    b.element('rect', {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      rx: 8,
      fill: 'none',
      stroke: theme.structure.label,
      'stroke-width': 2,
      'stroke-dasharray': '8 6'
    });
    b.textElement(
      'text',
      {
        x: frame.x + frame.width / 2,
        y: frame.y + frame.height / 2,
        'text-anchor': 'middle',
        'font-family': this.cfg.fontFamily,
        'font-size': this.cfg.labelFontSize,
        fill: theme.structure.label
      },
      `Diagram not found: ${child.instance.libraryId}`
    );
  }
}
