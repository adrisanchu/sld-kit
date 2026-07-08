import { SvgBuilder } from '../export/SvgBuilder';
import { SvgExporter } from '../export/SvgExporter';
import { SLD_LAYOUT, type SldLayoutConfig } from '../layout';
import { DEFAULT_THEME, resolveTheme, type SldTheme } from '../theme';
import { CompositeDocument } from './CompositeDocument';
import { CompositeLayoutEngine, type ChildLayout } from './CompositeLayoutEngine';

export interface CompositeSvgExportOptions {
  /** Paint an opaque background rect (default true — slides are light). */
  background?: boolean;
  /** Partial theme deep-merged over `DEFAULT_THEME` for this export. */
  theme?: Partial<SldTheme>;
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
    private theme: SldTheme = DEFAULT_THEME
  ) {}

  export(doc: CompositeDocument, options: CompositeSvgExportOptions = {}): string {
    const theme = options.theme ? resolveTheme(options.theme) : this.theme;
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

    // Links first (underneath the children).
    for (const link of layout.links) {
      b.element('polyline', {
        points: link.points.map((p) => `${p.x},${p.y}`).join(' '),
        fill: 'none',
        stroke: theme.structure.connection,
        'stroke-width': 2,
        'stroke-dasharray': '6 4'
      });
      for (const p of link.points) {
        b.element('circle', { cx: p.x, cy: p.y, r: this.cfg.nodeDotRadius, fill: theme.structure.connection });
      }
    }

    // Each child inside its rigid transform.
    for (const child of layout.children) {
      b.open('g', { transform: child.transform.toSvgTransform() });
      if (child.layout && child.instance.resolved) {
        // {0,180} label flip, exactly like the view (see CompositeLayoutEngine).
        this.childExporter.renderContent(b, child.instance.resolved, child.layout, child.labelAngleDeg, theme);
      } else {
        this.renderPlaceholder(b, child, theme);
      }
      b.close();
    }

    b.close();
    return b.toString();
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
