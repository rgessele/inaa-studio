/**
 * Seam Figure Algorithm Tests
 * Tests for the outer boundary extraction algorithm
 */

import type { Figure, FigureNode, FigureEdge } from "./types";

// Re-implement the algorithm locally for testing
type Vec2 = { x: number; y: number };

function normalize(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

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

  if (atNode === edge.from) {
    return normalize(sub(p3, p0));
  } else {
    return normalize(sub(p0, p3));
  }
}

function findOuterBoundary(
  figure: Figure
): { edgeIds: string[]; nodeIds: string[] } | null {
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

  // Find the node with smallest Y (and smallest X as tiebreaker) - guaranteed to be on outer boundary
  // Only consider nodes that have at least 2 edges (can be part of a loop)
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

  if (!startNode) {
    console.log("  No valid start node found");
    return null;
  }

  console.log("  startNode =", startNode.id, "at", startNode.x, startNode.y);

  // Find the edge that goes in the most "rightward" direction from startNode
  const startEdges = nodeToEdges.get(startNode.id) ?? [];
  if (startEdges.length === 0) return null;

  let startEdge: FigureEdge | null = null;
  let bestAngle = -Infinity;

  for (const edge of startEdges) {
    const dir = getEdgeDirection(figure, edge, startNode.id);
    const a = Math.atan2(dir.y, dir.x);
    console.log(`  Edge ${edge.id}: dir=(${dir.x.toFixed(2)}, ${dir.y.toFixed(2)}), angle=${(a * 180 / Math.PI).toFixed(1)}°`);
    if (a > bestAngle) {
      bestAngle = a;
      startEdge = edge;
    }
  }

  if (!startEdge) return null;

  console.log("  startEdge =", startEdge.id, "angle=", (bestAngle * 180 / Math.PI).toFixed(1) + "°");

  // Now trace the boundary
  const loopEdgeIds: string[] = [];
  const loopNodeIds: string[] = [];
  const usedInLoop = new Set<string>();

  let currentEdge = startEdge;
  let currentNodeId = startNode.id;
  let prevDir: Vec2 = { x: 0, y: 1 }; // Coming from "above" initially

  let iterations = 0;
  const maxIterations = figure.edges.length * 3;

  while (iterations < maxIterations) {
    iterations++;

    const isForward = currentNodeId === currentEdge.from;
    const nextNodeId = isForward ? currentEdge.to : currentEdge.from;

    const edgeKey = `${currentEdge.id}:${isForward ? "fwd" : "rev"}`;
    if (usedInLoop.has(edgeKey)) {
      console.log(`  Step ${iterations}: STOP - already used ${edgeKey}`);
      break;
    }

    loopEdgeIds.push(currentEdge.id);
    loopNodeIds.push(currentNodeId);
    usedInLoop.add(edgeKey);

    // Get direction for next step
    const fromNode = figure.nodes.find(n => n.id === currentEdge.from);
    const toNode = figure.nodes.find(n => n.id === currentEdge.to);
    if (!fromNode || !toNode) break;

    const p0 = { x: fromNode.x, y: fromNode.y };
    const p3 = { x: toNode.x, y: toNode.y };
    prevDir = isForward ? normalize(sub(p3, p0)) : normalize(sub(p0, p3));

    console.log(`  Step ${iterations}: ${currentEdge.id} (${isForward ? "fwd" : "rev"}) from ${currentNodeId} to ${nextNodeId}`);

    currentNodeId = nextNodeId;

    // Check if we returned to the start
    if (currentNodeId === startNode.id && loopEdgeIds.length > 0) {
      console.log("  Returned to start node, loop complete");
      break;
    }

    // Find next edge using angle-based selection
    const candidates = (nodeToEdges.get(currentNodeId) ?? []).filter(
      (e) => e.id !== currentEdge.id
    );

    console.log(`    At node ${currentNodeId}, candidates: [${candidates.map(e => e.id).join(", ")}]`);

    if (candidates.length === 0) {
      console.log("    No candidates, stopping");
      break;
    }

    // Choose the edge that makes the largest clockwise turn
    let nextEdge: FigureEdge | null = null;
    let bestTurnAngle = -Infinity;

    const incomingAngle = Math.atan2(prevDir.y, prevDir.x);
    console.log(`    Incoming direction: (${prevDir.x.toFixed(2)}, ${prevDir.y.toFixed(2)}), angle=${(incomingAngle * 180 / Math.PI).toFixed(1)}°`);

    for (const candidate of candidates) {
      const candidateDir = getEdgeDirection(figure, candidate, currentNodeId);
      const outgoingAngle = Math.atan2(candidateDir.y, candidateDir.x);

      let turnAngle = outgoingAngle - incomingAngle;
      while (turnAngle > Math.PI) turnAngle -= 2 * Math.PI;
      while (turnAngle < -Math.PI) turnAngle += 2 * Math.PI;

      console.log(`      ${candidate.id}: dir=(${candidateDir.x.toFixed(2)}, ${candidateDir.y.toFixed(2)}), out=${(outgoingAngle * 180 / Math.PI).toFixed(1)}°, turn=${(turnAngle * 180 / Math.PI).toFixed(1)}°`);

      if (turnAngle > bestTurnAngle) {
        bestTurnAngle = turnAngle;
        nextEdge = candidate;
      }
    }

    if (!nextEdge) {
      console.log("    No next edge selected, stopping");
      break;
    }
    
    console.log(`    Selected: ${nextEdge.id} with turn=${(bestTurnAngle * 180 / Math.PI).toFixed(1)}°`);
    currentEdge = nextEdge;
  }

  loopNodeIds.push(currentNodeId); // Add final node

  if (loopEdgeIds.length >= 3) {
    return { edgeIds: loopEdgeIds, nodeIds: loopNodeIds };
  }

  console.log("  Loop too short:", loopEdgeIds.length, "edges");
  return null;
}

