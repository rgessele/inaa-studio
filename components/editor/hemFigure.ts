import { edgeLocalPoints, figureLocalPolyline } from "./figurePath";
import {
  getOuterLoopEdgeDirections,
  getOuterLoopEdgeSequence,
  hasClosedLoop,
  makeSeamFigure,
} from "./seamFigure";
import type {
  Figure,
  FigureEdge,
  FigureNode,
  HemMeta,
  HemNotchType,
} from "./types";

const HEM_WIDTH_MIN_CM = 0.1;
const HEM_WIDTH_MAX_CM = 500;
const HEM_FOLDS_MIN = 1;
const HEM_FOLDS_MAX = 64;

export const HEM_STROKE = "#0f766e";
export const HEM_DASH = [4, 4];

type Vec2 = { x: number; y: number };

type HemBuildContext = {
  seamAllowance?: Figure | null;
};

function id(prefix: string): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function pointDist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointsEqual(a: Vec2, b: Vec2, eps = 1e-3): boolean {
  return pointDist(a, b) <= eps;
}

function flattenToPoints(flat: number[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    out.push({ x: flat[i]!, y: flat[i + 1]! });
  }
  return out;
}

function pointsToFlat(points: Vec2[]): number[] {
  const out: number[] = [];
  for (const point of points) out.push(point.x, point.y);
  return out;
}

function appendPointDedup(target: Vec2[], point: Vec2) {
  const last = target[target.length - 1];
  if (!last || !pointsEqual(last, point)) {
    target.push(point);
  }
}

function normalizeHemNotchType(value: unknown): HemNotchType {
  return value === "seta" ? "seta" : "seta";
}

