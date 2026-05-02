import { PX_PER_CM } from "./constants";
import {
  getPaperDimensionsCm,
  type PaperOrientation,
  type PaperSize,
} from "./exportSettings";
import { figureWorldBoundingBox } from "./figurePath";
import type { Figure } from "./types";

type BoundingBox = { x: number; y: number; width: number; height: number };

export type PrintPageLayoutSettings = {
  paperSize: PaperSize;
  orientation: PaperOrientation;
  marginCm: number;
  includeBlankPages?: boolean;
  paddingPx?: number;
};

export type PrintTile = {
  tileX: number;
  tileY: number;
  row: number;
  col: number;
};

function intersectsRect(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function calculateFiguresBoundingBox(figures: Figure[]): BoundingBox | null {
  let hasAny = false;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  for (const figure of figures) {
    const bounds =
      figureWorldBoundingBox(figure) ?? {
        x: figure.x,
        y: figure.y,
        width: 0,
        height: 0,
      };

    if (!hasAny) {
      hasAny = true;
      minX = bounds.x;
      minY = bounds.y;
      maxX = bounds.x + bounds.width;
      maxY = bounds.y + bounds.height;
      continue;
    }

    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }

  if (!hasAny) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getFigureBoundingBox(figure: Figure): BoundingBox {
  return (
    figureWorldBoundingBox(figure) ?? {
      x: figure.x,
      y: figure.y,
      width: 0,
      height: 0,
    }
  );
}

export function getUsedPrintTiles(
  figures: Figure[],
  settings: PrintPageLayoutSettings
): {
  tiles: PrintTile[];
  totalPages: number;
  safeWidthPx: number;
  safeHeightPx: number;
} {
  if (figures.length === 0) {
    return { tiles: [], totalPages: 0, safeWidthPx: 0, safeHeightPx: 0 };
  }

  const bbox = calculateFiguresBoundingBox(figures);
  if (!bbox) {
    return { tiles: [], totalPages: 0, safeWidthPx: 0, safeHeightPx: 0 };
  }

  const { widthCm: paperWidthCm, heightCm: paperHeightCm } =
    getPaperDimensionsCm(settings.paperSize, settings.orientation);
  const marginCm = Number.isFinite(settings.marginCm)
    ? Math.max(0, Math.min(settings.marginCm, 10))
    : 0;
  const safeWidthCm = paperWidthCm - 2 * marginCm;
  const safeHeightCm = paperHeightCm - 2 * marginCm;

  if (safeWidthCm <= 0 || safeHeightCm <= 0) {
    return { tiles: [], totalPages: 0, safeWidthPx: 0, safeHeightPx: 0 };
  }

  const safeWidthPx = safeWidthCm * PX_PER_CM;
  const safeHeightPx = safeHeightCm * PX_PER_CM;
  const paperWidthPx = paperWidthCm * PX_PER_CM;
  const paperHeightPx = paperHeightCm * PX_PER_CM;
  const marginPx = marginCm * PX_PER_CM;
  const paddingPx = settings.paddingPx ?? 10;

  const x0 = bbox.x - paddingPx;
  const y0 = bbox.y - paddingPx;
  const x1 = bbox.x + bbox.width + paddingPx;
  const y1 = bbox.y + bbox.height + paddingPx;

  const ix0 = Math.floor((x0 - marginPx) / paperWidthPx);
  const ix1 = Math.floor((x1 - marginPx) / paperWidthPx);
  const iy0 = Math.floor((y0 - marginPx) / paperHeightPx);
  const iy1 = Math.floor((y1 - marginPx) / paperHeightPx);

  const tiles: PrintTile[] = [];
  for (let iy = iy0; iy <= iy1; iy += 1) {
    for (let ix = ix0; ix <= ix1; ix += 1) {
      const tileX = ix * paperWidthPx + marginPx;
      const tileY = iy * paperHeightPx + marginPx;
      const row = iy - iy0;
      const col = ix - ix0;

      if (!settings.includeBlankPages) {
        const tileRect: BoundingBox = {
          x: tileX,
          y: tileY,
          width: safeWidthPx,
          height: safeHeightPx,
        };

        const hasContent = figures.some((figure) =>
          intersectsRect(getFigureBoundingBox(figure), tileRect)
        );
        if (!hasContent) continue;
      }

      tiles.push({ tileX, tileY, row, col });
    }
  }

  return {
    tiles,
    totalPages: tiles.length,
    safeWidthPx,
    safeHeightPx,
  };
}

export function countUsedPrintPages(
  figures: Figure[],
  settings: Omit<PrintPageLayoutSettings, "includeBlankPages" | "paddingPx">
): number {
  return getUsedPrintTiles(figures, settings).totalPages;
}