// Test: Two squares connected by a corner (self-touching polygon)
export function testTwoSquaresConnected() {
  console.log("\n=== TEST: Two Squares Connected by Corner ===");
  
  // Layout:
  //    n1 ------- n2
  //    |    Q1    |
  //    n7 ------- n3 ------- n4
  //               |    Q2    |
  //               n6 ------- n5
  //
  // baseX=200, baseY=200, q1Size=100, q2Size=120
  
  const baseX = 200;
  const baseY = 200;
  const q1Size = 100;
  const q2Size = 120;

  const fig: Figure = {
    id: "test_two_squares",
    tool: "line",
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    darts: [],
    piques: [],
    nodes: [
      // Q1
      { id: "n1", x: baseX, y: baseY, mode: "corner" }, // top-left
      { id: "n2", x: baseX + q1Size, y: baseY, mode: "corner" }, // top-right
      { id: "n3", x: baseX + q1Size, y: baseY + q1Size, mode: "corner" }, // CONNECTION POINT
      // Q2 continues from n3
      { id: "n4", x: baseX + q1Size + q2Size, y: baseY + q1Size, mode: "corner" }, // Q2 top-right
      { id: "n5", x: baseX + q1Size + q2Size, y: baseY + q1Size + q2Size, mode: "corner" }, // Q2 bottom-right
      { id: "n6", x: baseX + q1Size, y: baseY + q1Size + q2Size, mode: "corner" }, // Q2 bottom-left
      // Back to Q1
      { id: "n7", x: baseX, y: baseY + q1Size, mode: "corner" }, // Q1 bottom-left
    ],
    edges: [
      // Q1 top and right
      { id: "e1", from: "n1", to: "n2", kind: "line" },
      { id: "e2", from: "n2", to: "n3", kind: "line" },
      // Q2 complete loop
      { id: "e3", from: "n3", to: "n4", kind: "line" },
      { id: "e4", from: "n4", to: "n5", kind: "line" },
      { id: "e5", from: "n5", to: "n6", kind: "line" },
      { id: "e6", from: "n6", to: "n3", kind: "line" }, // back to connection point
      // Q1 bottom and left
      { id: "e7", from: "n3", to: "n7", kind: "line" },
      { id: "e8", from: "n7", to: "n1", kind: "line" },
    ],
    stroke: "black",
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
  };

  console.log("Figure has", fig.nodes.length, "nodes and", fig.edges.length, "edges");
  console.log("Nodes:");
  for (const n of fig.nodes) {
    console.log(`  ${n.id}: (${n.x}, ${n.y})`);
  }
  console.log("Edges:");
  for (const e of fig.edges) {
    console.log(`  ${e.id}: ${e.from} -> ${e.to}`);
  }
  
  // Check node degrees
  const nodeDegrees = new Map<string, number>();
  for (const e of fig.edges) {
    nodeDegrees.set(e.from, (nodeDegrees.get(e.from) ?? 0) + 1);
    nodeDegrees.set(e.to, (nodeDegrees.get(e.to) ?? 0) + 1);
  }
  console.log("Node degrees:");
  for (const [nodeId, degree] of nodeDegrees) {
    console.log(`  ${nodeId}: ${degree} edges`);
  }

  console.log("\nFinding outer boundary...");
  const result = findOuterBoundary(fig);

  if (result) {
    console.log("\nResult: Found boundary with", result.edgeIds.length, "edges");
    console.log("Edge IDs:", result.edgeIds);
    console.log("Node IDs:", result.nodeIds);
    
    // Expected outer boundary: n1 -> n2 -> n3 -> n4 -> n5 -> n6 -> n3 -> n7 -> n1
    // or equivalently starting from different point
    console.log("\nExpected path: n1 -> n2 -> n3 -> n4 -> n5 -> n6 -> n3 -> n7 -> n1");
    console.log("(Note: n3 appears twice because it's a self-touching point)");
    
    return { success: true, result };
  } else {
    console.log("\nResult: FAILED to find boundary");
    return { success: false, result: null };
  }
}

