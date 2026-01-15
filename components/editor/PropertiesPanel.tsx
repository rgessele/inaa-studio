"use client";

import React, {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useEditor } from "./EditorContext";
import { figureWorldBoundingBox } from "./figurePath";
import { cmToPx, pxToCm } from "./measureUnits";
import { PX_PER_CM } from "./constants";
import { setEdgeTargetLengthPx } from "./edgeEdit";
import { ellipseAsCubics } from "./figureGeometry";
import {
  applySemanticStyleToCurveFigure,
  applySemanticStyleToFigureEdge,
  ensureCurveCustomSnapshot,
  restoreCurveCustomSnapshot,
  saveCurveCustomSnapshot,
  semanticPresetsByCategory,
} from "./styledCurves";
import type { SemanticCurveId } from "./types";
import {
  breakStyledLinkIfNeeded,
  markCurveCustomSnapshotDirtyIfPresent,
  reapplyStyledEdgeWithParams,
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

  const isDark = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof document === "undefined") return () => {};
      const root = document.documentElement;
      const obs = new MutationObserver(() => onStoreChange());
      obs.observe(root, { attributes: true, attributeFilter: ["class"] });
      return () => obs.disconnect();
    },
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
    () => false
  );

  const resolveAci7 = useCallback(
    () => (isDark ? "#ffffff" : "#000000"),
    [isDark]
  );

  const isMac = useSyncExternalStore(
    () => () => {
      // no-op: OS does not change during a session
    },
    () => /Mac|iPhone|iPod|iPad/.test(navigator.userAgent),
    () => false
  );

  const makeLocalId = useCallback((prefix: string): string => {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? `${prefix}_${crypto.randomUUID()}`
      : `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }, []);

  const rebuildCircleGeometry = useCallback(
    (figureId: string, rxPx: number, ryPx: number) => {
      const safeRx = Math.max(0.01 * PX_PER_CM, rxPx);
      const safeRy = Math.max(0.01 * PX_PER_CM, ryPx);
      const { nodes } = ellipseAsCubics(safeRx, safeRy);

      setSelectedEdge(null);
      setFigures((prev) =>
        prev.map((f) => {
          if (f.id !== figureId) return f;
          if (f.kind === "seam") return f;
          if (f.tool !== "circle") return f;

          const nextNodes = nodes.map((n, idx) => {
            const existing = f.nodes[idx];
            return {
              id: existing?.id ?? makeLocalId("n"),
              x: n.x,
              y: n.y,
              mode: n.mode,
              inHandle: { x: n.inHandle.x, y: n.inHandle.y },
              outHandle: { x: n.outHandle.x, y: n.outHandle.y },
            };
          });

          const nextEdges = nodes.map((_, idx) => {
            const existing = f.edges[idx];
            return {
              id: existing?.id ?? makeLocalId("e"),
              from: nextNodes[idx].id,
              to: nextNodes[(idx + 1) % nextNodes.length].id,
              kind: "cubic" as const,
            };
          });

          return {
            ...f,
            closed: true,
            nodes: nextNodes,
            edges: nextEdges,
          };
        })
      );
    },
    [makeLocalId, setFigures, setSelectedEdge]
  );

  const selectedCircleMeasures = useMemo(() => {
    if (!selectedFigureId) return null;
    const f = figures.find((x) => x.id === selectedFigureId) ?? null;
    if (!f) return null;
    if (f.kind === "seam") return null;
    if (f.tool !== "circle") return null;
    return f.measures?.circle ?? null;
  }, [figures, selectedFigureId]);

  const selectedCircleIsPerfect =
    selectedCircleMeasures?.radiusPx != null &&
    selectedCircleMeasures.radiusPx > 0;

  const [circleRadiusDraft, setCircleRadiusDraft] = useState<string>("0,00");
  const [circleRadiusError, setCircleRadiusError] = useState<string | null>(
    null
  );
  const [circleRadiusEditingForId, setCircleRadiusEditingForId] = useState<
    string | null
  >(null);

  const [circleRxDraft, setCircleRxDraft] = useState<string>("0,00");
  const [circleRxError, setCircleRxError] = useState<string | null>(null);
  const [circleRxEditingForId, setCircleRxEditingForId] = useState<
    string | null
  >(null);

  const [circleRyDraft, setCircleRyDraft] = useState<string>("0,00");
  const [circleRyError, setCircleRyError] = useState<string | null>(null);
  const [circleRyEditingForId, setCircleRyEditingForId] = useState<
    string | null
  >(null);

  const [circleCircDraft, setCircleCircDraft] = useState<string>("0,00");
  const [circleCircError, setCircleCircError] = useState<string | null>(null);
  const [circleCircEditingForId, setCircleCircEditingForId] = useState<
    string | null
  >(null);

  const isEditingCircleRadius =
    selectedFigureId != null && circleRadiusEditingForId === selectedFigureId;
  const isEditingCircleRx =
    selectedFigureId != null && circleRxEditingForId === selectedFigureId;
  const isEditingCircleRy =
    selectedFigureId != null && circleRyEditingForId === selectedFigureId;
  const isEditingCircleCirc =
    selectedFigureId != null && circleCircEditingForId === selectedFigureId;

  const circleRadiusValue = selectedCircleMeasures
    ? formatPtBrDecimalFixed(pxToCm(selectedCircleMeasures.radiusPx ?? 0), 2)
    : "0,00";
  const circleRxValue = selectedCircleMeasures
    ? formatPtBrDecimalFixed(pxToCm(selectedCircleMeasures.rxPx), 2)
    : "0,00";
  const circleRyValue = selectedCircleMeasures
    ? formatPtBrDecimalFixed(pxToCm(selectedCircleMeasures.ryPx), 2)
    : "0,00";
  const circleCircValue = selectedCircleMeasures
    ? formatPtBrDecimalFixed(pxToCm(selectedCircleMeasures.circumferencePx), 2)
    : "0,00";

  const applyCircleRadiusDraft = (raw: string) => {
    if (!selectedFigureId || !selectedCircleMeasures) return;
    const cm = parsePtBrDecimal(raw);
    if (cm == null) {
      setCircleRadiusError("Valor inválido");
      return;
    }
    const safeCm = clampMin(cm, 0.01);
    const rPx = cmToPx(safeCm);
    rebuildCircleGeometry(selectedFigureId, rPx, rPx);
    setCircleRadiusDraft(formatPtBrDecimalFixed(safeCm, 2));
    setCircleRadiusError(null);
  };

  const applyCircleRxDraft = (raw: string) => {
    if (!selectedFigureId || !selectedCircleMeasures) return;
    const cm = parsePtBrDecimal(raw);
    if (cm == null) {
      setCircleRxError("Valor inválido");
      return;
    }
    const safeCm = clampMin(cm, 0.01);
    rebuildCircleGeometry(
      selectedFigureId,
      cmToPx(safeCm),
      selectedCircleMeasures.ryPx
    );
    setCircleRxDraft(formatPtBrDecimalFixed(safeCm, 2));
    setCircleRxError(null);
  };

  const applyCircleRyDraft = (raw: string) => {
    if (!selectedFigureId || !selectedCircleMeasures) return;
    const cm = parsePtBrDecimal(raw);
    if (cm == null) {
      setCircleRyError("Valor inválido");
      return;
    }
    const safeCm = clampMin(cm, 0.01);
    rebuildCircleGeometry(
      selectedFigureId,
      selectedCircleMeasures.rxPx,
      cmToPx(safeCm)
    );
    setCircleRyDraft(formatPtBrDecimalFixed(safeCm, 2));
    setCircleRyError(null);
  };

  const applyCircleCircDraft = (raw: string) => {
    if (!selectedFigureId || !selectedCircleMeasures) return;
    const cm = parsePtBrDecimal(raw);
    if (cm == null) {
      setCircleCircError("Valor inválido");
      return;
    }
    const safeCm = clampMin(cm, 0.01);
    const targetPx = cmToPx(safeCm);

    if (selectedCircleIsPerfect) {
      const rPx = targetPx / (2 * Math.PI);
      rebuildCircleGeometry(selectedFigureId, rPx, rPx);
      setCircleCircDraft(formatPtBrDecimalFixed(safeCm, 2));
      setCircleCircError(null);
      return;
    }

    const currentPx = selectedCircleMeasures.circumferencePx;
    if (!(currentPx > 1e-6)) {
      setCircleCircError("Valor inválido");
      return;
    }

    const s = targetPx / currentPx;
    const nextRx = selectedCircleMeasures.rxPx * s;
    const nextRy = selectedCircleMeasures.ryPx * s;
    rebuildCircleGeometry(selectedFigureId, nextRx, nextRy);
    setCircleCircDraft(formatPtBrDecimalFixed(safeCm, 2));
    setCircleCircError(null);
  };

  const bumpCircleRadius = (direction: 1 | -1) => {
    if (!selectedCircleMeasures) return;
    const fallback = pxToCm(selectedCircleMeasures.radiusPx ?? 0);
    const next = bumpNumericValue({
      raw: circleRadiusDraft,
      fallback,
      direction,
      step: 0.1,
      min: 0.01,
    });
    const nextStr = formatPtBrDecimalFixed(next, 2);
    setCircleRadiusDraft(nextStr);
    applyCircleRadiusDraft(nextStr);
  };

  const bumpCircleRx = (direction: 1 | -1) => {
    if (!selectedCircleMeasures) return;
    const fallback = pxToCm(selectedCircleMeasures.rxPx);
    const next = bumpNumericValue({
      raw: circleRxDraft,
      fallback,
      direction,
      step: 0.1,
      min: 0.01,
    });
    const nextStr = formatPtBrDecimalFixed(next, 2);
    setCircleRxDraft(nextStr);
    applyCircleRxDraft(nextStr);
  };

  const bumpCircleRy = (direction: 1 | -1) => {
    if (!selectedCircleMeasures) return;
    const fallback = pxToCm(selectedCircleMeasures.ryPx);
    const next = bumpNumericValue({
      raw: circleRyDraft,
      fallback,
      direction,
      step: 0.1,
      min: 0.01,
    });
    const nextStr = formatPtBrDecimalFixed(next, 2);
    setCircleRyDraft(nextStr);
    applyCircleRyDraft(nextStr);
  };

  const bumpCircleCirc = (direction: 1 | -1) => {
    if (!selectedCircleMeasures) return;
    const fallback = pxToCm(selectedCircleMeasures.circumferencePx);
    const next = bumpNumericValue({
      raw: circleCircDraft,
      fallback,
      direction,
      step: 0.1,
      min: 0.01,
    });
    const nextStr = formatPtBrDecimalFixed(next, 2);
    setCircleCircDraft(nextStr);
    applyCircleCircDraft(nextStr);
  };
  const selectedFigure = figures.find((f) => f.id === selectedFigureId);

  const [figureNameDraft, setFigureNameDraft] = useState<string>("");
  const [isEditingFigureName, setIsEditingFigureName] = useState(false);

  const [textValueDraft, setTextValueDraft] = useState<string>("");
  const [isEditingTextValue, setIsEditingTextValue] = useState(false);
  const [textWidthDraft, setTextWidthDraft] = useState<string>("");
  const [isEditingTextWidth, setIsEditingTextWidth] = useState(false);
  const [textLineHeightDraft, setTextLineHeightDraft] = useState<string>("");
  const [isEditingTextLineHeight, setIsEditingTextLineHeight] = useState(false);
  const [textLetterSpacingDraft, setTextLetterSpacingDraft] =
    useState<string>("");
  const [isEditingTextLetterSpacing, setIsEditingTextLetterSpacing] =
    useState(false);
  const [textPaddingDraft, setTextPaddingDraft] = useState<string>("");
  const [isEditingTextPadding, setIsEditingTextPadding] = useState(false);
  const [textBgOpacityDraft, setTextBgOpacityDraft] = useState<string>("");
  const [isEditingTextBgOpacity, setIsEditingTextBgOpacity] = useState(false);

  React.useEffect(() => {
    if (!selectedFigure) return;
    if (isEditingFigureName) return;
    setFigureNameDraft(selectedFigure.name ?? "");
  }, [isEditingFigureName, selectedFigure]);

  React.useEffect(() => {
    if (!selectedFigure) return;
    if (selectedFigure.tool !== "text") return;
    if (!isEditingTextValue) {
      setTextValueDraft((selectedFigure.textValue ?? "") as string);
    }
    if (!isEditingTextWidth) {
      const w = selectedFigure.textWidthPx;
      setTextWidthDraft(
        Number.isFinite(w ?? NaN) && (w ?? 0) > 0
          ? formatPtBrDecimalFixed(w as number, 0)
          : ""
      );
    }
    if (!isEditingTextLineHeight) {
      const v = selectedFigure.textLineHeight;
      const safe = Number.isFinite(v ?? NaN) ? (v as number) : 1.25;
      setTextLineHeightDraft(formatPtBrDecimalFixed(safe, 2));
    }
    if (!isEditingTextLetterSpacing) {
      const v = selectedFigure.textLetterSpacing;
      const safe = Number.isFinite(v ?? NaN) ? (v as number) : 0;
      setTextLetterSpacingDraft(formatPtBrDecimalFixed(safe, 1));
    }
    if (!isEditingTextPadding) {
      const v = selectedFigure.textPaddingPx;
      const safe = Number.isFinite(v ?? NaN) ? (v as number) : 0;
      setTextPaddingDraft(formatPtBrDecimalFixed(safe, 0));
    }
    if (!isEditingTextBgOpacity) {
      const v = selectedFigure.textBackgroundOpacity;
      const safe = Number.isFinite(v ?? NaN) ? (v as number) : 1;
      setTextBgOpacityDraft(formatPtBrDecimalFixed(safe, 2));
    }
  }, [
    isEditingTextBgOpacity,
    isEditingTextLetterSpacing,
    isEditingTextLineHeight,
    isEditingTextPadding,
    isEditingTextValue,
    isEditingTextWidth,
    selectedFigure,
  ]);

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

  const applyTextValueDraft = (raw: string) => {
    if (!selectedFigure) return;
    if (selectedFigure.tool !== "text") return;
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== selectedFigure.id) return f;
        if (f.kind === "seam") return f;
        if (f.tool !== "text") return f;
        return { ...f, textValue: raw };
      })
    );
  };

  const applyTextWidthDraft = (raw: string) => {
    if (!selectedFigure) return;
    if (selectedFigure.tool !== "text") return;

    const v = raw.trim().length ? parsePtBrDecimal(raw) : null;
    const nextWidth =
      v == null || !Number.isFinite(v) || v <= 0 ? undefined : Math.max(10, v);

    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== selectedFigure.id) return f;
        if (f.kind === "seam") return f;
        if (f.tool !== "text") return f;
        return { ...f, textWidthPx: nextWidth };
      })
    );
  };

  const applyTextLineHeightDraft = (raw: string) => {
    if (!selectedFigure) return;
    if (selectedFigure.tool !== "text") return;
    const v = parsePtBrDecimal(raw);
    if (v == null) return;
    const safe = Math.max(0.8, Math.min(3, v));
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== selectedFigure.id) return f;
        if (f.kind === "seam") return f;
        if (f.tool !== "text") return f;
        return { ...f, textLineHeight: safe };
      })
    );
  };

  const applyTextLetterSpacingDraft = (raw: string) => {
    if (!selectedFigure) return;
    if (selectedFigure.tool !== "text") return;
    const v = parsePtBrDecimal(raw);
    if (v == null) return;
    const safe = Math.max(-2, Math.min(20, v));
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== selectedFigure.id) return f;
        if (f.kind === "seam") return f;
        if (f.tool !== "text") return f;
        return { ...f, textLetterSpacing: safe };
      })
    );
  };

  const applyTextPaddingDraft = (raw: string) => {
    if (!selectedFigure) return;
    if (selectedFigure.tool !== "text") return;
    const v = parsePtBrDecimal(raw);
    if (v == null) return;
    const safe = Math.max(0, Math.min(50, v));
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== selectedFigure.id) return f;
        if (f.kind === "seam") return f;
        if (f.tool !== "text") return f;
        return { ...f, textPaddingPx: safe };
      })
    );
  };

  const applyTextBgOpacityDraft = (raw: string) => {
    if (!selectedFigure) return;
    if (selectedFigure.tool !== "text") return;
    const v = parsePtBrDecimal(raw);
    if (v == null) return;
    const safe = Math.max(0, Math.min(1, v));
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== selectedFigure.id) return f;
        if (f.kind === "seam") return f;
        if (f.tool !== "text") return f;
        return { ...f, textBackgroundOpacity: safe };
      })
    );
  };

  const curveSelection =
    selectedFigure?.tool === "curve" ? selectedFigure : null;

  const selectedEdgeKind: "line" | "cubic" | null = (() => {
    if (!selectedEdge) return null;
    if (!selectedFigure) return null;
    if (selectedEdge.figureId !== selectedFigure.id) return null;
    const edge = selectedFigure.edges.find((e) => e.id === selectedEdge.edgeId);
    return edge?.kind ?? null;
  })();

  const isCubicEdgeSelected = selectedEdgeKind === "cubic";

  const selectedEdgeIdForCurveStyle = (() => {
    if (!isCubicEdgeSelected) return null;
    if (!selectedEdge) return null;
    if (!selectedFigure) return null;
    if (selectedEdge.figureId !== selectedFigure.id) return null;
    return selectedEdge.edgeId;
  })();

  const edgeStyledData =
    selectedFigure && selectedEdgeIdForCurveStyle
      ? (selectedFigure.styledEdges?.[selectedEdgeIdForCurveStyle] ?? null)
      : null;

  const activeStyledData = curveSelection?.styledData ?? edgeStyledData;

  const showCurveStylePanel =
    tool === "curve" || curveSelection != null || isCubicEdgeSelected;
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
    const semanticId = activeStyledData?.semanticId;
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
    activeStyledData?.params ?? null;

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
  }, [curveSelection, setFigures]);

  React.useEffect(() => {
    const p = activeStyledData?.params;
    if (!p) return;

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
    activeStyledData,
    isEditingCurveBias,
    isEditingCurveHeight,
    isEditingCurveRotation,
  ]);

  React.useEffect(() => {
    const semanticId = activeStyledData?.semanticId ?? null;
    if (semanticId) {
      setCurveStylePresetId(semanticId);
      return;
    }
    setCurveStylePresetId("");
  }, [activeStyledData]);

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
    if (curveSelection) {
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
      return;
    }

    if (!selectedFigure || !selectedEdgeIdForCurveStyle) return;
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== selectedFigure.id) return f;
        if (f.kind === "seam") return f;
        const res = applySemanticStyleToFigureEdge({
          figure: f,
          edgeId: selectedEdgeIdForCurveStyle,
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
    if (curveSelection) {
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
      return;
    }

    if (!selectedFigure || !selectedEdgeIdForCurveStyle) return;
    if (!edgeStyledData) return;
    setFigures((prev) =>
      prev.map((f) => {
        if (f.id !== selectedFigure.id) return f;
        if (f.kind === "seam") return f;
        const res = reapplyStyledEdgeWithParams({
          figure: f,
          edgeId: selectedEdgeIdForCurveStyle,
          params,
        });
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

      if (curveSelection) {
        if (next === "") {
          applyCustomFromSnapshot();
          return;
        }
        applyCurveStyleById(next);
        return;
      }

      if (!selectedFigure || !selectedEdgeIdForCurveStyle) return;

      if (next === "") {
        setFigures((prev) =>
          prev.map((f) => {
            if (f.id !== selectedFigure.id) return f;
            if (f.kind === "seam") return f;
            if (!f.styledEdges?.[selectedEdgeIdForCurveStyle]) return f;
            const nextStyledEdges = { ...(f.styledEdges ?? {}) };
            delete nextStyledEdges[selectedEdgeIdForCurveStyle];
            const compact = Object.keys(nextStyledEdges).length
              ? nextStyledEdges
              : undefined;
            return { ...f, styledEdges: compact };
          })
        );
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
              data-testid="curve-style-preset"
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

          {activeStyledData ? (
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
                : isCubicEdgeSelected
                  ? "Selecionar um preset aplica automaticamente na aresta curva selecionada."
                  : (helpWhenNoCurveSelected ??
                    "Selecione uma curva para aplicar um estilo.")}
            </p>
          ) : null}
        </div>

        {activeStyledData ? (
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
                  data-testid="curve-style-height"
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
                  data-testid="curve-style-bias"
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
                  data-testid="curve-style-rotation"
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
              Ajustes paramétricos reaplicam o template na mesma
              {curveSelection ? " curva" : " aresta"}.
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

              {selectedFigure?.tool === "circle" &&
              selectedFigure.kind !== "seam" &&
              selectedCircleMeasures ? (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {selectedCircleIsPerfect ? "Círculo" : "Elipse"}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      ↑↓ e scroll
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {selectedCircleIsPerfect ? (
                      <>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Raio
                          </span>
                          <input
                            data-testid="circle-radius"
                            className={
                              "w-full " +
                              inputBaseClass +
                              " " +
                              (isEditingCircleRadius && circleRadiusError
                                ? inputErrorClass
                                : inputFocusClass)
                            }
                            type="text"
                            inputMode="decimal"
                            value={
                              isEditingCircleRadius
                                ? circleRadiusDraft
                                : circleRadiusValue
                            }
                            onFocus={() => {
                              if (!selectedFigureId) return;
                              setCircleRadiusDraft(circleRadiusValue);
                              setCircleRadiusError(null);
                              setCircleRadiusEditingForId(selectedFigureId);
                            }}
                            onChange={(e) => {
                              setCircleRadiusDraft(e.target.value);
                              setCircleRadiusError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                bumpCircleRadius(1);
                                return;
                              }
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                bumpCircleRadius(-1);
                                return;
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setCircleRadiusEditingForId(null);
                                setCircleRadiusDraft(circleRadiusValue);
                                setCircleRadiusError(null);
                              }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                applyCircleRadiusDraft(circleRadiusDraft);
                                setCircleRadiusEditingForId(null);
                              }
                            }}
                            onWheel={(e) => {
                              if (document.activeElement !== e.currentTarget)
                                return;
                              e.preventDefault();
                              e.stopPropagation();
                              bumpCircleRadius(e.deltaY < 0 ? 1 : -1);
                            }}
                            onBlur={() => {
                              applyCircleRadiusDraft(circleRadiusDraft);
                              setCircleRadiusEditingForId(null);
                            }}
                          />
                          {isEditingCircleRadius && circleRadiusError ? (
                            <p className="text-xs text-red-600 dark:text-red-500">
                              {circleRadiusError}
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Circunferência
                          </span>
                          <input
                            data-testid="circle-circumference"
                            className={
                              "w-full " +
                              inputBaseClass +
                              " " +
                              (isEditingCircleCirc && circleCircError
                                ? inputErrorClass
                                : inputFocusClass)
                            }
                            type="text"
                            inputMode="decimal"
                            value={
                              isEditingCircleCirc
                                ? circleCircDraft
                                : circleCircValue
                            }
                            onFocus={() => {
                              if (!selectedFigureId) return;
                              setCircleCircDraft(circleCircValue);
                              setCircleCircError(null);
                              setCircleCircEditingForId(selectedFigureId);
                            }}
                            onChange={(e) => {
                              setCircleCircDraft(e.target.value);
                              setCircleCircError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                bumpCircleCirc(1);
                                return;
                              }
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                bumpCircleCirc(-1);
                                return;
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setCircleCircEditingForId(null);
                                setCircleCircDraft(circleCircValue);
                                setCircleCircError(null);
                              }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                applyCircleCircDraft(circleCircDraft);
                                setCircleCircEditingForId(null);
                              }
                            }}
                            onWheel={(e) => {
                              if (document.activeElement !== e.currentTarget)
                                return;
                              e.preventDefault();
                              e.stopPropagation();
                              bumpCircleCirc(e.deltaY < 0 ? 1 : -1);
                            }}
                            onBlur={() => {
                              applyCircleCircDraft(circleCircDraft);
                              setCircleCircEditingForId(null);
                            }}
                          />
                          {isEditingCircleCirc && circleCircError ? (
                            <p className="text-xs text-red-600 dark:text-red-500">
                              {circleCircError}
                            </p>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Raio X
                          </span>
                          <input
                            data-testid="circle-rx"
                            className={
                              "w-full " +
                              inputBaseClass +
                              " " +
                              (isEditingCircleRx && circleRxError
                                ? inputErrorClass
                                : inputFocusClass)
                            }
                            type="text"
                            inputMode="decimal"
                            value={
                              isEditingCircleRx ? circleRxDraft : circleRxValue
                            }
                            onFocus={() => {
                              if (!selectedFigureId) return;
                              setCircleRxDraft(circleRxValue);
                              setCircleRxError(null);
                              setCircleRxEditingForId(selectedFigureId);
                            }}
                            onChange={(e) => {
                              setCircleRxDraft(e.target.value);
                              setCircleRxError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                bumpCircleRx(1);
                                return;
                              }
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                bumpCircleRx(-1);
                                return;
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setCircleRxEditingForId(null);
                                setCircleRxDraft(circleRxValue);
                                setCircleRxError(null);
                              }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                applyCircleRxDraft(circleRxDraft);
                                setCircleRxEditingForId(null);
                              }
                            }}
                            onWheel={(e) => {
                              if (document.activeElement !== e.currentTarget)
                                return;
                              e.preventDefault();
                              e.stopPropagation();
                              bumpCircleRx(e.deltaY < 0 ? 1 : -1);
                            }}
                            onBlur={() => {
                              applyCircleRxDraft(circleRxDraft);
                              setCircleRxEditingForId(null);
                            }}
                          />
                          {isEditingCircleRx && circleRxError ? (
                            <p className="text-xs text-red-600 dark:text-red-500">
                              {circleRxError}
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Raio Y
                          </span>
                          <input
                            data-testid="circle-ry"
                            className={
                              "w-full " +
                              inputBaseClass +
                              " " +
                              (isEditingCircleRy && circleRyError
                                ? inputErrorClass
                                : inputFocusClass)
                            }
                            type="text"
                            inputMode="decimal"
                            value={
                              isEditingCircleRy ? circleRyDraft : circleRyValue
                            }
                            onFocus={() => {
                              if (!selectedFigureId) return;
                              setCircleRyDraft(circleRyValue);
                              setCircleRyError(null);
                              setCircleRyEditingForId(selectedFigureId);
                            }}
                            onChange={(e) => {
                              setCircleRyDraft(e.target.value);
                              setCircleRyError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                bumpCircleRy(1);
                                return;
                              }
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                bumpCircleRy(-1);
                                return;
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setCircleRyEditingForId(null);
                                setCircleRyDraft(circleRyValue);
                                setCircleRyError(null);
                              }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                applyCircleRyDraft(circleRyDraft);
                                setCircleRyEditingForId(null);
                              }
                            }}
                            onWheel={(e) => {
                              if (document.activeElement !== e.currentTarget)
                                return;
                              e.preventDefault();
                              e.stopPropagation();
                              bumpCircleRy(e.deltaY < 0 ? 1 : -1);
                            }}
                            onBlur={() => {
                              applyCircleRyDraft(circleRyDraft);
                              setCircleRyEditingForId(null);
                            }}
                          />
                          {isEditingCircleRy && circleRyError ? (
                            <p className="text-xs text-red-600 dark:text-red-500">
                              {circleRyError}
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-1 col-span-2">
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Circunferência (aprox.)
                          </span>
                          <input
                            data-testid="circle-circumference"
                            className={
                              "w-full " +
                              inputBaseClass +
                              " " +
                              (isEditingCircleCirc && circleCircError
                                ? inputErrorClass
                                : inputFocusClass)
                            }
                            type="text"
                            inputMode="decimal"
                            value={
                              isEditingCircleCirc
                                ? circleCircDraft
                                : circleCircValue
                            }
                            onFocus={() => {
                              if (!selectedFigureId) return;
                              setCircleCircDraft(circleCircValue);
                              setCircleCircError(null);
                              setCircleCircEditingForId(selectedFigureId);
                            }}
                            onChange={(e) => {
                              setCircleCircDraft(e.target.value);
                              setCircleCircError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                bumpCircleCirc(1);
                                return;
                              }
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                bumpCircleCirc(-1);
                                return;
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setCircleCircEditingForId(null);
                                setCircleCircDraft(circleCircValue);
                                setCircleCircError(null);
                              }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                applyCircleCircDraft(circleCircDraft);
                                setCircleCircEditingForId(null);
                              }
                            }}
                            onWheel={(e) => {
                              if (document.activeElement !== e.currentTarget)
                                return;
                              e.preventDefault();
                              e.stopPropagation();
                              bumpCircleCirc(e.deltaY < 0 ? 1 : -1);
                            }}
                            onBlur={() => {
                              applyCircleCircDraft(circleCircDraft);
                              setCircleCircEditingForId(null);
                            }}
                          />
                          {isEditingCircleCirc && circleCircError ? (
                            <p className="text-xs text-red-600 dark:text-red-500">
                              {circleCircError}
                            </p>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedCircleIsPerfect
                      ? "Editar a circunferência ajusta o raio."
                      : "Editar a circunferência escala a elipse mantendo a proporção (Rx/Ry)."}
                  </p>

                  <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
                </div>
              ) : null}

              {selectedFigure?.tool === "text" &&
              selectedFigure.kind !== "seam" &&
              selectedFigureIds.length === 1 ? (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Texto
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {isMac ? "⌘⏎ no canvas" : "Ctrl+Enter no canvas"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Conteúdo
                    </span>
                    <textarea
                      data-testid="text-content"
                      className={
                        "w-full " +
                        inputBaseClass +
                        " " +
                        inputFocusClass +
                        " !text-left resize-y min-h-[72px]"
                      }
                      value={textValueDraft}
                      placeholder="Digite o texto…"
                      onFocus={() => setIsEditingTextValue(true)}
                      onChange={(e) => setTextValueDraft(e.target.value)}
                      onBlur={() => {
                        setIsEditingTextValue(false);
                        applyTextValueDraft(textValueDraft);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setIsEditingTextValue(false);
                          setTextValueDraft(
                            (selectedFigure.textValue ?? "") as string
                          );
                          (e.currentTarget as HTMLTextAreaElement).blur();
                        }
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Fonte
                      </span>
                      <select
                        data-testid="text-font-family"
                        className={
                          "w-full " +
                          inputBaseClass +
                          " " +
                          inputFocusClass +
                          " !text-left"
                        }
                        value={
                          selectedFigure.textFontFamily ??
                          "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setFigures((prev) =>
                            prev.map((f) =>
                              f.id === selectedFigure.id &&
                              f.kind !== "seam" &&
                              f.tool === "text"
                                ? { ...f, textFontFamily: v }
                                : f
                            )
                          );
                        }}
                      >
                        <option value="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif">
                          Inter / System
                        </option>
                        <option value="Arial, Helvetica, sans-serif">
                          Arial
                        </option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="Times New Roman, Times, serif">
                          Times
                        </option>
                        <option value="Courier New, Courier, monospace">
                          Courier
                        </option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Cor
                      </span>
                      <input
                        data-testid="text-fill"
                        className={
                          "w-full " + inputBaseClass + " " + inputFocusClass
                        }
                        type="color"
                        value={(() => {
                          const rawFill = selectedFigure.textFill;
                          if (typeof rawFill === "string") {
                            const s = rawFill.trim().toLowerCase();
                            if (/^#[0-9a-f]{6}$/.test(s)) return s;
                            if (
                              s === "aci7" ||
                              s === "#000" ||
                              s === "#000000"
                            ) {
                              return resolveAci7();
                            }
                          }

                          const rawStroke = selectedFigure.stroke;
                          if (typeof rawStroke !== "string")
                            return resolveAci7();
                          const s = rawStroke.trim().toLowerCase();
                          if (!s) return resolveAci7();
                          if (s === "aci7" || s === "#000" || s === "#000000") {
                            return resolveAci7();
                          }
                          if (/^#[0-9a-f]{6}$/.test(s)) return s;

                          return resolveAci7();
                        })()}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFigures((prev) =>
                            prev.map((f) =>
                              f.id === selectedFigure.id &&
                              f.kind !== "seam" &&
                              f.tool === "text"
                                ? { ...f, textFill: v }
                                : f
                            )
                          );
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Tamanho
                      </span>
                      <select
                        data-testid="text-font-size"
                        className={
                          "w-full " +
                          inputBaseClass +
                          " " +
                          inputFocusClass +
                          " !text-left"
                        }
                        value={String(
                          Math.round(selectedFigure.textFontSizePx ?? 18)
                        )}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          const safe = Number.isFinite(v)
                            ? Math.max(6, Math.min(300, v))
                            : 18;
                          setFigures((prev) =>
                            prev.map((f) =>
                              f.id === selectedFigure.id &&
                              f.kind !== "seam" &&
                              f.tool === "text"
                                ? { ...f, textFontSizePx: safe }
                                : f
                            )
                          );
                        }}
                      >
                        {(() => {
                          const v = Math.round(
                            selectedFigure.textFontSizePx ?? 18
                          );
                          const allowed = new Set([
                            10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80,
                            96,
                          ]);
                          if (allowed.has(v)) return null;
                          return <option value={String(v)}>{v} px</option>;
                        })()}
                        <option value="10">10 px</option>
                        <option value="12">12 px</option>
                        <option value="14">14 px</option>
                        <option value="16">16 px</option>
                        <option value="18">18 px</option>
                        <option value="20">20 px</option>
                        <option value="24">24 px</option>
                        <option value="28">28 px</option>
                        <option value="32">32 px</option>
                        <option value="40">40 px</option>
                        <option value="48">48 px</option>
                        <option value="64">64 px</option>
                        <option value="80">80 px</option>
                        <option value="96">96 px</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Alinhamento
                      </span>
                      <select
                        data-testid="text-align"
                        className={
                          "w-full " +
                          inputBaseClass +
                          " " +
                          inputFocusClass +
                          " !text-left"
                        }
                        value={selectedFigure.textAlign ?? "left"}
                        onChange={(e) => {
                          const v = e.target.value as
                            | "left"
                            | "center"
                            | "right";
                          setFigures((prev) =>
                            prev.map((f) =>
                              f.id === selectedFigure.id &&
                              f.kind !== "seam" &&
                              f.tool === "text"
                                ? { ...f, textAlign: v }
                                : f
                            )
                          );
                        }}
                      >
                        <option value="left">Esquerda</option>
                        <option value="center">Centro</option>
                        <option value="right">Direita</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Quebra
                      </span>
                      <select
                        data-testid="text-wrap"
                        className={
                          "w-full " +
                          inputBaseClass +
                          " " +
                          inputFocusClass +
                          " !text-left"
                        }
                        value={selectedFigure.textWrap ?? "word"}
                        onChange={(e) => {
                          const v = e.target.value as "word" | "char" | "none";
                          setFigures((prev) =>
                            prev.map((f) =>
                              f.id === selectedFigure.id &&
                              f.kind !== "seam" &&
                              f.tool === "text"
                                ? { ...f, textWrap: v }
                                : f
                            )
                          );
                        }}
                      >
                        <option value="word">Palavra</option>
                        <option value="char">Caractere</option>
                        <option value="none">Sem quebra</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Largura (px)
                      </span>
                      <input
                        data-testid="text-width"
                        className={
                          "w-full " +
                          inputBaseClass +
                          " " +
                          inputFocusClass +
                          " !text-left"
                        }
                        type="text"
                        inputMode="decimal"
                        placeholder="auto"
                        value={textWidthDraft}
                        onFocus={() => setIsEditingTextWidth(true)}
                        onChange={(e) => setTextWidthDraft(e.target.value)}
                        onBlur={() => {
                          setIsEditingTextWidth(false);
                          applyTextWidthDraft(textWidthDraft);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setIsEditingTextWidth(false);
                            const w = selectedFigure.textWidthPx;
                            setTextWidthDraft(
                              Number.isFinite(w ?? NaN) && (w ?? 0) > 0
                                ? formatPtBrDecimalFixed(w as number, 0)
                                : ""
                            );
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Line-height
                      </span>
                      <input
                        data-testid="text-line-height"
                        className={
                          "w-full " +
                          inputBaseClass +
                          " " +
                          inputFocusClass +
                          " !text-left"
                        }
                        type="text"
                        inputMode="decimal"
                        value={textLineHeightDraft}
                        onFocus={() => setIsEditingTextLineHeight(true)}
                        onChange={(e) => setTextLineHeightDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            e.preventDefault();
                            const dir: 1 | -1 = e.key === "ArrowUp" ? 1 : -1;
                            const fallback =
                              selectedFigure.textLineHeight ?? 1.25;
                            const next = bumpNumericValue({
                              raw: textLineHeightDraft,
                              fallback,
                              direction: dir,
                              step: 0.05,
                              min: 0.8,
                              max: 3,
                            });
                            const nextStr = formatPtBrDecimalFixed(next, 2);
                            setTextLineHeightDraft(nextStr);
                            applyTextLineHeightDraft(nextStr);
                            return;
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setIsEditingTextLineHeight(false);
                            const v = selectedFigure.textLineHeight ?? 1.25;
                            setTextLineHeightDraft(
                              formatPtBrDecimalFixed(v, 2)
                            );
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        onWheel={(e) => {
                          if (document.activeElement !== e.currentTarget)
                            return;
                          e.preventDefault();
                          e.stopPropagation();
                          const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;
                          const fallback =
                            selectedFigure.textLineHeight ?? 1.25;
                          const next = bumpNumericValue({
                            raw: textLineHeightDraft,
                            fallback,
                            direction: dir,
                            step: 0.05,
                            min: 0.8,
                            max: 3,
                          });
                          const nextStr = formatPtBrDecimalFixed(next, 2);
                          setTextLineHeightDraft(nextStr);
                          applyTextLineHeightDraft(nextStr);
                        }}
                        onBlur={() => {
                          setIsEditingTextLineHeight(false);
                          applyTextLineHeightDraft(textLineHeightDraft);
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Espaçamento
                      </span>
                      <input
                        data-testid="text-letter-spacing"
                        className={
                          "w-full " +
                          inputBaseClass +
                          " " +
                          inputFocusClass +
                          " !text-left"
                        }
                        type="text"
                        inputMode="decimal"
                        value={textLetterSpacingDraft}
                        onFocus={() => setIsEditingTextLetterSpacing(true)}
                        onChange={(e) =>
                          setTextLetterSpacingDraft(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            e.preventDefault();
                            const dir: 1 | -1 = e.key === "ArrowUp" ? 1 : -1;
                            const fallback =
                              selectedFigure.textLetterSpacing ?? 0;
                            const next = bumpNumericValue({
                              raw: textLetterSpacingDraft,
                              fallback,
                              direction: dir,
                              step: 0.5,
                              min: -2,
                              max: 20,
                            });
                            const nextStr = formatPtBrDecimalFixed(next, 1);
                            setTextLetterSpacingDraft(nextStr);
                            applyTextLetterSpacingDraft(nextStr);
                            return;
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setIsEditingTextLetterSpacing(false);
                            const v = selectedFigure.textLetterSpacing ?? 0;
                            setTextLetterSpacingDraft(
                              formatPtBrDecimalFixed(v, 1)
                            );
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        onWheel={(e) => {
                          if (document.activeElement !== e.currentTarget)
                            return;
                          e.preventDefault();
                          e.stopPropagation();
                          const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;
                          const fallback =
                            selectedFigure.textLetterSpacing ?? 0;
                          const next = bumpNumericValue({
                            raw: textLetterSpacingDraft,
                            fallback,
                            direction: dir,
                            step: 0.5,
                            min: -2,
                            max: 20,
                          });
                          const nextStr = formatPtBrDecimalFixed(next, 1);
                          setTextLetterSpacingDraft(nextStr);
                          applyTextLetterSpacingDraft(nextStr);
                        }}
                        onBlur={() => {
                          setIsEditingTextLetterSpacing(false);
                          applyTextLetterSpacingDraft(textLetterSpacingDraft);
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Padding
                      </span>
                      <input
                        data-testid="text-padding"
                        className={
                          "w-full " +
                          inputBaseClass +
                          " " +
                          inputFocusClass +
                          " !text-left"
                        }
                        type="text"
                        inputMode="decimal"
                        value={textPaddingDraft}
                        onFocus={() => setIsEditingTextPadding(true)}
                        onChange={(e) => setTextPaddingDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            e.preventDefault();
                            const dir: 1 | -1 = e.key === "ArrowUp" ? 1 : -1;
                            const fallback = selectedFigure.textPaddingPx ?? 0;
                            const next = bumpNumericValue({
                              raw: textPaddingDraft,
                              fallback,
                              direction: dir,
                              step: 1,
                              min: 0,
                              max: 50,
                            });
                            const nextStr = formatPtBrDecimalFixed(next, 0);
                            setTextPaddingDraft(nextStr);
                            applyTextPaddingDraft(nextStr);
                            return;
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setIsEditingTextPadding(false);
                            const v = selectedFigure.textPaddingPx ?? 0;
                            setTextPaddingDraft(formatPtBrDecimalFixed(v, 0));
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        onWheel={(e) => {
                          if (document.activeElement !== e.currentTarget)
                            return;
                          e.preventDefault();
                          e.stopPropagation();
                          const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;
                          const fallback = selectedFigure.textPaddingPx ?? 0;
                          const next = bumpNumericValue({
                            raw: textPaddingDraft,
                            fallback,
                            direction: dir,
                            step: 1,
                            min: 0,
                            max: 50,
                          });
                          const nextStr = formatPtBrDecimalFixed(next, 0);
                          setTextPaddingDraft(nextStr);
                          applyTextPaddingDraft(nextStr);
                        }}
                        onBlur={() => {
                          setIsEditingTextPadding(false);
                          applyTextPaddingDraft(textPaddingDraft);
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                      <input
                        data-testid="text-bg-enabled"
                        type="checkbox"
                        checked={selectedFigure.textBackgroundEnabled === true}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          setFigures((prev) =>
                            prev.map((f) =>
                              f.id === selectedFigure.id &&
                              f.kind !== "seam" &&
                              f.tool === "text"
                                ? { ...f, textBackgroundEnabled: enabled }
                                : f
                            )
                          );
                        }}
                      />
                      Fundo
                    </label>

                    {selectedFigure.textBackgroundEnabled === true ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                            Cor do fundo
                          </span>
                          <input
                            data-testid="text-bg-fill"
                            className={
                              "w-full " + inputBaseClass + " " + inputFocusClass
                            }
                            type="color"
                            value={(() => {
                              const raw =
                                selectedFigure.textBackgroundFill ?? "#ffffff";
                              return /^#[0-9a-fA-F]{6}$/.test(raw)
                                ? raw
                                : "#ffffff";
                            })()}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFigures((prev) =>
                                prev.map((f) =>
                                  f.id === selectedFigure.id &&
                                  f.kind !== "seam" &&
                                  f.tool === "text"
                                    ? { ...f, textBackgroundFill: v }
                                    : f
                                )
                              );
                            }}
                          />
                        </div>

                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                            Opacidade
                          </span>
                          <input
                            data-testid="text-bg-opacity"
                            className={
                              "w-full " +
                              inputBaseClass +
                              " " +
                              inputFocusClass +
                              " !text-left"
                            }
                            type="text"
                            inputMode="decimal"
                            value={textBgOpacityDraft}
                            onFocus={() => setIsEditingTextBgOpacity(true)}
                            onChange={(e) =>
                              setTextBgOpacityDraft(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (
                                e.key === "ArrowUp" ||
                                e.key === "ArrowDown"
                              ) {
                                e.preventDefault();
                                const dir: 1 | -1 =
                                  e.key === "ArrowUp" ? 1 : -1;
                                const fallback =
                                  selectedFigure.textBackgroundOpacity ?? 1;
                                const next = bumpNumericValue({
                                  raw: textBgOpacityDraft,
                                  fallback,
                                  direction: dir,
                                  step: 0.05,
                                  min: 0,
                                  max: 1,
                                });
                                const nextStr = formatPtBrDecimalFixed(next, 2);
                                setTextBgOpacityDraft(nextStr);
                                applyTextBgOpacityDraft(nextStr);
                                return;
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setIsEditingTextBgOpacity(false);
                                const v =
                                  selectedFigure.textBackgroundOpacity ?? 1;
                                setTextBgOpacityDraft(
                                  formatPtBrDecimalFixed(v, 2)
                                );
                                (e.currentTarget as HTMLInputElement).blur();
                              }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                (e.currentTarget as HTMLInputElement).blur();
                              }
                            }}
                            onWheel={(e) => {
                              if (document.activeElement !== e.currentTarget)
                                return;
                              e.preventDefault();
                              e.stopPropagation();
                              const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;
                              const fallback =
                                selectedFigure.textBackgroundOpacity ?? 1;
                              const next = bumpNumericValue({
                                raw: textBgOpacityDraft,
                                fallback,
                                direction: dir,
                                step: 0.05,
                                min: 0,
                                max: 1,
                              });
                              const nextStr = formatPtBrDecimalFixed(next, 2);
                              setTextBgOpacityDraft(nextStr);
                              applyTextBgOpacityDraft(nextStr);
                            }}
                            onBlur={() => {
                              setIsEditingTextBgOpacity(false);
                              applyTextBgOpacityDraft(textBgOpacityDraft);
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
                </div>
              ) : null}

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
