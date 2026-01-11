export type Vec2 = { x: number; y: number };

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function mul(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

export function len(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function rotate(p: Vec2, degrees: number): Vec2 {
  if (!degrees) return p;
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function rotateInv(p: Vec2, degrees: number): Vec2 {
  if (!degrees) return p;
  return rotate(p, -degrees);
}

export function cubicAt(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  t: number
): Vec2 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t2 * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

export function sampleCubic(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  steps: number
): Vec2[] {
  const pts: Vec2[] = [];
  const safeSteps = Math.max(4, Math.floor(steps));
  for (let i = 0; i <= safeSteps; i++) {
    pts.push(cubicAt(p0, p1, p2, p3, i / safeSteps));
  }
  return pts;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  if (l <= 1e-9) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

export function perp(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

export function midAndTangent(
  points: Vec2[]
): { mid: Vec2; tangent: Vec2 } | null {
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

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function pointToSegmentDistance(
  p: Vec2,
  a: Vec2,
  b: Vec2
): { d: number; t: number } {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const abLen2 = ab.x * ab.x + ab.y * ab.y;
  if (abLen2 <= 1e-9) return { d: dist(p, a), t: 0 };
  const t = clamp((ap.x * ab.x + ap.y * ab.y) / abLen2, 0, 1);
  const proj = add(a, mul(ab, t));
  return { d: dist(p, proj), t };
}

export function normalizeUprightAngleDeg(angleDeg: number): number {
  // Keep text readable by avoiding upside-down rotations.
  // Normalize to [-180, 180), then flip into [-90, 90].
  let a = ((angleDeg + 180) % 360) - 180;
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

export function polylineLength(points: Vec2[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += dist(points[i], points[i + 1]);
  }
  return sum;
}

export function polylinePointAtDistance(
  points: Vec2[],
  distancePx: number
): { point: Vec2; tangent: Vec2 } | null {
  if (points.length < 2) return null;
  const total = polylineLength(points);
  if (total <= 1e-9) {
    const t = sub(points[points.length - 1], points[0]);
    return { point: points[0], tangent: t };
  }

  const d = clamp(distancePx, 0, total);
  let cum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segLen = dist(a, b);
    if (segLen <= 1e-9) continue;

    if (cum + segLen >= d) {
      const t = (d - cum) / segLen;
      return { point: lerp(a, b, t), tangent: sub(b, a) };
    }
    cum += segLen;
  }

  const lastA = points[points.length - 2];
  const lastB = points[points.length - 1];
  return { point: lastB, tangent: sub(lastB, lastA) };
}

export const KAPPA = 0.5522847498307936;

export function ellipseAsCubics(
  rx: number,
  ry: number
): {
  nodes: Array<{
    x: number;
    y: number;
    inHandle: Vec2;
    outHandle: Vec2;
    mode: "smooth";
  }>;
} {
  const safeRx = Math.max(0, rx);
  const safeRy = Math.max(0, ry);
  const hx = KAPPA * safeRx;
  const hy = KAPPA * safeRy;

  // Cardinal points (clockwise): (rx,0) -> (0,ry) -> (-rx,0) -> (0,-ry)
  // Handles are absolute in local coordinates.
  return {
    nodes: [
      {
        x: safeRx,
        y: 0,
        inHandle: { x: safeRx, y: -hy },
        outHandle: { x: safeRx, y: hy },
        mode: "smooth",
      },
      {
        x: 0,
        y: safeRy,
        inHandle: { x: hx, y: safeRy },
        outHandle: { x: -hx, y: safeRy },
        mode: "smooth",
      },
      {
        x: -safeRx,
        y: 0,
        inHandle: { x: -safeRx, y: hy },
        outHandle: { x: -safeRx, y: -hy },
        mode: "smooth",
      },
      {
        x: 0,
        y: -safeRy,
        inHandle: { x: -hx, y: -safeRy },
        outHandle: { x: hx, y: -safeRy },
        mode: "smooth",
      },
    ],
  };
}

export function circleAsCubics(radius: number): {
  nodes: Array<{
    x: number;
    y: number;
    inHandle: Vec2;
    outHandle: Vec2;
    mode: "smooth";
  }>;
} {
  const r = Math.max(0, radius);
  const h = KAPPA * r;

  // Cardinal points (clockwise): (r,0) -> (0,r) -> (-r,0) -> (0,-r)
  // Handles are absolute in local coordinates.
  return {
    nodes: [
      {
        x: r,
        y: 0,
        inHandle: { x: r, y: -h },
        outHandle: { x: r, y: h },
        mode: "smooth",
      },
      {
        x: 0,
        y: r,
        inHandle: { x: h, y: r },
        outHandle: { x: -h, y: r },
        mode: "smooth",
      },
      {
        x: -r,
        y: 0,
        inHandle: { x: -r, y: h },
        outHandle: { x: -r, y: -h },
        mode: "smooth",
      },
      {
        x: 0,
        y: -r,
        inHandle: { x: -h, y: -r },
        outHandle: { x: h, y: -r },
        mode: "smooth",
      },
    ],
  };
}