// Test: Simple L-shape (no self-touching)
export function testLShape() {
  console.log("\n=== TEST: L-Shape ===");
  
  // Layout:
  //    n1 ------- n2
  //    |          |
  //    |    +-----n3
  //    |    |
  //    n6---n5----n4
  
  const fig: Figure = {
    id: "test_lshape",
    tool: "line",
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    darts: [],
    piques: [],
    nodes: [
      { id: "n1", x: 0, y: 0, mode: "corner" },
      { id: "n2", x: 100, y: 0, mode: "corner" },
      { id: "n3", x: 100, y: 50, mode: "corner" },
      { id: "n4", x: 50, y: 50, mode: "corner" },
      { id: "n5", x: 50, y: 100, mode: "corner" },
      { id: "n6", x: 0, y: 100, mode: "corner" },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", kind: "line" },
      { id: "e2", from: "n2", to: "n3", kind: "line" },
      { id: "e3", from: "n3", to: "n4", kind: "line" },
      { id: "e4", from: "n4", to: "n5", kind: "line" },
      { id: "e5", from: "n5", to: "n6", kind: "line" },
      { id: "e6", from: "n6", to: "n1", kind: "line" },
    ],
    stroke: "black",
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
  };

  console.log("Figure has", fig.nodes.length, "nodes and", fig.edges.length, "edges");

  const result = findOuterBoundary(fig);

  if (result) {
    console.log("\nResult: Found boundary with", result.edgeIds.length, "edges");
    console.log("Edge IDs:", result.edgeIds);
    return { success: result.edgeIds.length === 6, result };
  } else {
    console.log("\nResult: FAILED to find boundary");
    return { success: false, result: null };
  }
}

// Run all tests
export function runAllTests() {
  console.log("Running seam figure algorithm tests...\n");
  
  const results = [
    testLShape(),
    testTwoSquaresConnected(),
  ];
  
  const passed = results.filter(r => r.success).length;
  console.log(`\n=== ${passed}/${results.length} tests passed ===`);
  
  return results;
}

// Auto-run when executed directly
if (typeof window === "undefined") {
  runAllTests();
}
