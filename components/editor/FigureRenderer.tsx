import React from "react";
import { Group, Line, Rect, Text } from "react-konva";
import Konva from "konva";
import { Figure } from "./types";
import { edgeLocalPoints, figureLocalPolyline } from "./figurePath";
import { figureCentroidLocal } from "./figurePath";
import { computeMoldDocLayoutLocal } from "./moldDoc";
import { PX_PER_CM } from "./constants";
import { MemoizedNodeOverlay } from "./NodeOverlay";
import { MemoizedMeasureOverlay } from "./MeasureOverlay";
import { MemoizedSeamLabel } from "./SeamLabel";
import { MemoizedDartOverlay } from "./DartOverlay";
import { SelectedEdge } from "./EditorContext";
import type { PointLabelsMode } from "./types";
import {
  getOuterLoopEdgeSequence,
  getOuterLoopPolygon,
  hasClosedLoop,
} from "./seamFigure";

const HANDLE_BASE_OPACITY = 0.35;

/**
 * Square drag handle for the name/doc block with hover feedback: shows a
 * "grab" cursor and pulses (scale + opacity) while the pointer is over it, so
 * it reads as grabbable. The pulse animates the Konva node directly (no React
 * re-renders) and runs only while hovered. The rect is anchored on its CENTER
 * (x/y + offset) so the pulse scales in place.
 */
const PulsingHandleRect: React.FC<{
  /** Center x/y, in the parent group's coords. */
  x: number;
  y?: number;
  size: number;
  fill: string;
  cornerRadius: number;
  /** Konva node name; the stage pointer guard must know it. */
  name?: string;
  /** Second function of the handle (e.g. enter the inner transform mode). */
  onDblClick?: () => void;
}> = ({
  x,
  y = 0,
  size,
  fill,
  cornerRadius,
  name = "inaa-figure-name-handle",
  onDblClick,
}) => {
  const rectRef = React.useRef<Konva.Rect>(null);
  const animRef = React.useRef<Konva.Animation | null>(null);
  const hoverStageRef = React.useRef<Konva.Stage | null>(null);

  const stopPulse = React.useCallback(() => {
    animRef.current?.stop();
    animRef.current = null;
    const node = rectRef.current;
    if (node) {
      node.scale({ x: 1, y: 1 });
      node.opacity(HANDLE_BASE_OPACITY);
      node.getLayer()?.batchDraw();
    }
    const container = hoverStageRef.current?.container();
    if (container) container.style.cursor = "";
    hoverStageRef.current = null;
  }, []);

  // Stop the animation and restore the cursor if the handle unmounts while
  // hovered (e.g. the figure gets deselected under the pointer).
  React.useEffect(() => stopPulse, [stopPulse]);

  return (
    <Rect
      ref={rectRef}
      x={x}
      y={y}
      offsetX={size / 2}
      offsetY={size / 2}
      width={size}
      height={size}
      fill={fill}
      opacity={HANDLE_BASE_OPACITY}
      cornerRadius={cornerRadius}
      listening={true}
      name={name}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        hoverStageRef.current = stage;
        const container = stage?.container();
        if (container) container.style.cursor = "grab";
        const node = rectRef.current;
        const layer = node?.getLayer();
        if (!node || !layer || animRef.current) return;
        const anim = new Konva.Animation((frame) => {
          if (!frame) return;
          // 1.4s cycle: scale 1 -> 1.4 -> 1, opacity 0.35 -> 0.8 -> 0.35.
          const phase = 0.5 - 0.5 * Math.cos((frame.time / 700) * Math.PI);
          node.scale({ x: 1 + 0.4 * phase, y: 1 + 0.4 * phase });
          node.opacity(
            HANDLE_BASE_OPACITY + (0.8 - HANDLE_BASE_OPACITY) * phase
          );
        }, layer);
        animRef.current = anim;
        anim.start();
      }}
      onMouseLeave={stopPulse}
      onDblClick={(e) => {
        e.cancelBubble = true;
        onDblClick?.();
      }}
      onDblTap={(e) => {
        e.cancelBubble = true;
        onDblClick?.();
      }}
    />
  );
};

interface FigureRendererProps {
  figure: Figure;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  dash?: number[];
  hitStrokeWidth: number;
  hitFillEnabled?: boolean;
  listening?: boolean;
  draggable?: boolean;
  onPointerDown?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  forwardRef?: (node: Konva.Group | null) => void;
  name?: string;
  showNodes?: boolean;
  nodeStrokeOverride?: string;
  showMeasures?: boolean;
  pointLabelsMode?: PointLabelsMode;
  pointLabelsByNodeId?: Record<string, string> | null;
  showSeamLabel?: boolean;
  seamBaseCentroidLocal?: { x: number; y: number } | null;
  isDark?: boolean;
  selectedEdge?: SelectedEdge | null;
  hoveredEdge?: { figureId: string; edgeId: string } | null;
  hoveredSelectEdge?: { figureId: string; edgeId: string } | null;

  hoveredPiqueId?: string | null;

  // Figure name label handle (drag to reposition)
  showNameHandle?: boolean;
  onNameOffsetChange?: (
    figureId: string,
    nextOffsetLocal: { x: number; y: number }
  ) => void;
  onNameOffsetCommit?: (
    figureId: string,
    nextOffsetLocal: { x: number; y: number }
  ) => void;
  // Mold grain arrow handle (drag to reposition the arrow independently of
  // the doc text block). Offset is relative to the figure centroid.
  onGrainOffsetChange?: (
    figureId: string,
    nextOffsetLocal: { x: number; y: number }
  ) => void;
  onGrainOffsetCommit?: (
    figureId: string,
    nextOffsetLocal: { x: number; y: number }
  ) => void;
  // Inner transform mode (double-click on a handle): which inner element of
  // THIS figure currently owns the dedicated inner Transformer. While set,
  // the pulse handles hide and an invisible transformable proxy is rendered.
  innerTransformKind?: "doc" | "grain" | null;
  onNameHandleDblClick?: (figureId: string) => void;
  onGrainHandleDblClick?: (figureId: string) => void;
}

