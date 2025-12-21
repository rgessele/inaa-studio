import type { Figure, PointLabelsMode } from "./types";

export function cyclePointLabelsMode(mode: PointLabelsMode): PointLabelsMode {
  switch (mode) {
    case "off":
      return "numGlobal";
    case "numGlobal":
      return "numPerFigure";
    case "numPerFigure":
      return "alphaGlobal";
    case "alphaGlobal":
      return "alphaPerFigure";
    case "alphaPerFigure":
    default:
      return "off";
  }
}

export function indexToAlphaLabel(index1Based: number): string {
  const safe = Math.floor(index1Based);
  if (safe <= 0) return "A";

  // Excel-like: 1 -> A, 26 -> Z, 27 -> AA...
  let n = safe;
  let out = "";
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

export type NodeLabelsByFigure = Map<string, Record<string, string>>;

export function computeNodeLabels(
  figures: Figure[],
  mode: PointLabelsMode
): NodeLabelsByFigure {
  const out: NodeLabelsByFigure = new Map();
  if (mode === "off") return out;

  let globalIndex = 1;

  for (const fig of figures) {
    let perFigureIndex = 1;
    const labelsForFigure: Record<string, string> = {};

    for (const node of fig.nodes) {
      const idx =
        mode === "numGlobal" || mode === "alphaGlobal"
          ? globalIndex++
          : perFigureIndex++;

      const label =
        mode === "numGlobal" || mode === "numPerFigure"
          ? String(idx)
          : indexToAlphaLabel(idx);

      labelsForFigure[node.id] = label;
    }

    out.set(fig.id, labelsForFigure);
  }

  return out;
}
