import jsPDF from "jspdf";
import Konva from "konva";
import { DrawingTool, Shape } from "./types";
import { PX_PER_CM } from "./constants";

// A4 dimensions in cm
const A4_WIDTH_CM = 21.0;
const A4_HEIGHT_CM = 29.7;

// Crop mark size in cm
const CROP_MARK_SIZE_CM = 0.5;
const CROP_MARK_SIZE_PX = CROP_MARK_SIZE_CM * PX_PER_CM;

export type PaperSize = "A4";
export type PaperOrientation = "portrait" | "landscape";

export interface ExportSettings {
  paperSize: PaperSize;
  orientation: PaperOrientation;
  marginCm: number;
  includeBlankPages: boolean;
  dashedLines: boolean;
  showBaseSize: boolean;
  toolFilter: Record<DrawingTool, boolean>;
}

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

function resolveExportSettings(
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

function getPaperDimensionsCm(
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

function getShapeBoundingBox(shape: Shape): BoundingBox {
  let minX = shape.x;
  let minY = shape.y;
  let maxX = shape.x;
  let maxY = shape.y;

  if (shape.tool === "rectangle") {
    const width = shape.width || 0;
    const height = shape.height || 0;
    maxX = shape.x + width;
    maxY = shape.y + height;
  } else if (shape.tool === "circle") {
    const radius = shape.radius || 0;
    minX = shape.x - radius;
    minY = shape.y - radius;
    maxX = shape.x + radius;
    maxY = shape.y + radius;
  } else if (shape.tool === "line" || shape.tool === "curve") {
    const points = shape.points || [];
    for (let i = 0; i < points.length; i += 2) {
      const px = shape.x + points[i];
      const py = shape.y + points[i + 1];
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }

  const strokeWidth = shape.strokeWidth || 0;
  const halfStroke = strokeWidth / 2;
  minX -= halfStroke;
  minY -= halfStroke;
  maxX += halfStroke;
  maxY += halfStroke;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function intersectsRect(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function filterShapesBySettings(
  shapes: Shape[],
  settings: ExportSettings
): Shape[] {
  return shapes.filter((shape) => settings.toolFilter[shape.tool]);
}

function drawBaseSizeMarker(layer: Konva.Layer): void {
  const sizePx = 10 * PX_PER_CM;
  const x = 40;
  const y = 40;

  layer.add(
    new Konva.Rect({
      x,
      y,
      width: sizePx,
      height: sizePx,
      stroke: "#000000",
      strokeWidth: 2,
    })
  );

  layer.add(
    new Konva.Text({
      x,
      y: y + sizePx + 8,
      text: "10 cm",
      fontSize: 14,
      fontFamily: "Arial",
      fill: "#000000",
    })
  );
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate the bounding box that contains all shapes
 */
export function calculateBoundingBox(shapes: Shape[]): BoundingBox | null {
  if (shapes.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  shapes.forEach((shape) => {
    let shapeMinX = shape.x;
    let shapeMinY = shape.y;
    let shapeMaxX = shape.x;
    let shapeMaxY = shape.y;

    if (shape.tool === "rectangle") {
      const width = shape.width || 0;
      const height = shape.height || 0;
      shapeMaxX = shape.x + width;
      shapeMaxY = shape.y + height;
    } else if (shape.tool === "circle") {
      const radius = shape.radius || 0;
      shapeMinX = shape.x - radius;
      shapeMinY = shape.y - radius;
      shapeMaxX = shape.x + radius;
      shapeMaxY = shape.y + radius;
    } else if (shape.tool === "line" || shape.tool === "curve") {
      const points = shape.points || [];
      for (let i = 0; i < points.length; i += 2) {
        const px = shape.x + points[i];
        const py = shape.y + points[i + 1];
        shapeMinX = Math.min(shapeMinX, px);
        shapeMinY = Math.min(shapeMinY, py);
        shapeMaxX = Math.max(shapeMaxX, px);
        shapeMaxY = Math.max(shapeMaxY, py);
      }
    }

    // Account for stroke width
    const strokeWidth = shape.strokeWidth || 0;
    const halfStroke = strokeWidth / 2;
    shapeMinX -= halfStroke;
    shapeMinY -= halfStroke;
    shapeMaxX += halfStroke;
    shapeMaxY += halfStroke;

    minX = Math.min(minX, shapeMinX);
    minY = Math.min(minY, shapeMinY);
    maxX = Math.max(maxX, shapeMaxX);
    maxY = Math.max(maxY, shapeMaxY);
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Draw registration/crop marks on the stage for alignment
 */
function drawCropMarks(
  layer: Konva.Layer,
  tileX: number,
  tileY: number,
  tileWidth: number,
  tileHeight: number
): Konva.Group {
  const group = new Konva.Group();

  const markColor = "#000000";
  const markWidth = 2;

  // Corner positions
  const corners = [
    { x: tileX, y: tileY }, // Top-left
    { x: tileX + tileWidth, y: tileY }, // Top-right
    { x: tileX, y: tileY + tileHeight }, // Bottom-left
    { x: tileX + tileWidth, y: tileY + tileHeight }, // Bottom-right
  ];

  corners.forEach((corner) => {
    // Horizontal mark
    const hLine = new Konva.Line({
      points: [
        corner.x - CROP_MARK_SIZE_PX,
        corner.y,
        corner.x + CROP_MARK_SIZE_PX,
        corner.y,
      ],
      stroke: markColor,
      strokeWidth: markWidth,
    });

    // Vertical mark
    const vLine = new Konva.Line({
      points: [
        corner.x,
        corner.y - CROP_MARK_SIZE_PX,
        corner.x,
        corner.y + CROP_MARK_SIZE_PX,
      ],
      stroke: markColor,
      strokeWidth: markWidth,
    });

    group.add(hLine);
    group.add(vLine);
  });

  layer.add(group);
  return group;
}

/**
 * Add page number text to the tile
 */
function drawPageNumber(
  layer: Konva.Layer,
  pageNum: number,
  totalPages: number,
  tileX: number,
  tileY: number,
  tileHeight: number
): Konva.Text {
  const text = new Konva.Text({
    x: tileX + 10,
    y: tileY + tileHeight - 30,
    text: `Página ${pageNum} de ${totalPages}`,
    fontSize: 12,
    fontFamily: "Arial",
    fill: "#000000",
  });

  layer.add(text);
  return text;
}

/**
 * Generate a multi-page PDF with tiling for A4 printing
 */
export async function generateTiledPDF(
  _stage: Konva.Stage,
  shapes: Shape[],
  _hideGrid: () => void,
  _showGrid: () => void,
  settings?: Partial<ExportSettings>
): Promise<void> {
  const resolved = resolveExportSettings(settings);
  const filteredShapes = filterShapesBySettings(shapes, resolved);

  if (filteredShapes.length === 0) {
    alert("Não há nada para exportar. Desenhe algo primeiro.");
    return;
  }

  const bbox = calculateBoundingBox(filteredShapes);
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

  // Add some padding around the design
  const padding = 10; // pixels
  const exportArea = {
    x: bbox.x - padding,
    y: bbox.y - padding,
    width: bbox.width + 2 * padding,
    height: bbox.height + 2 * padding,
  };

  // Calculate how many tiles we need
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

        const hasContent = filteredShapes.some((shape) =>
          intersectsRect(getShapeBoundingBox(shape), tileRect)
        );

        if (!hasContent) {
          continue;
        }
      }

      tiles.push({ tileX, tileY });
    }
  }

  const totalPages = tiles.length;
  if (totalPages === 0) {
    alert("Nada para exportar com os filtros selecionados.");
    return;
  }

  // Create PDF
  const pdf = new jsPDF({
    orientation: resolved.orientation,
    unit: "cm",
    format: "a4",
  });

  let pageNum = 0;

  try {
    for (const { tileX, tileY } of tiles) {
      pageNum++;

        // Render this tile to dataURL with high quality.
        // IMPORTANT: we render only the shapes (no canvas background/grid/transformers)
        // by drawing into an offscreen Konva stage.
        const container = document.createElement("div");
        const tileStage = new Konva.Stage({
          container,
          width: safeWidthPx,
          height: safeHeightPx,
        });

        const tileLayer = new Konva.Layer();
        tileStage.add(tileLayer);

        // Draw shapes with tile offset
        const tileRect: BoundingBox = {
          x: tileX,
          y: tileY,
          width: safeWidthPx,
          height: safeHeightPx,
        };

        const shapesInTile = filteredShapes.filter((shape) =>
          intersectsRect(getShapeBoundingBox(shape), tileRect)
        );

        shapesInTile.forEach((shape) => {
          // Force black strokes for print quality
          const stroke = "#000000";
          const strokeWidth = shape.strokeWidth || 1;
          const fill = shape.fill || "transparent";
          const opacity = shape.opacity !== undefined ? shape.opacity : 1;
          const rotation = shape.rotation || 0;
          const dash = resolved.dashedLines ? [12, 6] : shape.dash;

          if (shape.tool === "rectangle") {
            tileLayer.add(
              new Konva.Rect({
                x: shape.x - tileX,
                y: shape.y - tileY,
                width: shape.width || 0,
                height: shape.height || 0,
                fill,
                stroke,
                strokeWidth,
                opacity,
                rotation,
              })
            );
            return;
          }

          if (shape.tool === "circle") {
            tileLayer.add(
              new Konva.Circle({
                x: shape.x - tileX,
                y: shape.y - tileY,
                radius: shape.radius || 0,
                fill,
                stroke,
                strokeWidth,
                opacity,
                rotation,
              })
            );
            return;
          }

          if (shape.tool === "line") {
            tileLayer.add(
              new Konva.Line({
                x: shape.x - tileX,
                y: shape.y - tileY,
                points: shape.points || [],
                stroke,
                strokeWidth,
                opacity,
                rotation,
                dash,
                lineCap: "round",
                lineJoin: "round",
              })
            );
            return;
          }

          if (shape.tool === "curve") {
            const points = shape.points || [];
            const cp = shape.controlPoint;
            if (points.length >= 4 && cp) {
              const x1 = points[0];
              const y1 = points[1];
              const x2 = points[2];
              const y2 = points[3];
              const cx = cp.x;
              const cy = cp.y;

              const curvePoints: number[] = [];
              const steps = 50;

              for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const mt = 1 - t;
                const mt2 = mt * mt;
                const t2 = t * t;

                const x = mt2 * x1 + 2 * mt * t * cx + t2 * x2;
                const y = mt2 * y1 + 2 * mt * t * cy + t2 * y2;

                curvePoints.push(x, y);
              }

              tileLayer.add(
                new Konva.Line({
                  x: shape.x - tileX,
                  y: shape.y - tileY,
                  points: curvePoints,
                  stroke,
                  strokeWidth,
                  opacity,
                  rotation,
                  dash,
                  tension: 0,
                  lineCap: "round",
                  lineJoin: "round",
                })
              );
            }
          }
        });

        // Crop marks and page number are drawn in tile-local coordinates.
        drawCropMarks(tileLayer, 0, 0, safeWidthPx, safeHeightPx);
        drawPageNumber(tileLayer, pageNum, totalPages, 0, 0, safeHeightPx);

        if (resolved.showBaseSize && pageNum === 1) {
          drawBaseSizeMarker(tileLayer);
        }

        // Ensure everything is rendered
        tileLayer.draw();

        const dataURL = tileStage.toDataURL({
          x: 0,
          y: 0,
          width: safeWidthPx,
          height: safeHeightPx,
          pixelRatio: 3,
        });

        tileStage.destroy();

        // Add new page if not the first
        if (pageNum > 1) {
          pdf.addPage();
        }

        // Add image to PDF at actual size (maintaining 1:1 scale)
        pdf.addImage(
          dataURL,
          "PNG",
          marginCm,
          marginCm,
          safeWidthCm,
          safeHeightCm
        );
    }

    // Save the PDF
    const filename = `inaa-pattern-${new Date().getTime()}.pdf`;
    pdf.save(filename);

    alert(
      `PDF gerado com sucesso!\n\n` +
        `Total de páginas: ${totalPages}\n` +
        `Colunas: ${cols} x Linhas: ${rows}\n\n` +
        `Imprima em escala 100% (tamanho real) e una as páginas usando as marcas de corte.`
    );
  } finally {
    // no-op: export uses offscreen stage, so nothing to restore
  }
}

/**
 * Generate SVG export (simpler vector format for plotters)
 */
export function generateSVG(
  shapes: Shape[],
  settings?: Partial<ExportSettings>
): void {
  const resolved = resolveExportSettings(settings);
  const filteredShapes = filterShapesBySettings(shapes, resolved);

  if (filteredShapes.length === 0) {
    alert("Não há nada para exportar. Desenhe algo primeiro.");
    return;
  }

  const bbox = calculateBoundingBox(filteredShapes);
  if (!bbox) {
    alert("Erro ao calcular a área de desenho.");
    return;
  }

  // Add padding
  const padding = 10;
  const viewBox = {
    x: bbox.x - padding,
    y: bbox.y - padding,
    width: bbox.width + 2 * padding,
    height: bbox.height + 2 * padding,
  };

  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}"
     width="${viewBox.width}px" 
     height="${viewBox.height}px">
`;

  // Convert each shape to SVG
  filteredShapes.forEach((shape) => {
    const stroke = shape.stroke || "#000000";
    const strokeWidth = shape.strokeWidth || 1;
    const fill = shape.fill || "none";
    const opacity = shape.opacity !== undefined ? shape.opacity : 1;
    const dashArray = resolved.dashedLines
      ? "12 6"
      : shape.dash
        ? shape.dash.join(" ")
        : null;

    if (shape.tool === "rectangle" && shape.width && shape.height) {
      svgContent += `  <rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" `;
      svgContent += `stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" opacity="${opacity}" />\n`;
    } else if (shape.tool === "circle" && shape.radius) {
      svgContent += `  <circle cx="${shape.x}" cy="${shape.y}" r="${shape.radius}" `;
      svgContent += `stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" opacity="${opacity}" />\n`;
    } else if (shape.tool === "line" && shape.points) {
      const points = shape.points;
      if (points.length >= 4) {
        const x1 = shape.x + points[0];
        const y1 = shape.y + points[1];
        const x2 = shape.x + points[2];
        const y2 = shape.y + points[3];
        svgContent += `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" `;
        svgContent += `stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"`;
        if (dashArray) {
          svgContent += ` stroke-dasharray="${dashArray}"`;
        }
        svgContent += ` />\n`;
      }
    } else if (shape.tool === "curve" && shape.points && shape.controlPoint) {
      const points = shape.points;
      if (points.length >= 4) {
        const x1 = shape.x + points[0];
        const y1 = shape.y + points[1];
        const x2 = shape.x + points[2];
        const y2 = shape.y + points[3];
        const cx = shape.x + shape.controlPoint.x;
        const cy = shape.y + shape.controlPoint.y;

        svgContent += `  <path d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" `;
        svgContent += `stroke="${stroke}" stroke-width="${strokeWidth}" fill="none" opacity="${opacity}"`;
        if (dashArray) {
          svgContent += ` stroke-dasharray="${dashArray}"`;
        }
        svgContent += ` />\n`;
      }
    }
  });

  svgContent += `</svg>`;

  // Create download
  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `inaa-pattern-${new Date().getTime()}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  alert("SVG exportado com sucesso!");
}
