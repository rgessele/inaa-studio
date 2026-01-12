import type { Figure, FigureNode } from "./types";
import { add, clamp, len, mul, sub } from "./figureGeometry";

type Vec2 = { x: number; y: number };

function hasOtherOutgoingCubic(
  figure: Figure,
  nodeId: string,
  excludeEdgeId: string
): boolean {
  return figure.edges.some(
    (e) => e.id !== excludeEdgeId && e.kind === "cubic" && e.from === nodeId
  );
}

function hasOtherIncomingCubic(
  figure: Figure,
  nodeId: string,
  excludeEdgeId: string
): boolean {
  return figure.edges.some(
    (e) => e.id !== excludeEdgeId && e.kind === "cubic" && e.to === nodeId
  );
}

function hasAnyOtherCubicAdjacent(
  figure: Figure,
  nodeId: string,
  excludeEdgeId: string
): boolean {
  return (
    hasOtherOutgoingCubic(figure, nodeId, excludeEdgeId) ||
    hasOtherIncomingCubic(figure, nodeId, excludeEdgeId)
  );
}

function normalize(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  if (l <= 1e-9) return { x: 1, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

function updateNode(
  nodes: FigureNode[],
  nodeId: string,
  updater: (n: FigureNode) => FigureNode
): FigureNode[] {
  return nodes.map((n) => (n.id === nodeId ? updater(n) : n));
}

export function convertEdgeToCubic(figure: Figure, edgeId: string): Figure {
  const edge = figure.edges.find((e) => e.id === edgeId);
  if (!edge) return figure;
  if (edge.kind === "cubic") return figure;

  const fromNode = figure.nodes.find((n) => n.id === edge.from) ?? null;
  const toNode = figure.nodes.find((n) => n.id === edge.to) ?? null;
  if (!fromNode || !toNode) return figure;

  const p0: Vec2 = { x: fromNode.x, y: fromNode.y };
  const p3: Vec2 = { x: toNode.x, y: toNode.y };
  const v = sub(p3, p0);
  const l = len(v);
  const dir = normalize(v);

  // Default handles: along the segment direction.
  const handleLen = clamp(l * 0.25, 8, l * 0.45);
  const outH = add(p0, mul(dir, handleLen));
  const inH = sub(p3, mul(dir, handleLen));

  const nextEdges = figure.edges.map((e) =>
    e.id === edgeId ? { ...e, kind: "cubic" as const } : e
  );

  let nextNodes = figure.nodes;

  // Only change the handle side that this edge will use.
  if (!hasOtherOutgoingCubic(figure, fromNode.id, edgeId)) {
    nextNodes = updateNode(nextNodes, fromNode.id, (n) => ({
      ...n,
      mode: n.mode === "corner" ? "smooth" : n.mode,
      outHandle: { x: outH.x, y: outH.y },
    }));
  }

  if (!hasOtherIncomingCubic(figure, toNode.id, edgeId)) {
    nextNodes = updateNode(nextNodes, toNode.id, (n) => ({
      ...n,
      mode: n.mode === "corner" ? "smooth" : n.mode,
      inHandle: { x: inH.x, y: inH.y },
    }));
  }

  return { ...figure, nodes: nextNodes, edges: nextEdges };
}

export function convertEdgeToLine(figure: Figure, edgeId: string): Figure {
  const edge = figure.edges.find((e) => e.id === edgeId);
  if (!edge) return figure;
  if (edge.kind === "line") return figure;

  const fromNode = figure.nodes.find((n) => n.id === edge.from) ?? null;
  const toNode = figure.nodes.find((n) => n.id === edge.to) ?? null;
  if (!fromNode || !toNode) return figure;

  const nextEdges = figure.edges.map((e) =>
    e.id === edgeId ? { ...e, kind: "line" as const } : e
  );

  let nextNodes = figure.nodes;

  // Clear ONLY the handles used by this edge, and only if no other cubic edge
  // uses that handle side.
  if (!hasOtherOutgoingCubic(figure, fromNode.id, edgeId)) {
    nextNodes = updateNode(nextNodes, fromNode.id, (n) => {
      const next: FigureNode = { ...n };
      delete next.outHandle;

      const hasOther = hasAnyOtherCubicAdjacent(figure, n.id, edgeId);
      const hasRemainingHandles = !!next.inHandle || !!next.outHandle;
      if (!hasOther && !hasRemainingHandles) next.mode = "corner";
      return next;
    });
  }

  if (!hasOtherIncomingCubic(figure, toNode.id, edgeId)) {
    nextNodes = updateNode(nextNodes, toNode.id, (n) => {
      const next: FigureNode = { ...n };
      delete next.inHandle;

      const hasOther = hasAnyOtherCubicAdjacent(figure, n.id, edgeId);
      const hasRemainingHandles = !!next.inHandle || !!next.outHandle;
      if (!hasOther && !hasRemainingHandles) next.mode = "corner";
      return next;
    });
  }

  return { ...figure, nodes: nextNodes, edges: nextEdges };
}
