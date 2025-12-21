import { jsPDF } from "jspdf";
import Konva from "konva";
import { PX_PER_CM } from "./constants";
import {
  ExportSettings,
  getPaperDimensionsCm,
  resolveExportSettings,
} from "./exportSettings";
import type { Figure } from "./types";
import { figureWorldBoundingBox, figureWorldPolyline } from "./figurePath";
import { figureLocalToWorld } from "./figurePath";
import type { PointLabelsMode } from "./types";
import { computeNodeLabels } from "./pointLabels";
import { figureCentroidLocal } from "./figurePath";

export type {
  ExportSettings,
  PaperOrientation,
  PaperSize,
} from "./exportSettings";
export {
  createDefaultExportSettings,
  getPaperDimensionsCm,
  resolveExportSettings,
} from "./exportSettings";

type BoundingBox = { x: number; y: number; width: number; height: number };

type PointLabelsExportOptions = {
  includePointLabels?: boolean;
  pointLabelsMode?: PointLabelsMode;
};

// Crop mark size in cm
function intersectsRect(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function filterFiguresBySettings(
  figures: Figure[],
  settings: ExportSettings
): Figure[] {
  return figures.filter((figure) => {
    const enabled =
      settings.toolFilter[figure.tool as keyof ExportSettings["toolFilter"]];
    return enabled !== false;
  });
}

function calculateFiguresBoundingBox(figures: Figure[]): BoundingBox | null {
  let hasAny = false;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  for (const fig of figures) {
    const b = figureWorldBoundingBox(fig);
    if (!b) continue;
    if (!hasAny) {
      hasAny = true;
      minX = b.x;
      minY = b.y;
      maxX = b.x + b.width;
      maxY = b.y + b.height;
      continue;
    }
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function polylineToSvgPath(points: number[], closed: boolean): string {
  if (points.length < 4) return "";
  let d = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length; i += 2) {
    d += ` L ${points[i]} ${points[i + 1]}`;
  }
  if (closed) d += " Z";
  return d;
}

/**
 * Generate a multi-page PDF with tiling for A4 printing.
 */
export async function generateTiledPDF(
  _stage: Konva.Stage,
  figures: Figure[],
  _hideGrid: () => void,
  _showGrid: () => void,
  settings?: Partial<ExportSettings>,
  options?: PointLabelsExportOptions
): Promise<void> {
  const resolved = resolveExportSettings(settings);
  const filtered = filterFiguresBySettings(figures, resolved);

  const shouldIncludePointLabels =
    options?.includePointLabels === true &&
    options.pointLabelsMode &&
    options.pointLabelsMode !== "off";
  const nodeLabelsByFigureId = shouldIncludePointLabels
    ? computeNodeLabels(filtered, options!.pointLabelsMode!)
    : new Map<string, Record<string, string>>();

  if (filtered.length === 0) {
    alert("Não há nada para exportar. Desenhe algo primeiro.");
    return;
  }

  const bbox = calculateFiguresBoundingBox(filtered);
  if (!bbox) {
    alert("Erro ao calcular a área de desenho.");
    return;
  }

  const { widthCm: paperWidthCm, heightCm: paperHeightCm } =
    getPaperDimensionsCm(resolved.paperSize, resolved.orientation);
  const marginCm = Math.max(0, Math.min(resolved.marginCm, 10));
  const safeWidthCm = paperWidthCm - 2 * marginCm;
  const safeHeightCm = paperHeightCm - 2 * marginCm;

  if (safeWidthCm <= 0 || safeHeightCm <= 0) {
    alert("Margens inválidas: a área útil ficou negativa.");
    return;
  }

  const safeWidthPx = safeWidthCm * PX_PER_CM;
  const safeHeightPx = safeHeightCm * PX_PER_CM;

  const padding = 10;
  const exportArea = {
    x: bbox.x - padding,
    y: bbox.y - padding,
    width: bbox.width + 2 * padding,
    height: bbox.height + 2 * padding,
  };

  const cols = Math.ceil(exportArea.width / safeWidthPx);
  const rows = Math.ceil(exportArea.height / safeHeightPx);

  const tiles: Array<{ tileX: number; tileY: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tileX = exportArea.x + col * safeWidthPx;
      const tileY = exportArea.y + row * safeHeightPx;

      if (!resolved.includeBlankPages) {
        const tileRect: BoundingBox = {
          x: tileX,
          y: tileY,
          width: safeWidthPx,
          height: safeHeightPx,
        };

        const hasContent = filtered.some((fig) =>
          intersectsRect(getFigureBoundingBox(fig), tileRect)
        );
        if (!hasContent) continue;
      }

      tiles.push({ tileX, tileY });
    }
  }

  const totalPages = tiles.length;
  if (totalPages === 0) {
    alert("Nada para exportar com os filtros selecionados.");
    return;
  }

  const pdf = new jsPDF({
    orientation: resolved.orientation,
    unit: "cm",
    format: "a4",
  });

  let pageNum = 0;
  for (const { tileX, tileY } of tiles) {
    pageNum++;

    const container = document.createElement("div");
    const tileStage = new Konva.Stage({
      container,
      width: safeWidthPx,
      height: safeHeightPx,
    });
    const tileLayer = new Konva.Layer();
    tileStage.add(tileLayer);

    const tileRect: BoundingBox = {
      x: tileX,
      y: tileY,
      width: safeWidthPx,
      height: safeHeightPx,
    };

    const figuresInTile = filtered.filter((figure) =>
      intersectsRect(getFigureBoundingBox(figure), tileRect)
    );

    figuresInTile.forEach((figure) => {
      const poly = figureWorldPolyline(figure, 60);
      if (poly.length < 4) return;

      const shifted: number[] = [];
      for (let i = 0; i < poly.length; i += 2) {
        shifted.push(poly[i] - tileX, poly[i + 1] - tileY);
      }

      tileLayer.add(
        new Konva.Line({
          points: shifted,
          stroke: "#000000",
          strokeWidth: figure.strokeWidth || 1,
          closed: figure.closed,
          fill: figure.closed ? "transparent" : undefined,
          opacity: figure.opacity ?? 1,
          dash: resolved.dashedLines ? [12, 6] : figure.dash,
          lineCap: "round",
          lineJoin: "round",
        })
      );

      if (shouldIncludePointLabels) {
        const labels = nodeLabelsByFigureId.get(figure.id);
        if (!labels) return;

        const fontSize = 14;
        const centroid = figureCentroidLocal(figure);
        const offsetDistLocal = 14;

        for (const node of figure.nodes) {
          const text = labels[node.id];
          if (!text) continue;

          const dx = node.x - centroid.x;
          const dy = node.y - centroid.y;
          const len = Math.hypot(dx, dy);
          const dir =
            len > 1e-6
              ? { x: dx / len, y: dy / len }
              : { x: 0.707106781, y: -0.707106781 };

          const posLocal = {
            x: node.x + dir.x * offsetDistLocal,
            y: node.y + dir.y * offsetDistLocal,
          };

          const worldPos = figureLocalToWorld(figure, posLocal);
          const alignRight = dx < 0;
          const approxWidth = Math.max(12, text.length * fontSize * 0.62);

          tileLayer.add(
            new Konva.Text({
              x: worldPos.x - tileX,
              y: worldPos.y - tileY,
              text: text.toUpperCase(),
              fontSize,
              fontStyle: "bold",
              fill: "#000000",
              opacity: 0.35,
              rotation: figure.rotation || 0,
              width: approxWidth,
              align: alignRight ? "right" : "left",
              offsetX: alignRight ? approxWidth : 0,
              offsetY: fontSize / 2,
              listening: false,
              name: "inaa-point-label",
            })
          );
        }
      }
    });

    tileLayer.draw();
    const dataURL = tileStage.toDataURL({
      x: 0,
      y: 0,
      width: safeWidthPx,
      height: safeHeightPx,
      pixelRatio: 3,
    });
    tileStage.destroy();

    if (pageNum > 1) pdf.addPage();
    pdf.addImage(
      dataURL,
      "PNG",
      marginCm,
      marginCm,
      safeWidthCm,
      safeHeightCm
    );
  }

  pdf.save(`inaa-pattern-${new Date().getTime()}.pdf`);
}

/**
 * Generate SVG export (vector; good for plotters).
 */
export function generateSVG(
  figures: Figure[],
  settings?: Partial<ExportSettings>,
  options?: PointLabelsExportOptions
): void {
  const resolved = resolveExportSettings(settings);
  const filtered = filterFiguresBySettings(figures, resolved);

  const shouldIncludePointLabels =
    options?.includePointLabels === true &&
    options.pointLabelsMode &&
    options.pointLabelsMode !== "off";
  const nodeLabelsByFigureId = shouldIncludePointLabels
    ? computeNodeLabels(filtered, options!.pointLabelsMode!)
    : new Map<string, Record<string, string>>();

  if (filtered.length === 0) {
    alert("Não há nada para exportar. Desenhe algo primeiro.");
    return;
  }

  const bbox = calculateFiguresBoundingBox(filtered);
  if (!bbox) {
    alert("Erro ao calcular a área de desenho.");
    return;
  }

  const padding = 10;
  const viewBox = {
    x: bbox.x - padding,
    y: bbox.y - padding,
    width: bbox.width + 2 * padding,
    height: bbox.height + 2 * padding,
  };

  const dashArray = resolved.dashedLines ? "12 6" : null;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" `;
  svg += `viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" `;
  svg += `width="${viewBox.width}px" height="${viewBox.height}px">\n`;

  for (const fig of filtered) {
    const points = figureWorldPolyline(fig, 120);
    const d = polylineToSvgPath(points, fig.closed);
    if (!d) continue;
    const strokeWidth = fig.strokeWidth ?? 1;

    svg += `  <path d="${d}" stroke="#000" stroke-width="${strokeWidth}" fill="none"`;
    if (dashArray) svg += ` stroke-dasharray="${dashArray}"`;
    svg += ` />\n`;

    if (shouldIncludePointLabels) {
      const labels = nodeLabelsByFigureId.get(fig.id);
      if (!labels) continue;

      const fontSize = 14;
      const centroid = figureCentroidLocal(fig);
      const offsetDistLocal = 14;

      for (const node of fig.nodes) {
        const text = labels[node.id];
        if (!text) continue;

        const dx = node.x - centroid.x;
        const dy = node.y - centroid.y;
        const len = Math.hypot(dx, dy);
        const dir =
          len > 1e-6
            ? { x: dx / len, y: dy / len }
            : { x: 0.707106781, y: -0.707106781 };

        const posLocal = {
          x: node.x + dir.x * offsetDistLocal,
          y: node.y + dir.y * offsetDistLocal,
        };

        const worldPos = figureLocalToWorld(fig, posLocal);
        const rot = fig.rotation || 0;
        const anchor = dx < 0 ? "end" : "start";

        svg += `  <text class="inaa-point-label" x="${worldPos.x}" y="${worldPos.y}"`;
        svg += ` font-family="sans-serif" font-size="${fontSize}" font-weight="700"`;
        svg += ` fill="#000" fill-opacity="0.35" text-anchor="${anchor}" dominant-baseline="middle"`;
        if (rot) {
          svg += ` transform="rotate(${rot} ${worldPos.x} ${worldPos.y})"`;
        }
        svg += `>${text.toUpperCase()}</text>\n`;
      }
    }
  }

  svg += `</svg>`;

  downloadBlob(
    new Blob([svg], { type: "image/svg+xml" }),
    `inaa-pattern-${new Date().getTime()}.svg`
  );
}

