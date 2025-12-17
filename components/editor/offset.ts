/**
 * Offset/Seam Allowance calculations for shapes
 * Creates parallel contours for seam allowance (margem de costura)
 */

import { Shape } from "./types";

const SEAM_DASH: number[] = [5, 5];

/**
 * Calculate offset for a rectangle shape
 * Returns a new shape with expanded dimensions
 */
export function calculateRectangleOffset(
  shape: Shape,
  offsetCm: number,
  pixelsPerCm: number
): Shape {
  const offsetPx = offsetCm * pixelsPerCm;
  
  if (!shape.width || !shape.height) {
    return shape;
  }

  // Expand the rectangle outward by the offset value
  const newWidth = shape.width + 2 * offsetPx;
  const newHeight = shape.height + 2 * offsetPx;
  const newX = shape.x - offsetPx;
  const newY = shape.y - offsetPx;

  // Create rectangle points for the new size
  // Note: In Konva, shape points are always relative to the shape's (x, y) position,
  // not absolute coordinates. The shape position is stored in newX, newY above.
  const newPoints = [0, 0, newWidth, 0, newWidth, newHeight, 0, newHeight];

  return {
    id: crypto.randomUUID(),
    tool: "rectangle",
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight,
    points: newPoints,
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    fill: undefined,
    rotation: shape.rotation,
    opacity: shape.opacity,
    dash: SEAM_DASH,
  };
}

/**
 * Calculate offset for a circle shape
 * Returns a new shape with expanded radius
 */
export function calculateCircleOffset(
  shape: Shape,
  offsetCm: number,
  pixelsPerCm: number
): Shape {
  const offsetPx = offsetCm * pixelsPerCm;
  
  if (!shape.radius) {
    return shape;
  }

  const newRadius = shape.radius + offsetPx;

  // Create circle points for the new radius
  const segments = 32;
  const newPoints: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    newPoints.push(Math.cos(angle) * newRadius, Math.sin(angle) * newRadius);
  }

  return {
    id: crypto.randomUUID(),
    tool: "circle",
    x: shape.x,
    y: shape.y,
    radius: newRadius,
    points: newPoints,
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    fill: undefined,
    rotation: shape.rotation,
    opacity: shape.opacity,
    dash: SEAM_DASH,
  };
}

/**
 * Calculate offset for a line or curve shape
 * For simple lines, creates parallel lines on both sides
 */
export function calculateLineOffset(
  shape: Shape,
  offsetCm: number,
  pixelsPerCm: number
): Shape[] {
  const offsetPx = offsetCm * pixelsPerCm;
  
  if (!shape.points || shape.points.length < 4) {
    return [];
  }

  const x1 = shape.points[0];
  const y1 = shape.points[1];
  const x2 = shape.points[2];
  const y2 = shape.points[3];

  // Calculate perpendicular vector
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length === 0) {
    return [];
  }

  // Normalize and rotate 90 degrees
  const perpX = (-dy / length) * offsetPx;
  const perpY = (dx / length) * offsetPx;

  // Create two parallel lines (one on each side)
  const offsetLine1: Shape = {
    id: crypto.randomUUID(),
    tool: "line",
    x: shape.x,
    y: shape.y,
    points: [
      x1 + perpX,
      y1 + perpY,
      x2 + perpX,
      y2 + perpY,
    ],
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    rotation: shape.rotation,
    opacity: shape.opacity,
    dash: SEAM_DASH,
  };

  const offsetLine2: Shape = {
    id: crypto.randomUUID(),
    tool: "line",
    x: shape.x,
    y: shape.y,
    points: [
      x1 - perpX,
      y1 - perpY,
      x2 - perpX,
      y2 - perpY,
    ],
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    rotation: shape.rotation,
    opacity: shape.opacity,
    dash: SEAM_DASH,
  };

  return [offsetLine1, offsetLine2];
}

function computeSeamParts(base: Shape, offsetCm: number, pixelsPerCm: number) {
  if (base.tool === "rectangle") {
    return [{ seamPart: 0, shape: calculateRectangleOffset(base, offsetCm, pixelsPerCm) }];
  }
  if (base.tool === "circle") {
    return [{ seamPart: 0, shape: calculateCircleOffset(base, offsetCm, pixelsPerCm) }];
  }
  if (base.tool === "line" || base.tool === "curve") {
    const lines = calculateLineOffset(base, offsetCm, pixelsPerCm);
    return lines.map((shape, index) => ({ seamPart: index, shape }));
  }
  return [] as Array<{ seamPart: number; shape: Shape }>;
}

/**
 * Create/update seam allowance shapes for a base shape.
 * Preserves stable IDs by matching `seamPart`.
 */
export function upsertSeamAllowance(
  base: Shape,
  existingSeams: Shape[],
  offsetCm: number,
  pixelsPerCm: number
): Shape[] {
  const parts = computeSeamParts(base, offsetCm, pixelsPerCm);

  return parts.map(({ seamPart, shape }) => {
    const existing = existingSeams.find((s) => s.seamPart === seamPart);
    return {
      ...shape,
      id: existing?.id ?? crypto.randomUUID(),
      kind: "seam",
      parentId: base.id,
      offsetCm,
      seamPart,
      dash: SEAM_DASH,
    };
  });
}
