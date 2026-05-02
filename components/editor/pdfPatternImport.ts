import type { Figure, FigureNode, NodeMode } from "./types";

const PDF_POINT_TO_PX = 96 / 72;
const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];
const MERGE_TOLERANCE_PX = 1.25;
const MIN_PATH_LENGTH_PX = 10;
const DEFAULT_IMPORTED_MOLD_FILL = "rgba(96,165,250,0.22)";
const VISUAL_BUCKET_QUANTUM_PX = 2;
const VISUAL_DUPLICATE_MAX_DISTANCE_PX = 0.25;
const VISUAL_DUPLICATE_AVG_DISTANCE_PX = 0.05;

type Matrix = [number, number, number, number, number, number];

type StrokeStyle = {
  stroke: string;
  strokeWidth: number;
  dash?: number[];
};

type GraphicsState = {
  ctm: Matrix;
  stroke: string;
  strokeWidth: number;
  dash?: number[];
};

type DraftNode = {
  x: number;
  y: number;
  inHandle?: { x: number; y: number };
  outHandle?: { x: number; y: number };
  mode: NodeMode;
};

type DraftPath = {
  nodes: DraftNode[];
  closed: boolean;
  style: StrokeStyle;
};

type DrawOp = 0 | 1 | 2 | 3 | 4;

export type ImportPdfResult = {
  figures: Figure[];
  rawPathCount: number;
  mergedPathCount: number;
};

let pdfWorkerReadyPromise: Promise<void> | null = null;

type PathBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

type TileStep = {
  stepX: number;
  stepY: number;
};

type ContourPoint = {
  x: number;
  y: number;
};

type VisualContourData = {
  path: DraftPath;
  width: number;
  height: number;
  perimeter: number;
  variants: ContourPoint[][];
};

function makeRuntimeId(prefix: string, index: number) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${index}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${index}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

async function ensurePdfJsWorkerReady() {
  if (pdfWorkerReadyPromise) {
    await pdfWorkerReadyPromise;
    return;
  }

  pdfWorkerReadyPromise = (async () => {
    const workerGlobal = globalThis as typeof globalThis & {
      pdfjsWorker?: { WorkerMessageHandler?: unknown };
    };

    if (workerGlobal.pdfjsWorker?.WorkerMessageHandler) return;

    const workerModule = (await import(
      "pdfjs-dist/legacy/build/pdf.worker.mjs"
    )) as {
      WorkerMessageHandler?: unknown;
    };

    if (
      !workerGlobal.pdfjsWorker?.WorkerMessageHandler &&
      workerModule.WorkerMessageHandler
    ) {
      workerGlobal.pdfjsWorker = {
        WorkerMessageHandler: workerModule.WorkerMessageHandler,
      };
    }
  })();

  await pdfWorkerReadyPromise;
}

function cloneMatrix(matrix: Matrix): Matrix {
  return [...matrix] as Matrix;
}

function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyMatrix(point: { x: number; y: number }, matrix: Matrix) {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: (a * point.x + c * point.y + e) * PDF_POINT_TO_PX,
    y: (b * point.x + d * point.y + f) * PDF_POINT_TO_PX,
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function samePoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  tolerancePx = MERGE_TOLERANCE_PX
) {
  return distance(a, b) <= tolerancePx;
}

function computePathLength(nodes: DraftNode[], closed: boolean) {
  if (nodes.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < nodes.length; index += 1) {
    total += distance(nodes[index - 1]!, nodes[index]!);
  }
  if (closed) {
    total += distance(nodes[nodes.length - 1]!, nodes[0]!);
  }
  return total;
}

function normalizeStrokeColor(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
  }
  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b] = value;
    if (
      typeof r === "number" &&
      typeof g === "number" &&
      typeof b === "number"
    ) {
      const toHex = (channel: number) => {
        const normalized = Math.max(0, Math.min(255, Math.round(channel * 255)));
        return normalized.toString(16).padStart(2, "0");
      };
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
  }
  return "#000000";
}

function isLikelyPatternStroke(stroke: string): boolean {
  const hex = stroke.replace("#", "");
  if (hex.length !== 6) return true;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max <= 72 || max - min <= 18;
}

function styleKey(style: StrokeStyle) {
  const dash = style.dash?.map((value) => value.toFixed(2)).join(",") ?? "solid";
  return `${style.stroke}|${style.strokeWidth.toFixed(2)}|${dash}`;
}

function roundCoord(value: number) {
  return Number(value.toFixed(3));
}

function roundLoose(value: number) {
  return Number(value.toFixed(1));
}

