/**
 * Bus-section topology for the box view — a deliberately small, example-local
 * model (like the power-flow example's toy `model.ts`), not a load-flow solver.
 * A generic connectivity helper may be promoted to core later.
 *
 * - **State** is core's first-class `Position.state`, read through
 *   `effectiveState` (absent = closed). Nothing here stores or wraps it.
 * - **Topology**: elements are graph nodes and element↔element connections are
 *   edges. A *closed* position conducts (joins everything it touches); an *open*
 *   one conducts nothing. The busbars that end up connected form one **bus
 *   section** — what the box view draws as one box. A double bus with its
 *   coupler closed is one section (one box); with the coupler open, two.
 *
 * The rest are the app's implementations of core hooks: `boxSplit`
 * (`boxSections`), `sectionLabel` (`boxSubLabel`), `barBusIdLabel`
 * (`busBarLabel`), plus `openFeeders` for the open-line format.
 *
 * Self-contained (no relative imports) so the headless smoke test can import it.
 */
import { effectiveState, type BoxSection, type BoxSectionSplit, type DiagramInstance, type SldDocument, type SldElement } from '@sld-kit/core';

/** Data a busbar carries (the integer bus number shown in the box). */
interface BusBarData {
  busId?: number;
}

/** One electrically connected group of busbars, plus the feeders hanging off it. */
export interface BusSection {
  /** Stable key: the section's busbar ids, sorted and joined. */
  key: string;
  /** Busbar ids, ordered by grid row (top bar first). */
  busbarIds: string[];
  /** Bus numbers from each bar's `data.busId`, in `busbarIds` order. */
  busIds: number[];
  /** External (feeder) connection ids attached to this section. */
  connectionIds: string[];
  /**
   * The subset of `connectionIds` that are de-energised (their position is open,
   * or cut off from every bar). They are still drawn from the bar they're wired to.
   */
  openConnectionIds: string[];
}

/** An open switch that separates two sections (e.g. an open bus coupler). */
export interface SectionTie {
  /** Section keys on either side. */
  a: string;
  b: string;
  /** The open position between them. */
  elementId: string;
}

/** A document's bus sections plus the open switches separating them. */
export interface BusTopology {
  sections: BusSection[];
  ties: SectionTie[];
}

/**
 * Bus sections plus ties: an open position whose wired neighbours sit in
 * different sections (an open coupler) ties those sections — the box view draws
 * it as a muted line between their boxes.
 */
export function busTopology(doc: SldDocument): BusTopology {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const el of [...doc.busBars(), ...doc.positions()]) parent.set(el.id, el.id);
  const positions = new Map(doc.positions().map((p) => [p.id, p]));
  // Bars always conduct; a position conducts unless it is open.
  const conducts = (id: string) => {
    if (!parent.has(id)) return false;
    const pos = positions.get(id);
    return !pos || effectiveState(pos) === 'closed';
  };

  // Element↔element connections conduct unless an end is an open position.
  for (const c of doc.connections()) {
    const [a, b] = c.elementIds();
    if (a && b && conducts(a) && conducts(b)) union(a, b);
  }

  // Busbars grouped by root → sections (ordered by their top bar's row).
  const bars = [...doc.busBars()].sort((x, y) => x.row - y.row);
  const byRoot = new Map<string, BusSection>();
  for (const bar of bars) {
    const root = find(bar.id);
    let section = byRoot.get(root);
    if (!section) {
      section = { key: '', busbarIds: [], busIds: [], connectionIds: [], openConnectionIds: [] };
      byRoot.set(root, section);
    }
    section.busbarIds.push(bar.id);
    const busId = (bar.data as BusBarData | undefined)?.busId;
    if (busId != null) section.busIds.push(busId);
  }

  const barIds = new Set(bars.map((b) => b.id));
  // Energised: the element conducts and its component reaches a bar.
  const energised = (id: string) => conducts(id) && byRoot.has(find(id));

  // The section a feeder is drawn from: its element's own section when
  // energised, otherwise the nearest bar by wiring (breadth-first, ignoring
  // switch states) — an open bay still hangs off the bar it is wired to.
  const sectionOf = (id: string): BusSection | undefined => {
    if (energised(id)) return byRoot.get(find(id));
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift() as string;
      if (barIds.has(cur)) return byRoot.get(find(cur));
      for (const c of doc.connectionsOf(cur)) {
        for (const next of c.elementIds()) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
    }
    return undefined;
  };

  // Feeders: external connections, attached via the element they leave from.
  for (const c of doc.connections()) {
    if (c.from.kind !== 'external' && c.to.kind !== 'external') continue;
    const [elementId] = c.elementIds();
    if (!elementId) continue;
    const section = sectionOf(elementId);
    if (!section) continue;
    section.connectionIds.push(c.id);
    if (!energised(elementId)) section.openConnectionIds.push(c.id);
  }

  const sections = [...byRoot.values()];
  for (const s of sections) s.key = [...s.busbarIds].sort().join('+');

  // Ties: each open position touching energised elements of ≥2 sections.
  const ties: SectionTie[] = [];
  for (const pos of doc.positions()) {
    if (effectiveState(pos) !== 'open') continue;
    const touched: BusSection[] = [];
    for (const c of doc.connectionsOf(pos.id)) {
      for (const other of c.elementIds()) {
        if (other === pos.id || !energised(other)) continue;
        const section = byRoot.get(find(other));
        if (section && !touched.includes(section)) touched.push(section);
      }
    }
    for (let i = 0; i < touched.length; i++) {
      for (let j = i + 1; j < touched.length; j++) ties.push({ a: touched[i].key, b: touched[j].key, elementId: pos.id });
    }
  }
  return { sections, ties };
}

/**
 * The `busBarLabel` resolver for the detail view: a bar shows its bus number
 * (`39770`) instead of `BB1`; bars without one keep their own label.
 */
export function barBusIdLabel(bar: SldElement): string | null {
  const busId = (bar.data as BusBarData | undefined)?.busId;
  return busId != null ? String(busId) : null;
}


/** What the app stores in a core `BoxSection.data`: the section's bus numbers. */
export interface SectionData {
  busIds: number[];
}

/**
 * The engine's `boxSections` resolver: one box per bus section, joined by a
 * tie wherever an open switch separates two sections. A closed double bus is
 * one section, so one box; open its coupler and it splits in two.
 */
export function boxSplit(instance: DiagramInstance): BoxSectionSplit | null {
  const doc = instance.resolved;
  if (!doc) return null;
  const { sections, ties } = busTopology(doc);
  return {
    sections: sections.map((s) => ({ key: s.key, connectionIds: s.connectionIds, data: { busIds: s.busIds } satisfies SectionData })),
    ties: ties.map(({ a, b }) => ({ a, b }))
  };
}

/** A box's sub-label: its section's bus numbers (`39770`), or all of them (`39770 / 39771`) for an unsplit child. */
export function sectionLabel(doc: SldDocument | null | undefined, section?: BoxSection): string | null {
  const ids = (section?.data as SectionData | undefined)?.busIds ?? (doc ? busTopology(doc).sections.flatMap((s) => s.busIds) : []);
  return ids.length ? ids.join(' / ') : null;
}

/** Feeder (external connection) ids that are de-energised in a document. */
export function openFeeders(doc: SldDocument): Set<string> {
  return new Set(busTopology(doc).sections.flatMap((s) => s.openConnectionIds));
}
