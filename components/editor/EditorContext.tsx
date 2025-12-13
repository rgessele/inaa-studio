"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { Tool, Shape } from "./types";

interface EditorContextType {
  tool: Tool;
  setTool: (tool: Tool) => void;
  shapes: Shape[];
  setShapes: (shapes: Shape[] | ((prev: Shape[]) => Shape[])) => void;
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
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [unit, setUnit] = useState("px");
  const [pixelsPerUnit, setPixelsPerUnit] = useState(1);
  const [showRulers, setShowRulers] = useState(true);
  
  // History for undo/redo
  const [history, setHistory] = useState<Shape[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const updateShapes = (newShapes: Shape[] | ((prev: Shape[]) => Shape[])) => {
    setShapes((prev) => {
      const resolvedShapes = typeof newShapes === "function" ? newShapes(prev) : newShapes;
      
      // Add to history
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(resolvedShapes);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      
      return resolvedShapes;
    });
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setShapes(history[historyIndex - 1]);
    } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setShapes([]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setShapes(history[historyIndex + 1]);
    }
  };

  return (
    <EditorContext.Provider
      value={{
        tool,
        setTool,
        shapes,
        setShapes: updateShapes,
        selectedShapeId,
        setSelectedShapeId,
        scale,
        setScale,
        position,
        setPosition,
        undo,
        redo,
        canUndo: historyIndex >= 0,
        canRedo: historyIndex < history.length - 1,
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
