import { newId } from '../ids';
import { DiagramInstance } from './DiagramInstance';
import type { DocumentResolver } from './DocumentResolver';

export interface CompositeMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type CompositeChange = { type: 'children'; ids: string[] } | { type: 'meta' } | { type: 'replace' };

/**
 * Root aggregate of a composite ("diagram of diagrams"): meta + an ordered map
 * of child diagram instances + change listeners. Mirrors `SldDocument`:
 * mutations are low-level and meant to be called ONLY by commands, each bumps
 * `meta.updatedAt` and notifies subscribers, and insertion order is the stable
 * z-order.
 */
export class CompositeDocument {
  meta: CompositeMeta;
  private children = new Map<string, DiagramInstance>();
  private listeners = new Set<(change: CompositeChange) => void>();

  constructor(meta: Partial<CompositeMeta> = {}) {
    const now = new Date().toISOString();
    this.meta = {
      id: newId(),
      name: 'New composite',
      createdAt: now,
      updatedAt: now,
      ...meta
    };
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getChild(id: string): DiagramInstance | undefined {
    return this.children.get(id);
  }

  /** Insertion order = z-order. */
  allChildren(): DiagramInstance[] {
    return [...this.children.values()];
  }

  isEmpty(): boolean {
    return this.children.size === 0;
  }

  // ── Open-time resolution ─────────────────────────────────────────────────

  /**
   * Resolve every child against the library. Resolution happens once, at open
   * time — that is what "live reference" means: no cross-document reactivity
   * while the composite is open, fresh content on the next open.
   */
  resolveChildren(resolver: DocumentResolver): void {
    for (const child of this.children.values()) child.resolve(resolver);
  }

  // ── Mutations (called by commands) ─────────────────────────────────────────

  addChild(inst: DiagramInstance): void {
    this.children.set(inst.id, inst);
    this.emit({ type: 'children', ids: [inst.id] });
  }

  removeChild(id: string): DiagramInstance | null {
    const child = this.children.get(id);
    if (!child) return null;
    this.children.delete(id);
    this.emit({ type: 'children', ids: [id] });
    return child;
  }

  /** Single mutation behind both move and rotate; the label distinguishes them. */
  setChildTransform(id: string, x: number, y: number, angleDeg: number): void {
    const child = this.children.get(id);
    if (!child) return;
    child.x = x;
    child.y = y;
    child.angleDeg = ((angleDeg % 360) + 360) % 360;
    this.emit({ type: 'children', ids: [id] });
  }

  updateMeta(patch: Partial<Omit<CompositeMeta, 'id' | 'createdAt' | 'updatedAt'>>): void {
    this.meta = { ...this.meta, ...patch };
    this.emit({ type: 'meta' });
  }

  // ── Change notification ────────────────────────────────────────────────────

  subscribe(fn: (change: CompositeChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(change: CompositeChange): void {
    this.meta.updatedAt = new Date().toISOString();
    for (const fn of this.listeners) fn(change);
  }
}
