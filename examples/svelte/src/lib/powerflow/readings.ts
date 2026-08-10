/**
 * Explicit power-flow readings for example 03 — the demo's stand-in for a
 * third-party solver's output. A plain, hand-authored list of `{ id, values }`
 * items: swap it for a `fetch()` from a real power-flow API and nothing else
 * changes. `applyPowerFlow` folds it into each diagram's `data.flow` at load.
 *
 * `id` matches a bay id in the child diagrams (see `fixture.ts`). Values are
 * illustrative, not physical — authored to show a spread of nominal / loaded
 * (amber, load > 0.75) / overloaded (red, load > 0.9) lines and one curtailed
 * (open) feeder.
 *
 * `direction` is the bay's *physical* flow: `+1` injects (feeder → busbar — a
 * generator or an importing tie end), `-1` withdraws (busbar → feeder — a load or
 * an exporting tie end). The model turns that into a continuous per-leg animation
 * that crosses the position. So power flows left-to-right across the chain
 * A → B → C → D: each tie's exporting (upstream) side is `-1`, its importing side `+1`.
 */
import type { PowerFlowReading } from './flow-data';

export const POWER_FLOW_READINGS: PowerFlowReading[] = [
  // Alpha 400 kV — a solar injection, exporting a heavily loaded tie to Bravo.
  { id: 'A-SOLAR', mw: 600, capacity: 700, direction: 1 }, //   0.85 — loaded (injects)
  { id: 'A-TIE-AB', mw: 470, capacity: 450, direction: -1 }, // 1.04 — overloaded (exports → B)
  { id: 'A-LOAD', mw: 130, capacity: 400, direction: -1 }, //   0.33 — nominal (load)

  // Bravo 400 kV — imports the overloaded AB tie, feeds a load, exports to Charlie.
  { id: 'B-TIE-AB', mw: 470, capacity: 450, direction: 1 }, //  1.04 — overloaded (imports ← A)
  { id: 'B-TIE-BC', mw: 250, capacity: 400, direction: -1 }, // 0.63 — nominal (exports → C)
  { id: 'B-LOAD', mw: 220, capacity: 240, direction: -1 }, //   0.92 — loaded (load)

  // Charlie 220 kV — imports from Bravo, curtailed (open) wind, exports to Delta.
  { id: 'C-TIE-BC', mw: 250, capacity: 400, direction: 1 }, //  0.63 — nominal (imports ← B)
  { id: 'C-TIE-CD', mw: 250, capacity: 280, direction: -1 }, // 0.89 — loaded (exports → D)
  { id: 'C-WIND', mw: 0, capacity: 400, direction: 1, state: 'open' }, // curtailed

  // Delta 220 kV — imports from Charlie, a storage unit discharging near its rating.
  { id: 'D-TIE-CD', mw: 250, capacity: 280, direction: 1 }, //  0.89 — loaded (imports ← C)
  { id: 'D-STORAGE', mw: 80, capacity: 150, direction: 1 }, //  0.53 — loaded (discharges)
  { id: 'D-LOAD', mw: 330, capacity: 350, direction: -1 } //    0.94 — nominal (load)
];
