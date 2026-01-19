import { PX_PER_CM } from "./constants";
import { add, dist, mul, sub } from "./figureGeometry";
import { edgeLocalPoints, figureLocalPolyline } from "./figurePath";
import type { Figure, FigureEdge, FigureNode } from "./types";

type Vec2 = { x: number; y: number };

function id(prefix: string): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
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

function lineIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
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
    ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den;
  const py =
    ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
  return { x: px, y: py };
}

function offsetClosedPolyline(points: Vec2[], offsetPx: number): Vec2[] | null {
  if (points.length < 3) return null;

  const pts = [...points];
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (dist(first, last) < 1e-6) pts.pop();
  if (pts.length < 3) return null;

  const area = signedArea(pts);
  const outwardSign = area > 0 ? 1 : -1;

  const normals: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = normalize(sub(b, a));
    const right = { x: d.y, y: -d.x };
    normals.push(mul(right, outwardSign));
  }

  const out: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const pPrev = pts[(i - 1 + pts.length) % pts.length];
    const p = pts[i];
    const pNext = pts[(i + 1) % pts.length];

    const nPrev = normals[(i - 1 + normals.length) % normals.length];
    const n = normals[i];

    const a1 = add(pPrev, mul(nPrev, offsetPx));
    const a2 = add(p, mul(nPrev, offsetPx));
    const b1 = add(p, mul(n, offsetPx));
    const b2 = add(pNext, mul(n, offsetPx));

    const hit = lineIntersection(a1, a2, b1, b2);
    out.push(hit ?? add(p, mul(n, offsetPx)));
  }

  return out;
}

function getOutwardSign(points: Vec2[]): number {
  if (points.length < 3) return 1;
  const area = signedArea(points);
  return area > 0 ? 1 : -1;
}

function offsetPolylineByNormal(
  points: Vec2[],
  outwardSign: number,
  offsetPx: number
): Vec2[] {
  if (points.length < 2) return [];
  const segNormals: Vec2[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = normalize(sub(b, a));
    const right = { x: d.y, y: -d.x };
    segNormals.push(mul(right, outwardSign));
  }

  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    let n: Vec2 | null = null;
    if (i === 0) {
      n = segNormals[0] ?? { x: 0, y: 0 };
    } else if (i === points.length - 1) {
      n = segNormals[segNormals.length - 1] ?? { x: 0, y: 0 };
    } else {
      const prev = segNormals[i - 1] ?? { x: 0, y: 0 };
      const next = segNormals[i] ?? { x: 0, y: 0 };
      n = normalize(add(prev, next));
    }
    out.push(add(points[i], mul(n, offsetPx)));
  }

  return out;
}

function offsetClosedPolylinePerEdge(
  base: Figure,
  edgeOffsetsPx: Record<string, number>
): Array<{ edgeId: string; points: Vec2[] }> {
  if (!base.closed) return [];
  if (!base.edges.length) return [];

  const flat = figureLocalPolyline(base, 60);
  const poly: Vec2[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    poly.push({ x: flat[i], y: flat[i + 1] });
  }
  if (poly.length >= 2 && dist(poly[0], poly[poly.length - 1]) < 1e-6) {
    poly.pop();
  }
  const outwardSign = getOutwardSign(poly);

  const segmentsByEdge = new Map<string, Vec2[]>();
  for (const edge of base.edges) {
    const offsetPx = edgeOffsetsPx[edge.id];
    if (!Number.isFinite(offsetPx) || offsetPx <= 0) continue;
    const seg = edgeLocalPoints(base, edge, 30);
    if (seg.length < 2) continue;
    const offsetSeg = offsetPolylineByNormal(seg, outwardSign, offsetPx);
    if (offsetSeg.length >= 2) {
      segmentsByEdge.set(edge.id, offsetSeg);
    }
  }

  if (!segmentsByEdge.size) return [];

  const ordered: Array<{ edgeId: string; points: Vec2[] } | null> = [];
  for (const edge of base.edges) {
    const points = segmentsByEdge.get(edge.id) ?? null;
    ordered.push(points ? { edgeId: edge.id, points } : null);
  }

  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
    if (!current || current.points.length < 2) continue;

    const nextIndex = (i + 1) % ordered.length;
    const next = ordered[nextIndex];
    if (!next || next.points.length < 2) continue;

    const currentEnd = current.points[current.points.length - 1];
    const currentPrev = current.points[current.points.length - 2] ?? currentEnd;
    const nextStart = next.points[0];
    const nextNext = next.points[1] ?? nextStart;

    const inter = lineIntersection(
      currentPrev,
      currentEnd,
      nextStart,
      nextNext
    );
    if (inter) {
      current.points[current.points.length - 1] = inter;
      next.points[0] = inter;
    }
  }

  return ordered.filter(
    (seg): seg is { edgeId: string; points: Vec2[] } => !!seg
  );
}