function computePathBounds(path: DraftPath): PathBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of path.nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);

    if (node.inHandle) {
      minX = Math.min(minX, node.inHandle.x);
      minY = Math.min(minY, node.inHandle.y);
      maxX = Math.max(maxX, node.inHandle.x);
      maxY = Math.max(maxY, node.inHandle.y);
    }

    if (node.outHandle) {
      minX = Math.min(minX, node.outHandle.x);
      minY = Math.min(minY, node.outHandle.y);
      maxX = Math.max(maxX, node.outHandle.x);
      maxY = Math.max(maxY, node.outHandle.y);
    }
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function pathFingerprint(path: DraftPath) {
  const serializedNodes = canonicalNodeFingerprint(path, (node, reverse) => {
    const inHandle = reverse ? node.outHandle : node.inHandle;
    const outHandle = reverse ? node.inHandle : node.outHandle;
    const parts = [
      roundCoord(node.x),
      roundCoord(node.y),
      node.mode,
      inHandle ? roundCoord(inHandle.x) : "_",
      inHandle ? roundCoord(inHandle.y) : "_",
      outHandle ? roundCoord(outHandle.x) : "_",
      outHandle ? roundCoord(outHandle.y) : "_",
    ];
    return parts.join(":");
  });
  return `${path.closed ? "closed" : "open"}|${styleKey(path.style)}|${serializedNodes}`;
}

function normalizedGeometryFingerprint(path: DraftPath) {
  const bounds = computePathBounds(path);
  const serializedNodes = canonicalNodeFingerprint(path, (node, reverse) => {
    const inHandle = reverse ? node.outHandle : node.inHandle;
    const outHandle = reverse ? node.inHandle : node.outHandle;
    const parts = [
      roundLoose(node.x - bounds.minX),
      roundLoose(node.y - bounds.minY),
      node.mode,
      inHandle ? roundLoose(inHandle.x - bounds.minX) : "_",
      inHandle ? roundLoose(inHandle.y - bounds.minY) : "_",
      outHandle ? roundLoose(outHandle.x - bounds.minX) : "_",
      outHandle ? roundLoose(outHandle.y - bounds.minY) : "_",
    ];
    return parts.join(":");
  });

  return `${path.closed ? "closed" : "open"}|${styleKey(path.style)}|${serializedNodes}`;
}

function roundVisualCoord(value: number) {
  return Math.round(value);
}

function interpolatePoint(
  start: ContourPoint,
  end: ContourPoint,
  t: number
): ContourPoint {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

function cubicBezierPoint(
  p0: ContourPoint,
  p1: ContourPoint,
  p2: ContourPoint,
  p3: ContourPoint,
  t: number
): ContourPoint {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t * t2;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function samplePathContour(path: DraftPath, stepsPerCubic = 12): ContourPoint[] {
  if (path.nodes.length === 0) return [];

  const points: ContourPoint[] = [];
  const segmentCount = path.closed ? path.nodes.length : path.nodes.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const current = path.nodes[index]!;
    const next = path.nodes[(index + 1) % path.nodes.length]!;

    if (points.length === 0) {
      points.push({ x: current.x, y: current.y });
    }

    const p0 = { x: current.x, y: current.y };
    const p3 = { x: next.x, y: next.y };
    const p1 = current.outHandle ?? p0;
    const p2 = next.inHandle ?? p3;
    const isCurve = Boolean(current.outHandle || next.inHandle);

    if (!isCurve) {
      points.push(p3);
      continue;
    }

    for (let step = 1; step <= stepsPerCubic; step += 1) {
      points.push(cubicBezierPoint(p0, p1, p2, p3, step / stepsPerCubic));
    }
  }

  if (
    path.closed &&
    points.length > 1 &&
    samePoint(points[0]!, points[points.length - 1]!, 0.25)
  ) {
    points.pop();
  }

  return points;
}

function resampleContour(
  points: ContourPoint[],
  closed: boolean,
  targetSamples = 96
): ContourPoint[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));

  const chain = closed ? [...points, points[0]!] : [...points];
  const cumulative = [0];

  for (let index = 1; index < chain.length; index += 1) {
    cumulative.push(
      cumulative[index - 1]! + distance(chain[index - 1]!, chain[index]!)
    );
  }

  const totalLength = cumulative[cumulative.length - 1] ?? 0;
  if (totalLength <= 1e-6) {
    return [{ ...chain[0]! }];
  }

  const sampleCount = closed ? targetSamples : Math.max(2, targetSamples);
  const step = closed
    ? totalLength / sampleCount
    : totalLength / (sampleCount - 1);
  const sampled: ContourPoint[] = [];
  let segmentIndex = 1;

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const targetDistance = closed
      ? sampleIndex * step
      : Math.min(totalLength, sampleIndex * step);

    while (
      segmentIndex < cumulative.length - 1 &&
      cumulative[segmentIndex]! < targetDistance
    ) {
      segmentIndex += 1;
    }

    const start = chain[segmentIndex - 1]!;
    const end = chain[segmentIndex]!;
    const startDistance = cumulative[segmentIndex - 1]!;
    const endDistance = cumulative[segmentIndex]!;
    const span = endDistance - startDistance;
    const t = span <= 1e-6 ? 0 : (targetDistance - startDistance) / span;
    sampled.push(interpolatePoint(start, end, t));
  }

  return sampled;
}

