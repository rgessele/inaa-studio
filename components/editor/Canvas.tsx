"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import Konva from "konva";
import { useEditor } from "./EditorContext";
import type { Figure, FigureEdge, FigureNode } from "./types";
import { PX_PER_CM } from "./constants";
import { getPaperDimensionsCm } from "./exportSettings";
import { circleAsCubics, len, sampleCubic, sub } from "./figureGeometry";
import { withComputedFigureMeasures } from "./figureMeasures";
import { formatCm, pxToCm } from "./measureUnits";
import {
  figureLocalPolyline,
  figureLocalToWorld,
  figureWorldBoundingBox,
  figureWorldPolyline,
  worldToFigureLocal,
} from "./figurePath";
import { Ruler } from "./Ruler";

const MIN_ZOOM_SCALE = 0.1;
const MAX_ZOOM_SCALE = 10;
const ZOOM_FACTOR = 1.08;

type Vec2 = { x: number; y: number };

type NodeSelection =
  | {
      figureId: string;
      nodeId: string;
      handle: "in" | "out" | null;
    }
  | null;

type EdgeHover =
  | {
      figureId: string;
      edgeId: string;
      t: number;
      pointLocal: Vec2;
      snapKind?: "mid";
    }
  | null;

type DartDraft =
  | {
      figureId: string;
      step: "pickA" | "pickB" | "pickApex";
      a: EdgeHover;
      b: EdgeHover;
      currentWorld: Vec2;
    }
  | null;

type MeasureDraft =
  | {
      startWorld: Vec2;
      endWorld: Vec2;
      snappedEndWorld: Vec2;
      isSnapped: boolean;
    }
  | null;

