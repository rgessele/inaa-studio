import type { EdgeKind, Figure, FigureEdge, FigureNode } from "./types";
import { figureLocalPolyline } from "./figurePath";
import { len, sub, sampleCubic, type Vec2 } from "./figureGeometry";

export type FigureMeasureEdge = {
  edgeId: string;
  kind: EdgeKind;
  lengthPx: number;
  angleDeg?: number;
};

export type FigureMeasures = {
  version: 1;
  figureLengthPx: number;
  perEdge: FigureMeasureEdge[];
  circle?: {
    rxPx: number;
    ryPx: number;
    widthPx: number;
    heightPx: number;
    circumferencePx: number;
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

function getNode(nodes: FigureNode[], id: string): FigureNode | undefined {
  return nodes.find((n) => n.id === id);
}

function angleDeg(a: Vec2, b: Vec2): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function polylineLengthPx(points: number[]): number {
  let sum = 0;
  for (let i = 2; i < points.length; i += 2) {
    const dx = points[i] - points[i - 2];
    const dy = points[i + 1] - points[i - 1];
    sum += Math.hypot(dx, dy);
  }
  return sum;
}

function edgeSampledPolyline(
  edge: FigureEdge,
  a: FigureNode,
  b: FigureNode
): Vec2[] {
  const p0: Vec2 = { x: a.x, y: a.y };
  const p3: Vec2 = { x: b.x, y: b.y };

  if (edge.kind === "line") {
    return [p0, p3];
  }

  const p1 = a.outHandle ? { x: a.outHandle.x, y: a.outHandle.y } : p0;
  const p2 = b.inHandle ? { x: b.inHandle.x, y: b.inHandle.y } : p3;

  return sampleCubic(p0, p1, p2, p3, 40);
}

function edgeLengthPx(edge: FigureEdge, a: FigureNode, b: FigureNode): number {
  const pts = edgeSampledPolyline(edge, a, b);
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    sum += len(sub(pts[i], pts[i - 1]));
  }
  return sum;
}

function circumradius(a: Vec2, b: Vec2, c: Vec2): number {
  const ab = len(sub(b, a));
  const bc = len(sub(c, b));
  const ca = len(sub(a, c));

  // Twice area via cross product magnitude
  const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  if (!Number.isFinite(area2) || area2 <= 1e-9) return Number.POSITIVE_INFINITY;

  const area = area2 / 2;
  return (ab * bc * ca) / (4 * area);
}

export function computeFigureMeasures(figure: Figure): FigureMeasures {
  const perEdge: FigureMeasureEdge[] = [];
  let figureLengthPx = 0;

  for (const edge of figure.edges) {
    const a = getNode(figure.nodes, edge.from);
    const b = getNode(figure.nodes, edge.to);
    if (!a || !b) continue;

    const lengthPx = edgeLengthPx(edge, a, b);
    figureLengthPx += lengthPx;

    const aPt: Vec2 = { x: a.x, y: a.y };
    const bPt: Vec2 = { x: b.x, y: b.y };
    perEdge.push({
      edgeId: edge.id,
      kind: edge.kind,
      lengthPx,
      angleDeg: angleDeg(aPt, bPt),
    });
  }

  const measures: FigureMeasures = {
    version: 1,
    figureLengthPx,
    perEdge,
  };

  if (figure.tool === "circle") {
    const pts = figure.nodes.map((n) => ({ x: n.x, y: n.y }));
    if (pts.length) {
      let minX = pts[0].x;
      let maxX = pts[0].x;
      let minY = pts[0].y;
      let maxY = pts[0].y;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }

      const widthPx = Math.max(0, maxX - minX);
      const heightPx = Math.max(0, maxY - minY);
      const rxPx = widthPx / 2;
      const ryPx = heightPx / 2;

      const maxR = Math.max(rxPx, ryPx);
      const isCircle = maxR > 0 && Math.abs(rxPx - ryPx) / maxR <= 0.02;
      const radiusPx = isCircle ? (rxPx + ryPx) / 2 : undefined;

      // Circumference:
      // - If this is effectively a circle, use exact 2πr.
      // - Otherwise, use a stable ellipse approximation (Ramanujan II).
      const circumferencePx = (() => {
        if (radiusPx != null) return Math.max(0, 2 * Math.PI * radiusPx);

        const a = Math.max(rxPx, ryPx);
        const b = Math.min(rxPx, ryPx);
        if (!(a > 0) || !(b > 0)) return 0;

        const h = ((a - b) * (a - b)) / ((a + b) * (a + b));
        const denom = 10 + Math.sqrt(Math.max(0, 4 - 3 * h));
        const factor = denom > 1e-9 ? 1 + (3 * h) / denom : 1;
        return Math.max(0, Math.PI * (a + b) * factor);
      })();

      measures.circle = {
        rxPx,
        ryPx,
        widthPx,
        heightPx,
        circumferencePx,
        radiusPx,
        diameterPx: radiusPx ? radiusPx * 2 : undefined,
      };
    }
  }

  if (figure.tool === "curve") {
    const poly = figureLocalPolyline(figure, 80);
    const lengthPx = polylineLengthPx(poly);

    let tangentAngleDegAtMid: number | undefined;
    let curvatureRadiusPxAtMid: number | undefined;

    if (poly.length >= 6) {
      const n = poly.length / 2;
      const mid = Math.max(1, Math.min(n - 2, Math.floor(n / 2)));

      const pPrev: Vec2 = {
        x: poly[(mid - 1) * 2],
        y: poly[(mid - 1) * 2 + 1],
      };
      const pMid: Vec2 = { x: poly[mid * 2], y: poly[mid * 2 + 1] };
      const pNext: Vec2 = {
        x: poly[(mid + 1) * 2],
        y: poly[(mid + 1) * 2 + 1],
      };

      tangentAngleDegAtMid = angleDeg(pPrev, pNext);
      const r = circumradius(pPrev, pMid, pNext);
      if (Number.isFinite(r)) curvatureRadiusPxAtMid = r;
    }

    measures.curve = {
      lengthPx,
      tangentAngleDegAtMid,
      curvatureRadiusPxAtMid,
    };

    // Prefer polyline length for curve (more stable across multi-edge curves)
    measures.figureLengthPx = lengthPx;
  }

  if (figure.tool === "rectangle") {
    const pts = figure.nodes.map((n) => ({ x: n.x, y: n.y }));
    if (pts.length) {
      let minX = pts[0].x;
      let maxX = pts[0].x;
      let minY = pts[0].y;
      let maxY = pts[0].y;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const widthPx = Math.max(0, maxX - minX);
      const heightPx = Math.max(0, maxY - minY);
      measures.rect = { widthPx, heightPx };
    }
  }

  return measures;
}

export function withComputedFigureMeasures(figure: Figure): Figure {
  return {
    ...figure,
    measures: computeFigureMeasures(figure),
  };
}
