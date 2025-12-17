/**
 * Unfold Tool - Shape Unfolding/Merging Utilities
 *
 * Provides functions to unfold half-drawn shapes by mirroring and merging them
 * into a single closed shape. Used for symmetric pattern pieces like pants, shirts, etc.
 */

import { Shape } from "./types";
import { mirrorPoints, MirrorAxis } from "./mirror";

/**
 * Unfold a shape by mirroring it across an axis and merging the two halves
 * into a single closed polyline shape.
 */
export function unfoldShape(
  shape: Shape,
  axis: MirrorAxis,
  axisPosition: number
): Shape | null {
  // Only unfold line and curve shapes (polylines)
  if (shape.tool !== "line" && shape.tool !== "curve") {
    return null;
  }

  if (!shape.points || shape.points.length < 4) {
    return null;
  }

  // Get the original points
  const originalPoints = shape.points;

  // Mirror the points across the axis
  // For vertical axis, mirror across x
  // For horizontal axis, mirror across y
  const mirroredPoints = mirrorPoints(
    originalPoints,
    axis,
    axisPosition - shape.x
  );

  // Reverse the mirrored points so they connect properly
  const reversedMirrored: number[] = [];
  for (let i = mirroredPoints.length - 2; i >= 0; i -= 2) {
    reversedMirrored.push(mirroredPoints[i], mirroredPoints[i + 1]);
  }

  // Merge: original + reversed mirrored
  // This creates a closed path
  const mergedPoints = [...originalPoints, ...reversedMirrored];

  // Create the unfolded shape
  const unfoldedShape: Shape = {
    ...shape,
    id: `${shape.id}-unfolded-${Date.now()}`,
    tool: "line", // Convert curves to lines for simplicity
    points: mergedPoints,
    controlPoint: undefined, // Remove control point as we're now a polyline
  };

  return unfoldedShape;
}

/**
 * Check if a shape is suitable for unfolding
 */
export function canUnfoldShape(shape: Shape): boolean {
  return (
    (shape.tool === "line" || shape.tool === "curve") &&
    !!shape.points &&
    shape.points.length >= 4
  );
}

/**
 * Get a suggested axis position for unfolding based on the shape
 */
export function getSuggestedUnfoldAxis(
  shape: Shape,
  axis: MirrorAxis
): number {
  if (!shape.points || shape.points.length < 2) {
    return axis === "vertical" ? shape.x : shape.y;
  }

  // Find the edge point on the axis side
  if (axis === "vertical") {
    // Find leftmost or rightmost x
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < shape.points.length; i += 2) {
      const x = shape.x + shape.points[i];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    // Use the left edge as default
    return minX;
  } else {
    // Find topmost or bottommost y
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < shape.points.length; i += 2) {
      const y = shape.y + shape.points[i + 1];
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    // Use the top edge as default
    return minY;
  }
}
