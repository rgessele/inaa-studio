export type PaperSize =
  | "A5"
  | "A4"
  | "A3"
  | "A2"
  | "A1"
  | "A0"
  | "Letter"
  | "Legal"
  | "Tabloid";
export type PaperOrientation = "portrait" | "landscape";

export interface ExportSettings {
  paperSize: PaperSize;
  orientation: PaperOrientation;
  marginCm: number;
  includeBlankPages: boolean;
  dashedLines: boolean;
  toolFilter: Record<
    "rectangle" | "circle" | "line" | "curve" | "dart" | "text",
    boolean
  >;
}

export const PAPER_SIZE_LABELS: Record<PaperSize, string> = {
  A5: "A5",
  A4: "A4",
  A3: "A3",
  A2: "A2",
  A1: "A1",
  A0: "A0",
  Letter: "Carta (Letter)",
  Legal: "Ofício (Legal)",
  Tabloid: "Tabloide (11×17)",
};

export const PAPER_SIZES: PaperSize[] = [
  "A5",
  "A4",
  "A3",
  "A2",
  "A1",
  "A0",
  "Letter",
  "Legal",
  "Tabloid",
];

export function createDefaultExportSettings(): ExportSettings {
  return {
    paperSize: "A4",
    orientation: "portrait",
    marginCm: 1,
    includeBlankPages: false,
    dashedLines: false,
    toolFilter: {
      rectangle: true,
      circle: true,
      line: true,
      curve: true,
      dart: true,
      text: true,
    },
  };
}

export function resolveExportSettings(
  partial?: Partial<ExportSettings>
): ExportSettings {
  const defaults = createDefaultExportSettings();
  return {
    ...defaults,
    ...partial,
    toolFilter: {
      ...defaults.toolFilter,
      ...(partial?.toolFilter ?? {}),
    },
  };
}

export function getPaperDimensionsCm(
  paperSize: PaperSize,
  orientation: PaperOrientation
): { widthCm: number; heightCm: number } {
  const base = (() => {
    switch (paperSize) {
      case "A5":
        return { widthCm: 14.8, heightCm: 21.0 };
      case "A4":
        return { widthCm: 21.0, heightCm: 29.7 };
      case "A3":
        return { widthCm: 29.7, heightCm: 42.0 };
      case "A2":
        return { widthCm: 42.0, heightCm: 59.4 };
      case "A1":
        return { widthCm: 59.4, heightCm: 84.1 };
      case "A0":
        return { widthCm: 84.1, heightCm: 118.9 };
      case "Letter":
        return { widthCm: 21.59, heightCm: 27.94 };
      case "Legal":
        return { widthCm: 21.59, heightCm: 35.56 };
      case "Tabloid":
        return { widthCm: 27.94, heightCm: 43.18 };
      default:
        return { widthCm: 21.0, heightCm: 29.7 };
    }
  })();

  if (orientation === "landscape") {
    return { widthCm: base.heightCm, heightCm: base.widthCm };
  }

  return base;
}
