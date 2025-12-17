export type DrawingTool = "rectangle" | "circle" | "line" | "curve" | "dart";
export type Tool =
  | DrawingTool
  | "select"
  | "pan"
  | "node"
  | "measure"
  | "offset"
  | "mirror"
  | "unfold";

export interface DartParams {
  depthCm: number; // Profundidade (length of dart from edge to point)
  openingCm: number; // Abertura (width at the base)
  positionRatio: number; // Position along the edge (0-1)
  targetShapeId: string; // The shape/edge where dart is placed
  edgeIndex?: number; // Which edge of the shape (for rectangles, circles)
}

export interface Shape {
  id: string;
  tool: DrawingTool;
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
}
