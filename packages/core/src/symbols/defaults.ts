import { SymbolRegistry } from './SymbolRegistry';

/**
 * v0 glyphs for external asset endpoints, drawn in a 24×24 box.
 * Deliberately simplified (not strict IEC 60617) — the target is a clean,
 * PowerPoint-friendly schematic look.
 */
export function registerDefaultSymbols(registry: SymbolRegistry): void {
  // Transformer: two overlapping circles (IEC-style two-winding transformer).
  registry.register('external:transformer', {
    size: [24, 24],
    shapes: [
      { type: 'circle', cx: 12, cy: 8.5, r: 6, fill: 'none', strokeWidth: 1.6 },
      { type: 'circle', cx: 12, cy: 15.5, r: 6, fill: 'none', strokeWidth: 1.6 }
    ]
  });

  // Three-winding transformer: three overlapping circles. Top and bottom sit on
  // the stem axis (the main line passes through, as on the two-winding glyph);
  // the side circle is the third winding, whose branch leaves from its right
  // edge (see `TRANSFORMER3W_BRANCH_ANCHOR`).
  registry.register('external:transformer3w', {
    size: [24, 24],
    shapes: [
      { type: 'circle', cx: 12, cy: 7, r: 5.5, fill: 'none', strokeWidth: 1.6 },
      { type: 'circle', cx: 12, cy: 17, r: 5.5, fill: 'none', strokeWidth: 1.6 },
      { type: 'circle', cx: 17.4, cy: 12, r: 5.5, fill: 'none', strokeWidth: 1.6 }
    ]
  });

  // Renewable: circle with a sine wave (generator-like).
  registry.register('external:renewable', {
    size: [24, 24],
    shapes: [
      { type: 'circle', cx: 12, cy: 12, r: 9, fill: 'none', strokeWidth: 1.6 },
      { type: 'path', d: 'M 6.5 12 C 8.5 8, 10.5 8, 12 12 C 13.5 16, 15.5 16, 17.5 12', fill: 'none', strokeWidth: 1.6 }
    ]
  });

  // Storage: battery — body outline + positive terminal stub.
  registry.register('external:storage', {
    size: [24, 24],
    shapes: [
      { type: 'path', d: 'M 5 8 H 19 V 19 H 5 Z', fill: 'none', strokeWidth: 1.6 },
      { type: 'line', x1: 9.5, y1: 8, x2: 9.5, y2: 5, strokeWidth: 1.6 },
      { type: 'line', x1: 14.5, y1: 8, x2: 14.5, y2: 5, strokeWidth: 1.6 },
      { type: 'line', x1: 8, y1: 12, x2: 16, y2: 12, strokeWidth: 1.2 }
    ]
  });

  // Demand: filled downward triangle (load).
  registry.register('external:demand', {
    size: [24, 24],
    shapes: [{ type: 'path', d: 'M 6.5 7 H 17.5 L 12 17.5 Z', fill: 'token', strokeWidth: 1.4 }]
  });

  // Reactor: inductor coil — four humps along the stem axis (shunt reactor).
  registry.register('external:reactor', {
    size: [24, 24],
    shapes: [
      {
        type: 'path',
        d:
          'M 12 2.5 C 17 2.5, 17 7.25, 12 7.25 C 17 7.25, 17 12, 12 12 ' +
          'C 17 12, 17 16.75, 12 16.75 C 17 16.75, 17 21.5, 12 21.5',
        fill: 'none',
        strokeWidth: 1.6
      }
    ]
  });

  // Synchronous machine: circle with the letters "SM", stroked as paths so the
  // glyph stays shapes-only (no text, same renderers as every other symbol).
  registry.register('external:machine', {
    size: [24, 24],
    shapes: [
      { type: 'circle', cx: 12, cy: 12, r: 9.5, fill: 'none', strokeWidth: 1.6 },
      {
        type: 'path',
        d:
          'M 10.4 9.6 C 10 8.8, 9.2 8.6, 8.6 8.6 C 7.6 8.6, 7 9.2, 7 10 ' +
          'C 7 11.9, 10.5 11.3, 10.5 13.6 C 10.5 14.6, 9.7 15.4, 8.6 15.4 C 7.8 15.4, 7.1 15, 6.8 14.2',
        fill: 'none',
        strokeWidth: 1.3
      },
      { type: 'path', d: 'M 12.4 15.4 V 8.6 L 14.9 13.2 L 17.4 8.6 V 15.4', fill: 'none', strokeWidth: 1.3 }
    ]
  });
}

/**
 * Where a three-winding transformer's branch leaves its glyph, in the glyph's
 * own 24×24 units: the side circle's right edge (up/down feeders) or the bottom
 * circle's bottom edge (left/right feeders). The layout scales it to the glyph box.
 */
export const TRANSFORMER3W_BRANCH_ANCHOR = {
  size: 24,
  side: { x: 22.9, y: 12 },
  bottom: { x: 12, y: 22.5 }
} as const;

export function createDefaultSymbolRegistry(): SymbolRegistry {
  const registry = new SymbolRegistry();
  registerDefaultSymbols(registry);
  return registry;
}
