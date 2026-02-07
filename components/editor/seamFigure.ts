import { PX_PER_CM } from "./constants";
import { add, dist, mul, sub } from "./figureGeometry";
import { edgeLocalPoints, figureLocalPolyline } from "./figurePath";
import type { Figure, FigureEdge, FigureNode } from "./types";

type Vec2 = { x: number; y: number };

function id(prefix: string): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function signedArea(points: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function normalize(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

function lineIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
  const x1 = p1.x;
  const y1 = p1.y;
  const x2 = p2.x;
  const y2 = p2.y;
  const x3 = p3.x;
  const y3 = p3.y;
  const x4 = p4.x;
  const y4 = p4.y;

  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;

  const px =
    ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den;
  const py =
    ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
  return { x: px, y: py };
}

/**
 * Point-in-polygon test via ray casting.
 * Returns true if the point is inside the polygon.
 */
function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Get the direction vector at the start or end of an edge.
 * For curves, this uses the control points; for lines, uses the endpoints.
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
      // Direction leaving from node = p1 - p0
      return normalize(sub(p1, p0));
    } else {
      // Direction arriving at to node = p3 - p2
      return normalize(sub(p3, p2));
    }
  } else {
    // Line segment
    if (atNode === edge.from) {
      return normalize(sub(p3, p0));
    } else {
      return normalize(sub(p0, p3));
    }
  }
}

/**
 * Find the outer boundary of a figure using the "leftmost" algorithm.
 * This walks around the outer boundary by always choosing the edge that
 * makes the smallest left turn (or largest right turn) at each node.
 * Returns edge IDs, all interpolated points, and the node IDs visited (vertices).
 */
