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
import { Tool, type PageGuideSettings } from "./types";
import { DEFAULT_UNIT, DEFAULT_PIXELS_PER_UNIT } from "./constants";
import { useHistory } from "./useHistory";
import { createDefaultExportSettings } from "./exportSettings";

import type { Figure } from "./types";

interface EditorContextType {
  tool: Tool;
  setTool: (tool: Tool) => void;
  figures: Figure[];
  setFigures: (
    figures: Figure[] | ((prev: Figure[]) => Figure[]),
    saveHistory?: boolean
  ) => void;
  selectedFigureId: string | null;
  setSelectedFigureId: (id: string | null) => void;
  deleteSelected: () => void;
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

  gridContrast: number;
  setGridContrast: (contrast01: number) => void;

  showPageGuides: boolean;
  setShowPageGuides: (show: boolean) => void;
  pageGuideSettings: PageGuideSettings;
  setPageGuideSettings: (settings: PageGuideSettings) => void;

  measureSnapStrengthPx: number;
  setMeasureSnapStrengthPx: (strengthPx: number) => void;

  // Offset tool
  offsetValueCm: number;
  setOffsetValueCm: (value: number) => void;
  offsetTargetId: string | null;
  setOffsetTargetId: (id: string | null) => void;

  // Mirror tool
  mirrorAxis: "vertical" | "horizontal";
  setMirrorAxis: (axis: "vertical" | "horizontal") => void;

  // Unfold tool
  unfoldAxis: "vertical" | "horizontal";
  setUnfoldAxis: (axis: "vertical" | "horizontal") => void;

