import type { Figure, FigureEdge, FigureNode } from "./types";
import { add, rotate, rotateInv, sampleCubic, sub, type Vec2 } from "./figureGeometry";

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

export function figureCentroidLocal(figure: Figure): Vec2 {
  if (!figure.nodes.length) return { x: 0, y: 0 };
  const sum = figure.nodes.reduce(
    (acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / figure.nodes.length, y: sum.y / figure.nodes.length };
}

export function edgeLocalPoints(figure: Figure, edge: FigureEdge, steps: number): Vec2[] {
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

export function figureLocalPolyline(figure: Figure, cubicSteps: number = 30): number[] {
  const points: Vec2[] = [];

  for (const edge of figure.edges) {
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

  return toPointArray(points);
}

export function worldToFigureLocal(figure: Pick<Figure, "x" | "y" | "rotation">, world: Vec2): Vec2 {
  const translated = sub(world, { x: figure.x, y: figure.y });
  return rotateInv(translated, figure.rotation || 0);
}

export function figureLocalToWorld(figure: Pick<Figure, "x" | "y" | "rotation">, local: Vec2): Vec2 {
  return add(rotate(local, figure.rotation || 0), { x: figure.x, y: figure.y });
}

export function figureWorldPolyline(figure: Figure, cubicSteps: number = 30): number[] {
  const local = figureLocalPolyline(figure, cubicSteps);
  const out: number[] = [];
  for (let i = 0; i < local.length; i += 2) {
    const p = figureLocalToWorld(figure, { x: local[i], y: local[i + 1] });
    out.push(p.x, p.y);
  }
  return out;
}

export function figureWorldBoundingBox(figure: Figure): { x: number; y: number; width: number; height: number } | null {
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