function uniqueStringList(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const v = value.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function normalizeHemMeta(raw: Partial<HemMeta> | null | undefined): HemMeta {
  const widthCm = clamp(
    Number(raw?.widthCm ?? 1),
    HEM_WIDTH_MIN_CM,
    HEM_WIDTH_MAX_CM
  );
  const folds = Math.round(
    clamp(Number(raw?.folds ?? 1), HEM_FOLDS_MIN, HEM_FOLDS_MAX)
  );
  const showInternalFoldLines = raw?.showInternalFoldLines !== false;
  const notchesEnabled = raw?.notchesEnabled === true;
  const notchType = normalizeHemNotchType(raw?.notchType);
  const selectedOuterEdgeIds = uniqueStringList(raw?.selectedOuterEdgeIds);
  const controlNodeIds = uniqueStringList(raw?.controlNodeIds);
  const anchorEdgeId =
    typeof raw?.anchorEdgeId === "string" && raw.anchorEdgeId.trim()
      ? raw.anchorEdgeId
      : null;

  return {
    widthCm,
    folds,
    showInternalFoldLines,
    notchesEnabled,
    notchType,
    selectedOuterEdgeIds,
    controlNodeIds,
    anchorEdgeId,
  };
}

function getOrientedLoopNodes(base: Figure, outerEdgeIds: string[]): string[] {
  if (!outerEdgeIds.length) return [];
  const edgeById = new Map(base.edges.map((edge) => [edge.id, edge] as const));
  const directions = getOuterLoopEdgeDirections(base);

  const nodes: string[] = [];
  for (let i = 0; i < outerEdgeIds.length; i++) {
    const edgeId = outerEdgeIds[i]!;
    const edge = edgeById.get(edgeId);
    if (!edge) continue;

    const dir = directions.get(edgeId);
    const from = dir?.from ?? edge.from;
    const to = dir?.to ?? edge.to;

    if (nodes.length === 0) {
      nodes.push(from);
    } else if (nodes[nodes.length - 1] !== from) {
      nodes.push(from);
    }
    nodes.push(to);
  }

  if (nodes.length >= 2 && nodes[0] === nodes[nodes.length - 1]) {
    nodes.pop();
  }
  return nodes;
}

function collectEdgesBetween(
  orderedEdgeIds: string[],
  startNodeIndex: number,
  endNodeIndex: number
): string[] {
  const out: string[] = [];
  const edgeCount = orderedEdgeIds.length;
  if (!edgeCount) return out;
  if (startNodeIndex === endNodeIndex) return [...orderedEdgeIds];

  let index = startNodeIndex;
  let safety = edgeCount + 1;
  while (safety-- > 0 && index !== endNodeIndex) {
    out.push(orderedEdgeIds[index % edgeCount]!);
    index = (index + 1) % edgeCount;
  }
  return out;
}

export function resolveHemSelectedOuterEdgeIds(
  base: Figure,
  opts: {
    selectedOuterEdgeIds?: string[];
    controlNodeIds?: string[];
    anchorEdgeId?: string | null;
  } = {}
): string[] {
  const outerEdgeIds = getOuterLoopEdgeSequence(base);
  if (!outerEdgeIds.length) return [];

  const outerSet = new Set(outerEdgeIds);
  const explicit = uniqueStringList(opts.selectedOuterEdgeIds).filter((edgeId) =>
    outerSet.has(edgeId)
  );
  if (explicit.length) return explicit;

  const controlNodeIds = uniqueStringList(opts.controlNodeIds);
  if (controlNodeIds.length < 2) return outerEdgeIds;

  const nodes = getOrientedLoopNodes(base, outerEdgeIds);
  if (!nodes.length) return outerEdgeIds;

  const startNodeId = controlNodeIds[0]!;
  const endNodeId = controlNodeIds[1]!;
  const startIndex = nodes.indexOf(startNodeId);
  const endIndex = nodes.indexOf(endNodeId);
  if (startIndex < 0 || endIndex < 0) return outerEdgeIds;

  const rangeA = collectEdgesBetween(outerEdgeIds, startIndex, endIndex);
  const rangeB = collectEdgesBetween(outerEdgeIds, endIndex, startIndex);

  const anchorEdgeId =
    typeof opts.anchorEdgeId === "string" ? opts.anchorEdgeId : null;
  if (anchorEdgeId) {
    if (rangeA.includes(anchorEdgeId)) return rangeA;
    if (rangeB.includes(anchorEdgeId)) return rangeB;
  }

  if (!rangeA.length) return rangeB.length ? rangeB : outerEdgeIds;
  if (!rangeB.length) return rangeA.length ? rangeA : outerEdgeIds;
  return rangeA.length <= rangeB.length ? rangeA : rangeB;
}

function flattenSegmentsFromSeam(seam: Figure): number[][] {
  if (seam.seamSegments?.length) {
    return seam.seamSegments
      .filter((segment) => Array.isArray(segment) && segment.length >= 4)
      .map((segment) => [...segment]);
  }

  const pts = figureLocalPolyline(seam, 60);
  return pts.length >= 4 ? [pts] : [];
}

type FlattenedHemSegment = {
  points: number[];
  sourceEdgeId?: string;
  foldIndex: number;
};

function createSegmentsForFold(
  base: Figure,
  foldOffsetCm: number,
  selectedOuterEdgeIds: string[],
  foldIndex: number
): FlattenedHemSegment[] {
  if (selectedOuterEdgeIds.length === 0) return [];

  const outerEdgeIds = getOuterLoopEdgeSequence(base);
  const selectedSet = new Set(selectedOuterEdgeIds);
  const isWholeLoop =
    outerEdgeIds.length > 0 &&
    selectedOuterEdgeIds.length === outerEdgeIds.length &&
    outerEdgeIds.every((edgeId) => selectedSet.has(edgeId));

  const seam = isWholeLoop
    ? makeSeamFigure(base, foldOffsetCm)
    : makeSeamFigure(
        base,
        Object.fromEntries(selectedOuterEdgeIds.map((edgeId) => [edgeId, foldOffsetCm]))
      );
  if (!seam) return [];

  const points = flattenSegmentsFromSeam(seam);
  if (!points.length) return [];

  if (seam.seamSegmentEdgeIds?.length === points.length) {
    return points.map((segment, index) => ({
      points: segment,
      sourceEdgeId: seam.seamSegmentEdgeIds?.[index] ?? undefined,
      foldIndex,
    }));
  }

  return points.map((segment) => ({ points: segment, foldIndex }));
}

function buildOrderedBasePolyline(
  base: Figure,
  selectedOuterEdgeIds: string[]
): Vec2[] {
  if (!selectedOuterEdgeIds.length) return [];
  const edgeById = new Map(base.edges.map((edge) => [edge.id, edge] as const));
  const directions = getOuterLoopEdgeDirections(base);
  const out: Vec2[] = [];

  for (const edgeId of selectedOuterEdgeIds) {
    const edge = edgeById.get(edgeId);
    if (!edge) continue;

    const dir = directions.get(edgeId);
    const forward = dir
      ? edge.from === dir.from && edge.to === dir.to
      : true;
    const pts = edgeLocalPoints(base, edge, edge.kind === "line" ? 2 : 90);
    const ordered = forward ? pts : [...pts].reverse();
    for (const point of ordered) {
      appendPointDedup(out, point);
    }
  }
  return out;
}

function buildOrderedFoldPolyline(
  segments: FlattenedHemSegment[],
  selectedOuterEdgeIds: string[]
): Vec2[] {
  if (!segments.length) return [];

  const withEdge = segments.filter((segment) => !!segment.sourceEdgeId);
  if (!withEdge.length) {
    return flattenToPoints(segments[0]!.points);
  }

  const byEdgeId = new Map<string, FlattenedHemSegment[]>();
  for (const segment of withEdge) {
    const edgeId = segment.sourceEdgeId!;
    const list = byEdgeId.get(edgeId) ?? [];
    list.push(segment);
    byEdgeId.set(edgeId, list);
  }

  const out: Vec2[] = [];
  for (const edgeId of selectedOuterEdgeIds) {
    const segment = byEdgeId.get(edgeId)?.[0];
    if (!segment) continue;
    const points = flattenToPoints(segment.points);
    for (const point of points) appendPointDedup(out, point);
  }
  return out;
}

function findNearestPointOnSeam(
  seamAllowance: Figure | null | undefined,
  probe: Vec2,
  maxDistance: number
): Vec2 | null {
  if (!seamAllowance || seamAllowance.kind !== "seam") return null;
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) return null;

  const candidates: Vec2[] = [];
  if (seamAllowance.seamSegments?.length) {
    for (const segment of seamAllowance.seamSegments) {
      if (!segment || segment.length < 4) continue;
      const points = flattenToPoints(segment);
      if (!points.length) continue;
      candidates.push(points[0]!, points[points.length - 1]!);
    }
  }

  if (!candidates.length) {
    const flat = figureLocalPolyline(seamAllowance, 80);
    candidates.push(...flattenToPoints(flat));
  }

  if (!candidates.length) return null;

  let best: Vec2 | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const point of candidates) {
    const d = pointDist(point, probe);
    if (d < bestDist) {
      bestDist = d;
      best = point;
    }
  }

  return best && bestDist <= maxDistance ? best : null;
}

