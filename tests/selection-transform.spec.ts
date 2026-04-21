import Konva from "konva";
import { expect, test } from "./helpers/test";
import { figureLocalToWorld } from "../components/editor/figurePath";
import {
  bakeFigureGeometryFromNodeTransform,
  hasResidualFigureNodeTransform,
} from "../components/editor/selectionTransform";
import type { Figure } from "../components/editor/types";

function makeFigure(): Figure {
  return {
    id: "fig",
    kind: "figure",
    name: "Teste",
    tool: "curve",
    x: 0,
    y: 0,
    rotation: 0,
    closed: false,
    stroke: "aci7",
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
    nodes: [
      {
        id: "n1",
        x: 0,
        y: 0,
        mode: "corner",
        outHandle: { x: 40, y: -20 },
      },
      {
        id: "n2",
        x: 160,
        y: 110,
        mode: "smooth",
        inHandle: { x: 120, y: 30 },
        outHandle: { x: 200, y: 190 },
      },
      {
        id: "n3",
        x: 250,
        y: 220,
        mode: "corner",
        inHandle: { x: 230, y: 180 },
      },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", kind: "cubic" },
      { id: "e2", from: "n2", to: "n3", kind: "cubic" },
    ],
    darts: [],
    piques: [],
  };
}

function expectPointClose(
  actual: { x: number; y: number },
  expected: { x: number; y: number }
) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

test("selection transform: bakes skewed geometry into local points", () => {
  const figure = makeFigure();
  const matrix = new Konva.Transform();
  matrix.translate(320, 180);
  matrix.rotate((28 * Math.PI) / 180);
  matrix.skew(0.42, 0);
  matrix.scale(1, 0.58);

  const decomposed = matrix.decompose();
  expect(hasResidualFigureNodeTransform(decomposed)).toBe(true);

  const baked = bakeFigureGeometryFromNodeTransform(figure, {
    x: decomposed.x,
    y: decomposed.y,
    rotation: decomposed.rotation,
    scaleX: decomposed.scaleX,
    scaleY: decomposed.scaleY,
    skewX: decomposed.skewX,
    skewY: decomposed.skewY,
    transformMatrix: matrix.getMatrix(),
  });

  expect(baked.x).toBeCloseTo(decomposed.x, 6);
  expect(baked.y).toBeCloseTo(decomposed.y, 6);
  expect(baked.rotation).toBeCloseTo(decomposed.rotation, 6);

  for (let i = 0; i < figure.nodes.length; i += 1) {
    const sourceNode = figure.nodes[i]!;
    const bakedNode = baked.nodes[i]!;

    expectPointClose(
      figureLocalToWorld(baked, { x: bakedNode.x, y: bakedNode.y }),
      matrix.point({ x: sourceNode.x, y: sourceNode.y })
    );

    if (sourceNode.inHandle && bakedNode.inHandle) {
      expectPointClose(
        figureLocalToWorld(baked, bakedNode.inHandle),
        matrix.point(sourceNode.inHandle)
      );
    }

    if (sourceNode.outHandle && bakedNode.outHandle) {
      expectPointClose(
        figureLocalToWorld(baked, bakedNode.outHandle),
        matrix.point(sourceNode.outHandle)
      );
    }
  }
});
