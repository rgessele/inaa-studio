"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
} from "react";
import Konva from "konva";
import {
  Tool,
  type MeasureDisplayMode,
  type NodesDisplayMode,
  type PointLabelsMode,
  type PageGuideSettings,
  type GuideLine,
  type GuideOrientation,
} from "./types";
import { DEFAULT_UNIT, DEFAULT_PIXELS_PER_UNIT } from "./constants";
import { useHistory } from "./useHistory";
import { createDefaultExportSettings } from "./exportSettings";
import { withComputedFigureMeasures } from "./figureMeasures";

import type { Figure } from "./types";

export type EdgeAnchor = "start" | "end" | "mid";

export type SelectedEdge = {
  figureId: string;
  edgeId: string;
  anchor: EdgeAnchor;
} | null;

interface EditorContextType {
  tool: Tool;
  setTool: (tool: Tool) => void;

  modifierKeys: { shift: boolean; alt: boolean; meta: boolean; ctrl: boolean };
  figures: Figure[];
  setFigures: (
    figures: Figure[] | ((prev: Figure[]) => Figure[]),
    saveHistory?: boolean
  ) => void;
  selectedFigureIds: string[];
  setSelectedFigureIds: (ids: string[]) => void;
  toggleSelectedFigureId: (id: string) => void;
  selectedFigureId: string | null;
  setSelectedFigureId: (id: string | null) => void;

  selectedEdge: SelectedEdge;
  setSelectedEdge: (edge: SelectedEdge) => void;
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

  guides: GuideLine[];
  addGuide: (orientation: GuideOrientation, valuePx: number) => string;
  updateGuide: (id: string, valuePx: number) => void;
  removeGuide: (id: string) => void;
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

  measureDisplayMode: MeasureDisplayMode;
  setMeasureDisplayMode: (mode: MeasureDisplayMode) => void;

  nodesDisplayMode: NodesDisplayMode;
  setNodesDisplayMode: (mode: NodesDisplayMode) => void;

  pointLabelsMode: PointLabelsMode;
  setPointLabelsMode: (mode: PointLabelsMode) => void;

  magnetEnabled: boolean;
  setMagnetEnabled: (enabled: boolean) => void;

