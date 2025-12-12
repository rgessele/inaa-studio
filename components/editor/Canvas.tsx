"use client";

import { useState, useRef } from "react";
import { Stage, Layer, Line, Rect, Circle } from "react-konva";
import Konva from "konva";

export interface CanvasProps {
  width?: number;
  height?: number;
}

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

export default function Canvas({ width = 800, height = 600 }: CanvasProps) {
  const [tool, setTool] = useState<"select" | "rectangle" | "circle" | "line">(
    "select"
  );
  const [shapes, setShapes] = useState<Shape[]>([]);
  const isDrawing = useRef(false);
  const currentShape = useRef<Shape | null>(null);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (tool === "select") return;

    isDrawing.current = true;

    const newShape: Shape = {
      id: Date.now().toString(),
      tool,
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      radius: 0,
      points: tool === "line" ? [pos.x, pos.y] : [],
      stroke: "#000000",
      strokeWidth: 2,
      fill: tool === "rectangle" || tool === "circle" ? "#cccccc" : undefined,
    };

    currentShape.current = newShape;
    setShapes([...shapes, newShape]);
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing.current) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const lastShape = currentShape.current;
    if (!lastShape) return;

    const updatedShapes = shapes.slice();
    const shapeIndex = updatedShapes.findIndex((s) => s.id === lastShape.id);

    if (shapeIndex === -1) return;

    if (tool === "rectangle") {
      updatedShapes[shapeIndex] = {
        ...lastShape,
        width: pos.x - lastShape.x,
        height: pos.y - lastShape.y,
      };
    } else if (tool === "circle") {
      const dx = pos.x - lastShape.x;
      const dy = pos.y - lastShape.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      updatedShapes[shapeIndex] = {
        ...lastShape,
        radius,
      };
    } else if (tool === "line") {
      updatedShapes[shapeIndex] = {
        ...lastShape,
        points: [lastShape.x, lastShape.y, pos.x, pos.y],
      };
    }

    setShapes(updatedShapes);
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
    currentShape.current = null;
  };

  const clearCanvas = () => {
    setShapes([]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 rounded-lg bg-white p-4 shadow">
        <button
          onClick={() => setTool("select")}
          className={`rounded px-4 py-2 ${
            tool === "select"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          Selecionar
        </button>
        <button
          onClick={() => setTool("rectangle")}
          className={`rounded px-4 py-2 ${
            tool === "rectangle"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          Retângulo
        </button>
        <button
          onClick={() => setTool("circle")}
          className={`rounded px-4 py-2 ${
            tool === "circle"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          Círculo
        </button>
        <button
          onClick={() => setTool("line")}
          className={`rounded px-4 py-2 ${
            tool === "line"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          Linha
        </button>
        <button
          onClick={clearCanvas}
          className="ml-auto rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
        >
          Limpar
        </button>
      </div>

      <div className="rounded-lg bg-white shadow">
        <Stage
          width={width}
          height={height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="border border-gray-300"
        >
          <Layer>
            {/* Grid background */}
            <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />

            {/* Render shapes */}
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
                  <Circle
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

      <div className="rounded-lg bg-white p-4 shadow">
        <p className="text-sm text-gray-600">
          Ferramenta atual: <span className="font-semibold">{tool}</span>
        </p>
        <p className="text-sm text-gray-600">
          Formas desenhadas:{" "}
          <span className="font-semibold">{shapes.length}</span>
        </p>
      </div>
    </div>
  );
}
