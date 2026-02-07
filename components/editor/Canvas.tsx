"use client";

import {
  bumpNumericValue,
  formatPtBrDecimalFixed,
  parsePtBrDecimal,
} from "@/utils/numericInput";
import { toast } from "@/utils/toast";
import { sendDebugLog } from "@/utils/debugLog";
import { getToolIcon, isToolCursorOverlayEnabled } from "./ToolCursorIcons";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Circle,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import Konva from "konva";
import { useEditor } from "./EditorContext";
import type { Figure, FigureEdge, FigureNode, GuideLine } from "./types";
import { PX_PER_CM, PX_PER_MM } from "./constants";
import { getPaperDimensionsCm } from "./exportSettings";
import {
  add,
  clamp,
  dist,
  ellipseAsCubics,
  len,
  lerp,
  midAndTangent,
  mul,
  norm,
  normalizeUprightAngleDeg,
  perp,
  pointToSegmentDistance,
  sub,
} from "./figureGeometry";
import { withComputedFigureMeasures } from "./figureMeasures";
import { formatCm, pxToCm } from "./measureUnits";
import { setEdgeTargetLengthPx } from "./edgeEdit";
import {
  edgeLocalPoints,
  figureCentroidLocal,
  figureLocalPolyline,
  figureLocalToWorld,
  figureWorldBoundingBox,
  figureWorldPolyline,
  worldToFigureLocal,
} from "./figurePath";
import {
  breakStyledLinkIfNeeded,
  markCurveCustomSnapshotDirtyIfPresent,
} from "./styledCurves";
import { convertEdgeToCubic, convertEdgeToLine } from "./edgeConvert";
import { Ruler } from "./Ruler";
import { Minimap } from "./Minimap";
import { MemoizedFigure } from "./FigureRenderer";
import { computeNodeLabels } from "./pointLabels";
import { MemoizedMeasureOverlay } from "./MeasureOverlay";
import { MemoizedNodeOverlay } from "./NodeOverlay";
import {
  getOuterLoopEdgeIds,
  getOuterLoopPolygon,
  hasClosedLoop,
  makeSeamFigure,
  recomputeSeamFigure,
  seamSourceSignature,
} from "./seamFigure";

const MIN_ZOOM_SCALE = 0.1;
const MAX_ZOOM_SCALE = 10;
const ZOOM_FACTOR = 1.08;

type Vec2 = { x: number; y: number };

type OffsetPreviewLogInput = {
  x: number;
  y: number;
  rotation?: number;
  key: string;
  segments?: number[][];
  points?: number[];
};

function isFiniteVec2(v: Vec2): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}

function previewToWorldPoints(preview: OffsetPreviewLogInput): {
  pointsWorld?: Vec2[];
  segmentsWorld?: Vec2[][];
} {
  const transform = {
    x: preview.x,
    y: preview.y,
    rotation: preview.rotation ?? 0,
  };

  if (preview.segments) {
    const segmentsWorld = preview.segments.map((segment) => {
      const pts: Vec2[] = [];
      for (let i = 0; i < segment.length; i += 2) {
        const p = figureLocalToWorld(transform, {
          x: segment[i] ?? 0,
          y: segment[i + 1] ?? 0,
        });
        pts.push(p);
      }
      return pts;
    });
    return { segmentsWorld };
  }

  if (preview.points) {
    const pointsWorld: Vec2[] = [];
    for (let i = 0; i < preview.points.length; i += 2) {
      const p = figureLocalToWorld(transform, {
        x: preview.points[i] ?? 0,
        y: preview.points[i + 1] ?? 0,
      });
      pointsWorld.push(p);
    }
    return { pointsWorld };
  }

  return {};
}

function snapWorldToStepPxFloor(p: Vec2, stepPx: number): Vec2 {
  if (!Number.isFinite(stepPx) || stepPx <= 0) return p;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return p;
  return {
    x: Math.floor(p.x / stepPx) * stepPx,
    y: Math.floor(p.y / stepPx) * stepPx,
  };
}

function snapWorldRelativeToRefFloor(p: Vec2, ref: Vec2, stepPx: number): Vec2 {
  if (!Number.isFinite(stepPx) || stepPx <= 0) return p;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return p;
  if (!Number.isFinite(ref.x) || !Number.isFinite(ref.y)) return p;
  const dx = p.x - ref.x;
  const dy = p.y - ref.y;
  return {
    x: ref.x + Math.floor(dx / stepPx) * stepPx,
    y: ref.y + Math.floor(dy / stepPx) * stepPx,
  };
}

function snapPointAlongDirFloor(
  p: Vec2,
  origin: Vec2,
  dirUnit: Vec2,
  stepPx: number
): Vec2 {
  if (!Number.isFinite(stepPx) || stepPx <= 0) return p;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return p;
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return p;
  if (!Number.isFinite(dirUnit.x) || !Number.isFinite(dirUnit.y)) return p;
  const dLen = len(dirUnit);
  if (!Number.isFinite(dLen) || dLen < 1e-6) return p;
  const u = { x: dirUnit.x / dLen, y: dirUnit.y / dLen };
  const v = sub(p, origin);
  const t = v.x * u.x + v.y * u.y;
  const tFloor = Math.floor(t / stepPx) * stepPx;
  return add(origin, mul(u, tFloor));
}

function quantizeEdgeHoverByChordLengthFloor(
  figure: Figure,
  hover: NonNullable<EdgeHover>,
  fromLocal: Vec2,
  stepPx: number
): NonNullable<EdgeHover> {
  if (!Number.isFinite(stepPx) || stepPx <= 0) return hover;
  if (!isFiniteVec2(fromLocal) || !isFiniteVec2(hover.pointLocal)) return hover;

  const edge = figure.edges.find((e) => e.id === hover.edgeId);
  if (!edge) return hover;

  const rawLen = dist(fromLocal, hover.pointLocal);
  if (!Number.isFinite(rawLen)) return hover;

  const targetLen = Math.floor(rawLen / stepPx) * stepPx;
  if (!Number.isFinite(targetLen) || targetLen <= 0) return hover;

  const fromNode = getNodeById(figure.nodes, edge.from);
  const toNode = getNodeById(figure.nodes, edge.to);
  if (!fromNode || !toNode) return hover;

  // Straight edges: sample-less quantization.
  // edgeLocalPoints() returns only endpoints for line edges, which makes the hover
  // point "stick" to endpoints under high-precision mode. Instead, quantize by
  // intersecting the segment with the circle centered at fromLocal.
  if (edge.kind === "line") {
    const p0: Vec2 = { x: fromNode.x, y: fromNode.y };
    const p1: Vec2 = { x: toNode.x, y: toNode.y };
    if (!isFiniteVec2(p0) || !isFiniteVec2(p1)) return hover;

    const d = sub(p1, p0);
    const a = d.x * d.x + d.y * d.y;
    if (!Number.isFinite(a) || a < 1e-12) return hover;

    const r = targetLen;
    const f = sub(p0, fromLocal);
    const b = 2 * (f.x * d.x + f.y * d.y);
    const c = f.x * f.x + f.y * f.y - r * r;
    const disc = b * b - 4 * a * c;
    if (!Number.isFinite(disc) || disc < 0) return hover;

    const sqrtDisc = Math.sqrt(Math.max(0, disc));
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    const candidates: Array<{ t: number; p: Vec2 }> = [];
    if (t1 >= 0 && t1 <= 1) candidates.push({ t: t1, p: add(p0, mul(d, t1)) });
    if (t2 >= 0 && t2 <= 1) candidates.push({ t: t2, p: add(p0, mul(d, t2)) });
    if (candidates.length === 0) return hover;

    let best = candidates[0];
    let bestD = dist(best.p, hover.pointLocal);
    for (let i = 1; i < candidates.length; i++) {
      const dd = dist(candidates[i].p, hover.pointLocal);
      if (dd < bestD) {
        best = candidates[i];
        bestD = dd;
      }
    }

    if (!isFiniteVec2(best.p) || !Number.isFinite(best.t)) return hover;
    return {
      ...hover,
      t: best.t,
      pointLocal: best.p,
    };
  }

  const pts = edgeLocalPoints(figure, edge, 60);
  if (pts.length < 2) return hover;

  let bestIndex = 0;
  let bestCost = Number.POSITIVE_INFINITY;

  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    if (!isFiniteVec2(pt)) continue;
    const t = i / (pts.length - 1);
    const dRaw = dist(fromLocal, pt);
    if (!Number.isFinite(dRaw)) continue;
    const dLen = Math.abs(dRaw - targetLen);
    const tPenalty = Math.abs(t - hover.t) * stepPx * 0.5;
    const cost = dLen + tPenalty;
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = i;
    }
  }

  const bestPt = pts[bestIndex];
  if (!bestPt || !isFiniteVec2(bestPt) || !Number.isFinite(bestCost)) {
    return hover;
  }

  const bestT = bestIndex / (pts.length - 1);
  return {
    ...hover,
    t: bestT,
    pointLocal: bestPt,
  };
}

type BoundingBox = { x: number; y: number; width: number; height: number };

type NodeSelection = {
  figureId: string;
  nodeId: string;
  handle: "in" | "out" | null;
} | null;

type EdgeHover = {
  figureId: string;
  edgeId: string;
  t: number;
  pointLocal: Vec2;
  snapKind?: "mid";
} | null;

type HoveredPique = {
  figureId: string;
  piqueId: string;
} | null;

type DartDraft = {
  figureId: string;
  step: "pickB" | "pickApex";
  aNodeId: string;
  bNodeId: string | null;
  shiftKey: boolean;
  shiftLockDirLocal: Vec2 | null;
  precisionSnap: boolean;
  currentWorld: Vec2;
} | null;

type MeasureDraft = {
  startWorld: Vec2;
  endWorld: Vec2;
  snappedEndWorld: Vec2;
  isSnapped: boolean;
} | null;

type MarqueeDraft = {
  startWorld: Vec2;
  currentWorld: Vec2;
  additive: boolean;
} | null;

function id(prefix: string): string {
  // crypto.randomUUID() is available in modern browsers; fallback for safety.
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

type MeasureEdgeHover = {
  figureId: string;
  edgeId: string;
} | null;

type EdgeContextMenuState = {
  x: number;
  y: number;
  figureId: string;
  edgeId: string | null;
  edgeKind: "line" | "cubic" | null;
} | null;

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  // Ray casting; poly is assumed closed (first point not repeated).
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];

    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}


function normalizeLineEdgesAtNodes(figure: Figure): Figure {
  const nodeById = new Map(figure.nodes.map((n) => [n.id, n]));
  const newEdges: FigureEdge[] = [];
  let changed = false;
  const eps = 1;

  for (const edge of figure.edges) {
    if (edge.kind !== "line") {
      newEdges.push(edge);
      continue;
    }

    const a = nodeById.get(edge.from);
    const b = nodeById.get(edge.to);
    if (!a || !b) {
      newEdges.push(edge);
      continue;
    }

    const ab = sub(b, a);
    const abLen2 = ab.x * ab.x + ab.y * ab.y;
    if (abLen2 < eps) {
      newEdges.push(edge);
      continue;
    }

    const onSegment = figure.nodes
      .map((n) => {
        const ap = sub(n, a);
        const cross = ab.x * ap.y - ab.y * ap.x;
        const dot = ab.x * ap.x + ab.y * ap.y;
        const t = dot / abLen2;
        return { node: n, t, cross, dot };
      })
      .filter((item) => Math.abs(item.cross) <= eps)
      .filter((item) => item.t >= -eps && item.t <= 1 + eps)
      .sort((u, v) => u.t - v.t);

    const unique: Array<{ node: FigureNode; t: number }> = [];
    for (const item of onSegment) {
      if (
        unique.length === 0 ||
        dist(unique[unique.length - 1].node, item.node) > eps
      ) {
        unique.push({ node: item.node, t: item.t });
      }
    }

    if (unique.length <= 2) {
      newEdges.push(edge);
      continue;
    }

    changed = true;
    for (let i = 0; i < unique.length - 1; i++) {
      const from = unique[i].node.id;
      const to = unique[i + 1].node.id;
      if (from === to) continue;
      newEdges.push({ id: id("e"), from, to, kind: "line" });
    }
  }

  if (!changed) return figure;
  return { ...figure, edges: newEdges };
}

function mergeCoincidentNodes(figure: Figure, eps = 1): Figure {
  const buckets = new Map<string, FigureNode>();
  const nodeMap = new Map<string, string>();
  const uniqueNodes: FigureNode[] = [];

  const keyFor = (x: number, y: number) =>
    `${Math.round(x / eps)}:${Math.round(y / eps)}`;

  for (const node of figure.nodes) {
    const key = keyFor(node.x, node.y);
    const existing = buckets.get(key);
    if (existing && dist(existing, node) <= eps) {
      nodeMap.set(node.id, existing.id);
      continue;
    }
    buckets.set(key, node);
    uniqueNodes.push(node);
    nodeMap.set(node.id, node.id);
  }

  const edgeKeySet = new Set<string>();
  const newEdges: FigureEdge[] = [];
  for (const edge of figure.edges) {
    const from = nodeMap.get(edge.from) ?? edge.from;
    const to = nodeMap.get(edge.to) ?? edge.to;
    if (from === to) continue;

    const a = uniqueNodes.find((n) => n.id === from);
    const b = uniqueNodes.find((n) => n.id === to);
    if (a && b && dist(a, b) <= eps) continue;

    const key = `${from}->${to}`;
    const reverseKey = `${to}->${from}`;
    if (edgeKeySet.has(key) || edgeKeySet.has(reverseKey)) continue;

    edgeKeySet.add(key);
    newEdges.push({ ...edge, from, to });
  }

  if (uniqueNodes.length === figure.nodes.length && newEdges.length === figure.edges.length) {
    return figure;
  }

  return { ...figure, nodes: uniqueNodes, edges: newEdges };
}

/**
 * Check if a point is inside a closed figure.
 * For simple figures, uses ray-casting. For figures with complex topology
 * (nodes with >2 edges), uses bounding box + proximity check since such figures
 * may have self-intersecting polylines where ray-casting fails.
 */
function isPointInsideClosedFigure(
  fig: Figure,
  pWorld: Vec2,
  samples: number,
  toleranceWorld = 0
): boolean {
  // Check if figure has complex topology (any node with >2 edges)
  const nodeEdgeCount = new Map<string, number>();
  for (const edge of fig.edges) {
    nodeEdgeCount.set(edge.from, (nodeEdgeCount.get(edge.from) ?? 0) + 1);
    nodeEdgeCount.set(edge.to, (nodeEdgeCount.get(edge.to) ?? 0) + 1);
  }
  let hasComplexTopology = false;
  for (const count of nodeEdgeCount.values()) {
    if (count > 2) {
      hasComplexTopology = true;
      break;
    }
  }
  
  // For complex topology, use the outer boundary polyline
  let poly: Vec2[];
  if (hasComplexTopology) {
    // Get the outer boundary polygon using seamFigure's robust walker (LOCAL coords)
    const localBoundary = getOuterLoopPolygon(fig);
    if (localBoundary.length >= 3) {
      // Transform to world coordinates
      poly = localBoundary.map((p) => figureLocalToWorld(fig, p));
    } else {
      // Fallback to regular polyline
      const flat = figureWorldPolyline(fig, samples);
      if (flat.length < 6) return false;
      poly = [];
      for (let k = 0; k < flat.length; k += 2) {
        poly.push({ x: flat[k], y: flat[k + 1] });
      }
    }
  } else {
    // Simple figure: use regular polyline
    const flat = figureWorldPolyline(fig, samples);
    if (flat.length < 6) return false;
    poly = [];
    for (let k = 0; k < flat.length; k += 2) {
      poly.push({ x: flat[k], y: flat[k + 1] });
    }
  }
  
  if (poly.length < 3) return false;
  
  // Use ray-casting on the (outer boundary) polygon
  if (pointInPolygon(pWorld, poly)) return true;

  if (toleranceWorld > 0) {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const hit = pointToSegmentDistance(pWorld, a, b);
      if (hit.d < best) best = hit.d;
    }
    return best <= toleranceWorld;
  }

  return false;
}

function findHoveredClosedFigureOrSeamBaseId(
  figures: Figure[],
  pWorld: Vec2,
  samples: number,
  toleranceWorld = 0
): string | null {
  // Prefer top-most (later in array). If hovering inside a seam, treat it as hovering its base.
  for (let i = figures.length - 1; i >= 0; i--) {
    const fig = figures[i];
    if (!fig.closed && !hasClosedLoop(fig)) continue;

    const isInside = isPointInsideClosedFigure(
      fig,
      pWorld,
      samples,
      toleranceWorld
    );
    if (!isInside) continue;

    if (fig.kind === "seam") {
      return fig.parentId ?? null;
    }
    return fig.id;
  }
  return null;
}

function findHoveredFigureId(
  figures: Figure[],
  pWorld: Vec2,
  thresholdWorld: number
): string | null {
  let bestD = Number.POSITIVE_INFINITY;
  let bestId: string | null = null;

  for (const fig of figures) {
    if (fig.tool === "text") {
      const b = figureWorldBoundingBox(fig);
      if (!b) continue;
      const dx =
        pWorld.x < b.x
          ? b.x - pWorld.x
          : pWorld.x > b.x + b.width
            ? pWorld.x - (b.x + b.width)
            : 0;
      const dy =
        pWorld.y < b.y
          ? b.y - pWorld.y
          : pWorld.y > b.y + b.height
            ? pWorld.y - (b.y + b.height)
            : 0;
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        bestId = fig.id;
      }
      continue;
    }

    const poly = figureWorldPolyline(fig, 60);
    const hit = nearestOnPolylineWorld(pWorld, poly);
    if (!hit) continue;
    if (hit.d < bestD) {
      bestD = hit.d;
      bestId = fig.kind === "seam" && fig.parentId ? fig.parentId : fig.id;
    }
  }

  return bestD <= thresholdWorld ? bestId : null;
}

function pickFigureIdByEdgePriority(
  figures: Figure[],
  pWorld: Vec2,
  opts: { thresholdWorld: number; samples: number }
): string | null {
  const thresholdWorld = Math.max(0, opts.thresholdWorld);
  const samples = Math.max(6, opts.samples);

  // Track best hit per *base* id (so seams select their parent).
  const bestByBaseId = new Map<
    string,
    { d: number; z: number; inside: boolean; area: number }
  >();

  let anyInside = false;

  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i];
    const baseId = fig.kind === "seam" ? (fig.parentId ?? fig.id) : fig.id;

    if (fig.tool === "text") {
      const b = figureWorldBoundingBox(fig);
      if (!b) continue;
      const inside =
        pWorld.x >= b.x &&
        pWorld.x <= b.x + b.width &&
        pWorld.y >= b.y &&
        pWorld.y <= b.y + b.height;
      const dx =
        pWorld.x < b.x
          ? b.x - pWorld.x
          : pWorld.x > b.x + b.width
            ? pWorld.x - (b.x + b.width)
            : 0;
      const dy =
        pWorld.y < b.y
          ? b.y - pWorld.y
          : pWorld.y > b.y + b.height
            ? pWorld.y - (b.y + b.height)
            : 0;
      const d = Math.hypot(dx, dy);

      // Text figures must follow the same hit contract as other figures:
      // - inside always counts
      // - otherwise require proximity within threshold
      if (!inside && d > thresholdWorld) continue;

      const prev = bestByBaseId.get(baseId);
      const area = Math.max(0, b.width) * Math.max(0, b.height);
      if (!prev || d < prev.d) {
        bestByBaseId.set(baseId, { d, z: i, inside, area });
      }
      if (inside) anyInside = true;
      continue;
    }

    const poly = figureWorldPolyline(fig, samples);
    const hit = nearestOnPolylineWorld(pWorld, poly);
    if (!hit) continue;

    let inside = false;
    if (fig.closed && poly.length >= 6) {
      const polyPts: Vec2[] = [];
      for (let k = 0; k < poly.length; k += 2) {
        polyPts.push({ x: poly[k], y: poly[k + 1] });
      }
      // Remove duplicate last point if present.
      if (
        polyPts.length >= 3 &&
        dist(polyPts[0], polyPts[polyPts.length - 1]) < 1e-3
      ) {
        polyPts.pop();
      }
      inside = pointInPolygon(pWorld, polyPts);
    }

    // Approximate size for tie-break when multiple shapes contain the point.
    let area = Number.POSITIVE_INFINITY;
    if (poly.length >= 6) {
      let minX = poly[0];
      let minY = poly[1];
      let maxX = poly[0];
      let maxY = poly[1];
      for (let k = 2; k < poly.length; k += 2) {
        minX = Math.min(minX, poly[k]);
        minY = Math.min(minY, poly[k + 1]);
        maxX = Math.max(maxX, poly[k]);
        maxY = Math.max(maxY, poly[k + 1]);
      }
      area = Math.max(0, (maxX - minX) * (maxY - minY));
    }

    // Open figures: require proximity to contour.
    // Closed figures: allow selection anywhere inside.
    if (!inside && hit.d > thresholdWorld) continue;

    if (inside) anyInside = true;

    const existing = bestByBaseId.get(baseId);
    if (
      !existing ||
      hit.d < existing.d - 1e-6 ||
      (Math.abs(hit.d - existing.d) <= 1e-6 && i > existing.z)
    ) {
      bestByBaseId.set(baseId, { d: hit.d, z: i, inside, area });
    }
  }

  let bestId: string | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  let bestZ = -1;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const [id, v] of bestByBaseId.entries()) {
    // If any closed shape contains the pointer, restrict competition to inside shapes.
    if (anyInside && !v.inside) continue;

    if (v.d < bestD - 1e-6) {
      bestId = id;
      bestD = v.d;
      bestArea = v.area;
      bestZ = v.z;
      continue;
    }

    if (Math.abs(v.d - bestD) <= 1e-6) {
      // Prefer the most specific (smallest) containing shape.
      if (v.area < bestArea - 1e-3) {
        bestId = id;
        bestArea = v.area;
        bestZ = v.z;
        continue;
      }
      if (Math.abs(v.area - bestArea) <= 1e-3 && v.z > bestZ) {
        bestId = id;
        bestZ = v.z;
      }
    }
  }

  return bestId;
}

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();

    const observer = new MutationObserver(() => update());
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function resolveAci7(isDark: boolean): string {
  // AutoCAD ACI 7: "intelligent" black/white depending on background.
  return isDark ? "#ffffff" : "#000000";
}

function resolveStrokeColor(
  stroke: string | undefined,
  isDark: boolean
): string {
  if (!stroke) return resolveAci7(isDark);
  const s = stroke.toLowerCase();
  if (s === "aci7") return resolveAci7(isDark);
  // Back-compat: older projects defaulted to black; treat that as "auto".
  if (s === "#000" || s === "#000000") return resolveAci7(isDark);
  return stroke;
}

function isEffectivelyTransparentFill(fill: string | undefined): boolean {
  if (!fill) return true;
  const s = fill.trim().toLowerCase();
  if (s === "transparent") return true;

  // Common explicit alpha-0 formats.
  if (/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(\.0+)?\s*\)$/.test(s)) {
    return true;
  }
  if (/^#([0-9a-f]{8})$/.test(s)) {
    // #RRGGBBAA
    return s.endsWith("00");
  }
  return false;
}

function splitPolylineAtPoint(
  points: Vec2[],
  p: Vec2
): {
  left: Vec2[];
  right: Vec2[];
  cutPoint: Vec2;
  leftLengthPx: number;
  totalLengthPx: number;
} | null {
  if (points.length < 2) return null;

  let totalLength = 0;
  const segLens: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const l = dist(points[i], points[i + 1]);
    segLens.push(l);
    totalLength += l;
  }

  let bestD = Number.POSITIVE_INFINITY;
  let bestSeg = 0;
  let bestT = 0;
  let bestCumToA = 0;

  let cum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const hit = pointToSegmentDistance(p, a, b);
    if (hit.d < bestD) {
      bestD = hit.d;
      bestSeg = i;
      bestT = hit.t;
      bestCumToA = cum;
    }
    cum += segLens[i];
  }

  const a = points[bestSeg];
  const b = points[bestSeg + 1];
  const cutPoint = lerp(a, b, bestT);
  const segLen = segLens[bestSeg] ?? dist(a, b);
  const leftLen = bestCumToA + bestT * segLen;

  const left = [...points.slice(0, bestSeg + 1), cutPoint];
  const right = [cutPoint, ...points.slice(bestSeg + 1)];
  return {
    left,
    right,
    cutPoint,
    leftLengthPx: leftLen,
    totalLengthPx: totalLength,
  };
}

function slicePolylineByArcLength(
  points: Vec2[],
  s0Px: number,
  s1Px: number
): Vec2[] {
  if (points.length < 2) return points;

  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const l = dist(points[i], points[i + 1]);
    segLens.push(l);
    total += l;
  }
  if (!Number.isFinite(total) || total < 1e-6)
    return [points[0], points[points.length - 1]];

  const s0 = clamp(s0Px, 0, total);
  const s1 = clamp(s1Px, 0, total);
  const aS = Math.min(s0, s1);
  const bS = Math.max(s0, s1);

  const out: Vec2[] = [];

  const pointAt = (sPx: number): Vec2 => {
    const s = clamp(sPx, 0, total);
    let acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      const l = segLens[i];
      if (acc + l >= s || i === segLens.length - 1) {
        const u = l > 1e-6 ? (s - acc) / l : 0;
        return lerp(points[i], points[i + 1], u);
      }
      acc += l;
    }
    return points[points.length - 1];
  };

  out.push(pointAt(aS));

  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    const l = segLens[i];
    const nextAcc = acc + l;
    const aInside = nextAcc > aS + 1e-9;
    const bInside = nextAcc < bS - 1e-9;
    if (aInside && bInside) {
      out.push(points[i + 1]);
    }
    acc = nextAcc;
  }

  out.push(pointAt(bS));
  return out;
}

function getPiqueEdgeBreakpointsT01(figure: Figure, edgeId: string): number[] {
  const piques = figure.piques ?? [];
  const ts: number[] = [];
  for (const pk of piques) {
    if (pk.edgeId !== edgeId) continue;
    const t = clamp(pk.t01, 0, 1);
    if (t <= 1e-6 || t >= 1 - 1e-6) continue;
    ts.push(t);
  }
  ts.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const t of ts) {
    if (!unique.length || Math.abs(t - unique[unique.length - 1]) > 1e-4) {
      unique.push(t);
    }
  }
  return unique;
}

function pickActiveSegmentS(
  breakpointsS: number[],
  sCursorPx: number
): { s0: number; s1: number } {
  if (breakpointsS.length < 2) return { s0: 0, s1: 0 };
  const s = clamp(
    sCursorPx,
    breakpointsS[0],
    breakpointsS[breakpointsS.length - 1]
  );

  for (let i = 0; i < breakpointsS.length - 1; i++) {
    const a = breakpointsS[i];
    const b = breakpointsS[i + 1];
    if (s >= a && s < b) return { s0: a, s1: b };
  }
  const n = breakpointsS.length;
  return { s0: breakpointsS[n - 2], s1: breakpointsS[n - 1] };
}

function pointAndTangentAtArcLength(
  points: Vec2[],
  sPx: number
): { point: Vec2; tangentUnit: Vec2 } | null {
  if (points.length < 2) return null;

  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const l = dist(points[i], points[i + 1]);
    segLens.push(l);
    total += l;
  }
  if (!Number.isFinite(total) || total < 1e-6) {
    const v = sub(points[points.length - 1], points[0]);
    return { point: points[0], tangentUnit: norm(v) };
  }

  const s = clamp(sPx, 0, total);
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    const l = segLens[i];
    if (acc + l >= s || i === segLens.length - 1) {
      const a = points[i];
      const b = points[i + 1];
      const u = l > 1e-6 ? (s - acc) / l : 0;
      const point = lerp(a, b, u);
      const tangentUnit = norm(sub(b, a));
      return { point, tangentUnit };
    }
    acc += l;
  }

  const a = points[points.length - 2];
  const b = points[points.length - 1];
  return { point: b, tangentUnit: norm(sub(b, a)) };
}

function pointAndTangentAtT01(
  points: Vec2[],
  t01: number
): { point: Vec2; tangentUnit: Vec2; totalLengthPx: number } | null {
  if (points.length < 2) return null;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += dist(points[i], points[i + 1]);
  }
  if (!Number.isFinite(total) || total < 1e-6) {
    const v = sub(points[points.length - 1], points[0]);
    return { point: points[0], tangentUnit: norm(v), totalLengthPx: 0 };
  }
  const s = clamp(t01, 0, 1) * total;
  const at = pointAndTangentAtArcLength(points, s);
  if (!at) return null;
  return { ...at, totalLengthPx: total };
}

function nearestOnPolylineWorld(
  pWorld: Vec2,
  poly: number[]
): { d: number; point: Vec2 } | null {
  if (poly.length < 4) return null;
  let bestD = Number.POSITIVE_INFINITY;
  let bestPoint: Vec2 = { x: poly[0], y: poly[1] };
  for (let i = 0; i < poly.length - 2; i += 2) {
    const a: Vec2 = { x: poly[i], y: poly[i + 1] };
    const b: Vec2 = { x: poly[i + 2], y: poly[i + 3] };
    const hit = pointToSegmentDistance(pWorld, a, b);
    if (hit.d < bestD) {
      bestD = hit.d;
      bestPoint = lerp(a, b, hit.t);
    }
  }
  return { d: bestD, point: bestPoint };
}

type SnapResult =
  | {
      isSnapped: true;
      pointWorld: Vec2;
      kind: "node" | "edge" | "guide";
      figureId?: string;
    }
  | {
      isSnapped: false;
    };

function snapWorldPoint(
  pWorld: Vec2,
  figures: Figure[],
  guides: GuideLine[],
  opts: {
    thresholdWorld: number;
    excludeSeams?: boolean;
    includeNodes?: boolean;
    excludeFigureIds?: Set<string>;
  }
): SnapResult {
  const threshold = Math.max(0, opts.thresholdWorld);
  if (!Number.isFinite(threshold) || threshold <= 0)
    return { isSnapped: false };

  const excludeSeams = opts.excludeSeams !== false;
  const includeNodes = opts.includeNodes !== false;
  const excludeFigureIds = opts.excludeFigureIds;

  // 1) Nodes (priority)
  if (includeNodes) {
    let bestD = Number.POSITIVE_INFINITY;
    let bestPoint: Vec2 | null = null;
    let bestFigureId: string | null = null;

    for (const fig of figures) {
      if (excludeSeams && fig.kind === "seam") continue;
      if (excludeFigureIds && excludeFigureIds.has(fig.id)) continue;
      for (const n of fig.nodes) {
        const nw = figureLocalToWorld(fig, { x: n.x, y: n.y });
        const d = dist(pWorld, nw);
        if (d < bestD) {
          bestD = d;
          bestPoint = nw;
          bestFigureId = fig.id;
        }
      }
    }

    if (bestPoint && bestFigureId && bestD <= threshold) {
      return {
        isSnapped: true,
        pointWorld: bestPoint,
        kind: "node",
        figureId: bestFigureId,
      };
    }
  }

  // 1.5) Manual guide lines (magnetic)
  if (guides.length) {
    let bestDx = Number.POSITIVE_INFINITY;
    let bestX: number | null = null;
    let bestDy = Number.POSITIVE_INFINITY;
    let bestY: number | null = null;

    for (const g of guides) {
      if (g.orientation === "vertical") {
        const dx = Math.abs(pWorld.x - g.valuePx);
        if (dx < bestDx) {
          bestDx = dx;
          bestX = g.valuePx;
        }
      } else {
        const dy = Math.abs(pWorld.y - g.valuePx);
        if (dy < bestDy) {
          bestDy = dy;
          bestY = g.valuePx;
        }
      }
    }

    const snapX = bestX != null && bestDx <= threshold;
    const snapY = bestY != null && bestDy <= threshold;

    if (snapX || snapY) {
      return {
        isSnapped: true,
        pointWorld: {
          x: snapX ? (bestX as number) : pWorld.x,
          y: snapY ? (bestY as number) : pWorld.y,
        },
        kind: "guide",
      };
    }
  }

  // 2) Edges / contour (polyline approximation)
  let bestD = Number.POSITIVE_INFINITY;
  let bestPoint: Vec2 | null = null;
  let bestFigureId: string | null = null;

  for (const fig of figures) {
    if (excludeSeams && fig.kind === "seam") continue;
    if (excludeFigureIds && excludeFigureIds.has(fig.id)) continue;
    const poly = figureWorldPolyline(fig, 60);
    const hit = nearestOnPolylineWorld(pWorld, poly);
    if (!hit) continue;
    if (hit.d < bestD) {
      bestD = hit.d;
      bestPoint = hit.point;
      bestFigureId = fig.id;
    }
  }

  if (bestPoint && bestFigureId && bestD <= threshold) {
    return {
      isSnapped: true,
      pointWorld: bestPoint,
      kind: "edge",
      figureId: bestFigureId,
    };
  }

  return { isSnapped: false };
}

function getNodeById(nodes: FigureNode[], id: string): FigureNode | undefined {
  return nodes.find((n) => n.id === id);
}

function nearestOnEdgeLocal(
  figure: Figure,
  edge: FigureEdge,
  pLocal: Vec2
): { d: number; t: number; pointLocal: Vec2 } | null {
  const pts = edgeLocalPoints(figure, edge, edge.kind === "line" ? 1 : 40);
  if (pts.length < 2) return null;

  let bestD = Number.POSITIVE_INFINITY;
  let bestT = 0;
  let bestPoint = pts[0];

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const hit = pointToSegmentDistance(pLocal, a, b);
    if (hit.d < bestD) {
      bestD = hit.d;
      const segT = hit.t;
      const t = (i + segT) / (pts.length - 1);
      bestT = t;
      bestPoint = lerp(a, b, segT);
    }
  }

  return { d: bestD, t: bestT, pointLocal: bestPoint };
}

function findNearestEdge(
  figure: Figure,
  pLocal: Vec2
): { best: EdgeHover; bestDist: number } {
  let best: EdgeHover = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const edge of figure.edges) {
    const hit = nearestOnEdgeLocal(figure, edge, pLocal);
    if (!hit) continue;
    if (hit.d < bestDist) {
      bestDist = hit.d;
      best = {
        figureId: figure.id,
        edgeId: edge.id,
        t: hit.t,
        pointLocal: hit.pointLocal,
      };
    }
  }
  return { best, bestDist };
}

function findNearestEdgeInSet(
  figure: Figure,
  pLocal: Vec2,
  edgeIds: Set<string>
): { best: EdgeHover; bestDist: number } {
  let best: EdgeHover = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const edge of figure.edges) {
    if (!edgeIds.has(edge.id)) continue;
    const hit = nearestOnEdgeLocal(figure, edge, pLocal);
    if (!hit) continue;
    if (hit.d < bestDist) {
      bestDist = hit.d;
      best = {
        figureId: figure.id,
        edgeId: edge.id,
        t: hit.t,
        pointLocal: hit.pointLocal,
      };
    }
  }
  return { best, bestDist };
}

function findNearestEdgeAcrossFigures(
  figures: Figure[],
  pWorld: Vec2,
  thresholdWorld: number
): { figure: Figure; edge: FigureEdge; local: Vec2 } | null {
  let bestDist = Number.POSITIVE_INFINITY;
  let bestFig: Figure | null = null;
  let bestEdge: FigureEdge | null = null;
  let bestLocal: Vec2 | null = null;
  let bestIndex = -1;

  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i];
    if (fig.kind === "seam") continue;
    if (!fig.edges.length) continue;

    const local = worldToFigureLocal(fig, pWorld);
    const hit = findNearestEdge(fig, local);
    if (!hit.best || hit.bestDist > thresholdWorld) continue;

    if (
      hit.bestDist < bestDist - 1e-6 ||
      (Math.abs(hit.bestDist - bestDist) <= 1e-6 && i > bestIndex)
    ) {
      const edge = fig.edges.find((ed) => ed.id === hit.best!.edgeId) ?? null;
      if (!edge) continue;
      bestDist = hit.bestDist;
      bestFig = fig;
      bestEdge = edge;
      bestLocal = local;
      bestIndex = i;
    }
  }

  if (!bestFig || !bestEdge || !bestLocal) return null;
  return { figure: bestFig, edge: bestEdge, local: bestLocal };
}

function computePiqueSegmentWorld(
  figure: Figure,
  pique: { edgeId: string; t01: number; lengthCm: number; side: 1 | -1 }
): { aWorld: Vec2; bWorld: Vec2 } | null {
  if (!figure.closed) return null;
  const edge = figure.edges.find((e) => e.id === pique.edgeId) ?? null;
  if (!edge) return null;

  const pts = edgeLocalPoints(figure, edge, edge.kind === "line" ? 2 : 120);
  if (pts.length < 2) return null;

  const at = pointAndTangentAtT01(pts, pique.t01);
  if (!at) return null;

  const n = norm(perp(at.tangentUnit));
  const side = pique.side === -1 ? -1 : 1;
  const lengthPx = Math.max(0, (pique.lengthCm || 0.5) * PX_PER_CM);
  const aLocal = at.point;
  const bLocal = add(aLocal, mul(n, lengthPx * side));

  return {
    aWorld: figureLocalToWorld(figure, aLocal),
    bWorld: figureLocalToWorld(figure, bLocal),
  };
}