type MarqueeDraft =
  | {
      startWorld: Vec2;
      currentWorld: Vec2;
      additive: boolean;
    }
  | null;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function id(prefix: string): string {
  // crypto.randomUUID() is available in modern browsers; fallback for safety.
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function mul(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  if (l <= 1e-9) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

function perp(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

function midAndTangent(points: Vec2[]): { mid: Vec2; tangent: Vec2 } | null {
  if (points.length < 2) return null;
  if (points.length === 2) {
    const a = points[0];
    const b = points[1];
    return { mid: lerp(a, b, 0.5), tangent: sub(b, a) };
  }
  const midIndex = Math.floor((points.length - 1) / 2);
  const prev = points[Math.max(0, midIndex - 1)];
  const curr = points[midIndex];
  const next = points[Math.min(points.length - 1, midIndex + 1)];
  return { mid: curr, tangent: sub(next, prev) };
}

type MeasureEdgeHover =
  | {
      figureId: string;
      edgeId: string;
    }
  | null;

function figureCentroidLocal(figure: Figure): Vec2 {
  if (!figure.nodes.length) return { x: 0, y: 0 };
  const sum = figure.nodes.reduce(
    (acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / figure.nodes.length, y: sum.y / figure.nodes.length };
}

function findHoveredFigureId(
  figures: Figure[],
  pWorld: Vec2,
  thresholdWorld: number
): string | null {
  let bestD = Number.POSITIVE_INFINITY;
  let bestId: string | null = null;

  for (const fig of figures) {
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

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
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

function resolveStrokeColor(stroke: string | undefined, isDark: boolean): string {
  if (!stroke) return resolveAci7(isDark);
  const s = stroke.toLowerCase();
  if (s === "aci7") return resolveAci7(isDark);
  // Back-compat: older projects defaulted to black; treat that as "auto".
  if (s === "#000" || s === "#000000") return resolveAci7(isDark);
  return stroke;
}

function pointToSegmentDistance(p: Vec2, a: Vec2, b: Vec2): { d: number; t: number } {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const abLen2 = ab.x * ab.x + ab.y * ab.y;
  if (abLen2 <= 1e-9) return { d: dist(p, a), t: 0 };
  const t = clamp((ap.x * ab.x + ap.y * ab.y) / abLen2, 0, 1);
  const proj = add(a, mul(ab, t));
  return { d: dist(p, proj), t };
}

function normalizeUprightAngleDeg(angleDeg: number): number {
  // Keep text readable by avoiding upside-down rotations.
  // Normalize to [-180, 180), then flip into [-90, 90].
  let a = ((angleDeg + 180) % 360) - 180;
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

function polylineLength(points: Vec2[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += dist(points[i], points[i + 1]);
  }
  return sum;
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

function nearestOnPolylineWorld(pWorld: Vec2, poly: number[]): { d: number; point: Vec2 } | null {
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
      kind: "node" | "edge";
      figureId: string;
    }
  | {
      isSnapped: false;
    };

function snapWorldPoint(
  pWorld: Vec2,
  figures: Figure[],
  opts: {
    thresholdWorld: number;
    excludeSeams?: boolean;
    includeNodes?: boolean;
    excludeFigureIds?: Set<string>;
  }
): SnapResult {
  const threshold = Math.max(0, opts.thresholdWorld);
  if (!Number.isFinite(threshold) || threshold <= 0) return { isSnapped: false };

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
      return { isSnapped: true, pointWorld: bestPoint, kind: "node", figureId: bestFigureId };
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
    return { isSnapped: true, pointWorld: bestPoint, kind: "edge", figureId: bestFigureId };
  }

  return { isSnapped: false };
}

function getNodeById(nodes: FigureNode[], id: string): FigureNode | undefined {
  return nodes.find((n) => n.id === id);
}

function edgeLocalPoints(figure: Figure, edge: FigureEdge, steps: number): Vec2[] {
  const a = getNodeById(figure.nodes, edge.from);
  const b = getNodeById(figure.nodes, edge.to);
  if (!a || !b) return [];

  const p0: Vec2 = { x: a.x, y: a.y };
  const p3: Vec2 = { x: b.x, y: b.y };

  if (edge.kind === "line") return [p0, p3];

  const p1: Vec2 = a.outHandle ? { x: a.outHandle.x, y: a.outHandle.y } : p0;
  const p2: Vec2 = b.inHandle ? { x: b.inHandle.x, y: b.inHandle.y } : p3;
  return sampleCubic(p0, p1, p2, p3, steps);
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

function findNearestEdge(figure: Figure, pLocal: Vec2): { best: EdgeHover; bestDist: number } {
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

function splitFigureEdge(figure: Figure, edgeId: string, t: number): { figure: Figure; newNodeId?: string } {
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
    const newNode: FigureNode = { id: newNodeId, x: mid.x, y: mid.y, mode: "corner" };

    const e1: FigureEdge = { id: id("e"), from: fromNode.id, to: newNodeId, kind: "line" };
    const e2: FigureEdge = { id: id("e"), from: newNodeId, to: toNode.id, kind: "line" };

    const nextEdges = [...figure.edges];
    nextEdges.splice(edgeIndex, 1, e1, e2);

    return {
      figure: {
        ...figure,
        nodes: [...figure.nodes, newNode],
        edges: nextEdges,
      },
      newNodeId,
    };
  }

  const p1: Vec2 = fromNode.outHandle
    ? { x: fromNode.outHandle.x, y: fromNode.outHandle.y }
    : p0;
  const p2: Vec2 = toNode.inHandle ? { x: toNode.inHandle.x, y: toNode.inHandle.y } : p3;

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

  const e1: FigureEdge = { id: id("e"), from: fromNode.id, to: newNodeId, kind: "cubic" };
  const e2: FigureEdge = { id: id("e"), from: newNodeId, to: toNode.id, kind: "cubic" };
  const nextEdges = [...figure.edges];
  nextEdges.splice(edgeIndex, 1, e1, e2);

  return {
    figure: {
      ...figure,
      nodes: [...nextNodes, newNode],
      edges: nextEdges,
    },
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

function mirrorVec2(p: Vec2, axis: "vertical" | "horizontal", axisPos: number): Vec2 {
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

function signedArea(points: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function normalize(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

function lineIntersection(
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  p4: Vec2
): Vec2 | null {
  const x1 = p1.x;
  const y1 = p1.y;
  const x2 = p2.x;
  const y2 = p2.y;
  const x3 = p3.x;
  const y3 = p3.y;
  const x4 = p4.x;
  const y4 = p4.y;

  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;

  const px =
    ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) /
    den;
  const py =
    ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) /
    den;
  return { x: px, y: py };
}

function offsetClosedPolyline(points: Vec2[], offsetPx: number): Vec2[] | null {
  if (points.length < 3) return null;

  // remove duplicate last point if present
  const pts = [...points];
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (dist(first, last) < 1e-6) pts.pop();
  if (pts.length < 3) return null;

  const area = signedArea(pts);
  const outwardSign = area > 0 ? -1 : 1;

  // edge outward normals
  const normals: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = normalize(sub(b, a));
    const left = { x: d.y, y: -d.x };
    normals.push(mul(left, outwardSign));
  }

  const out: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const pPrev = pts[(i - 1 + pts.length) % pts.length];
    const p = pts[i];
    const pNext = pts[(i + 1) % pts.length];

    const nPrev = normals[(i - 1 + normals.length) % normals.length];
    const n = normals[i];

    // offset lines for prev and current edges
    const a1 = add(pPrev, mul(nPrev, offsetPx));
    const a2 = add(p, mul(nPrev, offsetPx));
    const b1 = add(p, mul(n, offsetPx));
    const b2 = add(pNext, mul(n, offsetPx));

    const hit = lineIntersection(a1, a2, b1, b2);
    out.push(hit ?? add(p, mul(n, offsetPx)));
  }

  return out;
}

function makeSeamFigure(base: Figure, offsetValueCm: number): Figure | null {
  if (!base.closed) return null;
  const pts = figureLocalPolyline(base, 60);
  if (pts.length < 6) return null;
  const poly: Vec2[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    poly.push({ x: pts[i], y: pts[i + 1] });
  }
  const offsetPx = offsetValueCm * PX_PER_CM;
  const out = offsetClosedPolyline(poly, offsetPx);
  if (!out) return null;

  const nodes: FigureNode[] = out.map((p) => ({
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
    ...base,
    id: id("fig"),
    kind: "seam",
    parentId: base.id,
    offsetCm: offsetValueCm,
    dash: [5, 5],
    fill: "transparent",
    nodes,
    edges,
  };
}

function recomputeSeamFigure(
  base: Figure,
  seam: Figure,
  offsetValueCm: number
): Figure | null {
  const next = makeSeamFigure(base, offsetValueCm);
  if (!next) return null;
  return {
    ...next,
    id: seam.id,
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

function makeLineFigure(
  a: Vec2,
  b: Vec2,
  tool: Figure["tool"],
  stroke: string
): Figure {
  const n1: FigureNode = { id: id("n"), x: a.x, y: a.y, mode: "corner" };
  const n2: FigureNode = { id: id("n"), x: b.x, y: b.y, mode: "corner" };
  const e: FigureEdge = { id: id("e"), from: n1.id, to: n2.id, kind: "line" };
  return {
    id: id("fig"),
    tool,
    x: 0,
    y: 0,
    rotation: 0,
    closed: false,
    nodes: [n1, n2],
    edges: [e],
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

function makeCircleFigure(center: Vec2, radius: number, stroke: string): Figure {
  const { nodes } = circleAsCubics(radius);
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

type Draft =
  | {
      tool: "line" | "rectangle" | "circle";
      startWorld: Vec2;
      currentWorld: Vec2;
    }
  | null;

type CurveDraft =
  | {
      pointsWorld: Vec2[];
      currentWorld: Vec2;
    }
  | null;

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

    const c1 = add(p1, mul(sub(p2, p0), (tension / 6)));
    const c2 = add(p2, mul(sub(p1, p3), (tension / 6)));

    // Clamp handles to avoid extreme overshoot (keeps it "CAD-ish" and stable)
    const segLen = dist(p1, p2);
    const maxHandle = Math.max(2, segLen * 0.75);
    const c1Clamped = clampHandle(p1, c1, maxHandle);
    const c2Clamped = clampHandle(p2, c2, maxHandle);

    const fromIndex = i1;
    const toIndex = closed ? (i2 % count) : i2;

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
    nodes[nodes.length - 1] = { ...nodes[nodes.length - 1], outHandle: undefined };
  }

  return {
    id: id("fig"),
    tool: "curve",
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
    figures,
    setFigures,
    selectedFigureIds,
    selectedFigureId,
    setSelectedFigureId,
    setSelectedFigureIds,
    toggleSelectedFigureId,
    offsetValueCm,
    setOffsetTargetId,
    mirrorAxis,
    unfoldAxis,
    measureSnapStrengthPx,
    measureDisplayMode,
    nodesDisplayMode,
    magnetEnabled,
    showRulers,
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

  const isDark = useIsDarkMode();
  const aci7 = useMemo(() => resolveAci7(isDark), [isDark]);

  const handleAccentStroke = useMemo(() => {
    if (typeof window === "undefined") return "#776a3e";
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent-gold")
      .trim();
    return v || "#776a3e";
  }, []);
  const gridStroke = useMemo(
    () => {
      const t = clamp(gridContrast, 0, 1);

      // Match previous defaults at t=0.5:
      // dark: 0.07, light: 0.05.
      const darkAlpha = 0.03 + t * (0.11 - 0.03);
      const lightAlpha = 0.02 + t * (0.08 - 0.02);
      const alpha = isDark ? darkAlpha : lightAlpha;
      return isDark
        ? `rgba(255,255,255,${alpha})`
        : `rgba(0,0,0,${alpha})`;
    },
    [gridContrast, isDark]
  );
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const stageRef = useRef<Konva.Stage | null>(null);
  const backgroundRef = useRef<Konva.Rect | null>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [curveDraft, setCurveDraft] = useState<CurveDraft>(null);
  const [nodeSelection, setNodeSelection] = useState<NodeSelection>(null);
  const [hoveredEdge, setHoveredEdge] = useState<EdgeHover>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredFigureId, setHoveredFigureId] = useState<string | null>(null);
  const [dartDraft, setDartDraft] = useState<DartDraft>(null);
  const [measureDraft, setMeasureDraft] = useState<MeasureDraft>(null);
  const [marqueeDraft, setMarqueeDraft] = useState<MarqueeDraft>(null);
  const [hoveredMeasureEdge, setHoveredMeasureEdge] = useState<MeasureEdgeHover>(null);
  const [magnetSnap, setMagnetSnap] = useState<
    { pointWorld: Vec2; kind: "node" | "edge" } | null
  >(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastPointerRef = useRef<Vec2 | null>(null);
  const lastPanClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerDownAtRef = useRef<number>(0);

  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

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
  }, [isPanning, tool]);

  const selectionDragSyncRef = useRef<
    | {
        anchorFigureId: string;
        affectedIds: string[];
        startPositions: Map<string, Vec2>;
      }
    | null
  >(null);

  const dragNodeRef = useRef<
    | {
        figureId: string;
        nodeId: string;
        startNode: Vec2;
        startIn?: Vec2;
        startOut?: Vec2;
      }
    | null
  >(null);

  const dragHandleRef = useRef<
    | {
        figureId: string;
        nodeId: string;
        which: "in" | "out";
      }
    | null
  >(null);

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
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedFigure = useMemo(() => {
    return selectedFigureId ? figures.find((f) => f.id === selectedFigureId) : null;
  }, [figures, selectedFigureId]);

  const selectedIdsSet = useMemo(() => {
    return new Set<string>(selectedFigureIds);
  }, [selectedFigureIds]);

  const getSnappedWorldForTool = useCallback(
    (
      worldRaw: Vec2,
      mode: "down" | "move"
    ): { world: Vec2; snap: SnapResult } => {
      // Imã affects drawing tools (line/rect/circle/curve). Measure always has snapping (existing behavior).
      const isDrawingTool =
        tool === "line" || tool === "rectangle" || tool === "circle" || tool === "curve";
      const isMeasure = tool === "measure";

      const shouldSnap = (magnetEnabled && isDrawingTool) || isMeasure;
      if (!shouldSnap) {
        return { world: worldRaw, snap: { isSnapped: false } };
      }

      const thresholdWorld = Math.max(12, measureSnapStrengthPx) / scale;

      // Avoid snapping to the figure while dragging it (select tool). Not relevant here.
      const exclude = new Set<string>();
      void mode;

      const snap = snapWorldPoint(worldRaw, figures, {
        thresholdWorld,
        excludeSeams: true,
        includeNodes: true,
        excludeFigureIds: exclude.size ? exclude : undefined,
      });

      return { world: snap.isSnapped ? snap.pointWorld : worldRaw, snap };
    },
    [figures, magnetEnabled, measureSnapStrengthPx, scale, tool]
  );

  useEffect(() => {
    // When the offset value changes, recompute existing seam figures (keep same IDs).
    setFigures(
      (prev) => {
        let changed = false;
        const byId = new Map(prev.map((f) => [f.id, f] as const));
        const next = prev.map((f) => {
          if (f.kind !== "seam" || !f.parentId) return f;
          if (f.offsetCm === offsetValueCm) return f;
          const base = byId.get(f.parentId);
          if (!base) return f;
          const updated = recomputeSeamFigure(base, f, offsetValueCm);
          if (!updated) return f;
          changed = true;
          return updated;
        });
        return changed ? next : prev;
      },
      false
    );
  }, [offsetValueCm, setFigures]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
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
    [position.x, position.y, scale, setPosition, setScale]
  );

  const handlePointerDown = (e: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => {
      // Konva/React can fire both Pointer and Mouse events for the same click.
      // When that happens, our handlers run twice and tools like Curve can degrade to straight/duplicated segments.
      const evt = e.evt;
      const isPointer = typeof (window as unknown as { PointerEvent?: unknown }).PointerEvent !== "undefined" &&
        evt instanceof PointerEvent;
      const isMouse = evt instanceof MouseEvent && !isPointer;
      const now = Date.now();
      if (isPointer) {
        lastPointerDownAtRef.current = now;
      } else if (isMouse) {
        // If a pointer event just happened, ignore the synthetic mouse event.
        if (now - lastPointerDownAtRef.current < 60) {
          return;
        }
      }

      const stage = stageRef.current;
      if (!stage) return;

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
      if ((tool === "pan" && isLeftClick && !isRightClick) || (isMiddlePressed && !isRightClick)) {
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

      const isBackground = e.target === stage || e.target === backgroundRef.current;

      // Select tool: allow forgiving click selection (hit slop) and marquee selection.
      if (tool === "select" && isBackground && isLeftClick) {
        const HIT_SLOP_PX = 10;
        const thresholdWorld = HIT_SLOP_PX / scale;
        const hitId = findHoveredFigureId(figures, world, thresholdWorld);

        if (hitId) {
          if (e.evt.shiftKey) {
            toggleSelectedFigureId(hitId);
          } else {
            setSelectedFigureIds([hitId]);
          }
          setMarqueeDraft(null);
          return;
        }

        setMarqueeDraft({
          startWorld: world,
          currentWorld: world,
          additive: e.evt.shiftKey,
        });
        return;
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
        hoveredEdge &&
        selectedFigureId &&
        selectedFigure &&
        hoveredEdge.figureId === selectedFigureId
      ) {
        // Avoid calling setState (Canvas) inside the figures state updater (EditorProvider).
        const res = splitFigureEdge(selectedFigure, hoveredEdge.edgeId, hoveredEdge.t);
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
        // Multi-click cubic: click to add points, double-click to finish.
        if (e.evt.detail >= 2 && curveDraft) {
          const pts = curveDraft.pointsWorld;
          const first = pts[0];
          const distToStart = len(sub(world, first));
          const closed = pts.length >= 3 && distToStart < 12;
          const finalized = makeCurveFromPoints(pts, closed, "aci7");
          if (finalized) {
            setFigures((prev) => [...prev, finalized]);
            setSelectedFigureId(finalized.id);
          }
          setCurveDraft(null);
          return;
        }

        if (!curveDraft) {
          setCurveDraft({ pointsWorld: [worldForTool], currentWorld: worldForTool });
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

      if (tool === "line" || tool === "rectangle" || tool === "circle") {
        setDraft({ tool, startWorld: worldForTool, currentWorld: worldForTool });
      }
  };

  const handlePointerMove = (e: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => {
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
        if (resolvedMove.snap.isSnapped && magnetEnabled && (tool === "line" || tool === "rectangle" || tool === "circle" || tool === "curve")) {
          setMagnetSnap({
            pointWorld: resolvedMove.snap.pointWorld,
            kind: resolvedMove.snap.kind,
          });
        } else if (magnetSnap) {
          setMagnetSnap(null);
        }
      }

      if (measureDisplayMode === "hover") {
        const thresholdWorld = 10 / scale;
        setHoveredFigureId(findHoveredFigureId(figures, world, thresholdWorld));
      } else if (nodesDisplayMode === "hover") {
        const thresholdWorld = 10 / scale;
        setHoveredFigureId(findHoveredFigureId(figures, world, thresholdWorld));
      } else if (hoveredFigureId) {
        setHoveredFigureId(null);
      }

      if ((tool === "node" || tool === "dart") && selectedFigure) {
        const local = worldToFigureLocal(selectedFigure, world);

        if (tool === "dart") {
          setDartDraft((prev) => (prev ? { ...prev, currentWorld: world } : prev));
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
          const edge = selectedFigure.edges.find((ed) => ed.id === hit.best!.edgeId);
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
              const p1: Vec2 = a.outHandle ? { x: a.outHandle.x, y: a.outHandle.y } : p0;
              const p2: Vec2 = b.inHandle ? { x: b.inHandle.x, y: b.inHandle.y } : p3;
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

      if (!draft) return;

      setDraft({ ...draft, currentWorld: worldForTool });
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
      setCurveDraft((prev) => (prev ? { ...prev, currentWorld: resolved.world } : prev));
    },
    [curveDraft, getSnappedWorldForTool, position.x, position.y, scale]
  );

  const handlePointerUp = () => {
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

      const intersects = (bb: { x: number; y: number; width: number; height: number }) => {
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
        const baseId = fig.kind === "seam" && fig.parentId ? fig.parentId : fig.id;
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

    const a = draft.startWorld;
    const b = draft.currentWorld;

    const delta = sub(b, a);
    if (len(delta) < 2) {
      setDraft(null);
      return;
    }

    setFigures((prev) => {
      const next = [...prev];
      if (draft.tool === "line") next.push(makeLineFigure(a, b, "line", "aci7"));
      if (draft.tool === "rectangle") next.push(makeRectFigure(a, b, "aci7"));
      if (draft.tool === "circle") {
        const radius = len(delta);
        next.push(makeCircleFigure(a, radius, "aci7"));
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
    if (tool !== "line" && tool !== "rectangle" && tool !== "circle" && tool !== "curve") {
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
        dragNodeRef.current = null;
        dragHandleRef.current = null;
      }

      if (tool === "curve" && evt.key === "Enter" && curveDraft) {
        const pts = curveDraft.pointsWorld;
        const finalized = makeCurveFromPoints(pts, false, "aci7");
        if (finalized) {
          setFigures((prev) => [...prev, finalized]);
          setSelectedFigureId(finalized.id);
        }
        setCurveDraft(null);
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
    const stride = totalTiles > MAX_TILES ? Math.ceil(Math.sqrt(totalTiles / MAX_TILES)) : 1;

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
    const a = draft.startWorld;
    const b = draft.currentWorld;

    if (draft.tool === "circle") {
      const r = len(sub(b, a));
      const fig = makeCircleFigure(a, r, "aci7");
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

    // line
    return (
      <Line
        points={[a.x, a.y, b.x, b.y]}
        stroke={previewStroke}
        strokeWidth={1 / scale}
        dash={previewDash}
        listening={false}
      />
    );
  }, [draft, previewDash, previewStroke, scale]);

  const curveDraftPreview = useMemo(() => {
    if (!curveDraft) return null;
    const pts = [...curveDraft.pointsWorld, curveDraft.currentWorld];
    if (pts.length < 2) return null;

    const fig = makeCurveFromPoints(pts, false, "aci7");
    if (!fig) return null;
    const poly = figureLocalPolyline(fig, 60);
    return (
      <Line
        points={poly}
        stroke={previewStroke}
        strokeWidth={1 / scale}
        dash={previewDash}
        listening={false}
        lineCap="round"
        lineJoin="round"
      />
    );
  }, [curveDraft, previewDash, previewStroke, scale]);

  const measuresLabelsOverlay = useMemo(() => {
    if (measureDisplayMode === "never") return null;

    const visibleIds = new Set<string>();
    if (measureDisplayMode === "always") {
      for (const fig of figures) {
        if (fig.kind === "seam") continue;
        visibleIds.add(fig.id);
      }
    } else {
      if (selectedFigureId) visibleIds.add(selectedFigureId);
      if (hoveredFigureId) visibleIds.add(hoveredFigureId);
    }

    const fontSize = 11 / scale;
    const offset = 10 / scale;
    const textWidth = 120 / scale;
    const fill = resolveAci7(isDark);
    const opacity = 0.75;

    const highlightStroke = "#2563eb";

    const renderHoveredEdgeHighlight = (fig: Figure) => {
      if (!hoveredMeasureEdge) return null;
      if (hoveredMeasureEdge.figureId !== fig.id) return null;
      const edge = fig.edges.find((e) => e.id === hoveredMeasureEdge.edgeId);
      if (!edge) return null;

      const pts = edgeLocalPoints(fig, edge, edge.kind === "line" ? 1 : 60);
      if (pts.length < 2) return null;
      const flat: number[] = [];
      for (const p of pts) flat.push(p.x, p.y);

      return (
        <Line
          key={`mhover:${fig.id}:${edge.id}`}
          points={flat}
          stroke={highlightStroke}
          strokeWidth={2 / scale}
          opacity={0.85}
          listening={false}
          lineCap="round"
          lineJoin="round"
        />
      );
    };

    const renderEdgeLabel = (fig: Figure, edge: FigureEdge) => {
      const hit = fig.measures?.perEdge?.find((m) => m.edgeId === edge.id);
      if (!hit) return null;

      const pts = edgeLocalPoints(fig, edge, edge.kind === "line" ? 1 : 50);
      const mt = midAndTangent(pts);
      if (!mt) return null;

      const centroid = figureCentroidLocal(fig);
      const n = norm(perp(mt.tangent));

      // Align label with the edge direction.
      const rawAngleDeg = (Math.atan2(mt.tangent.y, mt.tangent.x) * 180) / Math.PI;
      const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

      // Use a leader line when the edge is short on screen.
      const chordLenLocal = dist(pts[0], pts[pts.length - 1]);
      const chordLenScreenPx = chordLenLocal * scale;
      const SHORT_EDGE_THRESHOLD_PX = 42;
      const isShortEdge = chordLenScreenPx < SHORT_EDGE_THRESHOLD_PX;

      const extra = isShortEdge ? 18 / scale : 0;

      const p1 = add(mt.mid, mul(n, offset + extra));
      const p2 = add(mt.mid, mul(n, -(offset + extra)));
      const p = dist(p1, centroid) >= dist(p2, centroid) ? p1 : p2;

      const isHovered =
        hoveredMeasureEdge?.figureId === fig.id &&
        hoveredMeasureEdge.edgeId === edge.id;

      const label = formatCm(pxToCm(hit.lengthPx), 2);

      const textFill = isHovered ? highlightStroke : fill;
      const textOpacity = isHovered ? 1 : opacity;

      const leader = isShortEdge ? (
        <Line
          key={`mlead:${fig.id}:${edge.id}`}
          points={[mt.mid.x, mt.mid.y, p.x, p.y]}
          stroke={textFill}
          strokeWidth={1 / scale}
          dash={[4 / scale, 4 / scale]}
          opacity={isHovered ? 0.95 : 0.5}
          listening={false}
          lineCap="round"
        />
      ) : null;

      return (
        <>
          {leader}
          <Text
            key={`m:${fig.id}:${edge.id}`}
            x={p.x}
            y={p.y}
            offsetX={textWidth / 2}
            offsetY={fontSize / 2}
            rotation={angleDeg}
            width={textWidth}
            align="center"
            text={label}
            fontSize={fontSize}
            fill={textFill}
            opacity={textOpacity}
            fontStyle={isHovered ? "bold" : "normal"}
            listening={false}
            name="inaa-measure-label"
          />
        </>
      );
    };

    const renderFigureLabels = (fig: Figure) => {
      if (fig.kind === "seam") return null;
      if (!fig.measures) return null;

      if (fig.tool === "circle" && fig.measures.circle) {
        const center = figureCentroidLocal(fig);
        const rPx = fig.measures.circle.radiusPx;
        const rLabel = `R ${formatCm(pxToCm(rPx), 2)}`;
        const dLabel = `⌀ ${formatCm(pxToCm(fig.measures.circle.diameterPx), 2)}`;

        const pR = add(center, { x: rPx + offset, y: 0 });
        const pD = add(center, { x: 0, y: rPx + offset });

        return (
          <>
            <Text
              key={`m:${fig.id}:circle:r`}
              x={pR.x - textWidth / 2}
              y={pR.y - fontSize / 2}
              width={textWidth}
              align="center"
              text={rLabel}
              fontSize={fontSize}
              fill={fill}
              opacity={opacity}
              listening={false}
              name="inaa-measure-label"
            />
            <Text
              key={`m:${fig.id}:circle:d`}
              x={pD.x - textWidth / 2}
              y={pD.y - fontSize / 2}
              width={textWidth}
              align="center"
              text={dLabel}
              fontSize={fontSize}
              fill={fill}
              opacity={opacity}
              listening={false}
              name="inaa-measure-label"
            />
          </>
        );
      }

      if (fig.tool === "curve" && fig.measures.curve) {
        const poly = figureLocalPolyline(fig, 80);
        if (poly.length < 4) return null;
        const pts: Vec2[] = [];
        for (let i = 0; i < poly.length; i += 2) {
          pts.push({ x: poly[i], y: poly[i + 1] });
        }
        const mt = midAndTangent(pts);
        if (!mt) return null;

        const centroid = figureCentroidLocal(fig);
        const n = norm(perp(mt.tangent));
        const p1 = add(mt.mid, mul(n, offset));
        const p2 = add(mt.mid, mul(n, -offset));
        const p = dist(p1, centroid) >= dist(p2, centroid) ? p1 : p2;

        const parts: string[] = [];
        parts.push(formatCm(pxToCm(fig.measures.curve.lengthPx), 2));
        if (Number.isFinite(fig.measures.curve.tangentAngleDegAtMid ?? NaN)) {
          parts.push(`∠ ${Math.round(fig.measures.curve.tangentAngleDegAtMid!)}°`);
        }
        if (Number.isFinite(fig.measures.curve.curvatureRadiusPxAtMid ?? NaN)) {
          parts.push(
            `R≈ ${formatCm(pxToCm(fig.measures.curve.curvatureRadiusPxAtMid!), 2)}`
          );
        }

        return (
          <Text
            key={`m:${fig.id}:curve`}
            x={p.x - textWidth / 2}
            y={p.y - fontSize}
            width={textWidth}
            align="center"
            text={parts.join("\n")}
            fontSize={fontSize}
            fill={fill}
            opacity={opacity}
            listening={false}
            name="inaa-measure-label"
          />
        );
      }

      // Default: per-edge labels
      return (
        <>
          {renderHoveredEdgeHighlight(fig)}
          {fig.edges.map((edge) => renderEdgeLabel(fig, edge))}
        </>
      );
    };

    const nodes: React.ReactNode[] = [];

    for (const fig of figures) {
      if (!visibleIds.has(fig.id)) continue;
      nodes.push(
        <Group
          key={`mgrp:${fig.id}`}
          x={fig.x}
          y={fig.y}
          rotation={fig.rotation || 0}
          listening={false}
        >
          {renderFigureLabels(fig)}
        </Group>
      );
    }

    // Live draft measures
    if (draft) {
      const a = draft.startWorld;
      const b = draft.currentWorld;

      let temp: Figure | null = null;
      if (draft.tool === "rectangle") temp = makeRectFigure(a, b, "aci7");
      if (draft.tool === "circle") temp = makeCircleFigure(a, len(sub(b, a)), "aci7");
      if (draft.tool === "line") temp = makeLineFigure(a, b, "line", "aci7");

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
            {renderFigureLabels(fig)}
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
            {renderFigureLabels(fig)}
          </Group>
        );
      }
    }

    return nodes.length ? <>{nodes}</> : null;
  }, [
    curveDraft,
    draft,
    figures,
    hoveredFigureId,
    hoveredMeasureEdge,
    isDark,
    measureDisplayMode,
    scale,
    selectedFigureId,
  ]);

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
                  };
                  setNodeSelection({
                    figureId: selectedFigure.id,
                    nodeId: n.id,
                    handle: null,
                  });
                }}
                onDragMove={(ev) => {
                  const ref = dragNodeRef.current;
                  if (!ref) return;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  const dx = nx - ref.startNode.x;
                  const dy = ny - ref.startNode.y;

                  setFigures((prev) =>
                    prev.map((f) => {
                      if (f.id !== ref.figureId) return f;
                      return {
                        ...f,
                        nodes: f.nodes.map((node) => {
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
                  dragNodeRef.current = null;
                }}
                onDblClick={() => {
                  setFigures((prev) =>
                    prev.map((f) => {
                      if (f.id !== selectedFigure.id) return f;
                      return {
                        ...f,
                        nodes: f.nodes.map((node) => {
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
              />

              {/* Visual node */}
              <Circle
                x={n.x}
                y={n.y}
                radius={rNode}
                fill={isSelectedNode ? "#2563eb" : "#ffffff"}
                stroke="#2563eb"
                strokeWidth={1 / scale}
                listening={false}
              />

              {inH ? (
                <Circle
                  x={inH.x}
                  y={inH.y}
                  radius={rHandle}
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
                        return {
                          ...f,
                          nodes: f.nodes.map((node) => {
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
                />
              ) : null}

              {outH ? (
                <Circle
                  x={outH.x}
                  y={outH.y}
                  radius={rHandle}
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
                        return {
                          ...f,
                          nodes: f.nodes.map((node) => {
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
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </Group>
    );
  }, [aci7, handleAccentStroke, nodeSelection, scale, selectedFigure, setFigures, tool]);

  const nodesPointsOverlay = useMemo(() => {
    if (nodesDisplayMode === "never") return null;

    const visibleIds = new Set<string>();

    if (nodesDisplayMode === "always") {
      for (const fig of figures) {
        if (fig.kind === "seam") continue;
        visibleIds.add(fig.id);
      }
    } else {
      // hover
      if (selectedFigureId) visibleIds.add(selectedFigureId);
      if (hoveredFigureId) visibleIds.add(hoveredFigureId);
    }

    if (visibleIds.size === 0) return null;

    const r = 3 / scale;
    const strokeWidth = 1 / scale;
    const fill = "transparent";

    const nodes: React.ReactNode[] = [];

    for (const fig of figures) {
      if (!visibleIds.has(fig.id)) continue;
      if (fig.kind === "seam") continue;

      const isSelected = fig.id === selectedFigureId;
      const stroke = isSelected ? "#2563eb" : resolveStrokeColor(fig.stroke, isDark);
      const opacity = (fig.opacity ?? 1) * 0.85;

      nodes.push(
        <Group
          key={`npts:${fig.id}`}
          x={fig.x}
          y={fig.y}
          rotation={fig.rotation || 0}
          listening={false}
        >
          {fig.nodes.map((n) => (
            <Circle
              key={n.id}
              x={n.x}
              y={n.y}
              radius={r}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              listening={false}
              name="inaa-node-point"
            />
          ))}
        </Group>
      );
    }

    return nodes.length ? <>{nodes}</> : null;
  }, [figures, hoveredFigureId, isDark, nodesDisplayMode, scale, selectedFigureId]);

  const edgeHoverOverlay = useMemo(() => {
    if ((tool !== "node" && tool !== "dart") || !selectedFigure || !hoveredEdge)
      return null;
    if (hoveredEdge.figureId !== selectedFigure.id) return null;

    const edge = selectedFigure.edges.find((e) => e.id === hoveredEdge.edgeId);
    if (!edge) return null;

    const pts = edgeLocalPoints(selectedFigure, edge, edge.kind === "line" ? 1 : 60);
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
    const pts = edgeLocalPoints(selectedFigure, edge, edge.kind === "line" ? 1 : 120);
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

      const rawAngleDeg = (Math.atan2(mt.tangent.y, mt.tangent.x) * 180) / Math.PI;
      const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

      const label = formatCm(pxToCm(lengthPx), 2);

      const chordLenLocal = dist(segmentPts[0], segmentPts[segmentPts.length - 1]);
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
    const apexLocal = worldToFigureLocal(selectedFigure, dartDraft.currentWorld);

    const stroke = previewStroke;
    const dash = [6 / scale, 6 / scale];

    return (
      <Group
        x={selectedFigure.x}
        y={selectedFigure.y}
        rotation={selectedFigure.rotation || 0}
        listening={false}
      >
        {a ? <Circle x={a.x} y={a.y} radius={4 / scale} fill={previewStroke} /> : null}

        {b ? <Circle x={b.x} y={b.y} radius={4 / scale} fill={previewStroke} /> : null}

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
        className={showRulers ? "absolute left-6 top-6 right-0 bottom-0" : "absolute inset-0"}
      >
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
          }}
        >
          <Layer>
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

          {figures.map((fig) => {
            const pts = figureLocalPolyline(fig, 60);
            const isSeam = fig.kind === "seam" && !!fig.parentId;
            const baseId = isSeam ? fig.parentId! : fig.id;
            const isSelected = selectedIdsSet.has(baseId);
            const stroke = isSelected
              ? "#2563eb"
              : resolveStrokeColor(fig.stroke, isDark);
            const opacity = (fig.opacity ?? 1) * (isSeam ? 0.7 : 1);
            const strokeWidth = (fig.strokeWidth || 1) / scale;
            const dash = fig.dash ? fig.dash.map((d) => d / scale) : undefined;

            return (
              <Group
                key={fig.id}
                name={`fig_${fig.id}`}
                x={fig.x}
                y={fig.y}
                rotation={fig.rotation || 0}
                draggable={tool === "select" && !isSeam && selectedIdsSet.has(fig.id)}
                onDragStart={() => {
                  if (tool !== "select") return;
                  if (isSeam) return;
                  if (!selectedIdsSet.has(fig.id)) return;

                  const stage = stageRef.current;
                  if (!stage) return;

                  const affectedIds = figures
                    .filter(
                      (f) =>
                        selectedIdsSet.has(f.id) ||
                        (f.kind === "seam" && f.parentId && selectedIdsSet.has(f.parentId))
                    )
                    .map((f) => f.id);

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
                  };
                }}
                onDragMove={(e) => {
                  const sync = selectionDragSyncRef.current;
                  if (!sync) return;
                  if (sync.anchorFigureId !== fig.id) return;

                  const stage = stageRef.current;
                  if (!stage) return;

                  const anchorStart = sync.startPositions.get(sync.anchorFigureId);
                  if (!anchorStart) return;

                  const dx = e.target.x() - anchorStart.x;
                  const dy = e.target.y() - anchorStart.y;

                  for (const id of sync.affectedIds) {
                    if (id === sync.anchorFigureId) continue;
                    const start = sync.startPositions.get(id);
                    if (!start) continue;
                    const node = stage.findOne(`.fig_${id}`);
                    if (!node) continue;
                    node.position({ x: start.x + dx, y: start.y + dy });
                  }

                  // Draw at most once per frame-ish.
                  stage.batchDraw();
                }}
                onDragEnd={(e) => {
                  const sync = selectionDragSyncRef.current;
                  selectionDragSyncRef.current = null;
                  if (!sync || sync.anchorFigureId !== fig.id) return;

                  const anchorStart = sync.startPositions.get(sync.anchorFigureId);
                  if (!anchorStart) return;

                  const dx = e.target.x() - anchorStart.x;
                  const dy = e.target.y() - anchorStart.y;

                  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;

                  const affected = new Set(sync.affectedIds);
                  setFigures((prev) =>
                    prev.map((f) =>
                      affected.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f
                    )
                  );
                }}
              >
                <Line
                  points={pts}
                  closed={fig.closed}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  dash={dash}
                  opacity={opacity}
                  lineCap="round"
                  lineJoin="round"
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
                          ? (bb ? bb.x + bb.width / 2 : base.x)
                          : (bb ? bb.y + bb.height / 2 : base.y);
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
                        prev.filter((f) => !(f.kind === "seam" && f.parentId === base.id)).map((f) => (f.id === base.id ? nextUnfolded : f))
                      );
                      return;
                    }

                    if (tool === "offset") {
                      setSelectedFigureId(baseId);
                      setOffsetTargetId(baseId);

                      const existing = figures.some(
                        (f) => f.kind === "seam" && f.parentId === baseId
                      );
                      if (existing) return;

                      const seam = makeSeamFigure(base, offsetValueCm);
                      if (!seam) return;
                      setFigures((prev) => [...prev, seam]);
                      return;
                    }

                    setSelectedFigureId(baseId);
                  }}
                />
              </Group>
            );
          })}

          {nodesPointsOverlay}

          {draftPreview}

          {curveDraftPreview}

          {measuresLabelsOverlay}

          {edgeHoverOverlay}

          {nodeSplitMeasuresPreviewOverlay}

          {dartOverlay}

          {measureOverlay}

          {magnetOverlay}

          {marqueeDraft ? (
            <Rect
              x={Math.min(marqueeDraft.startWorld.x, marqueeDraft.currentWorld.x)}
              y={Math.min(marqueeDraft.startWorld.y, marqueeDraft.currentWorld.y)}
              width={Math.abs(marqueeDraft.currentWorld.x - marqueeDraft.startWorld.x)}
              height={Math.abs(marqueeDraft.currentWorld.y - marqueeDraft.startWorld.y)}
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