function buildPartialClosureSegment(
  base: Figure,
  selectedOuterEdgeIds: string[],
  outerFoldSegments: FlattenedHemSegment[],
  context: HemBuildContext | undefined,
  widthCm: number,
  folds: number
): FlattenedHemSegment | null {
  const outerSequence = getOuterLoopEdgeSequence(base);
  const isWholeLoop =
    selectedOuterEdgeIds.length === outerSequence.length &&
    selectedOuterEdgeIds.every((edgeId) => outerSequence.includes(edgeId));
  if (isWholeLoop) return null;

  const basePath = buildOrderedBasePolyline(base, selectedOuterEdgeIds);
  const foldPath = buildOrderedFoldPolyline(outerFoldSegments, selectedOuterEdgeIds);
  if (basePath.length < 2 || foldPath.length < 2) return null;

  const baseStart = basePath[0]!;
  const baseEnd = basePath[basePath.length - 1]!;
  const outerStart = foldPath[0]!;
  const outerEnd = foldPath[foldPath.length - 1]!;

  const seamConnectThreshold = Math.max(8, widthCm * folds * 50);
  const seamStart = findNearestPointOnSeam(
    context?.seamAllowance,
    baseStart,
    seamConnectThreshold
  );
  const seamEnd = findNearestPointOnSeam(
    context?.seamAllowance,
    baseEnd,
    seamConnectThreshold
  );

  const closed: Vec2[] = [];
  for (const point of basePath) appendPointDedup(closed, point);

  if (seamEnd) appendPointDedup(closed, seamEnd);
  appendPointDedup(closed, outerEnd);

  for (let i = foldPath.length - 2; i >= 0; i--) {
    appendPointDedup(closed, foldPath[i]!);
  }

  appendPointDedup(closed, outerStart);
  if (seamStart) appendPointDedup(closed, seamStart);
  appendPointDedup(closed, baseStart);

  if (closed.length < 4) return null;
  if (!pointsEqual(closed[0]!, closed[closed.length - 1]!)) {
    closed.push(closed[0]!);
  }

  return {
    points: pointsToFlat(closed),
    sourceEdgeId: "hem-closure",
    foldIndex: folds,
  };
}

