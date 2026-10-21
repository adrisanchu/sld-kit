/**
 * Switch state + bus-section topology for the box view — a deliberately small,
 * example-local model (like the power-flow example's toy `model.ts`), not a
 * load-flow solver. It lives here, not in `@sld-kit/core`, because "open" and
 * "closed" are domain concepts; a generic connectivity helper may be promoted to
 * core later.
 *
 * - **State** rides in each position's opaque `data.switch` (core never reads
 *   it). A position without switch data counts as closed.
 * - **Topology**: elements are graph nodes and element↔element connections are
 *   edges. A *closed* position conducts (joins everything it touches); an *open*
 *   one conducts nothing. The busbars that end up connected form one **bus
 *   section** — what the box view draws as one box. A double bus with its
 *   coupler closed is one section (one box); with the coupler open, two.
 *
 * Self-contained (type-only imports) so the headless smoke test can import it.
 */
import type { SldDocument, SldElement } from '@sld-kit/core';

export type SwitchState = 'open' | 'closed';

/** Shape stored at `position.data.switch`. */
export interface SwitchData {
  /** Whether the UI may toggle it (phase 5: click in the detail view). */
  operable?: boolean;
  state: SwitchState;
}

/** A position's switch data, if it has any. */
export function getSwitch(el: SldElement): SwitchData | undefined {
  return (el.data as { switch?: SwitchData } | undefined)?.switch;
}

/** Whether an element is an open switch (no switch data → closed). */
export function isOpen(el: SldElement): boolean {
  return getSwitch(el)?.state === 'open';
}

/** A copy of `data` with `switch.state` set — pure, for use inside a command's `after` snapshot. */
export function withSwitchState(data: unknown, state: SwitchState): unknown {
  const base = (data ?? {}) as { switch?: SwitchData };
  return { ...base, switch: { ...base.switch, state } };
}

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

/** Compute a document's bus sections from its topology + switch states. */
export function busSections(doc: SldDocument): BusSection[] {
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

  const elements = new Map<string, SldElement>();
  for (const el of [...doc.busBars(), ...doc.positions()]) {
    elements.set(el.id, el);
    parent.set(el.id, el.id);
  }
  const conducts = (id: string) => {
    const el = elements.get(id);
    return !!el && !isOpen(el);
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
  return sections;
}

/**
 * The `busBarLabel` resolver for the detail view: a bar shows its bus number
 * (`39770`) instead of `BB1`; bars without one keep their own label.
 */
export function barBusIdLabel(bar: SldElement): string | null {
  const busId = (bar.data as BusBarData | undefined)?.busId;
  return busId != null ? String(busId) : null;
}

/** The box label for a set of sections: every bus number, `39770 / 39771`. */
export function busLabelOf(sections: BusSection[]): string | null {
  const ids = sections.flatMap((s) => s.busIds);
  return ids.length ? ids.join(' / ') : null;
}
