"use client";

import React, { useState } from "react";
import { useEditor } from "./EditorContext";
import { figureWorldBoundingBox } from "./figurePath";
import { pxToCm } from "./measureUnits";
import { PX_PER_CM } from "./constants";
import { setEdgeTargetLengthPx } from "./edgeEdit";
import {
  applySemanticStyleToCurveFigure,
  ensureCurveCustomSnapshot,
  restoreCurveCustomSnapshot,
  saveCurveCustomSnapshot,
  semanticPresetsByCategory,
} from "./styledCurves";
import type { SemanticCurveId } from "./types";
import {
  breakStyledLinkIfNeeded,
  markCurveCustomSnapshotDirtyIfPresent,
  reapplyStyledCurveWithParams,
} from "./styledCurves";
import type { StyledCurveParams } from "./types";
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
    selectedFigureIds,
    figures,
    setFigures,
    selectedEdge,
    setSelectedEdge,
    setEdgeAnchorPreference,
    offsetValueCm,
    setOffsetValueCm,
    mirrorAxis,
    setMirrorAxis,
    unfoldAxis,
    setUnfoldAxis,
  } = useEditor();
  const selectedFigure = figures.find((f) => f.id === selectedFigureId);

  const [figureNameDraft, setFigureNameDraft] = useState<string>("");
  const [isEditingFigureName, setIsEditingFigureName] = useState(false);

  React.useEffect(() => {
    if (!selectedFigure) return;
    if (isEditingFigureName) return;
    setFigureNameDraft(selectedFigure.name ?? "");
  }, [isEditingFigureName, selectedFigure]);

  const applyFigureNameDraft = (raw: string) => {
    if (!selectedFigure) return;
    const trimmed = raw.trim();
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== selectedFigure.id) return f;
        return { ...f, name: trimmed.length ? trimmed : undefined };
      })
    );
    setFigureNameDraft(trimmed);
  };

  const curveSelection =
    selectedFigure?.tool === "curve" ? selectedFigure : null;
  const showCurveStylePanel = tool === "curve" || curveSelection != null;
  const presetGroups = semanticPresetsByCategory();
  const defaultPresetId = presetGroups.flatMap((g) => g.presets)[0]?.id ?? null;
  const [curveStylePresetId, setCurveStylePresetId] = useState<
    SemanticCurveId | ""
  >((defaultPresetId as SemanticCurveId | null) ?? "");

  const presetMetaById = React.useMemo(() => {
    const map = new Map<
      SemanticCurveId,
      { label: string; categoryLabel: string }
    >();
    for (const group of presetGroups) {
      for (const preset of group.presets) {
        map.set(preset.id, { label: preset.label, categoryLabel: group.label });
      }
    }
    return map;
  }, [presetGroups]);

  const activeStyleMeta = (() => {
    const semanticId = curveSelection?.styledData?.semanticId;
    if (!semanticId) return null;
    return {
      semanticId,
      ...(presetMetaById.get(semanticId) ?? {
        label: semanticId,
        categoryLabel: "",
      }),
    };
  })();

  const selectedStyledParams: StyledCurveParams | null =
    curveSelection?.styledData?.params ?? null;

  const [curveHeightDraft, setCurveHeightDraft] = useState<string>("1,00");
  const [curveHeightError, setCurveHeightError] = useState<string | null>(null);
  const [isEditingCurveHeight, setIsEditingCurveHeight] = useState(false);

  const [curveBiasDraft, setCurveBiasDraft] = useState<string>("0,00");
  const [curveBiasError, setCurveBiasError] = useState<string | null>(null);
  const [isEditingCurveBias, setIsEditingCurveBias] = useState(false);

  const [curveRotationDraft, setCurveRotationDraft] = useState<string>("0");
  const [curveRotationError, setCurveRotationError] = useState<string | null>(
    null
  );
  const [isEditingCurveRotation, setIsEditingCurveRotation] = useState(false);

  const [curveFlipX, setCurveFlipX] = useState(false);
  const [curveFlipY, setCurveFlipY] = useState(false);

  React.useEffect(() => {
    if (!curveSelection) return;
    if (!curveSelection.customSnapshot) {
      setFigures((prev) =>
        prev.map((f) => {
          if (f.id !== curveSelection.id) return f;
          if (f.kind === "seam") return f;
          return ensureCurveCustomSnapshot(f);
        })
      );
    }
    if (!curveSelection.styledData) return;

    const p = curveSelection.styledData.params;
    if (!isEditingCurveHeight) {
      setCurveHeightDraft(formatPtBrDecimalFixed(p.height, 2));
      setCurveHeightError(null);
    }
    if (!isEditingCurveBias) {
      setCurveBiasDraft(formatPtBrDecimalFixed(p.bias, 2));
      setCurveBiasError(null);
    }
    if (!isEditingCurveRotation) {
      setCurveRotationDraft(String(Math.round(p.rotationDeg)));
      setCurveRotationError(null);
    }
    setCurveFlipX(!!p.flipX);
    setCurveFlipY(!!p.flipY);
  }, [
    curveSelection,
    isEditingCurveBias,
    isEditingCurveHeight,
    isEditingCurveRotation,
    setFigures,
  ]);

  React.useEffect(() => {
    if (!curveSelection) return;
    if (curveSelection.styledData?.semanticId) {
      setCurveStylePresetId(curveSelection.styledData.semanticId);
      return;
    }
    setCurveStylePresetId("");
  }, [curveSelection]);

  React.useEffect(() => {
    if (!showCurveStylePanel) return;
    // In tool mode (no curve selected), start with a default preset.
    // When a curve is selected and is custom, we keep "Customizado" (empty value).
    if (
      tool === "curve" &&
      !curveSelection &&
      !curveStylePresetId &&
      defaultPresetId
    ) {
      setCurveStylePresetId(defaultPresetId);
    }
  }, [
    curveSelection,
    curveStylePresetId,
    defaultPresetId,
    showCurveStylePanel,
    tool,
  ]);

  const applyCurveStyleById = (semanticId: SemanticCurveId) => {
    if (!curveSelection) return;

    setSelectedEdge(null);
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== curveSelection.id) return f;
        if (f.kind === "seam") return f;
        const res = applySemanticStyleToCurveFigure({
          figure: f,
          semanticId,
        });
        return "figure" in res ? res.figure : f;
      })
    );
  };

  const applyCustomFromSnapshot = () => {
    if (!curveSelection) return;
    setSelectedEdge(null);
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== curveSelection.id) return f;
        if (f.kind === "seam") return f;
        return restoreCurveCustomSnapshot(ensureCurveCustomSnapshot(f));
      })
    );
  };

  const updateCustomSnapshot = () => {
    if (!curveSelection) return;
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== curveSelection.id) return f;
        if (f.kind === "seam") return f;
        return saveCurveCustomSnapshot(f);
      })
    );
  };

  const applyStyledParams = (params: Partial<StyledCurveParams>) => {
    if (!curveSelection) return;
    if (!curveSelection.styledData) return;

    setSelectedEdge(null);
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== curveSelection.id) return f;
        if (f.kind === "seam") return f;
        const res = reapplyStyledCurveWithParams({ figure: f, params });
        return "figure" in res ? res.figure : f;
      })
    );
  };

  const renderCurveStylePanel = (options: {
    showHelp: boolean;
    helpWhenNoCurveSelected?: string;
  }) => {
    if (!showCurveStylePanel) return null;

    const { showHelp, helpWhenNoCurveSelected } = options;

    const isCustomSelected = curveStylePresetId === "";
    const showUpdateCustomButton =
      !!curveSelection &&
      !curveSelection.styledData &&
      (curveSelection.customSnapshotDirty || !curveSelection.customSnapshot);

    const handlePresetChange = (nextRaw: string) => {
      const next = nextRaw as SemanticCurveId | "";
      setCurveStylePresetId(next);

      if (!curveSelection) return;

      if (next === "") {
        applyCustomFromSnapshot();
        return;
      }

      applyCurveStyleById(next);
    };

    return (
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h4 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Estilo de Curva
          </h4>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
              Preset
            </span>
            <select
              className={
                "w-full " +
                inputBaseClass +
                " " +
                inputFocusClass +
                " !text-left"
              }
              value={curveStylePresetId ?? ""}
              onChange={(e) => handlePresetChange(e.target.value)}
            >
              <option value="">Customizado</option>
              {presetGroups
                .filter((g) => g.presets.length)
                .map((g) => (
                  <optgroup key={g.category} label={g.label}>
                    {g.presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </div>

          {showUpdateCustomButton ? (
            <button
              type="button"
              onClick={updateCustomSnapshot}
              className={
                "w-full rounded px-3 py-2 text-xs font-bold transition-colors " +
                "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-700/60"
              }
            >
              Atualizar Customizado
            </button>
          ) : null}

          {curveSelection?.styledData ? (
            <div className="space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-bold">Estilo atual:</span>{" "}
                {activeStyleMeta?.label}
              </p>
              {activeStyleMeta?.categoryLabel ? (
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  {activeStyleMeta.categoryLabel}
                </p>
              ) : null}
            </div>
          ) : showHelp ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {curveSelection
                ? isCustomSelected
                  ? "Curva em modo custom. Selecione um preset para aplicar automaticamente."
                  : "Selecionar um preset aplica automaticamente na curva."
                : (helpWhenNoCurveSelected ??
                  "Selecione uma curva para aplicar um estilo.")}
            </p>
          ) : null}
        </div>

        {curveSelection?.styledData ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Parâmetros
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                ↑↓ e scroll
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Altura
                </span>
                <input
                  className={
                    "w-full " +
                    inputBaseClass +
                    " " +
                    (curveHeightError ? inputErrorClass : inputFocusClass)
                  }
                  type="text"
                  inputMode="decimal"
                  value={curveHeightDraft}
                  onFocus={() => setIsEditingCurveHeight(true)}
                  onChange={(e) => {
                    setCurveHeightDraft(e.target.value);
                    setCurveHeightError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      bumpCurveHeight(1);
                      return;
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      bumpCurveHeight(-1);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setIsEditingCurveHeight(false);
                      if (selectedStyledParams) {
                        setCurveHeightDraft(
                          formatPtBrDecimalFixed(selectedStyledParams.height, 2)
                        );
                      }
                      setCurveHeightError(null);
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyHeightDraft(curveHeightDraft);
                      setIsEditingCurveHeight(false);
                    }
                  }}
                  onWheel={(e) => {
                    if (document.activeElement !== e.currentTarget) return;
                    e.preventDefault();
                    e.stopPropagation();
                    bumpCurveHeight(e.deltaY < 0 ? 1 : -1);
                  }}
                  onBlur={() => {
                    applyHeightDraft(curveHeightDraft);
                    setIsEditingCurveHeight(false);
                  }}
                />
                {curveHeightError ? (
                  <p className="text-xs text-red-600 dark:text-red-500">
                    {curveHeightError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Bias
                </span>
                <input
                  className={
                    "w-full " +
                    inputBaseClass +
                    " " +
                    (curveBiasError ? inputErrorClass : inputFocusClass)
                  }
                  type="text"
                  inputMode="decimal"
                  value={curveBiasDraft}
                  onFocus={() => setIsEditingCurveBias(true)}
                  onChange={(e) => {
                    setCurveBiasDraft(e.target.value);
                    setCurveBiasError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      bumpCurveBias(1);
                      return;
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      bumpCurveBias(-1);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setIsEditingCurveBias(false);
                      if (selectedStyledParams) {
                        setCurveBiasDraft(
                          formatPtBrDecimalFixed(selectedStyledParams.bias, 2)
                        );
                      }
                      setCurveBiasError(null);
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyBiasDraft(curveBiasDraft);
                      setIsEditingCurveBias(false);
                    }
                  }}
                  onWheel={(e) => {
                    if (document.activeElement !== e.currentTarget) return;
                    e.preventDefault();
                    e.stopPropagation();
                    bumpCurveBias(e.deltaY < 0 ? 1 : -1);
                  }}
                  onBlur={() => {
                    applyBiasDraft(curveBiasDraft);
                    setIsEditingCurveBias(false);
                  }}
                />
                {curveBiasError ? (
                  <p className="text-xs text-red-600 dark:text-red-500">
                    {curveBiasError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rotação
                </span>
                <input
                  className={
                    "w-full " +
                    inputBaseClass +
                    " " +
                    (curveRotationError ? inputErrorClass : inputFocusClass)
                  }
                  type="text"
                  inputMode="decimal"
                  value={curveRotationDraft}
                  onFocus={() => setIsEditingCurveRotation(true)}
                  onChange={(e) => {
                    setCurveRotationDraft(e.target.value);
                    setCurveRotationError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      bumpCurveRotation(1);
                      return;
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      bumpCurveRotation(-1);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setIsEditingCurveRotation(false);
                      if (selectedStyledParams) {
                        setCurveRotationDraft(
                          String(Math.round(selectedStyledParams.rotationDeg))
                        );
                      }
                      setCurveRotationError(null);
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyRotationDraft(curveRotationDraft);
                      setIsEditingCurveRotation(false);
                    }
                  }}
                  onWheel={(e) => {
                    if (document.activeElement !== e.currentTarget) return;
                    e.preventDefault();
                    e.stopPropagation();
                    bumpCurveRotation(e.deltaY < 0 ? 1 : -1);
                  }}
                  onBlur={() => {
                    applyRotationDraft(curveRotationDraft);
                    setIsEditingCurveRotation(false);
                  }}
                />
                {curveRotationError ? (
                  <p className="text-xs text-red-600 dark:text-red-500">
                    {curveRotationError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 pt-5">
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                  Espelhamento
                </span>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={curveFlipX}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setCurveFlipX(next);
                        applyStyledParams({ flipX: next });
                      }}
                      className="w-4 h-4"
                    />
                    <span>Flip X</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={curveFlipY}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setCurveFlipY(next);
                        applyStyledParams({ flipY: next });
                      }}
                      className="w-4 h-4"
                    />
                    <span>Flip Y</span>
                  </label>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Ajustes paramétricos reaplicam o template na mesma curva.
            </p>
          </div>
        ) : null}

        <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
      </div>
    );
  };

  const clampRotationDeg = (v: number): number => {
    if (!Number.isFinite(v)) return 0;
    // Keep within [-180, 180] for predictable behavior.
    let x = v;
    while (x > 180) x -= 360;
    while (x < -180) x += 360;
    return x;
  };

  const applyHeightDraft = (raw: string) => {
    const v = parsePtBrDecimal(raw);
    if (v == null) {
      setCurveHeightError("Valor inválido");
      return;
    }
    const safe = clampMin(v, 0.1);
    setCurveHeightDraft(formatPtBrDecimalFixed(safe, 2));
    setCurveHeightError(null);
    applyStyledParams({ height: safe });
  };

  const bumpCurveHeight = (direction: 1 | -1) => {
    const next = bumpNumericValue({
      raw: curveHeightDraft,
      fallback: selectedStyledParams?.height ?? 1,
      direction,
      step: 0.1,
      min: 0.1,
    });
    setCurveHeightDraft(formatPtBrDecimalFixed(next, 2));
    setCurveHeightError(null);
    applyStyledParams({ height: next });
  };

  const applyBiasDraft = (raw: string) => {
    const v = parsePtBrDecimal(raw);
    if (v == null) {
      setCurveBiasError("Valor inválido");
      return;
    }
    const safe = Math.max(-1, Math.min(1, v));
    setCurveBiasDraft(formatPtBrDecimalFixed(safe, 2));
    setCurveBiasError(null);
    applyStyledParams({ bias: safe });
  };

  const bumpCurveBias = (direction: 1 | -1) => {
    const next = bumpNumericValue({
      raw: curveBiasDraft,
      fallback: selectedStyledParams?.bias ?? 0,
      direction,
      step: 0.1,
      min: -1,
      max: 1,
    });
    setCurveBiasDraft(formatPtBrDecimalFixed(next, 2));
    setCurveBiasError(null);
    applyStyledParams({ bias: next });
  };

  const applyRotationDraft = (raw: string) => {
    const normalized = raw.trim().replace(",", ".");
    const v = Number(normalized);
    if (!Number.isFinite(v)) {
      setCurveRotationError("Valor inválido");
      return;
    }
    const safe = clampRotationDeg(v);
    setCurveRotationDraft(String(Math.round(safe)));
    setCurveRotationError(null);
    applyStyledParams({ rotationDeg: safe });
  };

  const bumpCurveRotation = (direction: 1 | -1) => {
    const raw = curveRotationDraft.trim();
    const current = Number(raw.replace(",", "."));
    const base = Number.isFinite(current)
      ? current
      : (selectedStyledParams?.rotationDeg ?? 0);
    const next = clampRotationDeg(base + direction * 1);
    setCurveRotationDraft(String(Math.round(next)));
    setCurveRotationError(null);
    applyStyledParams({ rotationDeg: next });
  };

  const seamForSelection = (() => {
    if (!selectedFigure) return null;
    if (selectedFigure.kind === "seam") return selectedFigure;
    return (
      figures.find(
        (f) => f.kind === "seam" && f.parentId === selectedFigure.id
      ) ?? null
    );
  })();

  const seamForSelectionId = seamForSelection?.id ?? null;
  const seamForSelectionOffsetCm = seamForSelection?.offsetCm;

  const offsetDisplayCm = seamForSelection?.offsetCm ?? offsetValueCm;

  const inputBaseClass =
    "px-2 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-200 text-right outline-none transition-all shadow-sm";
  const inputFocusClass =
    "focus:ring-1 focus:ring-gray-400/50 focus:border-gray-400";
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
      prev.map((f) =>
        f.id === seamForSelection.id ? { ...f, offsetCm: safe } : f
      )
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
    selectedEdge &&
    selectedFigure &&
    selectedEdge.figureId === selectedFigure.id
      ? (() => {
          const edge = selectedFigure.edges.find(
            (e) => e.id === selectedEdge.edgeId
          );
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

  const [collapsed, setCollapsed] = useState(true);
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
        return updated
          ? markCurveCustomSnapshotDirtyIfPresent(
              breakStyledLinkIfNeeded(updated)
            )
          : f;
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
    !selectedFigure &&
    (tool === "mirror" ||
      tool === "unfold" ||
      tool === "offset" ||
      tool === "curve");

  const hasCanvasSelection =
    selectedFigureId != null ||
    selectedFigureIds.length > 0 ||
    selectedEdge != null;

  React.useEffect(() => {
    // Default behavior:
    // - Start collapsed
    // - Open when something is selected
    // - Close when selection is cleared (unless we are showing tool properties)
    if (hasCanvasSelection || showToolProperties) {
      setCollapsed(false);
      return;
    }
    setCollapsed(true);
  }, [hasCanvasSelection, showToolProperties]);

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
              {showCurveStylePanel
                ? renderCurveStylePanel({ showHelp: true })
                : null}

              {selectedFigureIds.length === 1 && (
                <div>
                  <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 block">
                    Nome da figura
                  </label>
                  <input
                    className={
                      "w-full " +
                      inputBaseClass +
                      " " +
                      inputFocusClass +
                      " !text-left"
                    }
                    type="text"
                    value={figureNameDraft}
                    placeholder="Ex.: Frente, Manga, Gola…"
                    onFocus={() => setIsEditingFigureName(true)}
                    onChange={(e) => setFigureNameDraft(e.target.value)}
                    onBlur={() => {
                      setIsEditingFigureName(false);
                      applyFigureNameDraft(figureNameDraft);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                  />

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Tamanho
                      </span>
                      <select
                        className={
                          "w-full " +
                          inputBaseClass +
                          " " +
                          inputFocusClass +
                          " !text-left"
                        }
                        value={String(selectedFigure.nameFontSizePx ?? 24)}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          const safe = Number.isFinite(v)
                            ? Math.max(6, Math.min(256, v))
                            : 24;
                          setFigures((prev) =>
                            prev.map((f) =>
                              f.id === selectedFigure.id
                                ? { ...f, nameFontSizePx: safe }
                                : f
                            )
                          );
                        }}
                      >
                        <option value="12">12 px</option>
                        <option value="16">16 px</option>
                        <option value="20">20 px</option>
                        <option value="24">24 px</option>
                        <option value="32">32 px</option>
                        <option value="40">40 px</option>
                        <option value="48">48 px</option>
                        <option value="64">64 px</option>
                        <option value="80">80 px</option>
                        <option value="96">96 px</option>
                        <option value="128">128 px</option>
                        <option value="160">160 px</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Rotação
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          style={{
                            height: 27,
                            width: 40,
                            padding: 0,
                            lineHeight: 0,
                          }}
                          className={
                            inputBaseClass +
                            " " +
                            inputFocusClass +
                            " shrink-0 w-10 h-8 flex items-center justify-center" +
                            " !px-0 !py-0 !text-center"
                          }
                          title="Rotacionar 15°"
                          onClick={() => {
                            const current = selectedFigure.nameRotationDeg ?? 0;
                            const next = (((current + 15) % 360) + 360) % 360;
                            setFigures((prev) =>
                              prev.map((f) =>
                                f.id === selectedFigure.id
                                  ? { ...f, nameRotationDeg: next }
                                  : f
                              )
                            );
                          }}
                        >
                          <span
                            className="material-symbols-outlined leading-none"
                            style={{ fontSize: 20 }}
                          >
                            rotate_right
                          </span>
                        </button>

                        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                          {String(
                            (((selectedFigure.nameRotationDeg ?? 0) % 360) +
                              360) %
                              360
                          )}
                          °
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                          setSeamOffsetDraft(
                            formatPtBrDecimalFixed(offsetDisplayCm, 2)
                          );
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
                          "w-24 " + inputBaseClass + " " + inputFocusClass
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
                          if (document.activeElement !== e.currentTarget)
                            return;
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
                        {(
                          [
                            { key: "start", label: "Início" },
                            { key: "mid", label: "Meio" },
                            { key: "end", label: "Fim" },
                          ] as const
                        ).map((opt) => {
                          const active =
                            (selectedEdge?.anchor ?? "end") === opt.key;
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
                                  ? (() => {
                                      setEdgeAnchorPreference(
                                        selectedEdge.figureId,
                                        selectedEdge.edgeId,
                                        opt.key
                                      );
                                      setSelectedEdge({
                                        ...selectedEdge,
                                        anchor: opt.key,
                                      });
                                    })()
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
                      Dica: Use Option/Alt + clique na aresta, ou dê duplo
                      clique na medida.
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
                    : tool === "curve"
                      ? "Curvas"
                      : "Margem de costura"}
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
              {tool === "curve"
                ? renderCurveStylePanel({
                    showHelp: true,
                    helpWhenNoCurveSelected:
                      "Desenhe e selecione uma curva para aplicar um estilo.",
                  })
                : null}

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
                          setToolOffsetDraft(
                            formatPtBrDecimalFixed(offsetValueCm, 2)
                          );
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