function buildHemNodesAndEdges(
  flattened: FlattenedHemSegment[],
  withNotches: boolean,
  totalFolds: number,
  showInternalFoldLines: boolean,
  selectedOuterEdgeIds: string[]
): {
  nodes: FigureNode[];
  edges: FigureEdge[];
  seamSegments: number[][];
  seamSegmentEdgeIds: string[];
  piques: NonNullable<Figure["piques"]>;
} {
  const nodes: FigureNode[] = [];
  const edges: FigureEdge[] = [];
  const seamSegments: number[][] = [];
  const seamSegmentEdgeIds: string[] = [];
  const piques: NonNullable<Figure["piques"]> = [];
  const internalFoldRecords: Array<{
    segment: FlattenedHemSegment;
    segmentEdges: FigureEdge[];
    segmentNodes: FigureNode[];
  }> = [];

  flattened.forEach((segment, segmentIndex) => {
    if (segment.points.length < 4) return;
    const isInternalFold = segment.foldIndex < totalFolds;
    const shouldDrawSegment = showInternalFoldLines || !isInternalFold;
    if (shouldDrawSegment) {
      seamSegments.push([...segment.points]);
      seamSegmentEdgeIds.push(
        segment.sourceEdgeId ?? `hem-seg-${segmentIndex + 1}`
      );
    }

    const segmentNodes: FigureNode[] = [];
    for (let i = 0; i < segment.points.length; i += 2) {
      const n: FigureNode = {
        id: id("n"),
        x: segment.points[i]!,
        y: segment.points[i + 1]!,
        mode: "corner",
      };
      nodes.push(n);
      segmentNodes.push(n);
    }

    const segmentEdges: FigureEdge[] = [];
    for (let i = 0; i < segmentNodes.length - 1; i++) {
      const edge: FigureEdge = {
        id: id("e"),
        from: segmentNodes[i]!.id,
        to: segmentNodes[i + 1]!.id,
        kind: "line",
      };
      edges.push(edge);
      segmentEdges.push(edge);
    }

    if (
      withNotches &&
      isInternalFold &&
      segmentEdges.length > 0 &&
      typeof segment.sourceEdgeId === "string" &&
      !segment.sourceEdgeId.startsWith("hem-closure")
    ) {
      internalFoldRecords.push({ segment, segmentEdges, segmentNodes });
    }
  });

  if (withNotches && internalFoldRecords.length) {
    const order = new Map(
      selectedOuterEdgeIds.map((edgeId, index) => [edgeId, index] as const)
    );
    const byFold = new Map<number, typeof internalFoldRecords>();
    for (const record of internalFoldRecords) {
      const list = byFold.get(record.segment.foldIndex) ?? [];
      list.push(record);
      byFold.set(record.segment.foldIndex, list);
    }

    for (const records of byFold.values()) {
      const ordered = records
        .filter((record) => {
          const sourceEdgeId = record.segment.sourceEdgeId;
          return typeof sourceEdgeId === "string" && order.has(sourceEdgeId);
        })
        .sort((a, b) => {
          const aIndex = order.get(a.segment.sourceEdgeId!) ?? 0;
          const bIndex = order.get(b.segment.sourceEdgeId!) ?? 0;
          return aIndex - bIndex;
        });
      if (!ordered.length) continue;

      const first = ordered[0]!;
      const last = ordered[ordered.length - 1]!;
      const firstNode = first.segmentNodes[0];
      const lastNode = last.segmentNodes[last.segmentNodes.length - 1];
      const isClosedFold =
        !!firstNode && !!lastNode && pointsEqual(firstNode, lastNode);
      if (isClosedFold) continue;

      const lengthCm = 0.4;
      const firstEdge = first.segmentEdges[0];
      const lastEdge = last.segmentEdges[last.segmentEdges.length - 1];
      if (!firstEdge || !lastEdge) continue;

      piques.push({
        id: id("pique"),
        edgeId: firstEdge.id,
        t01: 0,
        lengthCm,
        side: 1,
        orientation: "tangent",
      });
      piques.push({
        id: id("pique"),
        edgeId: lastEdge.id,
        t01: 1,
        lengthCm,
        side: -1,
        orientation: "tangent",
      });
    }
  }

  return {
    nodes,
    edges,
    seamSegments,
    seamSegmentEdgeIds,
    piques,
  };
}

