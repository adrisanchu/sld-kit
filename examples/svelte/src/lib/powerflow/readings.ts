/**
 * Explicit power-flow readings for example 03 — the demo's stand-in for a
 * third-party solver's output. A plain, hand-authored list of `{ id, values }`
 * items: swap it for a `fetch()` from a real power-flow API and nothing else
 * changes. `applyPowerFlow` folds it into each diagram's `data.flow` at load.
 *
 * `id` matches a bay id in the child diagrams (see `fixture.ts`). Values are
 * illustrative, not physical — authored to show a spread of nominal / loaded
 * (amber, load > 0.75) / overloaded (red, load > 0.9) lines, one curtailed
 * (open) feeder, and both directions of travel.
 */
import type { PowerFlowReading } from './flow-data';

export const POWER_FLOW_READINGS: PowerFlowReading[] = [
  // Alpha 400 kV — a solar injection and a heavily loaded tie to Bravo.
  { id: 'A-SOLAR', mw: 380, capacity: 500, direction: 1 }, //  0.76 — loaded
  { id: 'A-TIE-AB', mw: 465, capacity: 500, direction: 1 }, // 0.93 — overloaded
  { id: 'A-LOAD', mw: 120, capacity: 400, direction: -1 }, //  0.30 — nominal

  // Bravo 400 kV — receives the overloaded AB tie, feeds a moderate load.
  { id: 'B-TIE-AB', mw: 470, capacity: 520, direction: 1 }, // link min → 0.93 red
  { id: 'B-TIE-BC', mw: 300, capacity: 500, direction: 1 }, // 0.60 — nominal
  { id: 'B-LOAD', mw: 225, capacity: 300, direction: -1 }, //  0.75 — loaded

  // Charlie 220 kV — a curtailed (open) wind farm; the rest lightly loaded.
  { id: 'C-TIE-BC', mw: 290, capacity: 480, direction: -1 }, // 0.60 — nominal
  { id: 'C-TIE-CD', mw: 180, capacity: 500, direction: 1 }, //  0.36 — nominal
  { id: 'C-WIND', mw: 0, capacity: 400, direction: 1, state: 'open' }, // curtailed

  // Delta 220 kV — a storage unit discharging near its rating.
  { id: 'D-TIE-CD', mw: 170, capacity: 480, direction: -1 }, // 0.35 — nominal
  { id: 'D-STORAGE', mw: 260, capacity: 300, direction: 1 }, // 0.87 — loaded
  { id: 'D-LOAD', mw: 95, capacity: 250, direction: -1 } //     0.38 — nominal
];
