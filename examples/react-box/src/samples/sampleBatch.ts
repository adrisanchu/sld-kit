/**
 * A FICTIONAL batch of single-line diagrams to try the bulk import with — the
 * kind of folder an export of a whole grid would produce: one JSON file per
 * voltage level. Everything is invented: "NODE nn" sites scattered over open
 * sea around 0°N 0°E, made-up bus ids, made-up loads. No real network belongs
 * in this repo.
 *
 * The layout is deliberately uneven, to exercise the geographic placement:
 *  - a dense cluster of sites, a looser ring around it and a few far outliers
 *    (so compaction has long empty stretches to collapse);
 *  - some sites with two voltage levels (400 + 220 kV) that share one location
 *    and `meta.substation`, tied by a transformer feeder (so they sit side by
 *    side);
 *  - a few sites with no location at all (they fall back to a grid).
 *
 * Neighbouring sites share a feeder id (`f-07-12` in both NODE 07 and NODE 12),
 * which is how an import knows which diagrams a line joins. Seeded, so every
 * run generates the same batch.
 *
 * Only imports `@sld-kit/core` (and types), so Node can run it directly (see
 * `scripts/gen-sample-batch.mjs` and `ssr-smoke.mjs`).
 */
import { Serializer, buildDocument, type BaySpec, type ExternalDirection, type GeoLocation } from '@sld-kit/core';

/** One file of the batch, as a folder pick would hand it over. */
export interface SampleFile {
  path: string;
  text: string;
}

interface Site {
  num: number;
  location: GeoLocation | null;
  /** Voltage levels at this site; the first carries the inter-site lines. */
  levels: number[];
}

interface FeederPlan {
  id: string;
  label: string;
  name?: string;
  asset: 'line' | 'transformer' | 'demand';
  direction: ExternalDirection;
}

/** Deterministic pseudo-random numbers (mulberry32). */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Compass side of `to` seen from `from` (north up), by the dominant axis. */
function sideTowards(from: GeoLocation, to: GeoLocation): ExternalDirection {
  const dx = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  const dy = to.lat - from.lat;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'up' : 'down';
}

const OPPOSITE: Record<ExternalDirection, ExternalDirection> = { left: 'right', right: 'left', up: 'down', down: 'up' };

/**
 * Generate the batch: about a hundred diagram files.
 * @param seed change it for a different (still fictional) grid.
 */
export function sampleBatch(seed = 7): SampleFile[] {
  const r = rng(seed);
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);

  // ── Sites ────────────────────────────────────────────────────────────────
  const sites: Site[] = [];
  const add = (location: GeoLocation | null) => {
    const num = sites.length + 1;
    // Every fourth located site has two voltage levels; the rest are 220 or 132 kV.
    const levels = location && num % 4 === 0 ? [400, 220] : [r() < 0.7 ? 220 : 132];
    sites.push({ num, location, levels });
  };
  for (let i = 0; i < 44; i++) add({ lat: between(0.1, 0.9), lng: between(0.1, 1.1) }); // dense cluster
  for (let i = 0; i < 24; i++) add({ lat: between(-2, 2.6), lng: between(-2.5, 3.2) }); // looser ring
  [
    { lat: 5.4, lng: -3.8 },
    { lat: -4.6, lng: 5.9 },
    { lat: 3.2, lng: 7.6 },
    { lat: -5.8, lng: -6.4 }
  ].forEach(add); // far outliers
  for (let i = 0; i < 3; i++) add(null); // no location

  // ── Lines: each located site joins its two nearest neighbours ────────────
  const located = sites.flatMap((s) => (s.location ? [{ site: s, at: s.location }] : []));
  const dist = (a: GeoLocation, b: GeoLocation) =>
    Math.hypot((a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180), a.lat - b.lat);
  const edges = new Map<string, [Site, Site]>();
  const link = (a: Site, b: Site) => {
    const [p, q] = a.num < b.num ? [a, b] : [b, a];
    edges.set(`f-${pad(p.num)}-${pad(q.num)}`, [p, q]);
  };
  for (const { site, at } of located) {
    const nearest = located
      .filter((o) => o.site !== site)
      .sort((a, b) => dist(at, a.at) - dist(at, b.at))
      .slice(0, 2);
    for (const o of nearest) link(site, o.site);
  }
  // The unlocated sites hang off the first sites, so they still have lines.
  sites.filter((s) => !s.location).forEach((s, i) => link(s, sites[i]));

  // ── Feeders per diagram (keyed by `site/level`) ──────────────────────────
  const feeders = new Map<string, FeederPlan[]>();
  const feedersOf = (s: Site, kv: number) => {
    const key = `${s.num}/${kv}`;
    const list = feeders.get(key) ?? [];
    feeders.set(key, list);
    return list;
  };
  for (const [id, [a, b]] of edges) {
    const dirA = a.location && b.location ? sideTowards(a.location, b.location) : 'right';
    feedersOf(a, a.levels[0]).push({ id, label: `L${pad(b.num)}`, asset: 'line', direction: dirA });
    feedersOf(b, b.levels[0]).push({ id, label: `L${pad(a.num)}`, asset: 'line', direction: OPPOSITE[dirA] });
  }
  for (const s of sites) {
    if (s.levels.length === 2) {
      const id = `t-${pad(s.num)}`;
      feedersOf(s, 400).push({ id, label: 'T1', asset: 'transformer', direction: 'down' });
      feedersOf(s, 220).push({ id, label: 'T1', asset: 'transformer', direction: 'up' });
    }
    // About a third of the lower levels serve a consumer (a hanging demand, no line).
    if (r() < 0.35) {
      const kv = s.levels[s.levels.length - 1];
      const mw = Math.round(between(20, 300) / 10) * 10;
      feedersOf(s, kv).push({
        id: `d-${pad(s.num)}`,
        label: 'D1',
        name: `Load ${mw} MW`,
        asset: 'demand',
        direction: 'down'
      });
    }
  }

  // ── Documents ────────────────────────────────────────────────────────────
  const files: SampleFile[] = [];
  let busId = 40000;
  for (const s of sites) {
    for (const kv of s.levels) {
      const site = `NODE ${pad(s.num)}`;
      const name = s.levels.length > 1 ? `${site} ${kv}` : site;
      const bays: BaySpec[] = feedersOf(s, kv).map((f, col) => ({
        col,
        positions: [
          {
            id: `pos-${f.id}`,
            type: f.asset,
            label: f.label,
            row: 1,
            feeder: { asset: f.asset, label: f.name ?? f.label, direction: f.direction, id: f.id }
          }
        ]
      }));
      const doc = buildDocument({
        meta: {
          id: `node-${pad(s.num)}-${kv}`,
          name,
          substation: site,
          voltageKv: kv,
          ...(s.location ? { location: s.location } : {})
        },
        busbars: [{ id: 'bb', label: 'BB', row: 0, data: { busId: busId++ } }],
        bays
      });
      files.push({
        path: `sample-batch/node-${pad(s.num)}-${kv}.json`,
        text: JSON.stringify(Serializer.toJSON(doc), null, 2)
      });
    }
  }
  return files;
}
