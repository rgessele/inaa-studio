import React from "react";
import { Line, Text } from "react-konva";
import { Figure, FigureEdge } from "./types";
import { edgeLocalPoints, figureCentroidLocal } from "./figurePath";
import {
  midAndTangent,
  norm,
  perp,
  add,
  mul,
  dist,
  normalizeUprightAngleDeg,
} from "./figureGeometry";
import { formatCm, pxToCm } from "./measureUnits";
import { SelectedEdge } from "./EditorContext";

interface MeasureOverlayProps {
  figure: Figure;
  scale: number;
  isDark: boolean;
  selectedEdge: SelectedEdge | null;
  hoveredEdge: { figureId: string; edgeId: string } | null;
}

function resolveAci7(isDark: boolean): string {
  return isDark ? "#ffffff" : "#000000";
}

const MeasureOverlayRenderer = ({
  figure,
  scale,
  isDark,
  selectedEdge,
  hoveredEdge,
}: MeasureOverlayProps) => {
  const fontSize = 11 / scale;
  const offset = 10 / scale;
  const textWidth = 120 / scale;
  const fill = resolveAci7(isDark);
  const opacity = 0.75;
  const highlightStroke = "#2563eb";

  const renderSelectedEdgeHighlight = () => {
    if (!selectedEdge) return null;
    if (selectedEdge.figureId !== figure.id) return null;
    const edge = figure.edges.find((e) => e.id === selectedEdge.edgeId);
    if (!edge) return null;

    const pts = edgeLocalPoints(figure, edge, edge.kind === "line" ? 1 : 60);
    if (pts.length < 2) return null;
    const flat: number[] = [];
    for (const p of pts) flat.push(p.x, p.y);

    return (
      <Line
        key={`msel:${figure.id}:${edge.id}`}
        points={flat}
        stroke={highlightStroke}
        strokeWidth={3 / scale}
        opacity={0.9}
        listening={false}
        lineCap="round"
        lineJoin="round"
      />
    );
  };

  const renderHoveredEdgeHighlight = () => {
    if (!hoveredEdge) return null;
    if (hoveredEdge.figureId !== figure.id) return null;
    const edge = figure.edges.find((e) => e.id === hoveredEdge.edgeId);
    if (!edge) return null;

    const pts = edgeLocalPoints(figure, edge, edge.kind === "line" ? 1 : 60);
    if (pts.length < 2) return null;
    const flat: number[] = [];
    for (const p of pts) flat.push(p.x, p.y);

    return (
      <Line
        key={`mhover:${figure.id}:${edge.id}`}
        points={flat}
        stroke={highlightStroke}
        strokeWidth={2 / scale}
        opacity={0.85}
        listening={false}
        lineCap="round"
        lineJoin="round"
      />
    );
  };

  const renderEdgeLabel = (edge: FigureEdge) => {
    const hit = figure.measures?.perEdge?.find((m) => m.edgeId === edge.id);
    if (!hit) return null;

    const pts = edgeLocalPoints(figure, edge, edge.kind === "line" ? 1 : 50);
    const mt = midAndTangent(pts);
    if (!mt) return null;

    const centroid = figureCentroidLocal(figure);
    const n = norm(perp(mt.tangent));

    // Align label with the edge direction.
    const rawAngleDeg = (Math.atan2(mt.tangent.y, mt.tangent.x) * 180) / Math.PI;
    const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

    // Use a leader line when the edge is short on screen.
    const chordLenLocal = dist(pts[0], pts[pts.length - 1]);
    const chordLenScreenPx = chordLenLocal * scale;
    const SHORT_EDGE_THRESHOLD_PX = 42;
    const isShortEdge = chordLenScreenPx < SHORT_EDGE_THRESHOLD_PX;

    const extra = isShortEdge ? 18 / scale : 0;

    const p1 = add(mt.mid, mul(n, offset + extra));
    const p2 = add(mt.mid, mul(n, -(offset + extra)));
    const p = dist(p1, centroid) >= dist(p2, centroid) ? p1 : p2;

    const isHovered =
      hoveredEdge?.figureId === figure.id && hoveredEdge.edgeId === edge.id;

    const label = formatCm(pxToCm(hit.lengthPx), 2);

    const textFill = isHovered ? highlightStroke : fill;
    const textOpacity = isHovered ? 1 : opacity;

    const leader = isShortEdge ? (
      <Line
        key={`mlead:${figure.id}:${edge.id}`}
        points={[mt.mid.x, mt.mid.y, p.x, p.y]}
        stroke={textFill}
        strokeWidth={1 / scale}
        dash={[4 / scale, 4 / scale]}
        opacity={isHovered ? 0.95 : 0.5}
        listening={false}
        lineCap="round"
      />
    ) : null;

    return (
      <React.Fragment key={`mlbl:${figure.id}:${edge.id}`}>
        {leader}
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
          fill={textFill}
          opacity={textOpacity}
          fontStyle={isHovered ? "bold" : "normal"}
          listening={false}
          name="inaa-measure-label"
        />
      </React.Fragment>
    );
  };

  const renderFigureLabels = () => {
    if (!figure.measures) return null;
    return (
      <>
        {renderSelectedEdgeHighlight()}
        {renderHoveredEdgeHighlight()}
        {figure.edges.map((edge) => renderEdgeLabel(edge))}
      </>
    );
  };

  return <>{renderFigureLabels()}</>;
};

const arePropsEqual = (prev: MeasureOverlayProps, next: MeasureOverlayProps) => {
  if (prev.scale !== next.scale) return false;
  if (prev.isDark !== next.isDark) return false;
  if (prev.figure !== next.figure) return false;

  // Optimize selectedEdge comparison: only matters if it refers to THIS figure
  const prevSel =
    prev.selectedEdge?.figureId === prev.figure.id ? prev.selectedEdge : null;
  const nextSel =
    next.selectedEdge?.figureId === next.figure.id ? next.selectedEdge : null;

  if (prevSel !== nextSel) {
    // If references differ, check content
    if (!prevSel || !nextSel) return false; // One is null, one is not
    if (prevSel.edgeId !== nextSel.edgeId) return false;
    if (prevSel.anchor !== nextSel.anchor) return false;
  }

  // Optimize hoveredEdge comparison: only matters if it refers to THIS figure
  const prevHover =
    prev.hoveredEdge?.figureId === prev.figure.id ? prev.hoveredEdge : null;
  const nextHover =
    next.hoveredEdge?.figureId === next.figure.id ? next.hoveredEdge : null;

  if (prevHover !== nextHover) {
    if (!prevHover || !nextHover) return false;
    if (prevHover.edgeId !== nextHover.edgeId) return false;
  }

  return true;
};

export const MemoizedMeasureOverlay = React.memo(
  MeasureOverlayRenderer,
  arePropsEqual
);
