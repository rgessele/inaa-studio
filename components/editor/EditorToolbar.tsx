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
import { useEditor } from "./EditorContext";
import { DrawingTool, Tool } from "./types";
import {
  createDefaultExportSettings,
  generateTiledPDF,
  generateSVG,
  type ExportSettings,
} from "./export";

export function EditorToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    tool,
    setTool,
    setShapes,
    undo,
    redo,
    canUndo,
    canRedo,
    shapes,
    getStage,
    setShowGrid,
    setPageGuideSettings,
    selectedShapeId,
    deleteSelected,
  } = useEditor();
  const [showExportModal, setShowExportModal] = useState(false);

  const [exportSettings, setExportSettings] = useState<ExportSettings>(() =>
    createDefaultExportSettings()
  );
  const [customMargins, setCustomMargins] = useState(false);
  const [includePatternName, setIncludePatternName] = useState(true);
  const [includePatternTexts, setIncludePatternTexts] = useState(true);
  const [includeSeamAllowance, setIncludeSeamAllowance] = useState(true);
  const hasAutoExportedRef = useRef(false);
  const embedded =
    searchParams.get("embedded") === "1" || searchParams.get("embed") === "1";

  const urlWantsExportModal = useMemo(() => {
    return searchParams.get("export") === "pdf";
  }, [searchParams]);

  const isExportModalOpen = showExportModal || urlWantsExportModal;

  const closeExportModal = () => {
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
      };

      const exportShapes = includeSeamAllowance
        ? shapes
        : shapes.filter((shape) => shape.kind !== "seam");

      await generateTiledPDF(
        stage,
        exportShapes,
        () => setShowGrid(false),
        () => setShowGrid(true),
        resolvedSettings
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
    includeSeamAllowance,
    searchParams,
    setShowGrid,
    shapes,
  ]);

  const handleToolChange = (newTool: Tool) => {
    setTool(newTool);
  };

  const isMac = useSyncExternalStore(
    () => () => {
      // no-op: OS does not change during a session
    },
    () => /Mac|iPhone|iPod|iPad/.test(navigator.userAgent),
    () => false
  );

  const saveTooltip = useDelayedTooltip(true);
  const exportTooltip = useDelayedTooltip(true);
  const undoTooltip = useDelayedTooltip(true);
  const redoTooltip = useDelayedTooltip(true);
  const eraseTooltip = useDelayedTooltip(true);
  const clearTooltip = useDelayedTooltip(true);

  const handleClear = () => {
    if (confirm("Tem certeza que deseja limpar tudo?")) {
      setShapes([]);
    }
  };

  const handleExportPDF = async () => {
    const stage = getStage();
    if (!stage) {
      alert("Canvas ainda não está pronto.");
      return;
    }

    closeExportModal();

    const resolvedSettings: ExportSettings = {
      ...exportSettings,
      marginCm: customMargins ? exportSettings.marginCm : 1,
    };

    const exportShapes = includeSeamAllowance
      ? shapes
      : shapes.filter((shape) => shape.kind !== "seam");

    await generateTiledPDF(
      stage,
      exportShapes,
      () => setShowGrid(false),
      () => setShowGrid(true),
      resolvedSettings
    );
  };

  const handleExportSVG = () => {
    closeExportModal();

    const resolvedSettings: ExportSettings = {
      ...exportSettings,
      marginCm: customMargins ? exportSettings.marginCm : 1,
    };

    const exportShapes = includeSeamAllowance
      ? shapes
      : shapes.filter((shape) => shape.kind !== "seam");

    generateSVG(exportShapes, resolvedSettings);
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
        <aside className="w-12 bg-surface-light dark:bg-surface-dark border-r border-gray-200 dark:border-gray-700 flex flex-col relative z-50 shadow-subtle shrink-0 items-center py-4 gap-1">
          <button
            onMouseEnter={saveTooltip.onMouseEnter}
            onMouseLeave={saveTooltip.onMouseLeave}
            className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
            aria-label="Salvar"
          >
            <span className="material-symbols-outlined text-[20px]">save</span>
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
            className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
            aria-label="Exportar"
          >
            <span className="material-symbols-outlined text-[20px]">
              download
            </span>
            <ToolbarTooltip
              isMac={isMac}
              title="Exportar"
              expanded={exportTooltip.expanded}
              details={[
                "Abre as opções de exportação e impressão.",
                "Use para PDF (paginado) ou SVG.",
              ]}
            />
          </button>

          <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

          <button
            onClick={undo}
            disabled={!canUndo}
            onMouseEnter={undoTooltip.onMouseEnter}
            onMouseLeave={undoTooltip.onMouseLeave}
            className={`group relative flex items-center justify-center p-2 rounded transition-all ${
              !canUndo
                ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
            }`}
            aria-label="Desfazer"
          >
            <span className="material-symbols-outlined text-[20px]">undo</span>
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
            className={`group relative flex items-center justify-center p-2 rounded transition-all ${
              !canRedo
                ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
            }`}
            aria-label="Refazer"
          >
            <span className="material-symbols-outlined text-[20px]">redo</span>
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
            onClick={deleteSelected}
            disabled={!selectedShapeId}
            onMouseEnter={eraseTooltip.onMouseEnter}
            onMouseLeave={eraseTooltip.onMouseLeave}
            className={`group relative flex items-center justify-center p-2 rounded transition-all ${
              !selectedShapeId
                ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
            }`}
            aria-label="Borracha"
          >
            <span className="material-symbols-outlined text-[20px]">
              backspace
            </span>
            <ToolbarTooltip
              isMac={isMac}
              title="Borracha"
              shortcuts={[{ key: "Backspace" }]}
              expanded={eraseTooltip.expanded}
              details={["Apaga a figura selecionada."]}
            />
          </button>

          <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

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
            ]}
            customIcon={
              <svg
                className="w-5 h-5 stroke-current"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <circle cx="6" cy="6" r="2"></circle>
                <circle cx="18" cy="6" r="2"></circle>
                <circle cx="18" cy="18" r="2"></circle>
                <circle cx="6" cy="18" r="2"></circle>
                <line x1="8" x2="16" y1="6" y2="6"></line>
                <line x1="18" x2="18" y1="8" y2="16"></line>
                <line x1="16" x2="8" y1="18" y2="18"></line>
                <line x1="6" x2="6" y1="16" y2="8"></line>
              </svg>
            }
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

          <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

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
            details={["Clique e arraste para definir o raio."]}
            filled
          />

          <ToolButton
            active={tool === "line"}
            onClick={() => handleToolChange("line")}
            icon="horizontal_rule" // Using horizontal_rule as line icon replacement or custom svg
            isMac={isMac}
            title="Linha"
            shortcuts={[{ key: "L" }]}
            details={["Clique e arraste para desenhar uma linha."]}
            customIcon={
              <svg
                className="w-5 h-5 stroke-current"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <line x1="5" x2="19" y1="19" y2="5"></line>
              </svg>
            }
          />

          <ToolButton
            active={tool === "curve"}
            onClick={() => handleToolChange("curve")}
            icon="timeline"
            isMac={isMac}
            title="Curva"
            shortcuts={[{ key: "U" }]}
            details={[
              "Clique e arraste para criar uma curva.",
              "Use Editar nós (N) para ajustar a curvatura.",
            ]}
            customIcon={
              <svg
                className="w-5 h-5 stroke-current"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path d="M5 19 Q 12 5, 19 19"></path>
              </svg>
            }
          />

          <StaticToolbarButton
            icon="edit"
            ariaLabel="Caneta"
            isMac={isMac}
            tooltipTitle="Caneta"
            tooltipDetails={["Em breve."]}
          />

          <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

          <StaticToolbarButton
            icon="text_fields"
            ariaLabel="Texto"
            isMac={isMac}
            tooltipTitle="Texto"
            tooltipDetails={["Em breve."]}
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
              "Aproximar do edge ativa magnetismo.",
            ]}
          />

          <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

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
            customIcon={
              <svg
                className="w-5 h-5 stroke-current"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <rect x="6" y="6" width="12" height="12" />
                <rect x="3" y="3" width="18" height="18" strokeDasharray="2 2" />
              </svg>
            }
          />

          <ToolButton
            active={tool === "dart"}
            onClick={() => handleToolChange("dart")}
            icon="change_history"
            isMac={isMac}
            title="Pence"
            shortcuts={[{ key: "D" }]}
            details={[
              "Clique em uma linha para inserir uma pence.",
              "Configure a profundidade e abertura nas propriedades.",
            ]}
            customIcon={
              <svg
                className="w-5 h-5 stroke-current"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path d="M12 2 L6 12 L12 10 L18 12 Z" />
              </svg>
            }
          />

          <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

          <ToolButton
            active={tool === "mirror"}
            onClick={() => handleToolChange("mirror")}
            icon="flip"
            isMac={isMac}
            title="Espelhar"
            shortcuts={[{ key: "F" }]}
            details={[
              "Clique em uma forma para criar cópia espelhada.",
              "Configure o eixo (vertical/horizontal) nas propriedades.",
            ]}
            customIcon={
              <svg
                className="w-5 h-5 stroke-current"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path d="M12 3 L12 21 M9 6 L6 9 L9 12 M15 12 L18 9 L15 6" />
              </svg>
            }
          />

          <ToolButton
            active={tool === "unfold"}
            onClick={() => handleToolChange("unfold")}
            icon="unfold_more"
            isMac={isMac}
            title="Desdobrar"
            shortcuts={[{ key: "G" }]}
            details={[
              "Clique em uma forma pela metade para desdobrar.",
              "Duplica, espelha e une as metades numa peça única.",
            ]}
            customIcon={
              <svg
                className="w-5 h-5 stroke-current"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path d="M12 3 L12 21 M8 6 L12 10 L16 6 M8 18 L12 14 L16 18" />
              </svg>
            }
          />

          <div className="flex-1"></div>

          <button
            onMouseEnter={clearTooltip.onMouseEnter}
            onMouseLeave={clearTooltip.onMouseLeave}
            className="mb-2 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
            onClick={handleClear}
            aria-label="Limpar Tudo"
          >
            <span className="material-symbols-outlined text-[20px]">
              delete
            </span>
            <ToolbarTooltip
              isMac={isMac}
              title="Limpar Tudo"
              expanded={clearTooltip.expanded}
              details={["Remove todas as formas do projeto."]}
            />
          </button>
        </aside>
      )}

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
                : "bg-white dark:bg-gray-800 rounded-lg p-8 max-w-5xl w-full mx-4 shadow-xl"
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
                    label="Linhas tracejadas"
                    checked={exportSettings.dashedLines}
                    onCheckedChange={(checked) =>
                      setExportSettings((prev) => ({
                        ...prev,
                        dashedLines: checked,
                      }))
                    }
                  />
                  <SwitchRow
                    label="Mostrar tamanho base"
                    checked={exportSettings.showBaseSize}
                    onCheckedChange={(checked) =>
                      setExportSettings((prev) => ({
                        ...prev,
                        showBaseSize: checked,
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
                  <option value="A4">A4</option>
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
                onClick={handleExportSVG}
                className="px-4 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Exportar SVG
              </button>

              <button
                type="button"
                onClick={handleExportPDF}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm rounded-md bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">
                  print
                </span>
                Imprimir
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
}: ToolButtonProps) {
  const tooltip = useDelayedTooltip(Boolean(details && details.length > 0));
  return (
    <button
      onClick={onClick}
      onMouseEnter={tooltip.onMouseEnter}
      onMouseLeave={tooltip.onMouseLeave}
      className={`group relative flex items-center justify-center p-2 rounded transition-all ${
        active
          ? "bg-primary/10 text-primary border border-primary/20 dark:bg-primary/20 dark:text-primary-light dark:border-primary/40 shadow-sm"
          : "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
      }`}
      aria-label={title}
    >
      {customIcon ? (
        customIcon
      ) : (
        <span
          className={`material-symbols-outlined text-[20px] ${filled ? "icon-filled" : ""}`}
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

function StaticToolbarButton({
  icon,
  ariaLabel,
  isMac,
  tooltipTitle,
  tooltipShortcuts,
  tooltipDetails,
}: {
  icon: string;
  ariaLabel: string;
  isMac: boolean;
  tooltipTitle: string;
  tooltipShortcuts?: ToolbarShortcut[];
  tooltipDetails?: string[];
}) {
  const tooltip = useDelayedTooltip(Boolean(tooltipDetails && tooltipDetails.length > 0));

  return (
    <button
      onMouseEnter={tooltip.onMouseEnter}
      onMouseLeave={tooltip.onMouseLeave}
      className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
      aria-label={ariaLabel}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      <ToolbarTooltip
        isMac={isMac}
        title={tooltipTitle}
        shortcuts={tooltipShortcuts}
        details={tooltipDetails}
        expanded={tooltip.expanded}
      />
    </button>
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
    <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50">
      <span
        className={
          "bg-gray-900 text-white rounded px-2 py-1 pointer-events-none whitespace-nowrap " +
          "opacity-0 group-hover:opacity-100 transition-opacity " +
          (expanded ? "text-[11px]" : "text-[10px]")
        }
      >
        <span className="inline-flex items-center gap-2">
          <span>{title}</span>
          {shortcutContent ? (
            <span className="inline-flex items-center gap-2">{shortcutContent}</span>
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
