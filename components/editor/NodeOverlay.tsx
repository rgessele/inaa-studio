import React from "react";
import { Circle, Group } from "react-konva";
import { Figure } from "./types";

interface NodeOverlayProps {
  figure: Figure;
  scale: number;
  stroke: string;
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
  opacity,
  visible,
  x,
  y,
  rotation,
}: NodeOverlayProps) => {
  if (!visible) return null;

  const r = 3 / scale;
  const strokeWidth = 1 / scale;
  const fill = "transparent";

  return (
    <Group x={x} y={y} rotation={rotation} listening={false}>
      {figure.nodes.map((n) => (
        <Circle
          key={n.id}
          x={n.x}
          y={n.y}
          radius={r}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          opacity={opacity}
          listening={false}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
          hitStrokeWidth={0} // Not interactive
        />
      ))}
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
    prev.opacity === next.opacity &&
    prev.figure === next.figure // Reference check is enough if figures are immutable
  );
};

export const MemoizedNodeOverlay = React.memo(NodeOverlayRenderer, arePropsEqual);
