import React from "react";
import { Group, Shape } from "react-konva";
import { Figure } from "./types";

interface NodeOverlayProps {
  figure: Figure;
  scale: number;
  stroke: string;
  nodeStroke?: string;
  opacity: number;
  visible: boolean;
  x: number;
  y: number;
  rotation: number;
}

const NodeOverlayRenderer = ({
  figure,
  scale,
  stroke,
  nodeStroke,
  opacity,
  visible,
  x,
  y,
  rotation,
}: NodeOverlayProps) => {
  if (!visible) return null;

  const r = 3 / scale;
  const strokeWidth = 1 / scale;
  const nodes = figure.nodes;
  if (nodes.length === 0) return null;

  // Bounding box of the node dots (padded by the dot radius). A custom-sceneFunc
  // Shape has no intrinsic size, so without explicit x/y/width/height its
  // getClientRect collapses to the group origin — which would balloon the
  // selection Transformer's bounds. Setting these gives a correct getSelfRect.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  const boxX = minX - r;
  const boxY = minY - r;
  const boxW = maxX - minX + 2 * r;
  const boxH = maxY - minY + 2 * r;

  // Draw every node dot in a single Konva Shape (one scene-graph node, one
  // stroke pass) instead of one <Circle> per node. A dense imported/hand-drawn
  // figure can have hundreds of nodes; N Circles inflate the scene graph and
  // per-frame draw cost, whereas this is a single path. The sceneFunc context is
  // pre-translated by the shape's x/y, so dots are drawn relative to it.
  return (
    <Group x={x} y={y} rotation={rotation} listening={false}>
      <Shape
        name="inaa-node-point"
        x={boxX}
        y={boxY}
        width={boxW}
        height={boxH}
        listening={false}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        stroke={nodeStroke ?? stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        sceneFunc={(ctx, shape) => {
          const ox = shape.x();
          const oy = shape.y();
          ctx.beginPath();
          for (const n of nodes) {
            ctx.moveTo(n.x - ox + r, n.y - oy);
            ctx.arc(n.x - ox, n.y - oy, r, 0, Math.PI * 2, false);
          }
          ctx.strokeShape(shape);
        }}
      />
    </Group>
  );
};

const arePropsEqual = (prev: NodeOverlayProps, next: NodeOverlayProps) => {
  return (
    prev.visible === next.visible &&
    prev.x === next.x &&
    prev.y === next.y &&
    prev.rotation === next.rotation &&
    prev.scale === next.scale &&
    prev.stroke === next.stroke &&
    prev.nodeStroke === next.nodeStroke &&
    prev.opacity === next.opacity &&
    prev.figure === next.figure // Reference check is enough if figures are immutable
  );
};

export const MemoizedNodeOverlay = React.memo(
  NodeOverlayRenderer,
  arePropsEqual
);
