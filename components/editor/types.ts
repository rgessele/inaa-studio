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

export type MeasureDisplayMode = "never" | "always" | "hover";

export type NodesDisplayMode = "never" | "always" | "hover";

import type { PaperOrientation, PaperSize } from "./exportSettings";

// =====================
// Figure-based model (v2)
// =====================

export type NodeMode = "smooth" | "corner";

export interface FigureNode {
  id: string;
  x: number;
  y: number;
  mode: NodeMode;
  inHandle?: { x: number; y: number };
  outHandle?: { x: number; y: number };
}

export type EdgeKind = "line" | "cubic";

export interface FigureEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface Figure {
  id: string;

  // Original tool used to create the figure (used by export filters)
  tool: DrawingTool;

  // Optional metadata (v2): derived figures like seam allowance
  kind?: "seam";
  parentId?: string;
  offsetCm?: number;
  // Tracks the base geometry state used to generate this derived figure.
  // Used to auto-recompute seam allowance when the parent changes.
  sourceSignature?: string;

  // Transform
  x: number;
  y: number;
  rotation?: number;

  // Style
  stroke: string;
  strokeWidth: number;
  fill?: string;
  opacity?: number;
  dash?: number[];

  // Geometry
  nodes: FigureNode[];
  edges: FigureEdge[];
  closed: boolean;

  // Optional persisted measures cache (computed from nodes/edges)
  measures?: {
    version: 1;
    figureLengthPx: number;
    perEdge: Array<{
      edgeId: string;
      kind: EdgeKind;
      lengthPx: number;
      angleDeg?: number;
    }>;
    circle?: {
      radiusPx: number;
      diameterPx: number;
      circumferencePx: number;
    };
    curve?: {
      lengthPx: number;
      tangentAngleDegAtMid?: number;
      curvatureRadiusPxAtMid?: number;
    };
  };
}

export interface PageGuideSettings {
  paperSize: PaperSize;
  orientation: PaperOrientation;
  marginCm: number;
}

export type GuideOrientation = "horizontal" | "vertical";

export interface GuideLine {
  id: string;
  orientation: GuideOrientation;
  valuePx: number;
}

export interface DesignDataV2 {
  version: 2;
  figures: Figure[];
  pageGuideSettings?: PageGuideSettings;
  guides?: GuideLine[];
  meta?: {
    fabric?: string | null;
    notes?: string | null;
    print?: {
      widthCm: number;
      heightCm: number;
      unit: "cm";
    };
    grade?: string;
    coverUrl?: string | null;
  };
}
