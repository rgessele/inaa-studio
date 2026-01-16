"use client";

import {
  bumpNumericValue,
  formatPtBrDecimalFixed,
  parsePtBrDecimal,
} from "@/utils/numericInput";
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
import { PX_PER_CM } from "./constants";
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
import {
  makeSeamFigure,
  recomputeSeamFigure,
  seamSourceSignature,
} from "./seamFigure";

const MIN_ZOOM_SCALE = 0.1;
const MAX_ZOOM_SCALE = 10;
const ZOOM_FACTOR = 1.08;

type Vec2 = { x: number; y: number };

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

type DartDraft = {
  figureId: string;
  step: "pickA" | "pickB" | "pickApex";
  a: EdgeHover;
  b: EdgeHover;
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
  edgeId: string;
  edgeKind: "line" | "cubic";
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

function findHoveredClosedFigureOrSeamBaseId(
  figures: Figure[],
  pWorld: Vec2,
  samples: number
): string | null {
  // Prefer top-most (later in array). If hovering inside a seam, treat it as hovering its base.
  for (let i = figures.length - 1; i >= 0; i--) {
    const fig = figures[i];
    if (!fig.closed) continue;

    const flat = figureWorldPolyline(fig, samples);
    if (flat.length < 6) continue;
    const poly: Vec2[] = [];
    for (let k = 0; k < flat.length; k += 2) {
      poly.push({ x: flat[k], y: flat[k + 1] });
    }
    if (!pointInPolygon(pWorld, poly)) continue;

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

function splitFigureEdge(
  figure: Figure,
  edgeId: string,
  t: number
): { figure: Figure; newNodeId?: string } {
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
  };
}

function walkLoopEdges(
  figure: Figure,
  fromNodeId: string,
  toNodeId: string
): { edgeIds: string[]; ok: boolean } {
  const outMap = new Map<string, FigureEdge[]>();
  for (const e of figure.edges) {
    const list = outMap.get(e.from) ?? [];
    list.push(e);
    outMap.set(e.from, list);
  }

  const edgeIds: string[] = [];
  let current = fromNodeId;
  const visited = new Set<string>();

  for (let safety = 0; safety < figure.edges.length + 2; safety++) {
    if (current === toNodeId) return { edgeIds, ok: true };
    if (visited.has(current)) break;
    visited.add(current);

    const outs = outMap.get(current) ?? [];
    if (outs.length === 0) break;
    const edge = outs[0];
    edgeIds.push(edge.id);
    current = edge.to;
  }

  return { edgeIds, ok: false };
}

function insertDartIntoFigure(
  figure: Figure,
  aLocal: Vec2,
  bLocal: Vec2,
  apexLocal: Vec2
): Figure | null {
  if (!figure.closed) return null;

  // Split at A
  const hitA = findNearestEdge(figure, aLocal);
  if (!hitA.best) return null;
  const splitA = splitFigureEdge(figure, hitA.best.edgeId, hitA.best.t);
  if (!splitA.newNodeId) return null;
  let nextFigure = splitA.figure;
  const aNodeId = splitA.newNodeId;

  // Split at B (re-find after A split)
  const hitB = findNearestEdge(nextFigure, bLocal);
  if (!hitB.best) return null;
  const splitB = splitFigureEdge(nextFigure, hitB.best.edgeId, hitB.best.t);
  if (!splitB.newNodeId) return null;
  nextFigure = splitB.figure;
  const bNodeId = splitB.newNodeId;

  // Decide which direction along loop to replace (pick the shorter chain)
  const pathAB = walkLoopEdges(nextFigure, aNodeId, bNodeId);
  const pathBA = walkLoopEdges(nextFigure, bNodeId, aNodeId);
  if (!pathAB.ok && !pathBA.ok) return null;

  const replaceFrom =
    !pathBA.ok || (pathAB.ok && pathAB.edgeIds.length <= pathBA.edgeIds.length)
      ? { from: aNodeId, to: bNodeId, edgeIds: pathAB.edgeIds }
      : { from: bNodeId, to: aNodeId, edgeIds: pathBA.edgeIds };

  const apexNodeId = id("n");
  const apexNode: FigureNode = {
    id: apexNodeId,
    x: apexLocal.x,
    y: apexLocal.y,
    mode: "corner",
  };

  const remainingEdges = nextFigure.edges.filter(
    (e) => !replaceFrom.edgeIds.includes(e.id)
  );

  const e1: FigureEdge = {
    id: id("e"),
    from: replaceFrom.from,
    to: apexNodeId,
    kind: "line",
  };
  const e2: FigureEdge = {
    id: id("e"),
    from: apexNodeId,
    to: replaceFrom.to,
    kind: "line",
  };

  return {
    ...nextFigure,
    nodes: [...nextFigure.nodes, apexNode],
    edges: [...remainingEdges, e1, e2],
  };
}

function mirrorValue(value: number, axisPos: number): number {
  const d = value - axisPos;
  return axisPos - d;
}

function mirrorVec2(
  p: Vec2,
  axis: "vertical" | "horizontal",
  axisPos: number
): Vec2 {
  if (axis === "vertical") return { x: mirrorValue(p.x, axisPos), y: p.y };
  return { x: p.x, y: mirrorValue(p.y, axisPos) };
}

function mirrorFigure(
  figure: Figure,
  axis: "vertical" | "horizontal",
  axisPos: number
): Figure {
  const mirroredNodes: FigureNode[] = figure.nodes.map((n) => {
    const pWorld = figureLocalToWorld(figure, { x: n.x, y: n.y });
    const p = mirrorVec2(pWorld, axis, axisPos);
    const inH = n.inHandle
      ? mirrorVec2(figureLocalToWorld(figure, n.inHandle), axis, axisPos)
      : undefined;
    const outH = n.outHandle
      ? mirrorVec2(figureLocalToWorld(figure, n.outHandle), axis, axisPos)
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
  };
}

function unfoldFigure(
  figure: Figure,
  axis: "vertical" | "horizontal",
  axisPos: number
): Figure | null {
  const pts = figureWorldPolyline(figure, 60);
  if (pts.length < 4) return null;

  // world polyline points
  const original: Vec2[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    original.push({ x: pts[i], y: pts[i + 1] });
  }
  if (original.length < 2) return null;

  const mirrored = original.map((p) => mirrorVec2(p, axis, axisPos));
  const reversed = [...mirrored].reverse();

  // Merge: original + reversed mirrored, then close
  const merged = [...original, ...reversed];
  if (merged.length < 3) return null;

  const nodes: FigureNode[] = merged.map((p) => ({
    id: id("n"),
    x: p.x,
    y: p.y,
    mode: "corner",
  }));
  const edges: FigureEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    edges.push({ id: id("e"), from: a.id, to: b.id, kind: "line" });
  }

  return {
    ...figure,
    tool: "line",
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    nodes,
    edges,
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
  currentWorld: Vec2;
} | null;

type LineDraft = {
  pointsWorld: Vec2[];
  currentWorld: Vec2;
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
    mirrorAxis,
    unfoldAxis,
    modifierKeys,
    measureSnapStrengthPx,
    measureDisplayMode,
    nodesDisplayMode,
    pointLabelsMode,
    magnetEnabled,
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
  const backgroundRef = useRef<Konva.Rect | null>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [curveDraft, setCurveDraft] = useState<CurveDraft>(null);
  const [lineDraft, setLineDraft] = useState<LineDraft>(null);
  const lineDraftRef = useRef<LineDraft>(null);
  const [nodeSelection, setNodeSelection] = useState<NodeSelection>(null);
  const [nodeMergePreview, setNodeMergePreview] = useState<{
    figureId: string;
    fromNodeId: string;
    toNodeId: string;
  } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<EdgeHover>(null);
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
    if (!base.closed) return null;

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

  const selectionDragSyncRef = useRef<{
    anchorFigureId: string;
    affectedIds: string[];
    startPositions: Map<string, Vec2>;
    startBounds: BoundingBox | null;
  } | null>(null);

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
      setFigures((prev) =>
        prev.map((f) =>
          affected.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f
        )
      );
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
  }, [setFigures]);

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
        tool === "text";
      const isMeasure = tool === "measure";

      const shouldSnap = (magnetEnabled && isDrawingTool) || isMeasure;
      if (!shouldSnap) {
        return { world: worldRaw, snap: { isSnapped: false } };
      }

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
    [figures, guides, magnetEnabled, measureSnapStrengthPx, scale, tool]
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

    for (const seam of figures) {
      if (seam.kind !== "seam" || !seam.parentId) continue;
      const base = byId.get(seam.parentId);
      if (!base) {
        toRemove.add(seam.id);
        continue;
      }

      const sig = seamSourceSignature(base, seam.offsetCm ?? 1);
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

    if (!toRemove.size && !toUpdate.size) return;

    setFigures((prev) => {
      let changed = false;
      const byId = new Map(prev.map((f) => [f.id, f] as const));

      const next: typeof prev = [];
      for (const f of prev) {
        if (toRemove.has(f.id)) {
          changed = true;
          continue;
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

  const handleConvertContextEdge = useCallback(
    (kind: "cubic" | "line") => {
      if (!edgeContextMenu) return;
      const { figureId, edgeId } = edgeContextMenu;

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
      const newFig: Figure = {
        id: id("fig"),
        tool: "text",
        x: resolvedDown.world.x,
        y: resolvedDown.world.y,
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

      const pickedId = pickFigureIdByEdgePriority(figures, world, {
        thresholdWorld,
        samples: 60,
      });

      if (pickedId) {
        // Reset any in-progress direct drag candidate.
        selectDirectDragRef.current = null;

        if (e.evt.metaKey || e.evt.ctrlKey) {
          const fig = figures.find((f) => f.id === pickedId) ?? null;
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
          toggleSelectedFigureId(pickedId);
        } else {
          setSelectedFigureIds([pickedId]);

          // Market-standard: click+drag should move immediately even if the
          // figure wasn't selected before. We implement a Stage-level drag so it
          // works regardless of Konva hit-testing/z-order.
          if (!selectedIdsSet.has(pickedId)) {
            if (e.evt instanceof PointerEvent) {
              try {
                stage.container().setPointerCapture(e.evt.pointerId);
              } catch {
                // ignore
              }
            }

            selectDirectDragRef.current = {
              active: false,
              anchorFigureId: pickedId,
              affectedIds: [],
              startPositions: new Map(),
              startBounds: null,
              startWorld: world,
              lastWorld: world,
            };
          }
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
    if (resolvedDown.snap.isSnapped && magnetEnabled && tool !== "measure") {
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
        if (nextPoints.length === 0) return null;
        return { pointsWorld: nextPoints, currentWorld: world };
      });
      return;
    }

    // Line tool: right click undoes the last placed point.
    if (tool === "line" && e.evt.button === 2) {
      e.evt.preventDefault();
      const current = lineDraftRef.current;
      if (!current) return;

      const nextPoints = current.pointsWorld.slice(0, -1);
      const nextDraft =
        nextPoints.length === 0
          ? null
          : { pointsWorld: nextPoints, currentWorld: worldForTool };
      lineDraftRef.current = nextDraft;
      setLineDraft(nextDraft);
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

    if (tool === "dart") {
      if (!selectedFigure) return;
      const local = worldToFigureLocal(selectedFigure, world);

      if (!dartDraft) {
        if (!hoveredEdge || hoveredEdge.figureId !== selectedFigure.id) return;
        setDartDraft({
          figureId: selectedFigure.id,
          step: "pickB",
          a: hoveredEdge,
          b: null,
          currentWorld: world,
        });
        return;
      }

      if (dartDraft.step === "pickB") {
        if (!hoveredEdge || hoveredEdge.figureId !== selectedFigure.id) return;
        if (dist(dartDraft.a!.pointLocal, hoveredEdge.pointLocal) < 6) return;
        setDartDraft({
          ...dartDraft,
          step: "pickApex",
          b: hoveredEdge,
          currentWorld: world,
        });
        return;
      }

      // pickApex
      const aLocal = dartDraft.a!.pointLocal;
      const bLocal = dartDraft.b!.pointLocal;
      const apexLocal = local;

      setFigures((prev) =>
        prev.map((f) => {
          if (f.id !== selectedFigure.id) return f;
          const next = insertDartIntoFigure(f, aLocal, bLocal, apexLocal);
          return next ?? f;
        })
      );
      setDartDraft(null);
      return;
    }

    if (
      tool === "node" &&
      e.evt.button === 0 &&
      hoveredNodeId &&
      selectedFigureId &&
      selectedFigure &&
      selectedFigure.id === selectedFigureId
    ) {
      setNodeSelection({
        figureId: selectedFigureId,
        nodeId: hoveredNodeId,
        handle: null,
      });
      setHoveredEdge(null);
      return;
    }

    if (
      tool === "node" &&
      e.evt.button === 0 &&
      hoveredEdge &&
      selectedFigureId &&
      selectedFigure &&
      hoveredEdge.figureId === selectedFigureId
    ) {
      // Avoid calling setState (Canvas) inside the figures state updater (EditorProvider).
      const res = splitFigureEdge(
        selectedFigure,
        hoveredEdge.edgeId,
        hoveredEdge.t
      );
      setFigures((prev) =>
        prev.map((f) => (f.id === selectedFigureId ? res.figure : f))
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

      if (!curveDraft) {
        setCurveDraft({
          pointsWorld: [worldForTool],
          currentWorld: worldForTool,
        });
        return;
      }

      const pts = curveDraft.pointsWorld;
      const first = pts[0];
      const last = pts[pts.length - 1];

      const canClose = pts.length >= 3;
      const isCloseClick =
        canClose && dist(worldForTool, first) <= closeTolWorld;

      if (isCloseClick) {
        const finalized = makeCurveFromPoints(pts, true, "aci7");
        if (finalized) {
          setFigures((prev) => [...prev, finalized]);
          setSelectedFigureId(finalized.id);
        }
        setCurveDraft(null);
        return;
      }

      if (last && dist(worldForTool, last) < 0.5) {
        // Ignore near-duplicate clicks.
        setCurveDraft((prev) =>
          prev ? { ...prev, currentWorld: worldForTool } : prev
        );
        return;
      }

      setCurveDraft((prev) =>
        prev
          ? {
              pointsWorld: [...prev.pointsWorld, worldForTool],
              currentWorld: worldForTool,
            }
          : { pointsWorld: [worldForTool], currentWorld: worldForTool }
      );
      return;
    }

    if (tool === "line") {
      const CLOSE_TOL_PX = 10;
      const closeTolWorld = CLOSE_TOL_PX / scale;

      const current = lineDraftRef.current;
      if (!current) {
        const nextDraft = {
          pointsWorld: [worldForTool],
          currentWorld: worldForTool,
        };
        lineDraftRef.current = nextDraft;
        setLineDraft(nextDraft);
        return;
      }

      const pts = current.pointsWorld;
      const first = pts[0];
      const canClose = pts.length >= 3;
      const isCloseClick =
        canClose && dist(worldForTool, first) <= closeTolWorld;

      if (isCloseClick) {
        const closedFig = makePolylineLineFigure(pts, true, "aci7");
        if (closedFig) {
          setFigures((prev) => [...prev, closedFig]);
          setSelectedFigureId(closedFig.id);
        }
        lineDraftRef.current = null;
        setLineDraft(null);
        return;
      }

      const last = pts[pts.length - 1];
      const placedWorld =
        !resolvedDown.snap.isSnapped && e.evt.shiftKey && last
          ? applyLineAngleLock(last, worldForTool)
          : worldForTool;

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
        const nextDraft = { pointsWorld: [a, b], currentWorld: b };
        lineDraftRef.current = nextDraft;
        setLineDraft(nextDraft);
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
      };
      lineDraftRef.current = nextDraft;
      setLineDraft(nextDraft);
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
        const figId = findHoveredFigureId(figures, world, thresholdWorld);
        const fig = figId ? figures.find((f) => f.id === figId) : null;
        if (fig && fig.kind !== "seam") {
          const local = worldToFigureLocal(fig, world);
          const hit = findNearestEdge(fig, local);
          setHoveredSelectEdge(
            hit.best && hit.bestDist <= edgeThresholdWorld
              ? { figureId: fig.id, edgeId: hit.best.edgeId }
              : null
          );
        } else if (hoveredSelectEdge) {
          setHoveredSelectEdge(null);
        }

        if (hoveredSelectFigureId) setHoveredSelectFigureId(null);
      } else {
        if (hoveredSelectEdge) setHoveredSelectEdge(null);
        const hitId = findHoveredFigureId(figures, world, thresholdWorld);
        const insideId = hitId
          ? null
          : findHoveredClosedFigureOrSeamBaseId(figures, world, 60);
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
        : findHoveredClosedFigureOrSeamBaseId(figures, world, 60);

      const baseId = hitBaseId ?? insideId;
      setHoveredOffsetBaseId((prev) => (prev === baseId ? prev : baseId));
      setOffsetRemoveMode(e.evt.metaKey || e.evt.ctrlKey);

      if (baseId) {
        const base = figures.find((f) => f.id === baseId) ?? null;
        if (base && base.closed) {
          const local = worldToFigureLocal(base, world);
          const hitEdge = findNearestEdge(base, local);
          setHoveredOffsetEdge(
            hitEdge.best && hitEdge.bestDist <= thresholdWorld
              ? { figureId: baseId, edgeId: hitEdge.best.edgeId }
              : null
          );
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
    const worldForTool = resolvedMove.world;

    if (tool !== "measure") {
      if (
        resolvedMove.snap.isSnapped &&
        magnetEnabled &&
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
        : findHoveredClosedFigureOrSeamBaseId(figures, world, 60);
      const nextHoveredId = hitId ?? insideId;
      setHoveredFigureId((prev) =>
        prev === nextHoveredId ? prev : nextHoveredId
      );
    } else if (hoveredFigureId) {
      setHoveredFigureId(null);
    }

    if ((tool === "node" || tool === "dart") && selectedFigure) {
      const local = worldToFigureLocal(selectedFigure, world);

      if (tool === "dart") {
        setDartDraft((prev) =>
          prev ? { ...prev, currentWorld: world } : prev
        );
      }

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
      const nextWorld =
        !resolvedMove.snap.isSnapped && e.evt.shiftKey && last
          ? applyLineAngleLock(last, worldForTool)
          : worldForTool;

      const nextDraft = { ...current, currentWorld: nextWorld };
      lineDraftRef.current = nextDraft;
      setLineDraft(nextDraft);
      return;
    }

    if (!draft) return;

    const mods: DraftMods = { shift: e.evt.shiftKey, alt: e.evt.altKey };
    let effective = { a: draft.startWorld, b: worldForTool };
    if (draft.tool === "rectangle" || draft.tool === "circle") {
      effective = computeRectLikeCorners(draft.startWorld, worldForTool, mods);
    }

    setDraft({
      ...draft,
      currentWorld: worldForTool,
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
      setCurveDraft((prev) =>
        prev ? { ...prev, currentWorld: resolved.world } : prev
      );
    },
    [curveDraft, getSnappedWorldForTool, position.x, position.y, scale]
  );

  const handlePointerUp = () => {
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

    if (!draft) return;

    const a = draft.effectiveAWorld;
    const b = draft.effectiveBWorld;

    const delta = sub(b, a);
    if (len(delta) < 2) {
      setDraft(null);
      return;
    }

    setFigures((prev) => {
      const next = [...prev];
      if (draft.tool === "rectangle") next.push(makeRectFigure(a, b, "aci7"));
      if (draft.tool === "circle") {
        const center: Vec2 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const rx = Math.abs(b.x - a.x) / 2;
        const ry = Math.abs(b.y - a.y) / 2;
        next.push(makeEllipseFigure(center, rx, ry, "aci7"));
      }
      return next;
    });

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

    return (
      <>
        <Line
          points={[a.x, a.y, b.x, b.y]}
          stroke={previewStroke}
          strokeWidth={1 / scale}
          listening={false}
        />
        <Circle
          x={a.x}
          y={a.y}
          radius={3 / scale}
          fill={previewStroke}
          listening={false}
        />
        <Circle
          x={b.x}
          y={b.y}
          radius={3 / scale}
          fill={measureDraft.isSnapped ? "#2563eb" : previewStroke}
          listening={false}
        />
        <Text
          x={tx}
          y={ty}
          text={label}
          fontSize={12 / scale}
          fill={previewStroke}
          listening={false}
        />
      </>
    );
  }, [measureDraft, previewStroke, scale, tool]);

  const magnetOverlay = useMemo(() => {
    if (!magnetEnabled) return null;
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
  }, [magnetEnabled, magnetSnap, previewStroke, scale, tool]);

  useEffect(() => {
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        setDraft(null);
        setCurveDraft(null);
        lineDraftRef.current = null;
        setLineDraft(null);
        dragNodeRef.current = null;
        dragHandleRef.current = null;
      }

      const currentLineDraft = lineDraftRef.current;
      if (tool === "line" && currentLineDraft) {
        if (evt.key === "Enter") {
          evt.preventDefault();
          const pts = currentLineDraft.pointsWorld;
          if (pts.length < 2) {
            lineDraftRef.current = null;
            setLineDraft(null);
            return;
          }

          const finalized = makePolylineLineFigure(pts, false, "aci7");
          if (finalized) {
            setFigures((prev) => [...prev, finalized]);
            setSelectedFigureId(finalized.id);
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
          const nextDraft =
            nextPoints.length === 0
              ? null
              : {
                  pointsWorld: nextPoints,
                  currentWorld: currentLineDraft.currentWorld,
                };
          lineDraftRef.current = nextDraft;
          setLineDraft(nextDraft);
          return;
        }
      }

      if (tool === "curve" && curveDraft) {
        if (evt.key === "Enter") {
          evt.preventDefault();
          const pts = curveDraft.pointsWorld;
          if (pts.length < 2) {
            setCurveDraft(null);
            return;
          }

          const finalized = makeCurveFromPoints(pts, false, "aci7");
          if (finalized) {
            setFigures((prev) => [...prev, finalized]);
            setSelectedFigureId(finalized.id);
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
            if (nextPoints.length === 0) return null;
            return {
              pointsWorld: nextPoints,
              currentWorld: prev.currentWorld,
            };
          });
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [curveDraft, setFigures, setSelectedFigureId, tool]);

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
    const isAltCenter = modifierKeys.alt && fixed.length === 1;
    const pts = isAltCenter
      ? (() => {
          const center = fixed[0];
          const v = sub(live, center);
          const a = sub(center, v);
          const b = add(center, v);
          return [a, b];
        })()
      : [...fixed, live];
    if (pts.length === 0) return null;

    const flat: number[] = [];
    for (const p of pts) {
      flat.push(p.x, p.y);
    }

    const canClose = fixed.length >= 3;
    const first = fixed[0];
    const closeTolWorld = 10 / scale;
    const isCloseHover =
      !!first && canClose && dist(live, first) <= closeTolWorld;

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

  const curveDraftPreview = useMemo(() => {
    if (!curveDraft) return null;
    const CLOSE_TOL_PX = 10;
    const closeTolWorld = CLOSE_TOL_PX / scale;

    const fixed = curveDraft.pointsWorld;
    const live = curveDraft.currentWorld;

    const canClose = fixed.length >= 3;
    const first = fixed[0];
    const isCloseHover = canClose && dist(live, first) <= closeTolWorld;

    const pts = [...fixed, live];
    if (pts.length < 2) return null;

    const fig = makeCurveFromPoints(pts, false, "aci7");
    if (!fig) return null;
    const poly = figureLocalPolyline(fig, 60);
    return (
      <>
        <Line
          points={poly}
          stroke={previewStroke}
          strokeWidth={1 / scale}
          dash={previewDash}
          listening={false}
          lineCap="round"
          lineJoin="round"
        />

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
      const pts = [...curveDraft.pointsWorld, curveDraft.currentWorld];
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
      const pts = [...lineDraft.pointsWorld, lineDraft.currentWorld];
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

                        setNodeMergePreview((prev) => {
                          if (
                            prev &&
                            prev.figureId === ref.figureId &&
                            prev.fromNodeId === ref.nodeId &&
                            prev.toNodeId === bestId
                          ) {
                            return prev;
                          }
                          return {
                            figureId: ref.figureId,
                            fromNodeId: ref.nodeId,
                            toNodeId: bestId,
                          };
                        });
                      }
                    } else {
                      ref.snappedToNodeId = null;

                      setNodeMergePreview((prev) => {
                        if (!prev) return prev;
                        if (
                          prev.figureId === ref.figureId &&
                          prev.fromNodeId === ref.nodeId
                        ) {
                          return null;
                        }
                        return prev;
                      });
                    }
                  }
                  const dx = nx - ref.startNode.x;
                  const dy = ny - ref.startNode.y;

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
                  if (!ref) return;

                  setNodeMergePreview(null);

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
                    const nx = ev.target.x();
                    const ny = ev.target.y();
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
                    const nx = ev.target.x();
                    const ny = ev.target.y();
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

  const dartOverlay = useMemo(() => {
    if (tool !== "dart" || !selectedFigure || !dartDraft) return null;
    if (dartDraft.figureId !== selectedFigure.id) return null;

    const a = dartDraft.a?.pointLocal;
    const b = dartDraft.b?.pointLocal;
    const apexLocal = worldToFigureLocal(
      selectedFigure,
      dartDraft.currentWorld
    );

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
  }, [dartDraft, previewStroke, scale, selectedFigure, tool]);

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
            ) : (
              <button
                type="button"
                data-testid="edge-context-convert-to-line"
                className="w-full text-left text-xs px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                onClick={() => handleConvertContextEdge("line")}
              >
                Converter para linha
              </button>
            )}
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
          onMouseDown={handlePointerDown}
          onMouseMove={(e) => {
            handlePointerMove(e);
            handleCurvePointerMove(e);
          }}
          onMouseUp={handlePointerUp}
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
            const figId = findHoveredFigureId(figures, world, thresholdWorld);
            const fig = figId
              ? (figures.find((f) => f.id === figId) ?? null)
              : null;
            if (!fig || fig.kind === "seam") {
              setEdgeContextMenu(null);
              return;
            }

            const local = worldToFigureLocal(fig, world);
            const hit = findNearestEdge(fig, local);
            if (!hit.best || hit.bestDist > thresholdWorld) {
              setEdgeContextMenu(null);
              return;
            }

            const edge =
              fig.edges.find((ed) => ed.id === hit.best!.edgeId) ?? null;
            if (!edge) {
              setEdgeContextMenu(null);
              return;
            }

            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;

            // Select for discoverability.
            setSelectedFigureIds([fig.id]);
            setSelectedEdge({
              figureId: fig.id,
              edgeId: edge.id,
              anchor: "mid",
            });

            setEdgeEditDraft(null);
            setEdgeContextMenu({
              x: e.evt.clientX - rect.left,
              y: e.evt.clientY - rect.top,
              figureId: fig.id,
              edgeId: edge.id,
              edgeKind: edge.kind,
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
                  draggable={
                    tool === "select" &&
                    selectedIdsSet.has(baseId) &&
                    !selectDirectDragRef.current
                  }
                  showNodes={showNodes}
                  showMeasures={showMeasures}
                  pointLabelsMode={pointLabelsMode}
                  pointLabelsByNodeId={nodeLabelsByFigureId.get(fig.id) ?? null}
                  showSeamLabel={showSeamLabel}
                  seamBaseCentroidLocal={seamBaseCentroidLocal}
                  isDark={isDark}
                  selectedEdge={selectedEdge}
                  hoveredEdge={hoveredMeasureEdge}
                  hoveredSelectEdge={hoveredSelectEdge}
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
                      const bb = figureWorldBoundingBox(base);
                      const axisPos =
                        mirrorAxis === "vertical"
                          ? bb
                            ? bb.x + bb.width / 2
                            : base.x
                          : bb
                            ? bb.y + bb.height / 2
                            : base.y;
                      const mirrored = mirrorFigure(base, mirrorAxis, axisPos);
                      setFigures((prev) => [...prev, mirrored]);
                      return;
                    }

                    if (tool === "unfold") {
                      setSelectedFigureId(baseId);
                      const poly = figureWorldPolyline(base, 60);
                      if (poly.length < 4) return;
                      let axisPos = 0;
                      if (unfoldAxis === "vertical") {
                        let minX = Infinity;
                        for (let i = 0; i < poly.length; i += 2) {
                          minX = Math.min(minX, poly[i]);
                        }
                        axisPos = minX;
                      } else {
                        let minY = Infinity;
                        for (let i = 0; i < poly.length; i += 2) {
                          minY = Math.min(minY, poly[i + 1]);
                        }
                        axisPos = minY;
                      }

                      const unfolded = unfoldFigure(base, unfoldAxis, axisPos);
                      if (!unfolded) return;

                      // Keep same id (preserves selection) and drop old seams (need re-create)
                      const nextUnfolded: Figure = { ...unfolded, id: base.id };
                      setFigures((prev) =>
                        prev
                          .filter(
                            (f) =>
                              !(f.kind === "seam" && f.parentId === base.id)
                          )
                          .map((f) => (f.id === base.id ? nextUnfolded : f))
                      );
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
                  onDragStart={() => {
                    if (tool !== "select") return;
                    if (!selectedIdsSet.has(baseId)) return;
                    if (selectDirectDragRef.current) return;

                    if (dragPreviewRafRef.current != null) {
                      cancelAnimationFrame(dragPreviewRafRef.current);
                      dragPreviewRafRef.current = null;
                    }
                    dragPreviewPendingRef.current = null;
                    setDragPreviewPositions(null);

                    const stage = stageRef.current;
                    if (!stage) return;

                    const affectedIds = figures
                      .filter(
                        (f) =>
                          selectedIdsSet.has(f.id) ||
                          (f.kind === "seam" &&
                            f.parentId &&
                            selectedIdsSet.has(f.parentId))
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
                      const node = stage.findOne(`.fig_${id}`);
                      if (!node) continue;
                      startPositions.set(id, { x: node.x(), y: node.y() });
                    }

                    selectionDragSyncRef.current = {
                      anchorFigureId: fig.id,
                      affectedIds,
                      startPositions,
                      startBounds,
                    };
                  }}
                  onDragMove={(e) => {
                    const sync = selectionDragSyncRef.current;
                    if (!sync) return;
                    if (sync.anchorFigureId !== fig.id) return;
                    if (selectDirectDragRef.current) return;

                    const stage = stageRef.current;
                    if (!stage) return;

                    const anchorStart = sync.startPositions.get(
                      sync.anchorFigureId
                    );
                    if (!anchorStart) return;

                    const desired = { x: e.target.x(), y: e.target.y() };
                    let dx = desired.x - anchorStart.x;
                    let dy = desired.y - anchorStart.y;

                    // Snap the selection bounds (left/center/right and top/center/bottom)
                    // to nearby guide lines for a more intuitive "CAD-like" behavior.
                    const snappedDelta = snapSelectionDeltaToGuides(
                      sync.startBounds ?? null,
                      dx,
                      dy
                    );
                    dx = snappedDelta.dx;
                    dy = snappedDelta.dy;

                    const nextAnchor = {
                      x: anchorStart.x + dx,
                      y: anchorStart.y + dy,
                    };
                    if (
                      nextAnchor.x !== desired.x ||
                      nextAnchor.y !== desired.y
                    ) {
                      e.target.position(nextAnchor);
                    }

                    // Move other selected figures manually using refs
                    for (const id of sync.affectedIds) {
                      if (id === fig.id) continue; // Already moved by Konva
                      const start = sync.startPositions.get(id);
                      if (!start) continue;
                      const node = figureNodeRefs.current.get(id);
                      if (node) {
                        node.position({ x: start.x + dx, y: start.y + dy });
                      }
                    }

                    // Force redraw of layer to show changes immediately
                    const layer = e.target.getLayer();
                    if (layer) layer.batchDraw();
                  }}
                  onDragEnd={(e) => {
                    const sync = selectionDragSyncRef.current;
                    selectionDragSyncRef.current = null;
                    if (!sync || sync.anchorFigureId !== fig.id) return;
                    if (selectDirectDragRef.current) return;

                    const anchorStart = sync.startPositions.get(
                      sync.anchorFigureId
                    );
                    if (!anchorStart) return;

                    const desired = { x: e.target.x(), y: e.target.y() };
                    let dx = desired.x - anchorStart.x;
                    let dy = desired.y - anchorStart.y;

                    const snappedDelta = snapSelectionDeltaToGuides(
                      sync.startBounds ?? null,
                      dx,
                      dy
                    );
                    dx = snappedDelta.dx;
                    dy = snappedDelta.dy;

                    const nextAnchor = {
                      x: anchorStart.x + dx,
                      y: anchorStart.y + dy,
                    };
                    if (
                      nextAnchor.x !== desired.x ||
                      nextAnchor.y !== desired.y
                    ) {
                      e.target.position(nextAnchor);
                    }

                    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
                      dragPreviewPendingRef.current = null;
                      setDragPreviewPositions(null);
                      requestDragPreviewRender();
                      return;
                    }

                    const affected = new Set(sync.affectedIds);
                    setFigures((prev) =>
                      prev.map((f) =>
                        affected.has(f.id)
                          ? { ...f, x: f.x + dx, y: f.y + dy }
                          : f
                      )
                    );

                    // Clear preview; next render uses updated figure positions.
                    dragPreviewPendingRef.current = null;
                    setDragPreviewPositions(null);
                  }}
                />
              );
            })}
          </Layer>

          <Layer id="ui-layer">
            {guidesOverlay}

            <Transformer
              ref={transformerRef}
              enabledAnchors={
                tool === "select"
                  ? [
                      "top-left",
                      "top-center",
                      "top-right",
                      "middle-left",
                      "middle-right",
                      "bottom-left",
                      "bottom-center",
                      "bottom-right",
                    ]
                  : []
              }
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
              anchorSize={10 / scale}
              borderStroke="#2563eb"
              anchorStroke="#2563eb"
              anchorFill="#ffffff"
              borderStrokeWidth={1 / scale}
              anchorStrokeWidth={1 / scale}
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

            {lineDraftPreview}

            {curveDraftPreview}

            {draftMeasuresOverlay}

            {edgeHoverOverlay}

            {nodeSplitMeasuresPreviewOverlay}

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