const DENSE_LINEAR_CONTOUR_THRESHOLD = 96;

// Points sampled per cubic edge for the on-screen stroke/fill. 60 was far more
// than needed (a circle = 4 cubics = ~240 pts); 40 stays visually smooth while
// cutting CPU/GPU vertex work by a third. Kept zoom-independent on purpose so
// the polyline useMemo is not invalidated on every zoom step.
const RENDER_CUBIC_STEPS = 40;

type Vec2 = { x: number; y: number };

function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function mul(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

function perp(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

function norm(v: Vec2): Vec2 {
  const l = len(v);
  if (!Number.isFinite(l) || l < 1e-6) return { x: 0, y: 0 };
  return mul(v, 1 / l);
}

function pointAndTangentAtT01(
  points: Vec2[],
  t01: number
): { point: Vec2; tangentUnit: Vec2 } | null {
  if (points.length < 2) return null;
  const t = Math.max(0, Math.min(1, t01));

  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const l = len(sub(points[i + 1], points[i]));
    segLens.push(l);
    total += l;
  }
  if (!Number.isFinite(total) || total < 1e-6) {
    const v = sub(points[points.length - 1], points[0]);
    return { point: points[0], tangentUnit: norm(v) };
  }

  const targetS = t * total;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    const l = segLens[i];
    if (acc + l >= targetS || i === segLens.length - 1) {
      const a = points[i];
      const b = points[i + 1];
      const u = l > 1e-6 ? (targetS - acc) / l : 0;
      const point = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      const tangentUnit = norm(sub(b, a));
      return { point, tangentUnit };
    }
    acc += l;
  }

  const v = sub(points[points.length - 1], points[points.length - 2]);
  return { point: points[points.length - 1], tangentUnit: norm(v) };
}

function resolveAci7(isDark: boolean): string {
  return isDark ? "#ffffff" : "#000000";
}

function resolveStrokeColor(
  stroke: string | undefined,
  isDark: boolean,
  mode?: "auto" | "solid"
): string {
  if (!stroke) return resolveAci7(isDark);
  const s = stroke.toLowerCase();
  if (s === "aci7") return resolveAci7(isDark);
  if (mode === "solid") return stroke;
  // Back-compat: older projects defaulted to black; treat that as "auto".
  if (s === "#000" || s === "#000000") return resolveAci7(isDark);
  return stroke;
}

function hasVisibleFill(fill: string | undefined): boolean {
  if (!fill) return false;
  const s = fill.trim().toLowerCase();
  if (s === "transparent") return false;
  if (/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(\.0+)?\s*\)$/.test(s)) {
    return false;
  }
  if (/^#([0-9a-f]{8})$/.test(s) && s.endsWith("00")) {
    return false;
  }
  return true;
}

function buildSampledOuterLoopContour(
  figure: Figure,
  cubicSteps: number
): number[] {
  const orderedEdgeIds = getOuterLoopEdgeSequence(figure);
  if (orderedEdgeIds.length < 3) return [];

  const edgeById = new Map(figure.edges.map((e) => [e.id, e]));
  const orderedEdges = orderedEdgeIds
    .map((id) => edgeById.get(id) ?? null)
    .filter((e): e is NonNullable<typeof e> => !!e);
  if (orderedEdges.length < 3) return [];

  const oriented: Array<{ edge: Figure["edges"][number]; forward: boolean }> =
    [];
  let firstStartNodeId: string | null = null;
  let prevEndNodeId: string | null = null;

  for (let i = 0; i < orderedEdges.length; i++) {
    const edge = orderedEdges[i]!;
    const nextEdge = i + 1 < orderedEdges.length ? orderedEdges[i + 1]! : null;

    let forward = true;
    if (i === 0) {
      if (nextEdge) {
        const nextEndpoints = new Set([nextEdge.from, nextEdge.to]);
        const forwardMatchesNext = nextEndpoints.has(edge.to);
        const reverseMatchesNext = nextEndpoints.has(edge.from);
        if (!forwardMatchesNext && reverseMatchesNext) {
          forward = false;
        }
      }
      firstStartNodeId = forward ? edge.from : edge.to;
      prevEndNodeId = forward ? edge.to : edge.from;
    } else {
      if (prevEndNodeId === edge.from) {
        forward = true;
      } else if (prevEndNodeId === edge.to) {
        forward = false;
      } else if (nextEdge) {
        const nextEndpoints = new Set([nextEdge.from, nextEdge.to]);
        const forwardMatchesNext = nextEndpoints.has(edge.to);
        const reverseMatchesNext = nextEndpoints.has(edge.from);
        if (!forwardMatchesNext && reverseMatchesNext) {
          forward = false;
        } else if (forwardMatchesNext && !reverseMatchesNext) {
          forward = true;
        }
      } else if (firstStartNodeId) {
        if (edge.to === firstStartNodeId) forward = true;
        else if (edge.from === firstStartNodeId) forward = false;
      }

      prevEndNodeId = forward ? edge.to : edge.from;
    }

    oriented.push({ edge, forward });
  }

  const out: number[] = [];
  for (const seg of oriented) {
    const edgePts = edgeLocalPoints(
      figure,
      seg.edge,
      seg.edge.kind === "line" ? 2 : cubicSteps
    );
    if (edgePts.length < 2) continue;
    const ordered = seg.forward ? edgePts : [...edgePts].reverse();
    const from = out.length === 0 ? 0 : 1;
    for (let i = from; i < ordered.length; i++) {
      out.push(ordered[i]!.x, ordered[i]!.y);
    }
  }

  if (out.length < 6) return [];
  const fx = out[0]!;
  const fy = out[1]!;
  const lx = out[out.length - 2]!;
  const ly = out[out.length - 1]!;
  if (Math.hypot(fx - lx, fy - ly) < 1e-6) {
    out.splice(out.length - 2, 2);
  }
  return out.length >= 6 ? out : [];
}

