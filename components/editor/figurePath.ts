import type { Figure, FigureEdge, FigureNode } from "./types";
import {
  add,
  rotate,
  rotateInv,
  sampleCubic,
  sub,
  type Vec2,
} from "./figureGeometry";

function toPointArray(points: Vec2[]): number[] {
  const out: number[] = [];
  for (const p of points) {
    out.push(p.x, p.y);
  }
  return out;
}

function getNode(nodes: FigureNode[], id: string): FigureNode | undefined {
  return nodes.find((n) => n.id === id);
}

function polylineFromEdgesInOrder(
  figure: Figure,
  cubicSteps: number,
  edges: FigureEdge[]
): Vec2[] {
  const points: Vec2[] = [];

  for (const edge of edges) {
    const a = getNode(figure.nodes, edge.from);
    const b = getNode(figure.nodes, edge.to);
    if (!a || !b) continue;

    const p0: Vec2 = { x: a.x, y: a.y };
    const p3: Vec2 = { x: b.x, y: b.y };

    if (edge.kind === "line") {
      if (points.length === 0) {
        points.push(p0, p3);
      } else {
        points.push(p3);
      }
      continue;
    }

    const p1 = a.outHandle ? { x: a.outHandle.x, y: a.outHandle.y } : p0;
    const p2 = b.inHandle ? { x: b.inHandle.x, y: b.inHandle.y } : p3;

    const sampled = sampleCubic(p0, p1, p2, p3, cubicSteps);
    if (points.length === 0) {
      points.push(...sampled);
    } else {
      // avoid duplicate join point
      points.push(...sampled.slice(1));
    }
  }

  return points;
}

function tryPolylineByTraversal(
  figure: Figure,
  cubicSteps: number
): Vec2[] | null {
  if (figure.edges.length === 0) return [];

  const outgoing = new Map<string, FigureEdge[]>();
  const incomingCount = new Map<string, number>();

  for (const e of figure.edges) {
    const list = outgoing.get(e.from) ?? [];
    list.push(e);
    outgoing.set(e.from, list);
    incomingCount.set(e.to, (incomingCount.get(e.to) ?? 0) + 1);
    if (!incomingCount.has(e.from))
      incomingCount.set(e.from, incomingCount.get(e.from) ?? 0);
  }

  let startEdge: FigureEdge | undefined = figure.edges[0];

  if (!figure.closed) {
    // For open figures, prefer a start node with no incoming edges.
    let startNode: string | null = null;
    for (const nodeId of outgoing.keys()) {
      if ((incomingCount.get(nodeId) ?? 0) === 0) {
        startNode = nodeId;
        break;
      }
    }
    if (startNode) {
      startEdge = outgoing.get(startNode)?.[0] ?? startEdge;
    }
  }

  if (!startEdge) return null;

  const visited = new Set<string>();
  const points: Vec2[] = [];

  let currentEdge: FigureEdge | undefined = startEdge;
  let safety = 0;
  while (currentEdge && safety < figure.edges.length + 5) {
    safety++;
    if (visited.has(currentEdge.id)) break;
    visited.add(currentEdge.id);

    const segPts = edgeLocalPoints(figure, currentEdge, cubicSteps);
    if (segPts.length) {
      if (points.length === 0) points.push(...segPts);
      else points.push(...segPts.slice(1));
    }

    if (visited.size === figure.edges.length) break;

    const nextNodeId: string = currentEdge.to;
    const candidates: FigureEdge[] = outgoing.get(nextNodeId) ?? [];
    const nextEdge: FigureEdge | undefined = candidates.find(
      (e) => !visited.has(e.id)
    );
    if (!nextEdge) break;
    currentEdge = nextEdge;
  }

  // Only accept traversal output when it covers the full contour.
  if (visited.size !== figure.edges.length) return null;
  return points;
}

