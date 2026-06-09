"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AUTO_STROKE,
  hexToRgb,
  hsvToRgb,
  isAutoStrokeColor,
  normalizeHexColor,
  rgbToHex,
  rgbToHsv,
  strokeColorToSolidHex,
  type HsvColor,
} from "./strokeColor";

const PRESET_COLORS = [
  AUTO_STROKE,
  "#000000",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#6b7280",
];

interface StrokeColorPickerProps {
  value: string;
  recentColors: string[];
  isDark?: boolean;
  hasProtectedOnlySelection?: boolean;
  onCommit: (color: string) => void;
  onCancel?: () => void;
  onClose?: () => void;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function hsvToHex(hsv: HsvColor): string {
  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function parseNumberInput(value: string, fallback: number): number {
  if (!value.trim()) return fallback;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  testId: string;
  className: string;
  onCommitValue: (value: number) => void;
}

function NumberField({
  label,
  value,
  min,
  max,
  testId,
  className,
  onCommitValue,
}: NumberFieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <input
        data-testid={testId}
        className={className}
        type="number"
        min={min}
        max={max}
        value={Math.round(value)}
        onChange={(event) => {
          const next = parseNumberInput(event.target.value, value);
          onCommitValue(clamp(next, min, max));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommitValue(clamp(value, min, max));
          }
        }}
      />
    </label>
  );
}

