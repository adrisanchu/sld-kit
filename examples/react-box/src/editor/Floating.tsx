import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Gap between the anchor point and the panel, and the panel and the viewport edge (px). */
const OFFSET = 14;
const MARGIN = 8;

/** Where a popover is attached, in viewport (client) px; `null` = its anchor is out of view. */
export type AnchorFn = () => { x: number; y: number } | null;

export interface FloatingProps {
  /**
   * Polled every animation frame, so the panel follows its source element as
   * the canvas pans / zooms (the canvas exposes no view-change event).
   */
  anchor: AnchorFn;
  /** The anchor left the view (scrolled / zoomed away): the owner closes it. */
  onDetach?: () => void;
  className?: string;
  children: ReactNode;
}

/**
 * A popover panel portalled to `<body>`, positioned in the viewport and
 * **tethered** to a point on the canvas: below-right of the anchor, flipping
 * left / up when it would overflow, then clamped inside the window. Moved by
 * writing `left` / `top` directly (no React render per frame).
 *
 * Canvas-bound events are stopped here: a portal still bubbles React events
 * through its React parent, which sits inside the canvas container.
 */
export function Floating({ anchor, onDetach, className = '', children }: FloatingProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Latest callbacks without restarting the frame loop.
  const anchorRef = useRef(anchor);
  const detachRef = useRef(onDetach);
  anchorRef.current = anchor;
  detachRef.current = onDetach;

  useLayoutEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const el = ref.current;
      const a = anchorRef.current();
      if (!el) return;
      if (!a) {
        detachRef.current?.();
        return; // stop: the owner unmounts us
      }
      const { width, height } = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = a.x + OFFSET;
      let top = a.y + OFFSET;
      if (left + width > vw - MARGIN) left = a.x - OFFSET - width; // flip left
      if (top + height > vh - MARGIN) top = a.y - OFFSET - height; // flip up
      left = Math.round(Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - width - MARGIN)));
      top = Math.round(Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - height - MARGIN)));
      const key = `${left},${top}`;
      if (key !== last) {
        last = key;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.visibility = 'visible';
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return createPortal(
    <div
      ref={ref}
      className={`sld-pop fixed z-50 ${className}`}
      style={{ left: 0, top: 0, visibility: 'hidden' }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