function sanitizeSourceSignatureMeta(meta: HemMeta) {
  return {
    widthCm: Math.round(meta.widthCm * 10000) / 10000,
    folds: meta.folds,
    showInternalFoldLines: meta.showInternalFoldLines !== false,
    notchesEnabled: meta.notchesEnabled === true,
    notchType: normalizeHemNotchType(meta.notchType),
    selectedOuterEdgeIds: uniqueStringList(meta.selectedOuterEdgeIds).sort(),
    controlNodeIds: uniqueStringList(meta.controlNodeIds),
    anchorEdgeId:
      typeof meta.anchorEdgeId === "string" && meta.anchorEdgeId.trim()
        ? meta.anchorEdgeId
        : null,
  };
}

export function hemSourceSignature(base: Figure, rawMeta: HemMeta): string {
  const meta = sanitizeSourceSignatureMeta(normalizeHemMeta(rawMeta));
  const payload = {
    meta,
    closed: base.closed,
    nodes: base.nodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      mode: node.mode,
      inHandle: node.inHandle ? { ...node.inHandle } : null,
      outHandle: node.outHandle ? { ...node.outHandle } : null,
    })),
    edges: base.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
    })),
  };
  return JSON.stringify(payload);
}

export function makeHemFigure(
  base: Figure,
  rawMeta: HemMeta,
  context?: HemBuildContext
): Figure | null {
  if (!base.closed && !hasClosedLoop(base)) return null;

  const meta = normalizeHemMeta(rawMeta);
  const selectedOuterEdgeIds = resolveHemSelectedOuterEdgeIds(base, meta);
  if (!selectedOuterEdgeIds.length) return null;

  const flattened: FlattenedHemSegment[] = [];
  for (let fold = 1; fold <= meta.folds; fold++) {
    const foldOffsetCm = meta.widthCm * fold;
    flattened.push(
      ...createSegmentsForFold(base, foldOffsetCm, selectedOuterEdgeIds, fold)
    );
  }
  if (!flattened.length) return null;

  const outerFoldSegments = flattened.filter(
    (segment) => segment.foldIndex === meta.folds
  );
  const closureSegment = buildPartialClosureSegment(
    base,
    selectedOuterEdgeIds,
    outerFoldSegments,
    context,
    meta.widthCm,
    meta.folds
  );
  if (closureSegment) {
    flattened.unshift(closureSegment);
  }

  const built = buildHemNodesAndEdges(
    flattened,
    meta.notchesEnabled,
    meta.folds,
    meta.showInternalFoldLines,
    selectedOuterEdgeIds
  );
  if (!built.nodes.length || !built.edges.length) return null;

  return {
    ...base,
    id: id("fig"),
    kind: "seam",
    derivedRole: "hem",
    parentId: base.id,
    offsetCm: meta.widthCm,
    sourceSignature: hemSourceSignature(base, {
      ...meta,
      selectedOuterEdgeIds,
    }),
    hemMeta: {
      ...meta,
      selectedOuterEdgeIds,
    },
    stroke: HEM_STROKE,
    dash: [...HEM_DASH],
    fill: "transparent",
    name: "",
    nodes: built.nodes,
    edges: built.edges,
    seamSegments: built.seamSegments,
    seamSegmentEdgeIds: built.seamSegmentEdgeIds,
    piques: built.piques.length ? built.piques : undefined,
    closed: false,
  };
}

export function recomputeHemFigure(
  base: Figure,
  hem: Figure,
  context?: HemBuildContext
): Figure | null {
  if (hem.kind !== "seam" || hem.derivedRole !== "hem") return null;

  const fallbackMeta: HemMeta = {
    widthCm:
      typeof hem.offsetCm === "number" && Number.isFinite(hem.offsetCm)
        ? hem.offsetCm
        : 1,
    folds: 1,
    showInternalFoldLines: true,
    notchesEnabled: false,
    notchType: "seta",
    selectedOuterEdgeIds: [],
    controlNodeIds: [],
    anchorEdgeId: null,
  };

  const next = makeHemFigure(base, hem.hemMeta ?? fallbackMeta, context);
  if (!next) return null;
  return {
    ...next,
    id: hem.id,
  };
}
