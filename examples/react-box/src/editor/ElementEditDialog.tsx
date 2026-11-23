import { useEffect, useId, useRef, useState } from 'react';
import {
  Connection,
  DEFAULT_POSITION_TYPES,
  EXTERNAL_ASSET_KINDS,
  Position,
  updateExternal,
  type ConnectionJson,
  type ElementJson,
  type ExternalAssetKind,
  type ExternalDirection,
  type ExternalEndpoint,
  type PositionType,
  type SldElement
} from '@sld-kit/core';
import { DEFAULT_EXTERNAL_ASSET_LABELS, DEFAULT_POSITION_TYPE_LABELS } from '@sld-kit/react';

type Tap = 'auto' | 'above' | 'below';

const DIRECTIONS: { value: 'auto' | ExternalDirection; label: string }[] = [
  { value: 'auto', label: 'Automatic (derived ↑/↓)' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' }
];
const TAPS: { value: Tap; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'above', label: 'Above' },
  { value: 'below', label: 'Below' }
];
const LANES: { value: 'left' | 'right'; label: string }[] = [
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' }
];

/** Bus number a bar carries in `data` (shown in the box sub-label). */
interface BarData {
  busId?: number;
}

export interface ElementEditDialogProps {
  element: SldElement;
  /**
   * Why the Identifier can't change, if it can't: a feeder's id is the box's
   * terminal, so renaming one that lines attach to would drop those lines.
   */
  idLockedReason?: string;
  /** Apply the edited JSON; return the problems that kept it from applying (empty = applied). */
  onSave: (json: ElementJson) => string[];
  onCancel: () => void;
}

/**
 * Properties dialog for one element of the substation being edited, opened by
 * double-clicking it: a bay's id, name and type; a bar's id, name and bus
 * number; a feeder's asset, direction, connection point and lane. A port of the
 * Svelte example's `ElementEditDialog` (minus commissioning, a Svelte-example
 * concept). It only builds JSON; the parent validates it and applies it through
 * undoable commands, and keeps the dialog open with the problems if it can't.
 */