function visualGeometryFingerprint(path: DraftPath) {
  const sampledContour = resampleContour(samplePathContour(path), path.closed);
  if (sampledContour.length === 0) {
    return normalizedGeometryFingerprint(path);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of sampledContour) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const transforms = [
    (point: ContourPoint) => ({ x: point.x - minX, y: point.y - minY }),
    (point: ContourPoint) => ({ x: maxX - point.x, y: point.y - minY }),
    (point: ContourPoint) => ({ x: point.x - minX, y: maxY - point.y }),
    (point: ContourPoint) => ({ x: maxX - point.x, y: maxY - point.y }),
  ];
  const variants: string[] = [];

  for (const transform of transforms) {
    const forward = sampledContour.map((point) => {
      const normalized = transform(point);
      return `${roundVisualCoord(normalized.x)}:${roundVisualCoord(normalized.y)}`;
    });

    if (path.closed) {
      for (let index = 0; index < forward.length; index += 1) {
        variants.push(rotateJoined(forward, index));
      }

      const reversed = [...forward].reverse();
      for (let index = 0; index < reversed.length; index += 1) {
        variants.push(rotateJoined(reversed, index));
      }
      continue;
    }

    variants.push(forward.join("|"));
    variants.push([...forward].reverse().join("|"));
  }

  variants.sort();
  return `${path.closed ? "closed" : "open"}|${styleKey(path.style)}|${variants[0] ?? ""}`;
}

function quantizeVisualMetric(value: number) {
  return Math.round(value / VISUAL_BUCKET_QUANTUM_PX);
}

