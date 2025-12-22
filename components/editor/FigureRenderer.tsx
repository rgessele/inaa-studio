import React from "react";
import { Group, Line, Rect, Text } from "react-konva";
import type Konva from "konva";
import { Figure } from "./types";
import { figureLocalPolyline } from "./figurePath";
import { figureCentroidLocal } from "./figurePath";
import { MemoizedNodeOverlay } from "./NodeOverlay";
import { MemoizedMeasureOverlay } from "./MeasureOverlay";
import { MemoizedSeamLabel } from "./SeamLabel";
import { SelectedEdge } from "./EditorContext";
import type { PointLabelsMode } from "./types";

interface FigureRendererProps {
  figure: Figure;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  dash?: number[];
  hitStrokeWidth: number;
  listening?: boolean;
  draggable?: boolean;
  onPointerDown?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  forwardRef?: (node: Konva.Group | null) => void;
  name?: string;
  showNodes?: boolean;
  showMeasures?: boolean;
  pointLabelsMode?: PointLabelsMode;
  pointLabelsByNodeId?: Record<string, string> | null;
  showSeamLabel?: boolean;
  seamBaseCentroidLocal?: { x: number; y: number } | null;
  isDark?: boolean;
  selectedEdge?: SelectedEdge | null;
  hoveredEdge?: { figureId: string; edgeId: string } | null;

  // Figure name label handle (drag to reposition)
  showNameHandle?: boolean;
  onNameOffsetChange?: (
    figureId: string,
    nextOffsetLocal: { x: number; y: number }
  ) => void;
  onNameOffsetCommit?: (
    figureId: string,
    nextOffsetLocal: { x: number; y: number }
  ) => void;
}

function resolveAci7(isDark: boolean): string {
  return isDark ? "#ffffff" : "#000000";
}

