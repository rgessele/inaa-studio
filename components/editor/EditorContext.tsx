"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  RefObject,
} from "react";
import Konva from "konva";
import { Tool, Shape } from "./types";
import { DEFAULT_UNIT, DEFAULT_PIXELS_PER_UNIT } from "./constants";
import { useHistory } from "./useHistory";

interface EditorContextType {
  tool: Tool;
  setTool: (tool: Tool) => void;
  shapes: Shape[];
  setShapes: (
    shapes: Shape[] | ((prev: Shape[]) => Shape[]),
    saveHistory?: boolean
  ) => void;
  selectedShapeId: string | null;
  setSelectedShapeId: (id: string | null) => void;
  scale: number;
  setScale: (scale: number) => void;
  position: { x: number; y: number };
  setPosition: (pos: { x: number; y: number }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  unit: string;
  setUnit: (unit: string) => void;
  pixelsPerUnit: number;
  setPixelsPerUnit: (pixels: number) => void;
  showRulers: boolean;
  setShowRulers: (show: boolean) => void;
  stageRef: RefObject<Konva.Stage | null> | null;
  setStageRef: (ref: RefObject<Konva.Stage | null>) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<Tool>("select");
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [unit, setUnit] = useState(DEFAULT_UNIT);
  const [pixelsPerUnit, setPixelsPerUnit] = useState(DEFAULT_PIXELS_PER_UNIT);
  const [showRulers, setShowRulers] = useState(true);
  const [stageRef, setStageRef] = useState<RefObject<Konva.Stage | null> | null>(null);
  const [showGrid, setShowGrid] = useState(true);

  // Use the history hook for shapes
  const {
    state: shapes,
    setState: setShapesState,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<Shape[]>([]);

  const setShapes = useCallback(
    (newShapes: Shape[] | ((prev: Shape[]) => Shape[]), saveHistory = true) => {
      // Cast to match useHistory signature (it accepts null but we always have Shape[])
      if (typeof newShapes === "function") {
        setShapesState((prev) => newShapes(prev || []) as Shape[], saveHistory);
      } else {
        setShapesState(newShapes, saveHistory);
      }
    },
    [setShapesState]
  );

  return (
    <EditorContext.Provider
      value={{
        tool,
        setTool,
        shapes: shapes || [],
        setShapes,
        selectedShapeId,
        setSelectedShapeId,
        scale,
        setScale,
        position,
        setPosition,
        undo,
        redo,
        canUndo,
        canRedo,
        unit,
        setUnit,
        pixelsPerUnit,
        setPixelsPerUnit,
        showRulers,
        setShowRulers,
        stageRef,
        setStageRef,
        showGrid,
        setShowGrid,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (context === undefined) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return context;
}
