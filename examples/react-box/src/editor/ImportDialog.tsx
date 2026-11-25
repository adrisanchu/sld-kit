import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompositeDocument, Point, SldDocument } from '@sld-kit/core';
import { FileJson, FolderOpen, Sparkles, X } from 'lucide-react';
import { voltageFill } from '../fixture';
import { createPlan, feederPairs, finishPlan, placeDiagrams, type BatchRead, type PlacementMode } from '../importBatch';
import { sampleBatch } from '../samples/sampleBatch';

export interface ImportDialogProps {
  /** Names already on the canvas: an imported diagram with the same name is flagged (still imported). */
  existingNames: string[];
  /** Box size per diagram id, measured with the canvas's own engine. */
  sizesOf: (docs: SldDocument[]) => Map<string, { width: number; height: number }>;
  /** Append these diagrams at these (origin-relative) positions. */
  onAppend: (docs: SldDocument[], positions: Map<string, Point>) => void;
  /** Replace the canvas with this composite. */
  onOpen: (composite: CompositeDocument) => void;
  onCancel: () => void;
}

/** One file to read: a picked/dropped `File`, or a generated sample. */
interface Source {
  path: string;
  /** The file's text, or undefined when it isn't JSON (reported as skipped). */
  read: () => Promise<string | undefined>;
}

/** Yield to the browser every N files so the progress bar can repaint. */
const YIELD_EVERY = 25;

const fromFiles = (files: FileList | File[]): Source[] =>
  [...files]
    // Dotfiles (.DS_Store, …) are OS noise, not content: drop them silently.
    .filter((f) => !f.name.startsWith('.'))
    .map((f) => ({
      path: f.webkitRelativePath || f.name,
      read: async () => (f.name.toLowerCase().endsWith('.json') ? f.text() : undefined)
    }));

const STATUS_STYLE: Record<string, string> = {
  imported: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
  skipped: 'text-muted-foreground'
};

/**
 * Bulk import: pick files, a folder or drop them; core's `ImportPlan` checks
 * each one and reports it. Diagrams are then placed — geographically from
 * `meta.location` (with a compaction slider and a live preview) or in a grid —
 * and appended as one undoable step. A batch holding a composite opens it
 * instead, replacing the canvas.
 */
