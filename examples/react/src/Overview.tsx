import { useMemo, useRef, useState } from 'react';
import { CompositeLayoutEngine, LayoutEngine } from '@sld-kit/core';
import {
  CompositeExplorer,
  type CompositeExplorerHandle,
  type FlowResolver,
  type LineLabelResolver
} from '@sld-kit/react';
import { Maximize, Pause, Play, ZoomIn, ZoomOut } from 'lucide-react';
import { buildExampleComposite } from './fixture';

/** Stable pseudo-random 0–1 from a string key, so each line's flow reads distinct. */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * The composite "operate & watch" overview: two levels tied by their shared TIE
 * feeder, with a domain-agnostic flow overlay animating every wire. Demonstrates
 * `CompositeExplorer` (→ `CompositeCanvas`, `ChildDiagramView`, `FlowOverlay`,
 * `LineLabelOverlay`, `worldLines`). The flow model is a toy — random-but-stable
 * intensities — since the library knows nothing about what "flow" means.
 */
export function Overview() {
  const [composite] = useState(buildExampleComposite);
  const engine = useMemo(() => new CompositeLayoutEngine(new LayoutEngine()), []);
  const layout = useMemo(() => engine.layout(composite), [engine, composite]);

  const explorerRef = useRef<CompositeExplorerHandle>(null);
  const [paused, setPaused] = useState(false);

  // Every line flows; intensity/speed vary per key. The tie carries the strongest.
  const resolveFlow = useMemo<FlowResolver>(
    () => (key) => {
      const t = hash01(key);
      const tie = key === 'link:tie-1';
      return { active: true, direction: 1, speed: 0.6 + t, intensity: tie ? 1 : 0.4 + 0.6 * t };
    },
    []
  );
  const resolveLineLabel = useMemo<LineLabelResolver>(
    () => (key) => (key === 'link:tie-1' ? { text: '120 MW', rotate: false } : null),
    []
  );

  return (
    <div className="h-full">
      <div className="flex flex-col mt-2 ml-4 mb-[-1.5rem]">
        <p className="pointer-events-none text-xs text-muted-foreground">
        Click a diagram to fly into it; click the background (or the fit button) to fly back out.
      </p>
      <p className="pointer-events-none text-xs text-muted-foreground">
        The flow overlay is a toy model, since the library knows nothing about what "flow" means.
      </p>
      </div>
      <CompositeExplorer
        ref={explorerRef}
        layout={layout}
        resolveFlow={resolveFlow}
        resolveLineLabel={resolveLineLabel}
        paused={paused}
      />

      {/* Minimal chrome. CompositeToolbar is the editor's toolbar; the explorer is
          read-only, so a couple of view controls are all it needs. */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/80 px-1 py-1 shadow-lg backdrop-blur-sm">
        <ExplorerButton title="Zoom out" onClick={() => explorerRef.current?.zoomOut()}>
          <ZoomOut className="h-4 w-4" />
        </ExplorerButton>
        <ExplorerButton title="Zoom in" onClick={() => explorerRef.current?.zoomIn()}>
          <ZoomIn className="h-4 w-4" />
        </ExplorerButton>
        <ExplorerButton title="Fly out / fit" onClick={() => explorerRef.current?.blur()}>
          <Maximize className="h-4 w-4" />
        </ExplorerButton>
        <ExplorerButton title={paused ? 'Resume flow' : 'Pause flow'} onClick={() => setPaused((p) => !p)}>
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </ExplorerButton>
      </div>
    </div>
  );
}

function ExplorerButton({
  title,
  onClick,
  children
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