function findHoveredPique(
  figures: Figure[],
  pWorld: Vec2,
  thresholdWorld: number
): { figureId: string; piqueId: string } | null {
  if (!Number.isFinite(thresholdWorld) || thresholdWorld <= 0) return null;

  let best: { figureId: string; piqueId: string } | null = null;
  let bestD = Number.POSITIVE_INFINITY;

  for (const fig of figures) {
    if (!fig.closed) continue;
    const piques = fig.piques ?? [];
    if (!piques.length) continue;
    for (const pk of piques) {
      const seg = computePiqueSegmentWorld(fig, pk);
      if (!seg) continue;
      const hit = pointToSegmentDistance(pWorld, seg.aWorld, seg.bWorld);
      if (hit.d < bestD) {
        bestD = hit.d;
        best = { figureId: fig.id, piqueId: pk.id };
      }
    }
  }

  if (!best || bestD > thresholdWorld) return null;
  return best;
}

type EdgeSplitResult = {
  figure: Figure;
  newNodeId?: string;
  replacedEdgeId?: string;
  replacementEdgeIds?: [string, string];
};

function applySplitResultToFigureSet(
  prev: Figure[],
  figureId: string,
  split: EdgeSplitResult
): Figure[] {
  const replacedEdgeId = split.replacedEdgeId;
  const replacementEdgeIds = split.replacementEdgeIds;
  let changed = false;

  const next = prev.map((f) => {
    if (f.id === figureId) {
      changed = true;
      return split.figure;
    }

    if (!replacedEdgeId || !replacementEdgeIds) return f;
    if (f.kind !== "seam" || f.parentId !== figureId) return f;
    if (!f.offsetCm || typeof f.offsetCm !== "object") return f;

    const inherited = f.offsetCm[replacedEdgeId];
    if (!Number.isFinite(inherited) || inherited <= 0) return f;

    const nextOffsets: Record<string, number> = { ...f.offsetCm };
    delete nextOffsets[replacedEdgeId];
    nextOffsets[replacementEdgeIds[0]] = inherited;
    nextOffsets[replacementEdgeIds[1]] = inherited;

    changed = true;
    return { ...f, offsetCm: nextOffsets };
  });

  return changed ? next : prev;
}

function splitFigureEdge(
  figure: Figure,
  edgeId: string,
  t: number
): EdgeSplitResult {
  const edgeIndex = figure.edges.findIndex((e) => e.id === edgeId);
  if (edgeIndex === -1) return { figure };
  const edge = figure.edges[edgeIndex];

  const eps = 0.02;
  const safeT = clamp(t, eps, 1 - eps);

  const fromNode = getNodeById(figure.nodes, edge.from);
  const toNode = getNodeById(figure.nodes, edge.to);
  if (!fromNode || !toNode) return { figure };

  const p0: Vec2 = { x: fromNode.x, y: fromNode.y };
  const p3: Vec2 = { x: toNode.x, y: toNode.y };

  if (edge.kind === "line") {
    const mid = lerp(p0, p3, safeT);
    const newNodeId = id("n");
    const newNode: FigureNode = {
      id: newNodeId,
      x: mid.x,
      y: mid.y,
      mode: "corner",
    };

    const e1: FigureEdge = {
      id: id("e"),
      from: fromNode.id,
      to: newNodeId,
      kind: "line",
    };
    const e2: FigureEdge = {
      id: id("e"),
      from: newNodeId,
      to: toNode.id,
      kind: "line",
    };

    const nextEdges = [...figure.edges];
    nextEdges.splice(edgeIndex, 1, e1, e2);

    return {
      figure: markCurveCustomSnapshotDirtyIfPresent(
        breakStyledLinkIfNeeded({
          ...figure,
          nodes: [...figure.nodes, newNode],
          edges: nextEdges,
        })
      ),
      newNodeId,
      replacedEdgeId: edge.id,
      replacementEdgeIds: [e1.id, e2.id],
    };
  }

  const p1: Vec2 = fromNode.outHandle
    ? { x: fromNode.outHandle.x, y: fromNode.outHandle.y }
    : p0;
  const p2: Vec2 = toNode.inHandle
    ? { x: toNode.inHandle.x, y: toNode.inHandle.y }
    : p3;

  // De Casteljau split
  const p01 = lerp(p0, p1, safeT);
  const p12 = lerp(p1, p2, safeT);
  const p23 = lerp(p2, p3, safeT);
  const p012 = lerp(p01, p12, safeT);
  const p123 = lerp(p12, p23, safeT);
  const p0123 = lerp(p012, p123, safeT);

  const newNodeId = id("n");
  const newNode: FigureNode = {
    id: newNodeId,
    x: p0123.x,
    y: p0123.y,
    mode: "smooth",
    inHandle: { x: p012.x, y: p012.y },
    outHandle: { x: p123.x, y: p123.y },
  };

  const nextNodes = figure.nodes.map((n) => {
    if (n.id === fromNode.id) {
      return {
        ...n,
        outHandle: { x: p01.x, y: p01.y },
      };
    }
    if (n.id === toNode.id) {
      return {
        ...n,
        inHandle: { x: p23.x, y: p23.y },
      };
    }
    return n;
  });

  const e1: FigureEdge = {
    id: id("e"),
    from: fromNode.id,
    to: newNodeId,
    kind: "cubic",
  };
  const e2: FigureEdge = {
    id: id("e"),
    from: newNodeId,
    to: toNode.id,
    kind: "cubic",
  };
  const nextEdges = [...figure.edges];
  nextEdges.splice(edgeIndex, 1, e1, e2);

  return {
    figure: markCurveCustomSnapshotDirtyIfPresent(
      breakStyledLinkIfNeeded({
        ...figure,
        nodes: [...nextNodes, newNode],
        edges: nextEdges,
      })
    ),
    newNodeId,
    replacedEdgeId: edge.id,
    replacementEdgeIds: [e1.id, e2.id],
  };
}

function getFigureNodePoint(figure: Figure, nodeId: string): Vec2 | null {
  const n = figure.nodes.find((node) => node.id === nodeId);
  if (!n) return null;
  return { x: n.x, y: n.y };
}

function resolveDartApexLocal(
  figure: Figure,
  draft: DartDraft,
  rawApexLocal: Vec2,
  precisionSnap: boolean
): Vec2 {
  if (!draft || draft.step !== "pickApex") return rawApexLocal;

  // Defensive: keep previews stable even if pointer math glitches.
  if (!isFiniteVec2(rawApexLocal)) return rawApexLocal;

  const a = getFigureNodePoint(figure, draft.aNodeId);
  const b = draft.bNodeId ? getFigureNodePoint(figure, draft.bNodeId) : null;
  if (!a || !b) return rawApexLocal;

  const mid = lerp(a, b, 0.5);

  // Cmd/Ctrl precision (without Shift): quantize the apex distance from the midpoint
  // in 1mm steps, along the current drag direction.
  if (precisionSnap && !draft.shiftKey) {
    const snapped = snapPointAlongDirFloor(
      rawApexLocal,
      mid,
      sub(rawApexLocal, mid),
      PX_PER_MM
    );
    return isFiniteVec2(snapped) ? snapped : rawApexLocal;
  }

  if (!draft.shiftKey) return rawApexLocal;

  // Shift constraint for darts:
  // Keep the apex on the perpendicular bisector of AB (perfectly symmetric dart),
  // on the same side of the base as the mouse.
  const ab = sub(b, a);
  const abLen = len(ab);
  if (!Number.isFinite(abLen) || abLen < 1e-6) return rawApexLocal;
  const nUnit = norm(perp(ab));
  if (!Number.isFinite(nUnit.x) || !Number.isFinite(nUnit.y))
    return rawApexLocal;
  if (len(nUnit) < 1e-6) return rawApexLocal;

  const ap = sub(rawApexLocal, a);
  const crossZ = ab.x * ap.y - ab.y * ap.x;
  const signedHeight = crossZ / abLen;
  const heightRaw = Math.abs(signedHeight);
  const height = precisionSnap
    ? Math.floor(heightRaw / PX_PER_MM) * PX_PER_MM
    : heightRaw;
  const orientedN = signedHeight >= 0 ? nUnit : mul(nUnit, -1);

  const snapped = add(mid, mul(orientedN, height));
  return isFiniteVec2(snapped) ? snapped : rawApexLocal;
}

function mirrorVec2AcrossLine(
  p: Vec2,
  axisPoint: Vec2,
  axisDirUnit: Vec2
): Vec2 {
  const u = axisDirUnit;
  const v = sub(p, axisPoint);
  const projLen = v.x * u.x + v.y * u.y;
  const proj = mul(u, projLen);
  const perpV = sub(v, proj);
  return add(axisPoint, sub(proj, perpV));
}

type MirrorSide = "left" | "right" | "top" | "bottom";

function worldToScreen(
  world: Vec2,
  view: { position: { x: number; y: number }; scale: number }
): Vec2 {
  return {
    x: world.x * view.scale + view.position.x,
    y: world.y * view.scale + view.position.y,
  };
}

function pickMirrorSideByScreenBBox(
  figure: Figure,
  pWorld: Vec2,
  view: { position: { x: number; y: number }; scale: number }
): MirrorSide {
  const bb = figureWorldBoundingBox(figure);
  if (!bb) return "right";

  const left = bb.x * view.scale + view.position.x;
  const right = (bb.x + bb.width) * view.scale + view.position.x;
  const top = bb.y * view.scale + view.position.y;
  const bottom = (bb.y + bb.height) * view.scale + view.position.y;

  const s = worldToScreen(pWorld, view);
  const dLeft = Math.abs(s.x - left);
  const dRight = Math.abs(right - s.x);
  const dTop = Math.abs(s.y - top);
  const dBottom = Math.abs(bottom - s.y);

  const min = Math.min(dLeft, dRight, dTop, dBottom);
  if (min === dRight) return "right";
  if (min === dLeft) return "left";
  if (min === dBottom) return "bottom";
  return "top";
}

function axisDirForSide(side: MirrorSide): Vec2 {
  // Right/Left => horizontal flip => mirror across vertical axis (dir is vertical).
  if (side === "right" || side === "left") return { x: 0, y: 1 };
  // Top/Bottom => vertical flip => mirror across horizontal axis (dir is horizontal).
  return { x: 1, y: 0 };
}

function pickAnchorNodeIdForEdgeSide(
  figure: Figure,
  edge: FigureEdge,
  side: MirrorSide,
  view: { position: { x: number; y: number }; scale: number }
): string {
  const nFrom = figure.nodes.find((n) => n.id === edge.from) ?? null;
  const nTo = figure.nodes.find((n) => n.id === edge.to) ?? null;
  if (!nFrom || !nTo) return edge.to;

  const pFromW = figureLocalToWorld(figure, { x: nFrom.x, y: nFrom.y });
  const pToW = figureLocalToWorld(figure, { x: nTo.x, y: nTo.y });
  const sFrom = worldToScreen(pFromW, view);
  const sTo = worldToScreen(pToW, view);

  const EPS = 0.5;

  const pickRightmost = () => {
    if (sFrom.x > sTo.x + EPS) return nFrom.id;
    if (sTo.x > sFrom.x + EPS) return nTo.id;
    // Tie-break: choose lower on screen.
    if (sFrom.y > sTo.y + EPS) return nFrom.id;
    if (sTo.y > sFrom.y + EPS) return nTo.id;
    return edge.to;
  };

  const pickLeftmost = () => {
    if (sFrom.x < sTo.x - EPS) return nFrom.id;
    if (sTo.x < sFrom.x - EPS) return nTo.id;
    // Tie-break: choose lower on screen.
    if (sFrom.y > sTo.y + EPS) return nFrom.id;
    if (sTo.y > sFrom.y + EPS) return nTo.id;
    return edge.to;
  };

  const pickTopmost = () => {
    if (sFrom.y < sTo.y - EPS) return nFrom.id;
    if (sTo.y < sFrom.y - EPS) return nTo.id;
    // Tie-break: choose rightmost on screen.
    if (sFrom.x > sTo.x + EPS) return nFrom.id;
    if (sTo.x > sFrom.x + EPS) return nTo.id;
    return edge.to;
  };

  const pickBottommost = () => {
    if (sFrom.y > sTo.y + EPS) return nFrom.id;
    if (sTo.y > sFrom.y + EPS) return nTo.id;
    // Tie-break: choose rightmost on screen.
    if (sFrom.x > sTo.x + EPS) return nFrom.id;
    if (sTo.x > sFrom.x + EPS) return nTo.id;
    return edge.to;
  };

  if (side === "right") return pickRightmost();
  if (side === "left") return pickLeftmost();
  if (side === "top") return pickTopmost();
  return pickBottommost();
}

function translateFigureGeometryWorld(figure: Figure, delta: Vec2): Figure {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return figure;
  if (Math.abs(delta.x) < 1e-12 && Math.abs(delta.y) < 1e-12) return figure;
  return {
    ...figure,
    nodes: figure.nodes.map((n) => ({
      ...n,
      x: n.x + delta.x,
      y: n.y + delta.y,
      inHandle: n.inHandle
        ? { x: n.inHandle.x + delta.x, y: n.inHandle.y + delta.y }
        : undefined,
      outHandle: n.outHandle
        ? { x: n.outHandle.x + delta.x, y: n.outHandle.y + delta.y }
        : undefined,
    })),
  };
}

function mirrorFigureAcrossLineAnchored(
  figure: Figure,
  axisPointWorld: Vec2,
  axisDirWorld: Vec2,
  anchorNodeId: string
): Figure {
  const mirrored = mirrorFigureAcrossLine(figure, axisPointWorld, axisDirWorld);
  const origAnchor = figure.nodes.find((n) => n.id === anchorNodeId) ?? null;
  const mirAnchor = mirrored.nodes.find((n) => n.id === anchorNodeId) ?? null;
  if (!origAnchor || !mirAnchor) return mirrored;

  const origWorld = figureLocalToWorld(figure, {
    x: origAnchor.x,
    y: origAnchor.y,
  });
  const mirWorld = { x: mirAnchor.x, y: mirAnchor.y };
  const delta = { x: origWorld.x - mirWorld.x, y: origWorld.y - mirWorld.y };
  return translateFigureGeometryWorld(mirrored, delta);
}

function mirrorFigureAcrossLine(
  figure: Figure,
  axisPointWorld: Vec2,
  axisDirWorld: Vec2
): Figure {
  const axisDirUnit = (() => {
    const l = len(axisDirWorld);
    if (!Number.isFinite(l) || l < 1e-6) return { x: 1, y: 0 };
    return mul(axisDirWorld, 1 / l);
  })();

  const mirroredNodes: FigureNode[] = figure.nodes.map((n) => {
    const pWorld = figureLocalToWorld(figure, { x: n.x, y: n.y });
    const p = mirrorVec2AcrossLine(pWorld, axisPointWorld, axisDirUnit);
    const inH = n.inHandle
      ? mirrorVec2AcrossLine(
          figureLocalToWorld(figure, n.inHandle),
          axisPointWorld,
          axisDirUnit
        )
      : undefined;
    const outH = n.outHandle
      ? mirrorVec2AcrossLine(
          figureLocalToWorld(figure, n.outHandle),
          axisPointWorld,
          axisDirUnit
        )
      : undefined;
    return {
      ...n,
      x: p.x,
      y: p.y,
      inHandle: inH,
      outHandle: outH,
    };
  });

  return {
    ...figure,
    id: id("fig"),
    x: 0,
    y: 0,
    rotation: 0,
    nodes: mirroredNodes,
    piques: figure.piques
      ? figure.piques.map((p) => ({
          ...p,
          side: (p.side === -1 ? 1 : -1) as 1 | -1,
        }))
      : undefined,
  };
}

function clampHandle(anchor: Vec2, handle: Vec2, maxLen: number): Vec2 {
  if (!Number.isFinite(maxLen) || maxLen <= 0) return handle;
  const v = sub(handle, anchor);
  const l = len(v);
  if (l <= maxLen) return handle;
  const s = maxLen / l;
  return add(anchor, mul(v, s));
}

function buildDraftPreviewPoints(
  fixed: Vec2[],
  live: Vec2 | null,
  tol = 0.5
): Vec2[] {
  if (!fixed.length) return live ? [live] : [];
  if (!live) return fixed;
  const last = fixed[fixed.length - 1];
  return dist(last, live) <= tol ? fixed : [...fixed, live];
}

function dedupeByDistance(points: Vec2[], minDist: number): Vec2[] {
  if (points.length <= 1) return points;
  const out: Vec2[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (dist(out[out.length - 1], points[i]) >= minDist) {
      out.push(points[i]);
    }
  }
  return out;
}

function smoothPolyline(points: Vec2[]): Vec2[] {
  if (points.length <= 2) return points;
  const out: Vec2[] = [];
  out.push(points[0]);
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    out.push({
      x: prev.x * 0.2 + cur.x * 0.6 + next.x * 0.2,
      y: prev.y * 0.2 + cur.y * 0.6 + next.y * 0.2,
    });
  }
  out.push(points[points.length - 1]);
  return out;
}

function simplifyPolylineRdp(points: Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return points;
  if (!Number.isFinite(tolerance) || tolerance <= 0) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const range = stack.pop();
    if (!range) continue;
    const [start, end] = range;
    if (end - start <= 1) continue;

    const a = points[start];
    const b = points[end];
    let bestIdx = -1;
    let bestDist = 0;

    for (let i = start + 1; i < end; i++) {
      const d = pointToSegmentDistance(points[i], a, b).d;
      if (d > bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestDist > tolerance) {
      keep[bestIdx] = 1;
      stack.push([start, bestIdx], [bestIdx, end]);
    }
  }

  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]);
  }
  return out.length >= 2 ? out : [points[0], points[points.length - 1]];
}

function finalizePenStrokePoints(
  points: Vec2[],
  opts: {
    scale: number;
    highPrecision: boolean;
  }
): Vec2[] {
  if (points.length <= 1) return points;

  const minSampleWorld = (opts.highPrecision ? 0.8 : 1.6) / opts.scale;
  const toleranceWorld = (opts.highPrecision ? 0.6 : 1.2) / opts.scale;

  const deduped = dedupeByDistance(points, minSampleWorld);
  const smoothed = smoothPolyline(deduped);
  const simplified = simplifyPolylineRdp(smoothed, toleranceWorld);
  return dedupeByDistance(simplified, minSampleWorld * 0.5);
}

function makePolylineLineFigure(
  points: Vec2[],
  closed: boolean,
  stroke: string
): Figure | null {
  if (points.length < 2) return null;

  const nodes: FigureNode[] = points.map((p) => ({
    id: id("n"),
    x: p.x,
    y: p.y,
    mode: "corner",
  }));

  const edges: FigureEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: id("e"),
      from: nodes[i].id,
      to: nodes[i + 1].id,
      kind: "line",
    });
  }
  if (closed && nodes.length >= 3) {
    edges.push({
      id: id("e"),
      from: nodes[nodes.length - 1].id,
      to: nodes[0].id,
      kind: "line",
    });
  }

  return {
    id: id("fig"),
    tool: "line",
    x: 0,
    y: 0,
    rotation: 0,
    closed: closed && nodes.length >= 3,
    nodes,
    edges,
    stroke,
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
  };
}

function makeRectFigure(a: Vec2, b: Vec2, stroke: string): Figure {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x, b.x);
  const maxY = Math.max(a.y, b.y);

  const n1: FigureNode = { id: id("n"), x: minX, y: minY, mode: "corner" };
  const n2: FigureNode = { id: id("n"), x: maxX, y: minY, mode: "corner" };
  const n3: FigureNode = { id: id("n"), x: maxX, y: maxY, mode: "corner" };
  const n4: FigureNode = { id: id("n"), x: minX, y: maxY, mode: "corner" };

  const edges: FigureEdge[] = [
    { id: id("e"), from: n1.id, to: n2.id, kind: "line" },
    { id: id("e"), from: n2.id, to: n3.id, kind: "line" },
    { id: id("e"), from: n3.id, to: n4.id, kind: "line" },
    { id: id("e"), from: n4.id, to: n1.id, kind: "line" },
  ];

  return {
    id: id("fig"),
    tool: "rectangle",
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    nodes: [n1, n2, n3, n4],
    edges,
    stroke,
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
  };
}

function makeEllipseFigure(
  center: Vec2,
  rx: number,
  ry: number,
  stroke: string
): Figure {
  const safeRx = Math.max(0, rx);
  const safeRy = Math.max(0, ry);
  const { nodes } = ellipseAsCubics(safeRx, safeRy);
  const figureNodes: FigureNode[] = nodes.map((n) => ({
    id: id("n"),
    x: n.x,
    y: n.y,
    mode: n.mode,
    inHandle: { x: n.inHandle.x, y: n.inHandle.y },
    outHandle: { x: n.outHandle.x, y: n.outHandle.y },
  }));

  const edges: FigureEdge[] = [];
  for (let i = 0; i < figureNodes.length; i++) {
    const from = figureNodes[i];
    const to = figureNodes[(i + 1) % figureNodes.length];
    edges.push({ id: id("e"), from: from.id, to: to.id, kind: "cubic" });
  }

  return {
    id: id("fig"),
    tool: "circle",
    x: center.x,
    y: center.y,
    rotation: 0,
    closed: true,
    nodes: figureNodes,
    edges,
    stroke,
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
  };
}

type DraftMods = {
  shift: boolean;
  alt: boolean;
};

function signNonZero(n: number): number {
  if (n === 0) return 1;
  return Math.sign(n);
}

function snapAngleRad(angleRad: number, stepDeg: number): number {
  const step = (stepDeg * Math.PI) / 180;
  if (!step) return angleRad;
  return Math.round(angleRad / step) * step;
}

function applyLineAngleLock(from: Vec2, rawTo: Vec2): Vec2 {
  const v = sub(rawTo, from);
  const length = len(v);
  if (length === 0) return rawTo;
  const angle = snapAngleRad(Math.atan2(v.y, v.x), 15);
  return {
    x: from.x + Math.cos(angle) * length,
    y: from.y + Math.sin(angle) * length,
  };
}

function computeRectLikeCorners(
  start: Vec2,
  raw: Vec2,
  mods: DraftMods
): { a: Vec2; b: Vec2 } {
  const dx = raw.x - start.x;
  const dy = raw.y - start.y;

  if (mods.alt) {
    let hx = dx;
    let hy = dy;
    if (mods.shift) {
      const d = Math.max(Math.abs(hx), Math.abs(hy));
      hx = signNonZero(hx) * d;
      hy = signNonZero(hy) * d;
    }
    return {
      a: { x: start.x - hx, y: start.y - hy },
      b: { x: start.x + hx, y: start.y + hy },
    };
  }

  // Corner-based
  let bx = raw.x;
  let by = raw.y;
  if (mods.shift) {
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    bx = start.x + signNonZero(dx) * d;
    by = start.y + signNonZero(dy) * d;
  }
  return { a: start, b: { x: bx, y: by } };
}

type Draft = {
  tool: "rectangle" | "circle";
  startWorld: Vec2;
  currentWorld: Vec2;
  effectiveAWorld: Vec2;
  effectiveBWorld: Vec2;
  mods: DraftMods;
} | null;

type CurveDraft = {
  pointsWorld: Vec2[];
  currentWorld: Vec2 | null;
  joinHits: Array<JoinHit | null>;
} | null;

type LineDraft = {
  pointsWorld: Vec2[];
  currentWorld: Vec2 | null;
  joinHits: Array<JoinHit | null>;
} | null;

type PenDraft = {
  pointsWorld: Vec2[];
  currentWorld: Vec2 | null;
  highPrecision: boolean;
} | null;

function makeCurveFromPoints(
  points: Vec2[],
  closed: boolean,
  stroke: string
): Figure | null {
  if (points.length < 2) return null;

  // Catmull-Rom (centripetal-ish by clamping handles) -> cubic Bézier.
  // Segment Pi -> P(i+1):
  //   C1 = Pi + (P(i+1) - P(i-1)) / 6
  //   C2 = P(i+1) - (P(i+2) - Pi) / 6
  const tension = 1;

  const nodes: FigureNode[] = points.map((p) => ({
    id: id("n"),
    x: p.x,
    y: p.y,
    mode: "smooth",
  }));
  const edges: FigureEdge[] = [];

  const count = points.length;
  const segmentCount = closed ? count : count - 1;

  const getPoint = (index: number): Vec2 => {
    if (closed) {
      const i = ((index % count) + count) % count;
      return points[i];
    }
    return points[clamp(index, 0, count - 1)];
  };

  for (let i = 0; i < segmentCount; i++) {
    const i0 = i - 1;
    const i1 = i;
    const i2 = i + 1;
    const i3 = i + 2;

    const p0 = getPoint(i0);
    const p1 = getPoint(i1);
    const p2 = getPoint(i2);
    const p3 = getPoint(i3);

    const c1 = add(p1, mul(sub(p2, p0), tension / 6));
    const c2 = add(p2, mul(sub(p1, p3), tension / 6));

    // Clamp handles to avoid extreme overshoot (keeps it "CAD-ish" and stable)
    const segLen = dist(p1, p2);
    const maxHandle = Math.max(2, segLen * 0.75);
    const c1Clamped = clampHandle(p1, c1, maxHandle);
    const c2Clamped = clampHandle(p2, c2, maxHandle);

    const fromIndex = i1;
    const toIndex = closed ? i2 % count : i2;

    // Open curve endpoints: no inHandle on first, no outHandle on last.
    if (!closed && fromIndex === 0) {
      // ok: only outHandle
    } else {
      // keep existing inHandle if any
    }

    nodes[fromIndex] = {
      ...nodes[fromIndex],
      outHandle: c1Clamped,
    };
    nodes[toIndex] = {
      ...nodes[toIndex],
      inHandle: c2Clamped,
    };

    edges.push({
      id: id("e"),
      from: nodes[fromIndex].id,
      to: nodes[toIndex].id,
      kind: "cubic",
    });
  }

  if (!closed) {
    // Remove unused handles for clean semantics.
    nodes[0] = { ...nodes[0], inHandle: undefined };
    nodes[nodes.length - 1] = {
      ...nodes[nodes.length - 1],
      outHandle: undefined,
    };
  }

  return {
    id: id("fig"),
    tool: "curve",
    curveType: "custom",
    customSnapshot: {
      closed,
      nodes: nodes.map((n) => ({
        ...n,
        inHandle: n.inHandle ? { ...n.inHandle } : undefined,
        outHandle: n.outHandle ? { ...n.outHandle } : undefined,
      })),
      edges: edges.map((e) => ({ ...e })),
    },
    customSnapshotDirty: false,
    x: 0,
    y: 0,
    rotation: 0,
    closed,
    nodes,
    edges,
    stroke,
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
  };
}

type JoinHit = {
  figureId: string;
  pointWorld: Vec2;
  pointIndex: number;
  kind: "node" | "edge";
};

type JoinNodeResult = {
  figure: Figure;
  nodeId: string;
} | null;

function findJoinTarget(
  figure: Figure,
  pointWorld: Vec2,
  thresholdWorld: number
): {
  kind: "node" | "edge";
  nodeId?: string;
  edgeId?: string;
  t?: number;
  dist: number;
} | null {
  if (!Number.isFinite(thresholdWorld) || thresholdWorld <= 0) return null;

  let bestNodeId: string | null = null;
  let bestNodeDist = Number.POSITIVE_INFINITY;
  for (const n of figure.nodes) {
    const nw = figureLocalToWorld(figure, { x: n.x, y: n.y });
    const d = dist(pointWorld, nw);
    if (d < bestNodeDist) {
      bestNodeDist = d;
      bestNodeId = n.id;
    }
  }

  const local = worldToFigureLocal(figure, pointWorld);
  const hit = findNearestEdge(figure, local);
  const bestEdge = hit.best;
  const bestEdgeDist = hit.bestDist;

  if (bestNodeId && bestNodeDist <= thresholdWorld) {
    return { kind: "node", nodeId: bestNodeId, dist: bestNodeDist };
  }

  if (bestEdge && bestEdgeDist <= thresholdWorld) {
    return {
      kind: "edge",
      edgeId: bestEdge.edgeId,
      t: bestEdge.t,
      dist: bestEdgeDist,
    };
  }

  return null;
}

function ensureJoinNodeFromHit(
  figure: Figure,
  hit: JoinHit,
  thresholdWorld: number
): JoinNodeResult {
  if (hit.kind === "node") {
    let bestId: string | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const n of figure.nodes) {
      const nw = figureLocalToWorld(figure, { x: n.x, y: n.y });
      const d = dist(hit.pointWorld, nw);
      if (d < bestD) {
        bestD = d;
        bestId = n.id;
      }
    }
    if (bestId && bestD <= thresholdWorld) {
      return { figure, nodeId: bestId };
    }
    return null;
  }

  const local = worldToFigureLocal(figure, hit.pointWorld);
  const edgeHit = findNearestEdge(figure, local);
  if (!edgeHit.best || edgeHit.bestDist > thresholdWorld) return null;
  const split = splitFigureEdge(figure, edgeHit.best.edgeId, edgeHit.best.t);
  if (!split.newNodeId) return null;
  return { figure: split.figure, nodeId: split.newNodeId };
}

function cloneFigureToWorldWithMap(figure: Figure): {
  nodes: FigureNode[];
  edges: FigureEdge[];
  nodeIdMap: Map<string, string>;
} {
  const nodeIdMap = new Map<string, string>();
  const nodes: FigureNode[] = figure.nodes.map((n) => {
    const world = figureLocalToWorld(figure, { x: n.x, y: n.y });
    const idNext = id("n");
    nodeIdMap.set(n.id, idNext);
    return {
      id: idNext,
      x: world.x,
      y: world.y,
      mode: n.mode,
      inHandle: n.inHandle
        ? figureLocalToWorld(figure, { x: n.inHandle.x, y: n.inHandle.y })
        : undefined,
      outHandle: n.outHandle
        ? figureLocalToWorld(figure, { x: n.outHandle.x, y: n.outHandle.y })
        : undefined,
    };
  });

  const edges: FigureEdge[] = figure.edges.map((e) => ({
    id: id("e"),
    from: nodeIdMap.get(e.from) ?? e.from,
    to: nodeIdMap.get(e.to) ?? e.to,
    kind: e.kind,
  }));

  return { nodes, edges, nodeIdMap };
}

function cloneFigureToWorld(figure: Figure): {
  nodes: FigureNode[];
  edges: FigureEdge[];
} {
  const { nodes, edges } = cloneFigureToWorldWithMap(figure);
  return { nodes, edges };
}

function mergeFiguresWithNewFigure(
  figures: Figure[],
  newFigure: Figure,
  thresholdWorld: number,
  joinHits?: JoinHit[]
): Figure[] {
  const candidates = figures.filter(
    (f) => f.kind !== "seam" && f.tool !== "text"
  );
  if (candidates.length === 0) {
    return [...figures, newFigure];
  }

  const candidateIds = new Set(candidates.map((f) => f.id));

  // Determine working hits: either from explicit joinHits or by proximity detection
  let workingHits: JoinHit[] = [];

  if (joinHits && joinHits.length > 0) {
    // Use explicit joinHits (filtered to valid candidates)
    workingHits = joinHits.filter((h) => candidateIds.has(h.figureId));

    // Also supplement with proximity hits for points that didn't get a joinHit
    const seenPointIndexes = new Set<number>(
      workingHits.map((h) => h.pointIndex)
    );
    const newWorldNodes = cloneFigureToWorld(newFigure).nodes;
    for (let i = 0; i < newWorldNodes.length; i++) {
      if (seenPointIndexes.has(i)) continue;
      const nw = newWorldNodes[i];
      const p = { x: nw.x, y: nw.y };
      for (const fig of candidates) {
        const target = findJoinTarget(fig, p, thresholdWorld);
        if (target) {
          workingHits.push({
            figureId: fig.id,
            pointWorld: p,
            pointIndex: i,
            kind: target.kind,
          });
          break; // Only one hit per point
        }
      }
    }
  } else {
    // Detect join points by proximity (for rect/circle/etc)
    const newWorldNodes = cloneFigureToWorld(newFigure).nodes;
    for (let i = 0; i < newWorldNodes.length; i++) {
      const nw = newWorldNodes[i];
      const p = { x: nw.x, y: nw.y };
      
      for (const fig of candidates) {
        const target = findJoinTarget(fig, p, thresholdWorld);
        if (target) {
          workingHits.push({
            figureId: fig.id,
            pointWorld: p,
            pointIndex: i,
            kind: target.kind,
          });
          break; // Only one hit per point
        }
      }
    }
  }

  if (workingHits.length === 0) {
    return [...figures, newFigure];
  }

  // Group hits by figureId
  const hitsByFigure = new Map<string, JoinHit[]>();
  for (const hit of workingHits) {
    const existing = hitsByFigure.get(hit.figureId) ?? [];
    existing.push(hit);
    hitsByFigure.set(hit.figureId, existing);
  }

  const touchedIds = new Set(hitsByFigure.keys());

  // Process each target figure: split edges as needed and record node mappings
  const joinMappings: Array<{
    figureId: string;
    pointIndex: number;
    targetNodeId: string;
  }> = [];

  const updatedById = new Map<string, Figure>();
  for (const fig of figures) {
    updatedById.set(fig.id, fig);
  }

  for (const [figureId, hits] of hitsByFigure) {
    let currentFig = updatedById.get(figureId);
    if (!currentFig) continue;

    for (const hit of hits) {
      const res = ensureJoinNodeFromHit(currentFig, hit, thresholdWorld);
      if (!res) continue;
      currentFig = res.figure;
      joinMappings.push({
        figureId,
        pointIndex: hit.pointIndex,
        targetNodeId: res.nodeId,
      });
    }

    updatedById.set(figureId, currentFig);
  }

  if (joinMappings.length === 0) {
    return [...figures, newFigure];
  }

  // Get updated figures (with split edges)
  const updatedFigures: Figure[] = figures.map((fig) =>
    updatedById.get(fig.id) ?? fig
  );

  // Clone target figures to world coordinates
  const targetClones: Array<{
    figureId: string;
    nodes: FigureNode[];
    edges: FigureEdge[];
    nodeIdMap: Map<string, string>;
  }> = [];

  for (const figureId of touchedIds) {
    const fig = updatedById.get(figureId);
    if (!fig) continue;
    const clone = cloneFigureToWorldWithMap(fig);
    targetClones.push({
      figureId,
      nodes: clone.nodes,
      edges: clone.edges,
      nodeIdMap: clone.nodeIdMap,
    });
  }

  // Clone new figure
  const { nodes: clonedNewNodes, edges: clonedNewEdges, nodeIdMap: newNodeIdMap } =
    cloneFigureToWorldWithMap(newFigure);

  // Build node mapping: cloned new node ID -> cloned target node ID
  const nodeMapping = new Map<string, string>();

  for (const mapping of joinMappings) {
    const originalNewNode = newFigure.nodes[mapping.pointIndex];
    if (!originalNewNode) continue;

    const clonedNewNodeId = newNodeIdMap.get(originalNewNode.id);
    if (!clonedNewNodeId) continue;

    const targetClone = targetClones.find((t) => t.figureId === mapping.figureId);
    if (!targetClone) continue;

    const clonedTargetNodeId = targetClone.nodeIdMap.get(mapping.targetNodeId);
    if (!clonedTargetNodeId) continue;

    nodeMapping.set(clonedNewNodeId, clonedTargetNodeId);
  }

  // Build merged nodes
  const mergedNodes: FigureNode[] = [];
  const addedNodeIds = new Set<string>();

  for (const target of targetClones) {
    for (const n of target.nodes) {
      if (!addedNodeIds.has(n.id)) {
        mergedNodes.push(n);
        addedNodeIds.add(n.id);
      }
    }
  }

  for (const n of clonedNewNodes) {
    if (nodeMapping.has(n.id)) continue; // Skip mapped nodes
    if (!addedNodeIds.has(n.id)) {
      mergedNodes.push(n);
      addedNodeIds.add(n.id);
    }
  }

  // Build merged edges
  const mergedEdges: FigureEdge[] = [];
  const addedEdgeKeys = new Set<string>();

  for (const target of targetClones) {
    for (const e of target.edges) {
      const key = `${e.from}-${e.to}`;
      if (!addedEdgeKeys.has(key)) {
        mergedEdges.push(e);
        addedEdgeKeys.add(key);
      }
    }
  }

  for (const e of clonedNewEdges) {
    const from = nodeMapping.get(e.from) ?? e.from;
    const to = nodeMapping.get(e.to) ?? e.to;
    if (from === to) continue;

    const key = `${from}-${to}`;
    const reverseKey = `${to}-${from}`;
    if (addedEdgeKeys.has(key) || addedEdgeKeys.has(reverseKey)) continue;

    mergedEdges.push({ ...e, from, to });
    addedEdgeKeys.add(key);
  }

  const mergedFigure: Figure = {
    id: id("fig"),
    tool: newFigure.tool || "line",
    x: 0,
    y: 0,
    rotation: 0,
    closed: newFigure.closed ?? false,
    nodes: mergedNodes,
    edges: mergedEdges,
    stroke: newFigure.stroke,
    strokeWidth: newFigure.strokeWidth,
    fill: newFigure.fill ?? "transparent",
    opacity: newFigure.opacity ?? 1,
  };

  const normalizedMerged = normalizeLineEdgesAtNodes(
    mergeCoincidentNodes(mergedFigure)
  );

  return [
    ...updatedFigures.filter((f) => {
      if (touchedIds.has(f.id)) return false;
      if (f.kind === "seam" && f.parentId && touchedIds.has(f.parentId))
        return false;
      return true;
    }),
    normalizedMerged,
  ];
}