function computeContourBounds(points: ContourPoint[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function buildVisualContourData(path: DraftPath): VisualContourData {
  const sampledContour = resampleContour(samplePathContour(path), path.closed);
  if (sampledContour.length === 0) {
    return {
      path,
      width: 0,
      height: 0,
      perimeter: 0,
      variants: [[]],
    };
  }

  const bounds = computeContourBounds(sampledContour);
  const variants = [
    sampledContour.map((point) => ({
      x: point.x - bounds.minX,
      y: point.y - bounds.minY,
    })),
    sampledContour.map((point) => ({
      x: bounds.maxX - point.x,
      y: point.y - bounds.minY,
    })),
    sampledContour.map((point) => ({
      x: point.x - bounds.minX,
      y: bounds.maxY - point.y,
    })),
    sampledContour.map((point) => ({
      x: bounds.maxX - point.x,
      y: bounds.maxY - point.y,
    })),
  ];

  return {
    path,
    width: bounds.width,
    height: bounds.height,
    perimeter: computePathLength(sampledContour, path.closed),
    variants,
  };
}

function visualBucketKey(data: VisualContourData) {
  return [
    data.path.closed ? "closed" : "open",
    styleKey(data.path.style),
    quantizeVisualMetric(data.width),
    quantizeVisualMetric(data.height),
    quantizeVisualMetric(data.perimeter),
  ].join("|");
}

function compareContourSequences(
  reference: ContourPoint[],
  candidate: ContourPoint[],
  closed: boolean
) {
  if (reference.length !== candidate.length) {
    return {
      avg: Infinity,
      max: Infinity,
    };
  }

  const length = reference.length;
  const shifts = closed ? length : 1;
  let bestAvg = Infinity;
  let bestMax = Infinity;

  for (let shift = 0; shift < shifts; shift += 1) {
    let total = 0;
    let max = 0;

    for (let index = 0; index < length; index += 1) {
      const candidateIndex = closed ? (index + shift) % length : index;
      const delta = distance(reference[index]!, candidate[candidateIndex]!);
      total += delta;
      max = Math.max(max, delta);

      if (
        max > VISUAL_DUPLICATE_MAX_DISTANCE_PX ||
        total / (index + 1) > VISUAL_DUPLICATE_AVG_DISTANCE_PX
      ) {
        break;
      }
    }

    const avg = total / length;
    if (avg < bestAvg || (avg === bestAvg && max < bestMax)) {
      bestAvg = avg;
      bestMax = max;
    }

    if (
      bestMax <= VISUAL_DUPLICATE_MAX_DISTANCE_PX &&
      bestAvg <= VISUAL_DUPLICATE_AVG_DISTANCE_PX
    ) {
      return {
        avg: bestAvg,
        max: bestMax,
      };
    }
  }

  return {
    avg: bestAvg,
    max: bestMax,
  };
}

function areVisuallyEquivalentPaths(
  left: VisualContourData,
  right: VisualContourData
) {
  if (left.variants[0]?.length !== right.variants[0]?.length) return false;
  if (
    Math.abs(left.width - right.width) > VISUAL_BUCKET_QUANTUM_PX ||
    Math.abs(left.height - right.height) > VISUAL_BUCKET_QUANTUM_PX ||
    Math.abs(left.perimeter - right.perimeter) > VISUAL_BUCKET_QUANTUM_PX
  ) {
    return false;
  }

  const reference = left.variants[0] ?? [];
  const candidates = right.path.closed
    ? right.variants.flatMap((variant) => [variant, [...variant].reverse()])
    : right.variants.flatMap((variant) => [variant, [...variant].reverse()]);

  for (const candidate of candidates) {
    const diff = compareContourSequences(
      reference,
      candidate,
      left.path.closed && right.path.closed
    );
    if (
      diff.max <= VISUAL_DUPLICATE_MAX_DISTANCE_PX &&
      diff.avg <= VISUAL_DUPLICATE_AVG_DISTANCE_PX
    ) {
      return true;
    }
  }

  return false;
}

function pickRepresentativePath(paths: DraftPath[]) {
  return paths.reduce((best, candidate) => {
    const bestLength = computePathLength(best.nodes, best.closed);
    const candidateLength = computePathLength(
      candidate.nodes,
      candidate.closed
    );
    return candidateLength > bestLength ? candidate : best;
  });
}

function collapseGeometryDuplicates(paths: DraftPath[]): DraftPath[] {
  const groups = new Map<string, DraftPath[]>();

  for (const path of paths) {
    const fingerprint = normalizedGeometryFingerprint(path);
    const entries = groups.get(fingerprint);
    if (entries) {
      entries.push(path);
      continue;
    }

    groups.set(fingerprint, [path]);
  }

  return [...groups.values()].map((entries) => pickRepresentativePath(entries));
}

function collapseVisualDuplicates(paths: DraftPath[]): DraftPath[] {
  const exactGroups = new Map<string, DraftPath[]>();

  for (const path of paths) {
    const fingerprint = visualGeometryFingerprint(path);
    const entries = exactGroups.get(fingerprint);
    if (entries) {
      entries.push(path);
      continue;
    }

    exactGroups.set(fingerprint, [path]);
  }

  const exactCollapsed = [...exactGroups.values()].map((entries) =>
    pickRepresentativePath(entries)
  );
  const buckets = new Map<string, VisualContourData[]>();

  for (const path of exactCollapsed) {
    const data = buildVisualContourData(path);
    const key = visualBucketKey(data);
    const entries = buckets.get(key);
    if (entries) {
      entries.push(data);
      continue;
    }

    buckets.set(key, [data]);
  }

  const deduped: DraftPath[] = [];

  for (const entries of buckets.values()) {
    const representatives: VisualContourData[] = [];

    outer: for (const candidate of entries) {
      for (let index = 0; index < representatives.length; index += 1) {
        const current = representatives[index]!;
        if (!areVisuallyEquivalentPaths(current, candidate)) {
          continue;
        }

        const preferred = pickRepresentativePath([
          current.path,
          candidate.path,
        ]);
        if (preferred !== current.path) {
          representatives[index] = buildVisualContourData(preferred);
        }
        continue outer;
      }

      representatives.push(candidate);
    }

    deduped.push(...representatives.map((entry) => entry.path));
  }

  return deduped;
}

function rotateJoined(values: string[], startIndex: number) {
  return values
    .slice(startIndex)
    .concat(values.slice(0, startIndex))
    .join("|");
}

function canonicalNodeFingerprint(
  path: DraftPath,
  serialize: (node: DraftNode, reverse: boolean) => string
) {
  const forward = path.nodes.map((node) => serialize(node, false));
  if (forward.length === 0) return "";

  const variants: string[] = [];

  if (path.closed) {
    for (let index = 0; index < forward.length; index += 1) {
      variants.push(rotateJoined(forward, index));
    }

    const reversed = [...path.nodes]
      .reverse()
      .map((node) => serialize(node, true));
    for (let index = 0; index < reversed.length; index += 1) {
      variants.push(rotateJoined(reversed, index));
    }
  } else {
    variants.push(forward.join("|"));
    variants.push(
      [...path.nodes]
        .reverse()
        .map((node) => serialize(node, true))
        .join("|")
    );
  }

  variants.sort();
  return variants[0] ?? "";
}

function cloneNode(node: DraftNode): DraftNode {
  return {
    x: node.x,
    y: node.y,
    mode: node.mode,
    inHandle: node.inHandle ? { ...node.inHandle } : undefined,
    outHandle: node.outHandle ? { ...node.outHandle } : undefined,
  };
}

function translatePath(path: DraftPath, dx: number, dy: number): DraftPath {
  if (dx === 0 && dy === 0) return path;

  return {
    ...path,
    nodes: path.nodes.map((node) => ({
      ...node,
      x: node.x + dx,
      y: node.y + dy,
      inHandle: node.inHandle
        ? { x: node.inHandle.x + dx, y: node.inHandle.y + dy }
        : undefined,
      outHandle: node.outHandle
        ? { x: node.outHandle.x + dx, y: node.outHandle.y + dy }
        : undefined,
    })),
  };
}

function reversePath(path: DraftPath): DraftPath {
  const nodes = [...path.nodes]
    .reverse()
    .map((node) => ({
      ...cloneNode(node),
      inHandle: node.outHandle ? { ...node.outHandle } : undefined,
      outHandle: node.inHandle ? { ...node.inHandle } : undefined,
    }));
  return { ...path, nodes };
}

function closePath(path: DraftPath): DraftPath {
  if (path.closed || path.nodes.length < 2) return path;
  const first = path.nodes[0]!;
  const last = path.nodes[path.nodes.length - 1]!;
  if (!samePoint(first, last)) {
    return { ...path, closed: true };
  }
  const mergedFirst: DraftNode = {
    ...cloneNode(first),
    inHandle: last.inHandle ? { ...last.inHandle } : first.inHandle,
    outHandle: first.outHandle ? { ...first.outHandle } : last.outHandle,
    mode:
      first.mode === "smooth" || last.mode === "smooth" ? "smooth" : "corner",
  };
  return {
    ...path,
    closed: true,
    nodes: [mergedFirst, ...path.nodes.slice(1, -1).map(cloneNode)],
  };
}

function concatPaths(first: DraftPath, second: DraftPath): DraftPath {
  const joinA = first.nodes[first.nodes.length - 1]!;
  const joinB = second.nodes[0]!;
  const mergedJoin: DraftNode = {
    x: (joinA.x + joinB.x) / 2,
    y: (joinA.y + joinB.y) / 2,
    inHandle: joinA.inHandle ? { ...joinA.inHandle } : joinB.inHandle,
    outHandle: joinB.outHandle ? { ...joinB.outHandle } : joinA.outHandle,
    mode:
      joinA.mode === "smooth" || joinB.mode === "smooth" ? "smooth" : "corner",
  };
  const nodes = [
    ...first.nodes.slice(0, -1).map(cloneNode),
    mergedJoin,
    ...second.nodes.slice(1).map(cloneNode),
  ];
  const merged = {
    ...first,
    nodes,
    closed: false,
  };
  if (nodes.length >= 2 && samePoint(nodes[0]!, nodes[nodes.length - 1]!)) {
    return closePath(merged);
  }
  return merged;
}

function tryMergePaths(a: DraftPath, b: DraftPath): DraftPath | null {
  if (a.closed || b.closed) return null;
  if (styleKey(a.style) !== styleKey(b.style)) return null;

  const aStart = a.nodes[0]!;
  const aEnd = a.nodes[a.nodes.length - 1]!;
  const bStart = b.nodes[0]!;
  const bEnd = b.nodes[b.nodes.length - 1]!;

  if (samePoint(aEnd, bStart)) return concatPaths(a, b);
  if (samePoint(aEnd, bEnd)) return concatPaths(a, reversePath(b));
  if (samePoint(aStart, bStart)) return concatPaths(reversePath(a), b);
  if (samePoint(aStart, bEnd)) return concatPaths(b, a);
  return null;
}

function mergePaths(paths: DraftPath[]): DraftPath[] {
  const queue = [...paths];
  let changed = true;

  while (changed) {
    changed = false;
    outer: for (let index = 0; index < queue.length; index += 1) {
      for (let candidate = index + 1; candidate < queue.length; candidate += 1) {
        const merged = tryMergePaths(queue[index]!, queue[candidate]!);
        if (!merged) continue;
        queue.splice(candidate, 1);
        queue.splice(index, 1, merged);
        changed = true;
        break outer;
      }
    }
  }

  return queue.map((path) => {
    if (
      !path.closed &&
      path.nodes.length >= 2 &&
      samePoint(path.nodes[0]!, path.nodes[path.nodes.length - 1]!)
    ) {
      return closePath(path);
    }
    return path;
  });
}

function dedupePaths(paths: DraftPath[]): DraftPath[] {
  const unique = new Map<string, DraftPath>();

  for (const path of paths) {
    const fingerprint = pathFingerprint(path);
    const existing = unique.get(fingerprint);
    if (!existing) {
      unique.set(fingerprint, path);
      continue;
    }

    if (computePathLength(path.nodes, path.closed) > computePathLength(existing.nodes, existing.closed)) {
      unique.set(fingerprint, path);
    }
  }

  return [...unique.values()];
}

function inferTileStep(paths: DraftPath[]): TileStep | null {
  const groups = new Map<string, { count: number; width: number; height: number }>();

  for (const path of paths) {
    if (!path.closed || path.nodes.length !== 4) continue;
    const bounds = computePathBounds(path);
    if (bounds.width < 200 || bounds.height < 200) continue;

    const key = `${roundLoose(bounds.width)}|${roundLoose(bounds.height)}`;
    const hit = groups.get(key);
    if (hit) {
      hit.count += 1;
      continue;
    }

    groups.set(key, {
      count: 1,
      width: bounds.width,
      height: bounds.height,
    });
  }

  let best: { count: number; width: number; height: number } | null = null;
  for (const group of groups.values()) {
    if (!best || group.count > best.count) {
      best = group;
    }
  }

  if (!best || best.count < 3) return null;
  return { stepX: best.width, stepY: best.height };
}

function isNearInteger(value: number, tolerance = 0.08) {
  return Math.abs(value - Math.round(value)) <= tolerance;
}

function collapseTileDuplicates(paths: DraftPath[], tileStep: TileStep): DraftPath[] {
  const groups = new Map<string, Array<{ path: DraftPath; bounds: PathBounds }>>();

  for (const path of paths) {
    const fingerprint = normalizedGeometryFingerprint(path);
    const entries = groups.get(fingerprint) ?? [];
    entries.push({ path, bounds: computePathBounds(path) });
    groups.set(fingerprint, entries);
  }

  const kept: DraftPath[] = [];
  for (const entries of groups.values()) {
    if (entries.length === 1) {
      kept.push(entries[0]!.path);
      continue;
    }

    const anchor = entries[0]!.bounds;
    const aligned = entries.every(({ bounds }) => {
      const dx = (bounds.minX - anchor.minX) / tileStep.stepX;
      const dy = (bounds.minY - anchor.minY) / tileStep.stepY;
      return isNearInteger(dx) && isNearInteger(dy);
    });

    if (!aligned) {
      kept.push(...entries.map((entry) => entry.path));
      continue;
    }

    kept.push(pickRepresentativePath(entries.map((entry) => entry.path)));
  }

  return kept;
}

function removePageGuidePaths(paths: DraftPath[], tileStep: TileStep): DraftPath[] {
  return paths.filter((path) => {
    if (!path.closed || path.nodes.length !== 4) return true;
    const bounds = computePathBounds(path);
    const sameWidth = Math.abs(bounds.width - tileStep.stepX) <= 2;
    const sameHeight = Math.abs(bounds.height - tileStep.stepY) <= 2;
    return !(sameWidth && sameHeight);
  });
}

function layoutPaths(paths: DraftPath[]): DraftPath[] {
  const H_GAP = 180;
  const V_GAP = 180;
  const MAX_ROW_WIDTH = 5200;

  const entries = paths
    .map((path) => ({ path, bounds: computePathBounds(path) }))
    .sort((left, right) => left.bounds.minY - right.bounds.minY || left.bounds.minX - right.bounds.minX);

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  return entries.map(({ path, bounds }) => {
    if (cursorX > 0 && cursorX + bounds.width > MAX_ROW_WIDTH) {
      cursorX = 0;
      cursorY += rowHeight + V_GAP;
      rowHeight = 0;
    }

    const translated = translatePath(path, cursorX - bounds.minX, cursorY - bounds.minY);
    cursorX += bounds.width + H_GAP;
    rowHeight = Math.max(rowHeight, bounds.height);
    return translated;
  });
}

function buildFigure(path: DraftPath, index: number): Figure {
  const nodeIds = path.nodes.map(
    (_, nodeIndex) => makeRuntimeId(`pdf_node_${index}_${nodeIndex}`, nodeIndex)
  );

  const nodes: FigureNode[] = path.nodes.map((node, nodeIndex) => ({
    id: nodeIds[nodeIndex]!,
    x: node.x,
    y: node.y,
    mode: node.mode,
    inHandle: node.inHandle ? { ...node.inHandle } : undefined,
    outHandle: node.outHandle ? { ...node.outHandle } : undefined,
  }));

  const edges = nodes.slice(1).map((node, nodeIndex) => ({
    id: makeRuntimeId(`pdf_edge_${index}_${nodeIndex}`, nodeIndex),
    from: nodes[nodeIndex]!.id,
    to: node.id,
    kind:
      nodes[nodeIndex]!.outHandle || node.inHandle
        ? ("cubic" as const)
        : ("line" as const),
  }));

  if (path.closed && nodes.length >= 2) {
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    edges.push({
      id: makeRuntimeId(`pdf_edge_${index}_close`, index),
      from: last.id,
      to: first.id,
      kind: last.outHandle || first.inHandle ? "cubic" : "line",
    });
  }

  const dash = path.style.dash?.length ? [...path.style.dash] : undefined;

  return {
    id: makeRuntimeId(`pdf_fig_${index}`, index),
    tool: edges.some((edge) => edge.kind === "cubic") ? "curve" : "line",
    kind: "mold",
    moldMeta: {
      visible: true,
      printEnabled: true,
      cutQuantity: 1,
      cutOnFold: false,
      sourceMode: "fromMold",
      lineage: {
        depth: 0,
      },
    },
    x: 0,
    y: 0,
    rotation: 0,
    stroke: path.style.stroke,
    strokeWidth: Math.max(1, path.style.strokeWidth),
    fill: DEFAULT_IMPORTED_MOLD_FILL,
    opacity: 1,
    dash,
    nodes,
    edges,
    closed: true,
  } satisfies Figure;
}

function createDefaultState(): GraphicsState {
  return {
    ctm: cloneMatrix(IDENTITY_MATRIX),
    stroke: "#000000",
    strokeWidth: 1,
    dash: undefined,
  };
}

function consumeDrawBuffer(
  commands: Float32Array,
  matrix: Matrix,
  style: StrokeStyle
): DraftPath[] {
  const paths: DraftPath[] = [];
  let index = 0;
  let current: DraftPath | null = null;

  const pushCurrent = () => {
    if (!current || current.nodes.length < 2) {
      current = null;
      return;
    }
    if (computePathLength(current.nodes, current.closed) < MIN_PATH_LENGTH_PX) {
      current = null;
      return;
    }
    paths.push(current);
    current = null;
  };

  while (index < commands.length) {
    const op = commands[index] as DrawOp;
    index += 1;

    if (op === 0) {
      pushCurrent();
      const point = applyMatrix(
        { x: commands[index]!, y: commands[index + 1]! },
        matrix
      );
      index += 2;
      const node: DraftNode = { ...point, mode: "corner" };
      current = { nodes: [node], closed: false, style };
      continue;
    }

    if (!current) {
      if (op === 1) index += 2;
      else if (op === 2) index += 6;
      continue;
    }

    if (op === 1) {
      const point = applyMatrix(
        { x: commands[index]!, y: commands[index + 1]! },
        matrix
      );
      index += 2;
      current.nodes.push({ ...point, mode: "corner" });
      continue;
    }

    if (op === 2) {
      const control1 = applyMatrix(
        { x: commands[index]!, y: commands[index + 1]! },
        matrix
      );
      const control2 = applyMatrix(
        { x: commands[index + 2]!, y: commands[index + 3]! },
        matrix
      );
      const point = applyMatrix(
        { x: commands[index + 4]!, y: commands[index + 5]! },
        matrix
      );
      index += 6;
      const previousNode = current.nodes[current.nodes.length - 1]!;
      previousNode.outHandle = control1;
      previousNode.mode = "smooth";
      current.nodes.push({
        ...point,
        inHandle: control2,
        mode: "smooth",
      });
      continue;
    }

    if (op === 4) {
      current.closed = true;
      pushCurrent();
    }
  }

  pushCurrent();
  return paths;
}

export async function importPatternPdf(file: File): Promise<ImportPdfResult> {
  await ensurePdfJsWorkerReady();

  const pdfjs = (await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  )) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
  }).promise;

  const collected: DraftPath[] = [];
  const strokeOps = new Set<number>([
    pdfjs.OPS.stroke,
    pdfjs.OPS.closeStroke,
    pdfjs.OPS.fillStroke,
    pdfjs.OPS.eoFillStroke,
    pdfjs.OPS.closeFillStroke,
    pdfjs.OPS.closeEOFillStroke,
  ]);

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const operatorList = await page.getOperatorList();
    const stack: GraphicsState[] = [];
    let state = createDefaultState();

    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      const fn = operatorList.fnArray[index]!;
      const args = operatorList.argsArray[index] ?? [];

      switch (fn) {
        case pdfjs.OPS.save:
          stack.push({
            ctm: cloneMatrix(state.ctm),
            stroke: state.stroke,
            strokeWidth: state.strokeWidth,
            dash: state.dash ? [...state.dash] : undefined,
          });
          break;
        case pdfjs.OPS.restore:
          state = stack.pop() ?? createDefaultState();
          break;
        case pdfjs.OPS.transform:
          if (args.length >= 6) {
            state = {
              ...state,
              ctm: multiplyMatrices(state.ctm, [
                Number(args[0]),
                Number(args[1]),
                Number(args[2]),
                Number(args[3]),
                Number(args[4]),
                Number(args[5]),
              ]),
            };
          }
          break;
        case pdfjs.OPS.setStrokeRGBColor:
          state = { ...state, stroke: normalizeStrokeColor(args[0]) };
          break;
        case pdfjs.OPS.setStrokeGray: {
          const gray = typeof args[0] === "number" ? Number(args[0]) : 0;
          const value = Math.max(0, Math.min(255, Math.round(gray * 255)));
          const hex = value.toString(16).padStart(2, "0");
          state = { ...state, stroke: `#${hex}${hex}${hex}` };
          break;
        }
        case pdfjs.OPS.setLineWidth:
          state = {
            ...state,
            strokeWidth: Math.max(0.75, Number(args[0]) * PDF_POINT_TO_PX),
          };
          break;
        case pdfjs.OPS.setDash:
          state = {
            ...state,
            dash: Array.isArray(args[0])
              ? args[0]
                  .map((value) => Number(value) * PDF_POINT_TO_PX)
                  .filter((value) => Number.isFinite(value) && value > 0)
              : undefined,
          };
          break;
        case pdfjs.OPS.constructPath: {
          const paintOp = Number(args[0]);
          if (!strokeOps.has(paintOp)) break;
          if (!isLikelyPatternStroke(state.stroke)) break;

          const buffers = Array.isArray(args[1]) ? args[1] : [];
          for (const buffer of buffers) {
            if (!(buffer instanceof Float32Array)) continue;
            const pagePaths = consumeDrawBuffer(buffer, state.ctm, {
              stroke: state.stroke,
              strokeWidth: state.strokeWidth,
              dash:
                state.dash && state.dash.length > 0
                  ? [...state.dash]
                  : undefined,
            });
            collected.push(
              ...pagePaths
            );
          }
          break;
        }
      }
    }
  }

  const exactDeduped = dedupePaths(collected);
  const tileStep = inferTileStep(exactDeduped);
  const tileCollapsed = tileStep
    ? collapseTileDuplicates(exactDeduped, tileStep)
    : exactDeduped;
  const withoutPageGuides = tileStep
    ? removePageGuidePaths(tileCollapsed, tileStep)
    : tileCollapsed;
  const merged = mergePaths(withoutPageGuides);
  const mergedExactDeduped = dedupePaths(merged);
  const mergedGeometryDeduped = collapseGeometryDuplicates(mergedExactDeduped);
  const mergedTileCollapsed = tileStep
    ? collapseTileDuplicates(mergedGeometryDeduped, tileStep)
    : mergedGeometryDeduped;
  const finalDeduped = collapseGeometryDuplicates(mergedTileCollapsed);
  const moldPaths = finalDeduped.filter((path) => path.closed);
  const visuallyDedupedMolds = collapseVisualDuplicates(moldPaths);
  const mergedPaths = layoutPaths(visuallyDedupedMolds).filter(
    (path) =>
      path.nodes.length >= 3 &&
      computePathLength(path.nodes, path.closed) >= MIN_PATH_LENGTH_PX
  );

  return {
    figures: mergedPaths.map((path, index) => buildFigure(path, index)),
    rawPathCount: collected.length,
    mergedPathCount: mergedPaths.length,
  };
}