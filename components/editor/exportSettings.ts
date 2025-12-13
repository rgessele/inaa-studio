export type PaperSize = "A4";
export type PaperOrientation = "portrait" | "landscape";

export interface ExportSettings {
  paperSize: PaperSize;
  orientation: PaperOrientation;
  marginCm: number;
  includeBlankPages: boolean;
  dashedLines: boolean;
  showBaseSize: boolean;
  toolFilter: Record<"rectangle" | "circle" | "line" | "curve", boolean>;
}

// A4 dimensions in cm
export const A4_WIDTH_CM = 21.0;
export const A4_HEIGHT_CM = 29.7;

export function createDefaultExportSettings(): ExportSettings {
  return {
    paperSize: "A4",
    orientation: "portrait",
    marginCm: 1,
    includeBlankPages: false,
    dashedLines: false,
    showBaseSize: false,
    toolFilter: {
      rectangle: true,
      circle: true,
      line: true,
      curve: true,
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
  const base =
    paperSize === "A4"
      ? { widthCm: A4_WIDTH_CM, heightCm: A4_HEIGHT_CM }
      : { widthCm: A4_WIDTH_CM, heightCm: A4_HEIGHT_CM };

  if (orientation === "landscape") {
    return { widthCm: base.heightCm, heightCm: base.widthCm };
  }

  return base;
}
