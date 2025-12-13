"use client";

import { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Line,
  Rect,
  Circle as KonvaCircle,
} from "react-konva";
import Konva from "konva";
import { useEditor } from "./EditorContext";
import { DrawingTool, Shape } from "./types";

import { Ruler } from "./Ruler";

// Large virtual area to keep the background visible while navigating the canvas.
const WORKSPACE_SIZE = 8000; // Increased size
const MIN_ZOOM_SCALE = 0.1;
const MAX_ZOOM_SCALE = 10;
const ZOOM_FACTOR = 1.08;
const DEFAULT_STROKE = "#e5e7eb"; // Light stroke for dark mode
const DEFAULT_FILL = "transparent";
const WORKSPACE_BACKGROUND = "#121212"; // Dark background
const GRID_SIZE = 20;
const GRID_COLOR = "rgba(255, 255, 255, 0.05)";
const CONTROL_POINT_RADIUS = 6; // Radius for control point anchor

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
  } = useEditor();

  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isKeyboardActive, setIsKeyboardActive] = useState(false);
  const [isPanDrag, setIsPanDrag] = useState(false);
  const [isDraggingControlPoint, setIsDraggingControlPoint] = useState(false);
  const isDrawing = useRef(false);
  const currentShape = useRef<Shape | null>(null);
  const currentShapeIndex = useRef<number>(-1);
  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Generate grid lines
  const gridLines = [];
  const numLines = WORKSPACE_SIZE / GRID_SIZE;
  const offset = WORKSPACE_SIZE / 2;

  for (let i = 0; i <= numLines; i++) {
    const pos = i * GRID_SIZE - offset;
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
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isTypingElement(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        setIsSpacePressed(false);
        setIsPanDrag(false);
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
      (tool === "select" && isBackground)
    ) {
      beginPan(stage);
      return;
    }

    if (tool === "select") {
        // Handle selection logic here if needed, Konva handles click on shapes usually
        if (isBackground) {
            setSelectedShapeId(null);
        }
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
      points: drawTool === "line" || drawTool === "curve" ? [pos.x, pos.y] : [],
      controlPoint: drawTool === "curve" ? { x: pos.x, y: pos.y } : undefined,
      stroke: DEFAULT_STROKE,
      strokeWidth: 2,
      fill:
        drawTool === "rectangle" || drawTool === "circle"
          ? DEFAULT_FILL
          : undefined,
    };

    currentShape.current = newShape;
    currentShapeIndex.current = shapes.length;
    setShapes([...shapes, newShape]);
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
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
      const rect = normalizeRectangle(
        { x: lastShape.x, y: lastShape.y },
        pos
      );
      updatedShapes[shapeIndex] = {
        ...lastShape,
        ...rect,
      };
    } else if (lastShape.tool === "circle") {
      const dx = pos.x - lastShape.x;
      const dy = pos.y - lastShape.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      updatedShapes[shapeIndex] = {
        ...lastShape,
        radius,
      };
    } else if (lastShape.tool === "line") {
      updatedShapes[shapeIndex] = {
        ...lastShape,
        points: [lastShape.x, lastShape.y, pos.x, pos.y],
      };
    } else if (lastShape.tool === "curve") {
      // Calculate midpoint for control point
      const midX = (lastShape.x + pos.x) / 2;
      const midY = (lastShape.y + pos.y) / 2;
      updatedShapes[shapeIndex] = {
        ...lastShape,
        points: [lastShape.x, lastShape.y, pos.x, pos.y],
        controlPoint: { x: midX, y: midY },
      };
    }

    setShapes(updatedShapes);
  };

  const handleStageEnter = () => {
    setIsKeyboardActive(true);
  };

  const handleStageLeave = () => {
    setIsKeyboardActive(false);
    handleMouseUp();
  };

  const handleMouseUp = () => {
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
    const stage = e.target as Konva.Stage;
    setStagePosition({ x: stage.x(), y: stage.y() });
  };

  const handleShapeClick = (id: string) => {
      if (tool === 'select') {
          setSelectedShapeId(id);
      }
  }

  const handleControlPointDragStart = () => {
    setIsDraggingControlPoint(true);
  };

  const handleControlPointDragMove = (shapeId: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const circle = e.target as Konva.Circle;
    const pos = { x: circle.x(), y: circle.y() };

    const updatedShapes = shapes.map((shape) => {
      if (shape.id === shapeId && shape.tool === "curve") {
        return {
          ...shape,
          controlPoint: pos,
        };
      }
      return shape;
    });

    setShapes(updatedShapes);
  };

  const handleControlPointDragEnd = () => {
    setIsDraggingControlPoint(false);
  };

  const cursor =
    tool === "pan" || isSpacePressed || isPanDrag
      ? isPanDrag
        ? "grabbing"
        : "grab"
      : tool === "select"
        ? "default"
        : "crosshair";

  const RULER_THICKNESS = 24;

  return (
    <div ref={containerRef} className="h-full w-full bg-canvas-bg dark:bg-canvas-bg-dark relative flex flex-col">
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
              <Rect
                x={-WORKSPACE_SIZE / 2}
                y={-WORKSPACE_SIZE / 2}
                width={WORKSPACE_SIZE}
                height={WORKSPACE_SIZE}
                fill={WORKSPACE_BACKGROUND}
                name="workspace-background"
              />
              
              {/* Grid lines */}
              {gridLines}

              {shapes.map((shape) => {
                const isSelected = shape.id === selectedShapeId;
                const stroke = isSelected ? "#673b45" : shape.stroke; // Primary color for selection
                const strokeWidth = isSelected ? shape.strokeWidth + 1 : shape.strokeWidth;

                if (shape.tool === "rectangle") {
                  return (
                    <Rect
                      key={shape.id}
                      x={shape.x}
                      y={shape.y}
                      width={shape.width}
                      height={shape.height}
                      fill={shape.fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      onClick={() => handleShapeClick(shape.id)}
                      onTap={() => handleShapeClick(shape.id)}
                    />
                  );
                } else if (shape.tool === "circle") {
                  return (
                    <KonvaCircle
                      key={shape.id}
                      x={shape.x}
                      y={shape.y}
                      radius={shape.radius}
                      fill={shape.fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      onClick={() => handleShapeClick(shape.id)}
                      onTap={() => handleShapeClick(shape.id)}
                    />
                  );
                } else if (shape.tool === "line") {
                  return (
                    <Line
                      key={shape.id}
                      points={shape.points}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      onClick={() => handleShapeClick(shape.id)}
                      onTap={() => handleShapeClick(shape.id)}
                    />
                  );
                } else if (shape.tool === "curve") {
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
                      <>
                        <Line
                          key={shape.id}
                          points={curvePoints}
                          stroke={stroke}
                          strokeWidth={strokeWidth}
                          tension={0}
                          lineCap="round"
                          lineJoin="round"
                          onClick={() => handleShapeClick(shape.id)}
                          onTap={() => handleShapeClick(shape.id)}
                        />
                        {/* Show control point anchor when selected */}
                        {isSelected && (
                          <>
                            {/* Line from start to control point */}
                            <Line
                              key={`${shape.id}-guide1`}
                              points={[x1, y1, cx, cy]}
                              stroke="#673b45"
                              strokeWidth={1}
                              dash={[5, 5]}
                              opacity={0.5}
                              listening={false}
                            />
                            {/* Line from control point to end */}
                            <Line
                              key={`${shape.id}-guide2`}
                              points={[cx, cy, x2, y2]}
                              stroke="#673b45"
                              strokeWidth={1}
                              dash={[5, 5]}
                              opacity={0.5}
                              listening={false}
                            />
                            {/* Draggable control point anchor */}
                            <KonvaCircle
                              key={`${shape.id}-control`}
                              x={cx}
                              y={cy}
                              radius={CONTROL_POINT_RADIUS}
                              fill="#673b45"
                              stroke="#ffffff"
                              strokeWidth={2}
                              draggable={true}
                              onDragStart={handleControlPointDragStart}
                              onDragMove={(e) => handleControlPointDragMove(shape.id, e)}
                              onDragEnd={handleControlPointDragEnd}
                            />
                          </>
                        )}
                      </>
                    );
                  }
                }
                return null;
              })}
            </Layer>
          </Stage>
          
          {/* Overlay UI elements like zoom level could go here if not in toolbar */}
          <div className="absolute bottom-4 left-4 bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs text-text-muted dark:text-text-muted-dark shadow-sm pointer-events-none">
              {Math.round(stageScale * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}