  // Project management
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  projectName: string;
  setProjectName: (name: string) => void;
  hasUnsavedChanges: boolean;
  markProjectSaved: () => void;
  loadProject: (
    figures: Figure[],
    projectId: string,
    projectName: string,
    pageGuideSettings?: PageGuideSettings
  ) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<Tool>("select");
  const [selectedFigureId, setSelectedFigureId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [unit, setUnit] = useState(DEFAULT_UNIT);
  const [pixelsPerUnit, setPixelsPerUnit] = useState(DEFAULT_PIXELS_PER_UNIT);
  const [showRulers, setShowRulers] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  const GRID_CONTRAST_DEFAULT = 0.5;
  const [gridContrast, setGridContrastState] = useState(GRID_CONTRAST_DEFAULT);

  // Project state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Projeto Sem Nome");
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>("[]");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const defaultExportSettings = createDefaultExportSettings();
  const [showPageGuides, setShowPageGuidesState] = useState(false);
  const [pageGuideSettings, setPageGuideSettings] = useState<PageGuideSettings>(
    {
      paperSize: defaultExportSettings.paperSize,
      orientation: defaultExportSettings.orientation,
      marginCm: defaultExportSettings.marginCm,
    }
  );

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("inaa:showPageGuides");
      if (raw == null) return;
      const normalized = raw.trim().toLowerCase();
      const parsed = normalized === "1" || normalized === "true";
      setShowPageGuidesState(parsed);
    } catch {
      // ignore
    }
  }, []);

  const setShowPageGuides = useCallback((show: boolean) => {
    setShowPageGuidesState(show);
    try {
      localStorage.setItem("inaa:showPageGuides", show ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  const MEASURE_SNAP_MIN_PX = 12;
  const [measureSnapStrengthPx, setMeasureSnapStrengthPxState] = useState(
    MEASURE_SNAP_MIN_PX
  );

  // Offset tool state (default 1cm for seam allowance)
  const [offsetValueCm, setOffsetValueCm] = useState(1);
  const [offsetTargetId, setOffsetTargetId] = useState<string | null>(null);

  // Mirror tool state
  const [mirrorAxis, setMirrorAxis] = useState<"vertical" | "horizontal">(
    "vertical"
  );

  // Unfold tool state
  const [unfoldAxis, setUnfoldAxis] = useState<"vertical" | "horizontal">(
    "vertical"
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

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("inaa:gridContrast");
      if (!raw) return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      setGridContrastState(Math.max(0, Math.min(1, parsed)));
    } catch {
      // ignore
    }
  }, []);

  const setGridContrast = useCallback(
    (contrast01: number) => {
      const safe = Math.max(0, Math.min(1, contrast01));
      setGridContrastState(safe);
      try {
        localStorage.setItem("inaa:gridContrast", String(safe));
      } catch {
        // ignore
      }
    },
    []
  );

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

  // Use the history hook for figures
  const {
    state: figures,
    setState: setFiguresState,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<Figure[]>([]);

  React.useEffect(() => {
    const current = JSON.stringify({ figures: figures || [], pageGuideSettings });
    setHasUnsavedChanges(current !== lastSavedSnapshot);
  }, [figures, lastSavedSnapshot, pageGuideSettings]);

  const setFigures = useCallback(
    (
      next: Figure[] | ((prev: Figure[]) => Figure[]),
      saveHistory = true
    ) => {
      if (typeof next === "function") {
        setFiguresState((prev) => next(prev || []) as Figure[], saveHistory);
      } else {
        setFiguresState(next, saveHistory);
      }
    },
    [setFiguresState]
  );

  // Load a project into the editor
  const loadProject = useCallback(
    (
      figures: Figure[],
      projectId: string,
      projectName: string,
      nextPageGuideSettings?: PageGuideSettings
    ) => {
      setFiguresState(figures, false); // Load without saving to history
      setProjectId(projectId);
      setProjectName(projectName);
      if (nextPageGuideSettings) {
        setPageGuideSettings(nextPageGuideSettings);
      }
      setLastSavedSnapshot(
        JSON.stringify({
          figures,
          pageGuideSettings: nextPageGuideSettings ?? pageGuideSettings,
        })
      );
      setSelectedFigureId(null);
    },
    [pageGuideSettings, setFiguresState]
  );

  const markProjectSaved = useCallback(() => {
    setLastSavedSnapshot(
      JSON.stringify({ figures: figures || [], pageGuideSettings })
    );
  }, [figures, pageGuideSettings]);

  React.useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_TESTS !== "1") return;

    const makeId = (prefix: string): string => {
      return typeof crypto !== "undefined" && crypto.randomUUID
        ? `${prefix}_${crypto.randomUUID()}`
        : `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
    };

    const addTestRectangle = () => {
      const figId = makeId("fig");
      const n1 = { id: makeId("n"), x: 0, y: 0, mode: "corner" as const };
      const n2 = { id: makeId("n"), x: 200, y: 0, mode: "corner" as const };
      const n3 = { id: makeId("n"), x: 200, y: 120, mode: "corner" as const };
      const n4 = { id: makeId("n"), x: 0, y: 120, mode: "corner" as const };

      setFigures((prev) => [
        ...prev,
        {
          id: figId,
          tool: "rectangle",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          nodes: [n1, n2, n3, n4],
          edges: [
            { id: makeId("e"), from: n1.id, to: n2.id, kind: "line" },
            { id: makeId("e"), from: n2.id, to: n3.id, kind: "line" },
            { id: makeId("e"), from: n3.id, to: n4.id, kind: "line" },
            { id: makeId("e"), from: n4.id, to: n1.id, kind: "line" },
          ],
          stroke: "aci7",
          strokeWidth: 2,
          fill: "transparent",
          opacity: 1,
        },
      ]);
      setSelectedFigureId(figId);
    };

    const loadTestProject = (opts?: {
      figures?: Figure[];
      pageGuideSettings?: PageGuideSettings;
      projectId?: string;
      projectName?: string;
    }) => {
      const safe = opts ?? {};
      loadProject(
        safe.figures ?? [],
        safe.projectId ?? "e2e-project",
        safe.projectName ?? "Projeto E2E",
        safe.pageGuideSettings
      );
    };

    (window as unknown as { __INAA_DEBUG__?: unknown }).__INAA_DEBUG__ = {
      getState: () => ({
        tool,
        figuresCount: (figures || []).length,
        selectedFigureId,
        showGrid,
        showPageGuides,
        pageGuideSettings,
        gridContrast,
        measureSnapStrengthPx,
        projectId,
        projectName,
      }),
      addTestRectangle,
      loadTestProject,
    };
  }, [
    figures,
    gridContrast,
    measureSnapStrengthPx,
    pageGuideSettings,
    projectId,
    projectName,
    selectedFigureId,
    showGrid,
    showPageGuides,
    loadProject,
    setFigures,
    setSelectedFigureId,
    tool,
  ]);

  const deleteSelected = useCallback(() => {
    if (!selectedFigureId) return;

    setFigures((prev) => {
      const selected = prev.find((f) => f.id === selectedFigureId);
      if (!selected) return prev;

      // If a derived seam is somehow selected, delete only that seam.
      if (selected.kind === "seam") {
        return prev.filter((f) => f.id !== selectedFigureId);
      }

      // Deleting a base figure also deletes its derived seams.
      return prev.filter(
        (f) => f.id !== selectedFigureId && !(f.kind === "seam" && f.parentId === selectedFigureId)
      );
    });
    setSelectedFigureId(null);

    // Tool state cleanup
    setOffsetTargetId((prev) => (prev === selectedFigureId ? null : prev));
  }, [selectedFigureId, setFigures, setOffsetTargetId]);

  return (
    <EditorContext.Provider
      value={{
        tool,
        setTool,
        figures: figures || [],
        setFigures,
        selectedFigureId,
        setSelectedFigureId,
        deleteSelected,
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

        gridContrast,
        setGridContrast,
        showPageGuides,
        setShowPageGuides,
        pageGuideSettings,
        setPageGuideSettings,
        measureSnapStrengthPx,
        setMeasureSnapStrengthPx,
        offsetValueCm,
        setOffsetValueCm,
        offsetTargetId,
        setOffsetTargetId,
        mirrorAxis,
        setMirrorAxis,
        unfoldAxis,
        setUnfoldAxis,
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