export function StrokeColorPicker({
  value,
  recentColors,
  isDark = false,
  hasProtectedOnlySelection = false,
  onCommit,
  onCancel,
  onClose,
}: StrokeColorPickerProps) {
  const svAreaRef = useRef<HTMLDivElement | null>(null);
  const hueSliderRef = useRef<HTMLDivElement | null>(null);
  const committedHex = useMemo(
    () => strokeColorToSolidHex(value, isDark),
    [isDark, value]
  );
  const committedRgb = useMemo(
    () => hexToRgb(committedHex) ?? { r: 0, g: 0, b: 0 },
    [committedHex]
  );
  const committedHsv = useMemo(
    () => rgbToHsv(committedRgb.r, committedRgb.g, committedRgb.b),
    [committedRgb.b, committedRgb.g, committedRgb.r]
  );
  const [hsv, setHsv] = useState<HsvColor>(committedHsv);
  const hsvRef = useRef<HsvColor>(committedHsv);
  const [hexDraft, setHexDraft] = useState(committedHex);
  const [hexError, setHexError] = useState(false);

  const currentHex = useMemo(() => hsvToHex(hsv), [hsv]);
  const currentRgb = useMemo(
    () => hexToRgb(currentHex) ?? { r: 0, g: 0, b: 0 },
    [currentHex]
  );
  const hueColor = useMemo(
    () => hsvToHex({ h: hsv.h, s: 100, v: 100 }),
    [hsv.h]
  );

  const setHsvAndHex = useCallback((next: HsvColor) => {
    const safe = {
      h: Math.round(clamp(next.h, 0, 360)),
      s: Math.round(clamp(next.s, 0, 100)),
      v: Math.round(clamp(next.v, 0, 100)),
    };
    hsvRef.current = safe;
    setHsv(safe);
    setHexDraft(hsvToHex(safe));
    setHexError(false);
  }, []);

  const commitHex = useCallback(
    (hex: string) => {
      const normalized = normalizeHexColor(hex);
      if (!normalized) {
        setHexError(true);
        return;
      }
      const rgb = hexToRgb(normalized);
      if (!rgb) {
        setHexError(true);
        return;
      }
      const nextHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      hsvRef.current = nextHsv;
      setHsv(nextHsv);
      setHexDraft(normalized);
      setHexError(false);
      onCommit(normalized);
    },
    [onCommit]
  );

  const commitPreset = useCallback(
    (color: string) => {
      if (isAutoStrokeColor(color)) {
        const rgb = hexToRgb(strokeColorToSolidHex(AUTO_STROKE, isDark));
        if (rgb) {
          const nextHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          hsvRef.current = nextHsv;
          setHsv(nextHsv);
          setHexDraft(strokeColorToSolidHex(AUTO_STROKE, isDark));
          setHexError(false);
        }
        onCommit(AUTO_STROKE);
        return;
      }
      commitHex(color);
    },
    [commitHex, isDark, onCommit]
  );

  const commitCurrent = useCallback(() => {
    const hex = hsvToHex(hsvRef.current);
    setHexDraft(hex);
    setHexError(false);
    onCommit(hex);
  }, [onCommit]);

  // "Aplicar" confirms the current color and dismisses the picker, so the
  // popover closing is the visible "done" feedback (even when the color was
  // already committed live via a preset/recent swatch).
  const applyAndClose = useCallback(() => {
    commitCurrent();
    onClose?.();
  }, [commitCurrent, onClose]);

  const updateFromSvPointer = useCallback(
    (event: PointerEvent | React.PointerEvent) => {
      const rect = svAreaRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      setHsvAndHex({ h: hsvRef.current.h, s: x * 100, v: (1 - y) * 100 });
    },
    [setHsvAndHex]
  );

  const updateFromHuePointer = useCallback(
    (event: PointerEvent | React.PointerEvent) => {
      const rect = hueSliderRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      setHsvAndHex({ ...hsvRef.current, h: x * 360 });
    },
    [setHsvAndHex]
  );

  const startSvDrag = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      updateFromSvPointer(event);
      const onMove = (moveEvent: PointerEvent) =>
        updateFromSvPointer(moveEvent);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        commitCurrent();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [commitCurrent, updateFromSvPointer]
  );

  const startHueDrag = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      updateFromHuePointer(event);
      const onMove = (moveEvent: PointerEvent) =>
        updateFromHuePointer(moveEvent);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        commitCurrent();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [commitCurrent, updateFromHuePointer]
  );

  const commitRgb = useCallback(
    (next: Partial<typeof currentRgb>) => {
      const rgb = {
        r: clamp(next.r ?? currentRgb.r, 0, 255),
        g: clamp(next.g ?? currentRgb.g, 0, 255),
        b: clamp(next.b ?? currentRgb.b, 0, 255),
      };
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      const nextHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      hsvRef.current = nextHsv;
      setHsv(nextHsv);
      setHexDraft(hex);
      setHexError(false);
      onCommit(hex);
    },
    [currentRgb.b, currentRgb.g, currentRgb.r, onCommit]
  );

  const commitHsv = useCallback(
    (next: Partial<HsvColor>) => {
      const safe = {
        h: clamp(next.h ?? hsv.h, 0, 360),
        s: clamp(next.s ?? hsv.s, 0, 100),
        v: clamp(next.v ?? hsv.v, 0, 100),
      };
      setHsvAndHex(safe);
      onCommit(hsvToHex(safe));
    },
    [hsv.h, hsv.s, hsv.v, onCommit, setHsvAndHex]
  );

  const numberInputClass =
    "h-8 w-full rounded border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";

  return (
    <div
      data-testid="stroke-color-popover"
      className="w-[320px] rounded-lg border border-gray-200 bg-white p-3 text-gray-900 shadow-xl dark:border-gray-700 dark:bg-surface-dark dark:text-gray-100"
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex items-center gap-1">
          <div
            data-testid="stroke-color-previous-swatch"
            className="h-8 w-8 rounded border border-gray-300 dark:border-gray-600"
            style={{ backgroundColor: committedHex }}
            title="Cor anterior"
          />
          <div
            data-testid="stroke-color-current-swatch"
            className="h-8 w-8 rounded border border-gray-300 dark:border-gray-600"
            style={{ backgroundColor: currentHex }}
            title="Cor atual"
          />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
            Cor da linha
          </p>
          <p className="font-mono text-xs">{currentHex.toUpperCase()}</p>
        </div>
      </div>

      {hasProtectedOnlySelection ? (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          A seleção atual usa cor técnica e não será alterada.
        </div>
      ) : null}

      <div
        ref={svAreaRef}
        data-testid="stroke-color-sv-area"
        className="relative h-40 w-full cursor-crosshair rounded-md border border-gray-300 dark:border-gray-600"
        style={{
          background: `linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, ${hueColor})`,
        }}
        onPointerDown={startSvDrag}
      >
        <div
          data-testid="stroke-color-sv-handle"
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.7)]"
          style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
        />
      </div>

      <div
        ref={hueSliderRef}
        data-testid="stroke-color-hue-slider"
        className="relative mt-3 h-4 w-full cursor-pointer rounded-full border border-gray-300 dark:border-gray-600"
        style={{
          background:
            "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
        }}
        onPointerDown={startHueDrag}
      >
        <div
          data-testid="stroke-color-hue-handle"
          className="pointer-events-none absolute top-1/2 h-5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white bg-gray-900 shadow"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <NumberField
          label="R"
          value={currentRgb.r}
          min={0}
          max={255}
          testId="stroke-color-r-input"
          className={numberInputClass}
          onCommitValue={(next) => commitRgb({ r: next })}
        />
        <NumberField
          label="G"
          value={currentRgb.g}
          min={0}
          max={255}
          testId="stroke-color-g-input"
          className={numberInputClass}
          onCommitValue={(next) => commitRgb({ g: next })}
        />
        <NumberField
          label="B"
          value={currentRgb.b}
          min={0}
          max={255}
          testId="stroke-color-b-input"
          className={numberInputClass}
          onCommitValue={(next) => commitRgb({ b: next })}
        />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <NumberField
          label="H"
          value={hsv.h}
          min={0}
          max={360}
          testId="stroke-color-h-input"
          className={numberInputClass}
          onCommitValue={(next) => commitHsv({ h: next })}
        />
        <NumberField
          label="S"
          value={hsv.s}
          min={0}
          max={100}
          testId="stroke-color-s-input"
          className={numberInputClass}
          onCommitValue={(next) => commitHsv({ s: next })}
        />
        <NumberField
          label="V"
          value={hsv.v}
          min={0}
          max={100}
          testId="stroke-color-v-input"
          className={numberInputClass}
          onCommitValue={(next) => commitHsv({ v: next })}
        />
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
          HEX
        </span>
        <input
          data-testid="stroke-color-hex-input"
          className={
            numberInputClass +
            (hexError
              ? " border-red-500 focus:border-red-500 focus:ring-red-500/15"
              : "")
          }
          value={hexDraft}
          onChange={(event) => {
            const next = event.target.value;
            setHexDraft(next);
            const normalized = normalizeHexColor(next);
            setHexError(Boolean(next.trim()) && !normalized);
            if (normalized) {
              const rgb = hexToRgb(normalized);
              if (rgb) {
                const nextHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                hsvRef.current = nextHsv;
                setHsv(nextHsv);
              }
            }
          }}
          onBlur={() => commitHex(hexDraft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitHex(hexDraft);
            }
          }}
        />
      </label>

      <div className="mt-3">
        <p className="mb-1 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
          Presets
        </p>
        <div className="flex flex-wrap gap-1">
          {PRESET_COLORS.map((color, index) => (
            <button
              key={color}
              type="button"
              data-testid={`stroke-color-preset-${index}`}
              className="relative h-5 w-5 overflow-hidden rounded border border-gray-300 dark:border-gray-600"
              style={{
                backgroundColor: isAutoStrokeColor(color)
                  ? strokeColorToSolidHex(AUTO_STROKE, isDark)
                  : color,
              }}
              title={isAutoStrokeColor(color) ? "Auto (cor original)" : color}
              onClick={() => commitPreset(color)}
            >
              {isAutoStrokeColor(color) ? (
                <span
                  className="absolute inset-0 flex items-center justify-center text-[9px] font-black leading-none"
                  style={{ color: isDark ? "#111827" : "#ffffff" }}
                >
                  A
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {recentColors.length ? (
        <div className="mt-3">
          <p className="mb-1 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
            Recentes
          </p>
          <div className="grid grid-cols-10 gap-1">
            {recentColors.map((color, index) => (
              <button
                key={`${color}:${index}`}
                type="button"
                data-testid={`stroke-color-recent-${index}`}
                className="h-5 rounded border border-gray-300 dark:border-gray-600"
                style={{ backgroundColor: color }}
                title={color}
                onClick={() => commitHex(color)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          data-testid="stroke-color-cancel"
          className="rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          type="button"
          data-testid="stroke-color-apply"
          className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary/90"
          onClick={applyAndClose}
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
