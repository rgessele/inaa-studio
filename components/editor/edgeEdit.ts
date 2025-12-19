import type { EdgeKind, Figure, FigureEdge, FigureNode } from "./types";
import { sampleCubic, type Vec2 } from "./figureGeometry";
import type { EdgeAnchor } from "./EditorContext";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function mul(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

function norm(v: Vec2): Vec2 {
  const l = len(v);
  if (l <= 1e-9) return { x: 1, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

function getNode(nodes: FigureNode[], id: string): FigureNode | undefined {
  return nodes.find((n) => n.id === id);
}

function translateNode(node: FigureNode, delta: Vec2): FigureNode {
  const next: FigureNode = {
    ...node,
    x: node.x + delta.x,
    y: node.y + delta.y,
  };

  if (node.inHandle) {
    next.inHandle = {
      x: node.inHandle.x + delta.x,
      y: node.inHandle.y + delta.y,
    };
  }

  if (node.outHandle) {
    next.outHandle = {
      x: node.outHandle.x + delta.x,
      y: node.outHandle.y + delta.y,
    };
  }

  return next;
}

function edgeControlPoints(
  kind: EdgeKind,
  from: FigureNode,
  to: FigureNode
): { p0: Vec2; p1: Vec2; p2: Vec2; p3: Vec2 } {
  const p0: Vec2 = { x: from.x, y: from.y };
  const p3: Vec2 = { x: to.x, y: to.y };

  if (kind === "line") {
    return { p0, p1: p0, p2: p3, p3 };
  }

  const p1: Vec2 = from.outHandle ? { ...from.outHandle } : p0;
  const p2: Vec2 = to.inHandle ? { ...to.inHandle } : p3;
  return { p0, p1, p2, p3 };
}

function cubicArcLengthPx(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): number {
  const pts = sampleCubic(p0, p1, p2, p3, 80);
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    sum += len(sub(pts[i], pts[i - 1]));
  }
  return sum;
}

function solveEndDisplacementForArcLength(opts: {
  kind: EdgeKind;
  from: FigureNode;
  to: FigureNode;
  moveEnd: "from" | "to";
  dir: Vec2;
  targetLengthPx: number;
}): number {
  const { kind, from, to, moveEnd, dir, targetLengthPx } = opts;
  const unitDir = norm(dir);

  const base = edgeControlPoints(kind, from, to);

  const lengthAt = (s: number): number => {
    const delta = mul(unitDir, s);

    const p0 = moveEnd === "from" ? add(base.p0, delta) : base.p0;
    const p3 = moveEnd === "to" ? add(base.p3, delta) : base.p3;

    // Keep handles rigidly attached to the moving endpoint.
    let p1 = base.p1;
    let p2 = base.p2;

    if (kind !== "line") {
      if (moveEnd === "from") {
        p1 = add(base.p1, delta);
      }
      if (moveEnd === "to") {
        p2 = add(base.p2, delta);
      }
    }

    if (kind === "line") {
      return len(sub(p3, p0));
    }

    return cubicArcLengthPx(p0, p1, p2, p3);
  };

  const baseLen = lengthAt(0);
  const target = Math.max(0.0001, targetLengthPx);
  if (!Number.isFinite(baseLen) || baseLen <= 1e-9) return 0;

  const wantIncrease = target > baseLen;

  // Bracket a solution.
  let lo = 0;
  let hi = (wantIncrease ? 1 : -1) * baseLen;

  let loLen = baseLen;
  let hiLen = lengthAt(hi);

  const MAX_BRACKET_ITERS = 16;
  for (let i = 0; i < MAX_BRACKET_ITERS; i++) {
    const crosses = wantIncrease ? hiLen >= target : hiLen <= target;
    if (crosses) break;
    hi *= 2;
    hiLen = lengthAt(hi);
  }

  // If we still couldn't bracket, fall back to a proportional displacement.
  const bracketed = wantIncrease ? hiLen >= target : hiLen <= target;
  if (!bracketed) {
    const deltaLen = target - baseLen;
    return clamp(deltaLen, -4 * baseLen, 4 * baseLen);
  }

  // Binary search.
  let a = lo;
  let b = hi;
  for (let i = 0; i < 24; i++) {
    const m = (a + b) / 2;
    const mLen = lengthAt(m);
    const goRight = wantIncrease ? mLen < target : mLen > target;
    if (goRight) a = m;
    else b = m;
  }

  return (a + b) / 2;
}

export function setEdgeTargetLengthPx(opts: {
  figure: Figure;
  edgeId: string;
  targetLengthPx: number;
  anchor: EdgeAnchor;
}): Figure | null {
  const { figure, edgeId, targetLengthPx, anchor } = opts;

  const edge = figure.edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  const fromNode = getNode(figure.nodes, edge.from);
  const toNode = getNode(figure.nodes, edge.to);
  if (!fromNode || !toNode) return null;

  const a: Vec2 = { x: fromNode.x, y: fromNode.y };
  const b: Vec2 = { x: toNode.x, y: toNode.y };

  const chord = sub(b, a);
  const chordDir = norm(chord);

  const nodesById = new Map<string, FigureNode>();
  for (const n of figure.nodes) nodesById.set(n.id, n);

  const moveNodeById = (nodeId: string, delta: Vec2) => {
    const n = nodesById.get(nodeId);
    if (!n) return;
    nodesById.set(nodeId, translateNode(n, delta));
  };

  if (edge.kind === "line") {
    const desired = Math.max(0.0001, targetLengthPx);

    if (anchor === "start") {
      const nextB = add(a, mul(chordDir, desired));
      moveNodeById(toNode.id, sub(nextB, b));
    } else if (anchor === "end") {
      const nextA = sub(b, mul(chordDir, desired));
      moveNodeById(fromNode.id, sub(nextA, a));
    } else {
      const mid = mul(add(a, b), 0.5);
      const nextA = sub(mid, mul(chordDir, desired / 2));
      const nextB = add(mid, mul(chordDir, desired / 2));
      moveNodeById(fromNode.id, sub(nextA, a));
      moveNodeById(toNode.id, sub(nextB, b));
    }

    return {
      ...figure,
      nodes: figure.nodes.map((n) => nodesById.get(n.id) ?? n),
    };
  }

  // Cubic curve: use arc-length target and move endpoint along a tangent direction.
  // For "mid" anchor, use chord direction (simple + stable).
  if (anchor === "mid") {
    const desired = Math.max(0.0001, targetLengthPx);

    // Scale chord length heuristically to get closer to desired length.
    // Then do a single refinement moving both ends along chord.
    const base = edgeControlPoints("cubic", fromNode, toNode);
    const baseLen = cubicArcLengthPx(base.p0, base.p1, base.p2, base.p3);
    const k = baseLen > 1e-6 ? desired / baseLen : 1;

    const deltaA = mul(chordDir, -(k - 1) * len(chord) / 2);
    const deltaB = mul(chordDir, (k - 1) * len(chord) / 2);
    moveNodeById(fromNode.id, deltaA);
    moveNodeById(toNode.id, deltaB);

    return {
      ...figure,
      nodes: figure.nodes.map((n) => nodesById.get(n.id) ?? n),
    };
  }

  if (anchor === "start") {
    const base = edgeControlPoints("cubic", fromNode, toNode);
    const tangent = sub(base.p3, base.p2);
    const s = solveEndDisplacementForArcLength({
      kind: "cubic",
      from: fromNode,
      to: toNode,
      moveEnd: "to",
      dir: len(tangent) > 1e-6 ? tangent : chord,
      targetLengthPx,
    });
    moveNodeById(toNode.id, mul(norm(len(tangent) > 1e-6 ? tangent : chord), s));
  } else {
    const base = edgeControlPoints("cubic", fromNode, toNode);
    const tangent = sub(base.p1, base.p0);
    const s = solveEndDisplacementForArcLength({
      kind: "cubic",
      from: fromNode,
      to: toNode,
      moveEnd: "from",
      dir: len(tangent) > 1e-6 ? tangent : mul(chord, -1),
      targetLengthPx,
    });
    moveNodeById(fromNode.id, mul(norm(len(tangent) > 1e-6 ? tangent : mul(chord, -1)), s));
  }

  return {
    ...figure,
    nodes: figure.nodes.map((n) => nodesById.get(n.id) ?? n),
  };
}
