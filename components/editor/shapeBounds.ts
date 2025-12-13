import { Shape } from "./types";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getShapeBoundingBox(shape: Shape): BoundingBox {
  let minX = shape.x;
  let minY = shape.y;
  let maxX = shape.x;
  let maxY = shape.y;

  if (shape.tool === "rectangle") {
    const width = shape.width || 0;
    const height = shape.height || 0;
    maxX = shape.x + width;
    maxY = shape.y + height;
  } else if (shape.tool === "circle") {
    const radius = shape.radius || 0;
    minX = shape.x - radius;
    minY = shape.y - radius;
    maxX = shape.x + radius;
    maxY = shape.y + radius;
  } else if (shape.tool === "line" || shape.tool === "curve") {
    const points = shape.points || [];
    for (let i = 0; i < points.length; i += 2) {
      const px = shape.x + points[i];
      const py = shape.y + points[i + 1];
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }

  const strokeWidth = shape.strokeWidth || 0;
  const halfStroke = strokeWidth / 2;
  minX -= halfStroke;
  minY -= halfStroke;
  maxX += halfStroke;
  maxY += halfStroke;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function calculateBoundingBox(shapes: Shape[]): BoundingBox | null {
  if (shapes.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  shapes.forEach((shape) => {
    const box = getShapeBoundingBox(shape);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function intersectsRect(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}
