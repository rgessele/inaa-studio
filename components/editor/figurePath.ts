import type { Figure, FigureEdge, FigureNode } from "./types";
import {
  add,
  rotate,
  rotateInv,
  sampleCubic,
  sub,
  type Vec2,
} from "./figureGeometry";

function normalizeVec(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

function toPointArray(points: Vec2[]): number[] {
  const out: number[] = [];
  for (const p of points) {
    out.push(p.x, p.y);
  }
  return out;
}

function getNode(nodes: FigureNode[], id: string): FigureNode | undefined {
  return nodes.find((n) => n.id === id);
}

function polylineFromEdgesInOrder(
  figure: Figure,
  cubicSteps: number,
  edges: FigureEdge[]
): Vec2[] {
  const points: Vec2[] = [];

  for (const edge of edges) {
    const a = getNode(figure.nodes, edge.from);
    const b = getNode(figure.nodes, edge.to);
    if (!a || !b) continue;

    const p0: Vec2 = { x: a.x, y: a.y };
    const p3: Vec2 = { x: b.x, y: b.y };

    if (edge.kind === "line") {
      if (points.length === 0) {
        points.push(p0, p3);
      } else {
        points.push(p3);
      }
      continue;
    }

    const p1 = a.outHandle ? { x: a.outHandle.x, y: a.outHandle.y } : p0;
    const p2 = b.inHandle ? { x: b.inHandle.x, y: b.inHandle.y } : p3;

    const sampled = sampleCubic(p0, p1, p2, p3, cubicSteps);
    if (points.length === 0) {
      points.push(...sampled);
    } else {
      // avoid duplicate join point
      points.push(...sampled.slice(1));
    }
  }

  return points;
}

/**
 * Get the direction vector at the start of an edge from a specific node.
 */
function getEdgeDirection(
  figure: Figure,
  edge: FigureEdge,
  atNode: string
): Vec2 {
  const fromNode = figure.nodes.find((n) => n.id === edge.from);
  const toNode = figure.nodes.find((n) => n.id === edge.to);
  if (!fromNode || !toNode) return { x: 1, y: 0 };

  const p0 = { x: fromNode.x, y: fromNode.y };
  const p3 = { x: toNode.x, y: toNode.y };

  // Check for cubic curves with handles
  if (edge.kind === "cubic" && fromNode.outHandle && toNode.inHandle) {
    const p1 = add(p0, fromNode.outHandle);
    const p2 = add(p3, toNode.inHandle);

    if (atNode === edge.from) {
      return normalizeVec(sub(p1, p0));
    } else {
      return normalizeVec(sub(p3, p2));
    }
  } else {
    // Line segment
    if (atNode === edge.from) {
      return normalizeVec(sub(p3, p0));
    } else {
      return normalizeVec(sub(p0, p3));
    }
  }
}

/**
 * Find the outer boundary of a figure using angle-based walking.
 * This handles figures with nodes that have more than 2 edges (like connected shapes).
 */
export function findOuterBoundaryPolyline(
  figure: Figure,
  cubicSteps: number
): Vec2[] | null {
  if (figure.edges.length === 0) return null;

  // Build adjacency: for each node, which edges connect to it?
  const nodeToEdges = new Map<string, FigureEdge[]>();
  for (const edge of figure.edges) {
    const fromList = nodeToEdges.get(edge.from) ?? [];
    fromList.push(edge);
    nodeToEdges.set(edge.from, fromList);
    const toList = nodeToEdges.get(edge.to) ?? [];
    toList.push(edge);
    nodeToEdges.set(edge.to, toList);
  }

  // Check if any node has more than 2 edges (complex topology)
  let hasComplexTopology = false;
  let maxDegree = 0;
  for (const [, edges] of nodeToEdges) {
    if (edges.length > maxDegree) {
      maxDegree = edges.length;
    }
    if (edges.length > 2) {
      hasComplexTopology = true;
    }
  }
  
  // Debug logging
  // console.log("[findOuterBoundaryPolyline] maxDegree =", maxDegree, "hasComplexTopology =", hasComplexTopology, "figureId =", figure.id);
  
  // If simple topology, return null to use the standard traversal
  if (!hasComplexTopology) return null;

  // Find the node with smallest Y (and smallest X as tiebreaker)
  let startNode: FigureNode | null = null;
  for (const node of figure.nodes) {
    const edgeCount = nodeToEdges.get(node.id)?.length ?? 0;
    if (edgeCount < 2) continue;

    if (
      !startNode ||
      node.y < startNode.y ||
      (node.y === startNode.y && node.x < startNode.x)
    ) {
      startNode = node;
    }
  }

  if (!startNode) return null;

  // Find the edge that goes in the most "rightward" direction from startNode
  // For CCW traversal of outer boundary starting from top-left, we go RIGHT first
  const startEdges = nodeToEdges.get(startNode.id) ?? [];
  if (startEdges.length === 0) return null;

  let startEdge: FigureEdge | null = null;
  let bestAngle = Infinity;

  for (const edge of startEdges) {
    const dir = getEdgeDirection(figure, edge, startNode.id);
    // Choose edge closest to pointing right (angle closest to 0)
    const a = Math.atan2(dir.y, dir.x);
    const distFromRight = Math.abs(a); // Distance from angle 0 (right)
    if (distFromRight < bestAngle) {
      bestAngle = distFromRight;
      startEdge = edge;
    }
  }

  if (!startEdge) return null;

  // Now trace the boundary
  const points: Vec2[] = [];
  const usedInLoop = new Set<string>();

  let currentEdge = startEdge;
  let currentNodeId = startNode.id;
  let prevDir: Vec2 = { x: 0, y: 1 };

  let iterations = 0;
  const maxIterations = figure.edges.length * 3;

  while (iterations < maxIterations) {
    iterations++;

    const isForward = currentNodeId === currentEdge.from;
    const nextNodeId = isForward ? currentEdge.to : currentEdge.from;

    const edgeKey = `${currentEdge.id}:${isForward ? "fwd" : "rev"}`;
    if (usedInLoop.has(edgeKey)) break;
    usedInLoop.add(edgeKey);

    // Get points for this edge
    const pts = edgeLocalPoints(figure, currentEdge, cubicSteps);
    const orderedPts = isForward ? pts : [...pts].reverse();

    if (points.length === 0) {
      points.push(...orderedPts);
    } else {
      points.push(...orderedPts.slice(1));
    }

    // Update direction
    if (orderedPts.length >= 2) {
      const last = orderedPts[orderedPts.length - 1];
      const secondLast = orderedPts[orderedPts.length - 2];
      prevDir = normalizeVec(sub(last, secondLast));
    }

    currentNodeId = nextNodeId;

    // Check if we returned to the start
    if (currentNodeId === startNode.id) break;

    // Find next edge using angle-based selection
    const candidates = (nodeToEdges.get(currentNodeId) ?? []).filter(
      (e) => e.id !== currentEdge.id
    );

    if (candidates.length === 0) break;

    // For external boundary traversal (CCW in screen coords where Y points down),
    // we want to always turn "left" (counter-clockwise), which means choosing
    // the edge with the LARGEST relative angle (measured CCW from incoming).
    let nextEdge: FigureEdge | null = null;
    let bestTurnAngle = -Infinity;

    const incomingAngle = Math.atan2(prevDir.y, prevDir.x);

    for (const candidate of candidates) {
      const candidateDir = getEdgeDirection(figure, candidate, currentNodeId);
      const outgoingAngle = Math.atan2(candidateDir.y, candidateDir.x);

      // Relative angle from incoming to outgoing (CCW positive)
      let turnAngle = outgoingAngle - incomingAngle;
      // Normalize to (0, 2π] - we want CCW angle, positive values
      while (turnAngle <= 0) turnAngle += 2 * Math.PI;
      while (turnAngle > 2 * Math.PI) turnAngle -= 2 * Math.PI;

      // For outer boundary, always take the LARGEST CCW turn (closest to 2π = smallest actual turn)
      if (turnAngle > bestTurnAngle) {
        bestTurnAngle = turnAngle;
        nextEdge = candidate;
      }
    }

    if (!nextEdge) break;
    currentEdge = nextEdge;
  }

  // console.log("[findOuterBoundaryPolyline] result points:", points.length, "iterations:", iterations, "pts:", JSON.stringify(points.slice(0, 10).map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }))));

  if (points.length >= 3) {
    return points;
  }

  return null;
}

function tryPolylineByTraversal(
  figure: Figure,
  cubicSteps: number
): Vec2[] | null {
  if (figure.edges.length === 0) return [];

  const outgoing = new Map<string, FigureEdge[]>();
  const incomingCount = new Map<string, number>();

  for (const e of figure.edges) {
    const list = outgoing.get(e.from) ?? [];
    list.push(e);
    outgoing.set(e.from, list);
    incomingCount.set(e.to, (incomingCount.get(e.to) ?? 0) + 1);
    if (!incomingCount.has(e.from))
      incomingCount.set(e.from, incomingCount.get(e.from) ?? 0);
  }

  let startEdge: FigureEdge | undefined = figure.edges[0];

  if (!figure.closed) {
    // For open figures, prefer a start node with no incoming edges.
    let startNode: string | null = null;
    for (const nodeId of outgoing.keys()) {
      if ((incomingCount.get(nodeId) ?? 0) === 0) {
        startNode = nodeId;
        break;
      }
    }
    if (startNode) {
      startEdge = outgoing.get(startNode)?.[0] ?? startEdge;
    }
  }

  if (!startEdge) return null;

  const visited = new Set<string>();
  const points: Vec2[] = [];

  let currentEdge: FigureEdge | undefined = startEdge;
  let safety = 0;
  while (currentEdge && safety < figure.edges.length + 5) {
    safety++;
    if (visited.has(currentEdge.id)) break;
    visited.add(currentEdge.id);

    const segPts = edgeLocalPoints(figure, currentEdge, cubicSteps);
    if (segPts.length) {
      if (points.length === 0) points.push(...segPts);
      else points.push(...segPts.slice(1));
    }

    if (visited.size === figure.edges.length) break;

    const nextNodeId: string = currentEdge.to;
    const candidates: FigureEdge[] = outgoing.get(nextNodeId) ?? [];
    const nextEdge: FigureEdge | undefined = candidates.find(
      (e) => !visited.has(e.id)
    );
    if (!nextEdge) break;
    currentEdge = nextEdge;
  }

  // Only accept traversal output when it covers the full contour.
  if (visited.size !== figure.edges.length) return null;
  return points;
}

export function figureCentroidLocal(figure: Figure): Vec2 {
  if (!figure.nodes.length) return { x: 0, y: 0 };

  // Prefer nodes referenced by the contour (edges). This avoids centroid drift
  // when figures carry auxiliary nodes (e.g., dart apex nodes).
  const usedIds = new Set<string>();
  for (const e of figure.edges) {
    usedIds.add(e.from);
    usedIds.add(e.to);
  }
  const usedNodes = figure.nodes.filter((n) => usedIds.has(n.id));
  const nodes = usedNodes.length ? usedNodes : figure.nodes;

  const sum = nodes.reduce((acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / nodes.length, y: sum.y / nodes.length };
}

export function edgeLocalPoints(
  figure: Figure,
  edge: FigureEdge,
  steps: number
): Vec2[] {
  const a = getNode(figure.nodes, edge.from);
  const b = getNode(figure.nodes, edge.to);
  if (!a || !b) return [];

  const p0: Vec2 = { x: a.x, y: a.y };
  const p3: Vec2 = { x: b.x, y: b.y };

  if (edge.kind === "line") return [p0, p3];

  const p1: Vec2 = a.outHandle ? { x: a.outHandle.x, y: a.outHandle.y } : p0;
  const p2: Vec2 = b.inHandle ? { x: b.inHandle.x, y: b.inHandle.y } : p3;
  return sampleCubic(p0, p1, p2, p3, steps);
}

export function figureLocalPolyline(
  figure: Figure,
  cubicSteps: number = 30
): number[] {
  // console.log("[figureLocalPolyline] figure.id =", figure.id, "closed =", figure.closed, "edges =", figure.edges.length);
  
  // First, try the boundary walking algorithm for complex figures
  if (figure.closed) {
    const boundary = findOuterBoundaryPolyline(figure, cubicSteps);
    if (boundary) {
      // console.log("[figureLocalPolyline] using boundary algorithm, points:", boundary.length);
      return toPointArray(boundary);
    }
  }

  // For simple figures, use standard traversal
  const traversed = tryPolylineByTraversal(figure, cubicSteps);
  if (traversed) {
    // console.log("[figureLocalPolyline] using traversal, points:", traversed.length);
    return toPointArray(traversed);
  }

  // Fallback: just iterate edges in order
  // console.log("[figureLocalPolyline] using fallback");
  const points = polylineFromEdgesInOrder(figure, cubicSteps, figure.edges);
  return toPointArray(points);
}

export function worldToFigureLocal(
  figure: Pick<Figure, "x" | "y" | "rotation">,
  world: Vec2
): Vec2 {
  const translated = sub(world, { x: figure.x, y: figure.y });
  return rotateInv(translated, figure.rotation || 0);
}

export function figureLocalToWorld(
  figure: Pick<Figure, "x" | "y" | "rotation">,
  local: Vec2
): Vec2 {
  return add(rotate(local, figure.rotation || 0), { x: figure.x, y: figure.y });
}

export function figureWorldPolyline(
  figure: Figure,
  cubicSteps: number = 30
): number[] {
  const local = figureLocalPolyline(figure, cubicSteps);
  const out: number[] = [];
  for (let i = 0; i < local.length; i += 2) {
    const p = figureLocalToWorld(figure, { x: local[i], y: local[i + 1] });
    out.push(p.x, p.y);
  }
  return out;
}

export function figureWorldBoundingBox(
  figure: Figure
): { x: number; y: number; width: number; height: number } | null {
  if (figure.tool === "text") {
    const text = (figure.textValue ?? "").toString();
    const fontSize = (() => {
      const v = figure.textFontSizePx;
      if (!Number.isFinite(v ?? NaN)) return 18;
      return Math.max(6, Math.min(300, v as number));
    })();
    const lineHeight = (() => {
      const v = figure.textLineHeight;
      if (!Number.isFinite(v ?? NaN)) return 1.25;
      return Math.max(0.8, Math.min(3, v as number));
    })();

    const explicitWidth =
      Number.isFinite(figure.textWidthPx ?? NaN) &&
      (figure.textWidthPx ?? 0) > 0
        ? (figure.textWidthPx as number)
        : null;

    const padding = (() => {
      const v = figure.textPaddingPx;
      if (!Number.isFinite(v ?? NaN)) return 0;
      return Math.max(0, Math.min(50, v as number));
    })();

    const lines = text.split("\n");

    const approxCharWidth = fontSize * 0.62;
    const maxLineChars = explicitWidth
      ? Math.max(1, Math.floor(explicitWidth / Math.max(1, approxCharWidth)))
      : null;

    const approxWrappedLineCount = lines.reduce((acc, line) => {
      if (!maxLineChars) return acc + 1;
      const len = Math.max(1, line.length);
      return acc + Math.max(1, Math.ceil(len / maxLineChars));
    }, 0);

    const longestLineLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
    const widthLocal =
      (explicitWidth ?? Math.max(12, longestLineLen * approxCharWidth)) +
      padding * 2;
    const heightLocal =
      Math.max(1, approxWrappedLineCount) * fontSize * lineHeight + padding * 2;

    const cornersLocal = [
      { x: -padding, y: -padding },
      { x: widthLocal - padding, y: -padding },
      { x: widthLocal - padding, y: heightLocal - padding },
      { x: -padding, y: heightLocal - padding },
    ];

    const cornersWorld = cornersLocal.map((p) => figureLocalToWorld(figure, p));
    let minX = cornersWorld[0]!.x;
    let minY = cornersWorld[0]!.y;
    let maxX = cornersWorld[0]!.x;
    let maxY = cornersWorld[0]!.y;
    for (let i = 1; i < cornersWorld.length; i++) {
      const p = cornersWorld[i]!;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  const pts = figureWorldPolyline(figure, 40);
  if (pts.length < 2) return null;
  let minX = pts[0];
  let minY = pts[1];
  let maxX = pts[0];
  let maxY = pts[1];
  for (let i = 2; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    minY = Math.min(minY, pts[i + 1]);
    maxX = Math.max(maxX, pts[i]);
    maxY = Math.max(maxY, pts[i + 1]);
  }

  // Include auxiliary nodes that affect visuals (e.g., dart apex/handles)
  // so exports don't crop them.
  const darts = figure.darts ?? [];
  if (darts.length) {
    const ids = new Set<string>();
    for (const d of darts) {
      ids.add(d.aNodeId);
      ids.add(d.bNodeId);
      ids.add(d.cNodeId);
    }
    for (const n of figure.nodes) {
      if (!ids.has(n.id)) continue;
      const p = figureLocalToWorld(figure, { x: n.x, y: n.y });
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
