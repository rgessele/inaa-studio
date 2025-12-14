"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

      await generateTiledPDF(
        stage,
        shapes,
        () => setShowGrid(false),
        () => setShowGrid(true),
        resolvedSettings
      );
    };

    tryExport();

    return () => {
      cancelled = true;
    };
  }, [customMargins, exportSettings, getStage, searchParams, setShowGrid, shapes]);

  const handleToolChange = (newTool: Tool) => {
    setTool(newTool);
  };

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

    await generateTiledPDF(
      stage,
      shapes,
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

    generateSVG(shapes, resolvedSettings);
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
          className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
          aria-label="Salvar"
        >
          <span className="material-symbols-outlined text-[20px]">save</span>
          <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
            Salvar
          </span>
        </button>

        <button
          onClick={() => setShowExportModal(true)}
          className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
          aria-label="Exportar"
        >
          <span className="material-symbols-outlined text-[20px]">
            download
          </span>
          <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
            Exportar
          </span>
        </button>

        <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

        <button
          onClick={undo}
          disabled={!canUndo}
          className={`group relative flex items-center justify-center p-2 rounded transition-all ${
            !canUndo
              ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
              : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
          }`}
          aria-label="Desfazer (Ctrl+Z)"
        >
          <span className="material-symbols-outlined text-[20px]">undo</span>
          <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
            Desfazer (Ctrl+Z)
          </span>
        </button>

        <button
          onClick={redo}
          disabled={!canRedo}
          className={`group relative flex items-center justify-center p-2 rounded transition-all ${
            !canRedo
              ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
              : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
          }`}
          aria-label="Refazer (Ctrl+Y)"
        >
          <span className="material-symbols-outlined text-[20px]">redo</span>
          <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
            Refazer (Ctrl+Y)
          </span>
        </button>

        <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

        <ToolButton
          active={tool === "select"}
          onClick={() => handleToolChange("select")}
          icon="arrow_selector_tool"
          label="Selecionar (V)"
        />

        <ToolButton
          active={tool === "pan"}
          onClick={() => handleToolChange("pan")}
          icon="pan_tool"
          label="Mover (H)"
        />

        <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

        <ToolButton
          active={tool === "rectangle"}
          onClick={() => handleToolChange("rectangle")}
          icon="rectangle"
          label="Retângulo (R)"
          filled
        />

        <ToolButton
          active={tool === "circle"}
          onClick={() => handleToolChange("circle")}
          icon="circle"
          label="Círculo (C)"
          filled
        />

        <ToolButton
          active={tool === "line"}
          onClick={() => handleToolChange("line")}
          icon="horizontal_rule" // Using horizontal_rule as line icon replacement or custom svg
          label="Linha (L)"
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
          label="Curva (U)"
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

        <button
          className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
          aria-label="Caneta (P)"
        >
          <span className="material-symbols-outlined text-[20px]">edit</span>
          <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
            Caneta (P)
          </span>
        </button>

        <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

        <button
          className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
          title="Texto (T)"
        >
          <span className="material-symbols-outlined text-[20px]">
            text_fields
          </span>
        </button>
        <button
          className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
          title="Medir (M)"
        >
          <span className="material-symbols-outlined text-[20px]">
            straighten
          </span>
        </button>

        <div className="flex-1"></div>

        <button
          className="mb-2 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
          title="Limpar Tudo"
          onClick={handleClear}
        >
          <span className="material-symbols-outlined text-[20px]">delete</span>
        </button>
        </aside>
      )}

      {/* Export Modal */}
      {isExportModalOpen && (
        <div
          className={
            embedded
              ? "fixed inset-0 bg-surface-light dark:bg-surface-dark flex items-center justify-center z-50"
              : "fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          }
          onClick={closeExportModal}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-5xl w-full mx-4 shadow-xl"
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
  label: string;
  filled?: boolean;
  customIcon?: React.ReactNode;
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
  filled,
  customIcon,
}: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex items-center justify-center p-2 rounded transition-all ${
        active
          ? "bg-primary/10 text-primary border border-primary/20 dark:bg-primary/20 dark:text-primary-light dark:border-primary/40 shadow-sm"
          : "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
      }`}
      aria-label={label}
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
      <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
        {label}
      </span>
    </button>
  );
}
