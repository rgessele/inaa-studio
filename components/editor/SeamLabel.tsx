import React from "react";
import { Text } from "react-konva";
import { Figure } from "./types";
import { figureLocalPolyline, figureCentroidLocal } from "./figurePath";
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

function resolveAci7(isDark: boolean): string {
  return isDark ? "#ffffff" : "#000000";
}

function formatSeamLabelCm(cm: number): string {
  if (!Number.isFinite(cm)) return "0,00cm";
  return `${cm.toFixed(2).replace(".", ",")}cm`;
}

export interface SeamLabelProps {
  seam: Figure;
  baseCentroidLocal?: { x: number; y: number } | null;
  scale: number;
  isDark: boolean;
  enabled: boolean;
}

const SeamLabelRenderer = ({
  seam,
  baseCentroidLocal,
  scale,
  isDark,
  enabled,
}: SeamLabelProps) => {
  if (!enabled) return null;
  if (seam.kind !== "seam") return null;

  const fontSize = 11 / scale;
  const offset = 10 / scale;
  const textWidth = 240 / scale;
  const fill = resolveAci7(isDark);
  const opacity = 0.75;

  const centroid = baseCentroidLocal ?? figureCentroidLocal(seam);

  const findLongestSegment = (pts: { x: number; y: number }[]) => {
    let bestA: { x: number; y: number } | null = null;
    let bestB: { x: number; y: number } | null = null;
    let bestLen = -1;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const l = dist(a, b);
      if (l > bestLen) {
        bestLen = l;
        bestA = a;
        bestB = b;
      }
    }
    if (seam.closed && pts.length >= 2) {
      const a = pts[pts.length - 1];
      const b = pts[0];
      const l = dist(a, b);
      if (l > bestLen) {
        bestLen = l;
        bestA = a;
        bestB = b;
      }
    }
    return { bestA, bestB, bestLen };
  };

  if (typeof seam.offsetCm === "number" && Number.isFinite(seam.offsetCm)) {
    const flat = figureLocalPolyline(seam, 60);
    if (flat.length < 4) return null;

    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      pts.push({ x: flat[i], y: flat[i + 1] });
    }
    if (pts.length >= 2 && dist(pts[0], pts[pts.length - 1]) < 1e-6) {
      pts.pop();
    }
    if (pts.length < 2) return null;

    if (seam.tool === "circle") {
      let bestIndex = 0;
      let bestY = pts[0].y;
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].y < bestY) {
          bestY = pts[i].y;
          bestIndex = i;
        }
      }

      const prev = pts[(bestIndex - 1 + pts.length) % pts.length];
      const next = pts[(bestIndex + 1) % pts.length];
      const mid = pts[bestIndex];
      const tangent = sub(next, prev);
      const n = norm(perp(tangent));

      const p1 = add(mid, mul(n, offset));
      const p2 = add(mid, mul(n, -offset));
      const p = dist(p1, centroid) >= dist(p2, centroid) ? p1 : p2;

      const rawAngleDeg = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
      const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

      const label = `Margem de Costura: ${formatSeamLabelCm(seam.offsetCm)}`;

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
          fill={fill}
          opacity={opacity}
          listening={false}
          name="inaa-seam-label"
        />
      );
    }

    const { bestA, bestB, bestLen } = findLongestSegment(pts);
    if (!bestA || !bestB || bestLen <= 1e-6) return null;

    const mid = lerp(bestA, bestB, 0.5);
    const tangent = sub(bestB, bestA);
    const n = norm(perp(tangent));

    const p1 = add(mid, mul(n, offset));
    const p2 = add(mid, mul(n, -offset));
    const p = dist(p1, centroid) >= dist(p2, centroid) ? p1 : p2;

    const rawAngleDeg = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
    const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

    const label = `Margem de Costura: ${formatSeamLabelCm(seam.offsetCm)}`;

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
        fill={fill}
        opacity={opacity}
        listening={false}
        name="inaa-seam-label"
      />
    );
  }

  if (seam.tool === "circle") return null;
  if (!seam.seamSegments?.length || !seam.seamSegmentEdgeIds?.length) {
    return null;
  }

  const labels = seam.seamSegments
    .map((segment, index) => {
      const edgeId = seam.seamSegmentEdgeIds?.[index];
      if (!edgeId) return null;
      const value =
        seam.offsetCm && typeof seam.offsetCm === "object"
          ? seam.offsetCm[edgeId]
          : null;
      if (!Number.isFinite(value ?? NaN)) return null;

      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < segment.length; i += 2) {
        pts.push({ x: segment[i], y: segment[i + 1] });
      }
      if (pts.length < 2) return null;

      const { bestA, bestB, bestLen } = findLongestSegment(pts);
      if (!bestA || !bestB || bestLen <= 1e-6) return null;

      const mid = lerp(bestA, bestB, 0.5);
      const tangent = sub(bestB, bestA);
      const n = norm(perp(tangent));

      const p1 = add(mid, mul(n, offset));
      const p2 = add(mid, mul(n, -offset));
      const p = dist(p1, centroid) >= dist(p2, centroid) ? p1 : p2;

      const rawAngleDeg = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
      const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

      return {
        x: p.x,
        y: p.y,
        angleDeg,
        text: `Margem de Costura: ${formatSeamLabelCm(value as number)}`,
      };
    })
    .filter(
      (
        label
      ): label is { x: number; y: number; angleDeg: number; text: string } =>
        !!label
    );

  if (!labels.length) return null;

  return (
    <>
      {labels.map((label, index) => (
        <Text
          key={`seam-label:${seam.id}:${index}`}
          x={label.x}
          y={label.y}
          offsetX={textWidth / 2}
          offsetY={fontSize / 2}
          rotation={label.angleDeg}
          width={textWidth}
          align="center"
          text={label.text}
          fontSize={fontSize}
          fill={fill}
          opacity={opacity}
          listening={false}
          name="inaa-seam-label"
        />
      ))}
    </>
  );
};

export const MemoizedSeamLabel = React.memo(SeamLabelRenderer, (prev, next) => {
  return (
    prev.seam === next.seam &&
    prev.enabled === next.enabled &&
    prev.scale === next.scale &&
    prev.isDark === next.isDark &&
    prev.baseCentroidLocal?.x === next.baseCentroidLocal?.x &&
    prev.baseCentroidLocal?.y === next.baseCentroidLocal?.y
  );
});
