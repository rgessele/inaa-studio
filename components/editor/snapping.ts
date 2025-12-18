/**
 * Snapping utilities for intelligent point attraction in the canvas editor.
 * Implements magnetic snapping to endpoints, midpoints, and intersections.
 */

import { Shape } from "./types";

export const SNAP_THRESHOLD_PX = 10;

export interface SnapPoint {
  x: number;
  y: number;
  type: "endpoint" | "midpoint" | "intersection";
  shapeId?: string;
}

/**
 * Check if a shape is closed (forms a complete loop)
 */
function isClosedShape(shape: Shape): boolean {
  return (
    shape.tool === "rectangle" ||
    shape.tool === "circle" ||
    shape.tool === "polygon"
  );
}

/**
 * Get all endpoints from a shape's points array
 */
function getEndpoints(shape: Shape): SnapPoint[] {
  if (!shape.points || shape.points.length < 2) return [];

  const endpoints: SnapPoint[] = [];
  const numPoints = shape.points.length / 2;

  // For all shapes, add all vertices as endpoints
  for (let i = 0; i < numPoints; i++) {
    const x = shape.x + shape.points[i * 2];
    const y = shape.y + shape.points[i * 2 + 1];
    endpoints.push({
      x,
      y,
      type: "endpoint",
      shapeId: shape.id,
    });
  }

  return endpoints;
}

/**
 * Get midpoints of all line segments in a shape
 */
function getMidpoints(shape: Shape): SnapPoint[] {
  if (!shape.points || shape.points.length < 4) return [];

  const midpoints: SnapPoint[] = [];
  const numPoints = shape.points.length / 2;
  const isClosed = isClosedShape(shape);

  // Calculate midpoints for each segment
  const segments = isClosed ? numPoints : numPoints - 1;
  for (let i = 0; i < segments; i++) {
    const x1 = shape.x + shape.points[i * 2];
    const y1 = shape.y + shape.points[i * 2 + 1];

    const nextIndex = (i + 1) % numPoints;
    const x2 = shape.x + shape.points[nextIndex * 2];
    const y2 = shape.y + shape.points[nextIndex * 2 + 1];

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    midpoints.push({
      x: midX,
      y: midY,
      type: "midpoint",
      shapeId: shape.id,
    });
  }

  return midpoints;
}

/**
 * Calculate intersection point between two line segments
 * Returns null if lines don't intersect
 */
function lineIntersection(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number
): { x: number; y: number } | null {
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  // Lines are parallel or coincident
  if (Math.abs(denominator) < 0.0001) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;

  // Check if intersection point is within both line segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    };
  }

  return null;
}

/**
 * Get all intersection points between line segments of different shapes
 */
function getIntersections(shapes: Shape[]): SnapPoint[] {
  const intersections: SnapPoint[] = [];

  // Get all line segments from all shapes
  const segments: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    shapeId: string;
  }> = [];

  for (const shape of shapes) {
    if (!shape.points || shape.points.length < 4) continue;

    const numPoints = shape.points.length / 2;
    const isClosed = isClosedShape(shape);
    const numSegments = isClosed ? numPoints : numPoints - 1;

    for (let i = 0; i < numSegments; i++) {
      const x1 = shape.x + shape.points[i * 2];
      const y1 = shape.y + shape.points[i * 2 + 1];

      const nextIndex = (i + 1) % numPoints;
      const x2 = shape.x + shape.points[nextIndex * 2];
      const y2 = shape.y + shape.points[nextIndex * 2 + 1];

      segments.push({ x1, y1, x2, y2, shapeId: shape.id });
    }
  }

  // Check for intersections between segments from different shapes
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      // Only check intersections between different shapes
      if (segments[i].shapeId === segments[j].shapeId) continue;

      const seg1 = segments[i];
      const seg2 = segments[j];

      const intersection = lineIntersection(
        seg1.x1,
        seg1.y1,
        seg1.x2,
        seg1.y2,
        seg2.x1,
        seg2.y1,
        seg2.x2,
        seg2.y2
      );

      if (intersection) {
        intersections.push({
          x: intersection.x,
          y: intersection.y,
          type: "intersection",
        });
      }
    }
  }

  return intersections;
}

/**
 * Get all snap points from all shapes
 */
export function getAllSnapPoints(
  shapes: Shape[],
  currentShapeId?: string,
  currentNodeIndex?: number
): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];

  for (const shape of shapes) {
    // Get endpoints from all shapes
    const endpoints = getEndpoints(shape);

    // Filter out the current node being dragged to avoid self-snapping
    const filteredEndpoints = endpoints.filter((ep) => {
      if (currentShapeId === shape.id && currentNodeIndex !== undefined) {
        // Calculate which endpoint this is
        const endpointIndex = endpoints.indexOf(ep);
        return endpointIndex !== currentNodeIndex;
      }
      return true;
    });

    snapPoints.push(...filteredEndpoints);

    // Get midpoints from all shapes
    snapPoints.push(...getMidpoints(shape));
  }

  // Get intersections between all shapes
  snapPoints.push(...getIntersections(shapes));

  return snapPoints;
}

/**
 * Find the nearest snap point to the given position
 * Returns null if no snap point is within threshold
 */
export function findNearestSnapPoint(
  x: number,
  y: number,
  snapPoints: SnapPoint[],
  threshold: number = SNAP_THRESHOLD_PX
): SnapPoint | null {
  let nearest: SnapPoint | null = null;
  let minDistance = threshold;

  for (const snapPoint of snapPoints) {
    const dx = snapPoint.x - x;
    const dy = snapPoint.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < minDistance) {
      minDistance = distance;
      nearest = snapPoint;
    }
  }

  return nearest;
}