export function ElementEditDialog({ element, idLockedReason, onSave, onCancel }: ElementEditDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;

  // Seeded once: the parent keys this component by element id.
  const [seed] = useState((): { extSide: 'from' | 'to' | null; ext: ExternalEndpoint | undefined; tap: Tap } => {
    const conn = element instanceof Connection ? element : null;
    const extSide = conn ? (conn.from.kind === 'external' ? 'from' : conn.to.kind === 'external' ? 'to' : null) : null;
    const ext = conn && extSide ? (conn[extSide] as ExternalEndpoint) : undefined;
    const posEnd = conn && extSide ? conn[extSide === 'from' ? 'to' : 'from'] : null;
    return {
      extSide,
      ext,
      tap: (posEnd?.kind === 'element' ? posEnd.tap : undefined) ?? 'auto'
    };
  });
  const [id, setId] = useState(element.id);
  const [label, setLabel] = useState(element.label);
  const [posType, setPosType] = useState<PositionType>(element instanceof Position ? element.type : 'line');
  const [busId, setBusId] = useState(() => {
    const n = (element.data as BarData | undefined)?.busId;
    return n != null ? String(n) : '';
  });
  const [asset, setAsset] = useState<ExternalAssetKind>(seed.ext?.asset ?? 'line');
  const [extLabel, setExtLabel] = useState(seed.ext?.label ?? '');
  const [branchLabel, setBranchLabel] = useState(seed.ext?.branch?.label ?? '');
  const [direction, setDirection] = useState<'auto' | ExternalDirection>(seed.ext?.direction ?? 'auto');
  const [tap, setTap] = useState<Tap>(seed.tap);
  const [lane, setLane] = useState<'left' | 'right'>(seed.ext?.side ?? 'right');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const kind = element.kind;
  const isFeeder = kind === 'connection' && seed.extSide !== null;
  const horizontal = direction === 'left' || direction === 'right';
  const title =
    kind === 'busbar'
      ? 'Edit bus bar'
      : kind === 'position'
        ? 'Edit position'
        : isFeeder
          ? 'Edit external asset'
          : 'Edit connection';

  const save = () => {
    const problems: string[] = [];
    const json = element.toJSON();
    json.id = idLockedReason ? element.id : id.trim() || element.id;
    json.label = label;
    if (json.kind === 'position') {
      json.type = posType;
    } else if (json.kind === 'busbar') {
      const t = busId.trim();
      const data = { ...((json.data as BarData | undefined) ?? {}) };
      if (t === '') delete data.busId;
      else if (Number.isInteger(Number(t))) data.busId = Number(t);
      else problems.push('Bus id must be a whole number.');
      json.data = Object.keys(data).length ? data : undefined;
      if (json.data === undefined) delete json.data;
    } else if (json.kind === 'connection' && seed.extSide) {
      const conn = json as ConnectionJson;
      const dir = direction !== 'auto' ? direction : undefined;
      // `updateExternal` keeps, mints or drops the transformer3w branch, so the
      // document stays valid whatever the asset change. Left/right exits
      // ignore the lane side (the direction picks the edge).
      conn[seed.extSide] = updateExternal(seed.ext, {
        asset,
        label: extLabel.trim() || 'NEW',
        direction: dir,
        side: !horizontal && lane !== 'right' ? lane : undefined,
        branchLabel
      });
      // The connection point lives on the bay's (element) endpoint; Automatic = unset.
      const elKey: 'from' | 'to' = seed.extSide === 'from' ? 'to' : 'from';
      const elEnd = conn[elKey];
      if (elEnd.kind === 'element') conn[elKey] = { kind: 'element', id: elEnd.id, ...(tap === 'auto' ? {} : { tap }) };
    }
    if (problems.length === 0) problems.push(...onSave(json));
    setErrors(problems);
  };

  const input =
    'w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground disabled:opacity-60';
  const field = (name: string, text: string, control: React.ReactNode, hint?: React.ReactNode) => (
    <div className="space-y-1">
      <label htmlFor={fid(name)} className="block text-xs font-medium text-muted-foreground">
        {text}
      </label>
      {control}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  const select = <T extends string>(
    name: string,
    value: T,
    options: { value: T; label: string }[],
    set: (v: T) => void,
    disabled = false
  ) => (
    <select
      id={fid(name)}
      value={value}
      disabled={disabled}
      onChange={(e) => set(e.target.value as T)}
      className={input}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <dialog
      ref={ref}
      // Esc closes natively; route it through Cancel so the parent unmounts us.
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }}
      className="m-auto max-h-[85dvh] open:flex w-[min(24rem,92vw)] flex-col overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h2>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {field(
            'id',
            'Identifier',
            <input
              id={fid('id')}
              value={idLockedReason ? element.id : id}
              disabled={!!idLockedReason}
              onChange={(e) => setId(e.target.value)}
              className={input}
            />,
            idLockedReason ??
              'Unique within the diagram. Two diagrams sharing the same identifier become connected in the composite model.'
          )}

          {kind === 'position' && (
            <>
              {field(
                'name',
                'Name / code',
                <input id={fid('name')} value={label} onChange={(e) => setLabel(e.target.value)} className={input} />
              )}
              {field(
                'type',
                'Type',
                select(
                  'type',
                  posType,
                  DEFAULT_POSITION_TYPES.map((t) => ({ value: t, label: DEFAULT_POSITION_TYPE_LABELS[t] ?? t })),
                  setPosType
                )
              )}
            </>
          )}

          {kind === 'busbar' && (
            <>
              {field(
                'name',
                'Name',
                <input id={fid('name')} value={label} onChange={(e) => setLabel(e.target.value)} className={input} />
              )}
              {field(
                'bus',
                'Bus id',
                <input
                  id={fid('bus')}
                  value={busId}
                  inputMode="numeric"
                  placeholder="e.g. 39770"
                  onChange={(e) => setBusId(e.target.value)}
                  className={input}
                />,
                'Shown in the box sub-label.'
              )}
            </>
          )}

          {isFeeder && (
            <>
              {field(
                'ext',
                'Name',
                <input
                  id={fid('ext')}
                  value={extLabel}
                  onChange={(e) => setExtLabel(e.target.value)}
                  className={input}
                />
              )}
              {field(
                'asset',
                'Asset',
                select(
                  'asset',
                  asset,
                  EXTERNAL_ASSET_KINDS.map((k) => ({ value: k, label: DEFAULT_EXTERNAL_ASSET_LABELS.kinds[k] })),
                  setAsset
                )
              )}
              {asset === 'transformer3w' &&
                field(
                  'branch',
                  'Third winding',
                  <input
                    id={fid('branch')}
                    value={branchLabel}
                    placeholder={DEFAULT_EXTERNAL_ASSET_LABELS.branchPlaceholder}
                    onChange={(e) => setBranchLabel(e.target.value)}
                    className={input}
                  />
                )}
              {field('dir', 'Direction', select('dir', direction, DIRECTIONS, setDirection))}
              {field('tap', 'Connection point', select('tap', tap, TAPS, setTap))}
              {field('lane', 'Lane side', select('lane', lane, LANES, setLane, horizontal))}
            </>
          )}

          {kind === 'connection' &&
            !isFeeder &&
            field(
              'label',
              'Label',
              <input
                id={fid('label')}
                value={label}
                placeholder="(no label)"
                onChange={(e) => setLabel(e.target.value)}
                className={input}
              />
            )}

          {errors.length > 0 && (
            <ul className="space-y-0.5 rounded bg-red-500/10 px-2 py-1 text-xs text-red-700 dark:text-red-300">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-4 py-2 text-xs">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-accent"
          >
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:opacity-90">
            Save
          </button>
        </footer>
      </form>
    </dialog>
  );
}
