import type { Figure, FigureEdge } from "./types";

export const AUTO_STROKE = "aci7";
export const DEFAULT_ACTIVE_STROKE_COLOR = AUTO_STROKE;
export const RECENT_STROKE_COLORS_LIMIT = 10;

export type RgbColor = { r: number; g: number; b: number };
export type HsvColor = { h: number; s: number; v: number };

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toHexByte(value: number): string {
  return Math.round(clampNumber(value, 0, 255))
    .toString(16)
    .padStart(2, "0");
}

export function normalizeHexColor(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw
      .split("")
      .map((ch) => `${ch}${ch}`)
      .join("")}`;
  }
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

export function normalizeStrokeColor(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (raw === AUTO_STROKE) return AUTO_STROKE;
  return normalizeHexColor(raw);
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

export function hexToRgb(hex: string): RgbColor | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const rn = clampNumber(r, 0, 255) / 255;
  const gn = clampNumber(g, 0, 255) / 255;
  const bn = clampNumber(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;

  return {
    h: Math.round(h),
    s: max === 0 ? 0 : Math.round((delta / max) * 100),
    v: Math.round(max * 100),
  };
}

export function hsvToRgb(h: number, s: number, v: number): RgbColor {
  const hn = (((clampNumber(h, 0, 360) % 360) + 360) % 360) / 60;
  const sn = clampNumber(s, 0, 100) / 100;
  const vn = clampNumber(v, 0, 100) / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs((hn % 2) - 1));
  const m = vn - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hn >= 0 && hn < 1) {
    rp = c;
    gp = x;
  } else if (hn >= 1 && hn < 2) {
    rp = x;
    gp = c;
  } else if (hn >= 2 && hn < 3) {
    gp = c;
    bp = x;
  } else if (hn >= 3 && hn < 4) {
    gp = x;
    bp = c;
  } else if (hn >= 4 && hn < 5) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

export function isAutoStrokeColor(color: string | undefined): boolean {
  return (color ?? "").trim().toLowerCase() === AUTO_STROKE;
}

export function resolveAci7(isDark: boolean): string {
  return isDark ? "#ffffff" : "#000000";
}

export function resolveStrokeColor(
  stroke: string | undefined,
  isDark: boolean,
  mode?: "auto" | "solid"
): string {
  if (!stroke) return resolveAci7(isDark);
  const s = stroke.trim().toLowerCase();
  if (s === AUTO_STROKE) return resolveAci7(isDark);
  const normalized = normalizeHexColor(s);
  if (normalized) {
    if (mode === "solid") return normalized;
    if (s === "#000" || s === "#000000") return resolveAci7(isDark);
    return normalized;
  }
  return stroke;
}

export function resolveFigureStrokeColor(
  figure: Pick<Figure, "stroke" | "strokeMode">,
  isDark: boolean
): string {
  return resolveStrokeColor(figure.stroke, isDark, figure.strokeMode);
}

export function resolveEdgeStrokeColor(
  figure: Pick<Figure, "stroke" | "strokeMode">,
  edge: Pick<FigureEdge, "stroke">,
  isDark: boolean
): string {
  if (edge.stroke) return resolveStrokeColor(edge.stroke, isDark, "solid");
  return resolveFigureStrokeColor(figure, isDark);
}

export function isProtectedStrokeFigure(figure: Figure): boolean {
  return (
    figure.kind === "seam" &&
    (figure.derivedRole === "hem" || figure.derivedRole === "seamAllowance")
  );
}

export function applyStrokeColorToRecent(
  recent: string[],
  color: string
): string[] {
  const normalized = normalizeHexColor(color);
  if (!normalized) return recent.slice(0, RECENT_STROKE_COLORS_LIMIT);
  const next = [
    normalized,
    ...recent
      .map((item) => normalizeHexColor(item))
      .filter((item): item is string => Boolean(item))
      .filter((item) => item !== normalized),
  ];
  return next.slice(0, RECENT_STROKE_COLORS_LIMIT);
}

export function strokeColorToSolidHex(color: string, isDark = false): string {
  const normalized = normalizeStrokeColor(color);
  if (!normalized || normalized === AUTO_STROKE) return resolveAci7(isDark);
  return normalized;
}
