import { writable, type Writable } from 'svelte/store';
import type { Point } from '@sld-kit/core';

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
 */
export function createPanZoom(getSvgEl: () => SVGSVGElement | undefined, getContentBounds: () => ContentBounds) {
  const viewBox: Writable<ViewBox> = writable({ x: 0, y: 0, w: 1000, h: 750 });
  const spaceDown = writable(false);
  const panning = writable(false);

  let vb: ViewBox = { x: 0, y: 0, w: 1000, h: 750 };
  viewBox.subscribe((v) => (vb = v));
  let fitScale = 1;
  let space = false;
  spaceDown.subscribe((v) => (space = v));
  let pan: { sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null;
  let pointerInside = false;
  let flyRaf: number | null = null;

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
    const from = { ...vb };
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
    return {
      x: vb.x + ((clientX - rect.left) / rect.width) * vb.w,
      y: vb.y + ((clientY - rect.top) / rect.height) * vb.h
    };
  }

  function svgToClient(svgX: number, svgY: number): Point {
    const svgEl = getSvgEl();
    if (!svgEl) return { x: 0, y: 0 };
    const rect = svgEl.getBoundingClientRect();
    return {
      x: rect.left + ((svgX - vb.x) / vb.w) * rect.width,
      y: rect.top + ((svgY - vb.y) / vb.h) * rect.height
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
    const current = rect.width / vb.w;
    const target = Math.min(fitScale * 8, Math.max(fitScale * 0.1, current / factor));
    const f = current / target;
    set({
      x: anchor.x - (anchor.x - vb.x) * f,
      y: anchor.y - (anchor.y - vb.y) * f,
      w: vb.w * f,
      h: vb.h * f
    });
  }

  function handleWheel(e: WheelEvent) {
    const svgEl = getSvgEl();
    if (!svgEl) return;
    cancelFly();
    const rect = svgEl.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      zoomAbout(clientToSvg(e.clientX, e.clientY), Math.exp(e.deltaY * 0.01));
    } else {
      set({ ...vb, x: vb.x + (e.deltaX / rect.width) * vb.w, y: vb.y + (e.deltaY / rect.height) * vb.h });
    }
  }

  /** Begin a pan on middle-button, or left-button while space is held. */
  function tryStartPan(e: PointerEvent): boolean {
    const svgEl = getSvgEl();
    if (!svgEl) return false;
    if (e.button === 1 || (e.button === 0 && space)) {
      cancelFly();
      pan = { sx: e.clientX, sy: e.clientY, vx: vb.x, vy: vb.y, moved: false };
      panning.set(true);
      svgEl.setPointerCapture(e.pointerId);
      e.preventDefault();
      return true;
    }
    return false;
  }

  /** Returns true if a pan is in progress (caller should skip its own logic). */
  function movePan(e: PointerEvent): boolean {
    if (!pan) return false;
    const svgEl = getSvgEl();
    if (!svgEl) return true;
    const rect = svgEl.getBoundingClientRect();
    const dx = ((e.clientX - pan.sx) / rect.width) * vb.w;
    const dy = ((e.clientY - pan.sy) / rect.height) * vb.h;
    if (Math.abs(e.clientX - pan.sx) + Math.abs(e.clientY - pan.sy) > 3) pan.moved = true;
    set({ ...vb, x: pan.vx - dx, y: pan.vy - dy });
    return true;
  }

  /** Ends any pan. Returns whether a pan was active and whether it actually moved. */
  function endPan(e: PointerEvent): { wasPanning: boolean; moved: boolean } {
    if (!pan) return { wasPanning: false, moved: false };
    const svgEl = getSvgEl();
    if (svgEl?.hasPointerCapture(e.pointerId)) svgEl.releasePointerCapture(e.pointerId);
    const moved = pan.moved;
    pan = null;
    panning.set(false);
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