function findOuterBoundary(
  figure: Figure
): { edgeIds: string[]; points: Vec2[]; nodeIds: string[] } | null {
  if (figure.edges.length === 0) return null;

  const nodeById = new Map(figure.nodes.map((n) => [n.id, n]));

  type BoundaryEdge = FigureEdge & { sourceId?: string };

  const splitEdges: BoundaryEdge[] = [];
  const splitEdgeEps = 1e-6;

  const pointOnSegment = (p: FigureNode, a: FigureNode, b: FigureNode) => {
    const ab = sub(b, a);
    const ap = sub(p, a);
    const cross = ab.x * ap.y - ab.y * ap.x;
    if (Math.abs(cross) > splitEdgeEps) return false;
    const dot = ab.x * ap.x + ab.y * ap.y;
    if (dot < -splitEdgeEps) return false;
    const abLenSq = ab.x * ab.x + ab.y * ab.y;
    if (dot > abLenSq + splitEdgeEps) return false;
    return true;
  };

  for (const edge of figure.edges) {
    if (edge.kind !== "line") {
      splitEdges.push(edge);
      continue;
    }

    const a = nodeById.get(edge.from);
    const b = nodeById.get(edge.to);
    if (!a || !b) {
      splitEdges.push(edge);
      continue;
    }

    const ab = sub(b, a);
    const abLenSq = ab.x * ab.x + ab.y * ab.y;
    if (abLenSq < splitEdgeEps) {
      splitEdges.push(edge);
      continue;
    }

    const onSegment = figure.nodes
      .filter((n) => pointOnSegment(n, a, b))
      .map((n) => ({
        node: n,
        t: (ab.x * (n.x - a.x) + ab.y * (n.y - a.y)) / abLenSq,
      }))
      .sort((u, v) => u.t - v.t);

    const unique: Array<{ node: FigureNode; t: number }> = [];
    for (const item of onSegment) {
      if (
        unique.length === 0 ||
        dist(unique[unique.length - 1].node, item.node) > splitEdgeEps
      ) {
        unique.push(item);
      }
    }

    if (unique.length <= 2) {
      splitEdges.push(edge);
      continue;
    }

    for (let i = 0; i < unique.length - 1; i++) {
      const from = unique[i].node;
      const to = unique[i + 1].node;
      if (from.id === to.id) continue;
      splitEdges.push({
        id: `${edge.id}_s${i}`,
        from: from.id,
        to: to.id,
        kind: "line",
        sourceId: edge.id,
      });
    }
  }

  const edgeKey = (edge: FigureEdge): string => {
    const a = nodeById.get(edge.from);
    const b = nodeById.get(edge.to);
    if (!a || !b) return edge.id;

    const ax = Math.round(a.x * 1000) / 1000;
    const ay = Math.round(a.y * 1000) / 1000;
    const bx = Math.round(b.x * 1000) / 1000;
    const by = Math.round(b.y * 1000) / 1000;

    const aFirst = ax < bx || (ax === bx && ay <= by);
    return aFirst ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`;
  };

  const edgeKeyCounts = new Map<string, number>();
  for (const edge of splitEdges) {
    const key = edgeKey(edge);
    edgeKeyCounts.set(key, (edgeKeyCounts.get(key) ?? 0) + 1);
  }

  const uniqueEdgesByKey = new Map<string, BoundaryEdge>();
  for (const edge of splitEdges) {
    const key = edgeKey(edge);
    const existing = uniqueEdgesByKey.get(key);
    if (!existing) {
      uniqueEdgesByKey.set(key, edge);
      continue;
    }
    const a1 = nodeById.get(edge.from);
    const b1 = nodeById.get(edge.to);
    const a2 = nodeById.get(existing.from);
    const b2 = nodeById.get(existing.to);
    const len1 = a1 && b1 ? dist(a1, b1) : 0;
    const len2 = a2 && b2 ? dist(a2, b2) : 0;
    if (len1 > len2 + 1e-6) {
      uniqueEdgesByKey.set(key, edge);
    }
  }
  const uniqueEdges = Array.from(uniqueEdgesByKey.values());

  const edgesForBoundary = splitEdges.filter((edge) => {
    const key = edgeKey(edge);
    return (edgeKeyCounts.get(key) ?? 0) === 1;
  });

  const boundaryEdges = edgesForBoundary.length >= 3 ? edgesForBoundary : uniqueEdges;

  const DEBUG_BOUNDARY = false; // Set to true for debugging

  const attemptLoopExtraction = (
    candidateEdges: BoundaryEdge[]
  ): Array<{ edgeIds: string[]; points: Vec2[]; nodeIds: string[]; area: number }> => {
    // Build adjacency: for each node, which edges connect to it?
    const nodeToEdges = new Map<string, BoundaryEdge[]>();
    for (const edge of candidateEdges) {
      const fromList = nodeToEdges.get(edge.from) ?? [];
      fromList.push(edge);
      nodeToEdges.set(edge.from, fromList);
      const toList = nodeToEdges.get(edge.to) ?? [];
      toList.push(edge);
      nodeToEdges.set(edge.to, toList);
    }

    // Find the node with smallest Y (and smallest X as tiebreaker) - guaranteed to be on outer boundary
    let startNode: FigureNode | null = null;
    for (const node of figure.nodes) {
      // Only consider nodes that have at least 2 edges (can be part of a loop)
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

    if (!startNode) return [];

    // Find all possible loops starting from each edge and pick the largest area.
    const startEdges = nodeToEdges.get(startNode.id) ?? [];
    if (startEdges.length === 0) return [];

    if (DEBUG_BOUNDARY) {
      console.log(
        "findOuterBoundary: startNode =",
        startNode.id,
        "at",
        startNode.x,
        startNode.y
      );
      console.log("findOuterBoundary: startEdges.length=", startEdges.length);
    }

    const traceFrom = (
      startEdge: BoundaryEdge,
      preferLeft: boolean
    ): { edgeIds: string[]; points: Vec2[]; nodeIds: string[] } | null => {
    const loopEdgeIds: string[] = [];
    const loopPoints: Vec2[] = [];
    const loopNodeIds: string[] = [];
    const usedInLoop = new Set<string>();

    let currentEdge: BoundaryEdge = startEdge;
    let currentNodeId = startNode.id;
    let prevDir: Vec2 = { x: 0, y: 1 };

    let iterations = 0;
    const maxIterations = candidateEdges.length * 3;
    let closed = false;

    while (iterations < maxIterations) {
      iterations++;

      const isForward = currentNodeId === currentEdge.from;
      const nextNodeId = isForward ? currentEdge.to : currentEdge.from;

      const edgeKey = `${currentEdge.id}:${isForward ? "fwd" : "rev"}`;
      if (usedInLoop.has(edgeKey)) {
        if (DEBUG_BOUNDARY) console.log("  Already used edge direction:", edgeKey);
        break;
      }

      loopNodeIds.push(currentNodeId);
      loopEdgeIds.push(currentEdge.sourceId ?? currentEdge.id);
      usedInLoop.add(edgeKey);

      const pts = edgeLocalPoints(figure, currentEdge, 30);
      const orderedPts = isForward ? pts : [...pts].reverse();

      if (loopPoints.length === 0) {
        loopPoints.push(...orderedPts);
      } else {
        loopPoints.push(...orderedPts.slice(1));
      }

      if (orderedPts.length >= 2) {
        const last = orderedPts[orderedPts.length - 1];
        const secondLast = orderedPts[orderedPts.length - 2];
        prevDir = normalize(sub(last, secondLast));
      }

      currentNodeId = nextNodeId;

      if (currentNodeId === startNode.id && loopEdgeIds.length > 0) {
        if (DEBUG_BOUNDARY) console.log("  Returned to start node, loop complete");
        closed = true;
        break;
      }

      const candidates = (nodeToEdges.get(currentNodeId) ?? []).filter(
        (e) => e.id !== currentEdge.id
      );

      if (candidates.length === 0) break;

      let nextEdge: BoundaryEdge | null = null;
      let bestTurnAngle = preferLeft ? -Infinity : Infinity;

      const incomingAngle = Math.atan2(prevDir.y, prevDir.x);

      const candidateInfos = candidates
        .map((candidate) => {
          const candidateDir = getEdgeDirection(figure, candidate, currentNodeId);
          const outgoingAngle = Math.atan2(candidateDir.y, candidateDir.x);
          const a = nodeById.get(candidate.from);
          const b = nodeById.get(candidate.to);
          const length = a && b ? dist(a, b) : 0;
          const angleKey = (Math.round(outgoingAngle * 1000) / 1000).toString();
          return { candidate, candidateDir, outgoingAngle, length, angleKey };
        })
        .filter((info) => info.length > 0);

      const prunedCandidates = new Map<string, typeof candidateInfos[number]>();
      for (const info of candidateInfos) {
        const existing = prunedCandidates.get(info.angleKey);
        if (!existing || info.length > existing.length + 1e-6) {
          prunedCandidates.set(info.angleKey, info);
        }
      }

      const finalCandidates = Array.from(prunedCandidates.values());

      const straightCandidates = finalCandidates
        .map((info) => {
          let turnAngle = info.outgoingAngle - incomingAngle;
          while (turnAngle > Math.PI) turnAngle -= 2 * Math.PI;
          while (turnAngle <= -Math.PI) turnAngle += 2 * Math.PI;
          return { info, turnAngle };
        })
        .filter((item) => Math.abs(item.turnAngle) < 1e-3);

      const pickEdge = (allowUTurns: boolean) => {
        for (const info of finalCandidates) {
          const candidate = info.candidate;
          const outgoingAngle = info.outgoingAngle;

          let turnAngle = outgoingAngle - incomingAngle;
          while (turnAngle > Math.PI) turnAngle -= 2 * Math.PI;
          while (turnAngle <= -Math.PI) turnAngle += 2 * Math.PI;

          const isUTurn = Math.abs(turnAngle) > Math.PI - 1e-6;
          if (!allowUTurns && isUTurn) {
            continue;
          }

          if (preferLeft) {
            if (turnAngle > bestTurnAngle) {
              bestTurnAngle = turnAngle;
              nextEdge = candidate;
            }
          } else {
            if (turnAngle < bestTurnAngle) {
              bestTurnAngle = turnAngle;
              nextEdge = candidate;
            }
          }
        }
      };

      pickEdge(false);
      if (!nextEdge) {
        pickEdge(true);
      }

      if (nextEdge && straightCandidates.length > 0) {
        const alignedStraight = straightCandidates.filter(
          (item) => Math.abs(item.turnAngle - bestTurnAngle) < 1e-3
        );
        if (alignedStraight.length > 0) {
          const bestStraight = alignedStraight.reduce((best, cur) =>
            cur.info.length > best.info.length ? cur : best
          );
          nextEdge = bestStraight.info.candidate;
          bestTurnAngle = bestStraight.turnAngle;
        }
      }

      if (!nextEdge) break;
      currentEdge = nextEdge;
    }

    if (!closed || loopEdgeIds.length < 3 || loopPoints.length < 3) {
      return null;
    }

    const first = loopPoints[0];
    const last = loopPoints[loopPoints.length - 1];
    if (dist(first, last) < 1e-6) {
      loopPoints.pop();
    }
    if (loopPoints.length < 3) return null;

    return { edgeIds: loopEdgeIds, points: loopPoints, nodeIds: loopNodeIds };
    };

    const loops: Array<{
      edgeIds: string[];
      points: Vec2[];
      nodeIds: string[];
      area: number;
    }> = [];
    for (const edge of startEdges) {
      const loopRight = traceFrom(edge, false);
      if (loopRight) {
        loops.push({ ...loopRight, area: signedArea(loopRight.points) });
      }
      const loopLeft = traceFrom(edge, true);
      if (loopLeft) {
        loops.push({ ...loopLeft, area: signedArea(loopLeft.points) });
      }
    }

    return loops;
  };

  const findOuterBoundaryByFaces = (
    candidateEdges: BoundaryEdge[]
  ): { edgeIds: string[]; points: Vec2[]; nodeIds: string[] } | null => {
    type HalfEdge = {
      from: string;
      to: string;
      edgeId: string;
      angle: number;
    };

    const outgoing = new Map<string, HalfEdge[]>();
    const halfEdges: HalfEdge[] = [];

    for (const edge of candidateEdges) {
      const a = nodeById.get(edge.from);
      const b = nodeById.get(edge.to);
      if (!a || !b) continue;
      const angleAB = Math.atan2(b.y - a.y, b.x - a.x);
      const angleBA = Math.atan2(a.y - b.y, a.x - b.x);

      const heAB: HalfEdge = {
        from: edge.from,
        to: edge.to,
        edgeId: edge.sourceId ?? edge.id,
        angle: angleAB,
      };
      const heBA: HalfEdge = {
        from: edge.to,
        to: edge.from,
        edgeId: edge.sourceId ?? edge.id,
        angle: angleBA,
      };

      halfEdges.push(heAB, heBA);
      const listA = outgoing.get(heAB.from) ?? [];
      listA.push(heAB);
      outgoing.set(heAB.from, listA);
      const listB = outgoing.get(heBA.from) ?? [];
      listB.push(heBA);
      outgoing.set(heBA.from, listB);
    }

    for (const [, list] of outgoing) {
      list.sort((a, b) => a.angle - b.angle);
    }

    const visited = new Set<string>();
    const faces: Array<{ edgeIds: string[]; nodeIds: string[]; points: Vec2[]; area: number }> = [];

    const keyOf = (he: HalfEdge) => `${he.from}->${he.to}`;

    for (const start of halfEdges) {
      const startKey = keyOf(start);
      if (visited.has(startKey)) continue;

      const faceEdgeIds: string[] = [];
      const faceNodeIds: string[] = [];
      const facePoints: Vec2[] = [];

      let current = start;
      let safety = halfEdges.length * 3;

      while (safety-- > 0) {
        const currentKey = keyOf(current);
        if (visited.has(currentKey)) break;
        visited.add(currentKey);

        faceNodeIds.push(current.from);
        faceEdgeIds.push(current.edgeId);
        const node = nodeById.get(current.from);
        if (node) facePoints.push({ x: node.x, y: node.y });

        const outgoingEdges = outgoing.get(current.to) ?? [];
        if (!outgoingEdges.length) break;

        const reverseIndex = outgoingEdges.findIndex(
          (he) => he.to === current.from
        );

        if (reverseIndex < 0) break;

        const nextIndex =
          (reverseIndex - 1 + outgoingEdges.length) % outgoingEdges.length;
        current = outgoingEdges[nextIndex];

        if (current.from === start.from && current.to === start.to) break;
      }

      if (facePoints.length >= 3) {
        const area = signedArea(facePoints);
        faces.push({
          edgeIds: faceEdgeIds,
          nodeIds: faceNodeIds,
          points: facePoints,
          area,
        });
      }
    }

    if (!faces.length) return null;

    let outer = faces[0];
    for (const face of faces) {
      if (Math.abs(face.area) > Math.abs(outer.area)) {
        outer = face;
      }
    }

    return { edgeIds: outer.edgeIds, points: outer.points, nodeIds: outer.nodeIds };
  };

  const maxDegree = (() => {
    const nodeToEdges = new Map<string, number>();
    for (const edge of uniqueEdges) {
      nodeToEdges.set(edge.from, (nodeToEdges.get(edge.from) ?? 0) + 1);
      nodeToEdges.set(edge.to, (nodeToEdges.get(edge.to) ?? 0) + 1);
    }
    let max = 0;
    for (const [, degree] of nodeToEdges) {
      if (degree > max) max = degree;
    }
    return max;
  })();
  const hasDuplicateEdges = Array.from(edgeKeyCounts.values()).some(
    (count) => count > 1
  );

  if (hasDuplicateEdges || maxDegree > 2) {
    const faceOuter = findOuterBoundaryByFaces(uniqueEdges);
    if (faceOuter) {
      return {
        edgeIds: faceOuter.edgeIds,
        points: faceOuter.points,
        nodeIds: faceOuter.nodeIds,
      };
    }
  }

  let loops = attemptLoopExtraction(boundaryEdges);
  if (loops.length === 0 && boundaryEdges !== uniqueEdges) {
    loops = attemptLoopExtraction(uniqueEdges);
  }
  if (loops.length === 0 && boundaryEdges !== splitEdges) {
    loops = attemptLoopExtraction(splitEdges);
  }

  if (loops.length === 0) return null;

  let outer = loops[0];
  for (const loop of loops) {
    if (Math.abs(loop.area) > Math.abs(outer.area)) {
      outer = loop;
    }
  }

  return { edgeIds: outer.edgeIds, points: outer.points, nodeIds: outer.nodeIds };
}

/**
 * Extract all closed loops from a figure, returning edge IDs for each loop.
 * The outer loop is the one with the largest absolute area.
 */
function extractClosedLoops(
  figure: Figure
): Array<{ edgeIds: string[]; points: Vec2[]; nodeIds: string[]; area: number }> {
  if (figure.edges.length === 0) return [];

  // First, try to find the outer boundary using angle-based algorithm
  const outerBoundary = findOuterBoundary(figure);
  if (outerBoundary && outerBoundary.points.length >= 3) {
    const area = signedArea(outerBoundary.points);
    // console.log("[extractClosedLoops] found outer boundary with", outerBoundary.points.length, "points, area =", area);
    return [
      {
        edgeIds: outerBoundary.edgeIds,
        points: outerBoundary.points,
        nodeIds: outerBoundary.nodeIds,
        area,
      },
    ];
  }

  // Fallback: Build adjacency: for each node, which edges connect to it?
  const nodeToEdges = new Map<string, FigureEdge[]>();
  for (const edge of figure.edges) {
    const fromList = nodeToEdges.get(edge.from) ?? [];
    fromList.push(edge);
    nodeToEdges.set(edge.from, fromList);
    const toList = nodeToEdges.get(edge.to) ?? [];
    toList.push(edge);
    nodeToEdges.set(edge.to, toList);
  }

  const usedEdges = new Set<string>();
  const loops: Array<{ edgeIds: string[]; points: Vec2[]; nodeIds: string[]; area: number }> = [];

  // Traverse edges to find loops
  for (const startEdge of figure.edges) {
    if (usedEdges.has(startEdge.id)) continue;

    const loopEdgeIds: string[] = [];
    const loopPoints: Vec2[] = [];
    let currentEdge = startEdge;
    let currentNodeId = startEdge.from;
    let iterations = 0;
    const maxIterations = figure.edges.length * 2;

    while (iterations < maxIterations) {
      iterations++;
      if (usedEdges.has(currentEdge.id)) break;

      loopEdgeIds.push(currentEdge.id);
      usedEdges.add(currentEdge.id);

      // Get points for this edge
      const pts = edgeLocalPoints(figure, currentEdge, 30);
      // Determine direction
      const fromNode = figure.nodes.find((n) => n.id === currentEdge.from);
      const toNode = figure.nodes.find((n) => n.id === currentEdge.to);
      if (!fromNode || !toNode) break;

      const isForward = currentNodeId === currentEdge.from;
      if (isForward) {
        if (loopPoints.length === 0) {
          loopPoints.push(...pts);
        } else {
          loopPoints.push(...pts.slice(1));
        }
        currentNodeId = currentEdge.to;
      } else {
        const reversed = [...pts].reverse();
        if (loopPoints.length === 0) {
          loopPoints.push(...reversed);
        } else {
          loopPoints.push(...reversed.slice(1));
        }
        currentNodeId = currentEdge.from;
      }

      if (currentNodeId === startEdge.from && loopEdgeIds.length > 0) {
        break;
      }

      // Find next edge
      const candidates = (nodeToEdges.get(currentNodeId) ?? []).filter(
        (e) => !usedEdges.has(e.id)
      );
      if (candidates.length === 0) break;
      currentEdge = candidates[0];
    }

    if (loopEdgeIds.length >= 3 && loopPoints.length >= 3) {
      // Remove duplicate last point if present
      const first = loopPoints[0];
      const last = loopPoints[loopPoints.length - 1];
      if (dist(first, last) < 1e-6) {
        loopPoints.pop();
      }
      if (loopPoints.length >= 3) {
        const area = signedArea(loopPoints);
        loops.push({ edgeIds: loopEdgeIds, points: loopPoints, nodeIds: [], area });
      }
    }
  }

  return loops;
}

/**
 * Get the outer loop (largest absolute area) from a figure.
 * Returns the edge IDs that belong to the outer loop.
 */
export function getOuterLoopEdgeIds(figure: Figure): Set<string> {
  const loopEdges = getOuterLoopEdgeSequence(figure);
  if (loopEdges.length > 0) return new Set(loopEdges);
  return new Set(figure.edges.map((e) => e.id));
}

export function getOuterLoopEdgeSequence(figure: Figure): string[] {
  const loops = extractClosedLoops(figure);
  if (loops.length === 0) {
    return figure.edges.map((e) => e.id);
  }

  let outerLoop = loops[0];
  for (const loop of loops) {
    if (Math.abs(loop.area) > Math.abs(outerLoop.area)) {
      outerLoop = loop;
    }
  }

  if (outerLoop.nodeIds.length < 2) return outerLoop.edgeIds;

  const edgeByNodes = new Map<string, FigureEdge[]>();
  for (const edge of figure.edges) {
    const key1 = `${edge.from}->${edge.to}`;
    const key2 = `${edge.to}->${edge.from}`;
    const list1 = edgeByNodes.get(key1) ?? [];
    list1.push(edge);
    edgeByNodes.set(key1, list1);
    const list2 = edgeByNodes.get(key2) ?? [];
    list2.push(edge);
    edgeByNodes.set(key2, list2);
  }

  const outerEdgeIds = new Set(outerLoop.edgeIds);

  const ordered: string[] = [];
  for (let i = 0; i < outerLoop.nodeIds.length; i++) {
    const a = outerLoop.nodeIds[i];
    const b = outerLoop.nodeIds[(i + 1) % outerLoop.nodeIds.length];
    const candidates = edgeByNodes.get(`${a}->${b}`) ?? [];
    const edge =
      candidates.find((cand) => outerEdgeIds.has(cand.id)) ?? candidates[0];
    if (edge) ordered.push(edge.id);
  }

  return ordered.length > 0 ? ordered : outerLoop.edgeIds;
}

export function getOuterLoopEdgeDirections(
  figure: Figure
): Map<string, { from: string; to: string }> {
  const loops = extractClosedLoops(figure);
  if (loops.length === 0) return new Map();

  let outerLoop = loops[0];
  for (const loop of loops) {
    if (Math.abs(loop.area) > Math.abs(outerLoop.area)) {
      outerLoop = loop;
    }
  }

  if (outerLoop.nodeIds.length < 2) return new Map();

  const edgeByNodes = new Map<string, FigureEdge[]>();
  for (const edge of figure.edges) {
    const key1 = `${edge.from}->${edge.to}`;
    const key2 = `${edge.to}->${edge.from}`;
    const list1 = edgeByNodes.get(key1) ?? [];
    list1.push(edge);
    edgeByNodes.set(key1, list1);
    const list2 = edgeByNodes.get(key2) ?? [];
    list2.push(edge);
    edgeByNodes.set(key2, list2);
  }

  const outerEdgeIds = new Set(outerLoop.edgeIds);

  const directions = new Map<string, { from: string; to: string }>();
  for (let i = 0; i < outerLoop.nodeIds.length; i++) {
    const a = outerLoop.nodeIds[i];
    const b = outerLoop.nodeIds[(i + 1) % outerLoop.nodeIds.length];
    const candidates = edgeByNodes.get(`${a}->${b}`) ?? [];
    const edge =
      candidates.find((cand) => outerEdgeIds.has(cand.id)) ?? candidates[0];
    if (edge) directions.set(edge.id, { from: a, to: b });
  }

  return directions;
}

export function hasClosedLoop(figure: Figure): boolean {
  return extractClosedLoops(figure).length > 0;
}

/**
 * Get the outer loop polygon points.
 */
export function getOuterLoopPolygon(figure: Figure): Vec2[] {
  const loops = extractClosedLoops(figure);
  // console.log("[getOuterLoopPolygon] loops count =", loops.length);
  if (loops.length === 0) {
    // console.log("[getOuterLoopPolygon] no loops, using fallback");
    // Fallback: use entire figure polyline
    const flat = figureLocalPolyline(figure, 60);
    const poly: Vec2[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      poly.push({ x: flat[i], y: flat[i + 1] });
    }
    if (poly.length >= 2 && dist(poly[0], poly[poly.length - 1]) < 1e-6) {
      poly.pop();
    }
    return poly;
  }

  // Outer loop = largest absolute area
  let outerLoop = loops[0];
  for (const loop of loops) {
    if (Math.abs(loop.area) > Math.abs(outerLoop.area)) {
      outerLoop = loop;
    }
  }
  
  // console.log("[getOuterLoopPolygon] returning outer loop with", outerLoop.points.length, "points");
  return outerLoop.points;
}

/**
 * Get the outer loop vertices (only the node positions, not interpolated points).
 * This is used for offset calculations where we need the actual corner vertices.
 */
export function getOuterLoopVertices(figure: Figure): Vec2[] {
  const loops = extractClosedLoops(figure);
  
  if (isOffsetDebug()) {
    console.log(`[getOuterLoopVertices] figure has ${figure.nodes.length} nodes, ${figure.edges.length} edges`);
    console.log(`[getOuterLoopVertices] extractClosedLoops returned ${loops.length} loops`);
    if (loops.length > 0) {
      loops.forEach((loop, i) => {
        console.log(`  loop ${i}: ${loop.nodeIds.length} nodeIds, ${loop.points.length} points, area=${loop.area.toFixed(1)}`);
      });
    }
  }
  
  if (loops.length === 0) {
    // Fallback: use figure nodes that have at least 2 edges
    const nodeEdgeCount = new Map<string, number>();
    for (const edge of figure.edges) {
      nodeEdgeCount.set(edge.from, (nodeEdgeCount.get(edge.from) ?? 0) + 1);
      nodeEdgeCount.set(edge.to, (nodeEdgeCount.get(edge.to) ?? 0) + 1);
    }
    const result = figure.nodes
      .filter((n) => (nodeEdgeCount.get(n.id) ?? 0) >= 2)
      .map((n) => ({ x: n.x, y: n.y }));
    if (isOffsetDebug()) {
      console.log(`[getOuterLoopVertices] FALLBACK: returning ${result.length} vertices from nodes`);
    }
    return simplifyColinearVertices(result);
  }

  // Outer loop = largest absolute area
  let outerLoop = loops[0];
  for (const loop of loops) {
    if (Math.abs(loop.area) > Math.abs(outerLoop.area)) {
      outerLoop = loop;
    }
  }

  // Convert nodeIds to vertex positions
  if (outerLoop.nodeIds.length > 0) {
    const nodeMap = new Map(figure.nodes.map((n) => [n.id, n]));
    const vertices: Vec2[] = [];
    for (const nodeId of outerLoop.nodeIds) {
      const node = nodeMap.get(nodeId);
      if (node) {
        vertices.push({ x: node.x, y: node.y });
      }
    }
    if (isOffsetDebug()) {
      console.log(`[getOuterLoopVertices] returning ${vertices.length} vertices from nodeIds`);
    }
    return simplifyColinearVertices(vertices);
  }

  // Fallback: extract vertices from points (simplified - just use first/last of each segment)
  if (isOffsetDebug()) {
    console.log(`[getOuterLoopVertices] returning ${outerLoop.points.length} points from loop`);
  }
  return simplifyColinearVertices(outerLoop.points);
}

function simplifyColinearVertices(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points;

  const len = points.length;
  const result: Vec2[] = [];

  for (let i = 0; i < len; i++) {
    const prev = points[(i - 1 + len) % len];
    const curr = points[i];
    const next = points[(i + 1) % len];

    if (dist(prev, curr) < 1e-6 || dist(curr, next) < 1e-6) {
      continue;
    }

    const v1 = sub(curr, prev);
    const v2 = sub(next, curr);
    const cross = v1.x * v2.y - v1.y * v2.x;
    const dot = v1.x * v2.x + v1.y * v2.y;

    // Drop colinear points that don't change direction or backtrack.
    if (Math.abs(cross) < 1e-6 && dot >= 0) {
      continue;
    }

    if (Math.abs(cross) < 1e-6 && dot < 0) {
      // U-turn on a straight line: drop the middle point to collapse the spike.
      continue;
    }

    result.push(curr);
  }

  return result.length >= 3 ? result : points;
}

/**
 * Determine the outward sign for an edge by testing if offset goes outside the polygon.
 * Returns +1 or -1 to multiply with the normal.
 */
function computeEdgeOutwardSign(
  edgePoints: Vec2[],
  outerPoly: Vec2[],
  testOffset: number = 1
): number {
  if (edgePoints.length < 2 || outerPoly.length < 3) return 1;

  // Get edge midpoint and normal
  const midIdx = Math.floor(edgePoints.length / 2);
  const mid = edgePoints[midIdx];
  const prev = edgePoints[Math.max(0, midIdx - 1)];
  const next = edgePoints[Math.min(edgePoints.length - 1, midIdx + 1)];
  const tangent = normalize(sub(next, prev));
  const rightNormal = { x: tangent.y, y: -tangent.x };

  // Test point with positive sign (right normal)
  const testPositive = add(mid, mul(rightNormal, testOffset));
  const insidePositive = pointInPolygon(testPositive, outerPoly);

  // If positive offset is inside, we want negative (left normal = outward)
  // If positive offset is outside, we want positive (right normal = outward)
  return insidePositive ? -1 : 1;
}

/**
 * Compute the signed area of a polygon (positive = CCW, negative = CW)
 */
function polygonSignedArea(poly: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y;
    area -= poly[j].x * poly[i].y;
  }
  return area / 2;
}

const isOffsetDebug = () =>
  typeof window !== "undefined" &&
  (
    window as unknown as { __INAA_DEBUG__?: { offsetDebug?: boolean } }
  ).__INAA_DEBUG__?.offsetDebug === true;

/**
 * Offset a closed polygon outward using proper polygon offset algorithm.
 * This handles concave corners correctly by detecting and removing self-intersections.
 */
function offsetPolygonOutward(poly: Vec2[], offsetPx: number): Vec2[] {
  if (poly.length < 3) return [];

  if (isOffsetDebug()) {
    console.log("[offsetPolygonOutward] input poly:", poly.length, "vertices");
    poly.forEach((p, i) => console.log(`  ${i}: (${Math.round(p.x)}, ${Math.round(p.y)})`));
  }

  // Determine winding direction using signed area
  const area = polygonSignedArea(poly);
  // In screen coordinates (Y down):
  // - Positive area = CW winding
  // - Negative area = CCW winding
  // For outward offset: CW needs right-hand normal, CCW needs left-hand normal
  const outwardSign = area > 0 ? 1 : -1;

  if (isOffsetDebug()) {
    console.log("[offsetPolygonOutward] area:", area, "outwardSign:", outwardSign);
  }

  // Compute direction and outward normal for each edge
  const edges: Array<{ dir: Vec2; normal: Vec2; p1: Vec2; p2: Vec2 }> = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dir = normalize(sub(b, a));
    // Outward normal
    const normal = { x: dir.y * outwardSign, y: -dir.x * outwardSign };
    edges.push({ dir, normal, p1: a, p2: b });
  }

  // Build offset polygon by processing each vertex
  const result: Vec2[] = [];

  for (let i = 0; i < poly.length; i++) {
    const prevIdx = (i - 1 + poly.length) % poly.length;
    const prevEdge = edges[prevIdx];
    const currEdge = edges[i];
    const vertex = poly[i];

    // Offset lines from previous and current edges
    const prevLine = {
      p1: add(prevEdge.p1, mul(prevEdge.normal, offsetPx)),
      p2: add(prevEdge.p2, mul(prevEdge.normal, offsetPx)),
    };
    const currLine = {
      p1: add(currEdge.p1, mul(currEdge.normal, offsetPx)),
      p2: add(currEdge.p2, mul(currEdge.normal, offsetPx)),
    };

    // Check if this is a convex or concave corner
    // Cross product of directions: prevDir × currDir
    const cross = prevEdge.dir.x * currEdge.dir.y - prevEdge.dir.y * currEdge.dir.x;
    // For outward offset: 
    // - Convex corner (cross * outwardSign > 0): use intersection
    // - Concave corner (cross * outwardSign < 0): use arc or miter cut
    const isConvex = cross * outwardSign > 1e-6;

    if (isOffsetDebug()) {
      console.log(`[offsetPolygonOutward] vertex ${i}: (${Math.round(vertex.x)}, ${Math.round(vertex.y)}) cross=${cross.toFixed(2)} isConvex=${isConvex}`);
    }

    if (isConvex) {
      // Convex corner: find intersection of offset lines
      const inter = lineIntersection(prevLine.p1, prevLine.p2, currLine.p1, currLine.p2);
      if (inter) {
        if (isOffsetDebug()) {
          console.log(`    → intersection: (${Math.round(inter.x)}, ${Math.round(inter.y)})`);
        }
        result.push(inter);
      } else {
        // Parallel lines, use simple offset point
        result.push(add(vertex, mul(prevEdge.normal, offsetPx)));
      }
    } else {
      // Concave corner: the offset edges diverge
      // For concave corners, we need to handle two cases:
      // 1. Small offset: add two points (endOfPrev, startOfCurr) to form the "cut"
      // 2. Large offset: the offset lines cross each other, use intersection point
      
      const endOfPrev = add(prevEdge.p2, mul(prevEdge.normal, offsetPx));
      const startOfCurr = add(currEdge.p1, mul(currEdge.normal, offsetPx));
      
      // Calculate the offset lines
      const prevOffsetStart = add(prevEdge.p1, mul(prevEdge.normal, offsetPx));
      const currOffsetEnd = add(currEdge.p2, mul(currEdge.normal, offsetPx));
      
      // Find intersection of the two offset lines (as infinite lines)
      const inter = lineIntersection(prevOffsetStart, endOfPrev, startOfCurr, currOffsetEnd);
      
      // Check if the intersection is "between" the endpoints, indicating overlap
      // For the prev edge offset: intersection should be after prevOffsetStart but before endOfPrev
      // For the curr edge offset: intersection should be after startOfCurr but before currOffsetEnd
      let useIntersection = false;
      if (inter) {
        // Calculate t parameter along each offset line
        // For prev offset: t = 0 at prevOffsetStart, t = 1 at endOfPrev
        const prevDx = endOfPrev.x - prevOffsetStart.x;
        const prevDy = endOfPrev.y - prevOffsetStart.y;
        const prevLen2 = prevDx * prevDx + prevDy * prevDy;
        const tPrev = prevLen2 > 0.001 
          ? ((inter.x - prevOffsetStart.x) * prevDx + (inter.y - prevOffsetStart.y) * prevDy) / prevLen2
          : 0;
        
        // For curr offset: t = 0 at startOfCurr, t = 1 at currOffsetEnd
        const currDx = currOffsetEnd.x - startOfCurr.x;
        const currDy = currOffsetEnd.y - startOfCurr.y;
        const currLen2 = currDx * currDx + currDy * currDy;
        const tCurr = currLen2 > 0.001
          ? ((inter.x - startOfCurr.x) * currDx + (inter.y - startOfCurr.y) * currDy) / currLen2
          : 0;
        
        // If intersection is within BOTH segments (0 < t < 1 for both),
        // it means the offset edges actually cross each other, creating a self-intersection.
        // In this case, we should use the intersection point instead of two separate points.
        // tPrev in (0, 1) means intersection is within the prev offset edge
        // tCurr in (0, 1) means intersection is within the curr offset edge
        if (tPrev > 1e-6 && tPrev < 1 - 1e-6 && tCurr > 1e-6 && tCurr < 1 - 1e-6) {
          // The offset edges cross each other - use intersection
          useIntersection = true;
        }
        
        if (isOffsetDebug()) {
          console.log(`[CONCAVE] tPrev=${tPrev.toFixed(3)} tCurr=${tCurr.toFixed(3)} useIntersection=${useIntersection}`);
        }
      }
      
      if (isOffsetDebug()) {
        console.log(`[CONCAVE] endOfPrev=(${Math.round(endOfPrev.x)}, ${Math.round(endOfPrev.y)}) startOfCurr=(${Math.round(startOfCurr.x)}, ${Math.round(startOfCurr.y)}) dist=${dist(endOfPrev, startOfCurr).toFixed(1)}`);
        if (inter) {
          console.log(`[CONCAVE] inter=(${Math.round(inter.x)}, ${Math.round(inter.y)})`);
        }
      }
      
      if (useIntersection && inter) {
        // Use the intersection point - offset is too large for this corner
        result.push(inter);
      } else {
        // Use two points for the concave cut
        if (dist(endOfPrev, startOfCurr) > 0.1) {
          result.push(endOfPrev);
          result.push(startOfCurr);
        } else {
          result.push(endOfPrev);
        }
      }
    }
  }

  if (result.length < 3) return result;

  if (isOffsetDebug()) {
    console.log(`[offsetPolygonOutward] result before cleanup: ${result.length} points`);
    console.log(`[POINTS] ${result.map((p, i) => `${i}:(${Math.round(p.x)},${Math.round(p.y)})`).join(' | ')}`);
  }

  // Clean up any self-intersections that might still occur
  const cleaned = cleanupSelfIntersections(result);
  
  if (isOffsetDebug() && cleaned.length !== result.length) {
    console.log(`[offsetPolygonOutward] cleanup removed ${result.length - cleaned.length} points`);
    console.log(`[offsetPolygonOutward] result after cleanup: ${cleaned.length} points`);
    cleaned.forEach((p, i) => console.log(`  ${i}: (${Math.round(p.x)}, ${Math.round(p.y)})`));
  }
  
  return cleaned;
}

/**
 * Clean up self-intersections in a polygon by finding where edges cross
 * and keeping only the outer contour.
 */
function cleanupSelfIntersections(poly: Vec2[]): Vec2[] {
  if (poly.length < 4) return poly;

  // Find all self-intersections
  const intersections: Array<{
    edgeI: number;
    edgeJ: number;
    t1: number;
    t2: number;
    point: Vec2;
  }> = [];

  for (let i = 0; i < poly.length; i++) {
    const a1 = poly[i];
    const a2 = poly[(i + 1) % poly.length];

    for (let j = i + 2; j < poly.length; j++) {
      // Skip adjacent edges
      if (j === (i + poly.length - 1) % poly.length) continue;
      if ((j + 1) % poly.length === i) continue;

      const b1 = poly[j];
      const b2 = poly[(j + 1) % poly.length];

      const inter = segmentIntersection(a1, a2, b1, b2);
      if (inter && inter.t1 > 0.001 && inter.t1 < 0.999 && inter.t2 > 0.001 && inter.t2 < 0.999) {
        if (isOffsetDebug()) {
          console.log(`[cleanupSelfIntersections] found intersection: edge ${i}→${(i+1)%poly.length} crosses edge ${j}→${(j+1)%poly.length}`);
          console.log(`  edge ${i}: (${Math.round(a1.x)},${Math.round(a1.y)}) → (${Math.round(a2.x)},${Math.round(a2.y)})`);
          console.log(`  edge ${j}: (${Math.round(b1.x)},${Math.round(b1.y)}) → (${Math.round(b2.x)},${Math.round(b2.y)})`);
          console.log(`  intersection: (${Math.round(inter.point.x)},${Math.round(inter.point.y)}) t1=${inter.t1.toFixed(3)} t2=${inter.t2.toFixed(3)}`);
        }
        intersections.push({
          edgeI: i,
          edgeJ: j,
          t1: inter.t1,
          t2: inter.t2,
          point: inter.point,
        });
      }
    }
  }

  if (intersections.length === 0) {
    return poly;
  }

  // Build graph with intersection points inserted
  // Then find the outer contour by always turning right (keeping exterior on our right)
  
  // For simplicity, if there's only one intersection, handle it directly
  if (intersections.length === 1) {
    const int = intersections[0];
    // Walk from intersection through the longer path
    const path1Len = int.edgeJ - int.edgeI;
    const path2Len = poly.length - path1Len;
    
    const result: Vec2[] = [int.point];
    
    if (path1Len >= path2Len) {
      // Take path from edgeI+1 to edgeJ
      for (let k = int.edgeI + 1; k <= int.edgeJ; k++) {
        result.push(poly[k]);
      }
    } else {
      // Take path from edgeJ+1 around to edgeI
      for (let k = int.edgeJ + 1; k < poly.length; k++) {
        result.push(poly[k]);
      }
      for (let k = 0; k <= int.edgeI; k++) {
        result.push(poly[k]);
      }
    }
    
    return result;
  }

  // For multiple intersections, use a more general approach
  // Sort intersections and process them to find the outer boundary
  return findOuterContour(poly, intersections);
}

/**
 * Find the outer contour of a self-intersecting polygon.
 */
function findOuterContour(
  poly: Vec2[],
  intersections: Array<{
    edgeI: number;
    edgeJ: number;
    t1: number;
    t2: number;
    point: Vec2;
  }>
): Vec2[] {
  // Build a list of all points including intersection points
  // Each edge can have multiple intersection points
  const edgePoints: Map<number, Array<{ t: number; point: Vec2; jumpTo: number; jumpT: number }>> = new Map();

  for (const int of intersections) {
    // Add to edge I
    const listI = edgePoints.get(int.edgeI) ?? [];
    listI.push({ t: int.t1, point: int.point, jumpTo: int.edgeJ, jumpT: int.t2 });
    edgePoints.set(int.edgeI, listI);

    // Add to edge J
    const listJ = edgePoints.get(int.edgeJ) ?? [];
    listJ.push({ t: int.t2, point: int.point, jumpTo: int.edgeI, jumpT: int.t1 });
    edgePoints.set(int.edgeJ, listJ);
  }

  // Sort intersection points on each edge by t
  for (const [, list] of edgePoints) {
    list.sort((a, b) => a.t - b.t);
  }

  // Walk the polygon, at each intersection decide whether to jump or continue
  // Strategy: always stay on the "outside" by choosing the path that keeps
  // the maximum area
  const result: Vec2[] = [];
  const visitedEdges = new Set<string>();
  
  let currentEdge = 0;
  let currentT = 0;
  let safety = poly.length * 3 + intersections.length * 2;

  while (safety-- > 0) {
    const edgeKey = `${currentEdge}:${currentT.toFixed(4)}`;
    if (visitedEdges.has(edgeKey) && result.length > 2) break;
    visitedEdges.add(edgeKey);

    // Get intersection points on current edge after currentT
    const ints = edgePoints.get(currentEdge) ?? [];
    const nextInt = ints.find(i => i.t > currentT + 0.001);

    if (nextInt) {
      // There's an intersection on this edge
      result.push(nextInt.point);
      // Jump to the other edge
      currentEdge = nextInt.jumpTo;
      currentT = nextInt.jumpT;
    } else {
      // No more intersections on this edge, go to end vertex
      const nextVertex = (currentEdge + 1) % poly.length;
      result.push(poly[nextVertex]);
      currentEdge = nextVertex;
      currentT = 0;
    }

    if (currentEdge === 0 && currentT === 0 && result.length > 2) break;
  }

  return result.length >= 3 ? result : poly;
}

/**
 * Find intersection point between two line segments.
 * Returns null if segments don't intersect, or the intersection point with t parameters.
 */
function segmentIntersection(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2
): { point: Vec2; t1: number; t2: number } | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;

  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return null;

  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;

  const t1 = (dx * d2y - dy * d2x) / cross;
  const t2 = (dx * d1y - dy * d1x) / cross;

  // Check if intersection is within both segments
  if (t1 < 0 || t1 > 1 || t2 < 0 || t2 > 1) return null;

  return {
    point: { x: a1.x + t1 * d1x, y: a1.y + t1 * d1y },
    t1,
    t2,
  };
}

function offsetPolylineByNormal(
  points: Vec2[],
  outwardSign: number,
  offsetPx: number
): Vec2[] {
  if (points.length < 2) return [];
  const segNormals: Vec2[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = normalize(sub(b, a));
    const right = { x: d.y, y: -d.x };
    segNormals.push(mul(right, outwardSign));
  }

  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    let n: Vec2 | null = null;
    if (i === 0) {
      n = segNormals[0] ?? { x: 0, y: 0 };
    } else if (i === points.length - 1) {
      n = segNormals[segNormals.length - 1] ?? { x: 0, y: 0 };
    } else {
      const prev = segNormals[i - 1] ?? { x: 0, y: 0 };
      const next = segNormals[i] ?? { x: 0, y: 0 };
      n = normalize(add(prev, next));
    }
    out.push(add(points[i], mul(n, offsetPx)));
  }

  return out;
}

/**
 * Offset a closed polyline uniformly, using proper polygon offset algorithm.
 * This ensures the offset always goes to the exterior and handles concave shapes correctly.
 * For circles, uses a simplified approach since they don't have a standard edge graph.
 */
function offsetClosedPolylineUniform(
  figure: Figure,
  offsetPx: number
): Vec2[] | null {
  if (figure.edges.length === 0) return null;
  if (!figure.closed && !hasClosedLoop(figure)) return null;

  // Special handling for circles - they don't have a standard edge graph
  if (figure.tool === "circle") {
    const pts = figureLocalPolyline(figure, 60);
    if (pts.length < 6) return null;
    
    const poly: Vec2[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      poly.push({ x: pts[i], y: pts[i + 1] });
    }
    
    // Remove duplicate last point if present
    if (poly.length >= 2 && dist(poly[0], poly[poly.length - 1]) < 1e-6) {
      poly.pop();
    }
    if (poly.length < 3) return null;
    
    // Use the new polygon offset algorithm
    return offsetPolygonOutward(poly, offsetPx);
  }

  // If the outer loop contains curves, offset a denser polyline so the
  // resulting seam preserves curvature (instead of straightening).
  const outerLoopEdgeIds = getOuterLoopEdgeIds(figure);
  const hasCurveOnOuterLoop = figure.edges.some(
    (edge) => outerLoopEdgeIds.has(edge.id) && edge.kind === "cubic"
  );
  if (hasCurveOnOuterLoop) {
    const pts = figureLocalPolyline(figure, 120);
    if (pts.length >= 6) {
      const poly: Vec2[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        poly.push({ x: pts[i], y: pts[i + 1] });
      }
      if (poly.length >= 2 && dist(poly[0], poly[poly.length - 1]) < 1e-6) {
        poly.pop();
      }
      if (poly.length >= 3) {
        return offsetPolygonOutward(poly, offsetPx);
      }
    }
  }

  // For regular figures (rectangles, L-shapes, etc.), use the VERTICES for offset
  // calculation, not the interpolated points. This is crucial for correct 
  // concave corner handling.
  const vertices = getOuterLoopVertices(figure);
  if (vertices.length < 3) {
    // Fallback to full polygon if vertices extraction fails
    const outerPoly = getOuterLoopPolygon(figure);
    if (outerPoly.length < 3) return null;
    return offsetPolygonOutward(outerPoly, offsetPx);
  }

  // Use the vertex-based polygon offset algorithm
  return offsetPolygonOutward(vertices, offsetPx);
}

/**
 * Offset edges per-edge with individual offset values.
 * Only edges in the outer loop receive offsets.
 */
function offsetClosedPolylinePerEdge(
  base: Figure,
  edgeOffsetsPx: Record<string, number>
): Array<{ edgeId: string; points: Vec2[] }> {
  if (!base.closed && !hasClosedLoop(base)) return [];
  if (!base.edges.length) return [];

  const outerLoopDirections = getOuterLoopEdgeDirections(base);
  const outerLoopSequence = getOuterLoopEdgeSequence(base);
  const outerLoopEdgeIds = new Set(outerLoopDirections.keys());
  const outerLoopIndex = new Map<string, number>();
  for (let i = 0; i < outerLoopSequence.length; i++) {
    outerLoopIndex.set(outerLoopSequence[i], i);
  }
  const outerPoly = getOuterLoopPolygon(base);
  if (outerPoly.length < 3) return [];

  const outerVertices = getOuterLoopVertices(base);
  const outerArea = outerVertices.length >= 3 ? polygonSignedArea(outerVertices) : 0;
  const loopOutwardSign = outerArea > 0 ? 1 : -1;

  const segmentsByEdge = new Map<
    string,
    { points: Vec2[]; edgeIndex: number }
  >();
  for (const edge of base.edges) {
    // Skip edges not in outer loop
    if (!outerLoopEdgeIds.has(edge.id)) {
      continue;
    }

    const edgeIndex = outerLoopIndex.get(edge.id);
    if (edgeIndex === undefined) {
      continue;
    }

    const offsetPx = edgeOffsetsPx[edge.id];
    if (!Number.isFinite(offsetPx) || offsetPx <= 0) {
      continue;
    }

    let pts = edgeLocalPoints(base, edge, edge.kind === "line" ? 2 : 80);
    if (pts.length < 2) {
      continue;
    }

    const loopDir = outerLoopDirections.get(edge.id);
    const reversed = loopDir ? !(edge.from === loopDir.from && edge.to === loopDir.to) : false;
    if (reversed) {
      pts = [...pts].reverse();
    }

    // Compute outward sign for this specific edge
    const outwardSign = loopDir
      ? loopOutwardSign
      : computeEdgeOutwardSign(pts, outerPoly, 5);
    const offsetSeg = offsetPolylineByNormal(pts, outwardSign, offsetPx);
    if (offsetSeg.length >= 2) {
      segmentsByEdge.set(edge.id, { points: offsetSeg, edgeIndex });
    }
  }

  if (!segmentsByEdge.size) return [];

  // Order by edge index
  const ordered = Array.from(segmentsByEdge.entries())
    .sort((a, b) => a[1].edgeIndex - b[1].edgeIndex)
    .map(([edgeId, data]) => ({ edgeId, points: data.points }));

  const loopCount = outerLoopSequence.length;
  const edgeIndexById = new Map(
    ordered.map((entry) => [entry.edgeId, segmentsByEdge.get(entry.edgeId)?.edgeIndex ?? -1])
  );

  // Connect adjacent segments at intersections (only if consecutive in loop)
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
    if (current.points.length < 2) continue;

    const nextIndex = (i + 1) % ordered.length;
    const next = ordered[nextIndex];
    if (next.points.length < 2) continue;

    const currentLoopIndex = edgeIndexById.get(current.edgeId) ?? -1;
    const nextLoopIndex = edgeIndexById.get(next.edgeId) ?? -1;
    if (currentLoopIndex < 0 || nextLoopIndex < 0 || loopCount < 2) continue;

    const isConsecutive = (currentLoopIndex + 1) % loopCount === nextLoopIndex;
    if (!isConsecutive) continue;

    const currentEnd = current.points[current.points.length - 1];
    const currentPrev = current.points[current.points.length - 2] ?? currentEnd;
    const nextStart = next.points[0];
    const nextNext = next.points[1] ?? nextStart;

    const inter = lineIntersection(
      currentPrev,
      currentEnd,
      nextStart,
      nextNext
    );
    if (inter) {
      current.points[current.points.length - 1] = inter;
      next.points[0] = inter;
    }
  }

  return ordered;
}

export function seamSourceSignature(
  base: Figure,
  offsetCm?: number | Record<string, number>
): string {
  const offsetKey = (() => {
    if (typeof offsetCm === "number" && Number.isFinite(offsetCm)) {
      return Math.round(offsetCm * 10000) / 10000;
    }
    if (offsetCm && typeof offsetCm === "object") {
      const entries = Object.entries(offsetCm)
        .filter(([, v]) => Number.isFinite(v))
        .map(([k, v]) => [k, Math.round(v * 10000) / 10000] as const)
        .sort(([a], [b]) => a.localeCompare(b));
      return Object.fromEntries(entries);
    }
    return null;
  })();
  const sig = {
    closed: base.closed,
    offsetCm: offsetKey,
    nodes: base.nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      mode: n.mode,
      inHandle: n.inHandle ? { x: n.inHandle.x, y: n.inHandle.y } : null,
      outHandle: n.outHandle ? { x: n.outHandle.x, y: n.outHandle.y } : null,
    })),
    edges: base.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      kind: e.kind,
    })),
  };
  return JSON.stringify(sig);
}

export function makeSeamFigure(
  base: Figure,
  offsetValueCm: number | Record<string, number>
): Figure | null {
  if (isOffsetDebug()) {
    console.log(
      "[makeSeamFigure] base=",
      base.id,
      "closed=",
      base.closed,
      "offsetValueCm=",
      offsetValueCm
    );
  }
  if (!base.closed && !hasClosedLoop(base)) {
    if (isOffsetDebug()) {
      console.log("[makeSeamFigure] base not closed, returning null");
    }
    return null;
  }
  const sourceSignature = seamSourceSignature(base, offsetValueCm);

  // Numeric offset: apply uniformly to all outer loop edges
  if (typeof offsetValueCm === "number") {
    const offsetPx = offsetValueCm * PX_PER_CM;
    if (isOffsetDebug()) {
      console.log("[makeSeamFigure] numeric offset, offsetPx =", offsetPx);
    }

    // Use edge-by-edge logic with per-edge outward detection
    const out = offsetClosedPolylineUniform(base, offsetPx);
    if (isOffsetDebug()) {
      console.log("[makeSeamFigure] offset result length:", out?.length ?? "null");
    }
    if (!out || out.length < 3) {
      if (isOffsetDebug()) {
        console.log("[makeSeamFigure] insufficient offset points, returning null");
      }
      return null;
    }

    const nodes: FigureNode[] = out.map((p) => ({
      id: id("n"),
      x: p.x,
      y: p.y,
      mode: "corner",
    }));
    const edges: FigureEdge[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const b = nodes[(i + 1) % nodes.length];
      edges.push({ id: id("e"), from: a.id, to: b.id, kind: "line" });
    }

    if (isOffsetDebug()) {
      console.log(
        "[makeSeamFigure] returning seam with",
        nodes.length,
        "nodes and",
        edges.length,
        "edges"
      );
    }
    return {
      ...base,
      id: id("fig"),
      kind: "seam",
      parentId: base.id,
      closed: true,
      offsetCm: offsetValueCm,
      sourceSignature,
      dash: [5, 5],
      fill: "transparent",
      nodes,
      edges,
    };
  }

  // Per-edge offset: apply to specified edges (only those in outer loop)
  if (base.tool === "circle") return null;

  const edgeOffsetsPx: Record<string, number> = {};
  for (const [edgeId, cm] of Object.entries(offsetValueCm)) {
    if (!Number.isFinite(cm) || cm <= 0) continue;
    edgeOffsetsPx[edgeId] = cm * PX_PER_CM;
  }
  const segments = offsetClosedPolylinePerEdge(base, edgeOffsetsPx);
  if (!segments.length) {
    if (isOffsetDebug()) {
      console.log("[makeSeamFigure] per-edge offset produced no segments");
    }
    return null;
  }

  const seamSegments = segments.map((seg) => {
    const flat: number[] = [];
    for (const p of seg.points) flat.push(p.x, p.y);
    return flat;
  });
  const seamSegmentEdgeIds = segments.map((seg) => seg.edgeId);

  const nodes: FigureNode[] = [];
  const edges: FigureEdge[] = [];
  for (const seg of segments) {
    if (seg.points.length < 2) continue;
    const segNodes: FigureNode[] = seg.points.map((p) => ({
      id: id("n"),
      x: p.x,
      y: p.y,
      mode: "corner",
    }));
    for (let i = 0; i < segNodes.length - 1; i++) {
      edges.push({
        id: id("e"),
        from: segNodes[i].id,
        to: segNodes[i + 1].id,
        kind: "line",
      });
    }
    nodes.push(...segNodes);
  }

  return {
    ...base,
    id: id("fig"),
    kind: "seam",
    parentId: base.id,
    offsetCm: offsetValueCm,
    seamSegments,
    seamSegmentEdgeIds,
    sourceSignature,
    dash: [5, 5],
    fill: "transparent",
    nodes,
    edges,
    closed: false,
  };
}

export function recomputeSeamFigure(
  base: Figure,
  seam: Figure,
  offsetValueCm: number | Record<string, number>
): Figure | null {
  const next = makeSeamFigure(base, offsetValueCm);
  if (!next) return null;
  return {
    ...next,
    id: seam.id,
  };
}
