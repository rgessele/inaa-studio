import Konva from "konva";
import { worldToFigureLocal } from "./figurePath";
import type { Figure } from "./types";

type Point = { x: number; y: number };

type FigureBaseTransform = Pick<Figure, "x" | "y" | "rotation">;

export type FigureNodeTransformCommit = FigureBaseTransform & {
  transformMatrix: number[];
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
};

function transformPoint(matrix: Konva.Transform, point: Point): Point {
  return matrix.point(point);
}

export function hasResidualFigureNodeTransform(
  transform: Pick<
    FigureNodeTransformCommit,
    "scaleX" | "scaleY" | "skewX" | "skewY"
  >,
  epsilon = 1e-6
): boolean {
  return (
    Math.abs(transform.scaleX - 1) > epsilon ||
    Math.abs(transform.scaleY - 1) > epsilon ||
    Math.abs(transform.skewX) > epsilon ||
    Math.abs(transform.skewY) > epsilon
  );
}

export function bakeFigureGeometryFromNodeTransform(
  figure: Figure,
  transform: FigureNodeTransformCommit
): Figure {
  const matrix = new Konva.Transform(transform.transformMatrix);
  const nextBase: FigureBaseTransform = {
    x: transform.x,
    y: transform.y,
    rotation: transform.rotation,
  };

  return {
    ...figure,
    x: nextBase.x,
    y: nextBase.y,
    rotation: nextBase.rotation,
    nodes: figure.nodes.map((node) => {
      const pointWorld = transformPoint(matrix, { x: node.x, y: node.y });
      const pointLocal = worldToFigureLocal(nextBase, pointWorld);

      const inHandle = node.inHandle
        ? worldToFigureLocal(nextBase, transformPoint(matrix, node.inHandle))
        : undefined;
      const outHandle = node.outHandle
        ? worldToFigureLocal(nextBase, transformPoint(matrix, node.outHandle))
        : undefined;

      return {
        ...node,
        x: pointLocal.x,
        y: pointLocal.y,
        inHandle,
        outHandle,
      };
    }),
  };
}
