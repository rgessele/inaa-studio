import type {
  Figure,
  FigureEdge,
  FigureNode,
  SemanticCurveCategory,
  SemanticCurveId,
  StyledCurveData,
  StyledCurveParams,
  TechnicalCurveId,
} from "./types";
import { add, len, mul, rotate, sub, type Vec2 } from "./figureGeometry";
import { figureLocalToWorld, worldToFigureLocal } from "./figurePath";

type TechnicalTemplate = {
  id: TechnicalCurveId;
  label: string;
  p1: Vec2;
  p2: Vec2;
};

export const TECHNICAL_CURVE_TEMPLATES: Record<TechnicalCurveId, TechnicalTemplate> = {
  ARC_LOW: {
    id: "ARC_LOW",
    label: "Arco Baixo",
    p1: { x: 0.33, y: 0.12 },
    p2: { x: 0.66, y: 0.12 },
  },
  ARC_MED: {
    id: "ARC_MED",
    label: "Arco Médio",
    p1: { x: 0.33, y: 0.25 },
    p2: { x: 0.66, y: 0.25 },
  },
  ARC_HIGH: {
    id: "ARC_HIGH",
    label: "Arco Alto",
    p1: { x: 0.33, y: 0.42 },
    p2: { x: 0.66, y: 0.42 },
  },
  S_SOFT: {
    id: "S_SOFT",
    label: "S Suave",
    p1: { x: 0.25, y: 0.25 },
    p2: { x: 0.75, y: -0.25 },
  },
  S_MED: {
    id: "S_MED",
    label: "S Médio",
    p1: { x: 0.23, y: 0.32 },
    p2: { x: 0.77, y: -0.32 },
  },
  EASE_IN: {
    id: "EASE_IN",
    label: "Ease In",
    p1: { x: 0.12, y: 0.0 },
    p2: { x: 0.78, y: 0.22 },
  },
  EASE_IN_OUT: {
    id: "EASE_IN_OUT",
    label: "Ease In/Out",
    p1: { x: 0.2, y: 0.18 },
    p2: { x: 0.8, y: 0.18 },
  },
  QUARTER_CIRCLE: {
    id: "QUARTER_CIRCLE",
    label: "Quarto de Círculo",
    p1: { x: 0.0, y: 0.55 },
    p2: { x: 1.0, y: 0.55 },
  },
  HOOK_LIGHT: {
    id: "HOOK_LIGHT",
    label: "Gancho Leve",
    p1: { x: 0.12, y: 0.0 },
    p2: { x: 0.55, y: 0.55 },
  },
  HOOK_MED: {
    id: "HOOK_MED",
    label: "Gancho Médio",
    p1: { x: 0.1, y: 0.0 },
    p2: { x: 0.5, y: 0.75 },
  },
  HOOK_STRONG: {
    id: "HOOK_STRONG",
    label: "Gancho Forte",
    p1: { x: 0.1, y: 0.0 },
    p2: { x: 0.45, y: 0.9 },
  },
  HOOK_STRONG_ARC_HIGH: {
    id: "HOOK_STRONG_ARC_HIGH",
    label: "Gancho Profundo",
    p1: { x: 0.08, y: 0.02 },
    p2: { x: 0.42, y: 1.12 },
  },

  // Asym arcs used by classic presets (values chosen to be stable and useful).
  ARC_ASYM_IN: {
    id: "ARC_ASYM_IN",
    label: "Arco Assimétrico (In)",
    p1: { x: 0.28, y: 0.34 },
    p2: { x: 0.72, y: 0.18 },
  },
  ARC_ASYM_OUT: {
    id: "ARC_ASYM_OUT",
    label: "Arco Assimétrico (Out)",
    p1: { x: 0.28, y: 0.18 },
    p2: { x: 0.72, y: 0.34 },
  },
};

export type SemanticPreset = {
  id: SemanticCurveId;
  label: string;
  category: SemanticCurveCategory;
  technicalId: TechnicalCurveId;
  defaultParams: StyledCurveParams;
};