const FigureRenderer = ({
  figure,
  x,
  y,
  rotation,
  scale,
  stroke,
  strokeWidth,
  opacity,
  dash,
  hitStrokeWidth,
  hitFillEnabled = true,
  listening = true,
  draggable,
  onPointerDown,
  onDragStart,
  onDragMove,
  onDragEnd,
  forwardRef,
  name,
  showNodes,
  nodeStrokeOverride,
  showMeasures,
  pointLabelsMode = "off",
  pointLabelsByNodeId = null,
  showSeamLabel,
  seamBaseCentroidLocal,
  isDark = false,
  selectedEdge = null,
  hoveredEdge = null,
  hoveredSelectEdge = null,
  hoveredPiqueId = null,
  showNameHandle,
  onNameOffsetChange,
  onNameOffsetCommit,
  onGrainOffsetChange,
  onGrainOffsetCommit,
  innerTransformKind,
  onNameHandleDblClick,
  onGrainHandleDblClick,
}: FigureRendererProps) => {
  const isTextFigure = figure.tool === "text";
  const supportsPiques =
    (figure.piques?.length ?? 0) > 0 || figure.closed || hasClosedLoop(figure);
  const isDenseLinearContour =
    figure.closed &&
    figure.edges.length >= DENSE_LINEAR_CONTOUR_THRESHOLD &&
    figure.edges.every((e) => e.kind === "line");
  const contourLineCap: "round" | "butt" = isDenseLinearContour
    ? "butt"
    : "round";
  const contourLineJoin: "round" | "miter" = isDenseLinearContour
    ? "miter"
    : "round";

  // Compute polyline data. For figures with branches (e.g., merged figures
  // with a line coming off an edge), we need to render edge-by-edge instead
  // of a single polyline.
  const { pts, contourPts, isSimpleContour, edgeSegments } = React.useMemo<{
    pts: number[];
    contourPts: number[];
    isSimpleContour: boolean;
    edgeSegments: Array<{ edgeId: string; points: number[] }>;
  }>(() => {
    if (isTextFigure) {
      return {
        pts: [],
        contourPts: [],
        isSimpleContour: true,
        edgeSegments: [],
      };
    }
    const polyPts = figureLocalPolyline(figure, RENDER_CUBIC_STEPS);

    // Check if any node has degree > 2 (branching). If so, the standard
    // polyline traversal will fail, so we render edge-by-edge instead.
    const degree = new Map<string, number>();
    for (const e of figure.edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const hasBranch = Array.from(degree.values()).some((d) => d > 2);
    const degree1Count = Array.from(degree.values()).filter(
      (d) => d === 1
    ).length;
    const forceSegments =
      figure.tool === "line" && figure.edges.length > 1 && !figure.closed;
    const isOrderedPath = figure.edges.every((edge, idx) => {
      if (idx === 0) return true;
      return figure.edges[idx - 1].to === edge.from;
    });
    const isOrderedOpen = !figure.closed && degree1Count === 2 && isOrderedPath;
    const isOrderedClosed =
      figure.closed &&
      degree1Count === 0 &&
      isOrderedPath &&
      figure.edges.length > 1 &&
      figure.edges[figure.edges.length - 1].to === figure.edges[0].from;

    if (!forceSegments && !hasBranch && (isOrderedOpen || isOrderedClosed)) {
      // Ordered simple contour: figureLocalPolyline already returns the full
      // loop, so reuse it for both stroke and fill instead of walking the outer
      // loop a second time (the old buildSampledOuterLoopContour pass).
      return {
        pts: polyPts,
        contourPts: polyPts,
        isSimpleContour: true,
        edgeSegments: [],
      };
    }

    // Branch / unordered case only: the fill needs an outer-loop contour.
    const outerLoopPts = (() => {
      if (!figure.closed) return [] as number[];
      const sampled = buildSampledOuterLoopContour(figure, RENDER_CUBIC_STEPS);
      if (sampled.length >= 6) return sampled;
      const outer = getOuterLoopPolygon(figure);
      if (outer.length < 3) return [] as number[];
      const flat: number[] = [];
      for (const p of outer) flat.push(p.x, p.y);
      return flat.length >= 6 ? flat : [];
    })();

    // Figure has branches - render each edge separately
    const segments: Array<{ edgeId: string; points: number[] }> = [];
    for (const edge of figure.edges) {
      const edgePts = edgeLocalPoints(
        figure,
        edge,
        edge.kind === "line" ? 2 : RENDER_CUBIC_STEPS
      );
      if (edgePts.length >= 2) {
        const flat: number[] = [];
        for (const p of edgePts) {
          flat.push(p.x, p.y);
        }
        segments.push({ edgeId: edge.id, points: flat });
      }
    }
    return {
      pts: [],
      contourPts: outerLoopPts.length >= 6 ? outerLoopPts : polyPts,
      isSimpleContour: false,
      edgeSegments: segments,
    };
  }, [figure, isTextFigure]);

  const pointLabelFill = resolveAci7(isDark);
  const pointLabelOpacity = 0.35;
  const pointLabelFontSize = 15 / scale;
  const pointLabelOffsetDist = 14 / scale;

  const figureName = figure.kind === "seam" ? "" : (figure.name ?? "").trim();
  const nameFontSizePx = (() => {
    const v = figure.nameFontSizePx;
    if (!Number.isFinite(v ?? NaN)) return 24;
    return Math.max(6, Math.min(256, v as number));
  })();
  const nameRotationDeg = (() => {
    const v = figure.nameRotationDeg;
    if (!Number.isFinite(v ?? NaN)) return 0;
    // Keep it bounded (purely for stability/serialization).
    const m = ((v as number) % 360) + 360;
    return m % 360;
  })();
  const nameOffsetLocal = figure.nameOffsetLocal ?? { x: 0, y: 0 };
  const nameFill = pointLabelFill;
  const nameOpacity = 0.22;

  const estimateNameWidth = React.useCallback(
    (text: string, fontSize: number) => {
      // Konva clips to `width`, so keep this generous to avoid truncation.
      // We allow overflow (no auto-fit), so this width is only for centering/alignment.
      return Math.max(12, text.length * fontSize * 0.8 + fontSize * 1.5);
    },
    []
  );

  const estimateNameTightWidth = React.useCallback(
    (text: string, fontSize: number) => {
      // Tighter estimate for positioning the drag handle near the text end.
      return Math.max(12, text.length * fontSize * 0.65);
    },
    []
  );

  const nameLayout = React.useMemo(() => {
    if (!figureName) return null;

    const localPts = pts;
    const centroid = figureCentroidLocal(figure);

    const offsetX = Number.isFinite(nameOffsetLocal.x) ? nameOffsetLocal.x : 0;
    const offsetY = Number.isFinite(nameOffsetLocal.y) ? nameOffsetLocal.y : 0;

    if (figure.closed) {
      const fontSize = nameFontSizePx;
      const width = estimateNameWidth(figureName, fontSize);
      const textTightWidthApprox = estimateNameTightWidth(figureName, fontSize);

      return {
        baseX: centroid.x,
        baseY: centroid.y,
        x: centroid.x + offsetX,
        y: centroid.y + offsetY,
        rotation: 0,
        fontSize,
        width,
        textWidthApprox: width,
        textTightWidthApprox,
        align: "center" as const,
      };
    }

    // Open figures: place near the midpoint of the polyline, offset outward.
    if (localPts.length >= 8) {
      const midIdx = Math.floor(localPts.length / 4) * 2;
      const px = localPts[midIdx];
      const py = localPts[midIdx + 1];
      const prevX = localPts[Math.max(0, midIdx - 2)];
      const prevY = localPts[Math.max(1, midIdx - 1)];
      const nextX = localPts[Math.min(localPts.length - 2, midIdx + 2)];
      const nextY = localPts[Math.min(localPts.length - 1, midIdx + 3)];
      const dx = nextX - prevX;
      const dy = nextY - prevY;
      const len = Math.hypot(dx, dy);
      const n = len > 1e-6 ? { x: -dy / len, y: dx / len } : { x: 0, y: -1 };
      const offset = 18;
      const fontSize = nameFontSizePx;
      const width = estimateNameWidth(figureName, fontSize);
      const textTightWidthApprox = estimateNameTightWidth(figureName, fontSize);

      return {
        baseX: px + n.x * offset * -1,
        baseY: py + n.y * offset * -1,
        x: px + n.x * offset * -1 + offsetX,
        y: py + n.y * offset * -1 + offsetY,
        rotation: 0,
        fontSize,
        width,
        textWidthApprox: width,
        textTightWidthApprox,
        align: "center" as const,
      };
    }

    const fontSize = nameFontSizePx;
    const width = estimateNameWidth(figureName, fontSize);
    const textTightWidthApprox = estimateNameTightWidth(figureName, fontSize);
    return {
      baseX: centroid.x,
      baseY: centroid.y - 18,
      x: centroid.x + offsetX,
      y: centroid.y - 18 + offsetY,
      rotation: 0,
      fontSize,
      width,
      textWidthApprox: width,
      textTightWidthApprox,
      align: "center" as const,
    };
  }, [
    estimateNameTightWidth,
    estimateNameWidth,
    figure,
    figureName,
    nameFontSizePx,
    nameOffsetLocal.x,
    nameOffsetLocal.y,
    pts,
  ]);

  // Consolidated documentation block + grain arrow for molds. Replaces the
  // plain name label below when figure.kind === "mold".
  const moldDocLayout = React.useMemo(
    () => (figure.kind === "mold" ? computeMoldDocLayoutLocal(figure) : null),
    [figure]
  );
  const moldDocBase = React.useMemo(() => {
    if (!moldDocLayout) return null;
    const offset = figure.nameOffsetLocal ?? { x: 0, y: 0 };
    const ox = Number.isFinite(offset.x) ? offset.x : 0;
    const oy = Number.isFinite(offset.y) ? offset.y : 0;
    return { x: moldDocLayout.anchor.x - ox, y: moldDocLayout.anchor.y - oy };
  }, [moldDocLayout, figure.nameOffsetLocal]);

  const handleSize = 10 / scale;
  const handleGap = 6 / scale;

  // Grain arrow handle: parked just past the arrow's TAIL (never on the
  // shaft). `center` is the drag group's anchor; `handleRel` the rect's
  // position inside it.
  const grainHandle = React.useMemo(() => {
    const g = moldDocLayout?.grain;
    if (!g) return null;
    const center = {
      x: (g.tail.x + g.tip.x) / 2,
      y: (g.tail.y + g.tip.y) / 2,
    };
    const tailRel = { x: g.tail.x - center.x, y: g.tail.y - center.y };
    const len = Math.hypot(tailRel.x, tailRel.y) || 1;
    const past = handleGap + handleSize / 2;
    return {
      center,
      handleRel: {
        x: tailRel.x + (tailRel.x / len) * past,
        y: tailRel.y + (tailRel.y / len) * past,
      },
    };
  }, [moldDocLayout, handleGap, handleSize]);

  // Box of the grain arrow for the inner-transform proxy (length along the
  // arrow, width spanning the head wings).
  const grainProxy = React.useMemo(() => {
    const g = moldDocLayout?.grain;
    if (!g) return null;
    return {
      center: {
        x: (g.tail.x + g.tip.x) / 2,
        y: (g.tail.y + g.tip.y) / 2,
      },
      length: Math.hypot(g.tip.x - g.tail.x, g.tip.y - g.tail.y),
      width: Math.max(
        Math.hypot(g.headA.x - g.headB.x, g.headA.y - g.headB.y),
        12 / scale
      ),
      rotationDeg:
        (((figure.moldMeta?.grainline?.angleDeg ?? 0) % 360) + 360) % 360,
    };
  }, [moldDocLayout, scale, figure.moldMeta?.grainline?.angleDeg]);

  const hasEdgeStrokeOverrides = figure.edges.some((edge) => !!edge.stroke);

  const renderEdgeStrokeLines = React.useCallback(() => {
    return figure.edges.map((edge) => {
      const edgePts = edgeLocalPoints(
        figure,
        edge,
        edge.kind === "line" ? 2 : 60
      );
      if (edgePts.length < 2) return null;
      const flat: number[] = [];
      for (const p of edgePts) flat.push(p.x, p.y);
      return (
        <Line
          key={`edge-stroke:${figure.id}:${edge.id}`}
          points={flat}
          stroke={resolveStrokeColor(
            edge.stroke ?? figure.stroke,
            isDark,
            edge.stroke ? "solid" : figure.strokeMode
          )}
          strokeWidth={strokeWidth}
          fill={"transparent"}
          fillEnabled={false}
          closed={false}
          dash={dash}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={hitStrokeWidth}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
          listening={listening}
        />
      );
    });
  }, [dash, figure, hitStrokeWidth, isDark, listening, strokeWidth]);

  const textValue = (figure.textValue ?? "").toString();
  const textFontSizePx = (() => {
    const v = figure.textFontSizePx;
    if (!Number.isFinite(v ?? NaN)) return 18;
    return Math.max(6, Math.min(300, v as number));
  })();
  const textFontFamily =
    figure.textFontFamily ??
    "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  const textAlign = figure.textAlign ?? "left";
  const textFill =
    figure.textFill ??
    resolveStrokeColor(figure.stroke, isDark, figure.strokeMode);
  const textLineHeight = (() => {
    const v = figure.textLineHeight;
    if (!Number.isFinite(v ?? NaN)) return 1.25;
    return Math.max(0.8, Math.min(3, v as number));
  })();
  const textLetterSpacing = (() => {
    const v = figure.textLetterSpacing;
    if (!Number.isFinite(v ?? NaN)) return 0;
    return Math.max(-2, Math.min(20, v as number));
  })();
  const textWrap = figure.textWrap ?? "word";
  const textWidthPx =
    Number.isFinite(figure.textWidthPx ?? NaN) && (figure.textWidthPx ?? 0) > 0
      ? (figure.textWidthPx as number)
      : undefined;
  const textPaddingPx = (() => {
    const v = figure.textPaddingPx;
    if (!Number.isFinite(v ?? NaN)) return 0;
    return Math.max(0, Math.min(50, v as number));
  })();
  const textBgEnabled = figure.textBackgroundEnabled === true;
  const textBgFill = figure.textBackgroundFill ?? "#ffffff";
  const textBgOpacity = (() => {
    const v = figure.textBackgroundOpacity;
    if (!Number.isFinite(v ?? NaN)) return 1;
    return Math.max(0, Math.min(1, v as number));
  })();

  if (isTextFigure) {
    return (
      <Group
        name={name}
        ref={forwardRef}
        x={x}
        y={y}
        rotation={rotation}
        opacity={opacity}
        listening={listening}
        draggable={draggable}
        onPointerDown={onPointerDown}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      >
        {textBgEnabled ? (
          <Rect
            x={-textPaddingPx}
            y={-textPaddingPx}
            width={(textWidthPx ?? 1) + textPaddingPx * 2}
            height={textFontSizePx * textLineHeight + textPaddingPx * 2}
            fill={textBgFill}
            opacity={textBgOpacity}
            listening={false}
            perfectDrawEnabled={false}
          />
        ) : null}
        <Text
          x={0}
          y={0}
          text={textValue}
          fontSize={textFontSizePx}
          fontFamily={textFontFamily}
          fontStyle={
            figure.textFontStyle === "italic"
              ? "italic"
              : figure.textFontWeight === "bold" ||
                  (typeof figure.textFontWeight === "number" &&
                    figure.textFontWeight >= 600)
                ? "bold"
                : "normal"
          }
          fill={textFill}
          align={textAlign}
          lineHeight={textLineHeight}
          letterSpacing={textLetterSpacing}
          width={textWidthPx}
          wrap={textWidthPx ? textWrap : "none"}
          listening={true}
          name="inaa-text"
          perfectDrawEnabled={false}
        />
      </Group>
    );
  }

  return (
    <Group
      name={name}
      ref={forwardRef}
      x={x}
      y={y}
      rotation={rotation}
      opacity={opacity}
      listening={listening}
      draggable={draggable}
      onPointerDown={onPointerDown}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      {/* Piques (notches) */}
      {supportsPiques && figure.piques?.length
        ? figure.piques.map((p) => {
            const edge = figure.edges.find((e) => e.id === p.edgeId) ?? null;
            if (!edge) return null;
            // 32 arc-length samples locate the pique to sub-pixel accuracy;
            // 120 was wasted CPU (this runs in the render body).
            const edgePts = edgeLocalPoints(
              figure,
              edge,
              edge.kind === "line" ? 2 : 32
            );
            if (edgePts.length < 2) return null;

            const at = pointAndTangentAtT01(edgePts, p.t01);
            if (!at) return null;

            const isHemPique =
              figure.kind === "seam" && figure.derivedRole === "hem";
            const normal = norm(perp(at.tangentUnit));
            const lengthPx = Math.max(0, (p.lengthCm || 0.5) * PX_PER_CM);
            const direction = (() => {
              if (isHemPique) {
                const storedSide = p.side === -1 ? -1 : 1;
                return mul(at.tangentUnit, storedSide);
              }
              const baseDirection =
                p.orientation === "tangent" ? at.tangentUnit : normal;
              const side = p.side === -1 ? -1 : 1;
              return mul(baseDirection, side);
            })();
            const p0 = at.point;
            const p1 = add(p0, mul(direction, lengthPx));
            const piqueStrokeWidth = isHemPique
              ? strokeWidth * 1.5
              : strokeWidth;

            const isHover = hoveredPiqueId === p.id;

            return (
              <Line
                key={`pique:${figure.id}:${p.id}`}
                points={[p0.x, p0.y, p1.x, p1.y]}
                stroke={isHover ? "#ef4444" : stroke}
                strokeWidth={piqueStrokeWidth}
                opacity={Math.min(1, opacity + 0.05)}
                dash={[]}
                lineCap="round"
                lineJoin="round"
                listening={false}
                name="inaa-pique"
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
              />
            );
          })
        : null}

      {figure.kind !== "seam" && hasEdgeStrokeOverrides ? (
        <>
          {figure.closed &&
          contourPts.length >= 6 &&
          hasVisibleFill(figure.fill) ? (
            <Line
              points={contourPts}
              strokeWidth={0}
              stroke={"transparent"}
              strokeEnabled={false}
              fill={figure.fill ?? "transparent"}
              fillEnabled={hitFillEnabled}
              closed={true}
              listening={false}
              perfectDrawEnabled={false}
              shadowForStrokeEnabled={false}
              name="inaa-fill-edge-strokes"
            />
          ) : null}
          {renderEdgeStrokeLines()}
        </>
      ) : figure.kind === "seam" && figure.seamSegments?.length ? (
        figure.seamSegments.map((segment, idx) => (
          <Line
            key={`seam-seg:${figure.id}:${idx}`}
            points={segment}
            stroke={stroke}
            strokeWidth={strokeWidth}
            fill={"transparent"}
            fillEnabled={false}
            closed={false}
            dash={dash}
            lineCap={contourLineCap}
            lineJoin={contourLineJoin}
            hitStrokeWidth={hitStrokeWidth}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
            listening={listening}
          />
        ))
      ) : !isSimpleContour && edgeSegments.length > 0 ? (
        <>
          {figure.closed &&
          contourPts.length >= 6 &&
          hasVisibleFill(figure.fill) ? (
            <Line
              points={contourPts}
              strokeWidth={0}
              stroke={"transparent"}
              strokeEnabled={false}
              fill={figure.fill ?? "transparent"}
              fillEnabled={hitFillEnabled}
              closed={true}
              listening={false}
              perfectDrawEnabled={false}
              shadowForStrokeEnabled={false}
              name="inaa-fill-fallback"
            />
          ) : null}

          {/* Render edge-by-edge for branched/unordered figures */}
          {edgeSegments.map((segment, idx) => {
            const edge = figure.edges.find((e) => e.id === segment.edgeId);
            return (
              <Line
                key={`edge-seg:${figure.id}:${idx}`}
                points={segment.points}
                stroke={
                  edge?.stroke
                    ? resolveStrokeColor(edge.stroke, isDark, "solid")
                    : stroke
                }
                strokeWidth={strokeWidth}
                fill={"transparent"}
                fillEnabled={false}
                closed={false}
                dash={dash}
                lineCap="round"
                lineJoin="round"
                hitStrokeWidth={hitStrokeWidth}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
                listening={listening}
              />
            );
          })}
        </>
      ) : (
        <Line
          points={pts}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill={figure.fill ?? "transparent"}
          fillEnabled={hitFillEnabled}
          closed={figure.closed}
          dash={dash}
          lineCap={contourLineCap}
          lineJoin={contourLineJoin}
          hitStrokeWidth={hitStrokeWidth}
          perfectDrawEnabled={false} // Optimization: Disable perfect draw
          shadowForStrokeEnabled={false} // Optimization: Disable shadow
          listening={listening} // Optimization: Disable events if not needed
        />
      )}

      <MemoizedDartOverlay
        figure={figure}
        scale={scale}
        stroke={stroke}
        strokeWidth={strokeWidth}
        isDark={isDark}
      />

      {hoveredSelectEdge && hoveredSelectEdge.figureId === figure.id
        ? (() => {
            const edge = figure.edges.find(
              (e) => e.id === hoveredSelectEdge.edgeId
            );
            if (!edge) return null;
            const pts = edgeLocalPoints(
              figure,
              edge,
              edge.kind === "line" ? 1 : 60
            );
            if (pts.length < 2) return null;
            const flat: number[] = [];
            for (const p of pts) flat.push(p.x, p.y);
            return (
              <Line
                points={flat}
                stroke="#2563eb"
                strokeWidth={3 / scale}
                opacity={0.9}
                listening={false}
                lineCap="round"
                lineJoin="round"
              />
            );
          })()
        : null}
      {showNodes && (
        <MemoizedNodeOverlay
          figure={figure}
          scale={scale}
          stroke={stroke}
          nodeStroke={nodeStrokeOverride}
          opacity={opacity}
          visible={true}
          x={0}
          y={0}
          rotation={0}
        />
      )}
      {showMeasures && (
        <MemoizedMeasureOverlay
          figure={figure}
          scale={scale}
          isDark={isDark}
          selectedEdge={selectedEdge}
          hoveredEdge={hoveredEdge}
        />
      )}

      {figure.kind !== "seam" &&
      pointLabelsMode !== "off" &&
      pointLabelsByNodeId ? (
        <>
          {figure.nodes.map((n) => {
            const text = pointLabelsByNodeId[n.id];
            if (!text) return null;

            // Place label "outside" the figure: offset away from centroid.
            const centroid = figureCentroidLocal(figure);

            const dx = n.x - centroid.x;
            const dy = n.y - centroid.y;
            const len = Math.hypot(dx, dy);
            const dir =
              len > 1e-6
                ? { x: dx / len, y: dy / len }
                : { x: 0.707106781, y: -0.707106781 };

            const px = n.x + dir.x * pointLabelOffsetDist;
            const py = n.y + dir.y * pointLabelOffsetDist;

            const alignRight = dx < 0;
            const approxWidth = Math.max(
              12 / scale,
              text.length * pointLabelFontSize * 0.62
            );

            return (
              <Text
                key={`pl:${figure.id}:${n.id}`}
                x={px}
                y={py}
                text={text.toUpperCase()}
                fontSize={pointLabelFontSize}
                fontStyle="bold"
                fill={pointLabelFill}
                opacity={pointLabelOpacity}
                width={approxWidth}
                align={alignRight ? "right" : "left"}
                offsetX={alignRight ? approxWidth : 0}
                offsetY={pointLabelFontSize / 2}
                listening={false}
                name="inaa-point-label"
              />
            );
          })}
        </>
      ) : null}

      {figure.kind === "seam" && (
        <MemoizedSeamLabel
          seam={figure}
          baseCentroidLocal={seamBaseCentroidLocal ?? null}
          scale={scale}
          isDark={isDark}
          enabled={!!showSeamLabel}
        />
      )}

      {figure.kind !== "seam" && figure.kind !== "mold" && nameLayout && (
        <Text
          x={nameLayout.x}
          y={nameLayout.y}
          text={figureName}
          fontSize={nameLayout.fontSize}
          fontStyle="bold"
          fill={nameFill}
          opacity={nameOpacity}
          rotation={nameRotationDeg}
          width={nameLayout.width}
          align={nameLayout.align}
          wrap="none"
          offsetX={nameLayout.width / 2}
          offsetY={nameLayout.fontSize / 2}
          listening={false}
          name="inaa-figure-name"
        />
      )}

      {figure.kind !== "seam" &&
        figure.kind !== "mold" &&
        nameLayout &&
        showNameHandle && (
          <Group
            x={nameLayout.x}
            y={nameLayout.y}
            rotation={nameRotationDeg}
            draggable={true}
            onDragStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              const nx = e.target.x();
              const ny = e.target.y();
              const nextOffsetLocal = {
                x: nx - nameLayout.baseX,
                y: ny - nameLayout.baseY,
              };
              onNameOffsetChange?.(figure.id, nextOffsetLocal);
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              const nx = e.target.x();
              const ny = e.target.y();
              const nextOffsetLocal = {
                x: nx - nameLayout.baseX,
                y: ny - nameLayout.baseY,
              };
              onNameOffsetCommit?.(figure.id, nextOffsetLocal);
            }}
          >
            <PulsingHandleRect
              x={nameLayout.textTightWidthApprox / 2 + handleGap + handleSize / 2}
              size={handleSize}
              fill={nameFill}
              cornerRadius={2 / scale}
            />
          </Group>
        )}

      {/* Mold: grain-line arrow (single-headed). Not affected by text rotation. */}
      {figure.kind === "mold" && moldDocLayout?.grain && (
        <>
          <Line
            points={[
              moldDocLayout.grain.tail.x,
              moldDocLayout.grain.tail.y,
              moldDocLayout.grain.tip.x,
              moldDocLayout.grain.tip.y,
            ]}
            stroke={nameFill}
            strokeWidth={moldDocLayout.grain.strokeWidth}
            opacity={nameOpacity}
            lineCap="round"
            lineJoin="round"
            listening={false}
            perfectDrawEnabled={false}
            name="inaa-mold-grainline"
          />
          <Line
            points={[
              moldDocLayout.grain.headA.x,
              moldDocLayout.grain.headA.y,
              moldDocLayout.grain.tip.x,
              moldDocLayout.grain.tip.y,
              moldDocLayout.grain.headB.x,
              moldDocLayout.grain.headB.y,
            ]}
            stroke={nameFill}
            strokeWidth={moldDocLayout.grain.strokeWidth}
            opacity={nameOpacity}
            lineCap="round"
            lineJoin="round"
            listening={false}
            perfectDrawEnabled={false}
            name="inaa-mold-grainline-head"
          />
        </>
      )}

      {/* Mold: consolidated documentation text block (watermark). */}
      {figure.kind === "mold" && moldDocLayout && moldDocLayout.lines.length > 0 && (
        <Group
          x={moldDocLayout.anchor.x}
          y={moldDocLayout.anchor.y}
          rotation={moldDocLayout.rotationDeg}
          listening={false}
          name="inaa-mold-doc"
        >
          {moldDocLayout.lines.map((line) => (
            <Text
              key={line.key}
              x={0}
              y={line.y}
              width={moldDocLayout.blockWidth}
              height={line.height}
              offsetX={moldDocLayout.blockWidth / 2}
              text={line.text}
              fontSize={line.fontSizePx}
              fontStyle={line.bold ? "bold" : "normal"}
              fill={nameFill}
              opacity={nameOpacity}
              align={moldDocLayout.textAlign}
              verticalAlign={line.wrap ? "top" : "middle"}
              wrap={line.wrap ? "word" : "none"}
              listening={false}
              name="inaa-mold-doc-line"
            />
          ))}
        </Group>
      )}

      {figure.kind === "mold" &&
        moldDocLayout &&
        moldDocBase &&
        moldDocLayout.lines.length > 0 &&
        showNameHandle &&
        !innerTransformKind && (
          <Group
            x={moldDocLayout.anchor.x}
            y={moldDocLayout.anchor.y}
            rotation={moldDocLayout.rotationDeg}
            draggable={true}
            onDragStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              const nextOffsetLocal = {
                x: e.target.x() - moldDocBase.x,
                y: e.target.y() - moldDocBase.y,
              };
              onNameOffsetChange?.(figure.id, nextOffsetLocal);
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              const nextOffsetLocal = {
                x: e.target.x() - moldDocBase.x,
                y: e.target.y() - moldDocBase.y,
              };
              onNameOffsetCommit?.(figure.id, nextOffsetLocal);
            }}
          >
            <PulsingHandleRect
              x={moldDocLayout.blockWidth / 2 + handleGap + handleSize / 2}
              size={handleSize}
              fill={nameFill}
              cornerRadius={2 / scale}
              onDblClick={() => onNameHandleDblClick?.(figure.id)}
            />
          </Group>
        )}

      {/* Grain arrow handle: drags the arrow freely, independent of the doc
          text block. Persists moldMeta.grainOffsetLocal (centroid-relative). */}
      {figure.kind === "mold" &&
        moldDocBase &&
        grainHandle &&
        showNameHandle &&
        !innerTransformKind && (
          <Group
            x={grainHandle.center.x}
            y={grainHandle.center.y}
            draggable={true}
            onDragStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              const nextOffsetLocal = {
                x: e.target.x() - moldDocBase.x,
                y: e.target.y() - moldDocBase.y,
              };
              onGrainOffsetChange?.(figure.id, nextOffsetLocal);
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              const nextOffsetLocal = {
                x: e.target.x() - moldDocBase.x,
                y: e.target.y() - moldDocBase.y,
              };
              onGrainOffsetCommit?.(figure.id, nextOffsetLocal);
            }}
          >
            <PulsingHandleRect
              x={grainHandle.handleRel.x}
              y={grainHandle.handleRel.y}
              size={handleSize}
              fill={nameFill}
              cornerRadius={2 / scale}
              name="inaa-grain-handle"
              onDblClick={() => onGrainHandleDblClick?.(figure.id)}
            />
          </Group>
        )}

      {/* Inner-transform proxies: invisible, draggable rects mirroring the doc
          block / grain arrow. The dedicated inner Transformer (Canvas) attaches
          to them; scale/rotation are baked back into figure state. */}
      {figure.kind === "mold" &&
        moldDocLayout &&
        moldDocBase &&
        innerTransformKind === "doc" &&
        moldDocLayout.lines.length > 0 && (
          <Rect
            name="inaa-inner-proxy-doc"
            x={moldDocLayout.anchor.x}
            y={moldDocLayout.anchor.y}
            width={moldDocLayout.blockWidth}
            height={moldDocLayout.blockHeight}
            offsetX={moldDocLayout.blockWidth / 2}
            offsetY={moldDocLayout.blockHeight / 2}
            rotation={moldDocLayout.rotationDeg}
            fill="rgba(0,0,0,0)"
            draggable={true}
            onDragStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              onNameOffsetChange?.(figure.id, {
                x: e.target.x() - moldDocBase.x,
                y: e.target.y() - moldDocBase.y,
              });
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              onNameOffsetCommit?.(figure.id, {
                x: e.target.x() - moldDocBase.x,
                y: e.target.y() - moldDocBase.y,
              });
            }}
          />
        )}

      {figure.kind === "mold" &&
        moldDocBase &&
        grainProxy &&
        innerTransformKind === "grain" && (
          <Rect
            name="inaa-inner-proxy-grain"
            x={grainProxy.center.x}
            y={grainProxy.center.y}
            width={grainProxy.width}
            height={grainProxy.length}
            offsetX={grainProxy.width / 2}
            offsetY={grainProxy.length / 2}
            rotation={grainProxy.rotationDeg}
            fill="rgba(0,0,0,0)"
            draggable={true}
            onDragStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              onGrainOffsetChange?.(figure.id, {
                x: e.target.x() - moldDocBase.x,
                y: e.target.y() - moldDocBase.y,
              });
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              onGrainOffsetCommit?.(figure.id, {
                x: e.target.x() - moldDocBase.x,
                y: e.target.y() - moldDocBase.y,
              });
            }}
          />
        )}
    </Group>
  );
};

