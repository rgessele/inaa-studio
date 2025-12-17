"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Line,
  Rect as KonvaRect,
  Circle as KonvaCircle,
  Transformer,
} from "react-konva";
import Konva from "konva";
import { useEditor } from "./EditorContext";
import { DrawingTool, Shape } from "./types";
import { GRID_SIZE_PX, PX_PER_CM } from "./constants";
import { getPaperDimensionsCm } from "./exportSettings";

import { Ruler } from "./Ruler";
import { getAllSnapPoints, findNearestSnapPoint, SnapPoint } from "./snapping";
import { upsertSeamAllowance } from "./offset";
import { applyDartToShape } from "./dart";

// Large virtual area to keep the background visible while navigating the canvas.
const WORKSPACE_SIZE = 8000; // Increased size
const MIN_ZOOM_SCALE = 0.1;
const MAX_ZOOM_SCALE = 10;
const ZOOM_FACTOR = 1.08;
const DEFAULT_STROKE = "#e5e7eb"; // Light stroke for dark mode
const DEFAULT_FILL = "transparent";
const WORKSPACE_BACKGROUND = "#121212"; // Dark background
const GRID_COLOR = "rgba(255, 255, 255, 0.05)";
const CONTROL_POINT_RADIUS = 6; // Radius for control point anchor
const NODE_ANCHOR_RADIUS = 5; // Radius for node anchors
const MEASURE_SNAP_MIN_THRESHOLD_PX = 12;
const DEFAULT_DART_POSITION_RATIO = 0.5; // Default dart position at middle of edge (50%)
const DEFAULT_DART_EDGE_INDEX = 0; // Default edge for rectangles (top edge)

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function localToWorldPoint(
  shape: Pick<Shape, "x" | "y" | "rotation">,
  localX: number,
  localY: number
): { x: number; y: number } {
  const rotation = shape.rotation || 0;
  if (!rotation) {
    return { x: shape.x + localX, y: shape.y + localY };
  }

  const rad = degreesToRadians(rotation);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotatedX = localX * cos - localY * sin;
  const rotatedY = localX * sin + localY * cos;
  return { x: shape.x + rotatedX, y: shape.y + rotatedY };
}

function closestPointOnSegment(
  point: { x: number; y: number },
  segment: { x1: number; y1: number; x2: number; y2: number }
): { x: number; y: number; distance: number } {
  const vx = segment.x2 - segment.x1;
  const vy = segment.y2 - segment.y1;
  const wx = point.x - segment.x1;
  const wy = point.y - segment.y1;

  const vv = vx * vx + vy * vy;
  if (vv < 0.0000001) {
    const dx = point.x - segment.x1;
    const dy = point.y - segment.y1;
    return {
      x: segment.x1,
      y: segment.y1,
      distance: Math.sqrt(dx * dx + dy * dy),
    };
  }

  let t = (wx * vx + wy * vy) / vv;
  t = Math.max(0, Math.min(1, t));
  const x = segment.x1 + t * vx;
  const y = segment.y1 + t * vy;
  const dx = point.x - x;
  const dy = point.y - y;
  return { x, y, distance: Math.sqrt(dx * dx + dy * dy) };
}

function getCurvePolylineLocal(
  points: number[],
  controlPoint: { x: number; y: number },
  steps: number = 50
): number[] {
  const x1 = points[0];
  const y1 = points[1];
  const x2 = points[2];
  const y2 = points[3];
  const cx = controlPoint.x;
  const cy = controlPoint.y;

  const curvePoints: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const x = mt2 * x1 + 2 * mt * t * cx + t2 * x2;
    const y = mt2 * y1 + 2 * mt * t * cy + t2 * y2;
    curvePoints.push(x, y);
  }
  return curvePoints;
}

// Helper function to create a circle as a closed path with points
function createCirclePoints(radius: number, segments: number = 32): number[] {
  const points: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return points;
}

// Helper function to create a rectangle as a closed path with points
function createRectanglePoints(width: number, height: number): number[] {
  return [0, 0, width, 0, width, height, 0, height];
}

// Helper function to calculate measure tooltip data
function calculateMeasureTooltip(
  start: { x: number; y: number },
  end: { x: number; y: number },
  scale: number,
  position: { x: number; y: number }
) {
  // Calculate distance in pixels
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distancePx = Math.sqrt(dx * dx + dy * dy);

  // Convert to centimeters
  const distanceCm = distancePx / PX_PER_CM;

  // Calculate screen position (follows the end point)
  const screenX = end.x * scale + position.x;
  const screenY = end.y * scale + position.y;

  return { distanceCm, screenX, screenY };
}

