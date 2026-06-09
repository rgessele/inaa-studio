/**
 * Polyline / polygon simplification (Ramer–Douglas–Peucker).
 *
 * Shared by the seam-allowance generator (seamFigure.ts) and the pen tool.
 * Pure geometry — no React/Konva/DOM imports — so it is safe to use from
 * worker/offline contexts as well.
 *
 * NOTE: the offline backfill `scripts/migrate-seam-figures.mjs` keeps a
 * byte-identical copy of `simplifyClosedPolygonRdp` (it cannot import this TS
 * module directly under plain `node`). If you change the algorithm here, mirror
 * the change there.
 */

import { pointToSegmentDistance, type Vec2 } from "./figureGeometry";

/**
 * Simplify an OPEN polyline. First and last points are always kept.
 * `tolerance` is the maximum allowed perpendicular deviation (in px).
 */
export function simplifyPolylineRdp(points: Vec2[], tolerance: number): Vec2[] {
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

/**
 * Simplify a CLOSED polygon ring (points do NOT repeat the first vertex).
 * The ring is split at vertex 0 and the vertex farthest from it — both are
 * guaranteed to lie on the outer hull, so neither becomes a simplification
 * artifact — then each arc is simplified independently and rejoined.
 *
 * `tolerance` bounds the perpendicular deviation (px), so the simplified ring
 * never strays more than `tolerance` from the original contour.
 */
export function simplifyClosedPolygonRdp(
  points: Vec2[],
  tolerance: number
): Vec2[] {
  const n = points.length;
  if (n <= 4) return points;
  if (!Number.isFinite(tolerance) || tolerance <= 0) return points;

  // Farthest vertex from points[0] — a stable, well-separated split anchor.
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < n; i++) {
    const dx = points[i].x - points[0].x;
    const dy = points[i].y - points[0].y;
    const d = dx * dx + dy * dy;
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }

  const arc1 = points.slice(0, far + 1); // [0 .. far]
  const arc2 = points.slice(far).concat([points[0]]); // [far .. 0]

  const s1 = simplifyPolylineRdp(arc1, tolerance);
  const s2 = simplifyPolylineRdp(arc2, tolerance);

  // Drop the shared endpoints (far appears at the end of s1 and start of s2;
  // 0 appears at the end of s2 and start of s1) to avoid duplicate vertices.
  const merged = s1.slice(0, -1).concat(s2.slice(0, -1));
  return merged.length >= 3 ? merged : points;
}
