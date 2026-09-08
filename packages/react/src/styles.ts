import { useEffect } from 'react';

/**
 * React has no scoped `<style>` like Svelte's, so the handful of keyframes the
 * chrome needs are injected once into `<head>` on first mount. Client-only (an
 * effect), so SSR renders the markup without them — the animations are pure
 * enter polish, never load-bearing.
 *
 * Faithful-behaviour note: Svelte's `transition:` also animates elements *out*
 * on unmount. Reproducing that in React needs presence tracking (a library);
 * per the port's "no animation library" rule these are **enter-only**, and the
 * element simply unmounts. A `prefers-reduced-motion` rule disables them.
 */
const ANIM_ID = 'sld-kit-react-anim';
const ANIM_CSS = `
@keyframes sld-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes sld-slide-up-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
@media (prefers-reduced-motion: reduce) {
  [data-sld-anim] { animation: none !important; }
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
