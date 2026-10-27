import type { Point, Rect } from '../layout/geometry';
import type { Transform2D } from '../layout/Transform2D';
import type { DiagramInstance } from './DiagramInstance';

/**
 * One box of a child in box view. By default a child is one box; a consumer's
 * `boxSections` resolver can split it into several — e.g. one per electrically
 * separate bus section of a substation. Core never knows *why* a child splits:
 * it only gets keys, the feeders that belong to each box, and opaque `data`.
 */
export interface BoxSection {
  /** Stable key, unique within the child (e.g. the section's bar ids). */
  key: string;
  /** External connection ids (feeders) drawn from this box. Unlisted feeders go to the first box. */
  connectionIds: readonly string[];
  /** Opaque consumer data handed back to `boxSubLabel` (e.g. bus numbers). Never read by core. */
  data?: unknown;
}

/** A consumer's split of one child: its boxes, plus ties drawn between pairs of them. */
export interface BoxSectionSplit {
  sections: BoxSection[];
  /** Box pairs to join with a muted dashed tie (e.g. an open bus coupler), by section key. */
  ties?: { a: string; b: string }[];
}

/**
 * Consumer hook splitting a child into section boxes in box view. Return
 * `null`/`undefined` (or a single section) for the default single box. Called on
 * every layout, so it can read live state (e.g. switch positions).
 */
export type BoxSectionsResolver = (instance: DiagramInstance) => BoxSectionSplit | null | undefined;

/** A laid-out section box, in child-local coordinates. */
export interface SectionBox {
  key: string;
  frame: Rect;
  section: BoxSection;
}

/** A laid-out tie between two section boxes, in child-local coordinates. */
export interface SectionTie {
  a: string;
  b: string;
  points: Point[];
}

/** Gap between adjacent section boxes of one child. */
export const BOX_SECTION_GAP = 64;

/**
 * Lay N section boxes side by side (left to right, in the order given), each
 * `size`, separated by {@link BOX_SECTION_GAP}; ties run horizontally at
 * mid-height between the facing edges of their two boxes.
 */
export function layoutSectionBoxes(
  split: BoxSectionSplit,
  size: { width: number; height: number }
): { boxes: SectionBox[]; ties: SectionTie[]; frame: Rect } {
  const boxes = split.sections.map((section, i) => ({
    key: section.key,
    section,
    frame: { x: i * (size.width + BOX_SECTION_GAP), y: 0, width: size.width, height: size.height }
  }));
  const byKey = new Map(boxes.map((b) => [b.key, b]));
  const ties: SectionTie[] = [];
  for (const { a, b } of split.ties ?? []) {
    const ba = byKey.get(a);
    const bb = byKey.get(b);
    if (!ba || !bb || ba === bb) continue;
    const [left, right] = ba.frame.x < bb.frame.x ? [ba, bb] : [bb, ba];
    const y = size.height / 2;
    ties.push({ a, b, points: [{ x: left.frame.x + left.frame.width, y }, { x: right.frame.x, y }] });
  }
  const width = boxes.length * size.width + (boxes.length - 1) * BOX_SECTION_GAP;
  return { boxes, ties, frame: { x: 0, y: 0, width, height: size.height } };
}

/** The section box a feeder belongs to (its listing box, else the first), or undefined when the child isn't split. */
export function sectionBoxOf(boxes: readonly SectionBox[] | undefined, connectionId: string): SectionBox | undefined {
  if (!boxes?.length) return undefined;
  return boxes.find((b) => b.section.connectionIds.includes(connectionId)) ?? boxes[0];
}

/** World centre of the box a feeder leaves from — its section box when split, else the whole child. */
export function feederBoxCenter(
  child: { boxes?: readonly SectionBox[]; frame: Rect; transform: Transform2D },
  connectionId: string
): Point {
  const f = sectionBoxOf(child.boxes, connectionId)?.frame ?? child.frame;
  return child.transform.apply({ x: f.x + f.width / 2, y: f.y + f.height / 2 });
}

/**
 * World-space corners [TL, TR, BR, BL] of one section box of a laid-out child
 * (`ChildLayout.boxes`), through the child's transform — the section's
 * counterpart of `ChildLayout.worldCorners`, rotation included. `null` when the
 * child has no section box with that key. Used by the adapters to frame a
 * hovered section.
 */
export function sectionWorldCorners(
  child: { transform: Transform2D; boxes?: readonly SectionBox[] },
  key: string
): Point[] | null {
  const box = child.boxes?.find((b) => b.key === key);
  return box ? child.transform.applyRect(box.frame) : null;
}