  showMinimap: boolean;
  setShowMinimap: (show: boolean) => void;

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
    pageGuideSettings?: PageGuideSettings,
    guides?: GuideLine[]
  ) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<Tool>("select");
  const [modifierKeys, setModifierKeys] = useState<{
    shift: boolean;
    alt: boolean;
    meta: boolean;
    ctrl: boolean;
  }>({ shift: false, alt: false, meta: false, ctrl: false });
  const [selectedFigureIds, setSelectedFigureIdsState] = useState<string[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [unit, setUnit] = useState(DEFAULT_UNIT);
  const [pixelsPerUnit, setPixelsPerUnit] = useState(DEFAULT_PIXELS_PER_UNIT);
  const [showRulers, setShowRulers] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  const [guides, setGuides] = useState<GuideLine[]>([]);

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

  const [measureDisplayMode, setMeasureDisplayModeState] = useState<MeasureDisplayMode>(
    "never"
  );

  const [nodesDisplayMode, setNodesDisplayModeState] = useState<NodesDisplayMode>(
    "never"
  );

  const [pointLabelsMode, setPointLabelsMode] = useState<PointLabelsMode>("off");

  const [magnetEnabled, setMagnetEnabledState] = useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const next = {
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
        ctrl: e.ctrlKey,
      };
      setModifierKeys((prev) =>
        prev.shift === next.shift &&
        prev.alt === next.alt &&
        prev.meta === next.meta &&
        prev.ctrl === next.ctrl
          ? prev
          : next
      );
    };

    const onBlur = () => {
      setModifierKeys({ shift: false, alt: false, meta: false, ctrl: false });
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("inaa:measureDisplayMode");
      if (!raw) return;
      const normalized = raw.trim().toLowerCase();
      if (normalized === "never" || normalized === "always" || normalized === "hover") {
        setMeasureDisplayModeState(normalized);
      }
    } catch {
      // ignore
    }
  }, []);

  const setMeasureDisplayMode = useCallback((mode: MeasureDisplayMode) => {
    setMeasureDisplayModeState(mode);
    try {
      localStorage.setItem("inaa:measureDisplayMode", mode);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("inaa:nodesDisplayMode");
      if (!raw) return;
      const normalized = raw.trim().toLowerCase();
      if (normalized === "never" || normalized === "always" || normalized === "hover") {
        setNodesDisplayModeState(normalized);
      }
    } catch {
      // ignore
    }
  }, []);

  const setNodesDisplayMode = useCallback((mode: NodesDisplayMode) => {
    setNodesDisplayModeState(mode);
    try {
      localStorage.setItem("inaa:nodesDisplayMode", mode);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("inaa:magnetEnabled");
      if (raw == null) return;
      const normalized = raw.trim().toLowerCase();
      const parsed = normalized === "1" || normalized === "true";
      setMagnetEnabledState(parsed);
    } catch {
      // ignore
    }
  }, []);

  const setMagnetEnabled = useCallback((enabled: boolean) => {
    setMagnetEnabledState(enabled);
    try {
      localStorage.setItem("inaa:magnetEnabled", enabled ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

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

  const [showMinimap, setShowMinimapState] = useState(false);

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

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("inaa:showMinimap");
      if (raw === "true") setShowMinimapState(true);
    } catch {
      // ignore
    }
  }, []);

  const setShowMinimap = useCallback((show: boolean) => {
    setShowMinimapState(show);
    try {
      localStorage.setItem("inaa:showMinimap", String(show));
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
    const current = JSON.stringify({
      figures: figures || [],
      pageGuideSettings,
      guides,
    });
    setHasUnsavedChanges(current !== lastSavedSnapshot);
  }, [figures, guides, lastSavedSnapshot, pageGuideSettings]);

  const makeId = useCallback((prefix: string): string => {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? `${prefix}_${crypto.randomUUID()}`
      : `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }, []);

  const addGuide = useCallback(
    (orientation: GuideOrientation, valuePx: number) => {
      const id = makeId("guide");
      setGuides((prev) => [...prev, { id, orientation, valuePx }]);
      return id;
    },
    [makeId]
  );

  const updateGuide = useCallback((id: string, valuePx: number) => {
    setGuides((prev) =>
      prev.map((g) => (g.id === id ? { ...g, valuePx } : g))
    );
  }, []);

  const removeGuide = useCallback((id: string) => {
    setGuides((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const setFigures = useCallback(
    (
      next: Figure[] | ((prev: Figure[]) => Figure[]),
      saveHistory = true
    ) => {
      const computeAll = (figs: Figure[]) => figs.map(withComputedFigureMeasures);

      if (typeof next === "function") {
        setFiguresState(
          (prev) => computeAll((next(prev || []) as Figure[]) || []),
          saveHistory
        );
      } else {
        setFiguresState(computeAll(next), saveHistory);
      }
    },
    [setFiguresState]
  );

  const selectedFigureId = useMemo(() => {
    return selectedFigureIds.length ? selectedFigureIds[0] : null;
  }, [selectedFigureIds]);

  const setSelectedFigureIds = useCallback((ids: string[]) => {
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      deduped.push(id);
    }
    setSelectedFigureIdsState(deduped);
    setSelectedEdge(null);
  }, []);

  const setSelectedFigureId = useCallback((id: string | null) => {
    setSelectedFigureIdsState(id ? [id] : []);
    setSelectedEdge(null);
  }, []);

  const toggleSelectedFigureId = useCallback((id: string) => {
    if (!id) return;
    setSelectedFigureIdsState((prev) => {
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
    setSelectedEdge(null);
  }, []);

  // Load a project into the editor
  const loadProject = useCallback(
    (
      figures: Figure[],
      projectId: string,
      projectName: string,
      nextPageGuideSettings?: PageGuideSettings,
      nextGuides?: GuideLine[]
    ) => {
      setFigures(figures, false); // Load without saving to history
      setProjectId(projectId);
      setProjectName(projectName);
      if (nextPageGuideSettings) {
        setPageGuideSettings(nextPageGuideSettings);
      }

      setGuides(Array.isArray(nextGuides) ? nextGuides : []);

      setLastSavedSnapshot(
        JSON.stringify({
          figures,
          pageGuideSettings: nextPageGuideSettings ?? pageGuideSettings,
          guides: Array.isArray(nextGuides) ? nextGuides : [],
        })
      );
      setSelectedFigureIdsState([]);
      setSelectedEdge(null);
    },
    [pageGuideSettings, setFigures]
  );

  const markProjectSaved = useCallback(() => {
    setLastSavedSnapshot(
      JSON.stringify({ figures: figures || [], pageGuideSettings, guides })
    );
  }, [figures, guides, pageGuideSettings]);

  React.useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_TESTS !== "1") return;

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
        safe.pageGuideSettings,
        []
      );
    };

    (window as unknown as { __INAA_DEBUG__?: unknown }).__INAA_DEBUG__ = {
      getState: () => ({
        tool,
        figuresCount: (figures || []).length,
        selectedFigureId,
        selectedFigureIds,
        showGrid,
        showPageGuides,
        pageGuideSettings,
        gridContrast,
        measureSnapStrengthPx,
        measureDisplayMode,
        nodesDisplayMode,
        pointLabelsMode,
        magnetEnabled,
        guidesCount: guides.length,
        projectId,
        projectName,
      }),
      getFiguresSnapshot: () => {
        return (figures || []).map((f) => ({
          id: f.id,
          tool: f.tool,
          kind: f.kind,
          parentId: f.parentId,
          x: f.x,
          y: f.y,
          rotation: f.rotation || 0,
          nodes: f.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
          edges: f.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })),
        }));
      },
      getSelectedFigureStats: () => {
        const id = selectedFigureId;
        if (!id) return null;
        const fig = (figures || []).find((f) => f.id === id);
        if (!fig) return null;
        return { nodesCount: fig.nodes.length, edgesCount: fig.edges.length };
      },
      countStageNodesByName: (name: string) => {
        const stage = stageRef.current;
        if (!stage) return 0;
        try {
          return stage.find(`.${name}`).length;
        } catch {
          return 0;
        }
      },
      getStageNodeAbsolutePositionsByName: (name: string) => {
        const stage = stageRef.current;
        if (!stage) return [];
        try {
          return stage.find(`.${name}`).map((node) => {
            const p = node.getAbsolutePosition();
            return { x: p.x, y: p.y };
          });
        } catch {
          return [];
        }
      },
      addTestRectangle,
      loadTestProject,
    };
  }, [
    figures,
    gridContrast,
    magnetEnabled,
    measureDisplayMode,
    nodesDisplayMode,
    pointLabelsMode,
    measureSnapStrengthPx,
    pageGuideSettings,
    projectId,
    projectName,
    selectedFigureId,
    selectedFigureIds,
    showGrid,
    showPageGuides,
    loadProject,
    setFigures,
    setSelectedFigureId,
    tool,
    guides,
    makeId,
  ]);

  const deleteSelected = useCallback(() => {
    if (selectedFigureIds.length === 0) return;

    const idsToDelete = new Set<string>(selectedFigureIds);

    setFigures((prev) => {
      // If only derived seams are selected, delete only those seams.
      const seamsOnly = selectedFigureIds.every((id) => {
        const f = prev.find((x) => x.id === id);
        return !!f && f.kind === "seam";
      });

      if (seamsOnly) {
        return prev.filter((f) => !idsToDelete.has(f.id));
      }

      // Deleting base figures also deletes derived seams.
      return prev.filter((f) => {
        if (idsToDelete.has(f.id)) return false;
        if (f.kind === "seam" && f.parentId && idsToDelete.has(f.parentId)) return false;
        return true;
      });
    });

    setSelectedFigureIdsState([]);
    setSelectedEdge(null);

    // Tool state cleanup
    setOffsetTargetId((prev) => (prev && idsToDelete.has(prev) ? null : prev));
  }, [selectedFigureIds, setFigures, setOffsetTargetId]);

  return (
    <EditorContext.Provider
      value={{
        tool,
        setTool,
        modifierKeys,
        figures: figures || [],
        setFigures,
        selectedFigureIds,
        setSelectedFigureIds,
        toggleSelectedFigureId,
        selectedFigureId,
        setSelectedFigureId,

        selectedEdge,
        setSelectedEdge,
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

        guides,
        addGuide,
        updateGuide,
        removeGuide,
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

        measureDisplayMode,
        setMeasureDisplayMode,

        nodesDisplayMode,
        setNodesDisplayMode,

        pointLabelsMode,
        setPointLabelsMode,

        magnetEnabled,
        setMagnetEnabled,

        showMinimap,
        setShowMinimap,

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
