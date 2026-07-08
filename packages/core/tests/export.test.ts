import { describe, it, expect } from 'vitest';
import { SvgExporter, DEFAULT_THEME } from '../src';
import { buildExampleHv } from './fixtures';

describe('SvgExporter (default theme)', () => {
  const svg = new SvgExporter().export(buildExampleHv());

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
    const doc = buildExampleHv();
    const svg = new SvgExporter().export(doc, {
      theme: { positionTypes: { line: { fill: '#ff0000', stroke: '#000000', text: '#ffffff' } } }
    });
    expect(svg).toContain('#ff0000');
    // Non-overridden types keep their defaults (deep merge).
    expect(svg).toContain(DEFAULT_THEME.positionTypes.transformer.fill);
  });

  it('renders an unknown position type with the fallback palette', () => {
    const doc = buildExampleHv();
    // Retype one position to a domain-specific bay type.
    doc.positions()[0].type = 'coupling';
    const svg = new SvgExporter().export(doc);
    expect(svg).toContain(DEFAULT_THEME.fallbackPositionType.fill);
  });

  it('omits the background rect when background: false', () => {
    const doc = buildExampleHv();
    const withBg = new SvgExporter().export(doc);
    const noBg = new SvgExporter().export(doc, { background: false });
    expect(noBg.length).toBeLessThan(withBg.length);
  });
});
