/**
 * Offset/Seam Allowance calculations for shapes
 * Creates parallel contours for seam allowance (margem de costura)
 */

import { Shape } from "./types";

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
    fill: shape.fill,
    rotation: shape.rotation,
    opacity: shape.opacity,
    dash: undefined, // Solid line for cutting line
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
    fill: shape.fill,
    rotation: shape.rotation,
    opacity: shape.opacity,
    dash: undefined, // Solid line for cutting line
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
    dash: undefined, // Solid line
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
    dash: undefined, // Solid line
  };

  return [offsetLine1, offsetLine2];
}

/**
 * Apply offset to a shape and return new offset shape(s)
 * Also marks the original shape with dashed line style
 */
export function applyOffset(
  shape: Shape,
  offsetCm: number,
  pixelsPerCm: number
): { offsetShapes: Shape[]; dashedOriginal: Shape } {
  let offsetShapes: Shape[] = [];

  // Calculate offset based on shape type
  if (shape.tool === "rectangle") {
    offsetShapes = [calculateRectangleOffset(shape, offsetCm, pixelsPerCm)];
  } else if (shape.tool === "circle") {
    offsetShapes = [calculateCircleOffset(shape, offsetCm, pixelsPerCm)];
  } else if (shape.tool === "line" || shape.tool === "curve") {
    offsetShapes = calculateLineOffset(shape, offsetCm, pixelsPerCm);
  }

  // Mark original with dashed line (seam line)
  const dashedOriginal: Shape = {
    ...shape,
    dash: [5, 5], // Dashed pattern
  };

  return { offsetShapes, dashedOriginal };
}
