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

export function cubicAt(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
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

export function sampleCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, steps: number): Vec2[] {
  const pts: Vec2[] = [];
  const safeSteps = Math.max(4, Math.floor(steps));
  for (let i = 0; i <= safeSteps; i++) {
    pts.push(cubicAt(p0, p1, p2, p3, i / safeSteps));
  }
  return pts;
}

export const KAPPA = 0.5522847498307936;

export function circleAsCubics(radius: number): {
  nodes: Array<{ x: number; y: number; inHandle: Vec2; outHandle: Vec2; mode: "smooth" }>; 
} {
  const r = Math.max(0, radius);
  const h = KAPPA * r;

  // Cardinal points (clockwise): (r,0) -> (0,r) -> (-r,0) -> (0,-r)
  // Handles are absolute in local coordinates.
  return {
    nodes: [
      { x: r, y: 0, inHandle: { x: r, y: -h }, outHandle: { x: r, y: h }, mode: "smooth" },
      { x: 0, y: r, inHandle: { x: h, y: r }, outHandle: { x: -h, y: r }, mode: "smooth" },
      { x: -r, y: 0, inHandle: { x: -r, y: h }, outHandle: { x: -r, y: -h }, mode: "smooth" },
      { x: 0, y: -r, inHandle: { x: -h, y: -r }, outHandle: { x: h, y: -r }, mode: "smooth" },
    ],
  };
}
