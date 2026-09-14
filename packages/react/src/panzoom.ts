import type { Point } from '@sld-kit/core';
import { writable, type WritableStore } from './store';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Content extents used by zoomToFit (bounds may be offset from the origin). */
export interface ContentBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

/**
 * Framework-agnostic viewBox pan/zoom mechanics shared by `SldCanvas` and
 * `CompositeCanvas`: wheel pan, Ctrl/Cmd+wheel (and trackpad pinch) zoom about
 * the cursor, space-pan, `clientToSvg`, and `zoomToFit`. The two canvases
 * differ only in what they render inside the SVG; this is the identical part.
 *
 * `getSvgEl` returns the bound `<svg>`; `getContentBounds` returns the current
 * content extents (diagram size for a single diagram, union bounds for a
 * composite). Both are read lazily so the caller can bind them after mount.
 *
 * Ported from `@sld-kit/svelte`'s `panzoom.ts`; the only difference is that the
 * three exposed stores are the local `writable` (see `store.ts`) rather than
 * `svelte/store`'s, so `useStore` can read them through `useSyncExternalStore`.
 * Keep the two in sync when either changes.
 */
export function createPanZoom(getSvgEl: () => SVGSVGElement | null, getContentBounds: () => ContentBounds) {
  const viewBox: WritableStore<ViewBox> = writable({ x: 0, y: 0, w: 1000, h: 750 });
  const spaceDown = writable(false);
  const panning = writable(false);

  let fitScale = 1;
  let pan: { sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null;
  /** Live pointers (id → client coords), so touch pinch/pan can track >1 finger. */
  const pointers = new Map<number, { x: number; y: number }>();
  /** Two-finger pinch baseline; recomputed from a frozen viewBox to avoid drift. */
  let pinch: { startDist: number; startMid: Point; startVb: ViewBox } | null = null;
  let pointerInside = false;
  let flyRaf: number | null = null;

  /** Current viewBox. The Svelte original mirrors this into a local via an
   *  immediate store subscription; here the store just answers directly. */
  function vb(): ViewBox {
    return viewBox.get();
  }

  function set(next: ViewBox) {
    viewBox.set(next);
  }

  /** Cancel any in-flight `flyTo`/`flyToFit` tween (e.g. the user grabbed control). */
  function cancelFly() {
    if (flyRaf != null) {
      cancelAnimationFrame(flyRaf);
      flyRaf = null;
    }
  }

  function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * The viewBox (and whole-content fit scale) that frames `content` with 5%
   * padding — the shared math behind `zoomToFit` and the `flyTo*` tweens.
   */
  function computeFit(content: ContentBounds): { vb: ViewBox; scale: number } | null {
    const svgEl = getSvgEl();
    if (!svgEl) return null;
    const rect = svgEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const bx = content.x ?? 0;
    const by = content.y ?? 0;
    const pad = Math.max(content.width, content.height) * 0.05 || 50;
    const cw = content.width + pad * 2;
    const ch = content.height + pad * 2;
    const scale = Math.min(rect.width / cw, rect.height / ch) || 1;
    const w = rect.width / scale;
    const h = rect.height / scale;
    return { vb: { x: bx - pad - (w - cw) / 2, y: by - pad - (h - ch) / 2, w, h }, scale };
  }

  /** Ease-in-out cubic tween of the viewBox toward `target` over `durationMs`. */
  function animateTo(target: ViewBox, durationMs: number) {
    cancelFly();
    if (durationMs <= 0 || prefersReducedMotion()) {
      set(target);
      return;
    }
    const from = { ...vb() };
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      set({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e
      });
      flyRaf = t < 1 ? requestAnimationFrame(step) : null;
    };
    flyRaf = requestAnimationFrame(step);
  }

  function clientToSvg(clientX: number, clientY: number): Point {
    const svgEl = getSvgEl();
    if (!svgEl) return { x: 0, y: 0 };
    const rect = svgEl.getBoundingClientRect();
    const v = vb();
    return {
      x: v.x + ((clientX - rect.left) / rect.width) * v.w,
      y: v.y + ((clientY - rect.top) / rect.height) * v.h
    };
  }

  function svgToClient(svgX: number, svgY: number): Point {
    const svgEl = getSvgEl();
    if (!svgEl) return { x: 0, y: 0 };
    const rect = svgEl.getBoundingClientRect();
    const v = vb();
    return {
      x: rect.left + ((svgX - v.x) / v.w) * rect.width,
      y: rect.top + ((svgY - v.y) / v.h) * rect.height
    };
  }

  /** Fit the whole content in view with 5% padding (instant). */
  function zoomToFit() {
    const fit = computeFit(getContentBounds());
    if (!fit) return;
    cancelFly();
    set(fit.vb);
    fitScale = fit.scale;
  }

  /**
   * Smoothly frame an arbitrary content rect (e.g. a child's `worldBounds`) —
   * the "fly into a diagram" camera move. Interrupted by any user pan/zoom.
   * `fitScale` (the zoom clamp reference) is left on the whole-content fit so
   * the user can still zoom in/out normally once framed.
   */
  function flyTo(target: ContentBounds, opts: { durationMs?: number } = {}) {
    const fit = computeFit(target);
    if (!fit) return;
    animateTo(fit.vb, opts.durationMs ?? 450);
  }

  /** Smoothly return to the whole-content fit — the "fly back out" move. */
  function flyToFit(opts: { durationMs?: number } = {}) {
    const fit = computeFit(getContentBounds());
    if (!fit) return;
    fitScale = fit.scale;
    animateTo(fit.vb, opts.durationMs ?? 450);
  }

  /** Zoom about an anchor point, clamped to 0.1×–8× of the fit scale. */
  function zoomAbout(anchor: Point, factor: number) {
    const svgEl = getSvgEl();
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const v = vb();
    const current = rect.width / v.w;
    const target = Math.min(fitScale * 8, Math.max(fitScale * 0.1, current / factor));
    const f = current / target;
    set({
      x: anchor.x - (anchor.x - v.x) * f,
      y: anchor.y - (anchor.y - v.y) * f,
      w: v.w * f,
      h: v.h * f
    });
  }

  /** Zoom step for the +/- buttons: about the current view centre. */
  function zoomIn() {
    cancelFly();
    const v = vb();
    zoomAbout({ x: v.x + v.w / 2, y: v.y + v.h / 2 }, 1 / 1.2);
  }
  function zoomOut() {
    cancelFly();
    const v = vb();
    zoomAbout({ x: v.x + v.w / 2, y: v.y + v.h / 2 }, 1.2);
  }

  function handleWheel(e: WheelEvent) {
    const svgEl = getSvgEl();
    if (!svgEl) return;
    cancelFly();
    const rect = svgEl.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      zoomAbout(clientToSvg(e.clientX, e.clientY), Math.exp(e.deltaY * 0.01));
    } else {
      const v = vb();
      set({ ...v, x: v.x + (e.deltaX / rect.width) * v.w, y: v.y + (e.deltaY / rect.height) * v.h });
    }
  }

  /** (Re)seat the pinch baseline from the two most recent live pointers. */
  function startPinch() {
    const pts = [...pointers.values()];
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    pinch = {
      startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      startVb: { ...vb() }
    };
    pan = null;
    panning.set(true);
  }

  /**
   * Begin a pan/pinch. Panning always starts on middle-button or space+left;
   * `opts.panOnDrag` additionally lets a plain left-drag (mouse, on empty
   * background) or a single finger pan. A second touch always starts a pinch,
   * so two-finger zoom works regardless of `panOnDrag`. Returns true when the
   * gesture consumes the event (caller should skip its own down logic).
   */
  function tryStartPan(e: PointerEvent, opts: { panOnDrag?: boolean; background?: boolean } = {}): boolean {
    const svgEl = getSvgEl();
    if (!svgEl) return false;
    const isTouch = e.pointerType === 'touch';

    // A second finger upgrades an in-progress touch gesture to a pinch.
    if (isTouch && pointers.size >= 1) {
      cancelFly();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svgEl.setPointerCapture(e.pointerId);
      startPinch();
      e.preventDefault();
      return true;
    }

    const wantPan =
      e.button === 1 ||
      (e.button === 0 && spaceDown.get()) ||
      (isTouch && opts.panOnDrag !== false) ||
      (e.button === 0 && !isTouch && !!opts.background && opts.panOnDrag !== false);
    if (!wantPan) return false;

    cancelFly();
    const v = vb();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pan = { sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false };
    panning.set(true);
    svgEl.setPointerCapture(e.pointerId);
    e.preventDefault();
    return true;
  }

  /** Returns true if a pan/pinch is in progress (caller should skip its own logic). */
  function movePan(e: PointerEvent): boolean {
    if (!pointers.has(e.pointerId)) return false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const svgEl = getSvgEl();
    if (!svgEl) return true;
    const rect = svgEl.getBoundingClientRect();

    if (pinch && pointers.size >= 2) {
      const pts = [...pointers.values()];
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // World point under the initial midpoint stays put; scale + drag from there.
      const worldX = pinch.startVb.x + ((pinch.startMid.x - rect.left) / rect.width) * pinch.startVb.w;
      const worldY = pinch.startVb.y + ((pinch.startMid.y - rect.top) / rect.height) * pinch.startVb.h;
      const startScale = rect.width / pinch.startVb.w;
      const target = Math.min(fitScale * 8, Math.max(fitScale * 0.1, (startScale * dist) / pinch.startDist));
      const w = rect.width / target;
      const h = w * (pinch.startVb.h / pinch.startVb.w);
      set({
        x: worldX - ((mid.x - rect.left) / rect.width) * w,
        y: worldY - ((mid.y - rect.top) / rect.height) * h,
        w,
        h
      });
      return true;
    }

    if (pan) {
      const v = vb();
      const dx = ((e.clientX - pan.sx) / rect.width) * v.w;
      const dy = ((e.clientY - pan.sy) / rect.height) * v.h;
      if (Math.abs(e.clientX - pan.sx) + Math.abs(e.clientY - pan.sy) > 3) pan.moved = true;
      set({ ...v, x: pan.vx - dx, y: pan.vy - dy });
      return true;
    }
    return false;
  }

  /** Ends a pan/pinch for one pointer. Returns whether one was active and if it moved. */
  function endPan(e: PointerEvent): { wasPanning: boolean; moved: boolean } {
    if (!pointers.has(e.pointerId)) return { wasPanning: false, moved: false };
    const svgEl = getSvgEl();
    if (svgEl?.hasPointerCapture(e.pointerId)) svgEl.releasePointerCapture(e.pointerId);
    pointers.delete(e.pointerId);
    const moved = pan?.moved ?? false;

    if (pinch) {
      pinch = null;
      if (pointers.size >= 2) {
        startPinch(); // still pinching — reseat baseline to remaining fingers
      } else if (pointers.size === 1) {
        // One finger left: continue as a pan, anchored to it (no jump).
        const [p] = [...pointers.values()];
        const v = vb();
        pan = { sx: p.x, sy: p.y, vx: v.x, vy: v.y, moved: false };
        panning.set(true);
      } else {
        panning.set(false);
      }
      return { wasPanning: true, moved: false };
    }

    pan = null;
    if (pointers.size === 0) panning.set(false);
    return { wasPanning: true, moved };
  }

  /** Space is the pan modifier (Figma-style); ignored while typing in fields. */
  function handleKey(e: KeyboardEvent, down: boolean) {
    if (e.key !== ' ') return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    )
      return;
    spaceDown.set(down);
    if (pointerInside && down) e.preventDefault();
  }

  return {
    viewBox,
    spaceDown,
    panning,
    clientToSvg,
    svgToClient,
    zoomToFit,
    zoomIn,
    zoomOut,
    flyTo,
    flyToFit,
    handleWheel,
    tryStartPan,
    movePan,
    endPan,
    handleKey,
    setPointerInside: (inside: boolean) => (pointerInside = inside)
  };
}

export type PanZoom = ReturnType<typeof createPanZoom>;
