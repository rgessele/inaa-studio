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
import { figureWorldBoundingBox } from "./figurePath";
import { figureLocalToWorld } from "./figurePath";

import { add, len, mul, sub } from "./figureGeometry";

import type { Figure } from "./types";
import type { Vec2 } from "./figureGeometry";

function mirrorVec2AcrossLine(p: Vec2, axisPoint: Vec2, axisDirUnit: Vec2): Vec2 {
  const u = axisDirUnit;
  const v = sub(p, axisPoint);
  const projLen = v.x * u.x + v.y * u.y;
  const proj = mul(u, projLen);
  const perpV = sub(v, proj);
  return add(axisPoint, sub(proj, perpV));
}

function mirrorFigureAcrossLinePreserveId(
  original: Figure,
  mirrorId: string,
  axisPointWorld: Vec2,
  axisDirWorld: Vec2
): Figure {
  const axisDirUnit = (() => {
    const l = len(axisDirWorld);
    if (!Number.isFinite(l) || l < 1e-6) return { x: 1, y: 0 };
    return mul(axisDirWorld, 1 / l);
  })();

  const mirroredNodes = original.nodes.map((n) => {
    const pWorld = figureLocalToWorld(original, { x: n.x, y: n.y });
    const p = mirrorVec2AcrossLine(pWorld, axisPointWorld, axisDirUnit);
    const inH = n.inHandle
      ? mirrorVec2AcrossLine(
          figureLocalToWorld(original, n.inHandle),
          axisPointWorld,
          axisDirUnit
        )
      : undefined;
    const outH = n.outHandle
      ? mirrorVec2AcrossLine(
          figureLocalToWorld(original, n.outHandle),
          axisPointWorld,
          axisDirUnit
        )
      : undefined;
    return {
      ...n,
      x: p.x,
      y: p.y,
      inHandle: inH,
      outHandle: outH,
    };
  });

  return {
    ...original,
    id: mirrorId,
    x: 0,
    y: 0,
    rotation: 0,
    nodes: mirroredNodes,
  };
}

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

  // Per-edge anchor preference (session memory)
  getEdgeAnchorPreference: (
    figureId: string,
    edgeId: string
  ) => EdgeAnchor | null;
  setEdgeAnchorPreference: (
    figureId: string,
    edgeId: string,
    anchor: EdgeAnchor
  ) => void;
  deleteSelected: () => void;

  // Clipboard (internal): Copy/Paste selection
  canCopy: boolean;
  copySelection: () => void;
  canPaste: boolean;
  paste: () => void;
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
  projectMeta: DesignDataV2["meta"] | undefined;
  hasUnsavedChanges: boolean;
  markProjectSaved: (snapshot?: {
    figures: Figure[];
    pageGuideSettings: PageGuideSettings;
    guides: GuideLine[];
  }) => void;
  loadProject: (
    figures: Figure[],
    projectId: string,
    projectName: string,
    pageGuideSettings?: PageGuideSettings,
    guides?: GuideLine[],
    meta?: DesignDataV2["meta"]
  ) => void;
}
import type { DesignDataV2 } from "./types";

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

  type ClipboardPayload = {
    figures: Figure[];
    pasteCount: number;
    bbox: { x: number; y: number; width: number; height: number } | null;
  };

  const clipboardRef = useRef<ClipboardPayload | null>(null);
  const [clipboardHasData, setClipboardHasData] = useState(false);

  const [edgeAnchorPrefs, setEdgeAnchorPrefs] = useState<
    Record<string, EdgeAnchor>
  >({});

  const getEdgeAnchorPreference = useCallback(
    (figureId: string, edgeId: string): EdgeAnchor | null => {
      const key = `${figureId}:${edgeId}`;
      return edgeAnchorPrefs[key] ?? null;
    },
    [edgeAnchorPrefs]
  );

  const setEdgeAnchorPreference = useCallback(
    (figureId: string, edgeId: string, anchor: EdgeAnchor) => {
      const key = `${figureId}:${edgeId}`;
      setEdgeAnchorPrefs((prev) =>
        prev[key] === anchor ? prev : { ...prev, [key]: anchor }
      );
    },
    []
  );
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
  const [projectMeta, setProjectMeta] = useState<DesignDataV2["meta"]>();
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

  const pageGuideSettingsRef = useRef<PageGuideSettings>(pageGuideSettings);

  React.useEffect(() => {
    pageGuideSettingsRef.current = pageGuideSettings;
  }, [pageGuideSettings]);

  const [measureDisplayMode, setMeasureDisplayModeState] =
    useState<MeasureDisplayMode>("always");

  const [nodesDisplayMode, setNodesDisplayModeState] =
    useState<NodesDisplayMode>("always");

  const [pointLabelsMode, setPointLabelsMode] =
    useState<PointLabelsMode>("off");

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
      if (
        normalized === "never" ||
        normalized === "always" ||
        normalized === "hover"
      ) {
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
      if (
        normalized === "never" ||
        normalized === "always" ||
        normalized === "hover"
      ) {
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
  const [measureSnapStrengthPx, setMeasureSnapStrengthPxState] =
    useState(MEASURE_SNAP_MIN_PX);

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

  const setGridContrast = useCallback((contrast01: number) => {
    const safe = Math.max(0, Math.min(1, contrast01));
    setGridContrastState(safe);
    try {
      localStorage.setItem("inaa:gridContrast", String(safe));
    } catch {
      // ignore
    }
  }, []);

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
    setGuides((prev) => prev.map((g) => (g.id === id ? { ...g, valuePx } : g)));
  }, []);

  const removeGuide = useCallback((id: string) => {
    setGuides((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const setFigures = useCallback(
    (next: Figure[] | ((prev: Figure[]) => Figure[]), saveHistory = true) => {
      const applyMirrorSync = (prevFigs: Figure[], nextFigs: Figure[]) => {
        if (!nextFigs.length) return nextFigs;

        const prevById = new Map(prevFigs.map((f) => [f.id, f] as const));
        const nextById = new Map(nextFigs.map((f) => [f.id, f] as const));
        const replacements = new Map<string, Figure>();

        for (const original of nextFigs) {
          const link = original.mirrorLink;
          if (!link || link.role !== "original" || link.sync !== true) continue;

          const mirror = nextById.get(link.otherId) ?? null;
          if (!mirror) continue;

          const mirrorLink = mirror.mirrorLink;
          if (
            !mirrorLink ||
            mirrorLink.role !== "mirror" ||
            mirrorLink.sync !== true ||
            mirrorLink.otherId !== original.id ||
            mirrorLink.pairId !== link.pairId
          ) {
            continue;
          }

          const prevOriginal = prevById.get(original.id) ?? null;
          const prevMirror = prevById.get(mirror.id) ?? null;
          const prevLink = prevOriginal?.mirrorLink;

          const originalChanged = prevOriginal !== original;
          const mirrorChanged = prevMirror !== mirror;
          const syncJustEnabled = (prevLink?.sync ?? false) !== true;

          // Also re-sync if axis data changed while staying linked.
          const axisChanged = (() => {
            if (!prevLink) return false;
            if (prevLink.axisPointWorld.x !== link.axisPointWorld.x) return true;
            if (prevLink.axisPointWorld.y !== link.axisPointWorld.y) return true;
            if (prevLink.axisDirWorld.x !== link.axisDirWorld.x) return true;
            if (prevLink.axisDirWorld.y !== link.axisDirWorld.y) return true;
            return false;
          })();

          // Recompute whenever the original changes, the mirror is mutated, or sync was just enabled.
          if (!originalChanged && !mirrorChanged && !syncJustEnabled && !axisChanged) {
            continue;
          }

          const computed = mirrorFigureAcrossLinePreserveId(
            original,
            mirror.id,
            link.axisPointWorld,
            link.axisDirWorld
          );

          const nextMirror: Figure = {
            ...computed,
            mirrorLink: {
              ...mirrorLink,
              sync: true,
              axisPointWorld: link.axisPointWorld,
              axisDirWorld: link.axisDirWorld,
            },
          };

          replacements.set(mirror.id, nextMirror);
        }

        if (!replacements.size) return nextFigs;
        return nextFigs.map((f) => replacements.get(f.id) ?? f);
      };

      const computeAll = (figs: Figure[]) => figs.map(withComputedFigureMeasures);

      if (typeof next === "function") {
        setFiguresState(
          (prev) => {
            const prevSafe = (prev || []) as Figure[];
            const raw = ((next(prevSafe) as Figure[]) || []) as Figure[];
            const synced = applyMirrorSync(prevSafe, raw);
            return computeAll(synced);
          },
          saveHistory
        );
      } else {
        setFiguresState((prev) => {
          const prevSafe = (prev || []) as Figure[];
          const raw = next || [];
          const synced = applyMirrorSync(prevSafe, raw);
          return computeAll(synced);
        }, saveHistory);
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

  const canCopy = useMemo(() => {
    return selectedFigureIds.length > 0 || Boolean(selectedEdge);
  }, [selectedEdge, selectedFigureIds.length]);

  const computeFiguresBoundingBox = useCallback((figs: Figure[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const f of figs) {
      const b = figureWorldBoundingBox(f);
      if (!b) continue;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, []);

  const copySelection = useCallback(() => {
    const currentFigures = figures || [];
    const effectiveSelectedIds =
      selectedFigureIds.length > 0
        ? selectedFigureIds
        : selectedEdge
          ? [selectedEdge.figureId]
          : [];

    if (effectiveSelectedIds.length === 0) return;

    const byId = new Map<string, Figure>(currentFigures.map((f) => [f.id, f]));

    const selectedSet = new Set<string>(effectiveSelectedIds);
    const hasAnyBase = effectiveSelectedIds.some((id) => {
      const f = byId.get(id);
      return Boolean(f) && f!.kind !== "seam";
    });

    const idsToCopy = new Set<string>();

    if (hasAnyBase) {
      for (const id of selectedSet) idsToCopy.add(id);

      // If base figures are selected, include derived seams for those bases.
      for (const f of currentFigures) {
        if (f.kind !== "seam") continue;
        if (!f.parentId) continue;
        if (selectedSet.has(f.parentId)) idsToCopy.add(f.id);
      }
    } else {
      // Seams-only selection: copy only what is selected.
      for (const id of selectedSet) idsToCopy.add(id);
    }

    const orderedToCopy = currentFigures.filter((f) => idsToCopy.has(f.id));
    if (orderedToCopy.length === 0) return;

    const cloned = JSON.parse(JSON.stringify(orderedToCopy)) as Figure[];
    clipboardRef.current = {
      figures: cloned,
      pasteCount: 0,
      bbox: computeFiguresBoundingBox(orderedToCopy),
    };
    setClipboardHasData(true);
  }, [computeFiguresBoundingBox, figures, selectedEdge, selectedFigureIds]);

  const canPaste = clipboardHasData;

  const paste = useCallback(() => {
    const payload = clipboardRef.current;
    if (!payload) return;
    if (!payload.figures.length) return;

    const nextPasteIndex = payload.pasteCount + 1;
    payload.pasteCount = nextPasteIndex;
    const delta = 20 * nextPasteIndex;

    const oldToNewFigId = new Map<string, string>();

    const draft = payload.figures.map((src) => {
      const newFigId = makeId("fig");
      oldToNewFigId.set(src.id, newFigId);

      const oldToNewNodeId = new Map<string, string>();
      const nodes = src.nodes.map((n) => {
        const newNodeId = makeId("n");
        oldToNewNodeId.set(n.id, newNodeId);
        return {
          ...n,
          id: newNodeId,
          inHandle: n.inHandle ? { ...n.inHandle } : undefined,
          outHandle: n.outHandle ? { ...n.outHandle } : undefined,
        };
      });

      const edges = src.edges.map((e) => {
        const from = oldToNewNodeId.get(e.from);
        const to = oldToNewNodeId.get(e.to);
        if (!from || !to) {
          // Should not happen, but keep data consistent.
          return {
            ...e,
            id: makeId("e"),
            from: from ?? e.from,
            to: to ?? e.to,
          };
        }
        return { ...e, id: makeId("e"), from, to };
      });

      return {
        ...src,
        id: newFigId,
        x: src.x + delta,
        y: src.y + delta,
        nodes,
        edges,
        measures: undefined,
      } satisfies Figure;
    });

    const pasted = draft.map((newFig, index) => {
      const src = payload.figures[index];
      if (newFig.kind === "seam" && src.parentId) {
        const mappedParent = oldToNewFigId.get(src.parentId);
        if (mappedParent) {
          return { ...newFig, parentId: mappedParent };
        }
        return { ...newFig, parentId: undefined, sourceSignature: undefined };
      }
      return newFig;
    });

    setFigures((prev) => [...(prev || []), ...pasted], true);
    setSelectedFigureIds(pasted.map((f) => f.id));
  }, [makeId, setFigures, setSelectedFigureIds]);

  // Load a project into the editor
  const loadProject = useCallback(
    (
      figures: Figure[],
      projectId: string,
      projectName: string,
      nextPageGuideSettings?: PageGuideSettings,
      nextGuides?: GuideLine[],
      meta?: DesignDataV2["meta"]
    ) => {
      const effectivePageGuideSettings =
        nextPageGuideSettings ?? pageGuideSettingsRef.current;

      setFigures(figures, false); // Load without saving to history
      setProjectId(projectId);
      setProjectName(projectName);
      setProjectMeta(meta);
      if (nextPageGuideSettings) {
        setPageGuideSettings(nextPageGuideSettings);
      }

      setGuides(Array.isArray(nextGuides) ? nextGuides : []);

      setLastSavedSnapshot(
        JSON.stringify({
          figures,
          pageGuideSettings: effectivePageGuideSettings,
          guides: Array.isArray(nextGuides) ? nextGuides : [],
        })
      );
      setSelectedFigureIdsState([]);
      setSelectedEdge(null);
    },
    [setFigures]
  );

  const markProjectSaved = useCallback(
    (snapshot?: {
      figures: Figure[];
      pageGuideSettings: PageGuideSettings;
      guides: GuideLine[];
    }) => {
      const effective = snapshot ?? {
        figures: figures || [],
        pageGuideSettings,
        guides,
      };

      setLastSavedSnapshot(
        JSON.stringify({
          figures: effective.figures,
          pageGuideSettings: effective.pageGuideSettings,
          guides: effective.guides,
        })
      );
    },
    [figures, guides, pageGuideSettings]
  );

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
          closed: f.closed,
          textValue: f.textValue,
          textFontFamily: f.textFontFamily,
          textFontSizePx: f.textFontSizePx,
          textFill: f.textFill,
          textAlign: f.textAlign,
          textLineHeight: f.textLineHeight,
          textLetterSpacing: f.textLetterSpacing,
          textWidthPx: f.textWidthPx,
          textWrap: f.textWrap,
          textPaddingPx: f.textPaddingPx,
          textBackgroundEnabled: f.textBackgroundEnabled,
          textBackgroundFill: f.textBackgroundFill,
          textBackgroundOpacity: f.textBackgroundOpacity,
          nodes: f.nodes.map((n) => ({
            id: n.id,
            x: n.x,
            y: n.y,
            mode: n.mode,
            inHandle: n.inHandle ? { x: n.inHandle.x, y: n.inHandle.y } : null,
            outHandle: n.outHandle
              ? { x: n.outHandle.x, y: n.outHandle.y }
              : null,
          })),
          edges: f.edges.map((e) => ({
            id: e.id,
            from: e.from,
            to: e.to,
            kind: e.kind,
          })),
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
        if (f.kind === "seam" && f.parentId && idsToDelete.has(f.parentId))
          return false;
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
        getEdgeAnchorPreference,
        setEdgeAnchorPreference,
        deleteSelected,
        canCopy,
        copySelection,
        canPaste,
        paste,
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
        projectMeta,
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
