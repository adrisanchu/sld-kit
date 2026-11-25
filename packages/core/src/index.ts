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
export { tallyPositions, type PositionTally, type TallyOptions } from './tally';

export { SldElement } from './elements/Element';
export { BusBar, type BusBarOptions } from './elements/BusBar';
export { Position, effectiveState, type PositionOptions } from './elements/Position';
export { Connection, type ConnectionOptions } from './elements/Connection';
export { element, external, updateExternal } from './elements/endpoints';
export { externalBranch, connectionForExternalId } from './elements/branch';
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
  type FeederSpec,
  type FeederSpecBase,
  type FeederBranchSpec
} from './buildDocument';
export { nextPositionLabel, nextExternalLabel, POSITION_LABEL_PREFIX, EXTERNAL_LABEL_PREFIX } from './naming';
export {
  ImportPlan,
  planImport,
  detectDocumentKind,
  type DocumentKind,
  type ImportStatus,
  type ImportInput,
  type ImportResult,
  type ImportContext,
  type PlannedDocument,
  type SaveOutcome
} from './batchImport';

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
  DEFAULT_LINE_NAME_PLACEMENT,
  LINE_NAME_ORIENTATIONS,
  LINE_NAME_ALONGS,
  LINE_NAME_SIDES,
  type LineNameOrientation,
  type LineNameAlong,
  type LineNameSide,
  type LineNamePlacement,
  type LineName,
  type LinkEnds,
  type CompositeLineKind,
  type CompositeLineJson,
  type LineVertexJson
} from './composite/CompositeLine';
export {
  orthogonalizePolyline,
  routePolyline,
  isOrthogonalRouting,
  DEFAULT_LINE_ROUTING,
  type LineRouting
} from './composite/routing';
export { chordFrame, type ChordFrame, type RelCoord } from './composite/lineFrame';
// Floating-connector box router (promoted from the react-box example).
export { Port, SIDE_VECTORS, sideAxis, sideFromAngle, rotateSide, facingSide, type BoxSide } from './composite/ports';
export { OrthogonalRouter, type OrthogonalRouterOptions, type RouteOptions } from './composite/OrthogonalRouter';
export { PortResolver, feederKey, type PortResolverOptions } from './composite/PortResolver';
export {
  segmentAngleDeg,
  simplify,
  arcMidpoint,
  pointAtFraction,
  roomyPointAtFraction,
  readableAngle,
  VERTICAL_READING_TOLERANCE
} from './composite/polyline';
export {
  STUB_LENGTH,
  ALIGN_TOLERANCE,
  OBSTACLE_CLEARANCE,
  BEND_PENALTY,
  CURVE_RADIUS,
  MIN_JOG,
  BOX_SIZE,
  LINE_LABEL_FONT_SIZE,
  LINE_LABEL_LINE_HEIGHT,
  LINE_NAME_FONT_SIZE,
  LINE_NAME_OFFSET,
  LINE_NAME_ALONG_FRACTION,
  LINE_NAME_MAX_LINE_FRACTION,
  LINE_NAME_MIN_SCALE,
  DEMAND_LEAD_LENGTH,
  HANGING_ASSETS,
  HANGING_STAGGER_STEP,
  HANGING_STAGGER_ROWS,
  TEXT_GROWTH_MAX_SIZE,
  CABLE_DASH_ARRAY,
  TRANSFORMER_SYMBOL,
  TRANSFORMER3W_SYMBOL,
  DEMAND_SYMBOL,
  PARALLEL_LANE_SPACING,
  LEADER_STROKE_WIDTH,
  LEADER_OPACITY,
  LEADER_DOT_RADIUS,
  DETAIL_SPREAD_GAP
} from './composite/layout-constants';
export { CompositeDocument, type CompositeMeta, type CompositeChange } from './composite/CompositeDocument';
export {
  CompositeLayoutEngine,
  BOX_CHILD_LAYOUT,
  labelFlipDeg,
  linkConnections,
  lineConnections,
  linkFormat,
  hangerFormat,
  linkNodeDots,
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
  type HangingTieLayout,
  type LineLabelLayout,
  type LineLabelResolver,
  placeLineLabel,
  placeLineName,
  lineNameLayout,
  lineLabelLayout,
  hangingLabelLayout,
  textGrowthCaps,
  readableTexts,
  readableTextSize,
  type TextGrowthCaps,
  type ReadableTexts,
  type HangingTieLabel,
  lineNameFitSize,
  fittedLineNameSize,
  readableLineNameSize,
  type LineNameLayout,
  type TextLeader,
  type LineGlyph,
  type ExternalConnectionTip,
  type CompositeLayout
} from './composite/CompositeLayoutEngine';
export { type TextSlot } from './composite/labelCollisions';
export {
  CompositeSerializer,
  COMPOSITE_SCHEMA_VERSION,
  type CompositeDocumentJson
} from './composite/CompositeSerializer';
export { CompositeSvgExporter, type CompositeSvgExportOptions } from './composite/CompositeSvgExporter';
export {
  BOX_SECTION_GAP,
  layoutSectionBoxes,
  sectionWorldCorners,
  type BoxSection,
  type BoxSectionSplit,
  type BoxSectionsResolver,
  type SectionBox,
  type SectionTie
} from './composite/sections';
export { tallyComposite, type CompositeTally } from './composite/tally';
export {
  removeOverlaps,
  projectLocations,
  arrangeByAnchors,
  type OverlapItem,
  type RemoveOverlapsOptions,
  type ArrangeItem,
  type ArrangeOptions
} from './composite/arrange';
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
  SetLineNameCommand,
  SetBoxModeCommand,
  SetPortDirectionCommand,
  ChildDocumentCommand,
  SetAutoFacingCommand,
  SetDefaultRoutingCommand
} from './composite/commands';
