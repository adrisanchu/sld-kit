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
}

export function createDefaultSymbolRegistry(): SymbolRegistry {
  const registry = new SymbolRegistry();
  registerDefaultSymbols(registry);
  return registry;
}