export function ImportDialog({ existingNames, sizesOf, onAppend, onOpen, onCancel }: ImportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [read, setRead] = useState<BatchRead | null>(null);
  const [mode, setMode] = useState<PlacementMode>('geo');
  const [compaction, setCompaction] = useState(0.6);
  const [dragOver, setDragOver] = useState(false);

  const load = async (sources: Source[]) => {
    setRead(null);
    setProgress({ done: 0, total: sources.length });
    const plan = createPlan(existingNames);
    for (let i = 0; i < sources.length; i++) {
      plan.add({ path: sources[i].path, text: await sources[i].read() });
      if ((i + 1) % YIELD_EVERY === 0 || i + 1 === sources.length) {
        setProgress({ done: i + 1, total: sources.length });
        await new Promise((r) => setTimeout(r));
      }
    }
    const result = finishPlan(plan);
    setMode(result.diagrams.some((d) => d.meta.location) ? 'geo' : 'grid');
    setRead(result);
    setProgress(null);
  };
  const loadSample = () => load(sampleBatch().map((f) => ({ path: f.path, read: async () => f.text })));

  const located = read?.diagrams.filter((d) => d.meta.location).length ?? 0;
  const sizes = useMemo(() => (read ? sizesOf(read.diagrams) : null), [read, sizesOf]);
  const positions = useMemo(
    () => (read && sizes ? placeDiagrams(read.diagrams, sizes, { mode, compaction }) : null),
    [read, sizes, mode, compaction]
  );
  const counts = useMemo(() => {
    const c = { imported: 0, warning: 0, error: 0, skipped: 0 };
    for (const r of read?.results ?? []) c[r.status]++;
    return c;
  }, [read]);

  const busy = progress !== null;
  const canAppend = !!read && !read.composite && read.diagrams.length > 0 && !!positions;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[min(760px,94vw)] max-w-none overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold">Import diagrams</h2>
        <p className="mr-auto text-xs text-muted-foreground">
          Diagram JSON files are added to the canvas; a composite file opens instead.
        </p>
        <button
          type="button"
          title="Close"
          disabled={busy}
          onClick={onCancel}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex max-h-[78dvh] flex-col gap-3 overflow-y-auto p-4 text-sm">
        {/* Pick: files, a folder, a drop, or the fictional sample. */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!busy && e.dataTransfer.files.length) load(fromFiles(e.dataTransfer.files));
          }}
          className={`flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border'
          }`}
        >
          <span className="w-full text-center text-xs text-muted-foreground">Drop .json files here, or</span>
          <PickButton
            icon={<FileJson className="h-3.5 w-3.5" />}
            label="Choose files"
            disabled={busy}
            onFiles={(f) => load(fromFiles(f))}
          />
          <PickButton
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            label="Choose folder"
            folder
            disabled={busy}
            onFiles={(f) => load(fromFiles(f))}
          />
          <button
            type="button"
            disabled={busy}
            onClick={loadSample}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" /> Try a sample batch
          </button>
        </div>

        {progress && (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Checking {progress.done} / {progress.total} files…
            </p>
          </div>
        )}

        {read && (
          <>
            {/* Report: one row per file. */}
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                {read.results.length} files · {counts.imported} ok
                {counts.warning > 0 && ` · ${counts.warning} with warnings`}
                {counts.error > 0 && ` · ${counts.error} invalid`}
                {counts.skipped > 0 && ` · ${counts.skipped} skipped`}
              </p>
              <ul className="max-h-36 overflow-y-auto rounded-md border border-border text-xs">
                {read.results.map((r, i) => (
                  <li key={i} className="flex gap-2 border-b border-border px-2 py-1 last:border-b-0">
                    <span className={`w-16 shrink-0 ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                    <span className="w-56 shrink-0 truncate font-mono" title={r.path}>
                      {r.path}
                    </span>
                    <span className="truncate text-muted-foreground" title={r.messages.join('\n')}>
                      {r.messages.join(' · ') || r.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {read.composite ? (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs">
                This batch holds the composite <strong>{read.composite.meta.name}</strong> (
                {read.composite.allChildren().length} substations). Opening it <strong>replaces the canvas</strong> and
                its undo history.
              </p>
            ) : (
              read.diagrams.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-muted-foreground">Placement</span>
                    <div className="flex rounded-md border border-border p-0.5">
                      {(['geo', 'grid'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          disabled={m === 'geo' && located === 0}
                          onClick={() => setMode(m)}
                          className={`rounded px-2 py-0.5 transition-colors disabled:opacity-40 ${
                            mode === m
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {m === 'geo' ? 'Geographic' : 'Grid'}
                        </button>
                      ))}
                    </div>
                    {mode === 'geo' && (
                      <label className="flex items-center gap-2 text-muted-foreground">
                        True distances
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={compaction}
                          onChange={(e) => setCompaction(Number(e.target.value))}
                        />
                        Even spacing
                      </label>
                    )}
                    <span className="ml-auto text-muted-foreground">
                      {located} of {read.diagrams.length} have a location
                      {mode === 'geo' && located < read.diagrams.length && ' (the rest go in a grid below)'}
                    </span>
                  </div>
                  {positions && sizes && <Preview docs={read.diagrams} positions={positions} sizes={sizes} />}
                </div>
              )
            )}
          </>
        )}
      </div>

      <footer className="flex justify-end gap-2 border-t border-border px-4 py-2 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1 hover:bg-accent"
        >
          Cancel
        </button>
        {read?.composite ? (
          <button
            type="button"
            onClick={() => read.composite && onOpen(read.composite)}
            className="rounded-md bg-primary px-3 py-1 text-primary-foreground"
          >
            Open composite
          </button>
        ) : (
          <button
            type="button"
            disabled={!canAppend}
            onClick={() => read && positions && onAppend(read.diagrams, positions)}
            className="rounded-md bg-primary px-3 py-1 text-primary-foreground disabled:opacity-40"
          >
            {read && read.diagrams.length > 0
              ? `Import ${read.diagrams.length} substation${read.diagrams.length === 1 ? '' : 's'}`
              : 'Import'}
          </button>
        )}
      </footer>
    </dialog>
  );
}

/** A file / folder picker as a button. */
function PickButton({
  icon,
  label,
  folder = false,
  disabled,
  onFiles
}: {
  icon: React.ReactNode;
  label: string;
  folder?: boolean;
  disabled: boolean;
  onFiles: (files: FileList) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-40"
      >
        {icon} {label}
      </button>
      <input
        ref={ref}
        type="file"
        hidden
        multiple
        accept={folder ? undefined : '.json,application/json'}
        // Not in React's typings: lets the picker choose a whole folder.
        {...(folder ? { webkitdirectory: '' } : {})}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = ''; // picking the same files again still fires
        }}
      />
    </>
  );
}

/** A thumbnail of the placement: boxes by voltage, the lines the import will draw. */
function Preview({
  docs,
  positions,
  sizes
}: {
  docs: SldDocument[];
  positions: Map<string, Point>;
  sizes: Map<string, { width: number; height: number }>;
}) {
  const pairs = useMemo(() => feederPairs(docs.map((d) => ({ key: d.meta.id, doc: d }))), [docs]);
  const rect = (id: string) => {
    const p = positions.get(id) ?? { x: 0, y: 0 };
    const s = sizes.get(id) ?? { width: 200, height: 72 };
    return { ...p, ...s };
  };
  const rects = docs.map((d) => ({ doc: d, ...rect(d.meta.id) }));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  const pad = 80;
  const centre = (id: string) => {
    const r = rect(id);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${maxX + 2 * pad} ${maxY + 2 * pad}`}
      className="h-64 w-full rounded-md border border-border bg-muted/30"
      preserveAspectRatio="xMidYMid meet"
    >
      {pairs.map((p) => {
        const a = centre(p.a);
        const b = centre(p.b);
        return (
          <line
            key={p.connectionId}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#94a3b8"
            strokeWidth={Math.max(4, maxX / 400)}
          />
        );
      })}
      {rects.map((r) => (
        <rect
          key={r.doc.meta.id}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          rx={8}
          fill={voltageFill(r.doc.meta.voltageKv)}
          stroke="#64748b"
          strokeWidth={Math.max(3, maxX / 600)}
        >
          <title>{r.doc.meta.name}</title>
        </rect>
      ))}
    </svg>
  );
}
