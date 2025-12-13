"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
} from "react";
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
    (
      newShapes: Shape[] | ((prev: Shape[]) => Shape[]),
      saveHistory = true
    ) => {
      const resolvedShapes =
        typeof newShapes === "function"
          ? newShapes(shapes || [])
          : newShapes;

      setShapesState(resolvedShapes, saveHistory);
    },
    [shapes, setShapesState]
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
