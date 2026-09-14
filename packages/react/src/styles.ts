import { useEffect } from 'react';

/**
 * React has no scoped `<style>` like Svelte's, so the handful of keyframes and
 * transitions the components need are injected once into `<head>` on first
 * mount. Client-only (an effect), so SSR renders the markup without them.
 *
 * Two groups live here:
 * - **Enter polish** (`fadeIn` / `slideUpIn`) for the toolbar flyouts. Svelte's
 *   `transition:` also animates elements *out* on unmount; reproducing that in
 *   React needs presence tracking (a library), so per the "no animation library"
 *   rule these are enter-only and the element simply unmounts.
 * - **Live-view motion** ported from the two scoped `<style>` blocks in the
 *   Svelte adapter: `.sld-child` (composite focus dim/undim) and `.sld-flow-dot`
 *   (the travelling-dot `stroke-dashoffset` march in `FlowOverlay`). Classes are
 *   `sld-`-prefixed because they're injected globally, not scoped.
 *
 * A `prefers-reduced-motion` rule disables every one of them.
 */
const ANIM_ID = 'sld-kit-react-anim';
const ANIM_CSS = `
@keyframes sld-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes sld-slide-up-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
@keyframes sld-flow-dash { to { stroke-dashoffset: calc(-1 * var(--sld-flow-period)) } }
.sld-child { transition: opacity 0.3s ease; }
.sld-flow-dot { animation-name: sld-flow-dash; animation-timing-function: linear; animation-iteration-count: infinite; }
.sld-flow-dot.sld-paused { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) {
  [data-sld-anim] { animation: none !important; }
  .sld-child { transition: none; }
  .sld-flow-dot { animation: none; }
}
`;

export function useSldAnimations(): void {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById(ANIM_ID)) return;
    const el = document.createElement('style');
    el.id = ANIM_ID;
    el.textContent = ANIM_CSS;
    document.head.appendChild(el);
    // Left in place: shared across every instance, tiny, and idempotent.
  }, []);
}

/** Inline `style` for an enter animation. Pair with `data-sld-anim` for the
 *  reduced-motion opt-out. */
export const fadeIn = { animation: 'sld-fade-in 150ms ease-out' } as const;
export const slideUpIn = { animation: 'sld-slide-up-in 200ms ease-out' } as const;
