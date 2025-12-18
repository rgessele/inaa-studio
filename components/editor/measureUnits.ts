import { PX_PER_CM } from "./constants";

export function pxToCm(px: number): number {
  if (!Number.isFinite(px)) return 0;
  return px / PX_PER_CM;
}

export function cmToPx(cm: number): number {
  if (!Number.isFinite(cm)) return 0;
  return cm * PX_PER_CM;
}

export function formatCm(cm: number, decimals: number = 2): string {
  const safeDecimals = Math.max(0, Math.min(6, Math.floor(decimals)));
  const safe = Number.isFinite(cm) ? cm : 0;
  return `${safe.toFixed(safeDecimals)} cm`;
}
