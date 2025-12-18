/**
 * Dart (Pence) utility functions
 * 
 * A dart is a triangular fold sewn into fabric to add shape and contour.
 * This module handles the geometric insertion of darts into pattern edges.
 */

import { DartInstance, Shape } from "./types";
import { PX_PER_CM } from "./constants";

const MIN_DEPTH_CM = 0.2;
const MIN_OPENING_CM = 0.1;

type Point = { x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toPoints(points: number[]): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i += 2) {
    result.push({ x: points[i], y: points[i + 1] });
  }
  return result;
}

function toNumbers(points: Point[]): number[] {
  const result: number[] = [];
  for (const p of points) result.push(p.x, p.y);
  return result;
}

function distance(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointInPolygon(point: Point, poly: Point[]): boolean {
  // Ray casting
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function closestPointOnSegment(p: Point, a: Point, b: Point) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const vv = vx * vx + vy * vy;
  if (vv < 1e-12) {
    return { point: { ...a }, t: 0, dist: distance(p, a) };
  }
  const t = clamp((wx * vx + wy * vy) / vv, 0, 1);
  const point = { x: a.x + t * vx, y: a.y + t * vy };
  return { point, t, dist: distance(p, point) };
}

function getPerimeter(poly: Point[]): { lengths: number[]; total: number } {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = distance(a, b);
    lengths.push(len);
    total += len;
  }
  return { lengths, total };
}

function sToSegment(poly: Point[], s: number) {
  const { lengths, total } = getPerimeter(poly);
  if (total < 1e-9) {
    return { segmentIndex: 0, t: 0, point: { ...poly[0] } };
  }
  const target = clamp(s, 0, 1) * total;
  let acc = 0;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i];
    if (acc + len >= target) {
      const local = len < 1e-9 ? 0 : (target - acc) / len;
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      return {
        segmentIndex: i,
        t: clamp(local, 0, 1),
        point: { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local },
      };
    }
    acc += len;
  }
  return {
    segmentIndex: poly.length - 1,
    t: 1,
    point: { ...poly[0] },
  };
}

function pointToS(poly: Point[], p: Point) {
  const { lengths, total } = getPerimeter(poly);
  if (total < 1e-9) return { s: 0, segmentIndex: 0, t: 0, point: { ...p } };

  let best = {
    dist: Number.POSITIVE_INFINITY,
    segmentIndex: 0,
    t: 0,
    point: { ...poly[0] },
  };

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const hit = closestPointOnSegment(p, a, b);
    if (hit.dist < best.dist) {
      best = { dist: hit.dist, segmentIndex: i, t: hit.t, point: hit.point };
    }
  }

  let acc = 0;
  for (let i = 0; i < best.segmentIndex; i++) acc += lengths[i];
  const segLen = lengths[best.segmentIndex];
  const at = acc + best.t * segLen;
  return {
    s: total < 1e-9 ? 0 : at / total,
    segmentIndex: best.segmentIndex,
    t: best.t,
    point: best.point,
    dist: best.dist,
  };
}