// Custom comparison function for React.memo
const arePropsEqual = (
  prev: FigureRendererProps,
  next: FigureRendererProps
) => {
  return (
    prev.x === next.x &&
    prev.y === next.y &&
    prev.rotation === next.rotation &&
    prev.scale === next.scale &&
    prev.stroke === next.stroke &&
    prev.strokeWidth === next.strokeWidth &&
    prev.opacity === next.opacity &&
    prev.hitStrokeWidth === next.hitStrokeWidth &&
    prev.hitFillEnabled === next.hitFillEnabled &&
    prev.listening === next.listening &&
    prev.draggable === next.draggable &&
    prev.showNodes === next.showNodes &&
    prev.showMeasures === next.showMeasures &&
    prev.pointLabelsMode === next.pointLabelsMode &&
    prev.pointLabelsByNodeId === next.pointLabelsByNodeId &&
    prev.showSeamLabel === next.showSeamLabel &&
    prev.showNameHandle === next.showNameHandle &&
    prev.innerTransformKind === next.innerTransformKind &&
    prev.isDark === next.isDark &&
    prev.selectedEdge === next.selectedEdge &&
    prev.hoveredEdge === next.hoveredEdge &&
    prev.hoveredSelectEdge === next.hoveredSelectEdge &&
    prev.hoveredPiqueId === next.hoveredPiqueId &&
    prev.seamBaseCentroidLocal?.x === next.seamBaseCentroidLocal?.x &&
    prev.seamBaseCentroidLocal?.y === next.seamBaseCentroidLocal?.y &&
    prev.figure === next.figure && // Reference check for figure
    prev.figure.fill === next.figure.fill && // Check fill specifically
    prev.figure.closed === next.figure.closed && // Check closed specifically
    areArraysEqual(prev.dash, next.dash)
    // Note: onPointerDown and forwardRef are usually stable or we ignore them for memo
    // If they change often, we might need to include them, but usually they are stable callbacks
  );
};

function areArraysEqual(a?: number[], b?: number[]) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export const MemoizedFigure = React.memo(FigureRenderer, arePropsEqual);
