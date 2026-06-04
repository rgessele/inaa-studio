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

  // Draw every node dot in a single Konva Shape (one scene-graph node, one
  // stroke pass) instead of one <Circle> per node. A dense imported/hand-drawn
  // figure can have hundreds of nodes; N Circles inflate the scene graph and
  // per-frame draw cost, whereas this is a single path.
  return (
    <Group x={x} y={y} rotation={rotation} listening={false}>
      <Shape
        name="inaa-node-point"
        listening={false}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        stroke={nodeStroke ?? stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        sceneFunc={(ctx, shape) => {
          ctx.beginPath();
          for (const n of nodes) {
            ctx.moveTo(n.x + r, n.y);
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2, false);
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
