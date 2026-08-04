import { describe, it, expect } from 'vitest';
import { SvgExporter, DEFAULT_THEME, type SldElement } from '../src';
import { buildSouth400 } from './fixtures';

describe('SvgExporter (default theme)', () => {
  const svg = new SvgExporter().export(buildSouth400());

  it('matches the locked snapshot', () => {
    expect(svg).toMatchSnapshot();
  });

  it('satisfies the PowerPoint/Office constraints', () => {
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('<marker');
    expect(svg).not.toContain('<foreignObject');
    expect(svg).not.toContain('<style');
    expect(svg).not.toContain('var(--');
    expect(svg).not.toContain('currentColor');
    // Root has explicit pixel width/height (Office sizes by them).
    expect(svg).toMatch(/<svg[^>]*\bwidth="\d/);
    expect(svg).toMatch(/<svg[^>]*\bheight="\d/);
  });

  it('bakes the default line color into position boxes', () => {
    expect(svg).toContain(DEFAULT_THEME.positionTypes.line.fill);
  });
});

describe('theme injection', () => {
  it('overrides a position color without touching the others', () => {
    const doc = buildSouth400();
    const svg = new SvgExporter().export(doc, {
      theme: { positionTypes: { line: { fill: '#ff0000', stroke: '#000000', text: '#ffffff' } } }
    });
    expect(svg).toContain('#ff0000');
    // Non-overridden types keep their defaults (deep merge).
    expect(svg).toContain(DEFAULT_THEME.positionTypes.transformer.fill);
  });

  it('renders an unknown position type with the fallback palette', () => {
    const doc = buildSouth400();
    // Retype one position to a domain-specific bay type.
    doc.positions()[0].type = 'coupling';
    const svg = new SvgExporter().export(doc);
    expect(svg).toContain(DEFAULT_THEME.fallbackPositionType.fill);
  });

  it('omits the background rect when background: false', () => {
    const doc = buildSouth400();
    const withBg = new SvgExporter().export(doc);
    const noBg = new SvgExporter().export(doc, { background: false });
    expect(noBg.length).toBeLessThan(withBg.length);
  });
});

describe('resolveElementFormat overlay (generic, no domain knowledge in core)', () => {
  // The consumer owns the policy: it reads some (to core, opaque) `data` key and
  // returns a generic ElementFormat. `mark` is an arbitrary consumer flag — core
  // never inspects `data`, it only applies whatever resolver it is handed.
  const markFmt = { strokeWidth: 3, fillOpacity: 0.4, dashArray: '6 3' };
  const byMark = (el: SldElement) =>
    (el.data as { mark?: boolean } | undefined)?.mark ? markFmt : undefined;

  it('leaves untagged elements untouched (default output unchanged)', () => {
    const doc = buildSouth400();
    const plain = new SvgExporter().export(doc);
    const themed = new SvgExporter().export(doc, { theme: { resolveElementFormat: byMark } });
    // No element matches the resolver, so the overlay is a no-op.
    expect(themed).toBe(plain);
  });

  it('emits stroke-width, fill-opacity and dash for a matched position', () => {
    const doc = buildSouth400();
    doc.positions()[0].data = { mark: true };
    const svg = new SvgExporter().export(doc, { theme: { resolveElementFormat: byMark } });
    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain('fill-opacity="0.4"');
    expect(svg).toContain('stroke-dasharray="6 3"');
  });

  it('stays Office-safe (all overlay fields are presentation attributes)', () => {
    const doc = buildSouth400();
    doc.positions()[0].data = { mark: true };
    const svg = new SvgExporter().export(doc, { theme: { resolveElementFormat: byMark } });
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('<style');
    expect(svg).not.toContain('var(--');
  });
});
