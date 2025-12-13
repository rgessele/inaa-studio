import jsPDF from "jspdf";
import Konva from "konva";
import { Shape } from "./types";
import { PX_PER_CM } from "./constants";

// A4 dimensions in cm
const A4_WIDTH_CM = 21.0;
const A4_HEIGHT_CM = 29.7;

// Safe printing area (A4 minus 1cm margins on each side)
const SAFE_WIDTH_CM = 19.0;
const SAFE_HEIGHT_CM = 27.7;

// Convert to pixels
const SAFE_WIDTH_PX = SAFE_WIDTH_CM * PX_PER_CM;
const SAFE_HEIGHT_PX = SAFE_HEIGHT_CM * PX_PER_CM;

// Crop mark size in cm
const CROP_MARK_SIZE_CM = 0.5;
const CROP_MARK_SIZE_PX = CROP_MARK_SIZE_CM * PX_PER_CM;

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
  stage: Konva.Stage,
  shapes: Shape[],
  hideGrid: () => void,
  showGrid: () => void
): Promise<void> {
  if (shapes.length === 0) {
    alert("Não há nada para exportar. Desenhe algo primeiro.");
    return;
  }

  const bbox = calculateBoundingBox(shapes);
  if (!bbox) {
    alert("Erro ao calcular a área de desenho.");
    return;
  }

  // Add some padding around the design
  const padding = 10; // pixels
  const exportArea = {
    x: bbox.x - padding,
    y: bbox.y - padding,
    width: bbox.width + 2 * padding,
    height: bbox.height + 2 * padding,
  };

  // Calculate how many tiles we need
  const cols = Math.ceil(exportArea.width / SAFE_WIDTH_PX);
  const rows = Math.ceil(exportArea.height / SAFE_HEIGHT_PX);
  const totalPages = cols * rows;

  // Hide grid temporarily
  hideGrid();

  // Create PDF
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "cm",
    format: "a4",
  });

  let pageNum = 0;

  // Create a temporary layer for crop marks and page numbers
  const tempLayer = new Konva.Layer();
  stage.add(tempLayer);

  try {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        pageNum++;

        // Calculate tile position
        const tileX = exportArea.x + col * SAFE_WIDTH_PX;
        const tileY = exportArea.y + row * SAFE_HEIGHT_PX;

        // Draw crop marks and page number on temp layer
        tempLayer.destroyChildren();
        const cropMarks = drawCropMarks(
          tempLayer,
          tileX,
          tileY,
          SAFE_WIDTH_PX,
          SAFE_HEIGHT_PX
        );
        const pageText = drawPageNumber(
          tempLayer,
          pageNum,
          totalPages,
          tileX,
          tileY,
          SAFE_HEIGHT_PX
        );

        // Render this tile to dataURL with high quality
        const dataURL = stage.toDataURL({
          x: tileX,
          y: tileY,
          width: SAFE_WIDTH_PX,
          height: SAFE_HEIGHT_PX,
          pixelRatio: 3, // High quality for printing
        });

        // Add new page if not the first
        if (pageNum > 1) {
          pdf.addPage();
        }

        // Calculate position to center the image with 1cm margins
        const marginCm = 1;

        // Add image to PDF at actual size (maintaining 1:1 scale)
        pdf.addImage(
          dataURL,
          "PNG",
          marginCm,
          marginCm,
          SAFE_WIDTH_CM,
          SAFE_HEIGHT_CM
        );

        // Clean up temp layer
        cropMarks.destroy();
        pageText.destroy();
      }
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
    // Clean up temp layer
    tempLayer.destroy();

    // Show grid again
    showGrid();
  }
}

/**
 * Generate SVG export (simpler vector format for plotters)
 */
export function generateSVG(shapes: Shape[]): void {
  if (shapes.length === 0) {
    alert("Não há nada para exportar. Desenhe algo primeiro.");
    return;
  }

  const bbox = calculateBoundingBox(shapes);
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
  shapes.forEach((shape) => {
    const stroke = shape.stroke || "#000000";
    const strokeWidth = shape.strokeWidth || 1;
    const fill = shape.fill || "none";
    const opacity = shape.opacity !== undefined ? shape.opacity : 1;

    if (shape.tool === "rectangle") {
      svgContent += `  <rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" `;
      svgContent += `stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" opacity="${opacity}" />\n`;
    } else if (shape.tool === "circle") {
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
        svgContent += `stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
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
        svgContent += `stroke="${stroke}" stroke-width="${strokeWidth}" fill="none" opacity="${opacity}" />\n`;
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