function getPolygonInwardNormal(poly: Point[], segmentIndex: number) {
  const a = poly[segmentIndex];
  const b = poly[(segmentIndex + 1) % poly.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return { x: 0, y: 0 };

  // Candidate normal (left normal)
  let nx = dy / len;
  let ny = -dx / len;

  // Ensure it points inward by testing a small offset from the segment midpoint.
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const eps = 2;
  const test = { x: mid.x + nx * eps, y: mid.y + ny * eps };
  if (!pointInPolygon(test, poly)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

function getBasePolygonLocal(shape: Shape): Point[] {
  // Prefer the actual points array when present (keeps segment count consistent with rendering).
  if (Array.isArray(shape.points) && shape.points.length >= 6) {
    return toPoints(shape.points);
  }

  // Rect/circle: derive from canonical geometry if points are missing.
  if (shape.tool === "rectangle" && shape.width && shape.height) {
    return toPoints([
      0,
      0,
      shape.width,
      0,
      shape.width,
      shape.height,
      0,
      shape.height,
    ]);
  }
  if (shape.tool === "circle" && shape.radius) {
    const segments = 32;
    const pts: number[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(Math.cos(angle) * shape.radius, Math.sin(angle) * shape.radius);
    }
    return toPoints(pts);
  }

  const base = shape.dartSourcePoints ?? shape.points;
  if (!base || base.length < 6) return [];
  return toPoints(base);
}

export function isDartEligibleShape(shape: Shape): boolean {
  if (shape.kind === "seam") return false;
  if (shape.tool === "rectangle" || shape.tool === "circle") return true;
  const pts = shape.dartSourcePoints ?? shape.points;
  return Array.isArray(pts) && pts.length >= 6;
}

export function getDartSnapOnShape(
  shape: Shape,
  localPoint: Point
): { anchorS: number; segmentIndex: number; t: number; snapPoint: Point; dist: number } | null {
  const basePoly = getBasePolygonLocal(shape);
  if (basePoly.length < 3) return null;
  const hit = pointToS(basePoly, localPoint);
  return {
    anchorS: hit.s,
    segmentIndex: hit.segmentIndex,
    t: hit.t,
    snapPoint: hit.point,
    dist: hit.dist ?? 0,
  };
}

function buildDartGeometry(
  basePoly: Point[],
  dart: DartInstance,
  resolveFrom: "follow" | "frozen"
): {
  segmentIndex: number;
  center: Point;
  baseLeft: Point;
  baseRight: Point;
  apex: Point;
  centerT: number;
} | null {
  if (basePoly.length < 3) return null;

  let anchorPoint: Point;
  if (resolveFrom === "follow") {
    const s = dart.anchorS ?? 0;
    const located = sToSegment(basePoly, s);
    anchorPoint = located.point;
  } else {
    anchorPoint = dart.frozenAnchor ?? basePoly[0];
  }

  const hit = pointToS(basePoly, anchorPoint);
  const segmentIndex = hit.segmentIndex;
  const centerT = hit.t;

  const a = basePoly[segmentIndex];
  const b = basePoly[(segmentIndex + 1) % basePoly.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segLen = Math.sqrt(dx * dx + dy * dy);
  if (segLen < 1e-9) return null;

  const ux = dx / segLen;
  const uy = dy / segLen;

  const center = hit.point;
  const leftHalfPx = clamp(dart.leftOpeningCm, MIN_OPENING_CM, 1000) * PX_PER_CM;
  const rightHalfPx = clamp(dart.rightOpeningCm, MIN_OPENING_CM, 1000) * PX_PER_CM;

  // Clamp so base points stay within the segment.
  const maxLeftPx = centerT * segLen;
  const maxRightPx = (1 - centerT) * segLen;
  const safeLeft = Math.min(leftHalfPx, maxLeftPx);
  const safeRight = Math.min(rightHalfPx, maxRightPx);

  const baseLeft = { x: center.x - ux * safeLeft, y: center.y - uy * safeLeft };
  const baseRight = { x: center.x + ux * safeRight, y: center.y + uy * safeRight };

  const normal = getPolygonInwardNormal(basePoly, segmentIndex);
  const depthPx = clamp(dart.depthCm, MIN_DEPTH_CM, 1000) * PX_PER_CM;
  const apex = { x: center.x + normal.x * depthPx, y: center.y + normal.y * depthPx };

  return { segmentIndex, center, baseLeft, baseRight, apex, centerT };
}

export function getDartEditInfo(
  shape: Shape,
  dartId: string
): {
  dart: DartInstance;
  basePolygon: Point[];
  segmentIndex: number;
  segmentA: Point;
  segmentB: Point;
  normal: Point;
  center: Point;
  baseLeft: Point;
  baseRight: Point;
  apex: Point;
} | null {
  const darts = shape.darts ?? [];
  const dart = darts.find((d) => d.id === dartId);
  if (!dart) return null;
  const basePolygon = getBasePolygonLocal(shape);
  if (basePolygon.length < 3) return null;

  const resolveFrom = dart.linkMode === "follow-edge" ? "follow" : "frozen";
  const geom = buildDartGeometry(basePolygon, dart, resolveFrom);
  if (!geom) return null;

  const segmentA = basePolygon[geom.segmentIndex];
  const segmentB = basePolygon[(geom.segmentIndex + 1) % basePolygon.length];
  const normal = getPolygonInwardNormal(basePolygon, geom.segmentIndex);

  return {
    dart,
    basePolygon,
    segmentIndex: geom.segmentIndex,
    segmentA,
    segmentB,
    normal,
    center: geom.center,
    baseLeft: geom.baseLeft,
    baseRight: geom.baseRight,
    apex: geom.apex,
  };
}

export function getDartGeometries(shape: Shape): Array<{
  id: string;
  center: Point;
  baseLeft: Point;
  baseRight: Point;
  apex: Point;
}> {
  const darts = shape.darts ?? [];
  if (darts.length === 0) return [];
  const basePolygon = getBasePolygonLocal(shape);
  if (basePolygon.length < 3) return [];

  const result: Array<{
    id: string;
    center: Point;
    baseLeft: Point;
    baseRight: Point;
    apex: Point;
  }> = [];

  for (const dart of darts) {
    const resolveFrom = dart.linkMode === "follow-edge" ? "follow" : "frozen";
    const geom = buildDartGeometry(basePolygon, dart, resolveFrom);
    if (!geom) continue;
    result.push({
      id: dart.id,
      center: geom.center,
      baseLeft: geom.baseLeft,
      baseRight: geom.baseRight,
      apex: geom.apex,
    });
  }
  return result;
}

export function recomputeShapeDarts(shape: Shape): Shape {
  const darts = shape.darts ?? [];
  if (darts.length === 0) return shape;

  const basePoly = getBasePolygonLocal(shape);
  if (basePoly.length < 3) return shape;

  // Resolve geometries and group them by segment.
  const bySegment = new Map<number, Array<ReturnType<typeof buildDartGeometry>>>();
  for (const dart of darts) {
    const resolveFrom = dart.linkMode === "follow-edge" ? "follow" : "frozen";
    const geom = buildDartGeometry(basePoly, dart, resolveFrom);
    if (!geom) continue;
    const list = bySegment.get(geom.segmentIndex) ?? [];
    list.push(geom);
    bySegment.set(geom.segmentIndex, list);
  }
  for (const [seg, list] of bySegment.entries()) {
    list.sort((a, b) => (a?.centerT ?? 0) - (b?.centerT ?? 0));
    bySegment.set(seg, list);
  }

  const next: Point[] = [];
  for (let i = 0; i < basePoly.length; i++) {
    const p = basePoly[i];
    next.push(p);

    const dartsOnSeg = bySegment.get(i);
    if (!dartsOnSeg || dartsOnSeg.length === 0) continue;

    for (const d of dartsOnSeg) {
      if (!d) continue;
      next.push(d.baseLeft, d.apex, d.baseRight);
    }
  }

  return {
    ...shape,
    points: toNumbers(next),
    // keep dartSourcePoints as-is (base), points are derived
  };
}

export function addDartToShape(
  shape: Shape,
  params: {
    dartId: string;
    anchorS: number;
    anchorLocalPoint: Point;
    openingCm: number;
    depthCm: number;
    widthMode: DartInstance["widthMode"];
    linkMode: DartInstance["linkMode"];
  }
): Shape {
  if (!isDartEligibleShape(shape)) return shape;

  const half = clamp(params.openingCm / 2, MIN_OPENING_CM, 1000);
  const dart: DartInstance = {
    id: params.dartId,
    anchorS: clamp(params.anchorS, 0, 1),
    frozenAnchor: { x: params.anchorLocalPoint.x, y: params.anchorLocalPoint.y },
    leftOpeningCm: half,
    rightOpeningCm: half,
    depthCm: clamp(params.depthCm, MIN_DEPTH_CM, 1000),
    widthMode: params.widthMode,
    linkMode: params.linkMode,
  };

  // Capture a base polygon snapshot for point-based shapes.
  // For rectangles/circles we derive from width/height/radius, so no need.
  const shouldCaptureBase =
    shape.tool !== "rectangle" &&
    shape.tool !== "circle" &&
    !shape.dartSourcePoints &&
    Array.isArray(shape.points) &&
    shape.points.length >= 6;

  const nextShape: Shape = {
    ...shape,
    dartSourcePoints: shouldCaptureBase ? [...(shape.points ?? [])] : shape.dartSourcePoints,
    darts: [...(shape.darts ?? []), dart],
  };

  return recomputeShapeDarts(nextShape);
}

export function updateDartOnShape(
  shape: Shape,
  dartId: string,
  patch: Partial<Pick<DartInstance, "leftOpeningCm" | "rightOpeningCm" | "depthCm" | "widthMode" | "linkMode" | "anchorS" | "frozenAnchor">>
): Shape {
  const darts = shape.darts ?? [];
  if (darts.length === 0) return shape;
  const nextDarts = darts.map((d) => (d.id === dartId ? { ...d, ...patch } : d));
  return recomputeShapeDarts({ ...shape, darts: nextDarts });
}

export function removeDartFromShape(shape: Shape, dartId: string): Shape {
  const darts = shape.darts ?? [];
  if (darts.length === 0) return shape;
  const nextDarts = darts.filter((d) => d.id !== dartId);
  const nextShape: Shape = { ...shape, darts: nextDarts };

  // If removing the last dart, restore base points.
  if (nextDarts.length === 0) {
    const base = getBasePolygonLocal(shape);
    return {
      ...nextShape,
      points: toNumbers(base),
      darts: [],
    };
  }
  return recomputeShapeDarts(nextShape);
}

/**
 * Calculate the perpendicular direction (normal) to a line segment
 * pointing inward (to the left when walking from p1 to p2)
 */
function getInwardNormal(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): { x: number; y: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length < 0.0001) {
    return { x: 0, y: 0 };
  }
  
  // Normal vector (perpendicular, pointing inward)
  // For a line from p1 to p2, this points to the left (inward direction)
  // Rotate 90 degrees counter-clockwise: (dx, dy) -> (dy, -dx)
  // Example: For horizontal line (dx=100, dy=0), normal is (0, -100) pointing down
  return {
    x: dy / length,
    y: -dx / length,
  };
}

/**
 * Insert a dart into a line shape by modifying its points array
 * 
 * @param shape - The line or curve shape to insert the dart into
 * @param positionRatio - Position along the line (0-1) where dart is placed
 * @param depthPx - Depth/length of the dart in pixels
 * @param openingPx - Opening width at the base in pixels
 * @returns New points array with the dart inserted
 */
export function insertDartIntoLine(
  shape: Shape,
  positionRatio: number,
  depthPx: number,
  openingPx: number
): number[] {
  if (!shape.points || shape.points.length < 4) {
    return shape.points || [];
  }

  // For a line, we have two points: start and end
  const x1 = shape.points[0];
  const y1 = shape.points[1];
  const x2 = shape.points[2];
  const y2 = shape.points[3];

  // Calculate position along the line
  const ratio = Math.max(0, Math.min(1, positionRatio));
  const centerX = x1 + (x2 - x1) * ratio;
  const centerY = y1 + (y2 - y1) * ratio;

  // Get the inward normal direction
  const normal = getInwardNormal({ x: x1, y: y1 }, { x: x2, y: y2 });

  // Calculate dart apex (point)
  const apexX = centerX + normal.x * depthPx;
  const apexY = centerY + normal.y * depthPx;

  // Calculate the two base points of the dart
  const halfOpening = openingPx / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length < 0.0001) {
    return shape.points;
  }

  const dirX = dx / length;
  const dirY = dy / length;

  const leftX = centerX - dirX * halfOpening;
  const leftY = centerY - dirY * halfOpening;
  const rightX = centerX + dirX * halfOpening;
  const rightY = centerY + dirY * halfOpening;

  // New points array: start -> left base -> apex -> right base -> end
  return [
    x1, y1,           // Original start
    leftX, leftY,     // Left base of dart
    apexX, apexY,     // Dart apex (point)
    rightX, rightY,   // Right base of dart
    x2, y2,           // Original end
  ];
}

/**
 * Insert a dart into a rectangle edge
 * 
 * @param shape - The rectangle shape
 * @param edgeIndex - Which edge (0=top, 1=right, 2=bottom, 3=left)
 * @param positionRatio - Position along the edge (0-1)
 * @param depthPx - Depth/length of the dart in pixels
 * @param openingPx - Opening width at the base in pixels
 * @returns New points array with the dart inserted
 */
export function insertDartIntoRectangle(
  shape: Shape,
  edgeIndex: number,
  positionRatio: number,
  depthPx: number,
  openingPx: number
): number[] {
  const width = shape.width || 0;
  const height = shape.height || 0;

  // Rectangle points: [0,0, w,0, w,h, 0,h]
  const corners = [
    { x: 0, y: 0 },       // Top-left
    { x: width, y: 0 },   // Top-right
    { x: width, y: height }, // Bottom-right
    { x: 0, y: height },  // Bottom-left
  ];

  const edge = edgeIndex % 4;
  const p1 = corners[edge];
  const p2 = corners[(edge + 1) % 4];

  // Calculate position along the edge
  const ratio = Math.max(0, Math.min(1, positionRatio));
  const centerX = p1.x + (p2.x - p1.x) * ratio;
  const centerY = p1.y + (p2.y - p1.y) * ratio;

  // Get the inward normal direction
  const normal = getInwardNormal(p1, p2);

  // Calculate dart apex (point)
  const apexX = centerX + normal.x * depthPx;
  const apexY = centerY + normal.y * depthPx;

  // Calculate the two base points of the dart
  const halfOpening = openingPx / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length < 0.0001) {
    return [0, 0, width, 0, width, height, 0, height];
  }

  const dirX = dx / length;
  const dirY = dy / length;

  const leftX = centerX - dirX * halfOpening;
  const leftY = centerY - dirY * halfOpening;
  const rightX = centerX + dirX * halfOpening;
  const rightY = centerY + dirY * halfOpening;

  // Build the new points array
  const newPoints: number[] = [];

  for (let i = 0; i < 4; i++) {
    const corner = corners[i];
    
    if (i === edge) {
      // Add the start corner
      newPoints.push(corner.x, corner.y);
      
      // Add the dart points
      newPoints.push(leftX, leftY);
      newPoints.push(apexX, apexY);
      newPoints.push(rightX, rightY);
    } else {
      newPoints.push(corner.x, corner.y);
    }
  }

  return newPoints;
}

/**
 * Insert a dart into a polyline (works for circles and other shapes with points array)
 * 
 * @param points - The points array representing a closed polyline
 * @param positionRatio - Position along the polyline (0-1)
 * @param depthPx - Depth/length of the dart in pixels
 * @param openingPx - Opening width at the base in pixels
 * @param isClosed - Whether the polyline is closed
 * @returns New points array with the dart inserted
 */
export function insertDartIntoPolyline(
  points: number[],
  positionRatio: number,
  depthPx: number,
  openingPx: number,
  isClosed: boolean = true
): number[] {
  if (points.length < 4) {
    return points;
  }

  const numPoints = Math.floor(points.length / 2);
  
  // Calculate total perimeter
  let totalLength = 0;
  const segmentLengths: number[] = [];
  
  const segmentsCount = isClosed ? numPoints : numPoints - 1;
  for (let i = 0; i < segmentsCount; i++) {
    const nextIndex = (i + 1) % numPoints;
    const dx = points[nextIndex * 2] - points[i * 2];
    const dy = points[nextIndex * 2 + 1] - points[i * 2 + 1];
    const length = Math.sqrt(dx * dx + dy * dy);
    segmentLengths.push(length);
    totalLength += length;
  }

  // Find which segment contains the dart position
  const targetLength = totalLength * Math.max(0, Math.min(1, positionRatio));
  let accumulatedLength = 0;
  let segmentIndex = 0;
  let segmentRatio = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    if (accumulatedLength + segmentLengths[i] >= targetLength) {
      segmentIndex = i;
      const remaining = targetLength - accumulatedLength;
      segmentRatio = segmentLengths[i] > 0 ? remaining / segmentLengths[i] : 0;
      break;
    }
    accumulatedLength += segmentLengths[i];
  }

  // Get the segment endpoints
  const nextIndex = (segmentIndex + 1) % numPoints;
  const p1 = {
    x: points[segmentIndex * 2],
    y: points[segmentIndex * 2 + 1],
  };
  const p2 = {
    x: points[nextIndex * 2],
    y: points[nextIndex * 2 + 1],
  };

  // Calculate position along the segment
  const centerX = p1.x + (p2.x - p1.x) * segmentRatio;
  const centerY = p1.y + (p2.y - p1.y) * segmentRatio;

  // Get the inward normal direction
  const normal = getInwardNormal(p1, p2);

  // Calculate dart apex (point)
  const apexX = centerX + normal.x * depthPx;
  const apexY = centerY + normal.y * depthPx;

  // Calculate the two base points of the dart
  const halfOpening = openingPx / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length < 0.0001) {
    return points;
  }

  const dirX = dx / length;
  const dirY = dy / length;

  const leftX = centerX - dirX * halfOpening;
  const leftY = centerY - dirY * halfOpening;
  const rightX = centerX + dirX * halfOpening;
  const rightY = centerY + dirY * halfOpening;

  // Build the new points array
  const newPoints: number[] = [];

  // Add all points up to the segment
  for (let i = 0; i <= segmentIndex; i++) {
    newPoints.push(points[i * 2], points[i * 2 + 1]);
  }

  // Add the dart points
  newPoints.push(leftX, leftY);
  newPoints.push(apexX, apexY);
  newPoints.push(rightX, rightY);

  // Add remaining points
  for (let i = nextIndex; i < numPoints; i++) {
    newPoints.push(points[i * 2], points[i * 2 + 1]);
  }

  return newPoints;
}