function pointArrayBoundingBox(points: number[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (points.length < 4) return null;
  let minX = points[0];
  let minY = points[1];
  let maxX = points[0];
  let maxY = points[1];
  for (let i = 2; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxX = Math.max(maxX, points[i]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function nodesBoundingBox(nodes: Array<{ x: number; y: number }> | null): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (!nodes || nodes.length === 0) return null;
  let minX = nodes[0].x;
  let minY = nodes[0].y;
  let maxX = nodes[0].x;
  let maxY = nodes[0].y;
  for (let i = 1; i < nodes.length; i++) {
    minX = Math.min(minX, nodes[i].x);
    minY = Math.min(minY, nodes[i].y);
    maxX = Math.max(maxX, nodes[i].x);
    maxY = Math.max(maxY, nodes[i].y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const FigureRenderer = ({
  figure,
  x,
  y,
  rotation,
  scale,
  stroke,
  strokeWidth,
  opacity,
  dash,
  hitStrokeWidth,
  listening = true,
  draggable,
  onPointerDown,
  onDragStart,
  onDragMove,
  onDragEnd,
  forwardRef,
  name,
  showNodes,
  showMeasures,
  pointLabelsMode = "off",
  pointLabelsByNodeId = null,
  showSeamLabel,
  seamBaseCentroidLocal,
  isDark = false,
  selectedEdge = null,
  hoveredEdge = null,
  showNameHandle,
  onNameOffsetChange,
  onNameOffsetCommit,
}: FigureRendererProps) => {
  // Memoize the polyline calculation so it doesn't run on every render
  // unless the figure geometry changes.
  // Note: figureLocalPolyline depends on figure.nodes and figure.closed.
  // We assume 'figure' prop reference changes when these change.
  const pts = React.useMemo(() => figureLocalPolyline(figure, 60), [figure]);

  const pointLabelFill = resolveAci7(isDark);
  const pointLabelOpacity = 0.35;
  const pointLabelFontSize = 15 / scale;
  const pointLabelOffsetDist = 14 / scale;

  const figureName = (figure.name ?? "").trim();
  const nameFontSizePx = (() => {
    const v = figure.nameFontSizePx;
    if (!Number.isFinite(v ?? NaN)) return 24;
    return Math.max(6, Math.min(256, v as number));
  })();
  const nameRotationDeg = (() => {
    const v = figure.nameRotationDeg;
    if (!Number.isFinite(v ?? NaN)) return 0;
    // Keep it bounded (purely for stability/serialization).
    const m = ((v as number) % 360) + 360;
    return m % 360;
  })();
  const nameOffsetLocal = figure.nameOffsetLocal ?? { x: 0, y: 0 };
  const nameFill = pointLabelFill;
  const nameOpacity = 0.22;

  const nameLayout = React.useMemo(() => {
    if (!figureName) return null;

    const localPts = pts;
    const bbox = pointArrayBoundingBox(localPts) ?? nodesBoundingBox(figure.nodes);
    const centroid = figureCentroidLocal(figure);

    const offsetX = Number.isFinite(nameOffsetLocal.x) ? nameOffsetLocal.x : 0;
    const offsetY = Number.isFinite(nameOffsetLocal.y) ? nameOffsetLocal.y : 0;

    if (figure.closed) {
      if (!bbox) return null;
      const padding = 12;
      const availW = Math.max(0, bbox.width - 2 * padding);
      const availH = Math.max(0, bbox.height - 2 * padding);
      if (availW <= 0 || availH <= 0) return null;

      const fontSize = nameFontSizePx;
      const textWidthApprox = Math.min(availW, figureName.length * fontSize * 0.62);

      return {
        baseX: centroid.x,
        baseY: centroid.y,
        x: centroid.x + offsetX,
        y: centroid.y + offsetY,
        rotation: 0,
        fontSize,
        width: availW,
        textWidthApprox,
        align: "center" as const,
      };
    }

    // Open figures: place near the midpoint of the polyline, offset outward.
    if (localPts.length >= 8) {
      const midIdx = Math.floor(localPts.length / 4) * 2;
      const px = localPts[midIdx];
      const py = localPts[midIdx + 1];
      const prevX = localPts[Math.max(0, midIdx - 2)];
      const prevY = localPts[Math.max(1, midIdx - 1)];
      const nextX = localPts[Math.min(localPts.length - 2, midIdx + 2)];
      const nextY = localPts[Math.min(localPts.length - 1, midIdx + 3)];
      const dx = nextX - prevX;
      const dy = nextY - prevY;
      const len = Math.hypot(dx, dy);
      const n =
        len > 1e-6 ? { x: -dy / len, y: dx / len } : { x: 0, y: -1 };
      const offset = 18;
      const fontSize = nameFontSizePx;
      const width = Math.max(12, figureName.length * fontSize * 0.62);

      return {
        baseX: px + n.x * offset * -1,
        baseY: py + n.y * offset * -1,
        x: px + n.x * offset * -1 + offsetX,
        y: py + n.y * offset * -1 + offsetY,
        rotation: 0,
        fontSize,
        width,
        textWidthApprox: width,
        align: "center" as const,
      };
    }

    const fontSize = nameFontSizePx;
    const width = Math.max(12, figureName.length * fontSize * 0.62);
    return {
      baseX: centroid.x,
      baseY: centroid.y - 18,
      x: centroid.x + offsetX,
      y: centroid.y - 18 + offsetY,
      rotation: 0,
      fontSize,
      width,
      textWidthApprox: width,
      align: "center" as const,
    };
  }, [figure, figureName, nameFontSizePx, nameOffsetLocal.x, nameOffsetLocal.y, pts]);

  const handleSize = 10 / scale;
  const handleGap = 6 / scale;

  return (
    <Group
      name={name}
      ref={forwardRef}
      x={x}
      y={y}
      rotation={rotation}
      opacity={opacity}
      listening={listening}
      draggable={draggable}
      onPointerDown={onPointerDown}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      <Line
        points={pts}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill={figure.fill ?? "transparent"}
        closed={figure.closed}
        dash={dash}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={hitStrokeWidth}
        perfectDrawEnabled={false} // Optimization: Disable perfect draw
        shadowForStrokeEnabled={false} // Optimization: Disable shadow
        listening={listening} // Optimization: Disable events if not needed
      />
      {showNodes && (
        <MemoizedNodeOverlay
          figure={figure}
          scale={scale}
          stroke={stroke}
          opacity={opacity}
          visible={true}
          x={0}
          y={0}
          rotation={0}
        />
      )}
      {showMeasures && (
        <MemoizedMeasureOverlay
          figure={figure}
          scale={scale}
          isDark={isDark}
          selectedEdge={selectedEdge}
          hoveredEdge={hoveredEdge}
        />
      )}

      {figure.kind !== "seam" && pointLabelsMode !== "off" && pointLabelsByNodeId ? (
        <>
          {figure.nodes.map((n) => {
            const text = pointLabelsByNodeId[n.id];
            if (!text) return null;

            // Place label "outside" the figure: offset away from centroid.
            const centroid = (() => {
              if (!figure.nodes.length) return { x: 0, y: 0 };
              const sum = figure.nodes.reduce(
                (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
                { x: 0, y: 0 }
              );
              return { x: sum.x / figure.nodes.length, y: sum.y / figure.nodes.length };
            })();

            const dx = n.x - centroid.x;
            const dy = n.y - centroid.y;
            const len = Math.hypot(dx, dy);
            const dir =
              len > 1e-6
                ? { x: dx / len, y: dy / len }
                : { x: 0.707106781, y: -0.707106781 };

            const px = n.x + dir.x * pointLabelOffsetDist;
            const py = n.y + dir.y * pointLabelOffsetDist;

            const alignRight = dx < 0;
            const approxWidth = Math.max(
              12 / scale,
              text.length * pointLabelFontSize * 0.62
            );

            return (
              <Text
                key={`pl:${figure.id}:${n.id}`}
                x={px}
                y={py}
                text={text.toUpperCase()}
                fontSize={pointLabelFontSize}
                fontStyle="bold"
                fill={pointLabelFill}
                opacity={pointLabelOpacity}
                width={approxWidth}
                align={alignRight ? "right" : "left"}
                offsetX={alignRight ? approxWidth : 0}
                offsetY={pointLabelFontSize / 2}
                listening={false}
                name="inaa-point-label"
              />
            );
          })}
        </>
      ) : null}

      {figure.kind === "seam" && (
        <MemoizedSeamLabel
          seam={figure}
          baseCentroidLocal={seamBaseCentroidLocal ?? null}
          scale={scale}
          isDark={isDark}
          enabled={!!showSeamLabel}
        />
      )}

      {nameLayout && (
        <Text
          x={nameLayout.x}
          y={nameLayout.y}
          text={figureName}
          fontSize={nameLayout.fontSize}
          fontStyle="bold"
          fill={nameFill}
          opacity={nameOpacity}
          rotation={nameRotationDeg}
          width={nameLayout.width}
          align={nameLayout.align}
          offsetX={nameLayout.width / 2}
          offsetY={nameLayout.fontSize / 2}
          listening={false}
          name="inaa-figure-name"
        />
      )}

      {nameLayout && showNameHandle && (
        <Group
          x={nameLayout.x}
          y={nameLayout.y}
          rotation={nameRotationDeg}
          draggable={true}
          onDragStart={(e) => {
            e.cancelBubble = true;
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            const nx = e.target.x();
            const ny = e.target.y();
            const nextOffsetLocal = {
              x: nx - nameLayout.baseX,
              y: ny - nameLayout.baseY,
            };
            onNameOffsetChange?.(figure.id, nextOffsetLocal);
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            const nx = e.target.x();
            const ny = e.target.y();
            const nextOffsetLocal = {
              x: nx - nameLayout.baseX,
              y: ny - nameLayout.baseY,
            };
            onNameOffsetCommit?.(figure.id, nextOffsetLocal);
          }}
        >
          <Rect
            x={nameLayout.textWidthApprox / 2 + handleGap}
            y={-nameLayout.fontSize / 2 - handleGap - handleSize}
            width={handleSize}
            height={handleSize}
            fill={nameFill}
            opacity={0.35}
            cornerRadius={2 / scale}
            listening={true}
            name="inaa-figure-name-handle"
          />
        </Group>
      )}
    </Group>
  );
};

// Custom comparison function for React.memo
const arePropsEqual = (prev: FigureRendererProps, next: FigureRendererProps) => {
  return (
    prev.x === next.x &&
    prev.y === next.y &&
    prev.rotation === next.rotation &&
    prev.scale === next.scale &&
    prev.stroke === next.stroke &&
    prev.strokeWidth === next.strokeWidth &&
    prev.opacity === next.opacity &&
    prev.hitStrokeWidth === next.hitStrokeWidth &&
    prev.listening === next.listening &&
    prev.draggable === next.draggable &&
    prev.showNodes === next.showNodes &&
    prev.showMeasures === next.showMeasures &&
    prev.pointLabelsMode === next.pointLabelsMode &&
    prev.pointLabelsByNodeId === next.pointLabelsByNodeId &&
    prev.showSeamLabel === next.showSeamLabel &&
    prev.isDark === next.isDark &&
    prev.selectedEdge === next.selectedEdge &&
    prev.hoveredEdge === next.hoveredEdge &&
    prev.seamBaseCentroidLocal?.x === next.seamBaseCentroidLocal?.x &&
    prev.seamBaseCentroidLocal?.y === next.seamBaseCentroidLocal?.y &&
    prev.figure === next.figure && // Reference check for figure
    prev.figure.fill === next.figure.fill && // Check fill specifically
    prev.figure.closed === next.figure.closed && // Check closed specifically
    areArraysEqual(prev.dash, next.dash)
    // Note: onPointerDown and forwardRef are usually stable or we ignore them for memo
    // If they change often, we might need to include them, but usually they are stable callbacks
  );
};

function areArraysEqual(a?: number[], b?: number[]) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export const MemoizedFigure = React.memo(FigureRenderer, arePropsEqual);
