import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Gap between the anchor point and the panel, and the panel and the viewport edge (px). */
const OFFSET = 10;
const MARGIN = 8;

export interface FloatingProps {
  /** Anchor in viewport (client) coordinates, e.g. the click that opened it. */
  clientX: number;
  clientY: number;
  className?: string;
  children: ReactNode;
}

/**
 * A popover panel portalled to `<body>` and positioned in the viewport, so it
 * measures against the real window rather than its container. It opens below
 * right of the anchor, flips left / up when it would overflow, and finally
 * clamps inside the viewport. Hidden until measured (no first-frame jump).
 *
 * Canvas-bound events are stopped here: a portal still bubbles React events
 * through its React parent, which sits inside the canvas container.
 */
export function Floating({ clientX, clientY, className = '', children }: FloatingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = clientX + OFFSET;
      let top = clientY + OFFSET;
      if (left + width > vw - MARGIN) left = clientX - OFFSET - width; // flip left
      if (top + height > vh - MARGIN) top = clientY - OFFSET - height; // flip up
      left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - width - MARGIN));
      top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - height - MARGIN));
      setPos({ left, top });
    };
    place();
    // Re-place when the window resizes or the content changes size (e.g. the
    // line popover swapping its season grid for the MVA field).
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [clientX, clientY]);

  return createPortal(
    <div
      ref={ref}
      className={`sld-pop fixed z-50 ${className}`}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
