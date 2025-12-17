/**
 * Dart (Pence) utility functions
 * 
 * A dart is a triangular fold sewn into fabric to add shape and contour.
 * This module handles the geometric insertion of darts into pattern edges.
 */

import { Shape } from "./types";

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
  
  // Normal vector (perpendicular, pointing left/inward)
  // Rotate 90 degrees counter-clockwise: (dx, dy) -> (-dy, dx)
  return {
    x: -dy / length,
    y: dx / length,
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

  if (shape.tool === "line" || shape.tool === "curve") {
    newPoints = insertDartIntoLine(shape, positionRatio, depthPx, openingPx);
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
      shape.points || [],
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
    dartParams: {
      depthCm: depthPx,
      openingCm: openingPx,
      positionRatio,
      targetShapeId: shape.id,
      edgeIndex,
    },
  };
}
