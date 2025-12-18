export type DrawingTool = "rectangle" | "circle" | "line" | "curve" | "dart";

// Internal shape tool that may include derived/converted forms.
export type ShapeTool = DrawingTool | "polygon";
export type Tool =
  | DrawingTool
  | "select"
  | "pan"
  | "node"
  | "measure"
  | "offset"
  | "mirror"
  | "unfold";

export type DartWidthMode = "symmetric" | "free";
export type DartLinkMode = "follow-edge" | "frozen";

export interface DartInstance {
  id: string;

  // Anchor along the polygon perimeter (0..1). Used when linkMode = follow-edge.
  anchorS?: number;

  // Frozen anchor point in local coordinates (relative to shape x/y, pre-rotation).
  frozenAnchor?: { x: number; y: number };

  // Half widths on each side of the centerline (cm). In symmetric mode, left=right.
  leftOpeningCm: number;
  rightOpeningCm: number;
  depthCm: number;

  widthMode: DartWidthMode;
  linkMode: DartLinkMode;
}

export interface DartParams {
  depthCm: number; // Profundidade (length of dart from edge to point)
  openingCm: number; // Abertura (width at the base)
  positionRatio: number; // Position along the edge (0-1)
  targetShapeId: string; // The shape/edge where dart is placed
  edgeIndex?: number; // Which edge of the shape (for rectangles, circles)
}

export interface BakedDart {
  id: string;
  baseLeftIndex: number;
  apexIndex: number;
  baseRightIndex: number;
}

export interface Shape {
  id: string;
  tool: ShapeTool;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: number[];
  controlPoint?: { x: number; y: number }; // For Bézier curves
  stroke: string;
  strokeWidth: number;
  fill?: string;
  rotation?: number;
  opacity?: number;
  dash?: number[];

  // Seam allowance (margem de costura) linkage
  kind?: "seam";
  parentId?: string;
  offsetCm?: number;
  seamPart?: number;

  // Dart (pence) parameters
  dartParams?: DartParams;

  // Pence (dart) data (supports multiple pences per shape)
  darts?: DartInstance[];

  // Baked pences: indices into the shape's local `points` array (vertex indices, not array indices).
  // Used only for rendering the dashed overlay (triangle + centerline) after baking.
  bakedDarts?: BakedDart[];

  // Base polygon points before inserting pences (local coordinates).
  // If missing, the base polygon is derived from width/height (rectangle), radius (circle),
  // or the current `points` as a fallback.
  dartSourcePoints?: number[];
}