/**
 * Apply dart to a shape
 * 
 * @param shape - The shape to apply the dart to
 * @param positionRatio - Position along the edge (0-1)
 * @param depthPx - Depth/length of the dart in pixels
 * @param openingPx - Opening width at the base in pixels
 * @param edgeIndex - For rectangles, which edge (0-3)
 * @returns Updated shape with dart applied
 */
export function applyDartToShape(
  shape: Shape,
  positionRatio: number,
  depthPx: number,
  openingPx: number,
  edgeIndex: number = 0
): Shape {
  let newPoints: number[];

  // For open shapes/polylines, repeatedly applying a dart on already-modified
  // points will "stack" darts and looks like duplicated geometry.
  // Keep a stable source of truth for the pre-dart points.
  const shouldPreserveSourcePoints =
    (shape.tool === "line" || shape.tool === "curve" || shape.tool === "circle") &&
    Array.isArray(shape.points) &&
    shape.points.length >= 4;

  const sourcePoints = shouldPreserveSourcePoints
    ? (shape.dartSourcePoints ?? shape.points)
    : shape.points;

  const dartSourcePoints = shouldPreserveSourcePoints
    ? (shape.dartSourcePoints ?? [...(shape.points ?? [])])
    : shape.dartSourcePoints;

  if (shape.tool === "line" || shape.tool === "curve") {
    newPoints = insertDartIntoLine(
      {
        ...shape,
        points: sourcePoints,
      },
      positionRatio,
      depthPx,
      openingPx
    );
  } else if (shape.tool === "rectangle") {
    newPoints = insertDartIntoRectangle(
      shape,
      edgeIndex,
      positionRatio,
      depthPx,
      openingPx
    );
  } else if (shape.tool === "circle") {
    newPoints = insertDartIntoPolyline(
      sourcePoints || [],
      positionRatio,
      depthPx,
      openingPx,
      true
    );
  } else {
    return shape;
  }

  return {
    ...shape,
    points: newPoints,
    dartSourcePoints,
    dartParams: {
      depthCm: depthPx / PX_PER_CM,
      openingCm: openingPx / PX_PER_CM,
      positionRatio,
      targetShapeId: shape.id,
      edgeIndex,
    },
  };
}
