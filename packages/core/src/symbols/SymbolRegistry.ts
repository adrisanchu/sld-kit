/**
 * Data-only symbol definitions, consumable by both live renderers and the
 * SVG exporter. Symbols are described in their own `size` viewBox
 * and scaled into place by the renderer.
 *
 * `fill: 'token'` means "fill with the symbol's stroke color" (whatever
 * the renderer decides that is); `'none'`/undefined means outline only.
 */
export type SymbolShape =
  | { type: 'path'; d: string; fill?: 'none' | 'token'; strokeWidth?: number }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: 'none' | 'token'; strokeWidth?: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; strokeWidth?: number };

export interface SymbolDef {
  /** Natural viewBox of the shapes: [width, height]. */
  size: [number, number];
  shapes: SymbolShape[];
}

/**
 * Symbol lookup by key. v0 ships external-asset glyphs; breakers,
 * disconnectors and CTs register here later (keys `breaker`,
 * `disconnector`, `ct`) and render on position stems via
 * `Position.subElements` — no model or schema change required.
 */
export class SymbolRegistry {
  private defs = new Map<string, SymbolDef>();

  register(key: string, def: SymbolDef): void {
    this.defs.set(key, def);
  }

  get(key: string): SymbolDef | undefined {
    return this.defs.get(key);
  }

  keys(): string[] {
    return [...this.defs.keys()];
  }
}
