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

export type PointLabelsMode =
  | "off"
  | "numGlobal"
  | "numPerFigure"
  | "alphaGlobal"
  | "alphaPerFigure";

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

// =====================
// Styled Curves
// =====================

export type CurveType = "custom" | "styled";

export type TechnicalCurveId =
  | "ARC_LOW"
  | "ARC_MED"
  | "ARC_HIGH"
  | "S_SOFT"
  | "S_MED"
  | "HOOK_LIGHT"
  | "HOOK_MED"
  | "HOOK_STRONG"
  | "HOOK_STRONG_ARC_HIGH"
  | "EASE_IN"
  | "EASE_IN_OUT"
  | "QUARTER_CIRCLE"
  | "ARC_ASYM_IN"
  | "ARC_ASYM_OUT";

export type SemanticCurveCategory =
  | "cava"
  | "busto"
  | "decote"
  | "ombro_gola"
  | "gancho"
  | "cintura"
  | "quadril"
  | "barra"
  | "tecnico";

export type SemanticCurveId =
  | "CAVA_FRENTE_CLASSICA"
  | "CAVA_COSTAS_CLASSICA"
  | "CAVA_ANATOMICA"
  | "CAVA_CAVADA"
  | "CAVA_RETA"
  | "CAVA_ESPORTIVA"
  | "CURVA_DE_BUSTO"
  | "PENCE_DE_BUSTO"
  | "RECORTE_PRINCESA_BUSTO"
  | "RECORTE_ANATOMICO"
  | "TRANSPASSE_ANATOMICO"
  | "GANCHO_FRENTE"
  | "GANCHO_COSTAS"
  | "GANCHO_ANATOMICO"
  | "GANCHO_RETO"
  | "GANCHO_PROFUNDO"
  | "CURVA_DE_CINTURA"
  | "CINTURA_ANATOMICA"
  | "CURVA_DE_QUADRIL"
  | "QUADRIL_SUAVE"
  | "QUADRIL_ESTRUTURADO"
  | "DECOTE_REDONDO"
  | "DECOTE_U"
  | "DECOTE_CARECA"
  | "DECOTE_V"
  | "DECOTE_CANOA"
  | "DECOTE_ASSIMETRICO"
  | "DECOTE_ANATOMICO"
  | "CURVA_DE_OMBRO"
  | "OMBRO_ANATOMICO"
  | "GOLA_CARECA"
  | "GOLA_REDONDA"
  | "GOLA_ESTRUTURADA"
  | "BARRA_RETA"
  | "BARRA_ARREDONDADA"
  | "BARRA_EVASE"
  | "BARRA_MULLETS"
  | "BARRA_ANATOMICA";

export interface StyledCurveParams {
  height: number;
  bias: number;
  flipX: boolean;
  flipY: boolean;
  rotationDeg: number;
}

export interface StyledCurveData {
  semanticId: SemanticCurveId;
  technicalId: TechnicalCurveId;
  params: StyledCurveParams;
}

export interface DerivedFromCurveStyle {
  semanticId: SemanticCurveId;
  technicalId: TechnicalCurveId;
}

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

  // Curve classification (Styled Curves): only meaningful when tool === "curve".
  curveType?: CurveType;
  styledData?: StyledCurveData;
  derivedFrom?: DerivedFromCurveStyle;

  // Styled Curves: baseline snapshot for "Customizado" restore.
  // Stores the user’s chosen (or auto-captured) custom geometry.
  customSnapshot?: {
    closed: boolean;
    nodes: FigureNode[];
    edges: FigureEdge[];
  };
  // When true, the current geometry diverged from customSnapshot.
  customSnapshotDirty?: boolean;

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
      rxPx: number;
      ryPx: number;
      widthPx: number;
      heightPx: number;
      circumferencePx: number;

      // Present when the shape is (approximately) a circle.
      radiusPx?: number;
      diameterPx?: number;
    };
    rect?: {
      widthPx: number;
      heightPx: number;
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