export function seamSourceSignature(
  base: Figure,
  offsetCm?: number | Record<string, number>
): string {
  const offsetKey = (() => {
    if (typeof offsetCm === "number" && Number.isFinite(offsetCm)) {
      return Math.round(offsetCm * 10000) / 10000;
    }
    if (offsetCm && typeof offsetCm === "object") {
      const entries = Object.entries(offsetCm)
        .filter(([, v]) => Number.isFinite(v))
        .map(([k, v]) => [k, Math.round(v * 10000) / 10000] as const)
        .sort(([a], [b]) => a.localeCompare(b));
      return Object.fromEntries(entries);
    }
    return null;
  })();
  const sig = {
    closed: base.closed,
    offsetCm: offsetKey,
    nodes: base.nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      mode: n.mode,
      inHandle: n.inHandle ? { x: n.inHandle.x, y: n.inHandle.y } : null,
      outHandle: n.outHandle ? { x: n.outHandle.x, y: n.outHandle.y } : null,
    })),
    edges: base.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      kind: e.kind,
    })),
  };
  return JSON.stringify(sig);
}

export function makeSeamFigure(
  base: Figure,
  offsetValueCm: number | Record<string, number>
): Figure | null {
  if (!base.closed) return null;
  const sourceSignature = seamSourceSignature(base, offsetValueCm);

  if (typeof offsetValueCm === "number") {
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
      sourceSignature,
      dash: [5, 5],
      fill: "transparent",
      nodes,
      edges,
    };
  }

  if (base.tool === "circle") return null;

  const edgeOffsetsPx: Record<string, number> = {};
  for (const [edgeId, cm] of Object.entries(offsetValueCm)) {
    if (!Number.isFinite(cm) || cm <= 0) continue;
    edgeOffsetsPx[edgeId] = cm * PX_PER_CM;
  }
  const segments = offsetClosedPolylinePerEdge(base, edgeOffsetsPx);
  if (!segments.length) return null;

  const seamSegments = segments.map((seg) => {
    const flat: number[] = [];
    for (const p of seg.points) flat.push(p.x, p.y);
    return flat;
  });
  const seamSegmentEdgeIds = segments.map((seg) => seg.edgeId);

  const nodes: FigureNode[] = [];
  const edges: FigureEdge[] = [];
  for (const seg of segments) {
    if (seg.points.length < 2) continue;
    const segNodes: FigureNode[] = seg.points.map((p) => ({
      id: id("n"),
      x: p.x,
      y: p.y,
      mode: "corner",
    }));
    for (let i = 0; i < segNodes.length - 1; i++) {
      edges.push({
        id: id("e"),
        from: segNodes[i].id,
        to: segNodes[i + 1].id,
        kind: "line",
      });
    }
    nodes.push(...segNodes);
  }

  return {
    ...base,
    id: id("fig"),
    kind: "seam",
    parentId: base.id,
    offsetCm: offsetValueCm,
    seamSegments,
    seamSegmentEdgeIds,
    sourceSignature,
    dash: [5, 5],
    fill: "transparent",
    nodes,
    edges,
    closed: false,
  };
}

export function recomputeSeamFigure(
  base: Figure,
  seam: Figure,
  offsetValueCm: number | Record<string, number>
): Figure | null {
  const next = makeSeamFigure(base, offsetValueCm);
  if (!next) return null;
  return {
    ...next,
    id: seam.id,
  };
}
