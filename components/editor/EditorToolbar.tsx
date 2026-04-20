"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Magnet } from "lucide-react";
import { useEditor } from "./EditorContext";
import {
  DrawingTool,
  Tool,
  type LineToolMode,
  type MeasureDisplayMode,
  type NodesDisplayMode,
  type PointLabelsMode,
} from "./types";
import { getToolIcon } from "./ToolCursorIcons";
import {
  createDefaultExportSettings,
  generateTiledPDF,
  type ExportSettings,
} from "./export";
import { PAPER_SIZES, PAPER_SIZE_LABELS } from "./exportSettings";
import { toast } from "@/utils/toast";

type ToolbarModeOption<T extends string> = {
  mode: T;
  label: string;
  summary: string;
  details: string[];
  renderIcon: (className?: string) => React.ReactNode;
  testId: string;
};

function renderMeasureDisplayModeIcon(
  mode: MeasureDisplayMode,
  className = "w-5 h-5 stroke-current"
) {
  if (mode === "never") {
    return (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path d="M4 17 L17 4" />
        <path d="M7 20 L20 7" />
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <path d="M9 10 h0" />
        <path d="M11 12 h0" />
        <path d="M13 14 h0" />
        <path d="M15 16 h0" />
      </svg>
    );
  }

  if (mode === "always") {
    return (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <path d="M8 9 v2" />
        <path d="M11 9 v4" />
        <path d="M14 9 v2" />
        <path d="M17 9 v4" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M8 9 v2" />
      <path d="M11 9 v4" />
      <path d="M14 9 v2" />
      <path d="M17 9 v4" />
      <path d="M20 20 l-3 -1 1 3 1 -2 1 0 z" />
    </svg>
  );
}

function renderNodesDisplayModeIcon(
  mode: NodesDisplayMode,
  className = "w-5 h-5 stroke-current"
) {
  if (mode === "never") {
    return (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path d="M5 19 L19 5" />
        <circle cx="7" cy="7" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="17" cy="17" r="1.5" />
      </svg>
    );
  }

  if (mode === "always") {
    return (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <circle cx="7" cy="7" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="17" cy="17" r="1.8" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <circle cx="7" cy="7" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="17" cy="17" r="1.8" />
      <path d="M20 20 l-3 -1 1 3 1 -2 1 0 z" />
    </svg>
  );
}

function renderPointLabelsModeIcon(
  mode: PointLabelsMode,
  className = "w-5 h-5"
) {
  const badge = (ch: string, showReset: boolean) => (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="9" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        {ch}
      </text>
      {showReset ? <path d="M16.5 8.5a4.5 4.5 0 0 0-6.8-1.2" /> : null}
      {showReset ? <path d="M9.5 6.4H6.8V9" /> : null}
    </svg>
  );

  switch (mode) {
    case "off":
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <path d="M5 19L19 5" />
          <path d="M7 7h7l3 3-7 7-3-3V7z" />
        </svg>
      );
    case "numGlobal":
      return badge("1", false);
    case "numPerFigure":
      return badge("1", true);
    case "alphaGlobal":
      return badge("A", false);
    case "alphaPerFigure":
    default:
      return badge("A", true);
  }
}

const MEASURE_MODE_OPTIONS: ToolbarModeOption<MeasureDisplayMode>[] = [
  {
    mode: "never",
    label: "Nunca",
    summary: "Oculto",
    details: ["Oculta todas as medidas do canvas."],
    renderIcon: (className) => renderMeasureDisplayModeIcon("never", className),
    testId: "measures-mode-option-never",
  },
  {
    mode: "always",
    label: "Sempre",
    summary: "Todas as figuras",
    details: ["Exibe as medidas de todas as figuras do canvas."],
    renderIcon: (className) =>
      renderMeasureDisplayModeIcon("always", className),
    testId: "measures-mode-option-always",
  },
  {
    mode: "hover",
    label: "Hover",
    summary: "Figura em foco",
    details: [
      "Exibe as medidas da figura em hover e da figura selecionada.",
    ],
    renderIcon: (className) => renderMeasureDisplayModeIcon("hover", className),
    testId: "measures-mode-option-hover",
  },
];

const NODES_MODE_OPTIONS: ToolbarModeOption<NodesDisplayMode>[] = [
  {
    mode: "never",
    label: "Nunca",
    summary: "Oculto",
    details: ["Oculta os nós das figuras fora do modo de edição de nós."],
    renderIcon: (className) => renderNodesDisplayModeIcon("never", className),
    testId: "nodes-mode-option-never",
  },
  {
    mode: "always",
    label: "Sempre",
    summary: "Todas as figuras",
    details: ["Exibe os nós de todas as figuras no canvas."],
    renderIcon: (className) => renderNodesDisplayModeIcon("always", className),
    testId: "nodes-mode-option-always",
  },
  {
    mode: "hover",
    label: "Hover",
    summary: "Figura em foco",
    details: ["Exibe os nós da figura em hover e da figura selecionada."],
    renderIcon: (className) => renderNodesDisplayModeIcon("hover", className),
    testId: "nodes-mode-option-hover",
  },
];

const POINT_LABELS_MODE_OPTIONS: ToolbarModeOption<PointLabelsMode>[] = [
  {
    mode: "off",
    label: "Desligado",
    summary: "Sem rótulos",
    details: ["Não exibe rótulos de pontos no canvas nem na exportação."],
    renderIcon: (className) => renderPointLabelsModeIcon("off", className),
    testId: "point-labels-mode-option-off",
  },
  {
    mode: "numGlobal",
    label: "Numeração global",
    summary: "1, 2, 3...",
    details: [
      "Numera todos os pontos em sequência única no projeto inteiro.",
    ],
    renderIcon: (className) =>
      renderPointLabelsModeIcon("numGlobal", className),
    testId: "point-labels-mode-option-numGlobal",
  },
  {
    mode: "numPerFigure",
    label: "Numeração por figura",
    summary: "Reinicia por figura",
    details: ["Numera os pontos reiniciando a contagem em cada figura."],
    renderIcon: (className) =>
      renderPointLabelsModeIcon("numPerFigure", className),
    testId: "point-labels-mode-option-numPerFigure",
  },
  {
    mode: "alphaGlobal",
    label: "Alfabético global",
    summary: "A, B, C...",
    details: [
      "Nomeia os pontos com letras em sequência única no projeto inteiro.",
    ],
    renderIcon: (className) =>
      renderPointLabelsModeIcon("alphaGlobal", className),
    testId: "point-labels-mode-option-alphaGlobal",
  },
  {
    mode: "alphaPerFigure",
    label: "Alfabético por figura",
    summary: "Reinicia por figura",
    details: ["Nomeia os pontos com letras reiniciando em cada figura."],
    renderIcon: (className) =>
      renderPointLabelsModeIcon("alphaPerFigure", className),
    testId: "point-labels-mode-option-alphaPerFigure",
  },
];

function getToolbarModeOption<T extends string>(
  options: ToolbarModeOption<T>[],
  mode: T
) {
  return options.find((option) => option.mode === mode) ?? options[0];
}

export function EditorToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    readOnly,
    tool,
    setTool,
    setFigures,
    undo,
    redo,
    canUndo,
    canRedo,
    figures,
    getStage,
    setShowGrid,
    setPageGuideSettings,
    measureDisplayMode,
    setMeasureDisplayMode,
    nodesDisplayMode,
    setNodesDisplayMode,
    pointLabelsMode,
    setPointLabelsMode,
    magnetEnabled,
    setMagnetEnabled,
    magnetJoinEnabled,
    setMagnetJoinEnabled,
    selectedFigureId,
    deleteSelected,
    canCopy,
    copySelection,
    canPaste,
    paste,
    lineToolMode,
    setLineToolMode,
  } = useEditor();
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const [exportSettings, setExportSettings] = useState<ExportSettings>(() =>
    createDefaultExportSettings()
  );
  const [customMargins, setCustomMargins] = useState(false);
  const [includeMolds, setIncludeMolds] = useState(true);
  const [includeConventionalFigures, setIncludeConventionalFigures] =
    useState(false);
  const [includePatternName, setIncludePatternName] = useState(true);
  const [includePatternTexts, setIncludePatternTexts] = useState(true);
  const [includePiques, setIncludePiques] = useState(true);
  const [includeSeamAllowance, setIncludeSeamAllowance] = useState(true);
  const [includePointLabels, setIncludePointLabels] = useState(false);
  const [includeMeasures, setIncludeMeasures] = useState(true);
  const hasAutoExportedRef = useRef(false);
  const embedded =
    searchParams.get("embedded") === "1" || searchParams.get("embed") === "1";
  const printOnly = searchParams.get("printOnly") === "1";
  const printOnlyReadOnly = readOnly && printOnly;
  const noShapesToExportMessage = useMemo(() => {
    const moldCount = figures.filter((f) => f.kind === "mold").length;
    const printableMoldCount = figures.filter(
      (f) =>
        f.kind === "mold" &&
        f.moldMeta?.printEnabled !== false &&
        f.moldMeta?.visible !== false
    ).length;
    const conventionalCount = figures.filter(
      (f) => f.kind !== "mold" && f.kind !== "seam"
    ).length;

    if (!figures.length) {
      return "Não há nada para exportar. Desenhe algo primeiro.";
    }

    if (!includeMolds && !includeConventionalFigures) {
      return 'Ative "Imprimir moldes" ou "Imprimir figuras convencionais" para exportar.';
    }

    if (includeMolds && moldCount > 0 && printableMoldCount === 0) {
      return "Nenhum molde ativo para impressão. Verifique visibilidade e impressão na lista de moldes.";
    }

    if (!includeConventionalFigures && conventionalCount > 0 && printableMoldCount === 0) {
      return 'Nenhum molde ativo para impressão. Extraia um molde ou ative "Imprimir figuras convencionais".';
    }

    return "Nenhuma figura ativa para impressão.";
  }, [figures, includeConventionalFigures, includeMolds]);

  const getExportShapes = useCallback(() => {
    const activeMolds = includeMolds
      ? figures.filter(
          (f) =>
            f.kind === "mold" &&
            f.moldMeta?.printEnabled !== false &&
            f.moldMeta?.visible !== false
        )
      : [];

    const conventionalFigures = includeConventionalFigures
      ? figures.filter((f) => f.kind !== "mold" && f.kind !== "seam")
      : [];

    const exportedBaseIds = new Set(
      [...activeMolds, ...conventionalFigures].map((f) => f.id)
    );
    const seams =
      includeSeamAllowance
        ? figures.filter(
            (f) =>
              f.kind === "seam" &&
              !!f.parentId &&
              exportedBaseIds.has(f.parentId)
          )
        : [];

    return [...activeMolds, ...seams, ...conventionalFigures];
  }, [figures, includeConventionalFigures, includeMolds, includeSeamAllowance]);

  const urlWantsExportModal = useMemo(() => {
    return searchParams.get("export") === "pdf";
  }, [searchParams]);

  const isExportModalOpen = showExportModal || urlWantsExportModal;

  const closeExportModal = () => {
    if (isExportingPdf) {
      return;
    }
    setShowExportModal(false);

    if (urlWantsExportModal) {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("export");
      nextParams.delete("autoExport");
      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }

    if (embedded) {
      window.parent?.postMessage({ type: "inaa:exportModalClosed" }, "*");
    }
  };

  useEffect(() => {
    setPageGuideSettings({
      paperSize: exportSettings.paperSize,
      orientation: exportSettings.orientation,
      marginCm: customMargins ? exportSettings.marginCm : 1,
    });
  }, [customMargins, exportSettings, setPageGuideSettings]);

  useEffect(() => {
    const exportParam = searchParams.get("export");
    const shouldAutoExportPdf =
      exportParam === "pdf" && searchParams.get("autoExport") === "1";

    if (!shouldAutoExportPdf || hasAutoExportedRef.current) {
      return;
    }

    let cancelled = false;
    const tryExport = async () => {
      if (cancelled || hasAutoExportedRef.current) {
        return;
      }

      const stage = getStage();
      if (!stage) {
        window.setTimeout(tryExport, 200);
        return;
      }

      hasAutoExportedRef.current = true;

      const resolvedSettings: ExportSettings = {
        ...exportSettings,
        marginCm: customMargins ? exportSettings.marginCm : 1,
        toolFilter: {
          ...exportSettings.toolFilter,
          text: includePatternTexts,
        },
      };

      const exportShapes = getExportShapes();
      if (!exportShapes.length) {
        toast(noShapesToExportMessage, "error");
        return;
      }

      await generateTiledPDF(
        stage,
        exportShapes,
        () => setShowGrid(false),
        () => setShowGrid(true),
        resolvedSettings,
        {
          includePointLabels,
          includeMeasures,
          includePatternName,
          includePiques,
          pointLabelsMode,
        }
      );
    };

    tryExport();

    return () => {
      cancelled = true;
    };
  }, [
    customMargins,
    exportSettings,
    getStage,
    includePointLabels,
    includeMeasures,
    includeMolds,
    includeConventionalFigures,
    includePatternName,
    includePatternTexts,
    includePiques,
    includeSeamAllowance,
    noShapesToExportMessage,
    pointLabelsMode,
    searchParams,
    setShowGrid,
    figures,
    getExportShapes,
  ]);

  const handleToolChange = (newTool: Tool) => {
    setTool(newTool);
  };

  const magnetIcon = <Magnet className="w-5 h-5" strokeWidth={1.5} />;
  const activeMeasureModeOption = getToolbarModeOption(
    MEASURE_MODE_OPTIONS,
    measureDisplayMode
  );
  const activeNodesModeOption = getToolbarModeOption(
    NODES_MODE_OPTIONS,
    nodesDisplayMode
  );
  const activePointLabelsModeOption = getToolbarModeOption(
    POINT_LABELS_MODE_OPTIONS,
    pointLabelsMode
  );

  const isMac = useSyncExternalStore(
    () => () => {
      // no-op: OS does not change during a session
    },
    () => /Mac|iPhone|iPod|iPad/.test(navigator.userAgent),
    () => false
  );

  const toolbarRef = React.useRef<HTMLElement | null>(null);
  const toolbarListRef = React.useRef<HTMLDivElement | null>(null);
  const toolbarBottomRef = React.useRef<HTMLDivElement | null>(null);
  const [isCompactToolbar, setIsCompactToolbar] = React.useState(false);

  const rafRef = React.useRef<number | null>(null);
  const scheduleCompactCheck = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (rafRef.current != null) return;

    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;

      const toolbar = toolbarRef.current;
      const list = toolbarListRef.current;
      const bottom = toolbarBottomRef.current;
      if (!toolbar || !list || !bottom) return;

      const prevToolbarWidth = toolbar.style.width;
      const prevGridTemplateColumns = list.style.gridTemplateColumns;

      // Measure using the 1-column layout (narrow). If it overflows, enable 2 columns.
      toolbar.style.width = "3rem";
      list.style.gridTemplateColumns = "repeat(1, minmax(0, 1fr))";

      // Force reflow before measuring.
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      list.offsetHeight;

      const overflows = list.scrollHeight > list.clientHeight + 1;

      toolbar.style.width = prevToolbarWidth;
      list.style.gridTemplateColumns = prevGridTemplateColumns;

      setIsCompactToolbar(overflows);
    });
  }, []);

  React.useLayoutEffect(() => {
    scheduleCompactCheck();
  }, [scheduleCompactCheck]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("resize", scheduleCompactCheck);
    return () => window.removeEventListener("resize", scheduleCompactCheck);
  }, [scheduleCompactCheck]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const ro = new ResizeObserver(() => scheduleCompactCheck());
    ro.observe(toolbar);
    return () => ro.disconnect();
  }, [scheduleCompactCheck]);

  const saveTooltip = useDelayedTooltip(true);
  const exportTooltip = useDelayedTooltip(true);
  const undoTooltip = useDelayedTooltip(true);
  const redoTooltip = useDelayedTooltip(true);
  const eraseTooltip = useDelayedTooltip(true);
  const clearTooltip = useDelayedTooltip(true);

  const handleClear = () => {
    setIsClearConfirmOpen(true);
  };

  useEffect(() => {
    if (!isClearConfirmOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsClearConfirmOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isClearConfirmOpen]);

  const handleExportPDF = async () => {
    if (isExportingPdf) return;
    const stage = getStage();
    if (!stage) {
      toast("Canvas ainda não está pronto.", "error");
      return;
    }

    setIsExportingPdf(true);
    // Let React paint the loading state before the heavy PDF work.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );

    const resolvedSettings: ExportSettings = {
      ...exportSettings,
      marginCm: customMargins ? exportSettings.marginCm : 1,
      toolFilter: {
        ...exportSettings.toolFilter,
        text: includePatternTexts,
      },
    };

    const exportShapes = getExportShapes();
    if (!exportShapes.length) {
      toast(noShapesToExportMessage, "error");
      setIsExportingPdf(false);
      return;
    }

    try {
      await generateTiledPDF(
        stage,
        exportShapes,
        () => setShowGrid(false),
        () => setShowGrid(true),
        resolvedSettings,
        {
          includePointLabels,
          includeMeasures,
          includePatternName,
          includePiques,
          pointLabelsMode,
        }
      );
      closeExportModal();
    } finally {
      setIsExportingPdf(false);
    }
  };

  const toggleToolFilter = (drawingTool: DrawingTool) => {
    setExportSettings((prev) => ({
      ...prev,
      toolFilter: {
        ...prev.toolFilter,
        [drawingTool]: !prev.toolFilter[drawingTool],
      },
    }));
  };

  return (
    <>
      {embedded ? null : (
        <aside
          ref={toolbarRef}
          className={
            isCompactToolbar
              ? "w-24 bg-surface-light dark:bg-surface-dark border-r border-gray-200 dark:border-gray-700 flex flex-col relative z-50 shadow-subtle shrink-0 px-2 py-3"
              : "w-12 bg-surface-light dark:bg-surface-dark border-r border-gray-200 dark:border-gray-700 flex flex-col relative z-50 shadow-subtle shrink-0 px-2 py-3"
          }
        >
          {printOnlyReadOnly ? (
            <div className="flex-1 flex items-start justify-center">
              <button
                onClick={() => setShowExportModal(true)}
                onMouseEnter={exportTooltip.onMouseEnter}
                onMouseLeave={exportTooltip.onMouseLeave}
                className="group relative w-full aspect-square flex items-center justify-center rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
                aria-label="Imprimir"
                type="button"
              >
                <span className="material-symbols-outlined text-[22px]">
                  download
                </span>
                <ToolbarTooltip
                  isMac={isMac}
                  title="Imprimir"
                  expanded={exportTooltip.expanded}
                  details={["Exportação e impressão em PDF."]}
                />
              </button>
            </div>
          ) : null}

          <div
            ref={toolbarListRef}
            className={`${
              isCompactToolbar
                ? "grid grid-cols-2 content-start justify-items-stretch gap-1 flex-1 min-h-0"
                : "grid grid-cols-1 content-start justify-items-stretch gap-1 flex-1 min-h-0"
            }${printOnlyReadOnly ? " hidden" : ""}`}
          >
            <button
              onClick={() => {
                if (typeof window === "undefined") return;
                window.dispatchEvent(new CustomEvent("inaa:save"));
              }}
              onMouseEnter={saveTooltip.onMouseEnter}
              onMouseLeave={saveTooltip.onMouseLeave}
              className="group relative w-full aspect-square flex items-center justify-center rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
              aria-label="Salvar"
            >
              <span className="material-symbols-outlined text-[22px]">
                save
              </span>
              <ToolbarTooltip
                isMac={isMac}
                title="Salvar"
                shortcuts={[{ cmdOrCtrl: true, key: "S" }]}
                expanded={saveTooltip.expanded}
                details={[
                  "Salva as alterações do projeto.",
                  "Se ainda não existir, abre o fluxo de Salvar como.",
                ]}
              />
            </button>

            <button
              onClick={() => setShowExportModal(true)}
              onMouseEnter={exportTooltip.onMouseEnter}
              onMouseLeave={exportTooltip.onMouseLeave}
              className="group relative w-full aspect-square flex items-center justify-center rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
              aria-label="Exportar"
            >
              <span className="material-symbols-outlined text-[22px]">
                download
              </span>
                <ToolbarTooltip
                  isMac={isMac}
                  title="Exportar"
                  expanded={exportTooltip.expanded}
                  details={[
                    "Abre as opções de exportação e impressão.",
                    "Use para gerar o PDF paginado de impressão.",
                  ]}
                />
              </button>

            <div className="col-span-full h-px w-full bg-gray-200 dark:bg-gray-700 my-1"></div>

            <button
              onClick={undo}
              disabled={!canUndo}
              onMouseEnter={undoTooltip.onMouseEnter}
              onMouseLeave={undoTooltip.onMouseLeave}
              className={`group relative w-full aspect-square flex items-center justify-center rounded transition-all ${
                !canUndo
                  ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              }`}
              aria-label="Desfazer"
            >
              <span className="material-symbols-outlined text-[22px]">
                undo
              </span>
              <ToolbarTooltip
                isMac={isMac}
                title="Desfazer"
                shortcuts={[{ cmdOrCtrl: true, key: "Z" }]}
                expanded={undoTooltip.expanded}
                details={["Desfaz a última ação."]}
              />
            </button>

            <button
              onClick={redo}
              disabled={!canRedo}
              onMouseEnter={redoTooltip.onMouseEnter}
              onMouseLeave={redoTooltip.onMouseLeave}
              className={`group relative w-full aspect-square flex items-center justify-center rounded transition-all ${
                !canRedo
                  ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              }`}
              aria-label="Refazer"
            >
              <span className="material-symbols-outlined text-[22px]">
                redo
              </span>
              <ToolbarTooltip
                isMac={isMac}
                title="Refazer"
                shortcuts={[
                  { cmdOrCtrl: true, shift: true, key: "Z" },
                  { cmdOrCtrl: true, key: "Y" },
                ]}
                expanded={redoTooltip.expanded}
                details={["Refaz a última ação desfeita."]}
              />
            </button>

            <button
              type="button"
              onClick={copySelection}
              disabled={!canCopy}
              className={`group relative w-full aspect-square flex items-center justify-center rounded transition-all ${
                !canCopy
                  ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              }`}
              aria-label="Copiar"
            >
              <span className="material-symbols-outlined text-[22px]">
                content_copy
              </span>
              <ToolbarTooltip
                isMac={isMac}
                title="Copiar"
                shortcuts={[{ cmdOrCtrl: true, key: "C" }]}
                expanded={undoTooltip.expanded}
                details={["Copia a seleção para o clipboard interno."]}
              />
            </button>

            <button
              type="button"
              onClick={paste}
              disabled={!canPaste}
              className={`group relative w-full aspect-square flex items-center justify-center rounded transition-all ${
                !canPaste
                  ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              }`}
              aria-label="Colar"
            >
              <span className="material-symbols-outlined text-[22px]">
                content_paste
              </span>
              <ToolbarTooltip
                isMac={isMac}
                title="Colar"
                shortcuts={[{ cmdOrCtrl: true, key: "V" }]}
                expanded={undoTooltip.expanded}
                details={["Cola criando novas figuras com offset."]}
              />
            </button>

            <button
              type="button"
              onClick={deleteSelected}
              disabled={!selectedFigureId}
              onMouseEnter={eraseTooltip.onMouseEnter}
              onMouseLeave={eraseTooltip.onMouseLeave}
              className={`group relative w-full aspect-square flex items-center justify-center rounded transition-all ${
                !selectedFigureId
                  ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              }`}
              aria-label="Borracha"
            >
              <span className="material-symbols-outlined text-[22px]">
                backspace
              </span>
              <ToolbarTooltip
                isMac={isMac}
                title="Borracha"
                shortcuts={[{ key: "Backspace" }, { key: "Delete" }]}
                expanded={eraseTooltip.expanded}
                details={["Apaga a figura selecionada."]}
              />
            </button>

            <div className="col-span-full h-px w-full bg-gray-200 dark:bg-gray-700 my-1"></div>

            <ToolButton
              active={tool === "select"}
              onClick={() => handleToolChange("select")}
              icon="arrow_selector_tool"
              isMac={isMac}
              title="Selecionar"
              shortcuts={[{ key: "V" }]}
              details={[
                "Clique em objetos para selecionar.",
                "Arraste para mover o objeto selecionado.",
              ]}
            />

            <ToolButton
              active={tool === "node"}
              onClick={() => handleToolChange("node")}
              icon="radio_button_unchecked"
              isMac={isMac}
              title="Editar nós"
              shortcuts={[{ key: "N" }]}
              details={[
                "Clique em uma forma para exibir os nós.",
                "Arraste os nós para deformar a geometria.",
                "Clique na aresta para inserir um nó (split).",
              ]}
              customIcon={getToolIcon("node", "toolbar")}
            />

            <ToolButton
              active={tool === "pan"}
              onClick={() => handleToolChange("pan")}
              icon="pan_tool"
              isMac={isMac}
              title="Mover"
              shortcuts={[{ key: "H" }]}
              details={[
                "Clique e arraste para mover o canvas.",
                "Segure Espaço para pan temporário.",
              ]}
            />

            <div className="col-span-full h-px w-full bg-gray-200 dark:bg-gray-700 my-1"></div>

            <ToolButton
              active={tool === "rectangle"}
              onClick={() => handleToolChange("rectangle")}
              icon="rectangle"
              isMac={isMac}
              title="Retângulo"
              shortcuts={[{ key: "R" }]}
              details={[
                "Clique e arraste para desenhar.",
                "Segure Shift para manter 1:1 (quadrado).",
                "Segure Alt para desenhar do centro.",
              ]}
              filled
            />

            <ToolButton
              active={tool === "circle"}
              onClick={() => handleToolChange("circle")}
              icon="circle"
              isMac={isMac}
              title="Círculo"
              shortcuts={[{ key: "C" }]}
              details={[
                "Clique e arraste para desenhar por canto (elipse).",
                "Segure Shift para círculo perfeito.",
                "Segure Alt para desenhar do centro.",
              ]}
              filled
            />

            <LineToolButton
              active={tool === "line"}
              onActivate={() => handleToolChange("line")}
              lineToolMode={lineToolMode}
              onChangeLineToolMode={setLineToolMode}
              isMac={isMac}
            />

            <ToolButton
              active={tool === "curve"}
              onClick={() => handleToolChange("curve")}
              icon="timeline"
              isMac={isMac}
              title="Curva"
              shortcuts={[{ key: "U" }]}
              details={[
                "Clique para adicionar pontos (policlick).",
                "Enter ou duplo-clique para finalizar.",
              ]}
              customIcon={getToolIcon("curve", "toolbar")}
            />

            <ToolButton
              active={tool === "pen"}
              onClick={() => handleToolChange("pen")}
              icon="draw"
              isMac={isMac}
              title="Caneta"
              shortcuts={[{ key: "B" }]}
              details={[
                "Desenho à mão livre: clique e arraste para traçar.",
                "Ao soltar, o traço é suavizado e simplificado.",
                "Feche o traço voltando ao ponto inicial.",
              ]}
              customIcon={getToolIcon("pen", "toolbar")}
            />

            <div className="col-span-full h-px w-full bg-gray-200 dark:bg-gray-700 my-1"></div>

            <ToolButton
              active={tool === "text"}
              onClick={() => handleToolChange("text")}
              icon="text_fields"
              isMac={isMac}
              title="Texto"
              shortcuts={[{ key: "T" }]}
              details={[
                "Clique no canvas para inserir texto.",
                "Duplo-clique para editar.",
                "Use o painel de propriedades para fonte, tamanho e cor.",
              ]}
            />
            <ToolButton
              active={tool === "measure"}
              onClick={() => handleToolChange("measure")}
              icon="straighten"
              isMac={isMac}
              title="Medir"
              shortcuts={[{ key: "M" }]}
              details={[
                "Clique e arraste para medir distância.",
                "Aproximar do contorno ativa magnetismo.",
              ]}
            />

            <ModeMenuButton
              active={measureDisplayMode !== "never"}
              mode={measureDisplayMode}
              onChangeMode={setMeasureDisplayMode}
              isMac={isMac}
              title={`Medidas (${activeMeasureModeOption.label})`}
              details={[
                "Exibe medidas no canvas.",
                ...activeMeasureModeOption.details,
              ]}
              customIcon={activeMeasureModeOption.renderIcon()}
              dataTestId="measures-mode-button"
              popoverTestId="measures-mode-popover"
              menuLabel="Modos de exibição de medidas"
              options={MEASURE_MODE_OPTIONS}
            />

            <ModeMenuButton
              active={nodesDisplayMode !== "never"}
              mode={nodesDisplayMode}
              onChangeMode={setNodesDisplayMode}
              isMac={isMac}
              title={`Nós (${activeNodesModeOption.label})`}
              details={[
                "Exibe pontinhos (nós) das figuras no canvas.",
                ...activeNodesModeOption.details,
              ]}
              customIcon={activeNodesModeOption.renderIcon()}
              dataTestId="nodes-mode-button"
              popoverTestId="nodes-mode-popover"
              menuLabel="Modos de exibição de nós"
              options={NODES_MODE_OPTIONS}
            />

            <ModeMenuButton
              active={pointLabelsMode !== "off"}
              mode={pointLabelsMode}
              onChangeMode={setPointLabelsMode}
              isMac={isMac}
              title={`Rótulos (${activePointLabelsModeOption.label})`}
              details={[
                "Numera ou nomeia os pontos das figuras.",
                ...activePointLabelsModeOption.details,
                "Aparece no canvas e pode ser incluído na impressão/exportação.",
              ]}
              customIcon={activePointLabelsModeOption.renderIcon()}
              dataTestId="point-labels-mode-button"
              popoverTestId="point-labels-mode-popover"
              menuLabel="Modos de rótulos de pontos"
              options={POINT_LABELS_MODE_OPTIONS}
            />

            <ToolButton
              active={magnetEnabled}
              onClick={() => setMagnetEnabled(!magnetEnabled)}
              icon="magnet"
              isMac={isMac}
              title={`Imã (${magnetEnabled ? "Ligado" : "Desligado"})`}
              details={[
                "Ativa magnetismo (snap) para desenhar em cima de outras figuras.",
                "Funciona em Linha/Retângulo/Círculo/Curva.",
                "A força do snap é configurável no menu Visualizar.",
              ]}
              customIcon={magnetIcon}
              dataTestId="magnet-toggle-button"
            />

            <ToolButton
              active={magnetJoinEnabled}
              onClick={() => setMagnetJoinEnabled(!magnetJoinEnabled)}
              icon="link"
              isMac={isMac}
              title={`Modo Magnético (${magnetJoinEnabled ? "Ligado" : "Desligado"})`}
              details={[
                "Desenhe adicionando arestas em figuras existentes.",
                "Cria nós nas interseções e une múltiplas figuras.",
                "Força o snap mesmo com o Imã desligado.",
              ]}
              dataTestId="magnet-join-toggle-button"
            />

            <div className="col-span-full h-px w-full bg-gray-200 dark:bg-gray-700 my-1"></div>

            <ToolButton
              active={tool === "extractMold"}
              onClick={() => handleToolChange("extractMold")}
              icon="content_cut"
              isMac={isMac}
              title="Extrair molde"
              shortcuts={[{ key: "E" }]}
              details={[
                "Selecione arestas em sequência para montar o perímetro.",
                "Funciona a partir do diagrama ou de um molde existente.",
                "Enter confirma quando o perímetro estiver fechado.",
              ]}
              customIcon={getToolIcon("extractMold", "toolbar")}
            />

            <ToolButton
              active={tool === "offset"}
              onClick={() => handleToolChange("offset")}
              icon="format_indent_increase"
              isMac={isMac}
              title="Margem de costura"
              shortcuts={[{ key: "O" }]}
              details={[
                "Clique em uma forma para gerar a margem.",
                "Use as opções para ajustar a distância.",
              ]}
              customIcon={getToolIcon("offset", "toolbar")}
            />

            <ToolButton
              active={tool === "hem"}
              onClick={() => handleToolChange("hem")}
              icon="stairs"
              isMac={isMac}
              title="Bainha"
              shortcuts={[{ key: "A" }]}
              details={[
                "Duplo clique em nós para definir o trecho de aplicação.",
                "Clique para preparar e duplo clique para aplicar a bainha.",
              ]}
              customIcon={getToolIcon("hem", "toolbar")}
            />

            <ToolButton
              active={tool === "dart"}
              onClick={() => handleToolChange("dart")}
              icon="change_history"
              isMac={isMac}
              title="Pence"
              shortcuts={[{ key: "D" }]}
              details={[
                "1º clique: ponto A na borda.",
                "2º clique: ponto B na borda.",
                "3º clique: ápice (vértice) da pence.",
              ]}
              customIcon={getToolIcon("dart", "toolbar")}
            />

            <ToolButton
              active={tool === "pique"}
              onClick={() => handleToolChange("pique")}
              icon="north" // fallback Material icon
              isMac={isMac}
              title="Pique"
              shortcuts={[{ key: "P" }]}
              details={[
                "Passe o mouse na aresta para pré-visualizar o pique.",
                "Clique para adicionar um pique (0,5 cm, perpendicular, para dentro).",
                "Segure Cmd/Ctrl para alta precisão.",
                "Passe em cima de um pique para remover.",
              ]}
              customIcon={getToolIcon("pique", "toolbar")}
            />

            <div className="col-span-full h-px w-full bg-gray-200 dark:bg-gray-700 my-1"></div>

            <ToolButton
              active={tool === "mirror"}
              onClick={() => handleToolChange("mirror")}
              icon="flip"
              isMac={isMac}
              title="Espelhar"
              shortcuts={[{ key: "F" }]}
              details={[
                "Passe o mouse em uma aresta para definir o eixo.",
                "Clique para criar uma cópia espelhada ligada ao original.",
              ]}
              customIcon={getToolIcon("mirror", "toolbar")}
            />

            <ToolButton
              active={tool === "unfold"}
              onClick={() => handleToolChange("unfold")}
              icon="undo"
              isMac={isMac}
              title="Desespelhar"
              shortcuts={[{ key: "G" }]}
              details={[
                "Clique em uma forma espelhada para remover a cópia.",
                "Funciona no original ou na cópia.",
              ]}
              customIcon={getToolIcon("unfold", "toolbar")}
            />
          </div>

          <div
            ref={toolbarBottomRef}
            className={`pt-2 flex items-center justify-center${
              printOnlyReadOnly ? " hidden" : ""
            }`}
          >
            <button
              onMouseEnter={clearTooltip.onMouseEnter}
              onMouseLeave={clearTooltip.onMouseLeave}
              className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
              onClick={handleClear}
              aria-label="Limpar Tudo"
              type="button"
            >
              <span className="material-symbols-outlined text-[22px]">
                delete
              </span>
              <ToolbarTooltip
                isMac={isMac}
                title="Limpar Tudo"
                expanded={clearTooltip.expanded}
                details={["Remove todas as formas do projeto."]}
              />
            </button>
          </div>
        </aside>
      )}

      {isClearConfirmOpen ? (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setIsClearConfirmOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-confirm-title"
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-lg w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-6 mb-4">
              <div>
                <h2
                  id="clear-confirm-title"
                  className="text-2xl font-semibold text-gray-900 dark:text-white"
                >
                  Limpar tudo
                </h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  Tem certeza que deseja remover todas as formas do projeto?
                  Esta ação não pode ser desfeita.
                </p>
              </div>

              <button
                type="button"
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                aria-label="Fechar"
                onClick={() => setIsClearConfirmOpen(false)}
              >
                <span className="material-symbols-outlined text-[20px]">
                  close
                </span>
              </button>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsClearConfirmOpen(false)}
                className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setFigures([]);
                  setIsClearConfirmOpen(false);
                }}
                className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Export Modal */}
      {isExportModalOpen && (
        <div
          className={
            embedded
              ? "fixed inset-0 bg-surface-light dark:bg-surface-dark flex items-center justify-center z-50"
              : "fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          }
          onClick={closeExportModal}
        >
          <div
            className={
              embedded
                ? "bg-white dark:bg-gray-800 w-full h-full p-8 shadow-none overflow-auto"
                : "bg-white dark:bg-gray-800 rounded-lg p-8 max-w-5xl w-full mx-4 shadow-xl max-h-[calc(100vh-2rem)] overflow-auto"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-6 mb-8">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                  Imprimir Molde
                </h2>
              </div>

              <button
                type="button"
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                aria-label="Fechar"
                onClick={closeExportModal}
              >
                <span className="material-symbols-outlined text-[20px]">
                  close
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  Propriedades
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                  Escolha as informações que você deseja imprimir no seu molde:
                </p>

                <div className="space-y-4">
                  <SwitchRow
                    label="Imprimir moldes"
                    checked={includeMolds}
                    onCheckedChange={setIncludeMolds}
                  />
                  <SwitchRow
                    label="Imprimir figuras convencionais"
                    checked={includeConventionalFigures}
                    onCheckedChange={setIncludeConventionalFigures}
                  />
                  <SwitchRow
                    label="Nome do molde"
                    checked={includePatternName}
                    onCheckedChange={setIncludePatternName}
                  />
                  <SwitchRow
                    label="Textos do molde"
                    checked={includePatternTexts}
                    onCheckedChange={setIncludePatternTexts}
                  />
                  <SwitchRow
                    label="Margem de costura"
                    checked={includeSeamAllowance}
                    onCheckedChange={setIncludeSeamAllowance}
                  />
                  <SwitchRow
                    label="Piques"
                    checked={includePiques}
                    onCheckedChange={setIncludePiques}
                  />
                  <SwitchRow
                    label="Rótulos de pontos"
                    checked={includePointLabels}
                    onCheckedChange={setIncludePointLabels}
                  />
                  <SwitchRow
                    label="Medidas (valores)"
                    checked={includeMeasures}
                    onCheckedChange={setIncludeMeasures}
                  />
                  <SwitchRow
                    label="Páginas em branco"
                    checked={exportSettings.includeBlankPages}
                    onCheckedChange={(checked) =>
                      setExportSettings((prev) => ({
                        ...prev,
                        includeBlankPages: checked,
                      }))
                    }
                  />
                  <SwitchRow
                    label="Linhas da página (margens)"
                    checked={exportSettings.showPageGuides}
                    onCheckedChange={(checked) =>
                      setExportSettings((prev) => ({
                        ...prev,
                        showPageGuides: checked,
                      }))
                    }
                  />
                </div>

                <div className="mt-8">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                    Elementos do desenho
                  </h4>
                  <div className="space-y-2">
                    <CheckboxRow
                      label="Retângulos"
                      checked={exportSettings.toolFilter.rectangle}
                      onCheckedChange={() => toggleToolFilter("rectangle")}
                    />
                    <CheckboxRow
                      label="Círculos"
                      checked={exportSettings.toolFilter.circle}
                      onCheckedChange={() => toggleToolFilter("circle")}
                    />
                    <CheckboxRow
                      label="Linhas"
                      checked={exportSettings.toolFilter.line}
                      onCheckedChange={() => toggleToolFilter("line")}
                    />
                    <CheckboxRow
                      label="Curvas"
                      checked={exportSettings.toolFilter.curve}
                      onCheckedChange={() => toggleToolFilter("curve")}
                    />
                    <CheckboxRow
                      label="Pences"
                      checked={exportSettings.toolFilter.dart}
                      onCheckedChange={() => toggleToolFilter("dart")}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  Tamanho
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                  Configure o tamanho do papel:
                </p>

                <select
                  value={exportSettings.paperSize}
                  onChange={(e) =>
                    setExportSettings((prev) => ({
                      ...prev,
                      paperSize: e.target.value as ExportSettings["paperSize"],
                    }))
                  }
                  className="w-full h-10 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-white"
                >
                  {PAPER_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {PAPER_SIZE_LABELS[size]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  Margens
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Configure margens e orientação da sua impressão:
                </p>

                <label className="flex items-center gap-3 text-sm text-gray-900 dark:text-white">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                    checked={customMargins}
                    onChange={(e) => setCustomMargins(e.target.checked)}
                  />
                  Customizar Margens
                </label>

                {customMargins && (
                  <div className="mt-4">
                    <label className="block text-xs text-gray-600 dark:text-gray-300 mb-2">
                      Margem (cm)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={exportSettings.marginCm}
                      onChange={(e) =>
                        setExportSettings((prev) => ({
                          ...prev,
                          marginCm: Number(e.target.value),
                        }))
                      }
                      className="w-full h-10 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                )}

                <div className="mt-8">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                    Orientação
                  </h4>

                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                      <input
                        type="radio"
                        name="export-orientation"
                        value="landscape"
                        checked={exportSettings.orientation === "landscape"}
                        onChange={() =>
                          setExportSettings((prev) => ({
                            ...prev,
                            orientation: "landscape",
                          }))
                        }
                      />
                      Paisagem
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                      <input
                        type="radio"
                        name="export-orientation"
                        value="portrait"
                        checked={exportSettings.orientation === "portrait"}
                        onChange={() =>
                          setExportSettings((prev) => ({
                            ...prev,
                            orientation: "portrait",
                          }))
                        }
                      />
                      Retrato
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-10 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isExportingPdf}
                className={`ml-auto px-4 py-2 text-sm rounded-md bg-primary text-white transition-all flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isExportingPdf
                    ? "opacity-70 cursor-not-allowed"
                    : "hover:brightness-110 hover:shadow-md active:brightness-95 active:scale-[0.99]"
                }`}
              >
                {isExportingPdf ? (
                  <>
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-white/70 border-t-white animate-spin" />
                    Gerando PDF…
                  </>
                ) : (
                  "Exportar PDF"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface SwitchRowProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function SwitchRow({ label, checked, onCheckedChange }: SwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-900 dark:text-white">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onCheckedChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

interface CheckboxRowProps {
  label: string;
  checked: boolean;
  onCheckedChange: () => void;
}

function CheckboxRow({ label, checked, onCheckedChange }: CheckboxRowProps) {
  return (
    <label className="flex items-center gap-3 text-sm text-gray-900 dark:text-white">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
        checked={checked}
        onChange={onCheckedChange}
      />
      {label}
    </label>
  );
}

interface ToolButtonProps {
  active: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  isMac: boolean;
  filled?: boolean;
  customIcon?: React.ReactNode;
  shortcuts?: ToolbarShortcut[];
  details?: string[];
  dataTestId?: string;
}

function ToolButton({
  active,
  onClick,
  icon,
  title,
  isMac,
  filled,
  customIcon,
  shortcuts,
  details,
  dataTestId,
}: ToolButtonProps) {
  const tooltip = useDelayedTooltip(Boolean(details && details.length > 0));
  return (
    <button
      onClick={onClick}
      onMouseEnter={tooltip.onMouseEnter}
      onMouseLeave={tooltip.onMouseLeave}
      data-testid={dataTestId}
      className={`group relative w-full aspect-square flex items-center justify-center rounded transition-all ${
        active
          ? "bg-primary/10 text-primary border border-primary/20 dark:bg-primary/20 dark:text-primary-light dark:border-primary/40 shadow-sm"
          : "bg-transparent text-gray-500 border border-transparent hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
      }`}
      aria-label={title}
    >
      {customIcon ? (
        customIcon
      ) : (
        <span
          className={`material-symbols-outlined text-[22px] ${filled ? "icon-filled" : ""}`}
        >
          {icon}
        </span>
      )}
      <ToolbarTooltip
        isMac={isMac}
        title={title}
        shortcuts={shortcuts}
        details={details}
        expanded={tooltip.expanded}
      />
    </button>
  );
}

interface ModeMenuButtonProps<T extends string> {
  active: boolean;
  mode: T;
  onChangeMode: (mode: T) => void;
  title: string;
  isMac: boolean;
  customIcon: React.ReactNode;
  details?: string[];
  shortcuts?: ToolbarShortcut[];
  dataTestId: string;
  popoverTestId: string;
  menuLabel: string;
  options: ToolbarModeOption<T>[];
}

function ModeMenuButton<T extends string>({
  active,
  mode,
  onChangeMode,
  title,
  isMac,
  customIcon,
  details,
  shortcuts,
  dataTestId,
  popoverTestId,
  menuLabel,
  options,
}: ModeMenuButtonProps<T>) {
  const tooltip = useDelayedTooltip(Boolean(details && details.length > 0));
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        onMouseEnter={tooltip.onMouseEnter}
        onMouseLeave={tooltip.onMouseLeave}
        data-testid={dataTestId}
        className={`group relative w-full aspect-square flex items-center justify-center rounded transition-all ${
          active
            ? "bg-primary/10 text-primary border border-primary/20 dark:bg-primary/20 dark:text-primary-light dark:border-primary/40 shadow-sm"
            : "bg-transparent text-gray-500 border border-transparent hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
        }`}
        aria-label={title}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {customIcon}
        <ToolbarTooltip
          isMac={isMac}
          title={title}
          shortcuts={shortcuts}
          details={details}
          expanded={tooltip.expanded}
        />
      </button>

      {isOpen ? (
        <div
          className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-40 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-surface-dark"
          data-testid={popoverTestId}
          role="menu"
          aria-label={menuLabel}
        >
          <div className="flex flex-col gap-1">
            {options.map((option) => {
              const optionActive = option.mode === mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={optionActive}
                  data-testid={option.testId}
                  onClick={() => {
                    onChangeMode(option.mode);
                    setIsOpen(false);
                  }}
                  className={`flex min-w-[170px] items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                    optionActive
                      ? "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-current/15 bg-current/5">
                    {option.renderIcon()}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium leading-tight">
                      {option.label}
                    </span>
                    <span className="text-[11px] leading-tight text-current/70">
                      {option.summary}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type LineToolModeOption = {
  mode: LineToolMode;
  title: string;
  details: string[];
  summary: string;
  icon: "lineSingle" | "lineContinuous";
};

const LINE_TOOL_MODE_OPTIONS: LineToolModeOption[] = [
  {
    mode: "single",
    title: "Linha simples",
    summary: "2 pontos",
    details: [
      "Clique para iniciar a linha.",
      "Clique novamente para concluir.",
      "Digite um comprimento para travar o segmento.",
    ],
    icon: "lineSingle",
  },
  {
    mode: "continuous",
    title: "Linha contínua",
    summary: "Polilinha",
    details: [
      "Clique para adicionar pontos.",
      "Enter para finalizar.",
      "Clique no nó inicial para fechar a figura.",
      "Digite um comprimento para travar o segmento atual.",
    ],
    icon: "lineContinuous",
  },
];

function getLineToolModeOption(mode: LineToolMode): LineToolModeOption {
  return (
    LINE_TOOL_MODE_OPTIONS.find((option) => option.mode === mode) ??
    LINE_TOOL_MODE_OPTIONS[1]
  );
}

function LineToolButton({
  active,
  onActivate,
  lineToolMode,
  onChangeLineToolMode,
  isMac,
}: {
  active: boolean;
  onActivate: () => void;
  lineToolMode: LineToolMode;
  onChangeLineToolMode: (mode: LineToolMode) => void;
  isMac: boolean;
}) {
  const tooltip = useDelayedTooltip(true);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const activeOption = getLineToolModeOption(lineToolMode);

  useEffect(() => {
    if (active) return;

    const timeoutId = window.setTimeout(() => {
      setIsOpen(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [active]);

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleMainClick = () => {
    onActivate();
    setIsOpen(true);
  };

  const handleModeClick = (mode: LineToolMode) => {
    onChangeLineToolMode(mode);
    onActivate();
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        onClick={handleMainClick}
        onMouseEnter={tooltip.onMouseEnter}
        onMouseLeave={tooltip.onMouseLeave}
        data-testid="line-tool-button"
        className={`group relative w-full aspect-square flex items-center justify-center rounded transition-all ${
          active
            ? "bg-primary/10 text-primary border border-primary/20 dark:bg-primary/20 dark:text-primary-light dark:border-primary/40 shadow-sm"
            : "bg-transparent text-gray-500 border border-transparent hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
        }`}
        aria-label="Linha"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {getToolIcon(activeOption.icon, "toolbar")}
        <ToolbarTooltip
          isMac={isMac}
          title={activeOption.title}
          shortcuts={[{ key: "L" }]}
          details={activeOption.details}
          expanded={tooltip.expanded}
        />
      </button>

      {isOpen ? (
        <div
          className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-40 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-surface-dark"
          data-testid="line-tool-mode-popover"
          role="menu"
          aria-label="Modos da ferramenta linha"
        >
          <div className="flex flex-col gap-1">
            {LINE_TOOL_MODE_OPTIONS.map((option) => {
              const optionActive = option.mode === lineToolMode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={optionActive}
                  data-testid={`line-tool-mode-${option.mode}`}
                  onClick={() => handleModeClick(option.mode)}
                  className={`flex min-w-[156px] items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                    optionActive
                      ? "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-current/15 bg-current/5">
                    {getToolIcon(option.icon, "toolbar", "w-5 h-5 stroke-current")}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium leading-tight">
                      {option.title}
                    </span>
                    <span className="text-[11px] leading-tight text-current/70">
                      {option.summary}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ToolbarShortcut = {
  cmdOrCtrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  key: string;
};

function renderShortcut(shortcut: ToolbarShortcut, isMac: boolean) {
  const parts: string[] = [];
  if (shortcut.cmdOrCtrl) parts.push(isMac ? "⌘" : "Ctrl");
  if (shortcut.shift) parts.push(isMac ? "⇧" : "Shift");
  if (shortcut.alt) parts.push(isMac ? "⌥" : "Alt");
  parts.push(shortcut.key.toUpperCase());
  return parts;
}

function Kbd({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] leading-none">
      {children}
    </span>
  );
}

function ToolbarTooltip({
  title,
  shortcuts,
  details,
  expanded,
  isMac,
}: {
  title: string;
  shortcuts?: ToolbarShortcut[];
  details?: string[];
  expanded?: boolean;
  isMac: boolean;
}) {
  const hasDetails = Boolean(details && details.length > 0);

  const shortcutContent = shortcuts?.length
    ? shortcuts
        .map((s) => renderShortcut(s, isMac))
        .map((parts, index) => (
          <span key={index} className="inline-flex items-center gap-1">
            {parts.map((p, partIndex) => (
              <Kbd key={partIndex}>{p}</Kbd>
            ))}
          </span>
        ))
    : null;

  return (
    <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none hidden group-hover:block">
      <span
        className={
          "bg-gray-900 text-white rounded px-2 py-1 pointer-events-none whitespace-nowrap " +
          "opacity-100 " +
          (expanded ? "text-[11px]" : "text-[10px]")
        }
      >
        <span className="inline-flex items-center gap-2">
          <span>{title}</span>
          {shortcutContent ? (
            <span className="inline-flex items-center gap-2">
              {shortcutContent}
            </span>
          ) : null}
        </span>
        {expanded && hasDetails ? (
          <span className="mt-1 block max-w-[220px] whitespace-normal text-[10px] text-white/90">
            {details!.slice(0, 4).map((line, index) => (
              <span key={index} className="block leading-snug">
                {line}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function useDelayedTooltip(hasDetails: boolean) {
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<number | null>(null);

  const onMouseEnter = useCallback(() => {
    if (!hasDetails) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setExpanded(true), 3000);
  }, [hasDetails]);

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setExpanded(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { expanded, onMouseEnter, onMouseLeave };
}