export const SEMANTIC_CURVE_PRESETS: SemanticPreset[] = [
  {
    id: "CAVA_FRENTE_CLASSICA",
    label: "Cava Frente Clássica",
    category: "cava",
    technicalId: "ARC_ASYM_IN",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "CAVA_COSTAS_CLASSICA",
    label: "Cava Costas Clássica",
    category: "cava",
    technicalId: "ARC_ASYM_OUT",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "CAVA_ANATOMICA",
    label: "Cava Anatômica",
    category: "cava",
    technicalId: "S_SOFT",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "CAVA_CAVADA",
    label: "Cava Cavada",
    category: "cava",
    technicalId: "ARC_HIGH",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "CAVA_RETA",
    label: "Cava Reta",
    category: "cava",
    technicalId: "ARC_LOW",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "CAVA_ESPORTIVA",
    label: "Cava Esportiva",
    category: "cava",
    technicalId: "S_MED",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },

  // Busto e recortes
  {
    id: "CURVA_DE_BUSTO",
    label: "Curva de Busto",
    category: "busto",
    technicalId: "ARC_MED",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "PENCE_DE_BUSTO",
    label: "Pence de Busto",
    category: "busto",
    technicalId: "ARC_ASYM_OUT",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "RECORTE_PRINCESA_BUSTO",
    label: "Recorte Princesa (busto)",
    category: "busto",
    technicalId: "S_SOFT",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "RECORTE_ANATOMICO",
    label: "Recorte Anatômico",
    category: "busto",
    technicalId: "S_MED",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "TRANSPASSE_ANATOMICO",
    label: "Transpasse Anatômico",
    category: "busto",
    technicalId: "ARC_ASYM_IN",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },

  // Gancho / entrepernas
  {
    id: "GANCHO_FRENTE",
    label: "Gancho Frente",
    category: "gancho",
    technicalId: "HOOK_LIGHT",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "GANCHO_COSTAS",
    label: "Gancho Costas",
    category: "gancho",
    technicalId: "HOOK_STRONG",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "GANCHO_ANATOMICO",
    label: "Gancho Anatômico",
    category: "gancho",
    technicalId: "HOOK_MED",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "GANCHO_RETO",
    label: "Gancho Reto",
    category: "gancho",
    technicalId: "EASE_IN",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "GANCHO_PROFUNDO",
    label: "Gancho Profundo",
    category: "gancho",
    technicalId: "HOOK_STRONG_ARC_HIGH",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },

  // Cintura e quadril
  {
    id: "CURVA_DE_CINTURA",
    label: "Curva de Cintura",
    category: "cintura",
    technicalId: "ARC_LOW",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "CINTURA_ANATOMICA",
    label: "Cintura Anatômica",
    category: "cintura",
    technicalId: "ARC_MED",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "CURVA_DE_QUADRIL",
    label: "Curva de Quadril",
    category: "quadril",
    technicalId: "ARC_HIGH",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "QUADRIL_SUAVE",
    label: "Quadril Suave",
    category: "quadril",
    technicalId: "ARC_MED",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "QUADRIL_ESTRUTURADO",
    label: "Quadril Estruturado",
    category: "quadril",
    technicalId: "ARC_HIGH",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },

  // Decotes
  {
    id: "DECOTE_REDONDO",
    label: "Decote Redondo",
    category: "decote",
    technicalId: "ARC_MED",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "DECOTE_U",
    label: "Decote U",
    category: "decote",
    technicalId: "ARC_HIGH",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "DECOTE_CARECA",
    label: "Decote Careca",
    category: "decote",
    technicalId: "ARC_LOW",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "DECOTE_V",
    label: "Decote V",
    category: "decote",
    technicalId: "EASE_IN_OUT",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "DECOTE_CANOA",
    label: "Decote Canoa",
    category: "decote",
    technicalId: "ARC_LOW",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "DECOTE_ASSIMETRICO",
    label: "Decote Assimétrico",
    category: "decote",
    technicalId: "ARC_ASYM_IN",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "DECOTE_ANATOMICO",
    label: "Decote Anatômico",
    category: "decote",
    technicalId: "S_SOFT",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },

  // Ombros e gola
  {
    id: "CURVA_DE_OMBRO",
    label: "Curva de Ombro",
    category: "ombro_gola",
    technicalId: "ARC_LOW",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "OMBRO_ANATOMICO",
    label: "Ombro Anatômico",
    category: "ombro_gola",
    technicalId: "ARC_MED",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "GOLA_CARECA",
    label: "Gola Careca",
    category: "ombro_gola",
    technicalId: "ARC_MED",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "GOLA_REDONDA",
    label: "Gola Redonda",
    category: "ombro_gola",
    technicalId: "ARC_HIGH",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "GOLA_ESTRUTURADA",
    label: "Gola Estruturada",
    category: "ombro_gola",
    technicalId: "QUARTER_CIRCLE",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },

  // Barras
  {
    id: "BARRA_RETA",
    label: "Barra Reta",
    category: "barra",
    technicalId: "EASE_IN_OUT",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "BARRA_ARREDONDADA",
    label: "Barra Arredondada",
    category: "barra",
    technicalId: "ARC_MED",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "BARRA_EVASE",
    label: "Barra Evasê",
    category: "barra",
    technicalId: "ARC_HIGH",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "BARRA_MULLETS",
    label: "Barra Mullets",
    category: "barra",
    technicalId: "ARC_ASYM_OUT",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
  {
    id: "BARRA_ANATOMICA",
    label: "Barra Anatômica",
    category: "barra",
    technicalId: "S_SOFT",
    defaultParams: {
      height: 1,
      bias: 0,
      flipX: false,
      flipY: false,
      rotationDeg: 0,
    },
  },
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function norm(v: Vec2): Vec2 {
  const L = len(v);
  if (L <= 1e-9) return { x: 1, y: 0 };
  return { x: v.x / L, y: v.y / L };
}

function perp(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

function makeId(prefix: string): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function curveEndpointsNodeIds(figure: Figure): { startId: string; endId: string } | null {
  if (!figure.edges.length || !figure.nodes.length) return null;

  const degree = new Map<string, number>();
  for (const n of figure.nodes) degree.set(n.id, 0);
  for (const e of figure.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  const endpoints = figure.nodes.filter((n) => (degree.get(n.id) ?? 0) === 1);
  if (endpoints.length >= 2) {
    return { startId: endpoints[0].id, endId: endpoints[1].id };
  }

  // Fallback to node order.
  if (figure.nodes.length >= 2) {
    return { startId: figure.nodes[0].id, endId: figure.nodes[figure.nodes.length - 1].id };
  }

  return null;
}

function getNode(nodes: FigureNode[], id: string): FigureNode | null {
  return nodes.find((n) => n.id === id) ?? null;
}

function applyParamsToNormalizedPoint(p: Vec2, params: StyledCurveParams): Vec2 {
  let x = p.x;
  let y = p.y;

  // Bias: shifts control points along x (clamped) without moving endpoints.
  x = clamp01(x + params.bias * 0.2);

  // Height scales y.
  y = y * params.height;

  if (params.flipX) x = 1 - x;
  if (params.flipY) y = -y;

  if (params.rotationDeg !== 0) {
    const rotated = rotate({ x: x - 0.5, y }, params.rotationDeg);
    x = rotated.x + 0.5;
    y = rotated.y;
  }

  return { x, y };
}

function projectNormalizedToWorld(opts: {
  startWorld: Vec2;
  endWorld: Vec2;
  p: Vec2;
}): Vec2 {
  const { startWorld, endWorld, p } = opts;
  const base = sub(endWorld, startWorld);
  const L = len(base);
  if (L <= 1e-9) return startWorld;

  const ux = base; // x in normalized space maps to full base vector.
  const uy = mul(perp(norm(base)), L); // y scales by length (dimensionless template).

  return add(startWorld, add(mul(ux, p.x), mul(uy, p.y)));
}

export function applySemanticStyleToCurveFigure(opts: {
  figure: Figure;
  semanticId: SemanticCurveId;
  params?: Partial<StyledCurveParams>;
}): { figure: Figure } | { error: string } {
  const { figure, semanticId } = opts;
  if (figure.tool !== "curve") return { error: "Selecione uma curva." };
  if (figure.closed) return { error: "Curvas fechadas não suportam estilo (por enquanto)." };

  const preset = SEMANTIC_CURVE_PRESETS.find((p) => p.id === semanticId) ?? null;
  if (!preset) return { error: "Preset de curva inválido." };

  const template = TECHNICAL_CURVE_TEMPLATES[preset.technicalId] ?? null;
  if (!template) return { error: "Template técnico não encontrado." };

  const endpoints = curveEndpointsNodeIds(figure);
  if (!endpoints) return { error: "Curva sem endpoints válidos." };

  const n0 = getNode(figure.nodes, endpoints.startId);
  const n3 = getNode(figure.nodes, endpoints.endId);
  if (!n0 || !n3) return { error: "Curva sem endpoints válidos." };

  const startWorld = figureLocalToWorld(figure, { x: n0.x, y: n0.y });
  const endWorld = figureLocalToWorld(figure, { x: n3.x, y: n3.y });

  const params: StyledCurveParams = {
    ...preset.defaultParams,
    ...(opts.params ?? {}),
  };

  const p0n: Vec2 = { x: 0, y: 0 };
  const p1n = applyParamsToNormalizedPoint(template.p1, params);
  const p2n = applyParamsToNormalizedPoint(template.p2, params);
  const p3n: Vec2 = { x: 1, y: 0 };

  const p0w = projectNormalizedToWorld({ startWorld, endWorld, p: p0n });
  const p1w = projectNormalizedToWorld({ startWorld, endWorld, p: p1n });
  const p2w = projectNormalizedToWorld({ startWorld, endWorld, p: p2n });
  const p3w = projectNormalizedToWorld({ startWorld, endWorld, p: p3n });

  const p0l = worldToFigureLocal(figure, p0w);
  const p1l = worldToFigureLocal(figure, p1w);
  const p2l = worldToFigureLocal(figure, p2w);
  const p3l = worldToFigureLocal(figure, p3w);

  const nStartId = makeId("n");
  const nEndId = makeId("n");

  const nodes: FigureNode[] = [
    {
      id: nStartId,
      x: p0l.x,
      y: p0l.y,
      mode: "smooth",
      outHandle: { x: p1l.x, y: p1l.y },
    },
    {
      id: nEndId,
      x: p3l.x,
      y: p3l.y,
      mode: "smooth",
      inHandle: { x: p2l.x, y: p2l.y },
    },
  ];

  const edges: FigureEdge[] = [
    {
      id: makeId("e"),
      from: nStartId,
      to: nEndId,
      kind: "cubic",
    },
  ];

  const styledData: StyledCurveData = {
    semanticId: preset.id,
    technicalId: preset.technicalId,
    params,
  };

  return {
    figure: {
      ...figure,
      closed: false,
      nodes,
      edges,
      curveType: "styled",
      styledData,
    },
  };
}

export function breakStyledLinkIfNeeded(figure: Figure): Figure {
  if (figure.tool !== "curve") return figure;
  if (!figure.styledData && figure.curveType !== "styled") return figure;

  const derivedFrom = figure.styledData
    ? { semanticId: figure.styledData.semanticId, technicalId: figure.styledData.technicalId }
    : figure.derivedFrom;

  const next: Figure = {
    ...figure,
    curveType: "custom",
    styledData: undefined,
    derivedFrom: derivedFrom ?? figure.derivedFrom,
  };

  return next;
}

export function reapplyStyledCurveWithParams(opts: {
  figure: Figure;
  params: Partial<StyledCurveParams>;
}): { figure: Figure } | { error: string } {
  const { figure, params } = opts;
  if (figure.tool !== "curve") return { error: "Selecione uma curva." };
  if (!figure.styledData) return { error: "Curva não está em modo styled." };

  const merged: StyledCurveParams = {
    ...figure.styledData.params,
    ...params,
  };

  return applySemanticStyleToCurveFigure({
    figure,
    semanticId: figure.styledData.semanticId,
    params: merged,
  });
}

export function semanticPresetsByCategory(): Array<{
  category: SemanticCurveCategory;
  label: string;
  presets: SemanticPreset[];
}> {
  const order: Array<{ category: SemanticCurveCategory; label: string }> = [
    { category: "cava", label: "Cavas" },
    { category: "busto", label: "Busto e Recortes" },
    { category: "decote", label: "Decotes" },
    { category: "ombro_gola", label: "Ombros e Gola" },
    { category: "gancho", label: "Gancho" },
    { category: "cintura", label: "Cintura" },
    { category: "quadril", label: "Quadril" },
    { category: "barra", label: "Barras" },
    { category: "tecnico", label: "Técnico" },
  ];

  return order.map((o) => ({
    ...o,
    presets: SEMANTIC_CURVE_PRESETS.filter((p) => p.category === o.category),
  }));
}