export default function Canvas() {
  const {
    tool,
    shapes,
    setShapes,
    scale: stageScale,
    setScale: setStageScale,
    position: stagePosition,
    setPosition: setStagePosition,
    selectedShapeId,
    setSelectedShapeId,
    showRulers,
    registerStage,
    showGrid,
    showPageGuides,
    pageGuideSettings,
    measureSnapStrengthPx,
    offsetValueCm,
    setOffsetValueCm,
    offsetTargetId,
    setOffsetTargetId,
    dartDepthCm,
    setDartDepthCm,
    dartOpeningCm,
    setDartOpeningCm,
    dartTargetId,
    setDartTargetId,
    mirrorAxis,
    unfoldAxis,
  } = useEditor();

  const RULER_THICKNESS = 24;

  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isKeyboardActive, setIsKeyboardActive] = useState(false);
  const [isPanDrag, setIsPanDrag] = useState(false);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(
    null
  );
  const [activeSnapPoint, setActiveSnapPoint] = useState<SnapPoint | null>(
    null
  );

  const getParentIdForShape = (shapeId: string) => {
    const shape = shapes.find((s) => s.id === shapeId);
    if (!shape) return shapeId;
    if (shape.kind === "seam" && shape.parentId) return shape.parentId;
    return shapeId;
  };

  const getSeamsForParent = (allShapes: Shape[], parentId: string) => {
    return allShapes.filter((s) => s.kind === "seam" && s.parentId === parentId);
  };

  const removeSeamsForParent = (allShapes: Shape[], parentId: string) => {
    return allShapes.filter((s) => !(s.kind === "seam" && s.parentId === parentId));
  };

  const recomputeSeamsForParent = (
    allShapes: Shape[],
    parentId: string,
    offsetOverrideCm?: number
  ) => {
    const base = allShapes.find((s) => s.id === parentId);
    if (!base) {
      return removeSeamsForParent(allShapes, parentId);
    }

    const existingSeams = getSeamsForParent(allShapes, parentId);
    const offsetCm =
      offsetOverrideCm ?? existingSeams[0]?.offsetCm ?? undefined;

    if (offsetCm === undefined) {
      return allShapes;
    }

    const nextSeams = upsertSeamAllowance(
      base,
      existingSeams,
      offsetCm,
      PX_PER_CM
    );

    return [...removeSeamsForParent(allShapes, parentId), ...nextSeams];
  };
  const [measureStart, setMeasureStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(
    null
  );
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureSnapPreview, setMeasureSnapPreview] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const cachedSnapPoints = useRef<SnapPoint[] | null>(null);
  const isDrawing = useRef(false);
  const currentShape = useRef<Shape | null>(null);
  const currentShapeIndex = useRef<number>(-1);
  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const seamDragRef = useRef<
    | {
        parentId: string;
        startX: number;
        startY: number;
        seamStarts: Map<string, { x: number; y: number }>;
      }
    | null
  >(null);

  const handleShapeDragStart = (
    id: string,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    const seams = shapes.filter((s) => s.kind === "seam" && s.parentId === id);
    if (seams.length === 0) return;

    const node = e.target;
    const seamStarts = new Map<string, { x: number; y: number }>();

    for (const seam of seams) {
      const seamNode = shapeRefs.current.get(seam.id);
      if (!seamNode) continue;
      seamStarts.set(seam.id, { x: seamNode.x(), y: seamNode.y() });
    }

    seamDragRef.current = {
      parentId: id,
      startX: node.x(),
      startY: node.y(),
      seamStarts,
    };
  };

  const handleShapeDragMove = (
    id: string,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    const ref = seamDragRef.current;
    if (!ref || ref.parentId !== id) return;

    const node = e.target;
    const dx = node.x() - ref.startX;
    const dy = node.y() - ref.startY;

    for (const [seamId, start] of ref.seamStarts.entries()) {
      const seamNode = shapeRefs.current.get(seamId);
      if (!seamNode) continue;
      seamNode.x(start.x + dx);
      seamNode.y(start.y + dy);
    }

    node.getLayer()?.batchDraw();
  };

  // Generate grid lines - 1cm x 1cm squares
  const gridLines = [];
  const numLines = Math.ceil(WORKSPACE_SIZE / GRID_SIZE_PX);
  const offset = WORKSPACE_SIZE / 2;

  for (let i = 0; i <= numLines; i++) {
    const pos = i * GRID_SIZE_PX - offset;
    // Vertical lines
    gridLines.push(
      <Line
        key={`v-${i}`}
        points={[pos, -offset, pos, offset]}
        stroke={GRID_COLOR}
        strokeWidth={1}
        listening={false}
      />
    );
    // Horizontal lines
    gridLines.push(
      <Line
        key={`h-${i}`}
        points={[-offset, pos, offset, pos]}
        stroke={GRID_COLOR}
        strokeWidth={1}
        listening={false}
      />
    );
  }

  // Page boundary guides (based on export/print tile size)
  const viewportWidth = stageSize.width - (showRulers ? RULER_THICKNESS : 0);
  const viewportHeight = stageSize.height - (showRulers ? RULER_THICKNESS : 0);

  const pageGuideRects = [];
  if (showPageGuides && viewportWidth > 0 && viewportHeight > 0) {
    const { widthCm, heightCm } = getPaperDimensionsCm(
      pageGuideSettings.paperSize,
      pageGuideSettings.orientation
    );
    const marginCm = Math.max(0, Math.min(pageGuideSettings.marginCm, 10));
    const safeWidthCm = widthCm - 2 * marginCm;
    const safeHeightCm = heightCm - 2 * marginCm;

    const tileWidthPx = Math.max(1, safeWidthCm * PX_PER_CM);
    const tileHeightPx = Math.max(1, safeHeightCm * PX_PER_CM);

    const startX = -stagePosition.x / stageScale;
    const startY = -stagePosition.y / stageScale;
    const endX = startX + viewportWidth / stageScale;
    const endY = startY + viewportHeight / stageScale;

    const iStart = Math.floor(startX / tileWidthPx) - 1;
    const iEnd = Math.floor(endX / tileWidthPx) + 1;
    const jStart = Math.floor(startY / tileHeightPx) - 1;
    const jEnd = Math.floor(endY / tileHeightPx) + 1;

    for (let j = jStart; j <= jEnd; j++) {
      for (let i = iStart; i <= iEnd; i++) {
        pageGuideRects.push(
          <KonvaRect
            key={`page-guide-${i}-${j}`}
            x={i * tileWidthPx}
            y={j * tileHeightPx}
            width={tileWidthPx}
            height={tileHeightPx}
            stroke={DEFAULT_STROKE}
            strokeWidth={1}
            opacity={0.18}
            listening={false}
          />
        );
      }
    }
  }

  // Space-bar panning needs preventDefault to avoid page scroll, so listeners are active only while the canvas is active.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      setStageSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });

    observer.observe(container);
    setStageSize({
      width: container.clientWidth,
      height: container.clientHeight,
    });

    return () => observer.disconnect();
  }, []);

  // Register stage ref with context
  useEffect(() => {
    registerStage(stageRef.current);
  }, [registerStage]);

  useEffect(() => {
    const isTypingElement = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
    };

    if (!isKeyboardActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingElement(event.target)) return;

      if (event.code === "Space") {
        event.preventDefault();
        setIsSpacePressed(true);
      }
      if (event.key === "Shift") {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isTypingElement(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        setIsSpacePressed(false);
        setIsPanDrag(false);
      }
      if (event.key === "Shift") {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isKeyboardActive]);

  const isPanning = tool === "pan" || isSpacePressed || isPanDrag;

  // Clear selected node when switching tools
  useEffect(() => {
    if (selectedNodeIndex !== null) {
      setSelectedNodeIndex(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // Clear measure tool state when switching away from measure tool
  useEffect(() => {
    if (tool !== "measure") {
      setIsMeasuring(false);
      setMeasureStart(null);
      setMeasureEnd(null);
      setMeasureSnapPreview(null);
    }
  }, [tool]);

  // Clear offset target when switching away from offset tool
  useEffect(() => {
    if (tool !== "offset" && offsetTargetId) {
      setOffsetTargetId(null);
    }
  }, [offsetTargetId, setOffsetTargetId, tool]);

  // Clear dart target when switching away from dart tool
  useEffect(() => {
    if (tool !== "dart" && dartTargetId) {
      setDartTargetId(null);
    }
  }, [dartTargetId, setDartTargetId, tool]);

  // If the target shape is deleted, clear selection
  useEffect(() => {
    if (!offsetTargetId) return;
    const exists = shapes.some((s) => s.id === offsetTargetId);
    if (!exists) {
      setOffsetTargetId(null);
    }
  }, [offsetTargetId, setOffsetTargetId, shapes]);

  // If the dart target shape is deleted, clear selection
  useEffect(() => {
    if (!dartTargetId) return;
    const exists = shapes.some((s) => s.id === dartTargetId);
    if (!exists) {
      setDartTargetId(null);
    }
  }, [dartTargetId, setDartTargetId, shapes]);

  // Invalidate cached snap points whenever shapes change
  useEffect(() => {
    cachedSnapPoints.current = null;
  }, [shapes]);

  // Attach transformer to selected shape
  useEffect(() => {
    if (!transformerRef.current) return;

    if (selectedShapeId && tool === "select") {
      const selectedNode = shapeRefs.current.get(selectedShapeId);
      if (selectedNode) {
        transformerRef.current.nodes([selectedNode]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    } else {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedShapeId, tool]);

  const getRelativePointer = (stage: Konva.Stage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;

    const scale = stage.scaleX();
    const position = stage.position();

    return {
      x: (pointer.x - position.x) / scale,
      y: (pointer.y - position.y) / scale,
    };
  };

  const getMeasureMagneticResult = (pos: { x: number; y: number }) => {
    const thresholdPx = Math.max(
      MEASURE_SNAP_MIN_THRESHOLD_PX,
      measureSnapStrengthPx
    );
    const thresholdWorld = thresholdPx / stageScale;

    // Prefer snapping to explicit snap points (endpoints/midpoints/intersections)
    // but also support snapping to the closest point along any segment (edge).
    let bestPoint: { x: number; y: number } | null = null;
    let bestDistance = thresholdWorld;

    // 1) Snap points (vertices/midpoints/intersections)
    const snapPoints =
      cachedSnapPoints.current || getAllSnapPoints(shapes, undefined, undefined);
    cachedSnapPoints.current = snapPoints;
    const nearestSnapPoint = findNearestSnapPoint(
      pos.x,
      pos.y,
      snapPoints,
      thresholdWorld
    );
    if (nearestSnapPoint) {
      const dx = nearestSnapPoint.x - pos.x;
      const dy = nearestSnapPoint.y - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint = { x: nearestSnapPoint.x, y: nearestSnapPoint.y };
      }
    }

    // 2) Segment/edge snapping
    for (const shape of shapes) {
      // Build a list of local polyline points for the shape
      let localPoints: number[] | null = null;
      let isClosed = false;

      if (shape.tool === "rectangle") {
        const w = shape.width || 0;
        const h = shape.height || 0;
        localPoints = [0, 0, w, 0, w, h, 0, h];
        isClosed = true;
      } else if (shape.tool === "circle") {
        localPoints = shape.points || null;
        isClosed = true;
      } else if (shape.tool === "line") {
        localPoints = shape.points || null;
        isClosed = false;
      } else if (shape.tool === "curve") {
        if (shape.points && shape.points.length >= 4 && shape.controlPoint) {
          localPoints = getCurvePolylineLocal(shape.points, shape.controlPoint);
          isClosed = false;
        }
      }

      if (!localPoints || localPoints.length < 4) continue;

      const numPoints = Math.floor(localPoints.length / 2);
      const segmentsCount = isClosed ? numPoints : numPoints - 1;
      for (let i = 0; i < segmentsCount; i++) {
        const nextIndex = (i + 1) % numPoints;
        const p1 = localToWorldPoint(
          shape,
          localPoints[i * 2],
          localPoints[i * 2 + 1]
        );
        const p2 = localToWorldPoint(
          shape,
          localPoints[nextIndex * 2],
          localPoints[nextIndex * 2 + 1]
        );
        const closest = closestPointOnSegment(pos, {
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
        });
        if (closest.distance < bestDistance) {
          bestDistance = closest.distance;
          bestPoint = { x: closest.x, y: closest.y };
        }
      }
    }

    return {
      point: bestPoint || pos,
      isSnapped: Boolean(bestPoint),
    };
  };

  const beginPan = (stage: Konva.Stage) => {
    setIsPanDrag(true);
    stage.draggable(true);
    stage.startDrag();
  };

  const normalizeRectangle = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const width = end.x - start.x;
    const height = end.y - start.y;

    return {
      x: width < 0 ? end.x : start.x,
      y: height < 0 ? end.y : start.y,
      width: Math.abs(width),
      height: Math.abs(height),
    };
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const isMiddleButton = e.evt.button === 1;
    const isBackground =
      e.target === stage || e.target.name() === "workspace-background";

    if (
      isMiddleButton ||
      isSpacePressed ||
      tool === "pan" ||
      ((tool === "select" || tool === "node") && isBackground)
    ) {
      // Deselect if clicking on background with select or node tool
      if ((tool === "select" || tool === "node") && isBackground) {
        setSelectedShapeId(null);
        setSelectedNodeIndex(null);
      }
      beginPan(stage);
      return;
    }

    if (tool === "select" || tool === "node") {
      // Handle selection logic here if needed, Konva handles click on shapes usually
      if (isBackground) {
        setSelectedShapeId(null);
        setSelectedNodeIndex(null);
      }
      return;
    }

    if (tool === "measure") {
      const pos = getRelativePointer(stage);
      if (!pos) return;

      const result = getMeasureMagneticResult(pos);

      // Clear any previous measurement and start new one
      setMeasureStart(result.point);
      setMeasureEnd(result.point);
      setMeasureSnapPreview(result.isSnapped ? result.point : null);
      setIsMeasuring(true);
      return;
    }

    const pos = getRelativePointer(stage);
    if (!pos) return;

    isDrawing.current = true;

    const drawTool: DrawingTool = tool as DrawingTool;
    const newShape: Shape = {
      id: crypto.randomUUID(),
      tool: drawTool,
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      radius: 0,
      points:
        drawTool === "rectangle"
          ? createRectanglePoints(0, 0)
          : drawTool === "circle"
            ? createCirclePoints(0)
            : drawTool === "line" || drawTool === "curve"
              ? [0, 0]
              : [],
      controlPoint: drawTool === "curve" ? { x: 0, y: 0 } : undefined,
      stroke: DEFAULT_STROKE,
      strokeWidth: 2,
      fill:
        drawTool === "rectangle" || drawTool === "circle"
          ? DEFAULT_FILL
          : undefined,
    };

    currentShape.current = newShape;
    currentShapeIndex.current = shapes.length;
    setShapes([...shapes, newShape], false); // Don't save to history yet (temporary)
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Preview snap before starting measure
    if (tool === "measure" && !isMeasuring) {
      const stage = e.target.getStage();
      if (!stage) return;

      const pos = getRelativePointer(stage);
      if (!pos) return;

      const result = getMeasureMagneticResult(pos);
      setMeasureSnapPreview(result.isSnapped ? result.point : null);
      return;
    }

    // Handle measure tool
    if (isMeasuring) {
      const stage = e.target.getStage();
      if (!stage) return;

      const pos = getRelativePointer(stage);
      if (!pos) return;

      const result = getMeasureMagneticResult(pos);
      setMeasureEnd(result.point);
      setMeasureSnapPreview(result.isSnapped ? result.point : null);
      return;
    }

    if (!isDrawing.current) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pos = getRelativePointer(stage);
    if (!pos) return;

    const lastShape = currentShape.current;
    if (!lastShape) return;

    const shapeIndex = currentShapeIndex.current;
    if (shapeIndex === -1) return;

    const updatedShapes = shapes.slice();

    if (lastShape.tool === "rectangle") {
        const rect = normalizeRectangle({ x: lastShape.x, y: lastShape.y }, pos);

      // If SHIFT is pressed, force 1:1 aspect ratio (square)
      if (isShiftPressed) {
        const size = Math.min(rect.width, rect.height);
        rect.width = size;
        rect.height = size;
      }

      updatedShapes[shapeIndex] = {
        ...lastShape,
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y,
        points: createRectanglePoints(rect.width, rect.height),
      };
    } else if (lastShape.tool === "circle") {
      const dx = pos.x - lastShape.x;
      const dy = pos.y - lastShape.y;

      // Circles always use diagonal distance for radius (naturally perfect circles)
      // SHIFT key has no effect on circle behavior
      const radius = Math.sqrt(dx * dx + dy * dy);

      updatedShapes[shapeIndex] = {
        ...lastShape,
        radius,
        points: createCirclePoints(radius),
      };
    } else if (lastShape.tool === "line") {
      updatedShapes[shapeIndex] = {
        ...lastShape,
        points: [0, 0, pos.x - lastShape.x, pos.y - lastShape.y],
      };
    } else if (lastShape.tool === "curve") {
      // Calculate midpoint for control point (relative to shape origin)
      const endX = pos.x - lastShape.x;
      const endY = pos.y - lastShape.y;
      const midX = endX / 2;
      const midY = endY / 2;
      updatedShapes[shapeIndex] = {
        ...lastShape,
        points: [0, 0, endX, endY],
        controlPoint: { x: midX, y: midY },
      };
    }

    setShapes(updatedShapes, false); // Don't save to history during drawing
  };

  const handleStageEnter = () => {
    setIsKeyboardActive(true);
  };

  const handleStageLeave = () => {
    setIsKeyboardActive(false);
    handleMouseUp();
  };

  const handleMouseUp = () => {
    // Clear measure tool state
    if (isMeasuring) {
      setIsMeasuring(false);
      setMeasureStart(null);
      setMeasureEnd(null);
      return;
    }

    // If we were drawing, save the final state to history
    if (isDrawing.current && currentShape.current) {
      // Use identity function to capture and save current state to history
      // (previous updates used saveHistory=false, so we need to commit to history now)
      setShapes((current) => current, true);
    }

    isDrawing.current = false;
    currentShape.current = null;
    currentShapeIndex.current = -1;

    if (!isSpacePressed && tool !== "pan") {
      setIsPanDrag(false);
      if (stageRef.current?.isDragging()) {
        stageRef.current.stopDrag();
      }
      stageRef.current?.draggable(false);
    }
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stageScale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const position = stage.position();
    const mousePointTo = {
      x: (pointer.x - position.x) / oldScale,
      y: (pointer.y - position.y) / oldScale,
    };

    const newScale =
      e.evt.deltaY > 0 ? oldScale / ZOOM_FACTOR : oldScale * ZOOM_FACTOR;
    const clampedScale = Math.min(
      Math.max(newScale, MIN_ZOOM_SCALE),
      MAX_ZOOM_SCALE
    );

    const newPosition = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    setStageScale(clampedScale);
    setStagePosition(newPosition);
  };

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    // Only update stage position if the stage itself is being dragged
    if (e.target === stageRef.current) {
      const stage = e.target as Konva.Stage;
      setStagePosition({ x: stage.x(), y: stage.y() });
    }
  };

  const handleShapeClick = (id: string) => {
    const parentId = getParentIdForShape(id);

    // If dart tool is active, apply dart to the clicked shape
    if (tool === "dart") {
      const base = shapes.find((s) => s.id === parentId);
      if (!base) return;

      setSelectedShapeId(parentId);
      setDartTargetId(parentId);

      // Apply dart with default parameters
      const depthPx = dartDepthCm * PX_PER_CM;
      const openingPx = dartOpeningCm * PX_PER_CM;

      setShapes((prev) => {
        return prev.map((shape) => {
          if (shape.id === parentId) {
            return applyDartToShape(
              shape,
              DEFAULT_DART_POSITION_RATIO,
              depthPx,
              openingPx,
              DEFAULT_DART_EDGE_INDEX
            );
          }
          return shape;
        });
      });

      return;
    }

    // If mirror tool is active, create a mirrored copy of the clicked shape
    if (tool === "mirror") {
      const base = shapes.find((s) => s.id === parentId);
      if (!base) return;

      setSelectedShapeId(parentId);

      // Import mirror function
      const { mirrorShape, getAxisPositionForShape } = require("./mirror");

      // Get axis position from shape center
      const axisPosition = getAxisPositionForShape(base, mirrorAxis, "center");

      // Create mirrored shape
      const mirrored = mirrorShape(base, mirrorAxis, axisPosition);

      // Add the mirrored shape to canvas
      setShapes((prev) => [...prev, mirrored]);

      return;
    }

    // If unfold tool is active, unfold the clicked shape
    if (tool === "unfold") {
      const base = shapes.find((s) => s.id === parentId);
      if (!base) return;

      setSelectedShapeId(parentId);

      // Import unfold functions
      const { unfoldShape, canUnfoldShape, getSuggestedUnfoldAxis } =
        require("./unfold");

      // Check if shape can be unfolded
      if (!canUnfoldShape(base)) {
        // Shape can't be unfolded (only lines and curves supported)
        return;
      }

      // Get suggested axis position
      const axisPosition = getSuggestedUnfoldAxis(base, unfoldAxis);

      // Create unfolded shape
      const unfolded = unfoldShape(base, unfoldAxis, axisPosition);

      if (!unfolded) return;

      // Replace the original shape with the unfolded version
      setShapes((prev) => {
        return prev.map((shape) => {
          if (shape.id === parentId) {
            return unfolded;
          }
          return shape;
        });
      });

      return;
    }

    // If offset tool is active, apply or edit seam allowance for the clicked shape
    if (tool === "offset") {
      const base = shapes.find((s) => s.id === parentId);
      if (!base) return;

      setSelectedShapeId(parentId);
      setOffsetTargetId(parentId);

      const existingSeams = shapes.filter(
        (s) => s.kind === "seam" && s.parentId === parentId
      );

      // If already has seam allowance, just open editor (do not create another)
      if (existingSeams.length > 0) {
        return;
      }

      // Apply seam allowance with default value
      setShapes((prev) => {
        const alreadyHasSeams = prev.some(
          (s) => s.kind === "seam" && s.parentId === parentId
        );
        if (alreadyHasSeams) return prev;

        const latestBase = prev.find((s) => s.id === parentId);
        if (!latestBase) return prev;
        const nextSeams = upsertSeamAllowance(
          latestBase,
          [],
          offsetValueCm,
          PX_PER_CM
        );
        return [...prev, ...nextSeams];
      });

      return;
    }

    // Normal selection behavior (clicking seam selects its parent)
    if (tool === "select" || tool === "node") {
      setSelectedShapeId(parentId);
    }
  };

  const handleShapeDragEnd = (
    id: string,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    const node = e.target;
    seamDragRef.current = null;
    setShapes((prev) => {
      const updatedShapes = prev.map((shape) => {
        if (shape.id === id) {
          return {
            ...shape,
            x: node.x(),
            y: node.y(),
          };
        }
        return shape;
      });

      return recomputeSeamsForParent(updatedShapes, id);
    });
  };

  const handleShapeTransformEnd = (
    id: string,
    e: Konva.KonvaEventObject<Event>
  ) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale to 1 and update width/height/radius instead
    node.scaleX(1);
    node.scaleY(1);

    setShapes((prev) => {
      const updatedShapes = prev.map((shape) => {
        if (shape.id === id) {
          const updated: Shape = {
            ...shape,
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
          };

          if (shape.tool === "rectangle") {
            updated.width = Math.max(5, (shape.width || 0) * scaleX);
            updated.height = Math.max(5, (shape.height || 0) * scaleY);
            updated.points = createRectanglePoints(
              updated.width,
              updated.height
            );
          } else if (shape.tool === "circle") {
            updated.radius = Math.max(2.5, (shape.radius || 0) * scaleX);
            updated.points = createCirclePoints(updated.radius);
          } else if (shape.tool === "line" && shape.points) {
            const scaledPoints = shape.points.map((point, index) => {
              if (index % 2 === 0) {
                return point * scaleX;
              }
              return point * scaleY;
            });
            updated.points = scaledPoints;
          } else if (shape.tool === "curve" && shape.points && shape.controlPoint) {
            const scaledPoints = shape.points.map((point, index) => {
              if (index % 2 === 0) {
                return point * scaleX;
              }
              return point * scaleY;
            });
            updated.points = scaledPoints;
            updated.controlPoint = {
              x: shape.controlPoint.x * scaleX,
              y: shape.controlPoint.y * scaleY,
            };
          }

          return updated;
        }
        return shape;
      });

      return recomputeSeamsForParent(updatedShapes, id);
    });
  };

  const handleControlPointDragStart = (
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    e.cancelBubble = true;
  };

  const handleControlPointDragMove = (
    shapeId: string,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;

    const circle = e.target as Konva.Circle;
    const absoluteCx = circle.x();
    const absoluteCy = circle.y();

    // Find the shape to get start/end points
    const shape = shapes.find((s) => s.id === shapeId);
    if (!shape || !shape.points || shape.points.length < 4) return;

    // Convert to relative coordinates
    const cx = absoluteCx - shape.x;
    const cy = absoluteCy - shape.y;

    const x1 = shape.points[0];
    const y1 = shape.points[1];
    const x2 = shape.points[2];
    const y2 = shape.points[3];

    // Calculate new curve points directly for performance (avoiding React state update during drag)
    const curvePoints: number[] = [];
    const steps = 50;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const t2 = t * t;

      const x = mt2 * x1 + 2 * mt * t * cx + t2 * x2;
      const y = mt2 * y1 + 2 * mt * t * cy + t2 * y2;

      curvePoints.push(x, y);
    }

    // Update the visual nodes directly
    const layer = circle.getLayer();
    if (layer) {
      const curveLine = layer.findOne(`.curve-${shapeId}`) as Konva.Line;
      if (curveLine) {
        curveLine.points(curvePoints);
      }

      const guide1 = layer.findOne(`.guide1-${shapeId}`) as Konva.Line;
      if (guide1) {
        guide1.points([shape.x + x1, shape.y + y1, absoluteCx, absoluteCy]);
      }

      const guide2 = layer.findOne(`.guide2-${shapeId}`) as Konva.Line;
      if (guide2) {
        guide2.points([absoluteCx, absoluteCy, shape.x + x2, shape.y + y2]);
      }
    }
  };

  const handleControlPointDragEnd = (
    shapeId: string,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    e.cancelBubble = true;
    const circle = e.target as Konva.Circle;
    const absoluteX = circle.x();
    const absoluteY = circle.y();

    setShapes((prev) => {
      const updatedShapes = prev.map((shape) => {
        if (shape.id === shapeId && shape.tool === "curve") {
          return {
            ...shape,
            controlPoint: {
              x: absoluteX - shape.x,
              y: absoluteY - shape.y,
            },
          };
        }
        return shape;
      });

      return recomputeSeamsForParent(updatedShapes, shapeId);
    });
  };

  const handleNodeAnchorDragStart = (shapeId: string, nodeIndex: number) => {
    // Cache snap points at the start of drag to avoid recalculating on every move
    cachedSnapPoints.current = getAllSnapPoints(shapes, shapeId, nodeIndex);
  };

  const handleNodeAnchorDragMove = (
    shapeId: string,
    nodeIndex: number,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    e.cancelBubble = true;
    const anchor = e.target as Konva.Circle;
    const stage = e.target.getStage();
    if (!stage) return;

    const shape = shapes.find((s) => s.id === shapeId);
    if (!shape || !shape.points) return;

    let absoluteX = anchor.x();
    let absoluteY = anchor.y();

    // Use cached snap points if available, otherwise calculate on-the-fly
    const snapPoints =
      cachedSnapPoints.current || getAllSnapPoints(shapes, shapeId, nodeIndex);

    // Check for nearby snap point
    const nearestSnap = findNearestSnapPoint(absoluteX, absoluteY, snapPoints);

    if (nearestSnap) {
      // Snap to the nearest point
      absoluteX = nearestSnap.x;
      absoluteY = nearestSnap.y;
      anchor.x(absoluteX);
      anchor.y(absoluteY);

      // Show snap indicator
      setActiveSnapPoint(nearestSnap);
    } else {
      // Clear snap indicator
      setActiveSnapPoint(null);
    }

    // Convert to relative coordinates
    const relativeX = absoluteX - shape.x;
    const relativeY = absoluteY - shape.y;

    // Update the points array
    const updatedPoints = [...shape.points];
    updatedPoints[nodeIndex * 2] = relativeX;
    updatedPoints[nodeIndex * 2 + 1] = relativeY;

    // Update the shape's visual representation immediately
    const layer = anchor.getLayer();
    if (layer) {
      const shapeLine = layer.findOne(`#shape-${shapeId}`) as Konva.Line;
      if (shapeLine) {
        shapeLine.points(updatedPoints);
      }
    }
  };

  const handleNodeAnchorDragEnd = (
    shapeId: string,
    nodeIndex: number,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    e.cancelBubble = true;
    const anchor = e.target as Konva.Circle;

    let absoluteX = anchor.x();
    let absoluteY = anchor.y();

    // Use cached snap points if available, otherwise calculate on-the-fly
    const snapPoints =
      cachedSnapPoints.current || getAllSnapPoints(shapes, shapeId, nodeIndex);

    // Check for nearby snap point and apply final snap
    const nearestSnap = findNearestSnapPoint(absoluteX, absoluteY, snapPoints);

    if (nearestSnap) {
      absoluteX = nearestSnap.x;
      absoluteY = nearestSnap.y;
      anchor.x(absoluteX);
      anchor.y(absoluteY);
    }

    // Clear snap indicator and cache
    setActiveSnapPoint(null);
    cachedSnapPoints.current = null;

    setShapes((prev) => {
      const updatedShapes = prev.map((shape) => {
        if (shape.id === shapeId && shape.points) {
          const relativeX = absoluteX - shape.x;
          const relativeY = absoluteY - shape.y;

          const updatedPoints = [...shape.points];
          updatedPoints[nodeIndex * 2] = relativeX;
          updatedPoints[nodeIndex * 2 + 1] = relativeY;

          return {
            ...shape,
            points: updatedPoints,
          };
        }
        return shape;
      });

      return recomputeSeamsForParent(updatedShapes, shapeId);
    });
  };

  const cursor =
    tool === "offset"
      ? "pointer"
      : tool === "pan" || isSpacePressed || isPanDrag
        ? isPanDrag
          ? "grabbing"
          : "grab"
        : tool === "select" || tool === "node"
          ? "default"
          : "crosshair";

  // Calculate measure tooltip data
  const measureTooltipData = useMemo(() => {
    if (!isMeasuring || !measureStart || !measureEnd) {
      return null;
    }
    return calculateMeasureTooltip(
      measureStart,
      measureEnd,
      stageScale,
      stagePosition
    );
  }, [isMeasuring, measureStart, measureEnd, stageScale, stagePosition]);

  const offsetTargetSeams = useMemo(() => {
    if (!offsetTargetId) return [];
    return shapes.filter(
      (s) => s.kind === "seam" && s.parentId === offsetTargetId
    );
  }, [offsetTargetId, shapes]);

  const offsetInputValueCm =
    offsetTargetSeams[0]?.offsetCm ?? offsetValueCm;

  const hasOffsetTarget = Boolean(offsetTargetId);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-canvas-bg dark:bg-canvas-bg-dark relative flex flex-col"
    >
      {showRulers && (
        <div className="flex h-6 shrink-0 z-10 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700">
          <div className="w-6 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark z-20"></div>
          <div className="flex-1 relative overflow-hidden">
            <Ruler orientation="horizontal" />
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0 relative">
        {showRulers && (
          <div className="w-6 shrink-0 h-full border-r border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark z-10 relative overflow-hidden">
            <Ruler orientation="vertical" />
          </div>
        )}

        <div className="flex-1 relative overflow-hidden">
          <Stage
            ref={stageRef}
            width={stageSize.width - (showRulers ? RULER_THICKNESS : 0)}
            height={stageSize.height - (showRulers ? RULER_THICKNESS : 0)}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePosition.x}
            y={stagePosition.y}
            draggable={isPanning}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseEnter={handleStageEnter}
            onMouseLeave={handleStageLeave}
            onWheel={handleWheel}
            onDragMove={handleDragMove}
            onDragEnd={handleDragMove}
            className="h-full w-full"
            style={{ cursor }}
          >
            <Layer>
              <KonvaRect
                x={-WORKSPACE_SIZE / 2}
                y={-WORKSPACE_SIZE / 2}
                width={WORKSPACE_SIZE}
                height={WORKSPACE_SIZE}
                fill={WORKSPACE_BACKGROUND}
                name="workspace-background"
              />

              {/* Grid lines */}
              {showGrid && gridLines}

              {/* Page guides */}
              {showPageGuides && pageGuideRects}

              {shapes.map((shape) => {
                const isSelected = shape.id === selectedShapeId;
                const stroke = isSelected ? "#673b45" : shape.stroke; // Primary color for selection
                const strokeWidth = isSelected
                  ? shape.strokeWidth + 1
                  : shape.strokeWidth;
                const isSeam = shape.kind === "seam";
                const isDraggable = tool === "select" && isSelected && !isSeam;
                const showNodeAnchors = tool === "node" && isSelected && !isSeam;
                const isListening = !isSeam || tool === "offset";

                // For curve shapes, handle differently
                if (shape.tool === "curve") {
                  const points = shape.points || [];
                  const cp = shape.controlPoint;

                  if (points.length >= 4 && cp) {
                    // Create quadratic Bézier curve points
                    const x1 = points[0];
                    const y1 = points[1];
                    const x2 = points[2];
                    const y2 = points[3];
                    const cx = cp.x;
                    const cy = cp.y;

                    // Generate curve points using quadratic Bézier formula
                    const curvePoints: number[] = [];
                    const steps = 50; // Number of segments for smooth curve

                    for (let i = 0; i <= steps; i++) {
                      const t = i / steps;
                      const mt = 1 - t;
                      const mt2 = mt * mt;
                      const t2 = t * t;

                      // Quadratic Bézier formula: B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
                      const x = mt2 * x1 + 2 * mt * t * cx + t2 * x2;
                      const y = mt2 * y1 + 2 * mt * t * cy + t2 * y2;

                      curvePoints.push(x, y);
                    }

                    return (
                      <Fragment key={shape.id}>
                        <Line
                          ref={(node) => {
                            if (node) {
                              shapeRefs.current.set(shape.id, node);
                            } else {
                              shapeRefs.current.delete(shape.id);
                            }
                          }}
                          id={`shape-${shape.id}`}
                          name={`curve-${shape.id}`}
                          x={shape.x}
                          y={shape.y}
                          points={curvePoints}
                          stroke={stroke}
                          strokeWidth={strokeWidth}
                          dash={shape.dash}
                          rotation={shape.rotation || 0}
                          tension={0}
                          lineCap="round"
                          lineJoin="round"
                          draggable={isDraggable}
                          listening={isListening}
                          onClick={() => handleShapeClick(shape.id)}
                          onTap={() => handleShapeClick(shape.id)}
                          onDragStart={(e) =>
                            handleShapeDragStart(shape.id, e)
                          }
                          onDragMove={(e) => handleShapeDragMove(shape.id, e)}
                          onDragEnd={(e) => handleShapeDragEnd(shape.id, e)}
                          onTransformEnd={(e) =>
                            handleShapeTransformEnd(shape.id, e)
                          }
                        />
                        {/* Show control point anchor when selected with select tool */}
                        {isSelected && tool === "select" && (
                          <>
                            {/* Line from start to control point */}
                            <Line
                              key={`${shape.id}-guide1`}
                              name={`guide1-${shape.id}`}
                              points={[
                                shape.x + x1,
                                shape.y + y1,
                                shape.x + cx,
                                shape.y + cy,
                              ]}
                              stroke="#673b45"
                              strokeWidth={1}
                              dash={[5, 5]}
                              opacity={0.5}
                              listening={false}
                            />
                            {/* Line from control point to end */}
                            <Line
                              key={`${shape.id}-guide2`}
                              name={`guide2-${shape.id}`}
                              points={[
                                shape.x + cx,
                                shape.y + cy,
                                shape.x + x2,
                                shape.y + y2,
                              ]}
                              stroke="#673b45"
                              strokeWidth={1}
                              dash={[5, 5]}
                              opacity={0.5}
                              listening={false}
                            />
                            {/* Draggable control point anchor */}
                            <KonvaCircle
                              key={`${shape.id}-control`}
                              x={shape.x + cx}
                              y={shape.y + cy}
                              radius={CONTROL_POINT_RADIUS}
                              fill="#673b45"
                              stroke="#ffffff"
                              strokeWidth={2}
                              draggable={true}
                              onDragStart={handleControlPointDragStart}
                              onDragMove={(e) =>
                                handleControlPointDragMove(shape.id, e)
                              }
                              onDragEnd={(e) =>
                                handleControlPointDragEnd(shape.id, e)
                              }
                            />
                          </>
                        )}
                        {/* Show node anchors when node tool is active */}
                        {showNodeAnchors &&
                          shape.points &&
                          shape.points.map((_, index) => {
                            if (index % 2 !== 0) return null; // Skip y coordinates
                            const nodeIndex = index / 2;
                            const nodeX = shape.x + shape.points![index];
                            const nodeY = shape.y + shape.points![index + 1];
                            const isNodeSelected =
                              selectedNodeIndex === nodeIndex;

                            return (
                              <KonvaCircle
                                key={`${shape.id}-node-${nodeIndex}`}
                                x={nodeX}
                                y={nodeY}
                                radius={NODE_ANCHOR_RADIUS}
                                fill={isNodeSelected ? "#ff6b6b" : "#673b45"}
                                stroke="#ffffff"
                                strokeWidth={2}
                                draggable={true}
                                onClick={() => setSelectedNodeIndex(nodeIndex)}
                                onDragStart={() =>
                                  handleNodeAnchorDragStart(shape.id, nodeIndex)
                                }
                                onDragMove={(e) =>
                                  handleNodeAnchorDragMove(
                                    shape.id,
                                    nodeIndex,
                                    e
                                  )
                                }
                                onDragEnd={(e) =>
                                  handleNodeAnchorDragEnd(
                                    shape.id,
                                    nodeIndex,
                                    e
                                  )
                                }
                              />
                            );
                          })}
                      </Fragment>
                    );
                  }
                  return null;
                }

                // For all other shapes (rectangle, circle, line), render as Line with points
                if (!shape.points || shape.points.length === 0) return null;

                const isClosed =
                  shape.tool === "rectangle" || shape.tool === "circle";

                return (
                  <Fragment key={shape.id}>
                    <Line
                      ref={(node) => {
                        if (node) {
                          shapeRefs.current.set(shape.id, node);
                        } else {
                          shapeRefs.current.delete(shape.id);
                        }
                      }}
                      id={`shape-${shape.id}`}
                      x={shape.x}
                      y={shape.y}
                      points={shape.points}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      dash={shape.dash}
                      fill={isClosed ? shape.fill : undefined}
                      closed={isClosed}
                      rotation={shape.rotation || 0}
                      draggable={isDraggable}
                      listening={isListening}
                      onClick={() => handleShapeClick(shape.id)}
                      onTap={() => handleShapeClick(shape.id)}
                      onDragStart={(e) => handleShapeDragStart(shape.id, e)}
                      onDragMove={(e) => handleShapeDragMove(shape.id, e)}
                      onDragEnd={(e) => handleShapeDragEnd(shape.id, e)}
                      onTransformEnd={(e) =>
                        handleShapeTransformEnd(shape.id, e)
                      }
                    />
                    {/* Show node anchors when node tool is active and shape is selected */}
                    {showNodeAnchors &&
                      shape.points.map((_, index) => {
                        if (index % 2 !== 0) return null; // Skip y coordinates
                        const nodeIndex = index / 2;
                        const nodeX = shape.x + shape.points![index];
                        const nodeY = shape.y + shape.points![index + 1];
                        const isNodeSelected = selectedNodeIndex === nodeIndex;

                        // Highlight adjacent segments
                        const numNodes = shape.points!.length / 2;
                        const prevIndex = (nodeIndex - 1 + numNodes) % numNodes;
                        const nextIndex = (nodeIndex + 1) % numNodes;

                        return (
                          <Fragment key={`${shape.id}-node-${nodeIndex}`}>
                            {/* Highlight segments adjacent to selected node.
                                Only for closed shapes (rectangles, circles) since open shapes
                                (lines) don't have well-defined "adjacent" segments in the same way. */}
                            {isNodeSelected && isClosed && (
                              <>
                                <Line
                                  points={[
                                    shape.x + shape.points![prevIndex * 2],
                                    shape.y + shape.points![prevIndex * 2 + 1],
                                    nodeX,
                                    nodeY,
                                  ]}
                                  stroke="#ff6b6b"
                                  strokeWidth={strokeWidth + 2}
                                  opacity={0.6}
                                  listening={false}
                                />
                                <Line
                                  points={[
                                    nodeX,
                                    nodeY,
                                    shape.x + shape.points![nextIndex * 2],
                                    shape.y + shape.points![nextIndex * 2 + 1],
                                  ]}
                                  stroke="#ff6b6b"
                                  strokeWidth={strokeWidth + 2}
                                  opacity={0.6}
                                  listening={false}
                                />
                              </>
                            )}
                            <KonvaCircle
                              x={nodeX}
                              y={nodeY}
                              radius={NODE_ANCHOR_RADIUS}
                              fill={isNodeSelected ? "#ff6b6b" : "#673b45"}
                              stroke="#ffffff"
                              strokeWidth={2}
                              draggable={true}
                              onClick={() => setSelectedNodeIndex(nodeIndex)}
                              onDragStart={() =>
                                handleNodeAnchorDragStart(shape.id, nodeIndex)
                              }
                              onDragMove={(e) =>
                                handleNodeAnchorDragMove(shape.id, nodeIndex, e)
                              }
                              onDragEnd={(e) =>
                                handleNodeAnchorDragEnd(shape.id, nodeIndex, e)
                              }
                            />
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}

              {/* Snap point indicator - yellow square */}
              {activeSnapPoint && (
                <KonvaRect
                  x={activeSnapPoint.x - 4}
                  y={activeSnapPoint.y - 4}
                  width={8}
                  height={8}
                  fill="#fbbf24"
                  stroke="#f59e0b"
                  strokeWidth={1}
                  listening={false}
                  opacity={0.8}
                />
              )}

              {/* Measure snap preview indicator (blue dot) */}
              {tool === "measure" && measureSnapPreview && (
                <KonvaCircle
                  x={measureSnapPreview.x}
                  y={measureSnapPreview.y}
                  radius={3}
                  fill="#3b82f6"
                  stroke="#ffffff"
                  strokeWidth={1}
                  listening={false}
                  opacity={0.9}
                />
              )}

              {/* Measure tool line and distance display */}
              {isMeasuring && measureStart && measureEnd && (
                <>
                  <Line
                    points={[
                      measureStart.x,
                      measureStart.y,
                      measureEnd.x,
                      measureEnd.y,
                    ]}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dash={[10, 5]}
                    listening={false}
                    opacity={0.8}
                  />
                </>
              )}

              {/* Transformer for selection and transformation */}
              <Transformer
                ref={transformerRef}
                boundBoxFunc={(oldBox, newBox) => {
                  // Limit resize to minimum 5px
                  if (newBox.width < 5 || newBox.height < 5) {
                    return oldBox;
                  }
                  return newBox;
                }}
                enabledAnchors={[
                  "top-left",
                  "top-right",
                  "bottom-left",
                  "bottom-right",
                  "top-center",
                  "bottom-center",
                  "middle-left",
                  "middle-right",
                ]}
                rotateEnabled={true}
                borderStroke="#673b45"
                borderStrokeWidth={2}
                anchorFill="#673b45"
                anchorStroke="#ffffff"
                anchorStrokeWidth={2}
                anchorSize={8}
                rotateAnchorOffset={20}
              />
            </Layer>
          </Stage>

          {/* Overlay UI elements like zoom level could go here if not in toolbar */}
          <div className="absolute bottom-4 left-4 bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs text-text-muted dark:text-text-muted-dark shadow-sm pointer-events-none">
            {Math.round(stageScale * 100)}%
          </div>

          {/* Measure tool tooltip */}
          {measureTooltipData && (
            <div
              className="absolute bg-blue-500 text-white px-3 py-2 rounded-md text-sm font-medium shadow-lg pointer-events-none"
              style={{
                left: `${measureTooltipData.screenX + 15}px`,
                top: `${measureTooltipData.screenY - 10}px`,
                transform: "translateY(-50%)",
              }}
            >
              {measureTooltipData.distanceCm.toFixed(1)} cm
            </div>
          )}
        </div>
      </div>
      {/* Offset tool configuration panel */}
      {tool === "offset" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Margem de Costura:
            </span>
            <input
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={offsetInputValueCm}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                // Allow empty or intermediate states during typing
                if (e.target.value === "" || e.target.value === ".") {
                  return;
                }
                // Clamp value to valid range
                if (!isNaN(value)) {
                  const clampedValue = Math.max(0.1, Math.min(10, value));

                  // Keep default in sync with last used value
                  setOffsetValueCm(clampedValue);

                  // If editing an existing seam allowance, update it too
                  if (offsetTargetId) {
                    setShapes((prev) =>
                      recomputeSeamsForParent(prev, offsetTargetId, clampedValue)
                    );
                  }
                }
              }}
              onBlur={(e) => {
                // On blur, ensure we have a valid value
                const value = parseFloat(e.target.value);
                if (isNaN(value) || value < 0.1) {
                  setOffsetValueCm(1); // Reset to default
                  if (offsetTargetId) {
                    setShapes((prev) =>
                      recomputeSeamsForParent(prev, offsetTargetId, 1)
                    );
                  }
                }
              }}
              className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">cm</span>

            {hasOffsetTarget && offsetTargetSeams.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (!offsetTargetId) return;
                  setShapes((prev) => removeSeamsForParent(prev, offsetTargetId));
                  setOffsetTargetId(null);
                }}
                className="ml-3 inline-flex items-center rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Remover margem
              </button>
            ) : null}

            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
              {hasOffsetTarget
                ? "Clique em outra forma para editar"
                : "Clique em uma forma para adicionar/editar margem"}
            </span>
          </div>
        </div>
      )}
      {/* Dart tool configuration panel */}
      {tool === "dart" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Profundidade:
              </span>
              <input
                type="number"
                min="0.5"
                max="20"
                step="0.1"
                value={dartDepthCm}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value)) {
                    const clampedValue = Math.max(0.5, Math.min(20, value));
                    setDartDepthCm(clampedValue);
                    
                    // If editing an existing dart, update it
                    if (dartTargetId) {
                      const depthPx = clampedValue * PX_PER_CM;
                      const openingPx = dartOpeningCm * PX_PER_CM;
                      setShapes((prev) =>
                        prev.map((shape) => {
                          if (shape.id === dartTargetId) {
                            return applyDartToShape(
                              shape,
                              DEFAULT_DART_POSITION_RATIO,
                              depthPx,
                              openingPx,
                              DEFAULT_DART_EDGE_INDEX
                            );
                          }
                          return shape;
                        })
                      );
                    }
                  }
                }}
                className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">cm</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Abertura:
              </span>
              <input
                type="number"
                min="0.5"
                max="20"
                step="0.1"
                value={dartOpeningCm}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value)) {
                    const clampedValue = Math.max(0.5, Math.min(20, value));
                    setDartOpeningCm(clampedValue);
                    
                    // If editing an existing dart, update it
                    if (dartTargetId) {
                      const depthPx = dartDepthCm * PX_PER_CM;
                      const openingPx = clampedValue * PX_PER_CM;
                      setShapes((prev) =>
                        prev.map((shape) => {
                          if (shape.id === dartTargetId) {
                            return applyDartToShape(
                              shape,
                              DEFAULT_DART_POSITION_RATIO,
                              depthPx,
                              openingPx,
                              DEFAULT_DART_EDGE_INDEX
                            );
                          }
                          return shape;
                        })
                      );
                    }
                  }
                }}
                className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">cm</span>
            </div>

            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
              {dartTargetId
                ? "Clique em outra forma para adicionar pence"
                : "Clique em uma forma para adicionar pence"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
