export function parsePtBrDecimal(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const v = Number(normalized);
  if (!Number.isFinite(v)) return null;
  return v;
}

export function formatPtBrDecimalFixed(value: number, decimals: number = 2): string {
  const safeDecimals = Math.max(0, Math.min(6, Math.floor(decimals)));
  if (!Number.isFinite(value)) return "";
  return value.toFixed(safeDecimals).replace(".", ",");
}

export function clampMin(value: number, min: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, value);
}

export function bumpNumericValue(opts: {
  raw: string;
  fallback: number;
  direction: 1 | -1;
  step: number;
  min: number;
}): number {
  const parsed = parsePtBrDecimal(opts.raw);
  const current = parsed ?? opts.fallback;
  const next = current + opts.direction * opts.step;
  return clampMin(next, opts.min);
}
