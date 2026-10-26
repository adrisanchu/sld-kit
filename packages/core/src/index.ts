/**
 * Public API of `@sld-kit/core` — the headless, framework-agnostic engine
 * for single-line diagrams. Nothing in here (or below) imports a UI
 * framework; all styling is injected via `SldTheme`.
 */

export * from './types';
export { newId } from './ids';
export { SLD_LAYOUT, type SldLayoutConfig, type BusBarLabelAnchor } from './layout';
export {
  DEFAULT_THEME,
  positionColors,
  elementFormat,
  resolveFormat,
  touchesOpenPosition,
  SWITCH_OPEN_FORMAT,
  SWITCH_OPEN_CONNECTION_FORMAT,
  firstFormat,
  resolveTheme,
  type SldTheme,
  type PositionTypeColors,
  type ElementFormat,
  type ElementFormatResolver,
  type FormatContext
} from './theme';
export { getElementData } from './data';

export { SldElement } from './elements/Element';
export { BusBar, type BusBarOptions } from './elements/BusBar';
export { Position, effectiveState, type PositionOptions } from './elements/Position';
export { Connection, type ConnectionOptions } from './elements/Connection';
export { element, external } from './elements/endpoints';
export { elementFromJson } from './elements/factory';

export { SldDocument } from './SldDocument';
export { Grid, type MovePlan } from './Grid';
export { planPositionWiring, autoWire, type WiringPlan, type AutoWireOptions } from './wiring';
export {
  buildDocument,
  type BuildDocumentSpec,
  type BaySpec,
  type BayPositionSpec,
  type BusBarSpec,
  type FeederSpec
} from './buildDocument';
export { nextPositionLabel, nextExternalLabel, POSITION_LABEL_PREFIX, EXTERNAL_LABEL_PREFIX } from './naming';

export { type Point, type Rect, rectCenter, rectContains, arrowheadPath } from './layout/geometry';
export { connectionPath } from './layout/paths';
export { detectCrossings } from './layout/crossings';
export {
  LayoutEngine,
  type DiagramLayout,
  type ElementGeometry,
  type BusBarGeometry,
  type BusBarLabelResolver,
  type LayoutEngineOptions,
  type PositionGeometry,
  type ConnectionGeometry
} from './layout/LayoutEngine';

export { type Command, CommandStack, BatchCommand } from './commands/Command';
export {
  AddElementCommand,
  AddPositionCommand,
  DeleteElementsCommand,
  MoveElementCommand,
  UpdateElementCommand,
  RenameElementCommand,
  AddBusBarCommand,
  SnapshotCommand,
  AddLaneCommand,
  RemoveLaneCommand,
  type LaneKind
} from './commands/commands';

export { Serializer, SldParseError, DuplicateIdError, SLD_SCHEMA_VERSION } from './serialization/Serializer';

export { SymbolRegistry, type SymbolDef, type SymbolShape } from './symbols/SymbolRegistry';
export { registerDefaultSymbols, createDefaultSymbolRegistry } from './symbols/defaults';

export { SvgBuilder, type SvgAttrs, type SvgAttrValue } from './export/SvgBuilder';
export { SvgExporter, type SvgExportOptions } from './export/SvgExporter';

// ── Composite ("diagram of diagrams") ────────────────────────────────────────
export { Transform2D } from './layout/Transform2D';
export { type DocumentResolver, MapResolver } from './composite/DocumentResolver';
export {
  DiagramInstance,
  LABEL_ANCHORS,
  normalizeQuarterTurn,
  type DiagramInstanceJson,
  type DiagramInstanceOptions,
  type LabelAnchor,
  type LabelPlacement
} from './composite/DiagramInstance';
export {
  CompositeLine,
  DEFAULT_LINE_KIND,
  type CompositeLineKind,
  type CompositeLineJson,
  type LineVertexJson
} from './composite/CompositeLine';
export {
  orthogonalizePolyline,
  routePolyline,
  DEFAULT_LINE_ROUTING,
  type LineRouting
} from './composite/routing';
export { chordFrame, type ChordFrame, type RelCoord } from './composite/lineFrame';
// Floating-connector box router (promoted from the react-box example).
export { Port, SIDE_VECTORS, sideAxis, sideFromAngle, rotateSide, facingSide, type BoxSide } from './composite/ports';
export { OrthogonalRouter } from './composite/OrthogonalRouter';
export { PortResolver, feederKey, type PortResolverOptions } from './composite/PortResolver';
export { segmentAngleDeg, simplify, arcMidpoint } from './composite/polyline';
export {
  STUB_LENGTH,
  ALIGN_TOLERANCE,
  BOX_SIZE,
  LINE_LABEL_FONT_SIZE,
  LINE_LABEL_LINE_HEIGHT,
  DEMAND_LEAD_LENGTH,
  CABLE_DASH_ARRAY,
  TRANSFORMER_SYMBOL,
  DEMAND_SYMBOL
} from './composite/layout-constants';
export { CompositeDocument, type CompositeMeta, type CompositeChange } from './composite/CompositeDocument';
export {
  CompositeLayoutEngine,
  BOX_CHILD_LAYOUT,
  labelFlipDeg,
  linkConnections,
  lineConnections,
  linkFormat,
  lineFormat,
  resolveNameLabelLayout,
  PLACEHOLDER_FRAME,
  NAME_LABEL_PAD,
  NAME_LABEL_FONT_SIZE,
  type ChildLayout,
  type CompositeLayoutOptions,
  type CompositeLayoutRequest,
  type NameLabelLayout,
  type CompositeLink,
  type CompositeLineLayout,
  type LineLabelLayout,
  type LineLabelResolver,
  placeLineLabel,
  type LineGlyph,
  type ExternalConnectionTip,
  type CompositeLayout
} from './composite/CompositeLayoutEngine';
export {
  CompositeSerializer,
  COMPOSITE_SCHEMA_VERSION,
  type CompositeDocumentJson
} from './composite/CompositeSerializer';
export { CompositeSvgExporter, type CompositeSvgExportOptions } from './composite/CompositeSvgExporter';
export {
  BOX_SECTION_GAP,
  layoutSectionBoxes,
  type BoxSection,
  type BoxSectionSplit,
  type BoxSectionsResolver,
  type SectionBox,
  type SectionTie
} from './composite/sections';
export {
  AddChildCommand,
  RemoveChildCommand,
  TransformChildCommand,
  SetChildLabelCommand,
  AddLineCommand,
  RemoveLineCommand,
  UpdateLineCommand,
  UpdateLineKindCommand,
  SetLineDataCommand,
  SetBoxModeCommand,
  SetPortDirectionCommand,
  ChildDocumentCommand,
  SetAutoFacingCommand
} from './composite/commands';