export function figureCentroidLocal(figure: Figure): Vec2 {
  if (!figure.nodes.length) return { x: 0, y: 0 };
  const sum = figure.nodes.reduce(
    (acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / figure.nodes.length, y: sum.y / figure.nodes.length };
}

export function edgeLocalPoints(
  figure: Figure,
  edge: FigureEdge,
  steps: number
): Vec2[] {
  const a = getNode(figure.nodes, edge.from);
  const b = getNode(figure.nodes, edge.to);
  if (!a || !b) return [];

  const p0: Vec2 = { x: a.x, y: a.y };
  const p3: Vec2 = { x: b.x, y: b.y };

  if (edge.kind === "line") return [p0, p3];

  const p1: Vec2 = a.outHandle ? { x: a.outHandle.x, y: a.outHandle.y } : p0;
  const p2: Vec2 = b.inHandle ? { x: b.inHandle.x, y: b.inHandle.y } : p3;
  return sampleCubic(p0, p1, p2, p3, steps);
}

export function figureLocalPolyline(
  figure: Figure,
  cubicSteps: number = 30
): number[] {
  const traversed = tryPolylineByTraversal(figure, cubicSteps);
  if (traversed) return toPointArray(traversed);

  const points = polylineFromEdgesInOrder(figure, cubicSteps, figure.edges);
  return toPointArray(points);
}

export function worldToFigureLocal(
  figure: Pick<Figure, "x" | "y" | "rotation">,
  world: Vec2
): Vec2 {
  const translated = sub(world, { x: figure.x, y: figure.y });
  return rotateInv(translated, figure.rotation || 0);
}

export function figureLocalToWorld(
  figure: Pick<Figure, "x" | "y" | "rotation">,
  local: Vec2
): Vec2 {
  return add(rotate(local, figure.rotation || 0), { x: figure.x, y: figure.y });
}

export function figureWorldPolyline(
  figure: Figure,
  cubicSteps: number = 30
): number[] {
  const local = figureLocalPolyline(figure, cubicSteps);
  const out: number[] = [];
  for (let i = 0; i < local.length; i += 2) {
    const p = figureLocalToWorld(figure, { x: local[i], y: local[i + 1] });
    out.push(p.x, p.y);
  }
  return out;
}

export function figureWorldBoundingBox(
  figure: Figure
): { x: number; y: number; width: number; height: number } | null {
  if (figure.tool === "text") {
    const text = (figure.textValue ?? "").toString();
    const fontSize = (() => {
      const v = figure.textFontSizePx;
      if (!Number.isFinite(v ?? NaN)) return 18;
      return Math.max(6, Math.min(300, v as number));
    })();
    const lineHeight = (() => {
      const v = figure.textLineHeight;
      if (!Number.isFinite(v ?? NaN)) return 1.25;
      return Math.max(0.8, Math.min(3, v as number));
    })();

    const explicitWidth =
      Number.isFinite(figure.textWidthPx ?? NaN) &&
      (figure.textWidthPx ?? 0) > 0
        ? (figure.textWidthPx as number)
        : null;

    const padding = (() => {
      const v = figure.textPaddingPx;
      if (!Number.isFinite(v ?? NaN)) return 0;
      return Math.max(0, Math.min(50, v as number));
    })();

    const lines = text.split("\n");

    const approxCharWidth = fontSize * 0.62;
    const maxLineChars = explicitWidth
      ? Math.max(1, Math.floor(explicitWidth / Math.max(1, approxCharWidth)))
      : null;

    const approxWrappedLineCount = lines.reduce((acc, line) => {
      if (!maxLineChars) return acc + 1;
      const len = Math.max(1, line.length);
      return acc + Math.max(1, Math.ceil(len / maxLineChars));
    }, 0);

    const longestLineLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
    const widthLocal =
      (explicitWidth ?? Math.max(12, longestLineLen * approxCharWidth)) +
      padding * 2;
    const heightLocal =
      Math.max(1, approxWrappedLineCount) * fontSize * lineHeight + padding * 2;

    const cornersLocal = [
      { x: -padding, y: -padding },
      { x: widthLocal - padding, y: -padding },
      { x: widthLocal - padding, y: heightLocal - padding },
      { x: -padding, y: heightLocal - padding },
    ];

    const cornersWorld = cornersLocal.map((p) => figureLocalToWorld(figure, p));
    let minX = cornersWorld[0]!.x;
    let minY = cornersWorld[0]!.y;
    let maxX = cornersWorld[0]!.x;
    let maxY = cornersWorld[0]!.y;
    for (let i = 1; i < cornersWorld.length; i++) {
      const p = cornersWorld[i]!;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  const pts = figureWorldPolyline(figure, 40);
  if (pts.length < 2) return null;
  let minX = pts[0];
  let minY = pts[1];
  let maxX = pts[0];
  let maxY = pts[1];
  for (let i = 2; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    minY = Math.min(minY, pts[i + 1]);
    maxX = Math.max(maxX, pts[i]);
    maxY = Math.max(maxY, pts[i + 1]);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
