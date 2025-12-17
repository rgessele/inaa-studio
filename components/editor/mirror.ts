/**
 * Mirror Tool - Shape Mirroring Utilities
 * 
 * Provides functions to mirror shapes horizontally or vertically.
 * Used for creating symmetric pattern pieces.
 */

import { Shape } from "./types";

export type MirrorAxis = "vertical" | "horizontal";

/**
 * Mirror a point across a vertical or horizontal axis
 */
export function mirrorPoint(
  point: { x: number; y: number },
  axis: MirrorAxis,
  axisPosition: number
): { x: number; y: number } {
  if (axis === "vertical") {
    // Mirror across vertical axis (x = axisPosition)
    const distance = point.x - axisPosition;
    return { x: axisPosition - distance, y: point.y };
  } else {
    // Mirror across horizontal axis (y = axisPosition)
    const distance = point.y - axisPosition;
    return { x: point.x, y: axisPosition - distance };
  }
}

/**
 * Mirror an array of points [x1, y1, x2, y2, ...]
 */
export function mirrorPoints(
  points: number[],
  axis: MirrorAxis,
  axisPosition: number
): number[] {
  const result: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const mirrored = mirrorPoint(
      { x: points[i], y: points[i + 1] },
      axis,
      axisPosition
    );
    result.push(mirrored.x, mirrored.y);
  }
  return result;
}

/**
 * Calculate the center of a shape to use as the default mirror axis
 */
export function getShapeCenter(shape: Shape): { x: number; y: number } {
  if (shape.tool === "rectangle" && shape.width && shape.height) {
    return {
      x: shape.x + shape.width / 2,
      y: shape.y + shape.height / 2,
    };
  } else if (shape.tool === "circle" && shape.radius) {
    return { x: shape.x, y: shape.y };
  } else if (shape.tool === "line" || shape.tool === "curve") {
    if (!shape.points || shape.points.length < 4) {
      return { x: shape.x, y: shape.y };
    }
    // Average of all points
    let sumX = 0;
    let sumY = 0;
    const numPoints = shape.points.length / 2;
    for (let i = 0; i < shape.points.length; i += 2) {
      sumX += shape.points[i];
      sumY += shape.points[i + 1];
    }
    return {
      x: shape.x + sumX / numPoints,
      y: shape.y + sumY / numPoints,
    };
  }
  return { x: shape.x, y: shape.y };
}

/**
 * Get bounding box of a shape
 */
function getShapeBounds(shape: Shape): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  if (shape.tool === "rectangle" && shape.width && shape.height) {
    return {
      minX: shape.x,
      maxX: shape.x + shape.width,
      minY: shape.y,
      maxY: shape.y + shape.height,
    };
  } else if (shape.tool === "circle" && shape.radius) {
    return {
      minX: shape.x - shape.radius,
      maxX: shape.x + shape.radius,
      minY: shape.y - shape.radius,
      maxY: shape.y + shape.radius,
    };
  } else if (shape.points && shape.points.length >= 2) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < shape.points.length; i += 2) {
      const x = shape.x + shape.points[i];
      const y = shape.y + shape.points[i + 1];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return { minX, maxX, minY, maxY };
  }
  return { minX: shape.x, maxX: shape.x, minY: shape.y, maxY: shape.y };
}

/**
 * Mirror a shape across a vertical or horizontal axis
 */
export function mirrorShape(
  shape: Shape,
  axis: MirrorAxis,
  axisPosition?: number
): Shape {
  // Use shape center as default axis position
  const center = getShapeCenter(shape);
  const axisPos = axisPosition ?? (axis === "vertical" ? center.x : center.y);

  const newShape: Shape = {
    ...shape,
    id: `${shape.id}-mirror-${Date.now()}`,
  };

  if (shape.tool === "rectangle" && shape.width && shape.height) {
    if (axis === "vertical") {
      // Mirror across vertical axis
      const distance = shape.x - axisPos;
      newShape.x = axisPos - distance - shape.width;
      newShape.y = shape.y;
    } else {
      // Mirror across horizontal axis
      const distance = shape.y - axisPos;
      newShape.x = shape.x;
      newShape.y = axisPos - distance - shape.height;
    }
  } else if (shape.tool === "circle") {
    const mirrored = mirrorPoint({ x: shape.x, y: shape.y }, axis, axisPos);
    newShape.x = mirrored.x;
    newShape.y = mirrored.y;
  } else if (
    (shape.tool === "line" || shape.tool === "curve") &&
    shape.points
  ) {
    // Mirror the points array
    const mirroredPoints = mirrorPoints(shape.points, axis, axisPos - shape.x);
    newShape.points = mirroredPoints;

    // Mirror control point for curves
    if (shape.tool === "curve" && shape.controlPoint) {
      const mirroredControl = mirrorPoint(
        {
          x: shape.x + shape.controlPoint.x,
          y: shape.y + shape.controlPoint.y,
        },
        axis,
        axisPos
      );
      newShape.controlPoint = {
        x: mirroredControl.x - shape.x,
        y: mirroredControl.y - shape.y,
      };
    }
  }

  return newShape;
}

/**
 * Get the axis position for a selection (e.g., left/right/top/bottom edge or center)
 */
export function getAxisPositionForShape(
  shape: Shape,
  axis: MirrorAxis,
  edge: "start" | "center" | "end" = "center"
): number {
  const bounds = getShapeBounds(shape);

  if (axis === "vertical") {
    if (edge === "start") return bounds.minX;
    if (edge === "end") return bounds.maxX;
    return (bounds.minX + bounds.maxX) / 2;
  } else {
    if (edge === "start") return bounds.minY;
    if (edge === "end") return bounds.maxY;
    return (bounds.minY + bounds.maxY) / 2;
  }
}
