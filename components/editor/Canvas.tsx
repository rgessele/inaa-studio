"use client";

import { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Line,
  Rect,
  Circle as KonvaCircle,
} from "react-konva";
import {
  Circle as CircleIcon,
  Hand,
  LineChart,
  MousePointer2,
  Square,
  Trash2,
} from "lucide-react";
import Konva from "konva";

export interface CanvasProps {
  width?: number;
  height?: number;
}

type Tool = "select" | "pan" | "rectangle" | "circle" | "line";

interface Shape {
  id: string;
  tool: "rectangle" | "circle" | "line";
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: number[];
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

// Virtual workspace used to keep the background visible while o usuário navega pelo canvas.
const WORKSPACE_SIZE = 4000;
const MIN_ZOOM_SCALE = 0.25;
const MAX_ZOOM_SCALE = 6;

export default function Canvas({ width = 800, height = 600 }: CanvasProps) {
  const [tool, setTool] = useState<Tool>("select");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [stageSize, setStageSize] = useState({ width, height });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanDrag, setIsPanDrag] = useState(false);
  const isDrawing = useRef(false);
  const currentShape = useRef<Shape | null>(null);
  const currentShapeIndex = useRef<number>(-1);
  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isCanvasActive = useRef(false);

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
        target.tagName === "BUTTON" ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingElement(event.target)) return;
      if (!isCanvasActive.current) return;
      if (event.code === "Space") {
        event.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isTypingElement(event.target)) return;
      if (!isCanvasActive.current) return;
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
  }, []);

  const isPanning = tool === "pan" || isSpacePressed || isPanDrag;

  const clearCanvas = () => {
    setShapes([]);
  };

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

    if (tool === "select") return;

    const pos = getRelativePointer(stage);
    if (!pos) return;

    isDrawing.current = true;

    const newShape: Shape = {
      id: crypto.randomUUID(),
      tool,
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      radius: 0,
      points: tool === "line" ? [pos.x, pos.y] : [],
      stroke: "#111827",
      strokeWidth: 2,
      fill: tool === "rectangle" || tool === "circle" ? "#e5e7eb" : undefined,
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
      updatedShapes[shapeIndex] = {
        ...lastShape,
        width: pos.x - lastShape.x,
        height: pos.y - lastShape.y,
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
    }

    setShapes(updatedShapes);
  };

  const handleStageEnter = () => {
    isCanvasActive.current = true;
  };

  const handleStageLeave = () => {
    isCanvasActive.current = false;
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
      stageRef.current?.draggable(tool === "pan" || isSpacePressed);
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

    const scaleBy = 1.08;
    const newScale =
      e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
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

  const cursor =
    tool === "pan" || isSpacePressed || isPanDrag
      ? isPanDrag
        ? "grabbing"
        : "grab"
      : tool === "select"
        ? "default"
        : "crosshair";

  const tools = [
    {
      id: "select",
      label: "Selecionar",
      description: "Selecionar e arrastar objetos",
      icon: MousePointer2,
    },
    {
      id: "pan",
      label: "Mover",
      description: "Segure espaço ou botão do meio e arraste",
      icon: Hand,
    },
    {
      id: "rectangle",
      label: "Retângulo",
      description: "Clique e arraste para desenhar retângulos",
      icon: Square,
    },
    {
      id: "circle",
      label: "Círculo",
      description: "Clique e arraste para desenhar círculos",
      icon: CircleIcon,
    },
    {
      id: "line",
      label: "Linha",
      description: "Clique e arraste para desenhar linhas",
      icon: LineChart,
    },
  ] as const;

  const zoomLabel = `${Math.round(stageScale * 100)}%`;

  return (
    <div className="flex h-full w-full gap-4">
      <div className="flex w-64 flex-col rounded-2xl bg-white p-4 shadow">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Ferramentas
          </p>
          <p className="text-sm text-gray-600">
            Pan (espaço/botão do meio) e Zoom com scroll.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {tools.map((item) => {
            const Icon = item.icon;
            const isActive = tool === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTool(item.id)}
                title={item.description}
                aria-label={item.description}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  isActive
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-200 hover:bg-blue-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <span className="font-medium">Zoom</span>
          <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-gray-800 shadow-inner">
            {zoomLabel}
          </span>
        </div>

        <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <p>
            <span className="font-semibold text-gray-700">Pan:</span> espaço ou
            botão do meio + arrastar.
          </p>
          <p>
            <span className="font-semibold text-gray-700">Zoom:</span> roda do
            mouse focada no cursor.
          </p>
          <p>
            <span className="font-semibold text-gray-700">Dicas:</span>{" "}
            arraste o fundo vazio para navegar.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-700">
          <span>
            Formas: <span className="font-semibold">{shapes.length}</span>
          </span>
          <button
            type="button"
            onClick={clearCanvas}
            className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
            title="Limpar todas as formas"
          >
            <Trash2 className="h-4 w-4" />
            Limpar
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden rounded-2xl bg-white shadow">
        <div ref={containerRef} className="h-full w-full">
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
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
                fill="#f8fafc"
                name="workspace-background"
              />

              {shapes.map((shape) => {
                if (shape.tool === "rectangle") {
                  return (
                    <Rect
                      key={shape.id}
                      x={shape.x}
                      y={shape.y}
                      width={shape.width}
                      height={shape.height}
                      fill={shape.fill}
                      stroke={shape.stroke}
                      strokeWidth={shape.strokeWidth}
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
                      stroke={shape.stroke}
                      strokeWidth={shape.strokeWidth}
                    />
                  );
                } else if (shape.tool === "line") {
                  return (
                    <Line
                      key={shape.id}
                      points={shape.points}
                      stroke={shape.stroke}
                      strokeWidth={shape.strokeWidth}
                    />
                  );
                }
                return null;
              })}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}
