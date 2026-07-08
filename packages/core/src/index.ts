/**
 * Public API of `@sld-kit/core` — the headless, framework-agnostic engine
 * for single-line diagrams. Nothing in here (or below) imports a UI
 * framework; all styling is injected via `SldTheme`.
 */

export * from './types';
export { newId } from './ids';
export { SLD_LAYOUT, type SldLayoutConfig } from './layout';
export { DEFAULT_THEME, positionColors, resolveTheme, type SldTheme, type PositionTypeColors } from './theme';
export { getElementData } from './data';

export { SldElement } from './elements/Element';
export { BusBar } from './elements/BusBar';
export { Position } from './elements/Position';
export { Connection } from './elements/Connection';
export { elementFromJson } from './elements/factory';

export { SldDocument } from './SldDocument';
export { Grid, type MovePlan } from './Grid';
export { planPositionWiring, type WiringPlan } from './wiring';
export { nextPositionLabel, nextExternalLabel, POSITION_LABEL_PREFIX, EXTERNAL_LABEL_PREFIX } from './naming';

export { type Point, type Rect, rectCenter, rectContains, arrowheadPath } from './layout/geometry';
export {
  LayoutEngine,
  type DiagramLayout,
  type ElementGeometry,
  type BusBarGeometry,
  type PositionGeometry,
  type ConnectionGeometry
} from './layout/LayoutEngine';

export { type Command, CommandStack } from './commands/Command';
export {
  AddElementCommand,
  AddPositionCommand,
  DeleteElementsCommand,
  MoveElementCommand,
  UpdateElementCommand,
  AddBusBarCommand,
  SnapshotCommand,
  AddLaneCommand,
  RemoveLaneCommand,
  type LaneKind
} from './commands/commands';

export { Serializer, SldParseError, SLD_SCHEMA_VERSION } from './serialization/Serializer';

export { SymbolRegistry, type SymbolDef, type SymbolShape } from './symbols/SymbolRegistry';
export { registerDefaultSymbols, createDefaultSymbolRegistry } from './symbols/defaults';

export { SvgBuilder, type SvgAttrs, type SvgAttrValue } from './export/SvgBuilder';
export { SvgExporter, type SvgExportOptions } from './export/SvgExporter';

// ── Composite ("diagram of diagrams") ────────────────────────────────────────
export { Transform2D } from './layout/Transform2D';
export { type DocumentResolver, MapResolver } from './composite/DocumentResolver';
export { DiagramInstance, type DiagramInstanceJson } from './composite/DiagramInstance';
export { CompositeDocument, type CompositeMeta, type CompositeChange } from './composite/CompositeDocument';
export {
  CompositeLayoutEngine,
  labelFlipDeg,
  PLACEHOLDER_FRAME,
  type ChildLayout,
  type CompositeLink,
  type CompositeLayout
} from './composite/CompositeLayoutEngine';
export {
  CompositeSerializer,
  COMPOSITE_SCHEMA_VERSION,
  type CompositeDocumentJson
} from './composite/CompositeSerializer';
export { CompositeSvgExporter, type CompositeSvgExportOptions } from './composite/CompositeSvgExporter';
export { AddChildCommand, RemoveChildCommand, TransformChildCommand } from './composite/commands';
