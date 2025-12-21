import React from "react";
import { Group, Line, Text } from "react-konva";
import type Konva from "konva";
import { Figure } from "./types";
import { figureLocalPolyline } from "./figurePath";
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
}

function resolveAci7(isDark: boolean): string {
  return isDark ? "#ffffff" : "#000000";
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
