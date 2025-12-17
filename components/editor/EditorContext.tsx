"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import Konva from "konva";
import { Tool, Shape } from "./types";
import { DEFAULT_UNIT, DEFAULT_PIXELS_PER_UNIT } from "./constants";
import { useHistory } from "./useHistory";
import {
  createDefaultExportSettings,
  type PaperOrientation,
  type PaperSize,
} from "./exportSettings";

export interface PageGuideSettings {
  paperSize: PaperSize;
  orientation: PaperOrientation;
  marginCm: number;
}

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
  getStage: () => Konva.Stage | null;
  registerStage: (stage: Konva.Stage | null) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;

  showPageGuides: boolean;
  setShowPageGuides: (show: boolean) => void;
  pageGuideSettings: PageGuideSettings;
  setPageGuideSettings: (settings: PageGuideSettings) => void;

  measureSnapStrengthPx: number;
  setMeasureSnapStrengthPx: (strengthPx: number) => void;

  // Project management
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  projectName: string;
  setProjectName: (name: string) => void;
  hasUnsavedChanges: boolean;
  markProjectSaved: () => void;
  loadProject: (
    shapes: Shape[],
    projectId: string,
    projectName: string
  ) => void;
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
  const [showGrid, setShowGrid] = useState(true);

  // Project state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Projeto Sem Nome");
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>("[]");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const defaultExportSettings = createDefaultExportSettings();
  const [showPageGuides, setShowPageGuides] = useState(false);
  const [pageGuideSettings, setPageGuideSettings] = useState<PageGuideSettings>(
    {
      paperSize: defaultExportSettings.paperSize,
      orientation: defaultExportSettings.orientation,
      marginCm: defaultExportSettings.marginCm,
    }
  );

  const MEASURE_SNAP_MIN_PX = 12;
  const [measureSnapStrengthPx, setMeasureSnapStrengthPxState] = useState(
    MEASURE_SNAP_MIN_PX
  );

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("inaa:measureSnapStrengthPx");
      if (!raw) return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      setMeasureSnapStrengthPxState(Math.max(MEASURE_SNAP_MIN_PX, parsed));
    } catch {
      // ignore
    }
  }, []);

  const setMeasureSnapStrengthPx = useCallback(
    (strengthPx: number) => {
      const safe = Math.max(MEASURE_SNAP_MIN_PX, Math.round(strengthPx));
      setMeasureSnapStrengthPxState(safe);
      try {
        localStorage.setItem("inaa:measureSnapStrengthPx", String(safe));
      } catch {
        // ignore
      }
    },
    [MEASURE_SNAP_MIN_PX]
  );

  // Store stage reference without triggering re-renders
  const stageRef = useRef<Konva.Stage | null>(null);

  const registerStage = useCallback((stage: Konva.Stage | null) => {
    stageRef.current = stage;
  }, []);

  const getStage = useCallback(() => {
    return stageRef.current;
  }, []);

  // Use the history hook for shapes
  const {
    state: shapes,
    setState: setShapesState,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<Shape[]>([]);

  React.useEffect(() => {
    const current = JSON.stringify(shapes || []);
    setHasUnsavedChanges(current !== lastSavedSnapshot);
  }, [shapes, lastSavedSnapshot]);

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

  // Load a project into the editor
  const loadProject = useCallback(
    (shapes: Shape[], projectId: string, projectName: string) => {
      setShapesState(shapes, false); // Load without saving to history
      setProjectId(projectId);
      setProjectName(projectName);
      setLastSavedSnapshot(JSON.stringify(shapes));
      setSelectedShapeId(null);
    },
    [setShapesState]
  );

  const markProjectSaved = useCallback(() => {
    setLastSavedSnapshot(JSON.stringify(shapes || []));
  }, [shapes]);

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
        getStage,
        registerStage,
        showGrid,
        setShowGrid,
        showPageGuides,
        setShowPageGuides,
        pageGuideSettings,
        setPageGuideSettings,
        measureSnapStrengthPx,
        setMeasureSnapStrengthPx,
        projectId,
        setProjectId,
        projectName,
        setProjectName,
        hasUnsavedChanges,
        markProjectSaved,
        loadProject,
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