export default function Canvas() {
  const {
    tool,
    setTool,
    figures,
    setFigures,
    selectedFigureIds,
    selectedFigureId,
    setSelectedFigureId,
    setSelectedFigureIds,
    toggleSelectedFigureId,
    selectedEdge,
    setSelectedEdge,
    getEdgeAnchorPreference,
    offsetValueCm,
    setOffsetTargetId,
    modifierKeys,
    measureSnapStrengthPx,
    measureDisplayMode,
    nodesDisplayMode,
    pointLabelsMode,
    magnetEnabled,
    magnetJoinEnabled,
    showRulers,
    guides,
    updateGuide,
    removeGuide,
    pixelsPerUnit,
    scale,
    setScale,
    position,
    setPosition,
    registerStage,
    showGrid,
    gridContrast,
    showPageGuides,
    pageGuideSettings,
  } = useEditor();

  const isMac = useSyncExternalStore(
    () => () => {
      // no-op: OS does not change during a session
    },
    () => /Mac|iPhone|iPod|iPad/.test(navigator.userAgent),
    () => false
  );

  const nodeLabelsByFigureId = React.useMemo(() => {
    return computeNodeLabels(figures, pointLabelsMode);
  }, [figures, pointLabelsMode]);

  const prevToolRef = useRef(tool);

  const isDark = useIsDarkMode();
  const aci7 = useMemo(() => resolveAci7(isDark), [isDark]);

  const handleAccentStroke = useMemo(() => {
    if (typeof window === "undefined") return "#776a3e";
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent-gold")
      .trim();
    return v || "#776a3e";
  }, []);

  const guideStroke = useMemo(() => {
    if (typeof window === "undefined") return "#a855f7";
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-guide-neon")
      .trim();
    return v || "#a855f7";
  }, []);
  const gridStroke = useMemo(() => {
    const t = clamp(gridContrast, 0, 1);

    // Match previous defaults at t=0.5:
    // dark: 0.07, light: 0.05.
    const darkAlpha = 0.03 + t * (0.11 - 0.03);
    const lightAlpha = 0.02 + t * (0.08 - 0.02);
    const alpha = isDark ? darkAlpha : lightAlpha;
    return isDark ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
  }, [gridContrast, isDark]);
  const pageGuideStroke = useMemo(
    () => (isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)"),
    [isDark]
  );
  const pageGuideInnerStroke = useMemo(
    () => (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"),
    [isDark]
  );
  const previewStroke = aci7;
  const previewDash = useMemo(() => [8 / scale, 6 / scale], [scale]);

  const previewRemoveStroke = useMemo(() => {
    if (typeof window === "undefined") return "#dc2626";
    const el = document.createElement("span");
    el.className = "text-red-600";
    el.style.position = "absolute";
    el.style.left = "-9999px";
    el.style.top = "-9999px";
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    document.body.removeChild(el);
    return c || "#dc2626";
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [containerClientRect, setContainerClientRect] =
    useState<DOMRect | null>(null);

  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const figureNodeRefs = useRef<Map<string, Konva.Group>>(new Map());

  const transformMods = useMemo(
    () => ({ shift: modifierKeys.shift, alt: modifierKeys.alt }),
    [modifierKeys.alt, modifierKeys.shift]
  );

  type EdgeEditDraft = {
    figureId: string;
    edgeId: string;
    anchor: "start" | "end" | "mid";
    value: string;
    x: number;
    y: number;
  } | null;

  const [edgeEditDraft, setEdgeEditDraft] = useState<EdgeEditDraft>(null);
  const edgeEditInputRef = useRef<HTMLInputElement | null>(null);
  const lastEdgeEditFocusKeyRef = useRef<string | null>(null);

  type TextEditDraft = {
    figureId: string;
    value: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isNew: boolean;
    didEdit: boolean;
  } | null;

  const [textEditDraft, setTextEditDraft] = useState<TextEditDraft>(null);
  const textEditTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastTextEditFocusKeyRef = useRef<string | null>(null);
  const skipNextTextBlurRef = useRef(false);

  useEffect(() => {
    if (!textEditDraft) {
      lastTextEditFocusKeyRef.current = null;
      return;
    }

    const key = textEditDraft.figureId;
    if (lastTextEditFocusKeyRef.current === key) return;
    lastTextEditFocusKeyRef.current = key;

    const id = requestAnimationFrame(() => {
      textEditTextareaRef.current?.focus();
      textEditTextareaRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [textEditDraft]);

  useEffect(() => {
    if (!edgeEditDraft) {
      lastEdgeEditFocusKeyRef.current = null;
      return;
    }

    const key = `${edgeEditDraft.figureId}:${edgeEditDraft.edgeId}`;
    if (lastEdgeEditFocusKeyRef.current === key) return;
    lastEdgeEditFocusKeyRef.current = key;

    const id = requestAnimationFrame(() => {
      edgeEditInputRef.current?.focus();
      edgeEditInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [edgeEditDraft]);

  useEffect(() => {
    if (!edgeEditDraft) return;
    if (!selectedEdge) return;
    if (selectedEdge.figureId !== edgeEditDraft.figureId) return;
    if (selectedEdge.edgeId !== edgeEditDraft.edgeId) return;
    if (selectedEdge.anchor === edgeEditDraft.anchor) return;
    setEdgeEditDraft((prev) =>
      prev ? { ...prev, anchor: selectedEdge.anchor } : prev
    );
  }, [edgeEditDraft, selectedEdge]);

  useEffect(() => {
    // Selected edges are primarily a select/node editing affordance.
    // Clear them when switching away from those tools so we don't keep showing
    // edge-specific UI in unrelated tools.
    if (tool === "select" || tool === "node") return;
    if (selectedEdge) setSelectedEdge(null);
  }, [selectedEdge, setSelectedEdge, tool]);

  useEffect(() => {
    if (tool === "pique") return;
    setHoveredPique(null);
  }, [tool]);
  const backgroundRef = useRef<Konva.Rect | null>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [curveDraft, setCurveDraft] = useState<CurveDraft>(null);
  const [lineDraft, setLineDraft] = useState<LineDraft>(null);
  const lineDraftRef = useRef<LineDraft>(null);
  const [penDraft, setPenDraft] = useState<PenDraft>(null);
  const penDraftRef = useRef<PenDraft>(null);
  const [nodeSelection, setNodeSelection] = useState<NodeSelection>(null);
  const [nodeMergePreview, setNodeMergePreview] = useState<{
    figureId: string;
    fromNodeId: string;
    toNodeId: string;
  } | null>(null);
  const nodeMergePreviewRef = useRef<typeof nodeMergePreview>(null);
  useEffect(() => {
    nodeMergePreviewRef.current = nodeMergePreview;
  }, [nodeMergePreview]);
  const nodeMergePreviewRafRef = useRef<number | null>(null);
  const queueNodeMergePreview = useCallback(
    (
      next:
        | {
            figureId: string;
            fromNodeId: string;
            toNodeId: string;
          }
        | null
    ) => {
      const current = nodeMergePreviewRef.current;
      const same =
        (current === null && next === null) ||
        (current &&
          next &&
          current.figureId === next.figureId &&
          current.fromNodeId === next.fromNodeId &&
          current.toNodeId === next.toNodeId);
      if (same) return;

      nodeMergePreviewRef.current = next;
      if (nodeMergePreviewRafRef.current !== null) return;
      nodeMergePreviewRafRef.current = requestAnimationFrame(() => {
        nodeMergePreviewRafRef.current = null;
        setNodeMergePreview(nodeMergePreviewRef.current);
      });
    },
    []
  );
  const [nodeAngleGuide, setNodeAngleGuide] = useState<{
    figureId: string;
    startLocal: Vec2;
    currentLocal: Vec2;
  } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<EdgeHover>(null);
  const [hoveredPique, setHoveredPique] = useState<HoveredPique>(null);
  const [hoveredMirrorLinkFigureId, setHoveredMirrorLinkFigureId] = useState<
    string | null
  >(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredFigureId, setHoveredFigureId] = useState<string | null>(null);
  const [hoveredSelectFigureId, setHoveredSelectFigureId] = useState<
    string | null
  >(null);
  const [hoveredSelectEdge, setHoveredSelectEdge] =
    useState<MeasureEdgeHover>(null);
  const [edgeSelectMode, setEdgeSelectMode] = useState(false);
  const [hoveredOffsetBaseId, setHoveredOffsetBaseId] = useState<string | null>(
    null
  );
  const [hoveredOffsetEdge, setHoveredOffsetEdge] = useState<{
    figureId: string;
    edgeId: string;
  } | null>(null);
  const [offsetRemoveMode, setOffsetRemoveMode] = useState(false);
  const lastOffsetPreviewLogRef = useRef<string | null>(null);
  const lastNodeHoverLogRef = useRef<number>(0);
  const lastNodeClickLogRef = useRef<number>(0);
  
  // Expose hoveredOffsetBaseId for E2E tests
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const state = (window as unknown as { __EDITOR_STATE__?: Record<string, unknown> }).__EDITOR_STATE__;
      if (state) {
        state.hoveredOffsetBaseId = hoveredOffsetBaseId;
      }
    }
  }, [hoveredOffsetBaseId]);
  
  const [cursorBadge, setCursorBadge] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const offsetHoverPreview = useMemo(() => {
    if (tool !== "offset") return null;
    if (!hoveredOffsetBaseId) return null;
    if (offsetRemoveMode) return null;

    const base = figures.find((f) => f.id === hoveredOffsetBaseId) ?? null;
    if (!base) return null;
    if (!base.closed && !hasClosedLoop(base)) return null;

    if (
      hoveredOffsetEdge &&
      hoveredOffsetEdge.figureId === base.id &&
      base.tool !== "circle"
    ) {
      const edgeId = hoveredOffsetEdge.edgeId;
      const existingSeam =
        figures.find((f) => f.kind === "seam" && f.parentId === base.id) ??
        null;
      if (existingSeam) {
        if (typeof existingSeam.offsetCm === "number") return null;
        if (
          existingSeam.offsetCm &&
          typeof existingSeam.offsetCm === "object"
        ) {
          const value = existingSeam.offsetCm[edgeId];
          if (Number.isFinite(value) && value > 0) return null;
        }
        if (existingSeam.seamSegmentEdgeIds?.includes(edgeId)) return null;
      }
      const seam = makeSeamFigure(base, { [edgeId]: offsetValueCm });
      if (!seam || !seam.seamSegments?.length) return null;

      return {
        x: seam.x,
        y: seam.y,
        rotation: seam.rotation || 0,
        closed: false,
        dash: seam.dash ?? [5, 5],
        stroke: resolveStrokeColor(seam.stroke, isDark),
        segments: seam.seamSegments,
        key: `offset-preview-edge:${hoveredOffsetBaseId}:${edgeId}`,
      };
    }

    const hasSeam = figures.some(
      (f) => f.kind === "seam" && f.parentId === hoveredOffsetBaseId
    );
    if (hasSeam) return null;

    const seam = makeSeamFigure(base, offsetValueCm);
    if (!seam) return null;

    const pts = figureLocalPolyline(seam, 60);
    return {
      x: seam.x,
      y: seam.y,
      rotation: seam.rotation || 0,
      closed: seam.closed,
      dash: seam.dash ?? [5, 5],
      stroke: resolveStrokeColor(seam.stroke, isDark),
      points: pts,
      key: `offset-preview-add:${hoveredOffsetBaseId}`,
    };
  }, [
    figures,
    hoveredOffsetBaseId,
    hoveredOffsetEdge,
    isDark,
    offsetRemoveMode,
    offsetValueCm,
    tool,
  ]);

  const offsetRemovePreview = useMemo(() => {
    if (tool !== "offset") return null;
    if (!offsetRemoveMode) return null;
    if (!hoveredOffsetBaseId) return null;

    const existingSeam =
      figures.find(
        (f) => f.kind === "seam" && f.parentId === hoveredOffsetBaseId
      ) ?? null;
    if (!existingSeam) return null;

    const stroke = previewRemoveStroke;
    const dash = existingSeam.dash ?? [5, 5];

    if (
      hoveredOffsetEdge &&
      hoveredOffsetEdge.figureId === hoveredOffsetBaseId &&
      existingSeam.offsetCm &&
      typeof existingSeam.offsetCm === "object" &&
      existingSeam.seamSegments?.length &&
      existingSeam.seamSegmentEdgeIds?.length
    ) {
      const edgeId = hoveredOffsetEdge.edgeId;
      const segments = existingSeam.seamSegments.filter((_, idx) => {
        return existingSeam.seamSegmentEdgeIds?.[idx] === edgeId;
      });
      if (!segments.length) return null;
      return {
        x: existingSeam.x,
        y: existingSeam.y,
        rotation: existingSeam.rotation || 0,
        dash,
        stroke,
        segments,
        key: `offset-preview-remove-edge:${hoveredOffsetBaseId}:${edgeId}`,
      };
    }

    if (
      hoveredOffsetEdge &&
      hoveredOffsetEdge.figureId === hoveredOffsetBaseId
    ) {
      const edgeId = hoveredOffsetEdge.edgeId;
      const base = figures.find((f) => f.id === hoveredOffsetBaseId) ?? null;
      if (base && base.closed && base.tool !== "circle") {
        let edgeOffsetCm: number | null = null;
        if (typeof existingSeam.offsetCm === "number") {
          edgeOffsetCm = existingSeam.offsetCm;
        } else if (
          existingSeam.offsetCm &&
          typeof existingSeam.offsetCm === "object"
        ) {
          const value = existingSeam.offsetCm[edgeId];
          if (Number.isFinite(value)) edgeOffsetCm = value;
        }

        if (edgeOffsetCm != null && edgeOffsetCm > 0) {
          const seam = makeSeamFigure(base, { [edgeId]: edgeOffsetCm });
          if (seam?.seamSegments?.length) {
            return {
              x: seam.x,
              y: seam.y,
              rotation: seam.rotation || 0,
              dash,
              stroke,
              segments: seam.seamSegments,
              key: `offset-preview-remove-edge:${hoveredOffsetBaseId}:${edgeId}`,
            };
          }
        }
      }
    }

    if (
      existingSeam.offsetCm &&
      typeof existingSeam.offsetCm === "object" &&
      existingSeam.seamSegments?.length
    ) {
      return {
        x: existingSeam.x,
        y: existingSeam.y,
        rotation: existingSeam.rotation || 0,
        dash,
        stroke,
        segments: existingSeam.seamSegments,
        key: `offset-preview-remove:${hoveredOffsetBaseId}`,
      };
    }

    const pts = figureLocalPolyline(existingSeam, 60);
    if (pts.length < 4) return null;
    return {
      x: existingSeam.x,
      y: existingSeam.y,
      rotation: existingSeam.rotation || 0,
      dash,
      stroke,
      points: pts,
      closed: existingSeam.closed,
      key: `offset-preview-remove:${hoveredOffsetBaseId}`,
    };
  }, [
    figures,
    hoveredOffsetBaseId,
    hoveredOffsetEdge,
    offsetRemoveMode,
    previewRemoveStroke,
    tool,
  ]);

  useEffect(() => {
    if (tool !== "offset") {
      lastOffsetPreviewLogRef.current = null;
      return;
    }
    if (!hoveredOffsetEdge) {
      lastOffsetPreviewLogRef.current = null;
      return;
    }

    const preview = offsetRemoveMode ? offsetRemovePreview : offsetHoverPreview;
    if (!preview) return;

    const mode = offsetRemoveMode ? "remove" : "add";
    const logKey = `${mode}:${preview.key}`;
    if (lastOffsetPreviewLogRef.current === logKey) return;
    lastOffsetPreviewLogRef.current = logKey;

    const { pointsWorld, segmentsWorld } = previewToWorldPoints(preview);
    sendDebugLog({
      type: "offset-preview-edge",
      payload: {
        mode,
        baseId: hoveredOffsetEdge.figureId,
        edgeId: hoveredOffsetEdge.edgeId,
        previewKey: preview.key,
        pointsWorld: pointsWorld ?? null,
        segmentsWorld: segmentsWorld ?? null,
      },
    });
  }, [
    hoveredOffsetEdge,
    offsetHoverPreview,
    offsetRemoveMode,
    offsetRemovePreview,
    tool,
  ]);
  const [dartDraft, setDartDraft] = useState<DartDraft>(null);
  const [measureDraft, setMeasureDraft] = useState<MeasureDraft>(null);
  const [marqueeDraft, setMarqueeDraft] = useState<MarqueeDraft>(null);
  const [hoveredMeasureEdge, setHoveredMeasureEdge] =
    useState<MeasureEdgeHover>(null);

  const [edgeContextMenu, setEdgeContextMenu] =
    useState<EdgeContextMenuState>(null);
  const [magnetSnap, setMagnetSnap] = useState<{
    pointWorld: Vec2;
    kind: "node" | "edge" | "guide";
  } | null>(null);

  useEffect(() => {
    lineDraftRef.current = lineDraft;
  }, [lineDraft]);
  useEffect(() => {
    penDraftRef.current = penDraft;
  }, [penDraft]);
  const [isPanning, setIsPanning] = useState(false);
  const lastPointerRef = useRef<Vec2 | null>(null);
  const lastPanClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerDownSigRef = useRef<{
    t: number;
    x: number;
    y: number;
    button: number;
  } | null>(null);
  const cursorBadgeIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cursorBadgeLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const isPointerDownRef = useRef(false);

  const clearCursorBadgeIdleTimeout = useCallback(() => {
    if (cursorBadgeIdleTimeoutRef.current) {
      clearTimeout(cursorBadgeIdleTimeoutRef.current);
      cursorBadgeIdleTimeoutRef.current = null;
    }
  }, []);

  const scheduleCursorBadgeIdleShow = useCallback(() => {
    clearCursorBadgeIdleTimeout();
    cursorBadgeIdleTimeoutRef.current = setTimeout(() => {
      if (isPointerDownRef.current) return;
      if (cursorBadgeLastPosRef.current) {
        setCursorBadge(cursorBadgeLastPosRef.current);
      }
    }, 1500);
  }, [clearCursorBadgeIdleTimeout]);

  const hideCursorBadge = useCallback(() => {
    clearCursorBadgeIdleTimeout();
    setCursorBadge(null);
  }, [clearCursorBadgeIdleTimeout]);

  useEffect(() => {
    return () => {
      clearCursorBadgeIdleTimeout();
    };
  }, [clearCursorBadgeIdleTimeout]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const clear = () => {
      cursorBadgeLastPosRef.current = null;
      hideCursorBadge();
    };

    // Prevent browser scroll when using wheel inside canvas container
    const preventScroll = (e: WheelEvent) => {
      e.preventDefault();
    };

    el.addEventListener("pointerleave", clear);
    el.addEventListener("mouseleave", clear);
    el.addEventListener("wheel", preventScroll, { passive: false });
    return () => {
      el.removeEventListener("pointerleave", clear);
      el.removeEventListener("mouseleave", clear);
      el.removeEventListener("wheel", preventScroll);
    };
  }, [hideCursorBadge]); // hideCursorBadge needs to be defined or I should use setCursorBadge(null) directly

  useEffect(() => {
    // If the tool changes to one where the overlay is disabled, hide immediately.
    if (
      tool === "select" ||
      tool === "pan" ||
      isPanning ||
      !isToolCursorOverlayEnabled(tool)
    ) {
      clearCursorBadgeIdleTimeout();
      setCursorBadge(null);
    }
    // Intentionally omit helper callbacks from deps to keep the deps array size
    // stable (avoid dev-time Fast Refresh hook warnings) and because they only
    // touch refs/setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanning, tool]);

  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const panRafRef = useRef<number | null>(null);
  const panPositionRef = useRef<Vec2 | null>(null);

  useEffect(() => {
    if (!isPanning) return;

    const endPan = () => {
      setIsPanning(false);
      lastPointerRef.current = null;
      lastPanClientRef.current = null;

      if (panRafRef.current !== null) {
        cancelAnimationFrame(panRafRef.current);
        panRafRef.current = null;
      }

      const finalPos = panPositionRef.current;
      panPositionRef.current = null;
      if (finalPos) setPosition(finalPos);
    };

    const onMove = (evt: PointerEvent | MouseEvent) => {
      evt.preventDefault();
      const last = lastPanClientRef.current;
      if (!last) {
        lastPanClientRef.current = { x: evt.clientX, y: evt.clientY };
        return;
      }

      const dx = evt.clientX - last.x;
      const dy = evt.clientY - last.y;
      lastPanClientRef.current = { x: evt.clientX, y: evt.clientY };

      const base = panPositionRef.current ?? positionRef.current;
      const next = { x: base.x + dx, y: base.y + dy };
      panPositionRef.current = next;

      if (panRafRef.current === null) {
        panRafRef.current = requestAnimationFrame(() => {
          panRafRef.current = null;
          if (panPositionRef.current) setPosition(panPositionRef.current);
        });
      }
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("pointerup", endPan);
    window.addEventListener("mouseup", endPan);
    window.addEventListener("blur", endPan);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerup", endPan);
      window.removeEventListener("mouseup", endPan);
      window.removeEventListener("blur", endPan);
    };
  }, [isPanning, setPosition]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const el = stage.container();
    if (isPanning) {
      el.style.cursor = "grabbing";
      return;
    }
    if (tool === "pan") {
      el.style.cursor = "grab";
      return;
    }
    el.style.cursor = "";
  }, [figures, hoveredOffsetBaseId, isPanning, tool]);

  const snapSelectionDeltaToGuidesRef = useRef<
    (
      startBounds: BoundingBox | null,
      dx: number,
      dy: number
    ) => { dx: number; dy: number }
  >((_startBounds, dx, dy) => ({ dx, dy }));

  const selectDirectDragRef = useRef<{
    active: boolean;
    anchorFigureId: string;
    affectedIds: string[];
    startPositions: Map<string, Vec2>;
    startBounds: BoundingBox | null;
    startWorld: Vec2;
    lastWorld: Vec2;
  } | null>(null);

  const containerClientRectRef = useRef<DOMRect | null>(null);
  useEffect(() => {
    containerClientRectRef.current = containerClientRect;
  }, [containerClientRect]);

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const rect =
      containerClientRectRef.current ??
      containerRef.current?.getBoundingClientRect() ??
      null;
    if (!rect) return null;

    const local = { x: clientX - rect.left, y: clientY - rect.top };
    return {
      x: (local.x - positionRef.current.x) / scaleRef.current,
      y: (local.y - positionRef.current.y) / scaleRef.current,
    } satisfies Vec2;
  }, []);

  const [dragPreviewPositions, setDragPreviewPositions] = useState<Map<
    string,
    Vec2
  > | null>(null);
  const dragPreviewPendingRef = useRef<Map<string, Vec2> | null>(null);
  const dragPreviewRafRef = useRef<number | null>(null);

  const requestDragPreviewRender = useCallback(() => {
    if (dragPreviewRafRef.current != null) return;
    dragPreviewRafRef.current = requestAnimationFrame(() => {
      dragPreviewRafRef.current = null;
      setDragPreviewPositions(dragPreviewPendingRef.current);
    });
  }, []);

  const getRuntimeFigureTransform = useCallback(
    (fig: Figure): { x: number; y: number; rotation: number } => {
      const p = dragPreviewPositions?.get(fig.id);
      return {
        x: p?.x ?? fig.x,
        y: p?.y ?? fig.y,
        rotation: fig.rotation || 0,
      };
    },
    [dragPreviewPositions]
  );

  const handleSelectDirectDragMove = useCallback(
    (world: Vec2): boolean => {
      const direct = selectDirectDragRef.current;
      if (!direct) return false;

      direct.lastWorld = world;

      const MIN_DRAG_PX = 3;
      const minDragWorld = MIN_DRAG_PX / scale;

      if (!direct.active) {
        const d = dist(world, direct.startWorld);
        if (d < minDragWorld) return false;

        const anchorId = direct.anchorFigureId;
        const isAnchorSelected = new Set(selectedFigureIds).has(anchorId);
        const baseIdsToMove = isAnchorSelected ? selectedFigureIds : [anchorId];

        const affectedIds = figures
          .filter(
            (f) =>
              baseIdsToMove.includes(f.id) ||
              (f.kind === "seam" &&
                f.parentId &&
                baseIdsToMove.includes(f.parentId))
          )
          .map((f) => f.id);

        let startBounds: BoundingBox | null = null;
        for (const f of figures) {
          if (!affectedIds.includes(f.id)) continue;
          const bb = figureWorldBoundingBox(f);
          if (!bb) continue;
          if (!startBounds) {
            startBounds = { ...bb };
          } else {
            const x0 = Math.min(startBounds.x, bb.x);
            const y0 = Math.min(startBounds.y, bb.y);
            const x1 = Math.max(
              startBounds.x + startBounds.width,
              bb.x + bb.width
            );
            const y1 = Math.max(
              startBounds.y + startBounds.height,
              bb.y + bb.height
            );
            startBounds = {
              x: x0,
              y: y0,
              width: x1 - x0,
              height: y1 - y0,
            };
          }
        }

        const startPositions = new Map<string, Vec2>();
        for (const id of affectedIds) {
          const f = figures.find((ff) => ff.id === id);
          if (!f) continue;
          const tr = getRuntimeFigureTransform(f);
          startPositions.set(id, { x: tr.x, y: tr.y });
        }

        if (dragPreviewRafRef.current != null) {
          cancelAnimationFrame(dragPreviewRafRef.current);
          dragPreviewRafRef.current = null;
        }
        dragPreviewPendingRef.current = null;
        setDragPreviewPositions(null);

        selectDirectDragRef.current = {
          ...direct,
          active: true,
          affectedIds,
          startPositions,
          startBounds,
        };
      }

      const active = selectDirectDragRef.current;
      if (!active?.active) return false;

      const dxRaw = world.x - active.startWorld.x;
      const dyRaw = world.y - active.startWorld.y;

      let dx = dxRaw;
      let dy = dyRaw;
      const snapped = snapSelectionDeltaToGuidesRef.current(
        active.startBounds ?? null,
        dx,
        dy
      );
      dx = snapped.dx;
      dy = snapped.dy;

      // Magnet snap to other figures' nodes/edges (in addition to guide snapping).
      if (magnetEnabled) {
        const thresholdWorld = Math.max(12, measureSnapStrengthPx) / scale;
        const exclude = new Set<string>(active.affectedIds);
        const desiredAnchor: Vec2 = {
          x: active.startWorld.x + dxRaw,
          y: active.startWorld.y + dyRaw,
        };

        // We intentionally pass no guides here: guide snapping for selection is
        // handled via bounding-box alignment above.
        const snap = snapWorldPoint(desiredAnchor, figures, [], {
          thresholdWorld,
          excludeSeams: true,
          includeNodes: true,
          excludeFigureIds: exclude,
        });

        if (snap.isSnapped) {
          dx = snap.pointWorld.x - active.startWorld.x;
          dy = snap.pointWorld.y - active.startWorld.y;
        }
      }

      const next = new Map<string, Vec2>();
      for (const id of active.affectedIds) {
        const start = active.startPositions.get(id);
        if (!start) continue;
        next.set(id, { x: start.x + dx, y: start.y + dy });
      }
      dragPreviewPendingRef.current = next;
      requestDragPreviewRender();
      return true;
    },
    [
      figures,
      getRuntimeFigureTransform,
      magnetEnabled,
      measureSnapStrengthPx,
      requestDragPreviewRender,
      scale,
      selectedFigureIds,
    ]
  );

  const commitSelectDirectDrag = useCallback((): boolean => {
    const direct = selectDirectDragRef.current;
    if (!direct) return false;
    selectDirectDragRef.current = null;

    if (!direct.active) {
      dragPreviewPendingRef.current = null;
      setDragPreviewPositions(null);
      return false;
    }

    const dxRaw = direct.lastWorld.x - direct.startWorld.x;
    const dyRaw = direct.lastWorld.y - direct.startWorld.y;

    let dx = dxRaw;
    let dy = dyRaw;
    const snapped = snapSelectionDeltaToGuidesRef.current(
      direct.startBounds ?? null,
      dx,
      dy
    );
    dx = snapped.dx;
    dy = snapped.dy;

    if (magnetEnabled) {
      const thresholdWorld = Math.max(12, measureSnapStrengthPx) / scale;
      const exclude = new Set<string>(direct.affectedIds);
      const desiredAnchor: Vec2 = {
        x: direct.startWorld.x + dxRaw,
        y: direct.startWorld.y + dyRaw,
      };

      const snap = snapWorldPoint(desiredAnchor, figures, [], {
        thresholdWorld,
        excludeSeams: true,
        includeNodes: true,
        excludeFigureIds: exclude,
      });

      if (snap.isSnapped) {
        dx = snap.pointWorld.x - direct.startWorld.x;
        dy = snap.pointWorld.y - direct.startWorld.y;
      }
    }

    if (Math.abs(dx) >= 1e-6 || Math.abs(dy) >= 1e-6) {
      const affected = new Set(direct.affectedIds);
      const startPositions = direct.startPositions;
      setFigures((prev) => {
        const moved = prev.map((f) => {
          if (!affected.has(f.id)) return f;
          const start = startPositions.get(f.id);
          if (!start) return { ...f, x: f.x + dx, y: f.y + dy };
          return { ...f, x: start.x + dx, y: start.y + dy };
        });

        // Hard guarantee: seam figures always share the exact same transform
        // as their base after committing a move.
        const movedById = new Map(moved.map((f) => [f.id, f] as const));
        return moved.map((f) => {
          if (f.kind !== "seam" || !f.parentId) return f;
          if (!affected.has(f.parentId)) return f;
          const base = movedById.get(f.parentId);
          if (!base) return f;
          const baseRot = base.rotation ?? 0;
          const seamRot = f.rotation ?? 0;
          if (f.x === base.x && f.y === base.y && seamRot === baseRot) return f;
          return { ...f, x: base.x, y: base.y, rotation: baseRot };
        });
      });
    }

    dragPreviewPendingRef.current = null;
    setDragPreviewPositions(null);
    return true;
  }, [figures, magnetEnabled, measureSnapStrengthPx, scale, setFigures]);

  useEffect(() => {
    const onMove = (evt: PointerEvent | MouseEvent) => {
      const direct = selectDirectDragRef.current;
      if (!direct) return;
      if (tool !== "select") return;

      const world = clientToWorld(evt.clientX, evt.clientY);
      if (!world) return;

      // Consume move while dragging.
      if (handleSelectDirectDragMove(world)) {
        try {
          evt.preventDefault();
        } catch {
          // ignore
        }
      }
    };

    const onUp = (evt: PointerEvent | MouseEvent | FocusEvent) => {
      if (tool !== "select") return;

      const direct = selectDirectDragRef.current;
      if (direct && "clientX" in evt && typeof evt.clientX === "number") {
        const world = clientToWorld(evt.clientX, (evt as MouseEvent).clientY);
        if (world) direct.lastWorld = world;
      }

      commitSelectDirectDrag();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [clientToWorld, commitSelectDirectDrag, handleSelectDirectDragMove, tool]);

  const dragNodeRef = useRef<{
    figureId: string;
    nodeId: string;
    startNode: Vec2;
    startIn?: Vec2;
    startOut?: Vec2;
    snappedToNodeId?: string | null;
  } | null>(null);

  const mergeFigureNodes = useCallback(
    (figure: Figure, fromNodeId: string, toNodeId: string): Figure => {
      if (fromNodeId === toNodeId) return figure;
      const minNodes = figure.closed ? 3 : 2;
      if (figure.nodes.length <= minNodes) return figure;

      const hasFrom = figure.nodes.some((n) => n.id === fromNodeId);
      const hasTo = figure.nodes.some((n) => n.id === toNodeId);
      if (!hasFrom || !hasTo) return figure;

      const nextEdges = figure.edges
        .map((e) => ({
          ...e,
          from: e.from === fromNodeId ? toNodeId : e.from,
          to: e.to === fromNodeId ? toNodeId : e.to,
        }))
        .filter((e) => e.from !== e.to);

      return {
        ...figure,
        nodes: figure.nodes.filter((n) => n.id !== fromNodeId),
        edges: nextEdges,
      };
    },
    []
  );

  const dragHandleRef = useRef<{
    figureId: string;
    nodeId: string;
    which: "in" | "out";
  } | null>(null);

  useEffect(() => {
    // When leaving node tool, clear node selection.
    if (tool !== "node") {
      setNodeSelection(null);
      setHoveredEdge(null);
      setHoveredNodeId(null);
      setNodeAngleGuide(null);
    }

    // When leaving curve tool, clear unfinished multi-click curve.
    if (tool !== "curve") {
      setCurveDraft(null);
    }

    if (tool !== "dart") {
      setDartDraft(null);
    }

    if (tool !== "measure") {
      setMeasureDraft(null);
    }
  }, [tool]);

  useEffect(() => {
    const prev = prevToolRef.current;
    prevToolRef.current = tool;
    if (prev !== "select") return;
    if (tool === "select") return;

    // If a drag ever left Konva nodes moved but state not persisted,
    // flush current Konva transforms back into figures before switching tools.
    setFigures((prevFigures) => {
      let changed = false;
      const next = prevFigures.map((f) => {
        const node = figureNodeRefs.current.get(f.id);
        if (!node) return f;
        const nx = node.x();
        const ny = node.y();
        const nr = node.rotation();
        if (
          Math.abs(nx - f.x) < 1e-6 &&
          Math.abs(ny - f.y) < 1e-6 &&
          Math.abs((nr || 0) - (f.rotation || 0)) < 1e-6
        ) {
          return f;
        }
        changed = true;
        return { ...f, x: nx, y: ny, rotation: nr };
      });
      return changed ? next : prevFigures;
    });
  }, [setFigures, tool]);

  const selectedFigure = useMemo(() => {
    return selectedFigureId
      ? figures.find((f) => f.id === selectedFigureId)
      : null;
  }, [figures, selectedFigureId]);

  const selectedIdsSet = useMemo(() => {
    return new Set<string>(selectedFigureIds);
  }, [selectedFigureIds]);

  const addFigureWithOptionalMerge = useCallback(
    (fig: Figure, joinHits?: JoinHit[]) => {
      if (!fig) return;
      const thresholdWorld = Math.max(12, measureSnapStrengthPx) / scale;
      let nextSelectedId = fig.id;
      setFigures((prev) => {
        if (!magnetJoinEnabled) return [...prev, fig];
        const merged = mergeFiguresWithNewFigure(
          prev,
          fig,
          thresholdWorld,
          joinHits
        );
        const mergedId = merged[merged.length - 1]?.id ?? fig.id;
        nextSelectedId = mergedId;
        return merged;
      });
      setSelectedFigureId(nextSelectedId);
    },
    [
      magnetJoinEnabled,
      measureSnapStrengthPx,
      scale,
      setFigures,
      setSelectedFigureId,
    ]
  );

  const transformTargetIds = useMemo(() => {
    if (tool !== "select") return [];
    if (!selectedFigureIds.length) return [];

    const selected = new Set<string>(selectedFigureIds);
    const out: string[] = [];
    const seen = new Set<string>();

    for (const f of figures) {
      const isTarget =
        selected.has(f.id) ||
        (f.kind === "seam" && f.parentId && selected.has(f.parentId));
      if (!isTarget) continue;
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f.id);
    }

    return out;
  }, [figures, selectedFigureIds, tool]);

  const selectionHitBounds = useMemo((): BoundingBox | null => {
    if (tool !== "select") return null;
    if (transformTargetIds.length === 0) return null;

    let bounds: BoundingBox | null = null;
    for (const id of transformTargetIds) {
      const fig = figures.find((f) => f.id === id);
      if (!fig) continue;
      const tr = getRuntimeFigureTransform(fig);
      const bb = figureWorldBoundingBox({
        ...fig,
        x: tr.x,
        y: tr.y,
        rotation: tr.rotation,
      });
      if (!bb) continue;
      if (!bounds) {
        bounds = { ...bb };
      } else {
        const x0 = Math.min(bounds.x, bb.x);
        const y0 = Math.min(bounds.y, bb.y);
        const x1 = Math.max(bounds.x + bounds.width, bb.x + bb.width);
        const y1 = Math.max(bounds.y + bounds.height, bb.y + bb.height);
        bounds = {
          x: x0,
          y: y0,
          width: x1 - x0,
          height: y1 - y0,
        };
      }
    }

    // Avoid creating a hit target for degenerate selections.
    if (!bounds || bounds.width < 1e-6 || bounds.height < 1e-6) return null;
    return bounds;
  }, [figures, getRuntimeFigureTransform, tool, transformTargetIds]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    if (tool !== "select" || transformTargetIds.length === 0) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    const nodes: Konva.Node[] = [];
    for (const id of transformTargetIds) {
      const node = figureNodeRefs.current.get(id);
      if (node) nodes.push(node);
    }
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [tool, transformTargetIds]);

  const finalizeSelectionTransform = useCallback(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    const nodes = transformer.nodes();
    if (!nodes.length) return;

    const updates = new Map<
      string,
      { x: number; y: number; rotation: number; scaleX: number; scaleY: number }
    >();

    for (const node of nodes) {
      const figId = (node.getAttr("figureId") as string | undefined) ?? null;
      if (!figId) continue;
      updates.set(figId, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      });
    }

    if (!updates.size) return;

    // Synced mirror copies are locked.
    for (const node of nodes) {
      const figId = (node.getAttr("figureId") as string | undefined) ?? null;
      if (!figId) continue;
      const fig = figures.find((f) => f.id === figId) ?? null;
      if (!fig) continue;
      const link = fig.mirrorLink;
      if (link && link.role === "mirror" && link.sync === true) {
        // Revert the Konva node back to the current (state) transform.
        const tr = getRuntimeFigureTransform(fig);
        node.position({ x: tr.x, y: tr.y });
        node.rotation(tr.rotation);
        node.scaleX(1);
        node.scaleY(1);
        transformer.getLayer()?.batchDraw();
        toast(
          "Espelho sincronizado está bloqueado. Desligue a sincronização para editar.",
          "error"
        );
        return;
      }
    }

    // Reset Konva node scaling; we bake scale into figure geometry.
    for (const node of nodes) {
      node.scaleX(1);
      node.scaleY(1);
    }
    transformer.getLayer()?.batchDraw();

    setFigures(
      (prev) =>
        prev.map((f) => {
          const u = updates.get(f.id);
          if (!u) return f;

          const didScale =
            Math.abs(u.scaleX - 1) > 1e-6 || Math.abs(u.scaleY - 1) > 1e-6;

          let next: Figure = {
            ...f,
            x: u.x,
            y: u.y,
            rotation: u.rotation,
          };

          if (didScale) {
            const sx = u.scaleX;
            const sy = u.scaleY;

            if (next.tool === "text") {
              const baseWidth =
                Number.isFinite(next.textWidthPx ?? NaN) &&
                (next.textWidthPx ?? 0) > 0
                  ? (next.textWidthPx as number)
                  : 260;
              const baseFontSize =
                Number.isFinite(next.textFontSizePx ?? NaN) &&
                (next.textFontSizePx ?? 0) > 0
                  ? (next.textFontSizePx as number)
                  : 18;
              const basePadding =
                Number.isFinite(next.textPaddingPx ?? NaN) &&
                (next.textPaddingPx ?? 0) >= 0
                  ? (next.textPaddingPx as number)
                  : 0;

              const absSx = Math.abs(sx);
              const absSy = Math.abs(sy);
              const avgScale = (absSx + absSy) / 2;

              next = {
                ...next,
                textWidthPx: Math.round(
                  Math.max(20, Math.min(4000, baseWidth * absSx))
                ),
                textFontSizePx: Math.round(
                  Math.max(6, Math.min(300, baseFontSize * absSy))
                ),
                textPaddingPx: Math.max(
                  0,
                  Math.min(50, basePadding * avgScale)
                ),
              };

              return next;
            }

            next = {
              ...next,
              nodes: next.nodes.map((n) => ({
                ...n,
                x: n.x * sx,
                y: n.y * sy,
                inHandle: n.inHandle
                  ? { x: n.inHandle.x * sx, y: n.inHandle.y * sy }
                  : undefined,
                outHandle: n.outHandle
                  ? { x: n.outHandle.x * sx, y: n.outHandle.y * sy }
                  : undefined,
              })),
            };

            // Scaling changes curve geometry; break styled link and mark snapshot dirty if applicable.
            next = markCurveCustomSnapshotDirtyIfPresent(
              breakStyledLinkIfNeeded(next)
            );
          }

          return next;
        }),
      true
    );
  }, [figures, getRuntimeFigureTransform, setFigures]);

  const getSnappedWorldForTool = useCallback(
    (
      worldRaw: Vec2,
      mode: "down" | "move"
    ): { world: Vec2; snap: SnapResult } => {
      // Imã affects drawing tools (line/rect/circle/curve). Measure always has snapping (existing behavior).
      const isDrawingTool =
        tool === "line" ||
        tool === "rectangle" ||
        tool === "circle" ||
        tool === "curve" ||
        tool === "text" ||
        tool === "dart";
      const isMeasure = tool === "measure";

      const shouldSnap =
        ((magnetEnabled || magnetJoinEnabled) && isDrawingTool) || isMeasure;
      if (!shouldSnap) return { world: worldRaw, snap: { isSnapped: false } };

      const thresholdWorld = Math.max(12, measureSnapStrengthPx) / scale;

      // Avoid snapping to the figure while dragging it (select tool). Not relevant here.
      const exclude = new Set<string>();
      void mode;

      const snap = snapWorldPoint(worldRaw, figures, guides, {
        thresholdWorld,
        excludeSeams: true,
        includeNodes: true,
        excludeFigureIds: exclude.size ? exclude : undefined,
      });

      return { world: snap.isSnapped ? snap.pointWorld : worldRaw, snap };
    },
    [
      figures,
      guides,
      magnetEnabled,
      magnetJoinEnabled,
      measureSnapStrengthPx,
      scale,
      tool,
    ]
  );

  const snapSelectionDeltaToGuides = useCallback(
    (
      startBounds: BoundingBox | null,
      dx: number,
      dy: number
    ): { dx: number; dy: number } => {
      if (!magnetEnabled) return { dx, dy };
      if (!guides.length) return { dx, dy };
      if (!startBounds) return { dx, dy };

      const thresholdWorld = Math.max(12, measureSnapStrengthPx) / scale;

      const movedX = startBounds.x + dx;
      const movedY = startBounds.y + dy;
      const left = movedX;
      const right = movedX + startBounds.width;
      const centerX = movedX + startBounds.width / 2;
      const top = movedY;
      const bottom = movedY + startBounds.height;
      const centerY = movedY + startBounds.height / 2;

      let bestAdjustX: number | null = null;
      let bestAbsAdjustX = Number.POSITIVE_INFINITY;
      let bestAdjustY: number | null = null;
      let bestAbsAdjustY = Number.POSITIVE_INFINITY;

      const tryAdjustX = (guideX: number) => {
        const candidates = [left, centerX, right];
        for (const c of candidates) {
          const adjust = guideX - c;
          const abs = Math.abs(adjust);
          if (abs <= thresholdWorld && abs < bestAbsAdjustX) {
            bestAbsAdjustX = abs;
            bestAdjustX = adjust;
          }
        }
      };

      const tryAdjustY = (guideY: number) => {
        const candidates = [top, centerY, bottom];
        for (const c of candidates) {
          const adjust = guideY - c;
          const abs = Math.abs(adjust);
          if (abs <= thresholdWorld && abs < bestAbsAdjustY) {
            bestAbsAdjustY = abs;
            bestAdjustY = adjust;
          }
        }
      };

      for (const g of guides) {
        if (g.orientation === "vertical") {
          tryAdjustX(g.valuePx);
        } else {
          tryAdjustY(g.valuePx);
        }
      }

      return {
        dx: bestAdjustX != null ? dx + bestAdjustX : dx,
        dy: bestAdjustY != null ? dy + bestAdjustY : dy,
      };
    },
    [guides, magnetEnabled, measureSnapStrengthPx, scale]
  );

  useEffect(() => {
    snapSelectionDeltaToGuidesRef.current = snapSelectionDeltaToGuides;
  }, [snapSelectionDeltaToGuides]);

  useEffect(() => {
    // Keep seam figures synced when their parent/base geometry changes.
    // We store a sourceSignature on the seam to avoid infinite loops.

    const byId = new Map(figures.map((f) => [f.id, f] as const));
    const toRemove = new Set<string>();
    const toUpdate = new Set<string>();
    const toSyncTransform = new Set<string>();

    for (const seam of figures) {
      if (seam.kind !== "seam" || !seam.parentId) continue;
      const base = byId.get(seam.parentId);
      if (!base) {
        toRemove.add(seam.id);
        continue;
      }

      const sig = seamSourceSignature(base, seam.offsetCm ?? 1);

      const baseRot = base.rotation ?? 0;
      const seamRot = seam.rotation ?? 0;
      const needsTransformSync =
        seam.x !== base.x || seam.y !== base.y || seamRot !== baseRot;

      if (needsTransformSync) {
        toSyncTransform.add(seam.id);
      }

      if (seam.sourceSignature === sig) continue;

      // If the base is no longer closed or the seam can't be regenerated,
      // remove it to avoid infinite retries.
      const regenerated = makeSeamFigure(base, seam.offsetCm ?? 1);
      if (!base.closed || !regenerated) {
        toRemove.add(seam.id);
        continue;
      }

      toUpdate.add(seam.id);
    }

    if (!toRemove.size && !toUpdate.size && !toSyncTransform.size) return;

    setFigures((prev) => {
      let changed = false;
      const byId = new Map(prev.map((f) => [f.id, f] as const));

      const next: typeof prev = [];
      for (const f of prev) {
        if (toRemove.has(f.id)) {
          changed = true;
          continue;
        }

        if (f.kind === "seam" && f.parentId && toSyncTransform.has(f.id)) {
          const base = byId.get(f.parentId) ?? null;
          if (base) {
            const baseRot = base.rotation ?? 0;
            const seamRot = f.rotation ?? 0;
            if (f.x !== base.x || f.y !== base.y || seamRot !== baseRot) {
              changed = true;
              // Sync transform without regenerating geometry.
              next.push({ ...f, x: base.x, y: base.y, rotation: baseRot });
              continue;
            }
          }
        }

        if (f.kind !== "seam" || !f.parentId || !toUpdate.has(f.id)) {
          next.push(f);
          continue;
        }

        const base = byId.get(f.parentId);
        if (!base) {
          next.push(f);
          continue;
        }

        const offsetCm = f.offsetCm ?? 1;
        const updated = recomputeSeamFigure(base, f, offsetCm);
        if (!updated) {
          // If we can't recompute now, keep as-is (but we already gated calls
          // so this should be rare).
          next.push(f);
          continue;
        }
        changed = true;
        next.push(updated);
      }

      return changed ? next : prev;
    }, false);
  }, [figures, setFigures]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
      setContainerClientRect(el.getBoundingClientRect());
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    setContainerClientRect(el.getBoundingClientRect());
    return () => ro.disconnect();
  }, []);

  const viewportWorld = useMemo(() => {
    const w0 = -position.x / scale;
    const h0 = -position.y / scale;
    return {
      x0: w0,
      y0: h0,
      x1: w0 + size.width / scale,
      y1: h0 + size.height / scale,
    };
  }, [position.x, position.y, scale, size.width, size.height]);

  const guidePreviewPendingRef = useRef<Map<string, number> | null>(null);
  const guidePreviewRafRef = useRef<number | null>(null);
  const [guidePreviewValues, setGuidePreviewValues] = useState<Map<
    string,
    number
  > | null>(null);

  const requestGuidePreviewRender = useCallback(() => {
    if (guidePreviewRafRef.current != null) return;
    guidePreviewRafRef.current = requestAnimationFrame(() => {
      guidePreviewRafRef.current = null;
      setGuidePreviewValues(guidePreviewPendingRef.current);
    });
  }, []);

  const guidesOverlay = useMemo(() => {
    if (!guides.length) return null;

    const guidesDraggable = tool === "select";

    const pad = 500 / scale;
    const x0 = viewportWorld.x0 - pad;
    const x1 = viewportWorld.x1 + pad;
    const y0 = viewportWorld.y0 - pad;
    const y1 = viewportWorld.y1 + pad;

    const RULER_SIZE_PX = 24;
    const containerRect = containerClientRect;

    const shouldDeleteGuide = (
      g: GuideLine,
      clientX: number,
      clientY: number
    ) => {
      if (!showRulers) return false;
      if (!containerRect) return false;

      if (g.orientation === "horizontal") {
        const inX =
          clientX >= containerRect.left && clientX <= containerRect.right;
        const inY =
          clientY >= containerRect.top - RULER_SIZE_PX &&
          clientY <= containerRect.top;
        return inX && inY;
      }

      const inY =
        clientY >= containerRect.top && clientY <= containerRect.bottom;
      const inX =
        clientX >= containerRect.left - RULER_SIZE_PX &&
        clientX <= containerRect.left;
      return inX && inY;
    };

    return (
      <>
        {guides.map((g) => {
          const preview = guidePreviewValues?.get(g.id);
          const valuePx = preview ?? g.valuePx;

          if (g.orientation === "vertical") {
            return (
              <Line
                key={g.id}
                x={valuePx}
                y={0}
                points={[0, y0, 0, y1]}
                stroke={guideStroke}
                strokeWidth={2 / scale}
                opacity={0.95}
                shadowColor={guideStroke}
                shadowBlur={8 / scale}
                shadowOpacity={0.7}
                hitStrokeWidth={8 / scale}
                draggable={guidesDraggable}
                listening={guidesDraggable}
                dragBoundFunc={(pos) => ({ x: pos.x, y: 0 })}
                onDragMove={(e) => {
                  if (!guidesDraggable) return;
                  const next = e.target.x();
                  const map = guidePreviewPendingRef.current
                    ? new Map(guidePreviewPendingRef.current)
                    : new Map();
                  map.set(g.id, next);
                  guidePreviewPendingRef.current = map;
                  requestGuidePreviewRender();
                }}
                onDragEnd={(e) => {
                  if (!guidesDraggable) return;
                  const evt = e.evt as MouseEvent;
                  const next = e.target.x();

                  if (shouldDeleteGuide(g, evt.clientX, evt.clientY)) {
                    removeGuide(g.id);
                  } else {
                    updateGuide(g.id, next);
                  }

                  guidePreviewPendingRef.current = null;
                  setGuidePreviewValues(null);
                }}
              />
            );
          }

          return (
            <Line
              key={g.id}
              x={0}
              y={valuePx}
              points={[x0, 0, x1, 0]}
              stroke={guideStroke}
              strokeWidth={2 / scale}
              opacity={0.95}
              shadowColor={guideStroke}
              shadowBlur={8 / scale}
              shadowOpacity={0.7}
              hitStrokeWidth={8 / scale}
              draggable={guidesDraggable}
              listening={guidesDraggable}
              dragBoundFunc={(pos) => ({ x: 0, y: pos.y })}
              onDragMove={(e) => {
                if (!guidesDraggable) return;
                const next = e.target.y();
                const map = guidePreviewPendingRef.current
                  ? new Map(guidePreviewPendingRef.current)
                  : new Map();
                map.set(g.id, next);
                guidePreviewPendingRef.current = map;
                requestGuidePreviewRender();
              }}
              onDragEnd={(e) => {
                if (!guidesDraggable) return;
                const evt = e.evt as MouseEvent;
                const next = e.target.y();

                if (shouldDeleteGuide(g, evt.clientX, evt.clientY)) {
                  removeGuide(g.id);
                } else {
                  updateGuide(g.id, next);
                }

                guidePreviewPendingRef.current = null;
                setGuidePreviewValues(null);
              }}
            />
          );
        })}
      </>
    );
  }, [
    guidePreviewValues,
    guideStroke,
    guides,
    containerClientRect,
    removeGuide,
    requestGuidePreviewRender,
    scale,
    showRulers,
    tool,
    updateGuide,
    viewportWorld.x0,
    viewportWorld.x1,
    viewportWorld.y0,
    viewportWorld.y1,
  ]);

  const gridLines = useMemo(() => {
    if (!showGrid) return [] as Array<{ points: number[] }>; // local to world
    const lines: Array<{ points: number[] }> = [];

    // Keep grid aligned with the ruler's unit scale.
    // pixelsPerUnit defines how many screen pixels correspond to 1 unit (e.g. 1 cm).
    const step = Math.max(4, pixelsPerUnit);

    const startX = Math.floor(viewportWorld.x0 / step) * step;
    const endX = Math.ceil(viewportWorld.x1 / step) * step;
    const startY = Math.floor(viewportWorld.y0 / step) * step;
    const endY = Math.ceil(viewportWorld.y1 / step) * step;

    for (let x = startX; x <= endX; x += step) {
      lines.push({ points: [x, startY, x, endY] });
    }

    for (let y = startY; y <= endY; y += step) {
      lines.push({ points: [startX, y, endX, y] });
    }

    return lines;
  }, [pixelsPerUnit, showGrid, viewportWorld]);

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      // Cursor badge (idle-only): hide during wheel/trackpad interaction.
      cursorBadgeLastPosRef.current = { x: pointer.x, y: pointer.y };
      setCursorBadge(null);
      scheduleCursorBadgeIdleShow();

      // Trackpad pan is typically reported as wheel events with small deltas.
      // Pinch-zoom usually sets ctrlKey=true on macOS.
      const isTrackpadWheel =
        e.evt.deltaMode === 0 &&
        (Math.abs(e.evt.deltaX) > 0 || Math.abs(e.evt.deltaY) < 50);

      if (!e.evt.ctrlKey && isTrackpadWheel) {
        setPosition({
          x: position.x - e.evt.deltaX,
          y: position.y - e.evt.deltaY,
        });
        return;
      }

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const nextScale = clamp(scale * factor, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);

      const mousePointTo = {
        x: (pointer.x - position.x) / scale,
        y: (pointer.y - position.y) / scale,
      };

      const nextPosition = {
        x: pointer.x - mousePointTo.x * nextScale,
        y: pointer.y - mousePointTo.y * nextScale,
      };

      setScale(nextScale);
      setPosition(nextPosition);
    },
    [
      position.x,
      position.y,
      scheduleCursorBadgeIdleShow,
      scale,
      setPosition,
      setScale,
    ]
  );

  const parseCmInput = useCallback((raw: string): number | null => {
    const v = parsePtBrDecimal(raw);
    if (v == null) return null;
    return Math.max(0.01, v);
  }, []);

  useEffect(() => {
    if (!edgeContextMenu) return;

    const onDown = (evt: MouseEvent) => {
      const target = evt.target as HTMLElement | null;
      if (target?.closest?.('[data-testid="edge-context-menu"]')) return;
      setEdgeContextMenu(null);
    };

    const onKey = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") setEdgeContextMenu(null);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [edgeContextMenu]);

  const handleContextUnlinkMirror = useCallback(() => {
    if (!edgeContextMenu) return;
    const figId = edgeContextMenu.figureId;
    const fig = figures.find((f) => f.id === figId) ?? null;
    const link = fig?.mirrorLink;
    if (!fig || !link) {
      setEdgeContextMenu(null);
      return;
    }

    setFigures((prev) =>
      prev.map((f) => {
        if (f.id === fig.id || f.id === link.otherId) {
          return { ...f, mirrorLink: undefined };
        }
        return f;
      })
    );
    toast("Espelho desvinculado.");
    setEdgeContextMenu(null);
  }, [edgeContextMenu, figures, setFigures]);

  const handleContextDesespelhar = useCallback(() => {
    if (!edgeContextMenu) return;
    const figId = edgeContextMenu.figureId;
    const fig = figures.find((f) => f.id === figId) ?? null;
    const link = fig?.mirrorLink;
    if (!fig || !link) {
      setEdgeContextMenu(null);
      return;
    }

    const other = figures.find((f) => f.id === link.otherId) ?? null;
    if (!other) {
      setFigures((prev) =>
        prev.map((f) => (f.id === fig.id ? { ...f, mirrorLink: undefined } : f))
      );
      toast("Link de espelho inválido; removido.");
      setEdgeContextMenu(null);
      return;
    }

    const originalId = link.role === "mirror" ? other.id : fig.id;
    const mirrorId = link.role === "mirror" ? fig.id : other.id;

    setFigures((prev) =>
      prev
        .filter(
          (f) =>
            f.id !== mirrorId && !(f.kind === "seam" && f.parentId === mirrorId)
        )
        .map((f) => {
          if (f.id === originalId || f.id === mirrorId) {
            return { ...f, mirrorLink: undefined };
          }
          return f;
        })
    );

    setSelectedFigureId(originalId);
    toast("Espelho removido.");
    setEdgeContextMenu(null);
  }, [edgeContextMenu, figures, setFigures, setSelectedFigureId]);

  const handleConvertContextEdge = useCallback(
    (kind: "cubic" | "line") => {
      if (!edgeContextMenu) return;
      const { figureId, edgeId } = edgeContextMenu;
      if (!edgeId) return;

      setFigures((prev) =>
        prev.map((f) => {
          if (f.id !== figureId) return f;
          if (f.kind === "seam") return f;

          const updatedRaw =
            kind === "cubic"
              ? convertEdgeToCubic(f, edgeId)
              : convertEdgeToLine(f, edgeId);

          if (updatedRaw === f) return f;
          return markCurveCustomSnapshotDirtyIfPresent(
            breakStyledLinkIfNeeded(updatedRaw)
          );
        })
      );

      setSelectedFigureIds([figureId]);
      setSelectedEdge({ figureId, edgeId, anchor: "mid" });

      if (kind === "cubic") {
        setTool("node");
      }
      setEdgeContextMenu(null);
    },
    [
      edgeContextMenu,
      setFigures,
      setSelectedEdge,
      setSelectedFigureIds,
      setTool,
    ]
  );

  const openInlineEdgeEdit = useCallback(
    (opts: {
      figureId: string;
      edgeId: string;
      anchor: "start" | "end" | "mid";
      clientX: number;
      clientY: number;
    }) => {
      const fig = figures.find((f) => f.id === opts.figureId);
      if (!fig) return;
      const hit = fig.measures?.perEdge?.find((m) => m.edgeId === opts.edgeId);
      if (!hit) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const cm = pxToCm(hit.lengthPx);
      setEdgeEditDraft({
        figureId: opts.figureId,
        edgeId: opts.edgeId,
        anchor: opts.anchor,
        value: formatPtBrDecimalFixed(cm, 2),
        x: opts.clientX - rect.left,
        y: opts.clientY - rect.top,
      });
    },
    [figures]
  );

  const computeTextEditDraft = useCallback(
    (fig: Figure) => {
      if (fig.kind === "seam" || fig.tool !== "text") return null;

      // screenX/screenY are already in Stage/container coordinates.
      // This overlay is positioned inside the same container, so we must NOT
      // offset by getBoundingClientRect().
      const screenX = fig.x * scale + position.x;
      const screenY = fig.y * scale + position.y;

      const fontSize = (() => {
        const v = fig.textFontSizePx;
        if (!Number.isFinite(v ?? NaN)) return 18;
        return Math.max(6, Math.min(300, v as number));
      })();
      const lineHeight = (() => {
        const v = fig.textLineHeight;
        if (!Number.isFinite(v ?? NaN)) return 1.25;
        return Math.max(0.8, Math.min(3, v as number));
      })();

      const widthWorld =
        Number.isFinite(fig.textWidthPx ?? NaN) && (fig.textWidthPx ?? 0) > 0
          ? (fig.textWidthPx as number)
          : 260;
      const lines = ((fig.textValue ?? "") as string).split("\n");
      const approxLines = Math.max(1, Math.min(10, lines.length));
      const heightWorld = Math.max(
        60,
        approxLines * fontSize * lineHeight + 18
      );

      return {
        figureId: fig.id,
        value: (fig.textValue ?? "") as string,
        x: screenX,
        y: screenY,
        width: Math.max(160, widthWorld * scale),
        height: Math.max(60, heightWorld * scale),
      };
    },
    [position.x, position.y, scale]
  );

  const openInlineTextEdit = useCallback(
    (figureId: string) => {
      const fig = figures.find((f) => f.id === figureId);
      if (!fig) return;
      const draft = computeTextEditDraft(fig);
      if (!draft) return;
      setTextEditDraft({ ...draft, isNew: false, didEdit: false });
    },
    [computeTextEditDraft, figures]
  );

  const openInlineTextEditForFigure = useCallback(
    (fig: Figure, opts?: { isNew?: boolean }) => {
      const draft = computeTextEditDraft(fig);
      if (!draft) return;
      setTextEditDraft({
        ...draft,
        isNew: opts?.isNew === true,
        didEdit: false,
      });
    },
    [computeTextEditDraft]
  );

  const removeTextFigure = useCallback(
    (figureId: string) => {
      setFigures((prev) => prev.filter((f) => f.id !== figureId));
      setSelectedFigureIds(selectedFigureIds.filter((id) => id !== figureId));
      if (selectedFigureId === figureId) {
        setSelectedFigureId(null);
      }
      if (selectedEdge && selectedEdge.figureId === figureId) {
        setSelectedEdge(null);
      }
    },
    [
      selectedEdge,
      selectedFigureId,
      selectedFigureIds,
      setFigures,
      setSelectedEdge,
      setSelectedFigureId,
      setSelectedFigureIds,
    ]
  );

  const applyEdgeLengthEdit = useCallback(
    (
      draft: {
        figureId: string;
        edgeId: string;
        anchor: "start" | "end" | "mid";
      },
      rawCm: string
    ) => {
      const cm = parseCmInput(rawCm);
      if (cm == null) return;

      const targetPx = cm * PX_PER_CM;
      setFigures((prev) =>
        prev.map((f) => {
          if (f.id !== draft.figureId) return f;
          if (f.kind === "seam") return f;
          const updated = setEdgeTargetLengthPx({
            figure: f,
            edgeId: draft.edgeId,
            targetLengthPx: targetPx,
            anchor: draft.anchor,
          });
          return updated ?? f;
        })
      );
    },
    [parseCmInput, setFigures]
  );

  const applyTextEdit = useCallback(
    (figureId: string, value: string) => {
      setFigures((prev) =>
        prev.map((f) => {
          if (f.id !== figureId) return f;
          if (f.kind === "seam") return f;
          if (f.tool !== "text") return f;
          return { ...f, textValue: value };
        })
      );
    },
    [setFigures]
  );

  const handleStageDblClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (tool !== "select") return;
      const stage = stageRef.current;
      if (!stage) return;
      stage.setPointersPositions(e.evt);
      const pos = stage.getPointerPosition();
      if (!pos) return;

      const world = {
        x: (pos.x - position.x) / scale,
        y: (pos.y - position.y) / scale,
      };

      const thresholdWorld = 10 / scale;
      const figId = findHoveredFigureId(figures, world, thresholdWorld);
      if (!figId) return;
      const fig = figures.find((f) => f.id === figId);
      if (!fig || fig.kind === "seam") return;

      if (fig.tool === "text") {
        setSelectedFigureIds([fig.id]);
        setSelectedEdge(null);
        openInlineTextEdit(fig.id);
        return;
      }

      const local = worldToFigureLocal(fig, world);
      const hit = findNearestEdge(fig, local);
      if (!hit.best || hit.bestDist > thresholdWorld) return;

      // Prefer the currently selected edge (and its anchor) when the user
      // double-clicks near it. This avoids accidentally re-picking a neighbor
      // edge/endpoint due to label offsets or close geometry.
      const SELECTED_EDGE_DBLCLICK_SLOP_PX = 48;
      const slopWorld = SELECTED_EDGE_DBLCLICK_SLOP_PX / scale;

      const preferredEdge =
        selectedEdge && selectedEdge.figureId === fig.id
          ? (fig.edges.find((ed) => ed.id === selectedEdge.edgeId) ?? null)
          : null;

      const useSelectedEdge =
        preferredEdge &&
        (() => {
          const selHit = nearestOnEdgeLocal(fig, preferredEdge, local);
          return !!selHit && selHit.d <= slopWorld;
        })();

      const edge = useSelectedEdge
        ? preferredEdge
        : (fig.edges.find((ed) => ed.id === hit.best!.edgeId) ?? null);
      if (!edge) return;

      const preferredAnchor = getEdgeAnchorPreference(fig.id, edge.id);
      const anchor: "start" | "end" | "mid" =
        useSelectedEdge && selectedEdge
          ? selectedEdge.anchor
          : (preferredAnchor ??
            (() => {
              const nFrom = fig.nodes.find((n) => n.id === edge.from);
              const nTo = fig.nodes.find((n) => n.id === edge.to);
              if (!nFrom || !nTo) return "end";
              const dFrom = dist(local, { x: nFrom.x, y: nFrom.y });
              const dTo = dist(local, { x: nTo.x, y: nTo.y });
              return dFrom <= dTo ? "start" : "end";
            })());

      setSelectedFigureIds([fig.id]);
      setSelectedEdge({ figureId: fig.id, edgeId: edge.id, anchor });

      openInlineEdgeEdit({
        figureId: fig.id,
        edgeId: edge.id,
        anchor,
        clientX: e.evt.clientX,
        clientY: e.evt.clientY,
      });
    },
    [
      figures,
      getEdgeAnchorPreference,
      openInlineEdgeEdit,
      openInlineTextEdit,
      position.x,
      position.y,
      scale,
      selectedEdge,
      setSelectedEdge,
      setSelectedFigureIds,
      tool,
    ]
  );

  const handlePointerDown = (
    e: Konva.KonvaEventObject<PointerEvent | MouseEvent>
  ) => {
    // Konva/React can fire both Pointer and Mouse events for the same click.
    // When that happens, our handlers run twice and tools like Curve can degrade to straight/duplicated segments.
    const evt = e.evt;
    const isPointer =
      typeof (window as unknown as { PointerEvent?: unknown }).PointerEvent !==
        "undefined" && evt instanceof PointerEvent;
    const isMouse = evt instanceof MouseEvent && !isPointer;
    const now = Date.now();
    if (isPointer) {
      lastPointerDownSigRef.current = {
        t: now,
        x: evt.clientX,
        y: evt.clientY,
        button: evt.button,
      };
    } else if (isMouse) {
      const sig = lastPointerDownSigRef.current;
      // Ignore only the synthetic mouse event that mirrors a pointer event.
      if (
        sig &&
        now - sig.t < 80 &&
        sig.button === evt.button &&
        Math.abs(sig.x - evt.clientX) < 2 &&
        Math.abs(sig.y - evt.clientY) < 2
      ) {
        return;
      }
    }

    const stage = stageRef.current;
    if (!stage) return;

    // Node tool: if the click started on an interactive node/handle, do not
    // run the edge-splitting logic on the stage. This fixes a bug where dragging
    // a handle that lies on top of the edge stroke would insert a new node.
    if (tool === "node") {
      try {
        const targetName = e.target?.name?.() ?? "";
        if (
          targetName.includes("inaa-node-point") ||
          targetName.includes("inaa-node-handle")
        ) {
          return;
        }
      } catch {
        // ignore
      }
    }

    // Cursor badge should never show while pointer is down.
    isPointerDownRef.current = true;
    hideCursorBadge();

    // Ensure Konva updates pointer position even when clicking on empty stage.
    stage.setPointersPositions(e.evt);
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const evtAny = e.evt as MouseEvent;
    const buttons = (evtAny.buttons ?? 0) as number;
    const button = (evtAny.button ?? 0) as number;
    const isMiddlePressed = (buttons & 4) === 4 || button === 1;
    const isRightClick = button === 2;
    const isLeftClick = (buttons & 1) === 1 || button === 0;

    // Pan tool or middle mouse
    if (
      (tool === "pan" && isLeftClick && !isRightClick) ||
      (isMiddlePressed && !isRightClick)
    ) {
      e.evt.preventDefault();
      // Prefer pointer capture so panning continues even when leaving the stage.
      if (e.evt instanceof PointerEvent) {
        try {
          stage.container().setPointerCapture(e.evt.pointerId);
        } catch {
          // ignore (not supported in some environments)
        }
      }
      setIsPanning(true);
      lastPointerRef.current = { x: pos.x, y: pos.y };
      lastPanClientRef.current = {
        x: (e.evt as MouseEvent).clientX,
        y: (e.evt as MouseEvent).clientY,
      };
      panPositionRef.current = positionRef.current;
      return;
    }

    const world = {
      x: (pos.x - position.x) / scale,
      y: (pos.y - position.y) / scale,
    };

    const isBackground =
      e.target === stage || e.target === backgroundRef.current;

    if (tool === "text" && isLeftClick) {
      e.evt.preventDefault();
      e.evt.stopPropagation();

      // If an inline editor is open and the user clicks elsewhere on the canvas,
      // do NOT auto-commit placeholder text. Commit only if they actually edited.
      if (textEditDraft) {
        skipNextTextBlurRef.current = true;
        const draft = textEditDraft;
        setTextEditDraft(null);

        const trimmed = (draft.value ?? "").trim();
        if (draft.didEdit) {
          applyTextEdit(draft.figureId, draft.value);
        } else if (draft.isNew && trimmed === "") {
          removeTextFigure(draft.figureId);
        }
        // Continue: allow placing a new text at the clicked location.
      }

      // If clicking an existing text figure, just select it.
      const thresholdWorld = 10 / scale;
      const hitId = findHoveredFigureId(figures, world, thresholdWorld);
      const hit = hitId ? figures.find((f) => f.id === hitId) : null;
      if (hit && hit.kind !== "seam" && hit.tool === "text") {
        setSelectedFigureIds([hit.id]);
        setSelectedEdge(null);
        openInlineTextEdit(hit.id);
        return;
      }

      const resolvedDown = getSnappedWorldForTool(world, "down");
      const precisionSnap = modifierKeys.meta || modifierKeys.ctrl;
      const textWorld =
        !resolvedDown.snap.isSnapped && precisionSnap
          ? snapWorldToStepPxFloor(resolvedDown.world, PX_PER_MM)
          : resolvedDown.world;
      const newFig: Figure = {
        id: id("fig"),
        tool: "text",
        x: textWorld.x,
        y: textWorld.y,
        rotation: 0,
        nodes: [],
        edges: [],
        closed: false,
        stroke: "aci7",
        strokeWidth: 1,
        opacity: 1,
        textValue: "",
        textFontFamily:
          "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        textFontSizePx: 18,
        textAlign: "left",
        textWrap: "word",
        textWidthPx: 260,
        textLineHeight: 1.25,
        textLetterSpacing: 0,
        textPaddingPx: 0,
        textBackgroundEnabled: false,
        textBackgroundFill: "#ffffff",
        textBackgroundOpacity: 1,
      };

      setFigures((prev) => [...prev, newFig]);
      setSelectedFigureIds([newFig.id]);
      setSelectedEdge(null);
      openInlineTextEditForFigure(newFig, { isNew: true });
      return;
    }

    // Select tool: edge-priority selection (closest contour) + marquee selection.
    if (tool === "select" && isLeftClick) {
      const HIT_SLOP_PX = 10;
      const thresholdWorld = HIT_SLOP_PX / scale;

      if (e.evt.metaKey || e.evt.ctrlKey) {
        const edgePick = findNearestEdgeAcrossFigures(
          figures,
          world,
          14 / scale
        );
        if (edgePick) {
          const preferredAnchor = getEdgeAnchorPreference(
            edgePick.figure.id,
            edgePick.edge.id
          );
          const anchor: "start" | "end" | "mid" =
            preferredAnchor ??
            (() => {
              const nFrom = edgePick.figure.nodes.find(
                (n) => n.id === edgePick.edge.from
              );
              const nTo = edgePick.figure.nodes.find(
                (n) => n.id === edgePick.edge.to
              );
              if (!nFrom || !nTo) return "end";
              const dFrom = dist(edgePick.local, { x: nFrom.x, y: nFrom.y });
              const dTo = dist(edgePick.local, { x: nTo.x, y: nTo.y });
              return dFrom <= dTo ? "start" : "end";
            })();

          setSelectedFigureIds([edgePick.figure.id]);
          setSelectedEdge({
            figureId: edgePick.figure.id,
            edgeId: edgePick.edge.id,
            anchor,
          });
          setMarqueeDraft(null);
          return;
        }
      }

      const pickedId = pickFigureIdByEdgePriority(figures, world, {
        thresholdWorld,
        samples: 60,
      });

      if (pickedId) {
        const pickedFigure = figures.find((f) => f.id === pickedId) ?? null;
        const pickedBaseId =
          pickedFigure?.kind === "seam" && pickedFigure.parentId
            ? pickedFigure.parentId
            : pickedId;

        // Reset any in-progress direct drag candidate.
        selectDirectDragRef.current = null;

        if (e.evt.metaKey || e.evt.ctrlKey) {
          const fig = figures.find((f) => f.id === pickedBaseId) ?? null;
          if (fig && fig.kind !== "seam") {
            const local = worldToFigureLocal(fig, world);
            const hit = findNearestEdge(fig, local);
            const edgeId =
              hoveredSelectEdge && hoveredSelectEdge.figureId === fig.id
                ? hoveredSelectEdge.edgeId
                : hit.best && hit.bestDist <= 14 / scale
                  ? hit.best.edgeId
                  : null;
            if (edgeId) {
              const edge = fig.edges.find((ed) => ed.id === edgeId) ?? null;
              if (edge) {
                const preferredAnchor = getEdgeAnchorPreference(
                  fig.id,
                  edge.id
                );
                const anchor: "start" | "end" | "mid" =
                  preferredAnchor ??
                  (() => {
                    const nFrom = fig.nodes.find((n) => n.id === edge.from);
                    const nTo = fig.nodes.find((n) => n.id === edge.to);
                    if (!nFrom || !nTo) return "end";
                    const dFrom = dist(local, { x: nFrom.x, y: nFrom.y });
                    const dTo = dist(local, { x: nTo.x, y: nTo.y });
                    return dFrom <= dTo ? "start" : "end";
                  })();

                setSelectedFigureIds([fig.id]);
                setSelectedEdge({ figureId: fig.id, edgeId: edge.id, anchor });
                setMarqueeDraft(null);
                return;
              }
            }
          }
        }

        if (e.evt.shiftKey) {
          toggleSelectedFigureId(pickedBaseId);
        } else {
          // Keep multi-selection when dragging a selected member; only collapse
          // to a single selection when clicking a non-selected figure.
          if (!selectedIdsSet.has(pickedBaseId)) {
            setSelectedFigureIds([pickedBaseId]);
          }

          // Always use a Stage-level drag for moving figures/selection.
          // This avoids Konva drag path differences that can cause seams to drift.
          if (e.evt instanceof PointerEvent) {
            try {
              stage.container().setPointerCapture(e.evt.pointerId);
            } catch {
              // ignore
            }
          }

          selectDirectDragRef.current = {
            active: false,
            anchorFigureId: pickedBaseId,
            affectedIds: [],
            startPositions: new Map(),
            startBounds: null,
            startWorld: world,
            lastWorld: world,
          };
        }
        setMarqueeDraft(null);
        return;
      }

      // If clicking on empty background *inside the current selection bbox*,
      // start dragging the existing selection (market-standard behavior).
      // This must not interfere with picking figures inside/under the selection.
      if (isBackground && selectionHitBounds && selectedFigureIds.length) {
        const withinBounds =
          world.x >= selectionHitBounds.x &&
          world.y >= selectionHitBounds.y &&
          world.x <= selectionHitBounds.x + selectionHitBounds.width &&
          world.y <= selectionHitBounds.y + selectionHitBounds.height;

        if (withinBounds) {
          e.evt.preventDefault();
          if (e.evt instanceof PointerEvent) {
            try {
              stage.container().setPointerCapture(e.evt.pointerId);
            } catch {
              // ignore
            }
          }

          // Reset any in-progress direct drag candidate.
          selectDirectDragRef.current = null;

          if (dragPreviewRafRef.current != null) {
            cancelAnimationFrame(dragPreviewRafRef.current);
            dragPreviewRafRef.current = null;
          }
          dragPreviewPendingRef.current = null;
          setDragPreviewPositions(null);

          const anchorFigureId = selectedFigureId ?? selectedFigureIds[0];
          if (!anchorFigureId) return;

          selectDirectDragRef.current = {
            active: false,
            anchorFigureId,
            affectedIds: [],
            startPositions: new Map(),
            startBounds: null,
            startWorld: world,
            lastWorld: world,
          };

          setMarqueeDraft(null);
          return;
        }
      }

      // Start marquee selection (only makes sense when not clicking on a figure).
      if (isBackground) {
        setMarqueeDraft({
          startWorld: world,
          currentWorld: world,
          additive: e.evt.shiftKey,
        });
        return;
      }
    }

    // Background click clears selection (all other tools)
    if (isBackground) {
      setSelectedFigureIds([]);
    }

    const resolvedDown = getSnappedWorldForTool(world, "down");
    const worldForTool = resolvedDown.world;
    if (
      resolvedDown.snap.isSnapped &&
      (magnetEnabled || magnetJoinEnabled) &&
      tool !== "measure"
    ) {
      setMagnetSnap({
        pointWorld: resolvedDown.snap.pointWorld,
        kind: resolvedDown.snap.kind,
      });
    } else if (magnetSnap) {
      setMagnetSnap(null);
    }

    // Curve tool: right click undoes the last placed point.
    if (tool === "curve" && e.evt.button === 2) {
      e.evt.preventDefault();
      if (!curveDraft) return;

      setCurveDraft((prev) => {
        if (!prev) return prev;
        const nextPoints = prev.pointsWorld.slice(0, -1);
        const nextHits = prev.joinHits.slice(0, -1);
        if (nextPoints.length === 0) return null;
        return { pointsWorld: nextPoints, currentWorld: world, joinHits: nextHits };
      });
      return;
    }

    // Line tool: right click undoes the last placed point.
    if (tool === "line" && e.evt.button === 2) {
      e.evt.preventDefault();
      const current = lineDraftRef.current;
      if (!current) return;

      const nextPoints = current.pointsWorld.slice(0, -1);
      const nextHits = current.joinHits.slice(0, -1);
      const nextDraft =
        nextPoints.length === 0
          ? null
          : {
              pointsWorld: nextPoints,
              currentWorld: worldForTool,
              joinHits: nextHits,
            };
      lineDraftRef.current = nextDraft;
      setLineDraft(nextDraft);
      return;
    }

    if (tool === "pen") {
      if (e.evt.button !== 0) return;
      e.evt.preventDefault();
      const highPrecision =
        !!e.evt.metaKey ||
        !!e.evt.ctrlKey ||
        modifierKeys.meta ||
        modifierKeys.ctrl;
      const nextDraft = {
        pointsWorld: [worldForTool],
        currentWorld: worldForTool,
        highPrecision,
      };
      penDraftRef.current = nextDraft;
      setPenDraft(nextDraft);
      return;
    }

    if (tool === "measure") {
      setMeasureDraft({
        startWorld: worldForTool,
        endWorld: world,
        snappedEndWorld: worldForTool,
        isSnapped: resolvedDown.snap.isSnapped,
      });
      return;
    }

    // Offset tool: click on background/inside closed figure applies offset
    if (tool === "offset" && e.evt.button === 0) {
      if (!hoveredOffsetBaseId) return;
      
      const baseId = hoveredOffsetBaseId;
      const base = figures.find((f) => f.id === baseId) ?? null;
      if (!base || (!base.closed && !hasClosedLoop(base))) return;
      
      setSelectedFigureId(baseId);
      setOffsetTargetId(baseId);
      
      const existingSeam =
        figures.find((f) => f.kind === "seam" && f.parentId === baseId) ?? null;
      
      const isRemoveIntent = e.evt.metaKey || e.evt.ctrlKey;
      const edgeThresholdWorld = 18 / scale;
      const localForEdge = worldToFigureLocal(base, world);
      const outerEdgeIds = getOuterLoopEdgeIds(base);
      const edgeHitOuter = findNearestEdgeInSet(base, localForEdge, outerEdgeIds);
      const edgeHit = edgeHitOuter.best
        ? edgeHitOuter
        : findNearestEdge(base, localForEdge);
      const clickedEdgeId =
        hoveredOffsetEdge?.figureId === baseId
          ? hoveredOffsetEdge.edgeId
          : edgeHit.best && edgeHit.bestDist <= edgeThresholdWorld
            ? edgeHit.best.edgeId
            : null;
      
      // Per-edge offset
      if (clickedEdgeId && base.tool !== "circle") {
        const edgeId = clickedEdgeId;
        if (existingSeam) {
          const currentOffsets = existingSeam.offsetCm;
          let nextOffsets: Record<string, number> = {};

          if (typeof currentOffsets === "number") {
            for (const edge of base.edges) {
              nextOffsets[edge.id] = currentOffsets;
            }
          } else if (currentOffsets && typeof currentOffsets === "object") {
            nextOffsets = { ...currentOffsets };
          }

          if (isRemoveIntent) {
            if (nextOffsets[edgeId] && nextOffsets[edgeId] > 0) {
              delete nextOffsets[edgeId];
            }
          } else {
            nextOffsets[edgeId] = offsetValueCm;
          }

          if (Object.keys(nextOffsets).length === 0) {
            if (isRemoveIntent) {
              setFigures((prev) =>
                prev.filter((f) => f.id !== existingSeam.id)
              );
            }
            return;
          }

          const updated = recomputeSeamFigure(base, existingSeam, nextOffsets);
          if (updated) {
            setFigures((prev) =>
              prev.map((f) => (f.id === existingSeam.id ? updated : f))
            );
            sendDebugLog({
              type: "seam-applied",
              payload: {
                mode: "per-edge",
                baseId,
                edgeId,
                offsetCm: nextOffsets,
                seamSegments: updated.seamSegments ?? null,
                seamSegmentEdgeIds: updated.seamSegmentEdgeIds ?? null,
                nodes: updated.nodes.map((n) => ({
                  id: n.id,
                  x: n.x,
                  y: n.y,
                })),
              },
            });
          }
        } else {
          if (!isRemoveIntent) {
            const seam = makeSeamFigure(base, { [edgeId]: offsetValueCm });
            if (seam) {
              setFigures((prev) => [...prev, seam]);
              sendDebugLog({
                type: "seam-applied",
                payload: {
                  mode: "per-edge",
                  baseId,
                  edgeId,
                  offsetCm: { [edgeId]: offsetValueCm },
                  seamSegments: seam.seamSegments ?? null,
                  seamSegmentEdgeIds: seam.seamSegmentEdgeIds ?? null,
                  nodes: seam.nodes.map((n) => ({
                    id: n.id,
                    x: n.x,
                    y: n.y,
                  })),
                },
              });
            }
          }
        }
        return;
      }
      
      // Remove entire seam
      if (isRemoveIntent) {
        if (existingSeam) {
          setFigures((prev) =>
            prev.filter((f) => !(f.kind === "seam" && f.parentId === baseId))
          );
        }
        return;
      }
      
      // Update existing seam
      if (existingSeam) {
        const updated = recomputeSeamFigure(base, existingSeam, offsetValueCm);
        if (updated) {
          setFigures((prev) =>
            prev.map((f) => (f.id === existingSeam.id ? updated : f))
          );
          sendDebugLog({
            type: "seam-applied",
            payload: {
              mode: "full",
              baseId,
              offsetCm: offsetValueCm,
              seamSegments: updated.seamSegments ?? null,
              seamSegmentEdgeIds: updated.seamSegmentEdgeIds ?? null,
              nodes: updated.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
            },
          });
        }
        return;
      }
      
      // Create new seam
      const seam = makeSeamFigure(base, offsetValueCm);
      if (!seam) return;
      setFigures((prev) => [...prev, seam]);
      sendDebugLog({
        type: "seam-applied",
        payload: {
          mode: "full",
          baseId,
          offsetCm: offsetValueCm,
          seamSegments: seam.seamSegments ?? null,
          seamSegmentEdgeIds: seam.seamSegmentEdgeIds ?? null,
          nodes: seam.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
        },
      });
      return;
    }

    if (tool === "pique" && e.evt.button === 0) {
      // Remove mode: hovering an existing pique highlights it in red.
      if (hoveredPique) {
        const { figureId, piqueId } = hoveredPique;
        setFigures((prev) =>
          prev.map((f) => {
            if (f.id !== figureId) return f;
            const next = (f.piques ?? []).filter((p) => p.id !== piqueId);
            return next.length !== (f.piques ?? []).length
              ? { ...f, piques: next }
              : f;
          })
        );
        return;
      }

      const precisionSnap = modifierKeys.meta || modifierKeys.ctrl;
      const midLock = !!e.evt.altKey;

      // Prefer the hovered edge; fallback to a direct hit-test.
      let hitEdge = hoveredEdge;
      let fig: Figure | null = hitEdge
        ? (figures.find((f) => f.id === hitEdge!.figureId) ?? null)
        : null;

      if (!hitEdge || !fig) {
        const thresholdWorld = 10 / scale;
        const figId = findHoveredFigureId(figures, world, thresholdWorld);
        fig = figId ? (figures.find((f) => f.id === figId) ?? null) : null;
        if (!fig || fig.kind === "seam") return;
        const local = worldToFigureLocal(fig, world);
        const hit = findNearestEdge(fig, local);
        if (!hit.best || hit.bestDist > thresholdWorld) return;
        hitEdge = hit.best;
      }

      if (!fig || fig.kind === "seam") return;
      if (!fig.closed) {
        toast("Pique só funciona em figuras fechadas.", "error");
        return;
      }

      const edge = fig.edges.find((ed) => ed.id === hitEdge.edgeId) ?? null;
      if (!edge) return;

      const pts = edgeLocalPoints(fig, edge, edge.kind === "line" ? 2 : 160);
      if (pts.length < 2) return;

      // Compute arc-length position and snap within the active segment (pseudo-edge).
      const split = splitPolylineAtPoint(pts, hitEdge.pointLocal);
      if (!split || split.totalLengthPx < 1e-6) return;

      const total = split.totalLengthPx;
      const sCursor = split.leftLengthPx;

      const tBreaks = getPiqueEdgeBreakpointsT01(fig, edge.id);
      const breaksS = [0, ...tBreaks.map((t) => t * total), total];
      const { s0, s1 } = pickActiveSegmentS(breaksS, sCursor);

      let sSnap = sCursor;
      if (midLock) {
        sSnap = (s0 + s1) / 2;
      } else if (precisionSnap) {
        sSnap = Math.floor(sCursor / PX_PER_MM) * PX_PER_MM;
        sSnap = clamp(sSnap, s0, s1);
      }

      const at = pointAndTangentAtArcLength(pts, sSnap);
      if (!at) return;

      const t01 = clamp(sSnap / total, 0, 1);

      // Choose the notch direction so it points inward.
      const polyFlat = figureLocalPolyline(fig, 120);
      const poly: Vec2[] = [];
      for (let i = 0; i < polyFlat.length - 1; i += 2) {
        poly.push({ x: polyFlat[i], y: polyFlat[i + 1] });
      }
      if (poly.length < 3) {
        toast("Pique só funciona em figuras fechadas.", "error");
        return;
      }

      const n = norm(perp(at.tangentUnit));
      const eps = 2 * PX_PER_MM;
      const test = add(at.point, mul(n, eps));
      const side: 1 | -1 = pointInPolygon(test, poly) ? 1 : -1;

      const newPiqueId = id("pique");

      setFigures((prev) =>
        prev.map((f) => {
          if (f.id !== fig!.id) return f;
          return {
            ...f,
            piques: [
              ...(f.piques ?? []),
              {
                id: newPiqueId,
                edgeId: edge.id,
                t01,
                lengthCm: 0.5,
                side,
              },
            ],
          };
        })
      );

      return;
    }

    if (tool === "dart") {
      if (!dartDraft) {
        const precisionSnap =
          !!e.evt.metaKey ||
          !!e.evt.ctrlKey ||
          modifierKeys.meta ||
          modifierKeys.ctrl;

        // Allow starting a dart on an unselected figure: click selects + marks point A.
        let hitEdge = hoveredEdge;
        if (!hitEdge) {
          const thresholdWorld = 10 / scale;
          const figId = findHoveredFigureId(figures, world, thresholdWorld);
          const fig = figId
            ? (figures.find((f) => f.id === figId) ?? null)
            : null;
          if (!fig || fig.kind === "seam") return;

          const local = worldToFigureLocal(fig, world);
          const hit = findNearestEdge(fig, local);
          if (!hit.best || hit.bestDist > thresholdWorld) return;
          hitEdge = hit.best;

          if (precisionSnap) {
            const edge =
              fig.edges.find((ed) => ed.id === hitEdge!.edgeId) ?? null;
            const fromNode = edge
              ? getNodeById(fig.nodes, edge.from)
              : undefined;
            if (fromNode) {
              if (!hitEdge) return;
              hitEdge = quantizeEdgeHoverByChordLengthFloor(
                fig,
                hitEdge,
                { x: fromNode.x, y: fromNode.y },
                PX_PER_MM
              );
            }
          }
        }

        if (!hitEdge) return;

        const targetFigure =
          figures.find((f) => f.id === hitEdge.figureId) ?? null;
        if (!targetFigure) return;
        if (targetFigure.kind === "seam") return;

        const splitA = splitFigureEdge(targetFigure, hitEdge.edgeId, hitEdge.t);
        if (!splitA.newNodeId) return;

        setFigures((prev) =>
          applySplitResultToFigureSet(prev, targetFigure.id, splitA)
        );

        setSelectedFigureIds([targetFigure.id]);
        setSelectedFigureId(targetFigure.id);

        setDartDraft({
          figureId: targetFigure.id,
          step: "pickB",
          aNodeId: splitA.newNodeId,
          bNodeId: null,
          shiftKey: false,
          shiftLockDirLocal: null,
          precisionSnap,
          currentWorld: worldForTool,
        });
        return;
      }

      if (dartDraft.step === "pickB") {
        if (!selectedFigure) return;
        if (!hoveredEdge || hoveredEdge.figureId !== selectedFigure.id) return;

        const aLocal = getFigureNodePoint(selectedFigure, dartDraft.aNodeId);
        if (!aLocal) return;
        if (dist(aLocal, hoveredEdge.pointLocal) < 6) return;

        const splitB = splitFigureEdge(
          selectedFigure,
          hoveredEdge.edgeId,
          hoveredEdge.t
        );
        if (!splitB.newNodeId) return;

        setFigures((prev) =>
          applySplitResultToFigureSet(prev, selectedFigure.id, splitB)
        );

        setDartDraft({
          ...dartDraft,
          step: "pickApex",
          bNodeId: splitB.newNodeId,
          shiftKey: false,
          shiftLockDirLocal: null,
          currentWorld: worldForTool,
        });
        return;
      }

      // pickApex
      if (!selectedFigure) return;
      const aLocal = getFigureNodePoint(selectedFigure, dartDraft.aNodeId);
      const bLocal = dartDraft.bNodeId
        ? getFigureNodePoint(selectedFigure, dartDraft.bNodeId)
        : null;
      if (!aLocal || !bLocal) return;

      const local = worldToFigureLocal(selectedFigure, worldForTool);
      const rawApexLocal = local;
      const precisionSnap =
        !!e.evt.metaKey ||
        !!e.evt.ctrlKey ||
        modifierKeys.meta ||
        modifierKeys.ctrl;
      const apexLocal = resolveDartApexLocal(
        selectedFigure,
        dartDraft,
        rawApexLocal,
        precisionSnap
      );

      const cNodeId = id("n");
      const dartId = id("dart");

      setFigures((prev) =>
        prev.map((f) => {
          if (f.id !== selectedFigure.id) return f;
          return {
            ...f,
            nodes: [
              ...f.nodes,
              {
                id: cNodeId,
                x: apexLocal.x,
                y: apexLocal.y,
                mode: "corner",
              },
            ],
            darts: [
              ...(f.darts ?? []),
              {
                id: dartId,
                aNodeId: dartDraft.aNodeId,
                bNodeId: dartDraft.bNodeId!,
                cNodeId,
              },
            ],
          };
        })
      );
      setDartDraft(null);
      return;
    }

    if (
      tool === "node" &&
      e.evt.button === 0 &&
      selectedFigureId &&
      selectedFigure &&
      selectedFigure.id === selectedFigureId
    ) {
      const local = worldToFigureLocal(selectedFigure, world);
      const nodeThreshold = 10 / scale;
      const edgeThreshold = 12 / scale;

      if (hoveredEdge && hoveredEdge.figureId === selectedFigureId) {
        const hoverDist = dist(local, hoveredEdge.pointLocal);
        if (hoverDist <= edgeThreshold * 2) {
          const now = Date.now();
          if (now - lastNodeClickLogRef.current > 150) {
            lastNodeClickLogRef.current = now;
            sendDebugLog({
              type: "node-click",
              payload: {
                action: "split-hover",
                figureId: selectedFigureId,
                edgeId: hoveredEdge.edgeId,
                edgeThreshold,
                hoverDist,
                local,
                world,
                client: { x: e.evt.clientX, y: e.evt.clientY },
                stage: { x: pos.x, y: pos.y },
                t: hoveredEdge.t,
              },
            });
          }

          const res = splitFigureEdge(
            selectedFigure,
            hoveredEdge.edgeId,
            hoveredEdge.t
          );
          setFigures((prev) =>
            applySplitResultToFigureSet(prev, selectedFigureId, res)
          );
          if (res.newNodeId) {
            setNodeSelection({
              figureId: selectedFigureId,
              nodeId: res.newNodeId,
              handle: null,
            });
            setHoveredEdge(null);
          }
          return;
        }
      }

      let nearestNodeId: string | null = null;
      let nearestNodeDist = Number.POSITIVE_INFINITY;
      for (const n of selectedFigure.nodes) {
        const d = dist(local, { x: n.x, y: n.y });
        if (d < nearestNodeDist) {
          nearestNodeDist = d;
          nearestNodeId = n.id;
        }
      }

      const strongNodeThreshold = 6 / scale;
      const preferSplitOnHover =
        hoveredEdge && hoveredEdge.figureId === selectedFigureId;

      if (
        nearestNodeId &&
        nearestNodeDist <= nodeThreshold &&
        (!preferSplitOnHover || nearestNodeDist <= strongNodeThreshold)
      ) {
        const now = Date.now();
        if (now - lastNodeClickLogRef.current > 150) {
          lastNodeClickLogRef.current = now;
          sendDebugLog({
            type: "node-click",
            payload: {
              action: "select-node",
              figureId: selectedFigureId,
              nodeId: nearestNodeId,
              nodeDist: nearestNodeDist,
              nodeThreshold,
              strongNodeThreshold,
              preferSplitOnHover,
              local,
              world,
              client: { x: e.evt.clientX, y: e.evt.clientY },
              stage: { x: pos.x, y: pos.y },
            },
          });
        }
        setNodeSelection({
          figureId: selectedFigureId,
          nodeId: nearestNodeId,
          handle: null,
        });
        setHoveredEdge(null);
        return;
      }

      const hit = findNearestEdge(selectedFigure, local);
      const edgePick = hit.best;
      const hoverDist =
        preferSplitOnHover && hoveredEdge
          ? dist(local, hoveredEdge.pointLocal)
          : null;
      const now = Date.now();
      if (now - lastNodeClickLogRef.current > 150) {
        lastNodeClickLogRef.current = now;
        sendDebugLog({
          type: "node-click",
          payload: {
            action: "split-attempt",
            figureId: selectedFigureId,
            edgeId: edgePick?.edgeId ?? null,
            bestDist: hit.bestDist,
            edgeThreshold,
            hoverDist,
            usedHover: false,
            local,
            world,
            client: { x: e.evt.clientX, y: e.evt.clientY },
            stage: { x: pos.x, y: pos.y },
            t: edgePick?.t ?? null,
          },
        });
      }
      if (!edgePick || hit.bestDist > edgeThreshold) return;

      // Avoid calling setState (Canvas) inside the figures state updater (EditorProvider).
      const res = splitFigureEdge(
        selectedFigure,
        edgePick.edgeId,
        edgePick.t
      );
      setFigures((prev) =>
        applySplitResultToFigureSet(prev, selectedFigureId, res)
      );
      if (res.newNodeId) {
        setNodeSelection({
          figureId: selectedFigureId,
          nodeId: res.newNodeId,
          handle: null,
        });
        setHoveredEdge(null);
      }
      return;
    }

    if (tool === "curve") {
      const CLOSE_TOL_PX = 10;
      const closeTolWorld = CLOSE_TOL_PX / scale;

      const joinIndex = curveDraft ? curveDraft.pointsWorld.length : 0;

      const joinTolWorld =
        Math.max(6, Math.max(12, measureSnapStrengthPx) * 0.5) / scale;
      const snapKind = resolvedDown.snap.isSnapped ? resolvedDown.snap.kind : null;
      const joinKind =
        snapKind === "node" || snapKind === "edge" ? snapKind : null;
      const joinHit =
        magnetJoinEnabled &&
        resolvedDown.snap.isSnapped &&
        resolvedDown.snap.figureId &&
        joinKind &&
        dist(world, resolvedDown.snap.pointWorld) <= joinTolWorld
          ? {
              figureId: resolvedDown.snap.figureId,
              // Use the actual snap point on the target figure, not the tool point
              pointWorld: resolvedDown.snap.pointWorld,
              pointIndex: joinIndex,
              kind: joinKind,
            }
          : null;

      if (!curveDraft) {
        setCurveDraft({
          pointsWorld: [worldForTool],
          currentWorld: null,
          joinHits: [joinHit],
        });
        sendDebugLog({
          type: "draw-point",
          payload: {
            tool: "curve",
            pointIndex: 0,
            pointWorld: worldForTool,
            snapped: resolvedDown.snap.isSnapped ?? false,
            snapKind: resolvedDown.snap.isSnapped ? resolvedDown.snap.kind : null,
            snapFigureId: resolvedDown.snap.isSnapped
              ? resolvedDown.snap.figureId ?? null
              : null,
          },
        });
        return;
      }

      const pts = curveDraft.pointsWorld;
      const first = pts[0];
      const last = pts[pts.length - 1];

      const precisionSnap = modifierKeys.meta || modifierKeys.ctrl;
      const placedWorld =
        !resolvedDown.snap.isSnapped && precisionSnap && last
          ? snapPointAlongDirFloor(
              worldForTool,
              last,
              sub(worldForTool, last),
              PX_PER_MM
            )
          : !resolvedDown.snap.isSnapped && precisionSnap
            ? snapWorldToStepPxFloor(worldForTool, PX_PER_MM)
            : worldForTool;

      // Allow closing even with magnetJoin enabled when clicking on the first point
      // of the current figure (self-close). This makes sense UX-wise because the user
      // is clicking on THEIR OWN starting point, not trying to join another figure.
      const canClose = pts.length >= 3;
      const isCloseClick =
        canClose && dist(placedWorld, first) <= closeTolWorld;

      if (isCloseClick) {
        const finalized = makeCurveFromPoints(pts, true, "aci7");
        if (finalized) {
          const hits = curveDraft.joinHits.filter(
            (h): h is JoinHit => !!h
          );
          addFigureWithOptionalMerge(finalized, hits);
        }
        setCurveDraft(null);
        return;
      }

      if (last && dist(placedWorld, last) < 0.5) {
        // Ignore near-duplicate clicks.
        setCurveDraft((prev) =>
          prev ? { ...prev, currentWorld: placedWorld } : prev
        );
        return;
      }

      setCurveDraft((prev) =>
        prev
          ? {
              pointsWorld: [...prev.pointsWorld, placedWorld],
              currentWorld: placedWorld,
              joinHits: [...prev.joinHits, joinHit],
            }
          : {
              pointsWorld: [placedWorld],
              currentWorld: placedWorld,
              joinHits: [joinHit],
            }
      );
      sendDebugLog({
        type: "draw-point",
        payload: {
          tool: "curve",
          pointIndex: curveDraft.pointsWorld.length,
          pointWorld: placedWorld,
          snapped: resolvedDown.snap.isSnapped ?? false,
          snapKind: resolvedDown.snap.isSnapped ? resolvedDown.snap.kind : null,
          snapFigureId: resolvedDown.snap.isSnapped
            ? resolvedDown.snap.figureId ?? null
            : null,
        },
      });
      return;
    }

    if (tool === "line") {
      const CLOSE_TOL_PX = 10;
      const closeTolWorld = CLOSE_TOL_PX / scale;
      const current = lineDraftRef.current;
      const joinIndex = current ? current.pointsWorld.length : 0;

      const joinTolWorld =
        Math.max(6, Math.max(12, measureSnapStrengthPx) * 0.5) / scale;
      const snapKind = resolvedDown.snap.isSnapped ? resolvedDown.snap.kind : null;
      const joinKind =
        snapKind === "node" || snapKind === "edge" ? snapKind : null;
      const joinHit =
        magnetJoinEnabled &&
        resolvedDown.snap.isSnapped &&
        resolvedDown.snap.figureId &&
        joinKind &&
        dist(world, resolvedDown.snap.pointWorld) <= joinTolWorld
          ? {
              figureId: resolvedDown.snap.figureId,
              // Use the actual snap point on the target figure, not the tool point
              pointWorld: resolvedDown.snap.pointWorld,
              pointIndex: joinIndex,
              kind: joinKind,
            }
          : null;

      if (!current) {
        const nextDraft = {
          pointsWorld: [worldForTool],
          currentWorld: null,
          joinHits: [joinHit],
        };
        lineDraftRef.current = nextDraft;
        setLineDraft(nextDraft);
        sendDebugLog({
          type: "draw-point",
          payload: {
            tool: "line",
            pointIndex: 0,
            pointWorld: worldForTool,
            snapped: resolvedDown.snap.isSnapped ?? false,
            snapKind: resolvedDown.snap.isSnapped ? resolvedDown.snap.kind : null,
            snapFigureId: resolvedDown.snap.isSnapped
              ? resolvedDown.snap.figureId ?? null
              : null,
          },
        });
        return;
      }

      const pts = current.pointsWorld;
      const first = pts[0];
      const last = pts[pts.length - 1];
      let placedWorld =
        !resolvedDown.snap.isSnapped && e.evt.shiftKey && last
          ? applyLineAngleLock(last, worldForTool)
          : worldForTool;

      const precisionSnap = modifierKeys.meta || modifierKeys.ctrl;
      if (!resolvedDown.snap.isSnapped && precisionSnap && last) {
        if (e.evt.shiftKey) {
          const dir = sub(placedWorld, last);
          placedWorld = snapPointAlongDirFloor(
            placedWorld,
            last,
            dir,
            PX_PER_MM
          );
        } else {
          placedWorld = snapWorldRelativeToRefFloor(
            placedWorld,
            last,
            PX_PER_MM
          );
        }
      }

      // Allow closing even with magnetJoin enabled when clicking on the first point
      // of the current figure (self-close). This makes sense UX-wise because the user
      // is clicking on THEIR OWN starting point, not trying to join another figure.
      const canClose = pts.length >= 3;
      const isCloseClick =
        canClose && dist(placedWorld, first) <= closeTolWorld;

      if (isCloseClick) {
        const closedFig = makePolylineLineFigure(pts, true, "aci7");
        if (closedFig) {
          const hits = current.joinHits.filter(
            (h): h is JoinHit => !!h
          );
          addFigureWithOptionalMerge(closedFig, hits);
        }
        lineDraftRef.current = null;
        setLineDraft(null);
        return;
      }

      if (!resolvedDown.snap.isSnapped && e.evt.altKey && pts.length === 1) {
        // "Desenhar a partir do centro" (primeiro segmento): o 1º clique é o centro,
        // o 2º clique define o vetor (meio comprimento).
        const center = pts[0];
        const v = sub(placedWorld, center);
        if (len(v) < 0.5) {
          const nextDraft = { ...current, currentWorld: placedWorld };
          lineDraftRef.current = nextDraft;
          setLineDraft(nextDraft);
          return;
        }

        const a = sub(center, v);
        const b = add(center, v);
        const nextDraft = {
          pointsWorld: [a, b],
          currentWorld: b,
          joinHits: [current.joinHits[0] ?? null, joinHit],
        };
        lineDraftRef.current = nextDraft;
        setLineDraft(nextDraft);
        sendDebugLog({
          type: "draw-point",
          payload: {
            tool: "line",
            pointIndex: 0,
            pointWorld: a,
            snapped: false,
            snapKind: null,
            snapFigureId: null,
          },
        });
        sendDebugLog({
          type: "draw-point",
          payload: {
            tool: "line",
            pointIndex: 1,
            pointWorld: b,
            snapped: false,
            snapKind: null,
            snapFigureId: null,
          },
        });
        return;
      }

      if (dist(placedWorld, last) < 0.5) {
        // Ignore near-duplicate clicks.
        const nextDraft = { ...current, currentWorld: placedWorld };
        lineDraftRef.current = nextDraft;
        setLineDraft(nextDraft);
        return;
      }

      const nextDraft = {
        pointsWorld: [...pts, placedWorld],
        currentWorld: placedWorld,
        joinHits: [...current.joinHits, joinHit],
      };
      lineDraftRef.current = nextDraft;
      setLineDraft(nextDraft);
      sendDebugLog({
        type: "draw-point",
        payload: {
          tool: "line",
          pointIndex: pts.length,
          pointWorld: placedWorld,
          snapped: resolvedDown.snap.isSnapped ?? false,
          snapKind: resolvedDown.snap.isSnapped ? resolvedDown.snap.kind : null,
          snapFigureId: resolvedDown.snap.isSnapped
            ? resolvedDown.snap.figureId ?? null
            : null,
        },
      });
      return;
    }

    if (tool === "rectangle" || tool === "circle") {
      const mods: DraftMods = { shift: e.evt.shiftKey, alt: e.evt.altKey };
      const effective = computeRectLikeCorners(
        worldForTool,
        worldForTool,
        mods
      );
      setDraft({
        tool,
        startWorld: worldForTool,
        currentWorld: worldForTool,
        effectiveAWorld: effective.a,
        effectiveBWorld: effective.b,
        mods,
      });
    }
  };

  const handlePointerMove = (
    e: Konva.KonvaEventObject<PointerEvent | MouseEvent>
  ) => {
    const stage = stageRef.current;
    if (!stage) return;

    stage.setPointersPositions(e.evt);
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (isPanning) {
      e.evt.preventDefault();
      // Movement is handled by global pointer/mouse move listeners while panning.
      return;
    }

    const world = {
      x: (pos.x - position.x) / scale,
      y: (pos.y - position.y) / scale,
    };

    if (tool === "select" && handleSelectDirectDragMove(world)) {
      return;
    }

    // Cursor badge: keep native cursor, but show a small tool icon near it.
    const activeEl = document.activeElement;
    const isTyping =
      activeEl instanceof HTMLElement &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.tagName === "SELECT" ||
        activeEl.isContentEditable);

    const shouldShowCursorBadge =
      isToolCursorOverlayEnabled(tool) &&
      !isPanning &&
      !isTyping &&
      !isPointerDownRef.current;

    if (shouldShowCursorBadge) {
      cursorBadgeLastPosRef.current = { x: pos.x, y: pos.y };
      // Hide immediately on move if visible
      setCursorBadge((prev) => (prev ? null : prev));
      // Schedule show after delay
      scheduleCursorBadgeIdleShow();
    } else {
      cursorBadgeLastPosRef.current = null;
      hideCursorBadge();
    }

    const nextEdgeSelectMode =
      tool === "select" && (e.evt.metaKey || e.evt.ctrlKey);
    if (edgeSelectMode !== nextEdgeSelectMode) {
      setEdgeSelectMode(nextEdgeSelectMode);
    }

    if (tool === "select") {
      const thresholdWorld = 10 / scale;
      const edgeThresholdWorld = 14 / scale;
      if (nextEdgeSelectMode) {
        const hit = findNearestEdgeAcrossFigures(
          figures,
          world,
          edgeThresholdWorld
        );
        setHoveredSelectEdge(
          hit ? { figureId: hit.figure.id, edgeId: hit.edge.id } : null
        );

        if (hoveredSelectFigureId) setHoveredSelectFigureId(null);
      } else {
        if (hoveredSelectEdge) setHoveredSelectEdge(null);
        const hitId = findHoveredFigureId(figures, world, thresholdWorld);
        const insideId = hitId
          ? null
          : findHoveredClosedFigureOrSeamBaseId(
              figures,
              world,
              60,
              thresholdWorld
            );
        const nextHoveredId = hitId ?? insideId;
        setHoveredSelectFigureId((prev) =>
          prev === nextHoveredId ? prev : nextHoveredId
        );
      }
    } else {
      if (hoveredSelectFigureId) setHoveredSelectFigureId(null);
      if (hoveredSelectEdge) setHoveredSelectEdge(null);
      if (edgeSelectMode) setEdgeSelectMode(false);
    }

    if (tool === "offset") {
      const thresholdWorld = 10 / scale;
      const hitId = findHoveredFigureId(figures, world, thresholdWorld);

      const hit = hitId ? (figures.find((f) => f.id === hitId) ?? null) : null;
      const hitBaseId = hit?.kind === "seam" ? (hit.parentId ?? null) : hitId;

      // If we didn't hit an edge/line, allow hover anywhere inside a closed figure.
      const insideId = hitBaseId
        ? null
        : findHoveredClosedFigureOrSeamBaseId(
            figures,
            world,
            60,
            thresholdWorld
          );

      const baseId = hitBaseId ?? insideId;
      setHoveredOffsetBaseId((prev) => (prev === baseId ? prev : baseId));
      setOffsetRemoveMode(e.evt.metaKey || e.evt.ctrlKey);

      if (baseId) {
        const base = figures.find((f) => f.id === baseId) ?? null;
        if (base && (base.closed || hasClosedLoop(base))) {
          const local = worldToFigureLocal(base, world);
          const outerEdgeIds = getOuterLoopEdgeIds(base);
          const hitEdge = findNearestEdgeInSet(base, local, outerEdgeIds);
          if (hitEdge.best && hitEdge.bestDist <= thresholdWorld) {
            setHoveredOffsetEdge(
              outerEdgeIds.has(hitEdge.best.edgeId)
                ? { figureId: baseId, edgeId: hitEdge.best.edgeId }
                : null
            );
          } else {
            setHoveredOffsetEdge(null);
          }
        } else if (hoveredOffsetEdge) {
          setHoveredOffsetEdge(null);
        }
      } else if (hoveredOffsetEdge) {
        setHoveredOffsetEdge(null);
      }
    } else if (hoveredOffsetBaseId) {
      setHoveredOffsetBaseId(null);
      if (hoveredOffsetEdge) setHoveredOffsetEdge(null);
      if (offsetRemoveMode) setOffsetRemoveMode(false);
    }

    if (measureDisplayMode !== "never") {
      const thresholdWorld = 10 / scale;
      const figId = findHoveredFigureId(figures, world, thresholdWorld);
      const fig = figId ? figures.find((f) => f.id === figId) : null;

      if (fig) {
        const local = worldToFigureLocal(fig, world);
        const hit = findNearestEdge(fig, local);
        setHoveredMeasureEdge(
          hit.best && hit.bestDist <= thresholdWorld
            ? { figureId: fig.id, edgeId: hit.best.edgeId }
            : null
        );
      } else if (hoveredMeasureEdge) {
        setHoveredMeasureEdge(null);
      }
    } else if (hoveredMeasureEdge) {
      setHoveredMeasureEdge(null);
    }

    if (tool === "select" && marqueeDraft) {
      setMarqueeDraft((prev) =>
        prev ? { ...prev, currentWorld: world } : prev
      );
      return;
    }

    const resolvedMove = getSnappedWorldForTool(world, "move");
    const worldForToolRaw = resolvedMove.world;
    const precisionSnap =
      !!e.evt.metaKey ||
      !!e.evt.ctrlKey ||
      modifierKeys.meta ||
      modifierKeys.ctrl;
    const worldForTool = worldForToolRaw;

    if (tool !== "measure") {
      if (
        resolvedMove.snap.isSnapped &&
        (magnetEnabled || magnetJoinEnabled) &&
        (tool === "line" ||
          tool === "rectangle" ||
          tool === "circle" ||
          tool === "curve")
      ) {
        setMagnetSnap({
          pointWorld: resolvedMove.snap.pointWorld,
          kind: resolvedMove.snap.kind,
        });
      } else if (magnetSnap) {
        setMagnetSnap(null);
      }
    }

    if (measureDisplayMode === "hover" || nodesDisplayMode === "hover") {
      const thresholdWorld = 10 / scale;
      const hitId = findHoveredFigureId(figures, world, thresholdWorld);
      // If we didn't hit the contour, allow hover anywhere inside a closed figure.
      const insideId = hitId
        ? null
        : findHoveredClosedFigureOrSeamBaseId(
            figures,
            world,
            60,
            thresholdWorld
          );
      const nextHoveredId = hitId ?? insideId;
      setHoveredFigureId((prev) =>
        prev === nextHoveredId ? prev : nextHoveredId
      );
    } else if (hoveredFigureId) {
      setHoveredFigureId(null);
    }

    if (tool === "dart") {
      const thresholdWorld = 10 / scale;
      const targetFigure = dartDraft
        ? (figures.find((f) => f.id === dartDraft.figureId) ?? null)
        : (() => {
            const figId = findHoveredFigureId(figures, world, thresholdWorld);
            const fig = figId
              ? (figures.find((f) => f.id === figId) ?? null)
              : null;
            if (!fig || fig.kind === "seam") return null;
            return fig;
          })();

      if (!targetFigure) {
        if (hoveredEdge) setHoveredEdge(null);
      } else {
        const local = worldToFigureLocal(targetFigure, world);
        const hit = findNearestEdge(targetFigure, local);

        if (!hit.best || hit.bestDist > thresholdWorld) {
          if (hoveredEdge) setHoveredEdge(null);
        } else {
          let best = hit.best;

          // Cmd/Ctrl high precision for point A (pre-draft): quantize the candidate point
          // so the preview matches the actual split when clicking.
          if (!dartDraft && precisionSnap) {
            const edge =
              targetFigure.edges.find((ed) => ed.id === best.edgeId) ?? null;
            const fromNode = edge
              ? getNodeById(targetFigure.nodes, edge.from)
              : undefined;
            if (fromNode) {
              best = quantizeEdgeHoverByChordLengthFloor(
                targetFigure,
                best,
                { x: fromNode.x, y: fromNode.y },
                PX_PER_MM
              );
            }
          }

          // Cmd/Ctrl high precision for point B (pickB) is handled similarly.
          if (
            dartDraft?.step === "pickB" &&
            precisionSnap &&
            best.figureId === dartDraft.figureId
          ) {
            const aLocal = selectedFigure
              ? getFigureNodePoint(selectedFigure, dartDraft.aNodeId)
              : null;
            if (aLocal) {
              best = quantizeEdgeHoverByChordLengthFloor(
                targetFigure,
                best,
                aLocal,
                PX_PER_MM
              );
            }
          }

          setHoveredEdge(best);
        }
      }

      // Keep the dart draft in sync while placing the apex.
      if (dartDraft && targetFigure && dartDraft.step === "pickApex") {
        const shiftKey = !!e.evt.shiftKey;
        setDartDraft((prev) =>
          prev
            ? {
                ...prev,
                currentWorld: worldForToolRaw,
                shiftKey,
                shiftLockDirLocal: null,
                precisionSnap,
              }
            : prev
        );
      } else if (dartDraft) {
        // While picking B, avoid carrying shift state.
        setDartDraft((prev) =>
          prev && prev.step !== "pickApex"
            ? {
                ...prev,
                currentWorld: worldForToolRaw,
                shiftKey: false,
                shiftLockDirLocal: null,
                precisionSnap,
              }
            : prev
        );
      }
    }

    if (tool === "pique") {
      const edgeThresholdWorld = 10 / scale;
      const piqueThresholdWorld = 8 / scale;

      const pk = findHoveredPique(
        figures,
        worldForToolRaw,
        piqueThresholdWorld
      );
      if (pk) {
        if (
          !hoveredPique ||
          hoveredPique.figureId !== pk.figureId ||
          hoveredPique.piqueId !== pk.piqueId
        ) {
          setHoveredPique(pk);
        }
        if (hoveredEdge) setHoveredEdge(null);
      } else {
        if (hoveredPique) setHoveredPique(null);

        const figId = findHoveredFigureId(figures, world, edgeThresholdWorld);
        const fig = figId
          ? (figures.find((f) => f.id === figId) ?? null)
          : null;
        if (!fig || fig.kind === "seam") {
          if (hoveredEdge) setHoveredEdge(null);
        } else {
          const local = worldToFigureLocal(fig, world);
          const hit = findNearestEdge(fig, local);
          if (!hit.best || hit.bestDist > edgeThresholdWorld) {
            if (hoveredEdge) setHoveredEdge(null);
          } else {
            let best = hit.best;

            const edge = fig.edges.find((e) => e.id === best.edgeId) ?? null;
            if (edge) {
              const pts = edgeLocalPoints(
                fig,
                edge,
                edge.kind === "line" ? 2 : 160
              );
              const split = splitPolylineAtPoint(pts, best.pointLocal);
              if (split && split.totalLengthPx > 1e-6) {
                const total = split.totalLengthPx;
                const sCursor = split.leftLengthPx;

                const tBreaks = getPiqueEdgeBreakpointsT01(fig, edge.id);
                const breaksS = [0, ...tBreaks.map((t) => t * total), total];
                const { s0, s1 } = pickActiveSegmentS(breaksS, sCursor);

                const midLock = !!e.evt.altKey;
                let sSnap = sCursor;
                if (midLock) {
                  sSnap = (s0 + s1) / 2;
                } else if (precisionSnap) {
                  sSnap = Math.floor(sCursor / PX_PER_MM) * PX_PER_MM;
                  sSnap = clamp(sSnap, s0, s1);
                }

                const at = pointAndTangentAtArcLength(pts, sSnap);
                if (at) {
                  best = {
                    ...best,
                    t: clamp(sSnap / total, 0, 1),
                    pointLocal: at.point,
                    snapKind: midLock ? "mid" : undefined,
                  };
                }
              }
            }

            setHoveredEdge(best);
          }
        }
      }
    }

    if (tool === "mirror") {
      const thresholdWorld = 10 / scale;
      const figId = findHoveredFigureId(figures, world, thresholdWorld);
      const fig = figId ? (figures.find((f) => f.id === figId) ?? null) : null;
      if (!fig || fig.kind === "seam") {
        if (hoveredEdge) setHoveredEdge(null);
      } else {
        const local = worldToFigureLocal(fig, world);
        const hit = findNearestEdge(fig, local);
        if (!hit.best || hit.bestDist > thresholdWorld) {
          if (hoveredEdge) setHoveredEdge(null);
        } else {
          setHoveredEdge(hit.best);
        }
      }
    } else if (tool !== "dart" && tool !== "node" && tool !== "pique") {
      if (hoveredEdge) setHoveredEdge(null);
    }

    if (tool === "unfold") {
      const thresholdWorld = 10 / scale;
      const hitId = findHoveredFigureId(figures, world, thresholdWorld);
      const insideId = hitId
        ? null
        : findHoveredClosedFigureOrSeamBaseId(
            figures,
            world,
            60,
            thresholdWorld
          );
      const baseId = hitId ?? insideId;
      const fig = baseId
        ? (figures.find((f) => f.id === baseId) ?? null)
        : null;

      const nextId = fig?.mirrorLink ? fig.id : null;
      setHoveredMirrorLinkFigureId((prev) => (prev === nextId ? prev : nextId));
    } else if (hoveredMirrorLinkFigureId) {
      setHoveredMirrorLinkFigureId(null);
    }

    if (tool === "node" && selectedFigure) {
      const local = worldToFigureLocal(selectedFigure, world);

      // In node tool: if we're near an existing node, prioritize it over edge splitting.
      if (tool === "node") {
        const threshold = 10 / scale;
        let bestId: string | null = null;
        let bestD = Number.POSITIVE_INFINITY;
        for (const n of selectedFigure.nodes) {
          const d = dist(local, { x: n.x, y: n.y });
          if (d < bestD) {
            bestD = d;
            bestId = n.id;
          }
        }

        if (bestId && bestD <= threshold) {
          if (hoveredNodeId !== bestId) setHoveredNodeId(bestId);
          if (hoveredEdge) setHoveredEdge(null);
          return;
        }

        if (hoveredNodeId) setHoveredNodeId(null);
      }

      const hit = findNearestEdge(selectedFigure, local);
      const threshold = 10 / scale;

      if (!hit.best || hit.bestDist > threshold) {
        setHoveredEdge(null);
        const now = Date.now();
        if (now - lastNodeHoverLogRef.current > 150) {
          lastNodeHoverLogRef.current = now;
          sendDebugLog({
            type: "node-hover",
            payload: {
              phase: "no-edge",
              figureId: selectedFigure.id,
              bestDist: hit.bestDist,
              thresholdWorld: threshold,
              local,
              world,
            },
          });
        }
        return;
      }

      // Node tool: Option/Alt locks split preview to the midpoint of a straight edge.
      if (tool === "node" && e.evt.altKey) {
        const edge = selectedFigure.edges.find(
          (ed) => ed.id === hit.best!.edgeId
        );
        if (edge) {
          const a = getNodeById(selectedFigure.nodes, edge.from);
          const b = getNodeById(selectedFigure.nodes, edge.to);
          if (a && b) {
            if (edge.kind === "line") {
              const mid = lerp({ x: a.x, y: a.y }, { x: b.x, y: b.y }, 0.5);
              setHoveredEdge({
                figureId: selectedFigure.id,
                edgeId: edge.id,
                t: 0.5,
                pointLocal: mid,
                snapKind: "mid",
              });
              return;
            }

            // Cubic: lock to parameter midpoint t=0.5 (good visual midpoint; not arc-length midpoint).
            const p0: Vec2 = { x: a.x, y: a.y };
            const p3: Vec2 = { x: b.x, y: b.y };
            const p1: Vec2 = a.outHandle
              ? { x: a.outHandle.x, y: a.outHandle.y }
              : p0;
            const p2: Vec2 = b.inHandle
              ? { x: b.inHandle.x, y: b.inHandle.y }
              : p3;
            const t = 0.5;
            const p01 = lerp(p0, p1, t);
            const p12 = lerp(p1, p2, t);
            const p23 = lerp(p2, p3, t);
            const p012 = lerp(p01, p12, t);
            const p123 = lerp(p12, p23, t);
            const p0123 = lerp(p012, p123, t);

            setHoveredEdge({
              figureId: selectedFigure.id,
              edgeId: edge.id,
              t,
              pointLocal: p0123,
              snapKind: "mid",
            });
            return;
          }
        }
      }

      setHoveredEdge(hit.best);
      const now = Date.now();
      if (now - lastNodeHoverLogRef.current > 150) {
        lastNodeHoverLogRef.current = now;
        sendDebugLog({
          type: "node-hover",
          payload: {
            phase: "edge",
            figureId: selectedFigure.id,
            edgeId: hit.best.edgeId,
            bestDist: hit.bestDist,
            thresholdWorld: threshold,
            local,
            world,
            t: hit.best.t,
          },
        });
      }
    }

    if (tool === "measure" && measureDraft) {
      setMeasureDraft((prev) =>
        prev
          ? {
              ...prev,
              endWorld: world,
              snappedEndWorld: worldForTool,
              isSnapped: resolvedMove.snap.isSnapped,
            }
          : prev
      );
      return;
    }

    if (tool === "line" && lineDraftRef.current) {
      const current = lineDraftRef.current;
      const last = current.pointsWorld[current.pointsWorld.length - 1];
      let nextWorld =
        !resolvedMove.snap.isSnapped && e.evt.shiftKey && last
          ? applyLineAngleLock(last, worldForTool)
          : worldForTool;

      if (!resolvedMove.snap.isSnapped && precisionSnap && last) {
        if (e.evt.shiftKey) {
          const dir = sub(nextWorld, last);
          nextWorld = snapPointAlongDirFloor(nextWorld, last, dir, PX_PER_MM);
        } else {
          nextWorld = snapWorldRelativeToRefFloor(nextWorld, last, PX_PER_MM);
        }
      }

      const nextDraft = { ...current, currentWorld: nextWorld };
      lineDraftRef.current = nextDraft;
      setLineDraft(nextDraft);
      return;
    }

    if (tool === "pen" && penDraftRef.current && isPointerDownRef.current) {
      const current = penDraftRef.current;
      const last = current.pointsWorld[current.pointsWorld.length - 1] ?? null;
      const nextWorld = worldForTool;
      const minSampleWorld =
        (current.highPrecision ? 1 : 2) / Math.max(0.1, scale);

      let nextPoints = current.pointsWorld;
      if (!last || dist(last, nextWorld) >= minSampleWorld) {
        nextPoints = [...current.pointsWorld, nextWorld];
      }

      const nextDraft = {
        ...current,
        pointsWorld: nextPoints,
        currentWorld: nextWorld,
      };
      penDraftRef.current = nextDraft;
      setPenDraft(nextDraft);
      return;
    }

    if (!draft) return;

    const mods: DraftMods = { shift: e.evt.shiftKey, alt: e.evt.altKey };
    let bWorld = worldForTool;
    if (
      !resolvedMove.snap.isSnapped &&
      precisionSnap &&
      draft.tool === "rectangle"
    ) {
      bWorld = snapWorldRelativeToRefFloor(
        worldForTool,
        draft.startWorld,
        PX_PER_MM
      );
    }
    let effective = { a: draft.startWorld, b: bWorld };
    if (draft.tool === "rectangle" || draft.tool === "circle") {
      effective = computeRectLikeCorners(draft.startWorld, bWorld, mods);
    }

    // Circle tool: apply high precision to the radii (rx/ry) instead of snapping the cursor.
    if (
      draft.tool === "circle" &&
      !resolvedMove.snap.isSnapped &&
      precisionSnap
    ) {
      const center: Vec2 = {
        x: (effective.a.x + effective.b.x) / 2,
        y: (effective.a.y + effective.b.y) / 2,
      };
      let rx = Math.abs(effective.b.x - effective.a.x) / 2;
      let ry = Math.abs(effective.b.y - effective.a.y) / 2;

      rx = Math.floor(rx / PX_PER_MM) * PX_PER_MM;
      ry = Math.floor(ry / PX_PER_MM) * PX_PER_MM;

      if (mods.shift) {
        const r = Math.max(rx, ry);
        rx = r;
        ry = r;
      }

      effective = {
        a: { x: center.x - rx, y: center.y - ry },
        b: { x: center.x + rx, y: center.y + ry },
      };
    }

    setDraft({
      ...draft,
      currentWorld: bWorld,
      effectiveAWorld: effective.a,
      effectiveBWorld: effective.b,
      mods,
    });
  };

  const handleCurvePointerMove = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => {
      void e;
      if (!curveDraft) return;
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      const world = {
        x: (pos.x - position.x) / scale,
        y: (pos.y - position.y) / scale,
      };

      const resolved = getSnappedWorldForTool(world, "move");
      const precisionSnap = modifierKeys.meta || modifierKeys.ctrl;
      setCurveDraft((prev) => {
        if (!prev) return prev;
        const last = prev.pointsWorld[prev.pointsWorld.length - 1] ?? null;
        const nextWorld =
          !resolved.snap.isSnapped && precisionSnap && last
            ? snapPointAlongDirFloor(
                resolved.world,
                last,
                sub(resolved.world, last),
                PX_PER_MM
              )
            : !resolved.snap.isSnapped && precisionSnap
              ? snapWorldToStepPxFloor(resolved.world, PX_PER_MM)
              : resolved.world;
        return { ...prev, currentWorld: nextWorld };
      });
    },
    [
      curveDraft,
      getSnappedWorldForTool,
      modifierKeys.ctrl,
      modifierKeys.meta,
      position.x,
      position.y,
      scale,
    ]
  );

  const handlePointerUp = (
    e?: Konva.KonvaEventObject<PointerEvent | MouseEvent>
  ) => {
    if (e?.evt && stageRef.current) {
      stageRef.current.setPointersPositions(e.evt);
    }
    isPointerDownRef.current = false;

    if (tool === "select") {
      const didCommit = commitSelectDirectDrag();
      if (didCommit) return;
    }

    if (isPanning) {
      setIsPanning(false);
      lastPointerRef.current = null;

      if (panRafRef.current !== null) {
        cancelAnimationFrame(panRafRef.current);
        panRafRef.current = null;
      }
      const finalPos = panPositionRef.current;
      panPositionRef.current = null;
      if (finalPos) setPosition(finalPos);
      return;
    }

    if (tool === "select" && marqueeDraft) {
      const a = marqueeDraft.startWorld;
      const b = marqueeDraft.currentWorld;
      const x0 = Math.min(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const x1 = Math.max(a.x, b.x);
      const y1 = Math.max(a.y, b.y);
      const w = x1 - x0;
      const h = y1 - y0;

      const MIN_DRAG_PX = 4;
      const minDragWorld = MIN_DRAG_PX / scale;

      // Treat a tiny marquee as a background click.
      if (w < minDragWorld && h < minDragWorld) {
        if (!marqueeDraft.additive) {
          setSelectedFigureIds([]);
        }
        setMarqueeDraft(null);
        return;
      }

      const intersects = (bb: {
        x: number;
        y: number;
        width: number;
        height: number;
      }) => {
        return !(
          bb.x + bb.width < x0 ||
          bb.x > x1 ||
          bb.y + bb.height < y0 ||
          bb.y > y1
        );
      };

      const hitIds = new Set<string>();
      for (const fig of figures) {
        const bb = figureWorldBoundingBox(fig);
        if (!bb) continue;
        if (!intersects(bb)) continue;
        const baseId =
          fig.kind === "seam" && fig.parentId ? fig.parentId : fig.id;
        hitIds.add(baseId);
      }

      if (marqueeDraft.additive) {
        const next = [...selectedFigureIds];
        const seen = new Set<string>(next);
        for (const id of hitIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          next.push(id);
        }
        setSelectedFigureIds(next);
      } else {
        setSelectedFigureIds(Array.from(hitIds));
      }

      setMarqueeDraft(null);
      return;
    }

    if (tool === "measure") {
      setMeasureDraft(null);
      return;
    }

    if (tool === "pen") {
      const current = penDraftRef.current;
      if (!current) return;

      let rawPoints = current.pointsWorld;
      const stage = stageRef.current;
      const pos = stage?.getPointerPosition();
      if (pos) {
        const upWorld = {
          x: (pos.x - position.x) / scale,
          y: (pos.y - position.y) / scale,
        };
        const last = rawPoints[rawPoints.length - 1] ?? null;
        if (!last || dist(last, upWorld) >= 0.5 / Math.max(0.1, scale)) {
          rawPoints = [...rawPoints, upWorld];
        }
      }

      const closeTolWorld = 10 / Math.max(0.1, scale);
      const shouldClose =
        rawPoints.length >= 3 &&
        dist(rawPoints[0], rawPoints[rawPoints.length - 1]) <= closeTolWorld;

      let finalizedPoints = finalizePenStrokePoints(rawPoints, {
        scale,
        highPrecision: current.highPrecision,
      });
      if (shouldClose && finalizedPoints.length >= 3) {
        const first = finalizedPoints[0];
        const last = finalizedPoints[finalizedPoints.length - 1];
        if (dist(first, last) <= closeTolWorld * 1.25) {
          finalizedPoints = finalizedPoints.slice(0, -1);
        }
      }

      if (finalizedPoints.length >= 2) {
        const fig = makePolylineLineFigure(
          finalizedPoints,
          shouldClose,
          "aci7"
        );
        if (fig) addFigureWithOptionalMerge(fig, []);
      }

      penDraftRef.current = null;
      setPenDraft(null);
      return;
    }

    if (!draft) return;

    const a = draft.effectiveAWorld;
    const b = draft.effectiveBWorld;

    const delta = sub(b, a);
    if (len(delta) < 2) {
      setDraft(null);
      return;
    }

    if (draft.tool === "rectangle") {
      addFigureWithOptionalMerge(makeRectFigure(a, b, "aci7"));
    }
    if (draft.tool === "circle") {
      const center: Vec2 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      addFigureWithOptionalMerge(makeEllipseFigure(center, rx, ry, "aci7"));
    }

    setDraft(null);
  };

  const measureOverlay = useMemo(() => {
    if (tool !== "measure" || !measureDraft) return null;
    const a = measureDraft.startWorld;
    const b = measureDraft.snappedEndWorld;
    const dPx = len(sub(b, a));
    const dCm = dPx / PX_PER_CM;
    const label = `${dCm.toFixed(2)} cm`;

    const tx = b.x + 8 / scale;
    const ty = b.y + 8 / scale;
    const measureStroke = "#FDC301";

    return (
      <>
        <Line
          points={[a.x, a.y, b.x, b.y]}
          stroke={measureStroke}
          strokeWidth={1 / scale}
          listening={false}
        />
        <Circle
          x={a.x}
          y={a.y}
          radius={3 / scale}
          fill={measureStroke}
          listening={false}
        />
        <Circle
          x={b.x}
          y={b.y}
          radius={3 / scale}
          fill={measureDraft.isSnapped ? "#2563eb" : measureStroke}
          listening={false}
        />
        <Text
          x={tx}
          y={ty}
          text={label}
          fontSize={12 / scale}
          fill={measureStroke}
          listening={false}
        />
      </>
    );
  }, [measureDraft, scale, tool]);

  const magnetOverlay = useMemo(() => {
    if (!magnetEnabled && !magnetJoinEnabled) return null;
    if (!magnetSnap) return null;
    if (
      tool !== "line" &&
      tool !== "rectangle" &&
      tool !== "circle" &&
      tool !== "curve"
    ) {
      return null;
    }

    const p = magnetSnap.pointWorld;
    return (
      <Circle
        x={p.x}
        y={p.y}
        radius={3 / scale}
        fill={previewStroke}
        opacity={0.9}
        listening={false}
      />
    );
  }, [magnetEnabled, magnetJoinEnabled, magnetSnap, previewStroke, scale, tool]);

  useEffect(() => {
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        setDraft(null);
        setCurveDraft(null);
        lineDraftRef.current = null;
        setLineDraft(null);
        penDraftRef.current = null;
        setPenDraft(null);
        dragNodeRef.current = null;
        dragHandleRef.current = null;
      }

      const currentLineDraft = lineDraftRef.current;
      if (tool === "line" && currentLineDraft) {
        if (evt.key === "Enter") {
          evt.preventDefault();
          let pts = currentLineDraft.pointsWorld;
          if (magnetJoinEnabled && pts.length >= 2) {
            const first = pts[0];
            const last = pts[pts.length - 1];
            const closeTolWorld = 10 / scale;
            if (dist(first, last) <= closeTolWorld) {
              pts = pts.slice(0, -1);
            }
          }
          if (pts.length < 2) {
            lineDraftRef.current = null;
            setLineDraft(null);
            return;
          }

          const finalized = makePolylineLineFigure(pts, false, "aci7");
          if (finalized) {
            const hits = currentLineDraft.joinHits.filter(
              (h): h is JoinHit => !!h
            );
            sendDebugLog({
              type: "draw-finalize",
              payload: {
                tool: "line",
                pointsWorld: pts,
                closed: false,
                snapped: hits.map((h) => ({
                  kind: h.kind,
                  figureId: h.figureId,
                  pointIndex: h.pointIndex,
                })),
              },
            });
            addFigureWithOptionalMerge(finalized, hits);
          }
          lineDraftRef.current = null;
          setLineDraft(null);
          return;
        }

        const isUndoLast =
          evt.key.toLowerCase() === "z" && (evt.metaKey || evt.ctrlKey);

        if (evt.key === "Backspace" || isUndoLast) {
          evt.preventDefault();
          evt.stopPropagation();
          const nextPoints = currentLineDraft.pointsWorld.slice(0, -1);
          const nextHits = currentLineDraft.joinHits.slice(0, -1);
          const fallbackWorld =
            currentLineDraft.currentWorld ??
            currentLineDraft.pointsWorld[
              currentLineDraft.pointsWorld.length - 1
            ] ??
            null;
          const nextDraft =
            nextPoints.length === 0
              ? null
              : {
                  pointsWorld: nextPoints,
                  currentWorld: fallbackWorld,
                  joinHits: nextHits,
                };
          lineDraftRef.current = nextDraft;
          setLineDraft(nextDraft);
          return;
        }
      }

      if (tool === "curve" && curveDraft) {
        if (evt.key === "Enter") {
          evt.preventDefault();
          let pts = curveDraft.pointsWorld;
          if (magnetJoinEnabled && pts.length >= 2) {
            const first = pts[0];
            const last = pts[pts.length - 1];
            const closeTolWorld = 10 / scale;
            if (dist(first, last) <= closeTolWorld) {
              pts = pts.slice(0, -1);
            }
          }
          if (pts.length < 2) {
            setCurveDraft(null);
            return;
          }

          const finalized = makeCurveFromPoints(pts, false, "aci7");
          if (finalized) {
            const hits = curveDraft.joinHits.filter(
              (h): h is JoinHit => !!h
            );
            sendDebugLog({
              type: "draw-finalize",
              payload: {
                tool: "curve",
                pointsWorld: pts,
                closed: false,
                snapped: hits.map((h) => ({
                  kind: h.kind,
                  figureId: h.figureId,
                  pointIndex: h.pointIndex,
                })),
              },
            });
            addFigureWithOptionalMerge(finalized, hits);
          }
          setCurveDraft(null);
          return;
        }

        const isUndoLast =
          evt.key.toLowerCase() === "z" && (evt.metaKey || evt.ctrlKey);

        if (evt.key === "Backspace" || isUndoLast) {
          evt.preventDefault();
          evt.stopPropagation();
          setCurveDraft((prev) => {
            if (!prev) return prev;
            const nextPoints = prev.pointsWorld.slice(0, -1);
            const nextHits = prev.joinHits.slice(0, -1);
            if (nextPoints.length === 0) return null;
            return {
              pointsWorld: nextPoints,
              currentWorld: prev.currentWorld,
              joinHits: nextHits,
            };
          });
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    addFigureWithOptionalMerge,
    curveDraft,
    magnetJoinEnabled,
    scale,
    tool,
  ]);

  const pageGuides = useMemo(() => {
    if (!showPageGuides) return null;
    const { widthCm, heightCm } = getPaperDimensionsCm(
      pageGuideSettings.paperSize,
      pageGuideSettings.orientation
    );
    const w = widthCm * PX_PER_CM;
    const h = heightCm * PX_PER_CM;
    const margin = pageGuideSettings.marginCm * PX_PER_CM;

    // Tile pages across the visible viewport, anchored at world (0,0).
    const ix0 = Math.floor(viewportWorld.x0 / w) - 1;
    const ix1 = Math.ceil(viewportWorld.x1 / w) + 1;
    const iy0 = Math.floor(viewportWorld.y0 / h) - 1;
    const iy1 = Math.ceil(viewportWorld.y1 / h) + 1;

    const tilesX = Math.max(0, ix1 - ix0 + 1);
    const tilesY = Math.max(0, iy1 - iy0 + 1);
    const totalTiles = tilesX * tilesY;

    // Safety: when zoomed very far out, drawing every page can be too heavy.
    const MAX_TILES = 600;
    const stride =
      totalTiles > MAX_TILES ? Math.ceil(Math.sqrt(totalTiles / MAX_TILES)) : 1;

    const showWatermark = stride === 1;
    const watermarkText = pageGuideSettings.paperSize;
    const watermarkFill = isDark ? "#ffffff" : "#000000";
    const watermarkOpacity = isDark ? 0.06 : 0.05;
    const watermarkFontSize = Math.max(8, Math.min(w, h) * 0.18);

    const innerW = Math.max(0, w - 2 * margin);
    const innerH = Math.max(0, h - 2 * margin);

    const nodes: React.ReactNode[] = [];
    for (let iy = iy0; iy <= iy1; iy += stride) {
      for (let ix = ix0; ix <= ix1; ix += stride) {
        const x = ix * w;
        const y = iy * h;
        const key = `${ix}:${iy}`;

        nodes.push(
          <Rect
            key={`pg:${key}`}
            x={x}
            y={y}
            width={w}
            height={h}
            stroke={pageGuideStroke}
            strokeWidth={1}
            listening={false}
          />
        );

        if (innerW > 0 && innerH > 0) {
          nodes.push(
            <Rect
              key={`pgin:${key}`}
              x={x + margin}
              y={y + margin}
              width={innerW}
              height={innerH}
              stroke={pageGuideInnerStroke}
              strokeWidth={1}
              dash={[6, 6]}
              listening={false}
            />
          );
        }

        if (showWatermark) {
          nodes.push(
            <Text
              key={`pgwm:${key}`}
              x={x}
              y={y + h / 2 - watermarkFontSize / 2}
              width={w}
              text={watermarkText}
              align="center"
              fontSize={watermarkFontSize}
              fontStyle="bold"
              fill={watermarkFill}
              opacity={watermarkOpacity}
              listening={false}
            />
          );
        }
      }
    }

    return <>{nodes}</>;
  }, [
    pageGuideInnerStroke,
    pageGuideSettings.marginCm,
    pageGuideSettings.orientation,
    pageGuideSettings.paperSize,
    pageGuideStroke,
    showPageGuides,
    viewportWorld,
    isDark,
  ]);

  const draftPreview = useMemo(() => {
    if (!draft) return null;
    const a = draft.effectiveAWorld;
    const b = draft.effectiveBWorld;

    if (draft.tool === "circle") {
      const center: Vec2 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      const fig = makeEllipseFigure(center, rx, ry, "aci7");
      const pts = figureLocalPolyline(fig, 40);
      return (
        <Group x={fig.x} y={fig.y} rotation={fig.rotation} listening={false}>
          <Line
            points={pts}
            stroke={previewStroke}
            strokeWidth={1 / scale}
            dash={previewDash}
            closed
          />
        </Group>
      );
    }

    if (draft.tool === "rectangle") {
      const fig = makeRectFigure(a, b, "aci7");
      const pts = figureLocalPolyline(fig, 10);
      return (
        <Group x={fig.x} y={fig.y} rotation={fig.rotation} listening={false}>
          <Line
            points={pts}
            stroke={previewStroke}
            strokeWidth={1 / scale}
            dash={previewDash}
            closed
          />
        </Group>
      );
    }
  }, [draft, previewDash, previewStroke, scale]);

  const lineDraftPreview = useMemo(() => {
    if (!lineDraft) return null;

    const fixed = lineDraft.pointsWorld;
    const live = lineDraft.currentWorld;
    const isAltCenter = modifierKeys.alt && fixed.length === 1 && !!live;
    const pts = isAltCenter
      ? (() => {
          const center = fixed[0];
          const v = sub(live, center);
          const a = sub(center, v);
          const b = add(center, v);
          return [a, b];
        })()
      : buildDraftPreviewPoints(fixed, live);
    if (pts.length === 0) return null;

    const flat: number[] = [];
    for (const p of pts) {
      flat.push(p.x, p.y);
    }

    const canClose = fixed.length >= 3;
    const first = fixed[0];
    const closeTolWorld = 10 / scale;
    const isCloseHover =
      !!first && !!live && canClose && dist(live, first) <= closeTolWorld;

    return (
      <>
        {pts.length >= 2 ? (
          <Line
            points={flat}
            stroke={previewStroke}
            strokeWidth={1 / scale}
            dash={previewDash}
            listening={false}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}

        {isCloseHover ? (
          <Line
            points={[live.x, live.y, first.x, first.y]}
            stroke="#16a34a"
            strokeWidth={1.5 / scale}
            dash={[4 / scale, 4 / scale]}
            listening={false}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}

        {fixed.map((p, idx) => (
          <Circle
            key={`line-draft-pt:${idx}`}
            x={p.x}
            y={p.y}
            radius={3.5 / scale}
            fill={
              idx === 0 && canClose
                ? isCloseHover
                  ? "#16a34a"
                  : previewStroke
                : previewStroke
            }
            opacity={0.9}
            listening={false}
          />
        ))}

        {isAltCenter ? (
          <Circle
            key="line-draft-center"
            x={fixed[0].x}
            y={fixed[0].y}
            radius={4.5 / scale}
            stroke={previewStroke}
            strokeWidth={1 / scale}
            fill="transparent"
            opacity={0.9}
            listening={false}
          />
        ) : null}
      </>
    );
  }, [lineDraft, modifierKeys.alt, previewDash, previewStroke, scale]);

  const penDraftPreview = useMemo(() => {
    if (!penDraft) return null;

    const pts = buildDraftPreviewPoints(
      penDraft.pointsWorld,
      penDraft.currentWorld,
      0.25
    );
    if (pts.length === 0) return null;

    const flat: number[] = [];
    for (const p of pts) {
      flat.push(p.x, p.y);
    }

    const first = pts[0];
    const last = pts[pts.length - 1];
    const closeTolWorld = 10 / Math.max(0.1, scale);
    const canClose = pts.length >= 3;
    const isClosePreview = canClose && dist(first, last) <= closeTolWorld;

    return (
      <>
        {pts.length >= 2 ? (
          <Line
            points={flat}
            stroke={previewStroke}
            strokeWidth={1.25 / scale}
            listening={false}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}
        <Circle
          x={first.x}
          y={first.y}
          radius={3.5 / scale}
          fill={isClosePreview ? "#16a34a" : previewStroke}
          opacity={0.95}
          listening={false}
        />
        {isClosePreview ? (
          <Circle
            x={first.x}
            y={first.y}
            radius={6 / scale}
            stroke="#16a34a"
            strokeWidth={1 / scale}
            fill="transparent"
            listening={false}
          />
        ) : null}
      </>
    );
  }, [penDraft, previewStroke, scale]);

  const curveDraftPreview = useMemo(() => {
    if (!curveDraft) return null;
    const CLOSE_TOL_PX = 10;
    const closeTolWorld = CLOSE_TOL_PX / scale;

    const fixed = curveDraft.pointsWorld;
    const live = curveDraft.currentWorld;

    const canClose = fixed.length >= 3;
    const first = fixed[0];
    const isCloseHover =
      !!live && canClose && dist(live, first) <= closeTolWorld;

    const pts = buildDraftPreviewPoints(fixed, live);
    const hasLine = pts.length >= 2;

    const fig = hasLine ? makeCurveFromPoints(pts, false, "aci7") : null;
    const poly = fig ? figureLocalPolyline(fig, 60) : null;
    return (
      <>
        {poly ? (
          <Line
            points={poly}
            stroke={previewStroke}
            strokeWidth={1 / scale}
            dash={previewDash}
            listening={false}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}

        {isCloseHover ? (
          <Line
            points={[live.x, live.y, first.x, first.y]}
            stroke="#16a34a"
            strokeWidth={1.5 / scale}
            dash={[4 / scale, 4 / scale]}
            listening={false}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}

        {fixed.map((p, idx) => (
          <Circle
            key={`curve-draft-pt:${idx}`}
            x={p.x}
            y={p.y}
            radius={3.5 / scale}
            fill={
              idx === 0 && canClose
                ? isCloseHover
                  ? "#16a34a"
                  : previewStroke
                : previewStroke
            }
            opacity={0.9}
            listening={false}
          />
        ))}
      </>
    );
  }, [curveDraft, previewDash, previewStroke, scale]);

  const angleLockGuideOverlay = useMemo(() => {
    if (!modifierKeys.shift) return null;

    let startWorld: Vec2 | null = null;
    let currentWorld: Vec2 | null = null;

    if (tool === "line" && lineDraft) {
      const fixed = lineDraft.pointsWorld;
      const live = lineDraft.currentWorld;
      if (fixed.length && live) {
        startWorld = fixed[fixed.length - 1];
        currentWorld = live;
      }
    } else if (tool === "node" && nodeAngleGuide) {
      const fig = figures.find((f) => f.id === nodeAngleGuide.figureId) ?? null;
      if (fig) {
        startWorld = figureLocalToWorld(fig, nodeAngleGuide.startLocal);
        currentWorld = figureLocalToWorld(fig, nodeAngleGuide.currentLocal);
      }
    }

    if (!startWorld || !currentWorld) return null;

    const dx = currentWorld.x - startWorld.x;
    const dy = currentWorld.y - startWorld.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return null;

    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const norm = (deg + 360) % 360;
    const GUIDE_TOL_DEG = 2.5;

    const isHorizontal =
      Math.abs(norm - 0) <= GUIDE_TOL_DEG ||
      Math.abs(norm - 180) <= GUIDE_TOL_DEG ||
      Math.abs(norm - 360) <= GUIDE_TOL_DEG;
    const isVertical =
      Math.abs(norm - 90) <= GUIDE_TOL_DEG ||
      Math.abs(norm - 270) <= GUIDE_TOL_DEG;

    if (!isHorizontal && !isVertical) return null;

    const pad = 40 / scale;
    const x0 = viewportWorld.x0 - pad;
    const x1 = viewportWorld.x1 + pad;
    const y0 = viewportWorld.y0 - pad;
    const y1 = viewportWorld.y1 + pad;

    const stroke = "#22c55e";
    const dash = [6 / scale, 6 / scale];
    const strokeWidth = 1 / scale;
    const opacity = 0.4;

    return (
      <Line
        points={
          isHorizontal
            ? [x0, startWorld.y, x1, startWorld.y]
            : [startWorld.x, y0, startWorld.x, y1]
        }
        stroke={stroke}
        strokeWidth={strokeWidth}
        dash={dash}
        opacity={opacity}
        listening={false}
        lineCap="round"
      />
    );
  }, [
    figures,
    lineDraft,
    modifierKeys.shift,
    nodeAngleGuide,
    scale,
    tool,
    viewportWorld.x0,
    viewportWorld.x1,
    viewportWorld.y0,
    viewportWorld.y1,
  ]);

  const draftMeasuresOverlay = useMemo(() => {
    if (measureDisplayMode === "never") return null;

    const nodes: React.ReactNode[] = [];

    // Live draft measures
    if (draft) {
      const a = draft.effectiveAWorld;
      const b = draft.effectiveBWorld;

      let temp: Figure | null = null;
      if (draft.tool === "rectangle") temp = makeRectFigure(a, b, "aci7");
      if (draft.tool === "circle") {
        const center: Vec2 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const rx = Math.abs(b.x - a.x) / 2;
        const ry = Math.abs(b.y - a.y) / 2;
        temp = makeEllipseFigure(center, rx, ry, "aci7");
      }

      if (temp) {
        const fig = withComputedFigureMeasures(temp);
        nodes.push(
          <Group
            key="mgrp:draft"
            x={fig.x}
            y={fig.y}
            rotation={fig.rotation || 0}
            listening={false}
          >
            <MemoizedMeasureOverlay
              figure={fig}
              scale={scale}
              isDark={isDark}
              selectedEdge={null}
              hoveredEdge={null}
            />
          </Group>
        );
      }
    }

    if (curveDraft) {
      const pts = buildDraftPreviewPoints(
        curveDraft.pointsWorld,
        curveDraft.currentWorld
      );
      const temp = makeCurveFromPoints(pts, false, "aci7");
      if (temp) {
        const fig = withComputedFigureMeasures(temp);
        nodes.push(
          <Group
            key="mgrp:curve-draft"
            x={fig.x}
            y={fig.y}
            rotation={fig.rotation || 0}
            listening={false}
          >
            <MemoizedMeasureOverlay
              figure={fig}
              scale={scale}
              isDark={isDark}
              selectedEdge={null}
              hoveredEdge={null}
            />
          </Group>
        );
      }
    }

    if (lineDraft) {
      const pts = buildDraftPreviewPoints(
        lineDraft.pointsWorld,
        lineDraft.currentWorld
      );
      const temp = makePolylineLineFigure(pts, false, "aci7");
      if (temp) {
        const fig = withComputedFigureMeasures(temp);
        nodes.push(
          <Group
            key="mgrp:line-draft"
            x={fig.x}
            y={fig.y}
            rotation={fig.rotation || 0}
            listening={false}
          >
            <MemoizedMeasureOverlay
              figure={fig}
              scale={scale}
              isDark={isDark}
              selectedEdge={null}
              hoveredEdge={null}
            />
          </Group>
        );
      }
    }

    return nodes.length ? <>{nodes}</> : null;
  }, [curveDraft, draft, isDark, lineDraft, measureDisplayMode, scale]);

  const figuresById = useMemo(() => {
    return new Map(figures.map((f) => [f.id, f] as const));
  }, [figures]);

  const nodeOverlay = useMemo(() => {
    if (tool !== "node" || !selectedFigure) return null;

    const isLockedSyncedMirror =
      selectedFigure.mirrorLink?.role === "mirror" &&
      selectedFigure.mirrorLink.sync === true;

    if (isLockedSyncedMirror) {
      // Show nodes but disable editing/dragging.
      return (
        <Group
          x={selectedFigure.x}
          y={selectedFigure.y}
          rotation={selectedFigure.rotation || 0}
          listening={false}
        >
          <MemoizedNodeOverlay
            figure={selectedFigure}
            scale={scale}
            stroke={aci7}
            nodeStroke="#22c55e"
            opacity={0.9}
            visible={true}
            x={0}
            y={0}
            rotation={0}
          />
        </Group>
      );
    }

    const rNode = 6 / scale;
    const rHandle = 3.5 / scale;
    const rNodeHit = 12 / scale;

    return (
      <Group
        x={selectedFigure.x}
        y={selectedFigure.y}
        rotation={selectedFigure.rotation || 0}
      >
        {selectedFigure.nodes.map((n) => {
          const inH = n.inHandle;
          const outH = n.outHandle;
          const isSelectedNode =
            nodeSelection?.figureId === selectedFigure.id &&
            nodeSelection.nodeId === n.id &&
            nodeSelection.handle === null;

          return (
            <React.Fragment key={n.id}>
              {inH ? (
                <Line
                  points={[n.x, n.y, inH.x, inH.y]}
                  stroke={handleAccentStroke}
                  strokeWidth={1 / scale}
                  opacity={0.5}
                  listening={false}
                />
              ) : null}
              {outH ? (
                <Line
                  points={[n.x, n.y, outH.x, outH.y]}
                  stroke={handleAccentStroke}
                  strokeWidth={1 / scale}
                  opacity={0.5}
                  listening={false}
                />
              ) : null}

              {/* Bigger hit target (invisible) to make selecting/dragging nodes reliable */}
              <Circle
                x={n.x}
                y={n.y}
                radius={rNodeHit}
                name="inaa-node-point"
                fill="#000000"
                opacity={0.001}
                draggable
                onDragStart={() => {
                  dragNodeRef.current = {
                    figureId: selectedFigure.id,
                    nodeId: n.id,
                    startNode: { x: n.x, y: n.y },
                    startIn: n.inHandle ? { ...n.inHandle } : undefined,
                    startOut: n.outHandle ? { ...n.outHandle } : undefined,
                    snappedToNodeId: null,
                  };
                  setNodeMergePreview(null);
                  setNodeAngleGuide({
                    figureId: selectedFigure.id,
                    startLocal: { x: n.x, y: n.y },
                    currentLocal: { x: n.x, y: n.y },
                  });
                  setNodeSelection({
                    figureId: selectedFigure.id,
                    nodeId: n.id,
                    handle: null,
                  });
                }}
                onDragMove={(ev) => {
                  const ref = dragNodeRef.current;
                  if (!ref) return;
                  let nx = ev.target.x();
                  let ny = ev.target.y();

                  // Shift: lock movement direction in 15° increments (relative to drag start).
                  const shiftKey =
                    ((ev.evt as unknown as { shiftKey?: boolean } | undefined)
                      ?.shiftKey ?? false) === true;
                  if (shiftKey) {
                    const dx0 = nx - ref.startNode.x;
                    const dy0 = ny - ref.startNode.y;
                    const d0 = Math.hypot(dx0, dy0);
                    if (Number.isFinite(d0) && d0 > 1e-6) {
                      const step = (15 * Math.PI) / 180;
                      const a = Math.atan2(dy0, dx0);
                      const snapped = Math.round(a / step) * step;
                      nx = ref.startNode.x + Math.cos(snapped) * d0;
                      ny = ref.startNode.y + Math.sin(snapped) * d0;
                      ev.target.position({ x: nx, y: ny });
                    }
                  }

                  // Node-to-node snap within the same figure (local coords).
                  const fig = figures.find((f) => f.id === ref.figureId);
                  if (fig) {
                    const SNAP_PX = 10;
                    const snapR = SNAP_PX / scale;
                    let bestId: string | null = null;
                    let bestD = Infinity;
                    for (const other of fig.nodes) {
                      if (other.id === ref.nodeId) continue;
                      const d = dist(
                        { x: nx, y: ny },
                        { x: other.x, y: other.y }
                      );
                      if (d < bestD) {
                        bestD = d;
                        bestId = other.id;
                      }
                    }
                    if (bestId && bestD <= snapR) {
                      const other =
                        fig.nodes.find((n2) => n2.id === bestId) ?? null;
                      if (other) {
                        nx = other.x;
                        ny = other.y;
                        ref.snappedToNodeId = bestId;
                        ev.target.position({ x: nx, y: ny });

                        queueNodeMergePreview({
                          figureId: ref.figureId,
                          fromNodeId: ref.nodeId,
                          toNodeId: bestId,
                        });
                      }
                    } else {
                      ref.snappedToNodeId = null;

                      if (
                        nodeMergePreviewRef.current &&
                        nodeMergePreviewRef.current.figureId ===
                          ref.figureId &&
                        nodeMergePreviewRef.current.fromNodeId === ref.nodeId
                      ) {
                        queueNodeMergePreview(null);
                      }
                    }
                  }
                  const dx = nx - ref.startNode.x;
                  const dy = ny - ref.startNode.y;

                  setNodeAngleGuide({
                    figureId: ref.figureId,
                    startLocal: ref.startNode,
                    currentLocal: { x: nx, y: ny },
                  });

                  setFigures((prev) =>
                    prev.map((f) => {
                      if (f.id !== ref.figureId) return f;
                      const base = markCurveCustomSnapshotDirtyIfPresent(
                        breakStyledLinkIfNeeded(f)
                      );
                      return {
                        ...base,
                        nodes: base.nodes.map((node) => {
                          if (node.id !== ref.nodeId) return node;
                          const nextIn = ref.startIn
                            ? { x: ref.startIn.x + dx, y: ref.startIn.y + dy }
                            : node.inHandle;
                          const nextOut = ref.startOut
                            ? { x: ref.startOut.x + dx, y: ref.startOut.y + dy }
                            : node.outHandle;
                          return {
                            ...node,
                            x: nx,
                            y: ny,
                            inHandle: nextIn,
                            outHandle: nextOut,
                          };
                        }),
                      };
                    })
                  );
                }}
                onDragEnd={() => {
                  const ref = dragNodeRef.current;
                  dragNodeRef.current = null;
                  setNodeAngleGuide(null);
                  if (!ref) return;

                  queueNodeMergePreview(null);

                  const toNodeId = ref.snappedToNodeId ?? null;
                  if (!toNodeId) return;
                  if (toNodeId === ref.nodeId) return;

                  setFigures((prev) =>
                    prev.map((f) => {
                      if (f.id !== ref.figureId) return f;
                      const base = markCurveCustomSnapshotDirtyIfPresent(
                        breakStyledLinkIfNeeded(f)
                      );
                      return mergeFigureNodes(base, ref.nodeId, toNodeId);
                    })
                  );
                  setNodeSelection({
                    figureId: ref.figureId,
                    nodeId: toNodeId,
                    handle: null,
                  });
                }}
                onDblClick={() => {
                  setFigures((prev) =>
                    prev.map((f) => {
                      if (f.id !== selectedFigure.id) return f;
                      const base = markCurveCustomSnapshotDirtyIfPresent(
                        breakStyledLinkIfNeeded(f)
                      );
                      return {
                        ...base,
                        nodes: base.nodes.map((node) => {
                          if (node.id !== n.id) return node;
                          return {
                            ...node,
                            mode: node.mode === "smooth" ? "corner" : "smooth",
                          };
                        }),
                      };
                    })
                  );
                }}
                onPointerDown={(ev) => {
                  ev.cancelBubble = true;
                  setNodeSelection({
                    figureId: selectedFigure.id,
                    nodeId: n.id,
                    handle: null,
                  });
                }}
                onMouseDown={(ev) => {
                  ev.cancelBubble = true;
                  setNodeSelection({
                    figureId: selectedFigure.id,
                    nodeId: n.id,
                    handle: null,
                  });
                }}
              />

              {/* Visual node */}
              <Circle
                x={n.x}
                y={n.y}
                radius={rNode}
                fill={
                  nodeMergePreview?.figureId === selectedFigure.id &&
                  nodeMergePreview.fromNodeId === n.id
                    ? previewRemoveStroke
                    : isSelectedNode
                      ? "#2563eb"
                      : "#ffffff"
                }
                stroke={
                  nodeMergePreview?.figureId === selectedFigure.id &&
                  nodeMergePreview.fromNodeId === n.id
                    ? previewRemoveStroke
                    : "#2563eb"
                }
                strokeWidth={1 / scale}
                listening={false}
              />

              {nodeMergePreview?.figureId === selectedFigure.id &&
              nodeMergePreview.fromNodeId === n.id ? (
                <Circle
                  x={n.x}
                  y={n.y}
                  radius={rNode + 3 / scale}
                  fill="transparent"
                  stroke={previewRemoveStroke}
                  strokeWidth={2 / scale}
                  listening={false}
                />
              ) : null}

              {inH ? (
                <Circle
                  x={inH.x}
                  y={inH.y}
                  radius={rHandle}
                  name="inaa-node-handle in"
                  fill={handleAccentStroke}
                  stroke={aci7}
                  strokeWidth={1 / scale}
                  draggable
                  onDragStart={() => {
                    setNodeSelection({
                      figureId: selectedFigure.id,
                      nodeId: n.id,
                      handle: "in",
                    });
                  }}
                  onDragMove={(ev) => {
                    let nx = ev.target.x();
                    let ny = ev.target.y();

                    // Shift: lock handle angle in 15° increments around the node.
                    const shiftKey =
                      ((ev.evt as unknown as { shiftKey?: boolean } | undefined)
                        ?.shiftKey ?? false) === true;
                    if (shiftKey) {
                      const dx0 = nx - n.x;
                      const dy0 = ny - n.y;
                      const d0 = Math.hypot(dx0, dy0);
                      if (Number.isFinite(d0) && d0 > 1e-6) {
                        const step = (15 * Math.PI) / 180;
                        const a = Math.atan2(dy0, dx0);
                        const snapped = Math.round(a / step) * step;
                        nx = n.x + Math.cos(snapped) * d0;
                        ny = n.y + Math.sin(snapped) * d0;
                        ev.target.position({ x: nx, y: ny });
                      }
                    }
                    setFigures((prev) =>
                      prev.map((f) => {
                        if (f.id !== selectedFigure.id) return f;
                        const base = markCurveCustomSnapshotDirtyIfPresent(
                          breakStyledLinkIfNeeded(f)
                        );
                        return {
                          ...base,
                          nodes: base.nodes.map((node) => {
                            if (node.id !== n.id) return node;
                            const next: FigureNode = {
                              ...node,
                              inHandle: { x: nx, y: ny },
                            };
                            if (node.mode === "smooth") {
                              next.outHandle = {
                                x: 2 * node.x - nx,
                                y: 2 * node.y - ny,
                              };
                            }
                            return next;
                          }),
                        };
                      })
                    );
                  }}
                  onPointerDown={(ev) => {
                    ev.cancelBubble = true;
                    setNodeSelection({
                      figureId: selectedFigure.id,
                      nodeId: n.id,
                      handle: "in",
                    });
                  }}
                  onMouseDown={(ev) => {
                    ev.cancelBubble = true;
                    setNodeSelection({
                      figureId: selectedFigure.id,
                      nodeId: n.id,
                      handle: "in",
                    });
                  }}
                />
              ) : null}

              {outH ? (
                <Circle
                  x={outH.x}
                  y={outH.y}
                  radius={rHandle}
                  name="inaa-node-handle out"
                  fill={handleAccentStroke}
                  stroke={aci7}
                  strokeWidth={1 / scale}
                  draggable
                  onDragStart={() => {
                    setNodeSelection({
                      figureId: selectedFigure.id,
                      nodeId: n.id,
                      handle: "out",
                    });
                  }}
                  onDragMove={(ev) => {
                    let nx = ev.target.x();
                    let ny = ev.target.y();

                    // Shift: lock handle angle in 15° increments around the node.
                    const shiftKey =
                      ((ev.evt as unknown as { shiftKey?: boolean } | undefined)
                        ?.shiftKey ?? false) === true;
                    if (shiftKey) {
                      const dx0 = nx - n.x;
                      const dy0 = ny - n.y;
                      const d0 = Math.hypot(dx0, dy0);
                      if (Number.isFinite(d0) && d0 > 1e-6) {
                        const step = (15 * Math.PI) / 180;
                        const a = Math.atan2(dy0, dx0);
                        const snapped = Math.round(a / step) * step;
                        nx = n.x + Math.cos(snapped) * d0;
                        ny = n.y + Math.sin(snapped) * d0;
                        ev.target.position({ x: nx, y: ny });
                      }
                    }
                    setFigures((prev) =>
                      prev.map((f) => {
                        if (f.id !== selectedFigure.id) return f;
                        const base = markCurveCustomSnapshotDirtyIfPresent(
                          breakStyledLinkIfNeeded(f)
                        );
                        return {
                          ...base,
                          nodes: base.nodes.map((node) => {
                            if (node.id !== n.id) return node;
                            const next: FigureNode = {
                              ...node,
                              outHandle: { x: nx, y: ny },
                            };
                            if (node.mode === "smooth") {
                              next.inHandle = {
                                x: 2 * node.x - nx,
                                y: 2 * node.y - ny,
                              };
                            }
                            return next;
                          }),
                        };
                      })
                    );
                  }}
                  onPointerDown={(ev) => {
                    ev.cancelBubble = true;
                    setNodeSelection({
                      figureId: selectedFigure.id,
                      nodeId: n.id,
                      handle: "out",
                    });
                  }}
                  onMouseDown={(ev) => {
                    ev.cancelBubble = true;
                    setNodeSelection({
                      figureId: selectedFigure.id,
                      nodeId: n.id,
                      handle: "out",
                    });
                  }}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </Group>
    );
  }, [
    aci7,
    figures,
    handleAccentStroke,
    mergeFigureNodes,
    nodeMergePreview,
    nodeSelection,
    previewRemoveStroke,
    scale,
    selectedFigure,
    setFigures,
    tool,
  ]);

  const edgeHoverOverlay = useMemo(() => {
    if ((tool !== "node" && tool !== "dart") || !selectedFigure || !hoveredEdge)
      return null;
    if (hoveredEdge.figureId !== selectedFigure.id) return null;

    const edge = selectedFigure.edges.find((e) => e.id === hoveredEdge.edgeId);
    if (!edge) return null;

    const pts = edgeLocalPoints(
      selectedFigure,
      edge,
      edge.kind === "line" ? 1 : 60
    );
    if (pts.length < 2) return null;
    const flat: number[] = [];
    for (const p of pts) flat.push(p.x, p.y);

    return (
      <Group
        x={selectedFigure.x}
        y={selectedFigure.y}
        rotation={selectedFigure.rotation || 0}
        listening={false}
      >
        <Line
          points={flat}
          stroke="rgba(37, 99, 235, 0.85)"
          strokeWidth={2 / scale}
          lineCap="round"
          lineJoin="round"
        />
        {tool === "node" && hoveredEdge.snapKind === "mid" ? (
          <Rect
            x={hoveredEdge.pointLocal.x}
            y={hoveredEdge.pointLocal.y}
            width={8 / scale}
            height={8 / scale}
            offsetX={4 / scale}
            offsetY={4 / scale}
            rotation={45}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={1 / scale}
          />
        ) : null}
        <Circle
          x={hoveredEdge.pointLocal.x}
          y={hoveredEdge.pointLocal.y}
          radius={4 / scale}
          fill="#2563eb"
          stroke="#ffffff"
          strokeWidth={1 / scale}
        />
      </Group>
    );
  }, [hoveredEdge, scale, selectedFigure, tool]);

  const nodeSplitMeasuresPreviewOverlay = useMemo(() => {
    if (tool !== "node" || !selectedFigure || !hoveredEdge) return null;
    if (hoveredEdge.figureId !== selectedFigure.id) return null;

    const edge = selectedFigure.edges.find((e) => e.id === hoveredEdge.edgeId);
    if (!edge) return null;

    // Use a denser sampling for a stable arc-length preview on curves.
    const pts = edgeLocalPoints(
      selectedFigure,
      edge,
      edge.kind === "line" ? 1 : 120
    );
    if (pts.length < 2) return null;

    const split = splitPolylineAtPoint(pts, hoveredEdge.pointLocal);
    if (!split) return null;

    const rightLengthPx = Math.max(0, split.totalLengthPx - split.leftLengthPx);
    const leftLengthPx = Math.max(0, split.leftLengthPx);

    const centroid = figureCentroidLocal(selectedFigure);

    const fontSize = 11 / scale;
    const textWidth = 120 / scale;
    const offset = 12 / scale;

    const previewStroke = "#2563eb";
    const previewOpacity = 0.95;

    const renderSegmentLabel = (
      key: string,
      segmentPts: Vec2[],
      lengthPx: number
    ) => {
      if (segmentPts.length < 2) return null;
      if (!Number.isFinite(lengthPx)) return null;

      const mt = midAndTangent(segmentPts);
      if (!mt) return null;

      const n = norm(perp(mt.tangent));
      const p1 = add(mt.mid, mul(n, offset));
      const p2 = add(mt.mid, mul(n, -offset));
      const p = dist(p1, centroid) >= dist(p2, centroid) ? p1 : p2;

      const rawAngleDeg =
        (Math.atan2(mt.tangent.y, mt.tangent.x) * 180) / Math.PI;
      const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

      const label = formatCm(pxToCm(lengthPx), 2);

      const chordLenLocal = dist(
        segmentPts[0],
        segmentPts[segmentPts.length - 1]
      );
      const chordLenScreenPx = chordLenLocal * scale;
      const SHORT_EDGE_THRESHOLD_PX = 42;
      const isShort = chordLenScreenPx < SHORT_EDGE_THRESHOLD_PX;

      const leader = isShort ? (
        <Line
          key={`${key}:leader`}
          points={[mt.mid.x, mt.mid.y, p.x, p.y]}
          stroke={previewStroke}
          strokeWidth={1 / scale}
          dash={[4 / scale, 4 / scale]}
          opacity={0.6}
          listening={false}
          lineCap="round"
        />
      ) : null;

      return (
        <>
          {leader}
          <Text
            key={key}
            x={p.x}
            y={p.y}
            offsetX={textWidth / 2}
            offsetY={fontSize / 2}
            rotation={angleDeg}
            width={textWidth}
            align="center"
            text={label}
            fontSize={fontSize}
            fill={previewStroke}
            opacity={previewOpacity}
            fontStyle="bold"
            listening={false}
            name="inaa-measure-preview"
          />
        </>
      );
    };

    return (
      <Group
        x={selectedFigure.x}
        y={selectedFigure.y}
        rotation={selectedFigure.rotation || 0}
        listening={false}
      >
        {renderSegmentLabel(
          `msplit:${selectedFigure.id}:${edge.id}:a`,
          split.left,
          leftLengthPx
        )}
        {renderSegmentLabel(
          `msplit:${selectedFigure.id}:${edge.id}:b`,
          split.right,
          rightLengthPx
        )}
      </Group>
    );
  }, [hoveredEdge, scale, selectedFigure, tool]);

  const piqueHoverOverlay = useMemo(() => {
    if (tool !== "pique") return null;
    if (hoveredPique) return null;
    if (!hoveredEdge) return null;

    const fig = figures.find((f) => f.id === hoveredEdge.figureId) ?? null;
    if (!fig || fig.kind === "seam") return null;

    const edge = fig.edges.find((e) => e.id === hoveredEdge.edgeId) ?? null;
    if (!edge) return null;

    const pts = edgeLocalPoints(fig, edge, edge.kind === "line" ? 2 : 160);
    if (pts.length < 2) return null;

    const splitAll = splitPolylineAtPoint(pts, hoveredEdge.pointLocal);
    if (!splitAll || splitAll.totalLengthPx < 1e-6) return null;

    const total = splitAll.totalLengthPx;
    const sSnap = splitAll.leftLengthPx;
    const tBreaks = getPiqueEdgeBreakpointsT01(fig, edge.id);
    const breaksS = [0, ...tBreaks.map((t) => t * total), total];
    const { s0, s1 } = pickActiveSegmentS(breaksS, sSnap);

    const leftLengthPx = Math.max(0, sSnap - s0);
    const rightLengthPx = Math.max(0, s1 - sSnap);

    const segPts = slicePolylineByArcLength(pts, s0, s1);
    const cutPoint = hoveredEdge.pointLocal;
    const split = splitPolylineAtPoint(segPts, cutPoint);
    const leftPts = split
      ? split.left
      : slicePolylineByArcLength(pts, s0, sSnap);
    const rightPts = split
      ? split.right
      : slicePolylineByArcLength(pts, sSnap, s1);

    const fontSize = 11 / scale;
    const textWidth = 120 / scale;
    const offset = 12 / scale;

    const previewStroke = "#2563eb";
    const previewOpacity = 0.95;

    if (!fig.closed) {
      return (
        <Group
          x={fig.x}
          y={fig.y}
          rotation={fig.rotation || 0}
          listening={false}
        >
          <Text
            x={cutPoint.x}
            y={cutPoint.y - 18 / scale}
            text="Pique só funciona em figuras fechadas"
            fontSize={12 / scale}
            fill="#ef4444"
            opacity={0.95}
            listening={false}
          />
        </Group>
      );
    }

    const centroid = figureCentroidLocal(fig);

    const renderSegmentLabel = (
      key: string,
      segmentPts: Vec2[],
      lengthPx: number
    ) => {
      if (segmentPts.length < 2) return null;
      if (!Number.isFinite(lengthPx)) return null;

      const mt = midAndTangent(segmentPts);
      if (!mt) return null;

      const n = norm(perp(mt.tangent));
      const p1 = add(mt.mid, mul(n, offset));
      const p2 = add(mt.mid, mul(n, -offset));
      const p = dist(p1, centroid) >= dist(p2, centroid) ? p1 : p2;

      const rawAngleDeg =
        (Math.atan2(mt.tangent.y, mt.tangent.x) * 180) / Math.PI;
      const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

      const label = formatCm(pxToCm(lengthPx), 2);

      const chordLenLocal = dist(
        segmentPts[0],
        segmentPts[segmentPts.length - 1]
      );
      const chordLenScreenPx = chordLenLocal * scale;
      const SHORT_EDGE_THRESHOLD_PX = 42;
      const isShort = chordLenScreenPx < SHORT_EDGE_THRESHOLD_PX;

      const leader = isShort ? (
        <Line
          key={`${key}:leader`}
          points={[mt.mid.x, mt.mid.y, p.x, p.y]}
          stroke={previewStroke}
          strokeWidth={1 / scale}
          dash={[4 / scale, 4 / scale]}
          opacity={0.6}
          listening={false}
          lineCap="round"
        />
      ) : null;

      return (
        <>
          {leader}
          <Text
            key={key}
            x={p.x}
            y={p.y}
            offsetX={textWidth / 2}
            offsetY={fontSize / 2}
            rotation={angleDeg}
            width={textWidth}
            align="center"
            text={label}
            fontSize={fontSize}
            fill={previewStroke}
            opacity={previewOpacity}
            fontStyle="bold"
            listening={false}
            name="inaa-pique-measure-preview"
          />
        </>
      );
    };

    // Preview notch segment pointing inward.
    const polyFlat = figureLocalPolyline(fig, 120);
    const poly: Vec2[] = [];
    for (let i = 0; i < polyFlat.length - 1; i += 2) {
      poly.push({ x: polyFlat[i], y: polyFlat[i + 1] });
    }
    if (poly.length < 3) return null;

    const at = pointAndTangentAtArcLength(pts, sSnap);
    if (!at) return null;

    const n = norm(perp(at.tangentUnit));
    const eps = 2 * PX_PER_MM;
    const test = add(at.point, mul(n, eps));
    const side: 1 | -1 = pointInPolygon(test, poly) ? 1 : -1;

    const lengthPx = 0.5 * PX_PER_CM;
    const p0 = at.point;
    const p1 = add(p0, mul(n, lengthPx * side));

    return (
      <Group x={fig.x} y={fig.y} rotation={fig.rotation || 0} listening={false}>
        {renderSegmentLabel(
          `pique:${fig.id}:${edge.id}:a`,
          leftPts,
          leftLengthPx
        )}
        {renderSegmentLabel(
          `pique:${fig.id}:${edge.id}:b`,
          rightPts,
          rightLengthPx
        )}

        <Line
          points={[p0.x, p0.y, p1.x, p1.y]}
          stroke={previewStroke}
          strokeWidth={2 / scale}
          dash={[6 / scale, 6 / scale]}
          opacity={0.75}
          lineCap="round"
          listening={false}
        />
        <Circle
          x={p0.x}
          y={p0.y}
          radius={4 / scale}
          fill={previewStroke}
          stroke="#ffffff"
          strokeWidth={1 / scale}
          listening={false}
        />
      </Group>
    );
  }, [figures, hoveredEdge, hoveredPique, scale, tool]);

  const dartPickAOverlay = useMemo(() => {
    if (tool !== "dart") return null;
    if (dartDraft) return null;
    if (!hoveredEdge) return null;

    const fig = figures.find((f) => f.id === hoveredEdge.figureId) ?? null;
    if (!fig || fig.kind === "seam") return null;
    if (fig.mirrorLink) return null;

    const edge = fig.edges.find((e) => e.id === hoveredEdge.edgeId) ?? null;
    if (!edge) return null;

    const fromNode = getNodeById(fig.nodes, edge.from);
    const toNode = getNodeById(fig.nodes, edge.to);
    if (!fromNode || !toNode) return null;

    const aLocal = hoveredEdge.pointLocal;
    const pFrom: Vec2 = { x: fromNode.x, y: fromNode.y };
    const pTo: Vec2 = { x: toNode.x, y: toNode.y };

    const dFromPx = dist(aLocal, pFrom);
    const dToPx = dist(aLocal, pTo);
    if (!Number.isFinite(dFromPx) || !Number.isFinite(dToPx)) return null;

    const stroke = previewStroke;
    const dash = [6 / scale, 6 / scale];
    const fontSize = 11 / scale;
    const textWidth = 140 / scale;

    const renderHalfLabel = (key: string, p1: Vec2, p2: Vec2, dPx: number) => {
      const mid = lerp(p1, p2, 0.5);
      const tangent = sub(p2, p1);
      const normal = norm(perp(tangent));
      const offset = 12 / scale;
      const p = add(mid, mul(normal, offset));
      const rawAngleDeg = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
      const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);
      const label = formatCm(pxToCm(dPx), 2);

      return (
        <Text
          key={key}
          x={p.x}
          y={p.y}
          offsetX={textWidth / 2}
          offsetY={fontSize / 2}
          rotation={angleDeg}
          width={textWidth}
          align="center"
          text={label}
          fontSize={fontSize}
          fill={stroke}
          opacity={0.95}
          fontStyle="bold"
          listening={false}
          name="inaa-dart-preview-a"
        />
      );
    };

    return (
      <Group x={fig.x} y={fig.y} rotation={fig.rotation || 0} listening={false}>
        <Circle x={pFrom.x} y={pFrom.y} radius={3.5 / scale} fill={stroke} />
        <Circle x={pTo.x} y={pTo.y} radius={3.5 / scale} fill={stroke} />
        <Circle x={aLocal.x} y={aLocal.y} radius={4 / scale} fill={stroke} />

        <Line
          points={[pFrom.x, pFrom.y, aLocal.x, aLocal.y]}
          stroke={stroke}
          strokeWidth={1 / scale}
          dash={dash}
          opacity={0.9}
          listening={false}
        />
        <Line
          points={[aLocal.x, aLocal.y, pTo.x, pTo.y]}
          stroke={stroke}
          strokeWidth={1 / scale}
          dash={dash}
          opacity={0.9}
          listening={false}
        />

        {renderHalfLabel(
          `dart:a:from:${fig.id}:${edge.id}`,
          pFrom,
          aLocal,
          dFromPx
        )}
        {renderHalfLabel(`dart:a:to:${fig.id}:${edge.id}`, aLocal, pTo, dToPx)}
      </Group>
    );
  }, [dartDraft, figures, hoveredEdge, previewStroke, scale, tool]);

  const mirrorPreviewOverlay = useMemo(() => {
    if (tool !== "mirror") return null;
    if (!hoveredEdge) return null;

    const fig = figures.find((f) => f.id === hoveredEdge.figureId) ?? null;
    if (!fig || fig.kind === "seam") return null;

    const edge = fig.edges.find((e) => e.id === hoveredEdge.edgeId) ?? null;
    if (!edge) return null;

    const hoverWorld = figureLocalToWorld(fig, hoveredEdge.pointLocal);
    const side = pickMirrorSideByScreenBBox(fig, hoverWorld, {
      position,
      scale,
    });
    const axisDirUnit = axisDirForSide(side);
    const anchorNodeId = pickAnchorNodeIdForEdgeSide(fig, edge, side, {
      position,
      scale,
    });
    const anchorNode = fig.nodes.find((n) => n.id === anchorNodeId) ?? null;
    const axisPointWorld = anchorNode
      ? figureLocalToWorld(fig, { x: anchorNode.x, y: anchorNode.y })
      : hoverWorld;
    const mirrored = mirrorFigureAcrossLineAnchored(
      fig,
      axisPointWorld,
      axisDirUnit,
      anchorNodeId
    );

    const viewW = size.width / scale;
    const viewH = size.height / scale;
    const L = Math.max(200, Math.hypot(viewW, viewH));
    const p1 = add(axisPointWorld, mul(axisDirUnit, L));
    const p2 = add(axisPointWorld, mul(axisDirUnit, -L));

    const edgePts = edgeLocalPoints(fig, edge, edge.kind === "line" ? 1 : 60);
    const edgeFlat: number[] = [];
    for (const p of edgePts) edgeFlat.push(p.x, p.y);

    const mirroredPoly = figureWorldPolyline(mirrored, 80);

    return (
      <>
        <Line
          points={[p1.x, p1.y, p2.x, p2.y]}
          stroke={previewStroke}
          strokeWidth={1 / scale}
          dash={previewDash}
          opacity={0.85}
          listening={false}
          lineCap="round"
        />

        <Group
          x={fig.x}
          y={fig.y}
          rotation={fig.rotation || 0}
          listening={false}
        >
          <Line
            points={edgeFlat}
            stroke={previewStroke}
            strokeWidth={2 / scale}
            opacity={0.95}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
          <Circle
            x={hoveredEdge.pointLocal.x}
            y={hoveredEdge.pointLocal.y}
            radius={4 / scale}
            fill={previewStroke}
            stroke="#ffffff"
            strokeWidth={1 / scale}
          />
        </Group>

        <Line
          points={mirroredPoly}
          closed={mirrored.closed}
          stroke={previewStroke}
          strokeWidth={2 / scale}
          dash={previewDash}
          opacity={0.65}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      </>
    );
  }, [
    figures,
    hoveredEdge,
    position,
    previewDash,
    previewStroke,
    scale,
    size.height,
    size.width,
    tool,
  ]);

  const unmirrorPreviewOverlay = useMemo(() => {
    if (tool !== "unfold") return null;
    if (!hoveredMirrorLinkFigureId) return null;

    const fig = figures.find((f) => f.id === hoveredMirrorLinkFigureId) ?? null;
    const link = fig?.mirrorLink;
    if (!fig || !link) return null;

    const other = figures.find((f) => f.id === link.otherId) ?? null;
    if (!other) return null;

    const original = link.role === "mirror" ? other : fig;
    const mirrored = link.role === "mirror" ? fig : other;

    const axisPointWorld = link.axisPointWorld;
    const axisDirUnit = link.axisDirWorld;

    const viewW = size.width / scale;
    const viewH = size.height / scale;
    const L = Math.max(200, Math.hypot(viewW, viewH));
    const p1 = add(axisPointWorld, mul(axisDirUnit, L));
    const p2 = add(axisPointWorld, mul(axisDirUnit, -L));

    const polyOriginal = figureWorldPolyline(original, 80);
    const polyMirrored = figureWorldPolyline(mirrored, 80);

    return (
      <>
        <Line
          points={[p1.x, p1.y, p2.x, p2.y]}
          stroke={previewStroke}
          strokeWidth={1 / scale}
          dash={previewDash}
          opacity={0.85}
          listening={false}
          lineCap="round"
        />

        <Line
          points={polyOriginal}
          closed={original.closed}
          stroke={previewStroke}
          strokeWidth={2 / scale}
          opacity={0.55}
          listening={false}
          lineCap="round"
          lineJoin="round"
        />

        <Line
          points={polyMirrored}
          closed={mirrored.closed}
          stroke={previewRemoveStroke}
          strokeWidth={2 / scale}
          dash={previewDash}
          opacity={0.8}
          listening={false}
          lineCap="round"
          lineJoin="round"
        />
      </>
    );
  }, [
    figures,
    hoveredMirrorLinkFigureId,
    previewDash,
    previewRemoveStroke,
    previewStroke,
    scale,
    size.height,
    size.width,
    tool,
  ]);

  const dartOverlay = useMemo(() => {
    if (tool !== "dart" || !selectedFigure || !dartDraft) return null;
    if (dartDraft.figureId !== selectedFigure.id) return null;

    const a = getFigureNodePoint(selectedFigure, dartDraft.aNodeId);
    if (!a) return null;

    const b =
      dartDraft.step === "pickB"
        ? hoveredEdge && hoveredEdge.figureId === selectedFigure.id
          ? hoveredEdge.pointLocal
          : null
        : dartDraft.bNodeId
          ? getFigureNodePoint(selectedFigure, dartDraft.bNodeId)
          : null;

    const rawApexLocal = worldToFigureLocal(
      selectedFigure,
      dartDraft.currentWorld
    );
    const precisionSnap =
      dartDraft.precisionSnap || modifierKeys.meta || modifierKeys.ctrl;
    const apexLocal =
      dartDraft.step === "pickApex"
        ? resolveDartApexLocal(
            selectedFigure,
            dartDraft,
            rawApexLocal,
            precisionSnap
          )
        : rawApexLocal;

    const stroke = previewStroke;
    const dash = [6 / scale, 6 / scale];

    return (
      <Group
        x={selectedFigure.x}
        y={selectedFigure.y}
        rotation={selectedFigure.rotation || 0}
        listening={false}
      >
        {a ? (
          <Circle x={a.x} y={a.y} radius={4 / scale} fill={previewStroke} />
        ) : null}

        {b ? (
          <Circle x={b.x} y={b.y} radius={4 / scale} fill={previewStroke} />
        ) : null}

        {a && b && dartDraft.step === "pickB"
          ? (() => {
              const lengthPx = dist(a, b);
              const mid = lerp(a, b, 0.5);
              const tangent = sub(b, a);
              const normal = norm(perp(tangent));
              const offset = 12 / scale;
              const p = add(mid, mul(normal, offset));
              const rawAngleDeg =
                (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
              const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);
              const fontSize = 11 / scale;
              const textWidth = 120 / scale;
              const label = formatCm(pxToCm(lengthPx), 2);

              return (
                <>
                  <Line
                    points={[a.x, a.y, b.x, b.y]}
                    stroke={stroke}
                    strokeWidth={1 / scale}
                    dash={dash}
                  />
                  <Text
                    x={p.x}
                    y={p.y}
                    offsetX={textWidth / 2}
                    offsetY={fontSize / 2}
                    rotation={angleDeg}
                    width={textWidth}
                    align="center"
                    text={label}
                    fontSize={fontSize}
                    fill={previewStroke}
                    opacity={0.95}
                    fontStyle="bold"
                    listening={false}
                    name="inaa-dart-preview-ab"
                  />
                </>
              );
            })()
          : null}

        {a && b && dartDraft.step === "pickApex" ? (
          <>
            <Line
              points={[a.x, a.y, apexLocal.x, apexLocal.y]}
              stroke={stroke}
              strokeWidth={1 / scale}
              dash={dash}
            />
            <Line
              points={[apexLocal.x, apexLocal.y, b.x, b.y]}
              stroke={stroke}
              strokeWidth={1 / scale}
              dash={dash}
            />

            {(() => {
              const mid = lerp(a, b, 0.5);
              const heightPx = dist(mid, apexLocal);
              const tangent = sub(apexLocal, mid);
              const normal = norm(perp(tangent));
              const offset = 12 / scale;
              const p = add(lerp(mid, apexLocal, 0.5), mul(normal, offset));
              const rawAngleDeg =
                (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
              const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);
              const fontSize = 11 / scale;
              const textWidth = 120 / scale;
              const label = formatCm(pxToCm(heightPx), 2);

              return (
                <>
                  <Line
                    points={[mid.x, mid.y, apexLocal.x, apexLocal.y]}
                    stroke={stroke}
                    strokeWidth={1 / scale}
                    dash={dash}
                    opacity={0.9}
                  />
                  <Text
                    x={p.x}
                    y={p.y}
                    offsetX={textWidth / 2}
                    offsetY={fontSize / 2}
                    rotation={angleDeg}
                    width={textWidth}
                    align="center"
                    text={label}
                    fontSize={fontSize}
                    fill={previewStroke}
                    opacity={0.95}
                    fontStyle="bold"
                    listening={false}
                    name="inaa-dart-preview-height"
                  />
                </>
              );
            })()}

            <Circle
              x={apexLocal.x}
              y={apexLocal.y}
              radius={4 / scale}
              fill={previewStroke}
            />
          </>
        ) : null}
      </Group>
    );
  }, [
    dartDraft,
    hoveredEdge,
    modifierKeys.ctrl,
    modifierKeys.meta,
    previewStroke,
    scale,
    selectedFigure,
    tool,
  ]);

  return (
    <div className="w-full h-full relative">
      {showRulers ? (
        <>
          <div className="absolute left-0 top-0 w-6 h-6 bg-surface-light dark:bg-surface-dark border-b border-r border-gray-200 dark:border-gray-700" />
          <div className="absolute left-6 top-0 right-0 h-6 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700">
            <Ruler orientation="horizontal" />
          </div>
          <div className="absolute left-0 top-6 bottom-0 w-6 bg-surface-light dark:bg-surface-dark border-r border-gray-200 dark:border-gray-700">
            <Ruler orientation="vertical" />
          </div>
        </>
      ) : null}

      <div
        ref={containerRef}
        data-testid="editor-stage-container"
        className={
          showRulers
            ? "absolute left-6 top-6 right-0 bottom-0"
            : "absolute inset-0"
        }
      >
        <Minimap />
        {cursorBadge && getToolIcon(tool, "cursor") ? (
          <div
            className="pointer-events-none absolute z-50"
            style={{ left: cursorBadge.x + 14, top: cursorBadge.y + 14 }}
          >
            <div
              className={
                "relative flex items-center justify-center rounded-full " +
                "bg-surface-light/90 dark:bg-surface-dark/85 " +
                "shadow-subtle w-8 h-8"
              }
            >
              <span
                className={
                  "pointer-events-none absolute -inset-1 rounded-full " +
                  "ring-2 ring-guide-neon/30 animate-pulse"
                }
              />
              {getToolIcon(tool, "cursor", "w-5 h-5 text-guide-neon")}
            </div>
          </div>
        ) : null}

        {edgeContextMenu ? (
          <div
            data-testid="edge-context-menu"
            className="absolute z-[100] min-w-[220px] bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-1"
            style={{ left: edgeContextMenu.x, top: edgeContextMenu.y }}
            onContextMenu={(evt) => evt.preventDefault()}
            onMouseDown={(evt) => {
              evt.preventDefault();
              evt.stopPropagation();
            }}
          >
            {edgeContextMenu.edgeKind === "line" ? (
              <button
                type="button"
                data-testid="edge-context-convert-to-curve"
                className="w-full text-left text-xs px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                onClick={() => handleConvertContextEdge("cubic")}
              >
                Converter para curva
              </button>
            ) : edgeContextMenu.edgeKind === "cubic" ? (
              <button
                type="button"
                data-testid="edge-context-convert-to-line"
                className="w-full text-left text-xs px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                onClick={() => handleConvertContextEdge("line")}
              >
                Converter para linha
              </button>
            ) : null}

            {(() => {
              const fig = figures.find(
                (f) => f.id === edgeContextMenu.figureId
              );
              if (!fig?.mirrorLink) return null;
              return (
                <>
                  <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                  <button
                    type="button"
                    className="w-full text-left text-xs px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                    onClick={handleContextDesespelhar}
                  >
                    Desespelhar
                  </button>
                  <button
                    type="button"
                    className="w-full text-left text-xs px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                    onClick={handleContextUnlinkMirror}
                  >
                    Desvincular espelho
                  </button>
                </>
              );
            })()}
          </div>
        ) : null}

        {edgeEditDraft ? (
          <div
            className="absolute z-50"
            style={{ left: edgeEditDraft.x, top: edgeEditDraft.y }}
          >
            <div className="flex items-center gap-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-subtle px-2 py-1">
              <input
                ref={(node) => {
                  edgeEditInputRef.current = node;
                }}
                className="w-24 bg-transparent text-xs text-gray-900 dark:text-gray-100 outline-none text-right"
                inputMode="decimal"
                value={edgeEditDraft.value}
                onChange={(evt) => {
                  const next = evt.target.value;
                  setEdgeEditDraft((prev) =>
                    prev ? { ...prev, value: next } : prev
                  );
                }}
                onKeyDown={(evt) => {
                  const applyDraft =
                    selectedEdge &&
                    selectedEdge.figureId === edgeEditDraft.figureId &&
                    selectedEdge.edgeId === edgeEditDraft.edgeId
                      ? {
                          figureId: edgeEditDraft.figureId,
                          edgeId: edgeEditDraft.edgeId,
                          anchor: selectedEdge.anchor,
                        }
                      : {
                          figureId: edgeEditDraft.figureId,
                          edgeId: edgeEditDraft.edgeId,
                          anchor: edgeEditDraft.anchor,
                        };

                  if (evt.key === "ArrowUp" || evt.key === "ArrowDown") {
                    evt.preventDefault();
                    const dir: 1 | -1 = evt.key === "ArrowUp" ? 1 : -1;
                    const next = bumpNumericValue({
                      raw: edgeEditDraft.value,
                      fallback: parseCmInput(edgeEditDraft.value) ?? 0.01,
                      direction: dir,
                      step: 0.1,
                      min: 0.01,
                    });
                    const nextStr = formatPtBrDecimalFixed(next, 2);
                    setEdgeEditDraft((prev) =>
                      prev ? { ...prev, value: nextStr } : prev
                    );
                    applyEdgeLengthEdit(applyDraft, nextStr);
                    return;
                  }
                  if (evt.key === "Escape") {
                    evt.preventDefault();
                    setEdgeEditDraft(null);
                  }
                  if (evt.key === "Enter") {
                    evt.preventDefault();
                    applyEdgeLengthEdit(applyDraft, edgeEditDraft.value);
                    setEdgeEditDraft(null);
                  }
                }}
                onWheel={(evt) => {
                  if (document.activeElement !== evt.currentTarget) return;
                  evt.preventDefault();
                  evt.stopPropagation();
                  const dir: 1 | -1 = evt.deltaY < 0 ? 1 : -1;
                  const next = bumpNumericValue({
                    raw: edgeEditDraft.value,
                    fallback: parseCmInput(edgeEditDraft.value) ?? 0.01,
                    direction: dir,
                    step: 0.1,
                    min: 0.01,
                  });
                  const nextStr = formatPtBrDecimalFixed(next, 2);
                  setEdgeEditDraft((prev) =>
                    prev ? { ...prev, value: nextStr } : prev
                  );
                  const applyDraft =
                    selectedEdge &&
                    selectedEdge.figureId === edgeEditDraft.figureId &&
                    selectedEdge.edgeId === edgeEditDraft.edgeId
                      ? {
                          figureId: edgeEditDraft.figureId,
                          edgeId: edgeEditDraft.edgeId,
                          anchor: selectedEdge.anchor,
                        }
                      : {
                          figureId: edgeEditDraft.figureId,
                          edgeId: edgeEditDraft.edgeId,
                          anchor: edgeEditDraft.anchor,
                        };
                  applyEdgeLengthEdit(applyDraft, nextStr);
                }}
                onBlur={() => {
                  const applyDraft =
                    selectedEdge &&
                    selectedEdge.figureId === edgeEditDraft.figureId &&
                    selectedEdge.edgeId === edgeEditDraft.edgeId
                      ? {
                          figureId: edgeEditDraft.figureId,
                          edgeId: edgeEditDraft.edgeId,
                          anchor: selectedEdge.anchor,
                        }
                      : {
                          figureId: edgeEditDraft.figureId,
                          edgeId: edgeEditDraft.edgeId,
                          anchor: edgeEditDraft.anchor,
                        };
                  applyEdgeLengthEdit(applyDraft, edgeEditDraft.value);
                  setEdgeEditDraft(null);
                }}
              />
              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                cm
              </span>
            </div>
          </div>
        ) : null}

        {textEditDraft ? (
          <div
            className="absolute z-50"
            style={{ left: textEditDraft.x, top: textEditDraft.y }}
            onMouseDown={(evt) => {
              evt.preventDefault();
              evt.stopPropagation();
            }}
          >
            <div className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-subtle p-2">
              <textarea
                data-testid="text-inline-editor"
                ref={(node) => {
                  textEditTextareaRef.current = node;
                }}
                className="bg-transparent text-xs text-gray-900 dark:text-gray-100 outline-none resize-none"
                style={{
                  width: textEditDraft.width,
                  height: textEditDraft.height,
                }}
                value={textEditDraft.value}
                placeholder="Texto"
                onChange={(evt) => {
                  const next = evt.target.value;
                  setTextEditDraft((prev) =>
                    prev ? { ...prev, value: next, didEdit: true } : prev
                  );
                }}
                onKeyDown={(evt) => {
                  if (evt.key === "Escape") {
                    evt.preventDefault();
                    skipNextTextBlurRef.current = true;
                    if (textEditDraft.isNew && !textEditDraft.didEdit) {
                      removeTextFigure(textEditDraft.figureId);
                    }
                    setTextEditDraft(null);
                    return;
                  }
                  if (evt.key === "Enter" && (evt.metaKey || evt.ctrlKey)) {
                    evt.preventDefault();
                    skipNextTextBlurRef.current = true;
                    applyTextEdit(textEditDraft.figureId, textEditDraft.value);
                    setTextEditDraft(null);
                  }
                }}
                onBlur={() => {
                  if (skipNextTextBlurRef.current) {
                    skipNextTextBlurRef.current = false;
                    return;
                  }

                  const trimmed = (textEditDraft.value ?? "").trim();
                  if (textEditDraft.didEdit) {
                    applyTextEdit(textEditDraft.figureId, textEditDraft.value);
                    setTextEditDraft(null);
                    return;
                  }

                  // If the user never typed and this was a freshly created text,
                  // discard it (avoid writing placeholder text into the canvas).
                  if (textEditDraft.isNew && trimmed === "") {
                    removeTextFigure(textEditDraft.figureId);
                    setTextEditDraft(null);
                    return;
                  }

                  // Otherwise, just close without mutating.
                  setTextEditDraft(null);
                }}
              />
              <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                {isMac
                  ? "⌘⏎ aplica • Esc cancela"
                  : "Ctrl+Enter aplica • Esc cancela"}
              </div>
            </div>
          </div>
        ) : null}

        <Stage
          ref={(node) => {
            stageRef.current = node;
            registerStage(node);
          }}
          width={size.width}
          height={size.height}
          scaleX={scale}
          scaleY={scale}
          x={position.x}
          y={position.y}
          onDblClick={handleStageDblClick}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={(e) => {
            handlePointerMove(e);
            handleCurvePointerMove(e);
          }}
          onPointerUp={handlePointerUp}
          onContextMenu={(e) => {
            // Disable browser context menu inside the canvas.
            e.evt.preventDefault();

            const stage = stageRef.current;
            if (!stage) return;

            stage.setPointersPositions(e.evt);
            const pos = stage.getPointerPosition();
            if (!pos) return;

            const world = {
              x: (pos.x - position.x) / scale,
              y: (pos.y - position.y) / scale,
            };

            const thresholdWorld = 12 / scale;
            const edgePick = findNearestEdgeAcrossFigures(
              figures,
              world,
              thresholdWorld
            );
            const fig = edgePick?.figure ?? null;
            const edge = edgePick?.edge ?? null;
            if (!fig || fig.kind === "seam") {
              setEdgeContextMenu(null);
              return;
            }

            // If it's not near an edge and not a mirrored figure, do nothing.
            if (!edge && !fig.mirrorLink) {
              setEdgeContextMenu(null);
              return;
            }

            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;

            // Select for discoverability.
            setSelectedFigureIds([fig.id]);
            setSelectedEdge(
              edge
                ? {
                    figureId: fig.id,
                    edgeId: edge.id,
                    anchor: "mid",
                  }
                : null
            );

            setEdgeEditDraft(null);
            setEdgeContextMenu({
              x: e.evt.clientX - rect.left,
              y: e.evt.clientY - rect.top,
              figureId: fig.id,
              edgeId: edge ? edge.id : null,
              edgeKind: edge ? edge.kind : null,
            });
          }}
        >
          <Layer id="grid-layer">
            {/* Background hit target */}
            <Rect
              ref={backgroundRef}
              x={-100000}
              y={-100000}
              width={200000}
              height={200000}
              fill="#000000"
              opacity={0.01}
              listening
            />

            {gridLines.map((l, idx) => (
              <Line
                key={idx}
                points={l.points}
                stroke={gridStroke}
                strokeWidth={1 / scale}
                listening={false}
              />
            ))}

            {pageGuides}
          </Layer>

          <Layer id="figures-layer">
            {figures.map((fig) => {
              const isSeam = fig.kind === "seam" && !!fig.parentId;
              const baseId = isSeam ? fig.parentId! : fig.id;
              const isSelected = selectedIdsSet.has(baseId);
              const isRemovePreview =
                tool === "offset" &&
                hoveredOffsetBaseId != null &&
                offsetRemoveMode &&
                !hoveredOffsetEdge &&
                isSeam &&
                fig.parentId === hoveredOffsetBaseId;
              const isHoverFigure =
                tool === "select" &&
                !edgeSelectMode &&
                hoveredSelectFigureId != null &&
                hoveredSelectFigureId === baseId;
              const stroke = isRemovePreview
                ? previewRemoveStroke
                : isSelected
                  ? "#2563eb"
                  : isHoverFigure
                    ? "#3b82f6"
                    : resolveStrokeColor(fig.stroke, isDark);
              const hasSelectedEdge =
                !!selectedEdge && selectedEdge.figureId === baseId;
              const dimFactor = hasSelectedEdge ? (isSeam ? 0.5 : 0.25) : 1;
              const opacity = isRemovePreview
                ? 0.95
                : (fig.opacity ?? 1) * (isSeam ? 0.7 : 1) * dimFactor;
              const strokeWidth = (fig.strokeWidth || 1) / scale;
              const dash = fig.dash
                ? fig.dash.map((d) => d / scale)
                : undefined;

              const hitStrokeWidth =
                tool === "select" && selectedIdsSet.has(baseId)
                  ? 24 / scale
                  : 10 / scale;

              const tr = getRuntimeFigureTransform(fig);

              const showNodes =
                nodesDisplayMode !== "never" &&
                fig.kind !== "seam" &&
                (nodesDisplayMode === "always" ||
                  fig.id === selectedFigureId ||
                  fig.id === hoveredFigureId);

              const showMeasures =
                measureDisplayMode !== "never" &&
                fig.kind !== "seam" &&
                (measureDisplayMode === "always" ||
                  fig.id === selectedFigureId ||
                  fig.id === hoveredFigureId);

              const showSeamLabel =
                fig.kind === "seam" &&
                (tool === "offset" ||
                  measureDisplayMode === "always" ||
                  (measureDisplayMode === "hover" &&
                    (baseId === selectedFigureId ||
                      baseId === hoveredFigureId)));

              const seamBaseCentroidLocal = showSeamLabel
                ? (() => {
                    const base = fig.parentId
                      ? (figuresById.get(fig.parentId) ?? null)
                      : null;
                    const c = base
                      ? figureCentroidLocal(base)
                      : figureCentroidLocal(fig);
                    return c;
                  })()
                : null;

              return (
                <MemoizedFigure
                  key={fig.id}
                  name={`fig_${fig.id}`}
                  forwardRef={(node) => {
                    if (node) {
                      figureNodeRefs.current.set(fig.id, node);
                      node.setAttr("figureId", fig.id);
                    } else {
                      figureNodeRefs.current.delete(fig.id);
                    }
                  }}
                  figure={fig}
                  x={tr.x}
                  y={tr.y}
                  rotation={tr.rotation}
                  scale={scale}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  dash={dash}
                  hitStrokeWidth={hitStrokeWidth}
                  hitFillEnabled={
                    tool !== "select" ||
                    selectedIdsSet.has(baseId) ||
                    !isEffectivelyTransparentFill(fig.fill)
                  }
                  draggable={(() => {
                    // Select-tool dragging is handled at the Stage level to keep
                    // behavior consistent for single/multi selection (and seams).
                    return false;
                  })()}
                  showNodes={showNodes}
                  nodeStrokeOverride={
                    fig.mirrorLink?.role === "mirror" &&
                    fig.mirrorLink.sync === true
                      ? "#22c55e"
                      : undefined
                  }
                  showMeasures={showMeasures}
                  pointLabelsMode={pointLabelsMode}
                  pointLabelsByNodeId={nodeLabelsByFigureId.get(fig.id) ?? null}
                  showSeamLabel={showSeamLabel}
                  seamBaseCentroidLocal={seamBaseCentroidLocal}
                  isDark={isDark}
                  selectedEdge={selectedEdge}
                  hoveredEdge={hoveredMeasureEdge}
                  hoveredSelectEdge={hoveredSelectEdge}
                  hoveredPiqueId={
                    hoveredPique?.figureId === fig.id
                      ? hoveredPique.piqueId
                      : null
                  }
                  showNameHandle={
                    tool === "select" &&
                    selectedFigureIds.length === 1 &&
                    selectedFigureId === baseId &&
                    fig.kind !== "seam" &&
                    !!(fig.name ?? "").trim()
                  }
                  onNameOffsetChange={(figureId, nextOffsetLocal) => {
                    setFigures(
                      (prev) =>
                        prev.map((f) =>
                          f.id === figureId
                            ? { ...f, nameOffsetLocal: nextOffsetLocal }
                            : f
                        ),
                      false
                    );
                  }}
                  onNameOffsetCommit={(figureId, nextOffsetLocal) => {
                    setFigures((prev) =>
                      prev.map((f) =>
                        f.id === figureId
                          ? { ...f, nameOffsetLocal: nextOffsetLocal }
                          : f
                      )
                    );
                  }}
                  onPointerDown={(e) => {
                    const evtAny = e.evt as MouseEvent;
                    const buttons = (evtAny.buttons ?? 0) as number;
                    const button = (evtAny.button ?? 0) as number;
                    const isMiddlePressed = (buttons & 4) === 4 || button === 1;

                    // Pan should work anywhere and must not select figures.
                    // Do not stop propagation so Stage handlers can start panning.
                    if (tool === "pan" || isMiddlePressed) {
                      return;
                    }

                    // Select tool: let the Stage handler perform edge-priority picking.
                    // We only intercept here for Option/Alt edge sub-selection.
                    if (tool === "select" && !e.evt.altKey) {
                      return;
                    }

                    if (tool === "node") {
                      if (baseId && selectedFigureId !== baseId) {
                        setSelectedFigureIds([baseId]);
                        return;
                      }
                      // If already selected, allow Stage to handle split clicks.
                      return;
                    }

                    const allowStageForDrawing =
                      tool === "line" ||
                      tool === "pen" ||
                      tool === "curve" ||
                      tool === "rectangle" ||
                      tool === "circle" ||
                      tool === "measure" ||
                      tool === "dart" ||
                      tool === "text" ||
                      tool === "pique";

                    if (allowStageForDrawing) {
                      return;
                    }

                    e.cancelBubble = true;

                    const base = figures.find((f) => f.id === baseId);
                    if (!base) {
                      if (tool === "select") {
                        if (e.evt.shiftKey) {
                          toggleSelectedFigureId(baseId);
                        } else if (selectedIdsSet.has(baseId)) {
                          // Keep multi-selection; just make this the primary selection.
                          setSelectedFigureIds([
                            baseId,
                            ...selectedFigureIds.filter((id) => id !== baseId),
                          ]);
                        } else {
                          setSelectedFigureIds([baseId]);
                        }
                      } else {
                        setSelectedFigureId(baseId);
                      }
                      return;
                    }

                    // Select tool: Option/Alt + click selects a single edge (sub-selection).
                    if (tool === "select" && e.evt.altKey) {
                      const stage = stageRef.current;
                      if (!stage) return;
                      stage.setPointersPositions(e.evt);
                      const pos = stage.getPointerPosition();
                      if (!pos) return;

                      const world = {
                        x: (pos.x - position.x) / scale,
                        y: (pos.y - position.y) / scale,
                      };

                      const local = worldToFigureLocal(base, world);
                      const hit = findNearestEdge(base, local);
                      const thresholdWorld = 10 / scale;
                      if (!hit.best || hit.bestDist > thresholdWorld) {
                        return;
                      }

                      const edge = base.edges.find(
                        (ed) => ed.id === hit.best!.edgeId
                      );
                      if (!edge) return;
                      const nFrom = base.nodes.find((n) => n.id === edge.from);
                      const nTo = base.nodes.find((n) => n.id === edge.to);
                      if (!nFrom || !nTo) return;
                      const dFrom = dist(local, { x: nFrom.x, y: nFrom.y });
                      const dTo = dist(local, { x: nTo.x, y: nTo.y });
                      const preferredAnchor = getEdgeAnchorPreference(
                        baseId,
                        edge.id
                      );
                      const anchor =
                        preferredAnchor ?? (dFrom <= dTo ? "start" : "end");

                      // Keep figure selected for context, but also track the selected edge.
                      setSelectedFigureIds([baseId]);
                      setSelectedEdge({
                        figureId: baseId,
                        edgeId: edge.id,
                        anchor,
                      });
                      return;
                    }

                    if (tool === "select") {
                      if (e.evt.shiftKey) {
                        toggleSelectedFigureId(baseId);
                      } else if (selectedIdsSet.has(baseId)) {
                        // Keep multi-selection; just make this the primary selection.
                        setSelectedFigureIds([
                          baseId,
                          ...selectedFigureIds.filter((id) => id !== baseId),
                        ]);
                      } else {
                        setSelectedFigureIds([baseId]);
                      }
                      return;
                    }

                    if (tool === "mirror") {
                      setSelectedFigureId(baseId);
                      if (base.mirrorLink) {
                        toast(
                          "Esta forma já está espelhada. Use Desespelhar (G) para desfazer.",
                          "error"
                        );
                        return;
                      }

                      const stage = stageRef.current;
                      if (!stage) return;
                      stage.setPointersPositions(e.evt);
                      const pos = stage.getPointerPosition();
                      if (!pos) return;

                      const world = {
                        x: (pos.x - position.x) / scale,
                        y: (pos.y - position.y) / scale,
                      };

                      const local = worldToFigureLocal(base, world);
                      const hit = findNearestEdge(base, local);
                      const thresholdWorld = 10 / scale;
                      if (!hit.best || hit.bestDist > thresholdWorld) {
                        toast(
                          "Passe o mouse em uma aresta para definir o eixo e clique para espelhar.",
                          "error"
                        );
                        return;
                      }

                      const edge =
                        base.edges.find((ed) => ed.id === hit.best!.edgeId) ??
                        null;
                      if (!edge) return;

                      const hoverWorld = figureLocalToWorld(
                        base,
                        hit.best.pointLocal
                      );
                      const side = pickMirrorSideByScreenBBox(
                        base,
                        hoverWorld,
                        {
                          position,
                          scale,
                        }
                      );

                      const anchorNodeId = pickAnchorNodeIdForEdgeSide(
                        base,
                        edge,
                        side,
                        {
                          position,
                          scale,
                        }
                      );

                      const anchorNode =
                        base.nodes.find((n) => n.id === anchorNodeId) ?? null;

                      const axisPointWorld = anchorNode
                        ? figureLocalToWorld(base, {
                            x: anchorNode.x,
                            y: anchorNode.y,
                          })
                        : hoverWorld;
                      const axisDirUnit = axisDirForSide(side);

                      const mirrored = mirrorFigureAcrossLineAnchored(
                        base,
                        axisPointWorld,
                        axisDirUnit,
                        anchorNodeId
                      );

                      const pairId = id("ml");
                      const baseWithLink: Figure = {
                        ...base,
                        mirrorLink: {
                          pairId,
                          otherId: mirrored.id,
                          role: "original",
                          sync: true,
                          anchorNodeId,
                          axisPointWorld,
                          axisDirWorld: axisDirUnit,
                        },
                      };
                      const mirroredWithLink: Figure = {
                        ...mirrored,
                        mirrorLink: {
                          pairId,
                          otherId: base.id,
                          role: "mirror",
                          sync: true,
                          anchorNodeId,
                          axisPointWorld,
                          axisDirWorld: axisDirUnit,
                        },
                      };

                      setFigures((prev) => [
                        ...prev.map((f) =>
                          f.id === base.id ? baseWithLink : f
                        ),
                        mirroredWithLink,
                      ]);
                      return;
                    }

                    if (tool === "unfold") {
                      setSelectedFigureId(baseId);
                      const link = base.mirrorLink;
                      if (!link) {
                        toast(
                          "Esta forma não está espelhada. Use Espelhar (F) primeiro.",
                          "error"
                        );
                        return;
                      }

                      const other =
                        figures.find((f) => f.id === link.otherId) ?? null;
                      if (!other) {
                        // Link is stale; just clear it.
                        setFigures((prev) =>
                          prev.map((f) =>
                            f.id === base.id
                              ? { ...f, mirrorLink: undefined }
                              : f
                          )
                        );
                        return;
                      }

                      const originalId =
                        link.role === "mirror" ? other.id : base.id;
                      const mirrorId =
                        link.role === "mirror" ? base.id : other.id;

                      setFigures((prev) =>
                        prev
                          .filter(
                            (f) =>
                              f.id !== mirrorId &&
                              !(f.kind === "seam" && f.parentId === mirrorId)
                          )
                          .map((f) => {
                            if (f.id === originalId || f.id === mirrorId) {
                              return { ...f, mirrorLink: undefined };
                            }
                            return f;
                          })
                      );

                      setSelectedFigureId(originalId);
                      return;
                    }

                    if (tool === "offset") {
                      setSelectedFigureId(baseId);
                      setOffsetTargetId(baseId);

                      const existingSeam =
                        figures.find(
                          (f) => f.kind === "seam" && f.parentId === baseId
                        ) ?? null;
                      const isRemoveIntent = e.evt.metaKey || e.evt.ctrlKey;

                      if (
                        hoveredOffsetEdge &&
                        hoveredOffsetEdge.figureId === baseId &&
                        base.tool !== "circle"
                      ) {
                        const edgeId = hoveredOffsetEdge.edgeId;
                        if (existingSeam) {
                          const currentOffsets = existingSeam.offsetCm;
                          let nextOffsets: Record<string, number> = {};

                          if (typeof currentOffsets === "number") {
                            for (const edge of base.edges) {
                              nextOffsets[edge.id] = currentOffsets;
                            }
                          } else if (
                            currentOffsets &&
                            typeof currentOffsets === "object"
                          ) {
                            nextOffsets = { ...currentOffsets };
                          }

                          if (isRemoveIntent) {
                            if (
                              nextOffsets[edgeId] &&
                              nextOffsets[edgeId] > 0
                            ) {
                              delete nextOffsets[edgeId];
                            }
                          } else {
                            nextOffsets[edgeId] = offsetValueCm;
                          }

                          if (Object.keys(nextOffsets).length === 0) {
                            if (isRemoveIntent) {
                              setFigures((prev) =>
                                prev.filter((f) => f.id !== existingSeam.id)
                              );
                            }
                            return;
                          }

                          const updated = recomputeSeamFigure(
                            base,
                            existingSeam,
                            nextOffsets
                          );
                          if (updated) {
                            setFigures((prev) =>
                              prev.map((f) =>
                                f.id === existingSeam.id ? updated : f
                              )
                            );
                          }
                        } else {
                          if (!isRemoveIntent) {
                            const seam = makeSeamFigure(base, {
                              [edgeId]: offsetValueCm,
                            });
                            if (seam) {
                              setFigures((prev) => [...prev, seam]);
                            }
                          }
                        }
                        return;
                      }

                      if (isRemoveIntent) {
                        if (existingSeam) {
                          setFigures((prev) =>
                            prev.filter(
                              (f) =>
                                !(f.kind === "seam" && f.parentId === baseId)
                            )
                          );
                        }
                        return;
                      }

                      if (existingSeam) {
                        const updated = recomputeSeamFigure(
                          base,
                          existingSeam,
                          offsetValueCm
                        );
                        if (updated) {
                          setFigures((prev) =>
                            prev.map((f) =>
                              f.id === existingSeam.id ? updated : f
                            )
                          );
                        }
                        return;
                      }

                      const seam = makeSeamFigure(base, offsetValueCm);
                      if (!seam) return;
                      setFigures((prev) => [...prev, seam]);
                      return;
                    }

                    setSelectedFigureId(baseId);
                  }}
                />
              );
            })}
          </Layer>

          <Layer id="ui-layer">
            {guidesOverlay}

            <Transformer
              ref={transformerRef}
              enabledAnchors={(() => {
                if (tool !== "select") return [];

                // Level-of-detail at low zoom: keep the UI clean and avoid
                // oversized handles relative to tiny shapes.
                if (scale <= 0.45) {
                  return [
                    "top-left",
                    "top-right",
                    "bottom-left",
                    "bottom-right",
                  ];
                }

                return [
                  "top-left",
                  "top-center",
                  "top-right",
                  "middle-left",
                  "middle-right",
                  "bottom-left",
                  "bottom-center",
                  "bottom-right",
                ];
              })()}
              rotateEnabled={tool === "select"}
              keepRatio={transformMods.shift}
              centeredScaling={transformMods.alt}
              rotationSnaps={
                transformMods.shift
                  ? [
                      0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180,
                      195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345,
                    ]
                  : []
              }
              rotateSnapTolerance={4}
              flipEnabled={false}
              // Sizes are specified in screen px, then converted to world-space
              // so the UI remains stable across zoom levels.
              anchorSize={(() => {
                const s = Math.max(1e-6, scale);
                const t = Math.sqrt(Math.min(1, s));
                // Smaller handles overall; slightly smaller at low zoom,
                // but clamped so it stays clickable.
                const screenPx = Math.max(6, Math.min(9, 9 * t));
                return screenPx / s;
              })()}
              borderStroke="#2563eb"
              anchorStroke="#2563eb"
              anchorFill="#ffffff"
              borderStrokeWidth={(() => {
                const s = Math.max(1e-6, scale);
                const t = Math.sqrt(Math.min(1, s));
                const screenPx = Math.max(0.6, Math.min(1.0, 0.9 * t));
                return screenPx / s;
              })()}
              anchorStrokeWidth={(() => {
                const s = Math.max(1e-6, scale);
                const t = Math.sqrt(Math.min(1, s));
                const screenPx = Math.max(0.6, Math.min(1.0, 0.9 * t));
                return screenPx / s;
              })()}
              padding={(() => {
                const s = Math.max(1e-6, scale);
                const t = Math.sqrt(Math.min(1, s));
                const screenPx = Math.max(2, Math.min(6, 5 * t));
                return screenPx / s;
              })()}
              rotateAnchorOffset={(() => {
                const s = Math.max(1e-6, scale);
                const t = Math.sqrt(Math.min(1, s));
                const screenPx = Math.max(12, Math.min(22, 18 * t));
                return screenPx / s;
              })()}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) return oldBox;
                return newBox;
              }}
              onTransformEnd={finalizeSelectionTransform}
            />

            {offsetHoverPreview ? (
              <Group
                key={offsetHoverPreview.key}
                x={offsetHoverPreview.x}
                y={offsetHoverPreview.y}
                rotation={offsetHoverPreview.rotation}
                listening={false}
              >
                {offsetHoverPreview.segments ? (
                  offsetHoverPreview.segments.map((segment, idx) => (
                    <Line
                      key={`${offsetHoverPreview.key}:${idx}`}
                      points={segment}
                      closed={false}
                      stroke={offsetHoverPreview.stroke}
                      strokeWidth={2 / scale}
                      dash={offsetHoverPreview.dash.map((d) => d / scale)}
                      opacity={0.55}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                    />
                  ))
                ) : (
                  <Line
                    points={offsetHoverPreview.points}
                    closed={offsetHoverPreview.closed}
                    stroke={offsetHoverPreview.stroke}
                    strokeWidth={2 / scale}
                    dash={offsetHoverPreview.dash.map((d) => d / scale)}
                    opacity={0.55}
                    lineCap="round"
                    lineJoin="round"
                    listening={false}
                  />
                )}
              </Group>
            ) : null}

            {offsetRemovePreview ? (
              <Group
                key={offsetRemovePreview.key}
                x={offsetRemovePreview.x}
                y={offsetRemovePreview.y}
                rotation={offsetRemovePreview.rotation}
                listening={false}
              >
                {offsetRemovePreview.segments ? (
                  offsetRemovePreview.segments.map((segment, idx) => (
                    <Line
                      key={`${offsetRemovePreview.key}:${idx}`}
                      points={segment}
                      closed={false}
                      stroke={offsetRemovePreview.stroke}
                      strokeWidth={2 / scale}
                      dash={offsetRemovePreview.dash.map((d) => d / scale)}
                      opacity={0.7}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                    />
                  ))
                ) : (
                  <Line
                    points={offsetRemovePreview.points}
                    closed={offsetRemovePreview.closed}
                    stroke={offsetRemovePreview.stroke}
                    strokeWidth={2 / scale}
                    dash={offsetRemovePreview.dash.map((d) => d / scale)}
                    opacity={0.7}
                    lineCap="round"
                    lineJoin="round"
                    listening={false}
                  />
                )}
              </Group>
            ) : null}

            {draftPreview}

            {angleLockGuideOverlay}

            {lineDraftPreview}

            {penDraftPreview}

            {curveDraftPreview}

            {draftMeasuresOverlay}

            {edgeHoverOverlay}

            {nodeSplitMeasuresPreviewOverlay}

            {piqueHoverOverlay}

            {mirrorPreviewOverlay}

            {unmirrorPreviewOverlay}

            {dartPickAOverlay}

            {dartOverlay}

            {measureOverlay}

            {magnetOverlay}

            {marqueeDraft ? (
              <Rect
                x={Math.min(
                  marqueeDraft.startWorld.x,
                  marqueeDraft.currentWorld.x
                )}
                y={Math.min(
                  marqueeDraft.startWorld.y,
                  marqueeDraft.currentWorld.y
                )}
                width={Math.abs(
                  marqueeDraft.currentWorld.x - marqueeDraft.startWorld.x
                )}
                height={Math.abs(
                  marqueeDraft.currentWorld.y - marqueeDraft.startWorld.y
                )}
                stroke="#2563eb"
                strokeWidth={1 / scale}
                dash={[6 / scale, 4 / scale]}
                fill="transparent"
                listening={false}
              />
            ) : null}

            {nodeOverlay}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
