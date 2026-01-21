import React from "react";
import { Group, Line, Text } from "react-konva";

import type { Figure, FigureDart } from "./types";
import {
  add,
  dist,
  lerp,
  mul,
  norm,
  normalizeUprightAngleDeg,
  perp,
  sub,
} from "./figureGeometry";
import { edgeLocalPoints } from "./figurePath";
import { formatCm, pxToCm } from "./measureUnits";

type Vec2 = { x: number; y: number };

function getNodeById(figure: Figure, nodeId: string): Vec2 | null {
  const n = figure.nodes.find((node) => node.id === nodeId);
  if (!n) return null;
  return { x: n.x, y: n.y };
}

function concatPolylineSegments(segments: Vec2[][]): Vec2[] {
  const out: Vec2[] = [];
  for (const seg of segments) {
    if (seg.length === 0) continue;
    if (out.length === 0) out.push(...seg);
    else out.push(...seg.slice(1));
  }
  return out;
}

function polylineLengthPx(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += dist(points[i], points[i + 1]);
  }
  return sum;
}

function walkLoopEdgeIds(
  figure: Figure,
  fromNodeId: string,
  toNodeId: string
): { edgeIds: string[]; ok: boolean } {
  const outMap = new Map<string, string[]>();
  for (const e of figure.edges) {
    const list = outMap.get(e.from) ?? [];
    list.push(e.id);
    outMap.set(e.from, list);
  }

  const edgeIds: string[] = [];
  let current = fromNodeId;
  const visited = new Set<string>();

  for (let safety = 0; safety < figure.edges.length + 3; safety++) {
    if (current === toNodeId) return { edgeIds, ok: true };
    if (visited.has(current)) break;
    visited.add(current);

    const outs = outMap.get(current) ?? [];
    if (outs.length === 0) break;

    // The contour is expected to be a single loop, so the first outgoing edge is fine.
    const edgeId = outs[0];
    const edge = figure.edges.find((ed) => ed.id === edgeId);
    if (!edge) break;

    edgeIds.push(edgeId);
    current = edge.to;
  }

  return { edgeIds, ok: false };
}

function edgeIdsToPolyline(figure: Figure, edgeIds: string[]): Vec2[] {
  const segments: Vec2[][] = [];
  for (const id of edgeIds) {
    const edge = figure.edges.find((e) => e.id === id);
    if (!edge) continue;
    const steps = edge.kind === "line" ? 1 : 120;
    segments.push(edgeLocalPoints(figure, edge, steps));
  }
  return concatPolylineSegments(segments);
}

function computeBasePathPolyline(
  figure: Figure,
  aNodeId: string,
  bNodeId: string
): Vec2[] | null {
  if (!figure.closed) return null;

  const pathAB = walkLoopEdgeIds(figure, aNodeId, bNodeId);
  const pathBA = walkLoopEdgeIds(figure, bNodeId, aNodeId);
  if (!pathAB.ok && !pathBA.ok) return null;

  const polyAB = pathAB.ok ? edgeIdsToPolyline(figure, pathAB.edgeIds) : [];
  const polyBA = pathBA.ok ? edgeIdsToPolyline(figure, pathBA.edgeIds) : [];

  if (!polyAB.length && !polyBA.length) return null;
  if (!polyBA.length) return polyAB;
  if (!polyAB.length) return polyBA;

  return polylineLengthPx(polyAB) <= polylineLengthPx(polyBA) ? polyAB : polyBA;
}

function renderMeasureLabel(props: {
  scale: number;
  stroke: string;
  a: Vec2;
  b: Vec2;
  lengthPx: number;
  opacity?: number;
}) {
  const { scale, stroke, a, b, lengthPx, opacity = 0.85 } = props;
  if (!Number.isFinite(lengthPx)) return null;
  if (dist(a, b) < 0.01) return null;

  const mid = lerp(a, b, 0.5);
  const tangent = sub(b, a);
  const normal = norm(perp(tangent));
  const offset = 12 / scale;
  const p = add(mid, mul(normal, offset));

  const rawAngleDeg = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
  const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

  const fontSize = 11 / scale;
  const textWidth = 120 / scale;

  const label = formatCm(pxToCm(lengthPx), 2);

  return (
    <Text
      x={p.x}
      y={p.y}
      offsetX={textWidth / 2}
      offsetY={fontSize / 2}
      rotation={angleDeg}
      width={textWidth}
      align="center"
      text={label}
      fontSize={fontSize}
      fill={stroke}
      opacity={opacity}
      fontStyle="bold"
      listening={false}
      name="inaa-dart-measure"
    />
  );
}

export function DartOverlay(props: {
  figure: Figure;
  scale: number;
  stroke: string;
  strokeWidth: number;
  isDark: boolean;
}) {
  const { figure, scale, stroke, strokeWidth } = props;
  const darts: FigureDart[] = figure.darts ?? [];
  if (!darts.length) return null;

  const dash = [6 / scale, 6 / scale];

  return (
    <Group listening={false} name="inaa-dart-overlay">
      {darts.map((dart) => {
        const a = getNodeById(figure, dart.aNodeId);
        const b = getNodeById(figure, dart.bNodeId);
        const c = getNodeById(figure, dart.cNodeId);
        if (!a || !b || !c) return null;

        const mid = lerp(a, b, 0.5);
        const heightPx = dist(mid, c);

        const basePoly = computeBasePathPolyline(
          figure,
          dart.aNodeId,
          dart.bNodeId
        );
        const baseFlat = basePoly
          ? basePoly.flatMap((p) => [p.x, p.y])
          : [a.x, a.y, b.x, b.y];

        const eraseWidth = strokeWidth + 4 / scale;

        return (
          <Group key={`dart:${figure.id}:${dart.id}`}>
            {/* Mask the underlying contour segment, then draw it dashed */}
            <Line
              points={baseFlat}
              stroke="#000"
              strokeWidth={eraseWidth}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation="destination-out"
              listening={false}
              perfectDrawEnabled={false}
            />
            <Line
              points={baseFlat}
              stroke={stroke}
              strokeWidth={strokeWidth}
              dash={dash}
              lineCap="round"
              lineJoin="round"
              listening={false}
              perfectDrawEnabled={false}
            />

            {/* Dart legs */}
            <Line
              points={[a.x, a.y, c.x, c.y]}
              stroke={stroke}
              strokeWidth={Math.max(1 / scale, strokeWidth * 0.9)}
              lineCap="round"
              lineJoin="round"
              listening={false}
              perfectDrawEnabled={false}
            />
            <Line
              points={[b.x, b.y, c.x, c.y]}
              stroke={stroke}
              strokeWidth={Math.max(1 / scale, strokeWidth * 0.9)}
              lineCap="round"
              lineJoin="round"
              listening={false}
              perfectDrawEnabled={false}
            />

            {/* Height (midpoint to apex) */}
            <Line
              points={[mid.x, mid.y, c.x, c.y]}
              stroke={stroke}
              strokeWidth={Math.max(1 / scale, strokeWidth * 0.85)}
              dash={dash}
              lineCap="round"
              lineJoin="round"
              listening={false}
              perfectDrawEnabled={false}
              opacity={0.9}
            />

            {renderMeasureLabel({
              scale,
              stroke,
              a: mid,
              b: c,
              lengthPx: heightPx,
              opacity: 0.8,
            })}
          </Group>
        );
      })}
    </Group>
  );
}

export const MemoizedDartOverlay = React.memo(DartOverlay);
