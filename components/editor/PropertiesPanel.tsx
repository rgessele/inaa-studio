"use client";

import React, { useState } from "react";
import { useEditor } from "./EditorContext";
import { figureWorldBoundingBox } from "./figurePath";
import { pxToCm } from "./measureUnits";
import { PX_PER_CM } from "./constants";
import { setEdgeTargetLengthPx } from "./edgeEdit";
import {
  bumpNumericValue,
  clampMin,
  formatPtBrDecimalFixed,
  parsePtBrDecimal,
} from "@/utils/numericInput";

export function PropertiesPanel() {
  const {
    tool,
    selectedFigureId,
    figures,
    setFigures,
    selectedEdge,
    setSelectedEdge,
    offsetValueCm,
    setOffsetValueCm,
    mirrorAxis,
    setMirrorAxis,
    unfoldAxis,
    setUnfoldAxis,
  } = useEditor();
  const selectedFigure = figures.find((f) => f.id === selectedFigureId);

  const seamForSelection = (() => {
    if (!selectedFigure) return null;
    if (selectedFigure.kind === "seam") return selectedFigure;
    return (
      figures.find((f) => f.kind === "seam" && f.parentId === selectedFigure.id) ??
      null
    );
  })();

  const seamForSelectionId = seamForSelection?.id ?? null;
  const seamForSelectionOffsetCm = seamForSelection?.offsetCm;

  const offsetDisplayCm = seamForSelection?.offsetCm ?? offsetValueCm;

  const inputBaseClass =
    "px-2 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-200 text-right outline-none transition-all shadow-sm";
  const inputFocusClass = "focus:ring-1 focus:ring-gray-400/50 focus:border-gray-400";
  const inputDisabledClass =
    "disabled:bg-gray-50 dark:disabled:bg-gray-900/30 disabled:border-gray-200 dark:disabled:border-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-default disabled:shadow-none disabled:ring-0";
  const inputErrorClass =
    "border-red-500 dark:border-red-500 ring-1 ring-red-500 dark:ring-red-500 focus:ring-red-500 focus:border-red-500";

  React.useEffect(() => {
    if (tool !== "offset") return;
    if (!seamForSelectionId) return;
    if (!Number.isFinite(seamForSelectionOffsetCm ?? NaN)) return;
    const next = seamForSelectionOffsetCm as number;
    if (offsetValueCm === next) return;
    setOffsetValueCm(next);
  }, [
    offsetValueCm,
    seamForSelectionId,
    seamForSelectionOffsetCm,
    setOffsetValueCm,
    tool,
  ]);

  const updateSelectedSeamOffset = (nextCm: number) => {
    if (!seamForSelection) {
      // No seam yet; only update tool default.
      setOffsetValueCm(nextCm);
      return;
    }

    const safe = Math.max(0.1, nextCm);
    setOffsetValueCm(safe);

    // Update only this seam figure. Geometry recalculation happens in Canvas.
    setFigures((prev) =>
      prev.map((f) => (f.id === seamForSelection.id ? { ...f, offsetCm: safe } : f))
    );
  };

  const [seamOffsetDraft, setSeamOffsetDraft] = useState<string>(
    formatPtBrDecimalFixed(offsetDisplayCm, 2)
  );
  const [seamOffsetError, setSeamOffsetError] = useState<string | null>(null);
  const [isEditingSeamOffset, setIsEditingSeamOffset] = useState(false);

  React.useEffect(() => {
    if (isEditingSeamOffset) return;
    setSeamOffsetDraft(formatPtBrDecimalFixed(offsetDisplayCm, 2));
    setSeamOffsetError(null);
  }, [isEditingSeamOffset, offsetDisplayCm, seamForSelection?.id]);

  const applySeamOffsetDraft = (raw: string) => {
    const cm = parsePtBrDecimal(raw);
    if (cm == null) {
      setSeamOffsetError("Valor inválido");
      return;
    }
    const safe = clampMin(cm, 0.1);
    updateSelectedSeamOffset(safe);
    setSeamOffsetDraft(formatPtBrDecimalFixed(safe, 2));
    setSeamOffsetError(null);
  };

  const bumpSeamOffset = (direction: 1 | -1) => {
    const next = bumpNumericValue({
      raw: seamOffsetDraft,
      fallback: offsetDisplayCm,
      direction,
      step: 0.1,
      min: 0.1,
    });
    updateSelectedSeamOffset(next);
    setSeamOffsetDraft(formatPtBrDecimalFixed(next, 2));
    setSeamOffsetError(null);
  };

  const selectedEdgeInfo =
    selectedEdge && selectedFigure && selectedEdge.figureId === selectedFigure.id
      ? (() => {
          const edge = selectedFigure.edges.find((e) => e.id === selectedEdge.edgeId);
          if (!edge) return null;
          const measure = selectedFigure.measures?.perEdge?.find(
            (m) => m.edgeId === selectedEdge.edgeId
          );
          if (!measure) return null;
          return {
            edge,
            lengthCm: pxToCm(measure.lengthPx),
          };
        })()
      : null;

  const selectedEdgeId = selectedEdgeInfo?.edge.id ?? null;
  const selectedEdgeLengthCm = selectedEdgeInfo?.lengthCm ?? null;
  const selectedBounds = selectedFigure
    ? figureWorldBoundingBox(selectedFigure)
    : null;

  const [collapsed, setCollapsed] = useState(false);
  const [edgeLengthDraft, setEdgeLengthDraft] = useState<string>("");

  React.useEffect(() => {
    if (selectedEdgeId == null || selectedEdgeLengthCm == null) {
      setEdgeLengthDraft("");
      return;
    }
    setEdgeLengthDraft(formatPtBrDecimalFixed(selectedEdgeLengthCm, 2));
  }, [selectedEdgeId, selectedEdgeLengthCm]);

  const applyEdgeLength = (raw: string) => {
    if (!selectedEdge || !selectedFigure) return;
    const cm = parsePtBrDecimal(raw);
    if (cm == null) return;
    const safeCm = clampMin(cm, 0.01);

    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== selectedEdge.figureId) return f;
        if (f.kind === "seam") return f;
        const updated = setEdgeTargetLengthPx({
          figure: f,
          edgeId: selectedEdge.edgeId,
          targetLengthPx: safeCm * PX_PER_CM,
          anchor: selectedEdge.anchor,
        });
        return updated ?? f;
      })
    );
  };

  const bumpEdgeLength = (direction: 1 | -1) => {
    if (!selectedEdgeInfo) return;
    const next = bumpNumericValue({
      raw: edgeLengthDraft,
      fallback: selectedEdgeInfo.lengthCm,
      direction,
      step: 0.1,
      min: 0.01,
    });
    setEdgeLengthDraft(formatPtBrDecimalFixed(next, 2));
    applyEdgeLength(String(next));
  };

  const [toolOffsetDraft, setToolOffsetDraft] = useState<string>(
    formatPtBrDecimalFixed(offsetValueCm, 2)
  );
  const [toolOffsetError, setToolOffsetError] = useState<string | null>(null);
  const [isEditingToolOffset, setIsEditingToolOffset] = useState(false);

  React.useEffect(() => {
    if (isEditingToolOffset) return;
    setToolOffsetDraft(formatPtBrDecimalFixed(offsetValueCm, 2));
    setToolOffsetError(null);
  }, [isEditingToolOffset, offsetValueCm]);

  const applyToolOffsetDraft = (raw: string) => {
    const cm = parsePtBrDecimal(raw);
    if (cm == null) {
      setToolOffsetError("Valor inválido");
      return;
    }
    const safe = clampMin(cm, 0.1);
    setOffsetValueCm(safe);
    setToolOffsetDraft(formatPtBrDecimalFixed(safe, 2));
    setToolOffsetError(null);
  };

  const bumpToolOffset = (direction: 1 | -1) => {
    const next = bumpNumericValue({
      raw: toolOffsetDraft,
      fallback: offsetValueCm,
      direction,
      step: 0.1,
      min: 0.1,
    });
    setOffsetValueCm(next);
    setToolOffsetDraft(formatPtBrDecimalFixed(next, 2));
    setToolOffsetError(null);
  };

  // Show tool properties when no shape is selected but a tool is active
  const showToolProperties =
    !selectedFigure && (tool === "mirror" || tool === "unfold" || tool === "offset");

  return (
    <aside
      className={
        "hidden lg:flex relative overflow-hidden border-l border-gray-200 dark:border-gray-700 z-10 shrink-0 transition-[width] duration-200 ease-in-out " +
        (collapsed
          ? "w-8 bg-transparent"
          : "w-72 bg-surface-light dark:bg-surface-dark shadow-subtle")
      }
    >
      <button
        type="button"
        aria-label={collapsed ? "Exibir painel" : "Recolher painel"}
        onClick={() => setCollapsed((value) => !value)}
        className={
          "absolute left-1.5 bottom-2 rounded p-1 transition-colors " +
          "z-20 " +
          "text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 " +
          "hover:bg-gray-200/70 dark:hover:bg-gray-700/60"
        }
      >
        <span className="material-symbols-outlined text-[18px]">
          {collapsed ? "chevron_left" : "chevron_right"}
        </span>
      </button>

      <div
        className={
          "flex w-72 flex-col transition-all duration-200 ease-in-out " +
          (collapsed
            ? "translate-x-full opacity-0 pointer-events-none"
            : "translate-x-0 opacity-100")
        }
      >
        {selectedFigure ? (
          <>
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/30">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted dark:text-text-muted-dark">
                Propriedades
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">
                  more_horiz
                </span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
              {(tool === "offset" || !!seamForSelection) && (
                <div>
                  <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 block">
                    Margem de costura
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      className={
                        "w-24 " +
                        inputBaseClass +
                        " " +
                        inputDisabledClass +
                        " " +
                        (seamOffsetError ? inputErrorClass : inputFocusClass)
                      }
                      type="text"
                      inputMode="decimal"
                      value={seamOffsetDraft}
                      onFocus={() => setIsEditingSeamOffset(true)}
                      onChange={(e) => {
                        setSeamOffsetDraft(e.target.value);
                        setSeamOffsetError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          bumpSeamOffset(1);
                          return;
                        }
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          bumpSeamOffset(-1);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setIsEditingSeamOffset(false);
                          setSeamOffsetDraft(formatPtBrDecimalFixed(offsetDisplayCm, 2));
                          setSeamOffsetError(null);
                        }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applySeamOffsetDraft(seamOffsetDraft);
                          setIsEditingSeamOffset(false);
                        }
                      }}
                      onWheel={(e) => {
                        if (document.activeElement !== e.currentTarget) return;
                        e.preventDefault();
                        e.stopPropagation();
                        bumpSeamOffset(e.deltaY < 0 ? 1 : -1);
                      }}
                      onBlur={() => {
                        applySeamOffsetDraft(seamOffsetDraft);
                        setIsEditingSeamOffset(false);
                      }}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      cm
                    </span>
                  </div>
                  {seamOffsetError ? (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-500">
                      {seamOffsetError}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    {seamForSelection
                      ? "Edite a distância da margem desta peça."
                      : "Clique em uma forma fechada para gerar a margem tracejada."}
                  </p>
                </div>
              )}

              {selectedEdgeInfo ? (
                <div>
                  <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">
                        straighten
                      </span>{" "}
                      Aresta
                    </span>
                  </label>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        className={
                          "w-24 " +
                          inputBaseClass +
                          " " +
                          inputFocusClass
                        }
                        type="text"
                        inputMode="decimal"
                        value={edgeLengthDraft}
                        onChange={(e) => setEdgeLengthDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            bumpEdgeLength(1);
                            return;
                          }
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            bumpEdgeLength(-1);
                            return;
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyEdgeLength(edgeLengthDraft);
                          }
                        }}
                        onWheel={(e) => {
                          if (document.activeElement !== e.currentTarget) return;
                          e.preventDefault();
                          e.stopPropagation();
                          bumpEdgeLength(e.deltaY < 0 ? 1 : -1);
                        }}
                        onBlur={() => applyEdgeLength(edgeLengthDraft)}
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        cm
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">
                        Âncora
                      </span>
                      <div className="ml-auto inline-flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden">
                        {([
                          { key: "start", label: "Início" },
                          { key: "mid", label: "Meio" },
                          { key: "end", label: "Fim" },
                        ] as const).map((opt) => {
                          const active = (selectedEdge?.anchor ?? "end") === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onPointerDown={(e) => {
                                // Keep focus on the inline edge-length input when it's open.
                                // Otherwise clicking here blurs the input and closes it.
                                e.preventDefault();
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                              }}
                              onClick={() =>
                                selectedEdge
                                  ? setSelectedEdge({
                                      ...selectedEdge,
                                      anchor: opt.key,
                                    })
                                  : null
                              }
                              className={
                                "px-2 py-1 text-[11px] font-bold transition-colors " +
                                (active
                                  ? "bg-primary text-white"
                                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700")
                              }
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Dica: Use Option/Alt + clique na aresta, ou dê duplo clique na medida.
                    </p>
                  </div>

                  <div className="h-px bg-gray-200 dark:bg-gray-700 mt-6"></div>
                </div>
              ) : null}

              <div>
                <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">
                      transform
                    </span>{" "}
                    Transformação
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  <div className="relative group">
                    <span className="absolute left-2.5 top-1.5 text-[10px] text-gray-400 font-bold group-hover:text-primary transition-colors cursor-ew-resize">
                      X
                    </span>
                    <input
                      className={
                        "w-full pl-7 pr-2 " +
                        inputBaseClass +
                        " " +
                        inputDisabledClass
                      }
                      type="number"
                      value={
                        selectedBounds
                          ? Number(pxToCm(selectedBounds.x).toFixed(2))
                          : 0
                      }
                      disabled
                    />
                  </div>
                  <div className="relative group">
                    <span className="absolute left-2.5 top-1.5 text-[10px] text-gray-400 font-bold group-hover:text-primary transition-colors cursor-ns-resize">
                      Y
                    </span>
                    <input
                      className={
                        "w-full pl-7 pr-2 " +
                        inputBaseClass +
                        " " +
                        inputDisabledClass
                      }
                      type="number"
                      value={
                        selectedBounds
                          ? Number(pxToCm(selectedBounds.y).toFixed(2))
                          : 0
                      }
                      disabled
                    />
                  </div>
                  <div className="relative group">
                    <span className="absolute left-2.5 top-1.5 text-[10px] text-gray-400 font-bold group-hover:text-primary transition-colors cursor-ew-resize">
                      L
                    </span>
                    <input
                      className={
                        "w-full pl-7 pr-2 " +
                        inputBaseClass +
                        " " +
                        inputDisabledClass
                      }
                      type="number"
                      value={
                        selectedBounds
                          ? Number(pxToCm(selectedBounds.width).toFixed(2))
                          : 0
                      }
                      disabled
                    />
                  </div>
                  <div className="relative group">
                    <span className="absolute left-2.5 top-1.5 text-[10px] text-gray-400 font-bold group-hover:text-primary transition-colors cursor-ns-resize">
                      A
                    </span>
                    <input
                      className={
                        "w-full pl-7 pr-2 " +
                        inputBaseClass +
                        " " +
                        inputDisabledClass
                      }
                      type="number"
                      value={
                        selectedBounds
                          ? Number(pxToCm(selectedBounds.height).toFixed(2))
                          : 0
                      }
                      disabled
                    />
                  </div>
                </div>
              </div>
              <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
              {/* Appearance section omitted for brevity, can be added later */}
            </div>
          </>
        ) : showToolProperties ? (
          <>
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/30">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted dark:text-text-muted-dark">
                {tool === "mirror"
                  ? "Espelhar"
                  : tool === "unfold"
                    ? "Desdobrar"
                    : "Margem de costura"}
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
              {tool === "mirror" && (
                <div>
                  <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 block">
                    Eixo de Espelhamento
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer">
                      <input
                        type="radio"
                        name="mirror-axis"
                        value="vertical"
                        checked={mirrorAxis === "vertical"}
                        onChange={() => setMirrorAxis("vertical")}
                        className="w-4 h-4"
                      />
                      <span>Vertical</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer">
                      <input
                        type="radio"
                        name="mirror-axis"
                        value="horizontal"
                        checked={mirrorAxis === "horizontal"}
                        onChange={() => setMirrorAxis("horizontal")}
                        className="w-4 h-4"
                      />
                      <span>Horizontal</span>
                    </label>
                  </div>
                  <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    Clique em uma forma para criar uma cópia espelhada no eixo
                    selecionado.
                  </p>
                </div>
              )}
              {tool === "unfold" && (
                <div>
                  <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 block">
                    Eixo de Desdobramento
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer">
                      <input
                        type="radio"
                        name="unfold-axis"
                        value="vertical"
                        checked={unfoldAxis === "vertical"}
                        onChange={() => setUnfoldAxis("vertical")}
                        className="w-4 h-4"
                      />
                      <span>Vertical</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer">
                      <input
                        type="radio"
                        name="unfold-axis"
                        value="horizontal"
                        checked={unfoldAxis === "horizontal"}
                        onChange={() => setUnfoldAxis("horizontal")}
                        className="w-4 h-4"
                      />
                      <span>Horizontal</span>
                    </label>
                  </div>
                  <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    Clique em uma forma desenhada pela metade. O sistema irá
                    duplicar, espelhar e unir as metades numa peça única.
                  </p>
                </div>
              )}

              {tool === "offset" && (
                <div>
                  <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 block">
                    Distância
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      className={
                        "w-24 " +
                        inputBaseClass +
                        " " +
                        inputDisabledClass +
                        " " +
                        (toolOffsetError ? inputErrorClass : inputFocusClass)
                      }
                      type="text"
                      inputMode="decimal"
                      value={toolOffsetDraft}
                      onFocus={() => setIsEditingToolOffset(true)}
                      onChange={(e) => {
                        setToolOffsetDraft(e.target.value);
                        setToolOffsetError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          bumpToolOffset(1);
                          return;
                        }
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          bumpToolOffset(-1);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setIsEditingToolOffset(false);
                          setToolOffsetDraft(formatPtBrDecimalFixed(offsetValueCm, 2));
                          setToolOffsetError(null);
                        }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyToolOffsetDraft(toolOffsetDraft);
                          setIsEditingToolOffset(false);
                        }
                      }}
                      onWheel={(e) => {
                        if (document.activeElement !== e.currentTarget) return;
                        e.preventDefault();
                        e.stopPropagation();
                        bumpToolOffset(e.deltaY < 0 ? 1 : -1);
                      }}
                      onBlur={() => {
                        applyToolOffsetDraft(toolOffsetDraft);
                        setIsEditingToolOffset(false);
                      }}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      cm
                    </span>
                  </div>
                  {toolOffsetError ? (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-500">
                      {toolOffsetError}
                    </p>
                  ) : null}
                  <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    Clique em uma forma fechada para gerar a margem tracejada.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-4 text-center text-gray-500 text-xs">
            Nenhum objeto selecionado
          </div>
        )}
      </div>
    </aside>
  );
}
