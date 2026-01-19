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
import { figureLocalPolyline } from "./figurePath";
import { edgeLocalPoints } from "./figurePath";
import type { PointLabelsMode } from "./types";
import { computeNodeLabels } from "./pointLabels";
import { figureCentroidLocal } from "./figurePath";
import { toast } from "@/utils/toast";
import {
  add,
  dist,
  lerp,
  midAndTangent,
  mul,
  norm,
  normalizeUprightAngleDeg,
  perp,
  sub,
} from "./figureGeometry";
import { formatCm, pxToCm } from "./measureUnits";

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

type Vec2 = { x: number; y: number };

function concatPolylineSegments(segments: Vec2[][]): Vec2[] {
  const out: Vec2[] = [];
  for (const seg of segments) {
    if (seg.length === 0) continue;
    if (out.length === 0) out.push(...seg);
    else out.push(...seg.slice(1));
  }
  return out;
}

function polylineLengthPx(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += dist(points[i]!, points[i + 1]!);
  }
  return sum;
}

function walkLoopEdgeIds(
  figure: Figure,
  fromNodeId: string,
  toNodeId: string
): { edgeIds: string[]; ok: boolean } {
  const outMap = new Map<string, string[]>();
  for (const e of figure.edges) {
    const list = outMap.get(e.from) ?? [];
    list.push(e.id);
    outMap.set(e.from, list);
  }

  const edgeIds: string[] = [];
  let current = fromNodeId;
  const visited = new Set<string>();

  for (let safety = 0; safety < figure.edges.length + 3; safety++) {
    if (current === toNodeId) return { edgeIds, ok: true };
    if (visited.has(current)) break;
    visited.add(current);

    const outs = outMap.get(current) ?? [];
    if (outs.length === 0) break;

    // Closed figures should behave like a single loop for our purposes.
    const edgeId = outs[0]!;
    const edge = figure.edges.find((ed) => ed.id === edgeId);
    if (!edge) break;

    edgeIds.push(edgeId);
    current = edge.to;
  }

  return { edgeIds, ok: false };
}

function edgeIdsToWorldPolyline(figure: Figure, edgeIds: string[]): Vec2[] {
  const segments: Vec2[][] = [];
  for (const id of edgeIds) {
    const edge = figure.edges.find((e) => e.id === id);
    if (!edge) continue;
    const steps = edge.kind === "line" ? 1 : 120;
    const local = edgeLocalPoints(figure, edge, steps);
    const world = local.map((p) => figureLocalToWorld(figure, p));
    segments.push(world);
  }
  return concatPolylineSegments(segments);
}

function computeDartBaseWorldPolyline(
  figure: Figure,
  aNodeId: string,
  bNodeId: string
): Vec2[] | null {
  if (!figure.closed) return null;
  const aNode = figure.nodes.find((n) => n.id === aNodeId);
  const bNode = figure.nodes.find((n) => n.id === bNodeId);
  if (!aNode || !bNode) return null;

  const pathAB = walkLoopEdgeIds(figure, aNodeId, bNodeId);
  const pathBA = walkLoopEdgeIds(figure, bNodeId, aNodeId);
  if (!pathAB.ok && !pathBA.ok) {
    return [
      figureLocalToWorld(figure, { x: aNode.x, y: aNode.y }),
      figureLocalToWorld(figure, { x: bNode.x, y: bNode.y }),
    ];
  }

  const polyAB = pathAB.ok ? edgeIdsToWorldPolyline(figure, pathAB.edgeIds) : [];
  const polyBA = pathBA.ok ? edgeIdsToWorldPolyline(figure, pathBA.edgeIds) : [];
  if (!polyAB.length && !polyBA.length) return null;
  if (!polyBA.length) return polyAB;
  if (!polyAB.length) return polyBA;
  return polylineLengthPx(polyAB) <= polylineLengthPx(polyBA) ? polyAB : polyBA;
}

type PointLabelsExportOptions = {
  includePointLabels?: boolean;
  includeMeasures?: boolean;
  includePatternName?: boolean;
  includePiques?: boolean;
  pointLabelsMode?: PointLabelsMode;
};

function pointAndTangentAtT01(
  points: Vec2[],
  t01: number
): { point: Vec2; tangentUnit: Vec2 } | null {
  if (points.length < 2) return null;

  const clamped = Math.max(0, Math.min(1, t01));

  let total = 0;
  const segLens: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const l = dist(a, b);
    segLens.push(l);
    total += l;
  }

  if (!(total > 1e-6)) {
    const a = points[0]!;
    const b = points[points.length - 1]!;
    return { point: a, tangentUnit: norm(sub(b, a)) };
  }

  const target = clamped * total;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    const l = segLens[i]!;
    const a = points[i]!;
    const b = points[i + 1]!;

    if (acc + l >= target || i === segLens.length - 1) {
      const localT = l > 1e-6 ? (target - acc) / l : 0;
      return { point: lerp(a, b, localT), tangentUnit: norm(sub(b, a)) };
    }

    acc += l;
  }

  const a = points[0]!;
  const b = points[points.length - 1]!;
  return { point: b, tangentUnit: norm(sub(b, a)) };
}

function computePiqueSegmentWorld(
  figure: Figure,
  pique: { edgeId: string; t01: number; lengthCm: number; side: 1 | -1 }
): { aWorld: Vec2; bWorld: Vec2 } | null {
  if (!figure.closed) return null;
  const edge = figure.edges.find((e) => e.id === pique.edgeId) ?? null;
  if (!edge) return null;

  const ptsLocal = edgeLocalPoints(figure, edge, edge.kind === "line" ? 2 : 120);
  if (ptsLocal.length < 2) return null;

  const at = pointAndTangentAtT01(ptsLocal, pique.t01);
  if (!at) return null;

  const n = norm(perp(at.tangentUnit));
  const side = pique.side === -1 ? -1 : 1;
  const lengthPx = Math.max(0, (pique.lengthCm || 0.5) * PX_PER_CM);
  const aLocal = at.point;
  const bLocal = add(aLocal, mul(n, lengthPx * side));

  return {
    aWorld: figureLocalToWorld(figure, aLocal),
    bWorld: figureLocalToWorld(figure, bLocal),
  };
}

function safeEdgeLengthPx(fig: Figure, edgeId: string, fallbackPx: number) {
  const hit = fig.measures?.perEdge?.find((m) => m.edgeId === edgeId);
  const v = hit?.lengthPx;
  return Number.isFinite(v ?? NaN) ? (v as number) : fallbackPx;
}

function edgeWorldLengthFallbackPx(fig: Figure, edgeId: string): number {
  const edge = fig.edges.find((e) => e.id === edgeId);
  if (!edge) return 0;
  const pts = edgeLocalPoints(fig, edge, edge.kind === "line" ? 1 : 50);
  if (pts.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = figureLocalToWorld(fig, pts[i - 1]!);
    const b = figureLocalToWorld(fig, pts[i]!);
    sum += dist(a, b);
  }
  return sum;
}

function formatSeamLabelCm(cm: number): string {
  if (!Number.isFinite(cm)) return "0,00cm";
  return `${cm.toFixed(2).replace(".", ",")}cm`;
}

function findLongestSegmentWorld(
  pts: Vec2[],
  closed: boolean
): { a: Vec2 | null; b: Vec2 | null; len: number } {
  let bestA: Vec2 | null = null;
  let bestB: Vec2 | null = null;
  let bestLen = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = dist(pts[i]!, pts[i + 1]!);
    if (l > bestLen) {
      bestLen = l;
      bestA = pts[i]!;
      bestB = pts[i + 1]!;
    }
  }
  if (closed && pts.length >= 2) {
    const l = dist(pts[pts.length - 1]!, pts[0]!);
    if (l > bestLen) {
      bestLen = l;
      bestA = pts[pts.length - 1]!;
      bestB = pts[0]!;
    }
  }
  return { a: bestA, b: bestB, len: bestLen };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function computeEdgeMeasureLayoutWorld(fig: Figure, edgeId: string): {
  midWorld: Vec2;
  posWorld: Vec2;
  angleDeg: number;
  isShortEdge: boolean;
} | null {
  const edge = fig.edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  const ptsLocal = edgeLocalPoints(fig, edge, edge.kind === "line" ? 1 : 50);
  if (ptsLocal.length < 2) return null;
  const mt = midAndTangent(ptsLocal);
  if (!mt) return null;

  const midWorld = figureLocalToWorld(fig, mt.mid);
  const tangentEndWorld = figureLocalToWorld(fig, add(mt.mid, mt.tangent));
  const tangentWorld = sub(tangentEndWorld, midWorld);
  const normalWorld = norm(perp(tangentWorld));

  const startWorld = figureLocalToWorld(fig, ptsLocal[0]!);
  const endWorld = figureLocalToWorld(fig, ptsLocal[ptsLocal.length - 1]!);
  const chordLenWorld = dist(startWorld, endWorld);
  const SHORT_EDGE_THRESHOLD_PX = 42;
  const isShortEdge = chordLenWorld < SHORT_EDGE_THRESHOLD_PX;

  const OFFSET_PX = 10;
  const extra = isShortEdge ? 18 : 0;

  const centroidLocal = figureCentroidLocal(fig);
  const centroidWorld = figureLocalToWorld(fig, centroidLocal);

  const p1 = add(midWorld, mul(normalWorld, OFFSET_PX + extra));
  const p2 = add(midWorld, mul(normalWorld, -(OFFSET_PX + extra)));
  const posWorld = dist(p1, centroidWorld) >= dist(p2, centroidWorld) ? p1 : p2;

  const rawAngleDeg =
    (Math.atan2(tangentWorld.y, tangentWorld.x) * 180) / Math.PI;
  const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

  return { midWorld, posWorld, angleDeg, isShortEdge };
}

function computeFigureNameLayoutLocal(
  fig: Figure,
  rawText: string
): {
  posLocal: { x: number; y: number };
  fontSize: number;
  width: number;
} | null {
  const text = rawText.trim();
  if (!text) return null;

  const estimateNameWidth = (t: string, fontSize: number) => {
    // Konva.Text clips to `width`, so keep it generous to avoid truncation.
    return Math.max(12, t.length * fontSize * 0.8 + fontSize * 1.5);
  };

  const nameFontSizePx = (() => {
    const v = fig.nameFontSizePx;
    if (!Number.isFinite(v ?? NaN)) return 24;
    return Math.max(6, Math.min(256, v as number));
  })();
  const nameOffsetLocal = fig.nameOffsetLocal ?? { x: 0, y: 0 };

  const localPts = figureLocalPolyline(fig, 60);
  const centroid = figureCentroidLocal(fig);

  if (fig.closed) {
    const fontSize = nameFontSizePx;
    const width = estimateNameWidth(text, fontSize);

    return {
      posLocal: {
        x:
          centroid.x +
          (Number.isFinite(nameOffsetLocal.x) ? nameOffsetLocal.x : 0),
        y:
          centroid.y +
          (Number.isFinite(nameOffsetLocal.y) ? nameOffsetLocal.y : 0),
      },
      fontSize,
      width,
    };
  }

  // Open figures: near midpoint of polyline with an outward normal offset.
  if (localPts.length >= 8) {
    const midIdx = Math.floor(localPts.length / 4) * 2;
    const px = localPts[midIdx];
    const py = localPts[midIdx + 1];
    const prevX = localPts[Math.max(0, midIdx - 2)];
    const prevY = localPts[Math.max(1, midIdx - 1)];
    const nextX = localPts[Math.min(localPts.length - 2, midIdx + 2)];
    const nextY = localPts[Math.min(localPts.length - 1, midIdx + 3)];
    const dx = nextX - prevX;
    const dy = nextY - prevY;
    const len = Math.hypot(dx, dy);
    const n = len > 1e-6 ? { x: -dy / len, y: dx / len } : { x: 0, y: -1 };
    const offset = 18;
    const fontSize = nameFontSizePx;
    const width = estimateNameWidth(text, fontSize);
    return {
      posLocal: {
        x:
          px +
          n.x * offset * -1 +
          (Number.isFinite(nameOffsetLocal.x) ? nameOffsetLocal.x : 0),
        y:
          py +
          n.y * offset * -1 +
          (Number.isFinite(nameOffsetLocal.y) ? nameOffsetLocal.y : 0),
      },
      fontSize,
      width,
    };
  }

  const fontSize = nameFontSizePx;
  const width = estimateNameWidth(text, fontSize);
  return {
    posLocal: {
      x:
        centroid.x +
        (Number.isFinite(nameOffsetLocal.x) ? nameOffsetLocal.x : 0),
      y:
        centroid.y -
        18 +
        (Number.isFinite(nameOffsetLocal.y) ? nameOffsetLocal.y : 0),
    },
    fontSize,
    width,
  };
}

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

  const shouldIncludeMeasures = options?.includeMeasures !== false;
  const shouldIncludePatternName = options?.includePatternName !== false;
  const shouldIncludePiques = options?.includePiques !== false;

  const shouldIncludePointLabels =
    options?.includePointLabels === true &&
    options.pointLabelsMode &&
    options.pointLabelsMode !== "off";
  const nodeLabelsByFigureId = shouldIncludePointLabels
    ? computeNodeLabels(filtered, options!.pointLabelsMode!)
    : new Map<string, Record<string, string>>();

  if (filtered.length === 0) {
    toast("Não há nada para exportar. Desenhe algo primeiro.", "error");
    return;
  }

  const bbox = calculateFiguresBoundingBox(filtered);
  if (!bbox) {
    toast("Erro ao calcular a área de desenho.", "error");
    return;
  }

  const { widthCm: paperWidthCm, heightCm: paperHeightCm } =
    getPaperDimensionsCm(resolved.paperSize, resolved.orientation);
  // jsPDF needs the page "format" (size) specified independently. When passing an array,
  // the values are interpreted in the unit configured below (we use "cm").
  // We pass the base (portrait) dimensions and let jsPDF apply the orientation.
  const { widthCm: pageFormatWidthCm, heightCm: pageFormatHeightCm } =
    getPaperDimensionsCm(resolved.paperSize, "portrait");
  const marginCm = Math.max(0, Math.min(resolved.marginCm, 10));
  const safeWidthCm = paperWidthCm - 2 * marginCm;
  const safeHeightCm = paperHeightCm - 2 * marginCm;

  if (safeWidthCm <= 0 || safeHeightCm <= 0) {
    toast("Margens inválidas: a área útil ficou negativa.", "error");
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

  const tiles: Array<{ tileX: number; tileY: number; row: number; col: number }> = [];
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

      tiles.push({ tileX, tileY, row, col });
    }
  }

  const totalPages = tiles.length;
  if (totalPages === 0) {
    toast("Nada para exportar com os filtros selecionados.", "error");
    return;
  }

  const pdf = new jsPDF({
    orientation: resolved.orientation,
    unit: "cm",
    format: [pageFormatWidthCm, pageFormatHeightCm],
  });

  let pageNum = 0;
  for (const { tileX, tileY, row, col } of tiles) {
    // Yield between pages so the UI can repaint (spinner, etc.) during long exports.
    // setTimeout(0) is enough to release the main thread briefly.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
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
      if (figure.tool === "text") {
        const value = (figure.textValue ?? "").toString();
        if (!value.trim()) return;

        const fontSize = (() => {
          const v = figure.textFontSizePx;
          if (!Number.isFinite(v ?? NaN)) return 18;
          return Math.max(6, Math.min(300, v as number));
        })();
        const lineHeight = (() => {
          const v = figure.textLineHeight;
          if (!Number.isFinite(v ?? NaN)) return 1.25;
          return Math.max(0.8, Math.min(3, v as number));
        })();
        const width =
          Number.isFinite(figure.textWidthPx ?? NaN) &&
          (figure.textWidthPx ?? 0) > 0
            ? (figure.textWidthPx as number)
            : undefined;

        const rawTextFill = figure.textFill ?? figure.stroke;
        const textFill = (() => {
          if (!rawTextFill) return "#000000";
          const s = rawTextFill.trim().toLowerCase();
          if (s === "aci7" || s === "#000" || s === "#000000") return "#000000";
          return rawTextFill;
        })();

        const padding = (() => {
          const v = figure.textPaddingPx;
          if (!Number.isFinite(v ?? NaN)) return 0;
          return Math.max(0, Math.min(50, v as number));
        })();

        const bgEnabled = figure.textBackgroundEnabled === true;
        const bgFill = figure.textBackgroundFill ?? "#ffffff";
        const bgOpacity = (() => {
          const v = figure.textBackgroundOpacity;
          if (!Number.isFinite(v ?? NaN)) return 1;
          return Math.max(0, Math.min(1, v as number));
        })();

        if (bgEnabled) {
          const approxCharWidth = fontSize * 0.62;
          const longest = value
            .split("\n")
            .reduce((m, l) => Math.max(m, l.length), 0);
          const wLocal =
            (width ?? Math.max(12, longest * approxCharWidth)) + padding * 2;
          const hLocal =
            Math.max(1, value.split("\n").length) * fontSize * lineHeight +
            padding * 2;

          tileLayer.add(
            new Konva.Rect({
              x: figure.x - tileX - padding,
              y: figure.y - tileY - padding,
              width: wLocal,
              height: hLocal,
              fill: bgFill,
              opacity: (figure.opacity ?? 1) * bgOpacity,
              rotation: figure.rotation || 0,
              listening: false,
              name: "inaa-text-bg",
            })
          );
        }

        tileLayer.add(
          new Konva.Text({
            x: figure.x - tileX,
            y: figure.y - tileY,
            text: value,
            fontSize,
            fontFamily:
              figure.textFontFamily ??
              "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
            fill: textFill,
            opacity: figure.opacity ?? 1,
            rotation: figure.rotation || 0,
            align: figure.textAlign ?? "left",
            lineHeight,
            letterSpacing: figure.textLetterSpacing ?? 0,
            width,
            wrap: width ? (figure.textWrap ?? "word") : "none",
            listening: false,
            name: "inaa-text",
          })
        );
        return;
      }

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
          dash: figure.dash,
          lineCap: "round",
          lineJoin: "round",
          perfectDrawEnabled: false,
          shadowForStrokeEnabled: false,
          listening: false,
        })
      );

      // Dart/Pence overlays (non-destructive): base dashed on contour + legs + height.
      const darts = figure.darts ?? [];
      if (resolved.toolFilter.dart !== false && darts.length) {
        const strokeWidth = figure.strokeWidth || 1;
        const dash = [12, 6];
        for (const dart of darts) {
          const aNode = figure.nodes.find((n) => n.id === dart.aNodeId);
          const bNode = figure.nodes.find((n) => n.id === dart.bNodeId);
          const cNode = figure.nodes.find((n) => n.id === dart.cNodeId);
          if (!aNode || !bNode || !cNode) continue;

          const aWorld = figureLocalToWorld(figure, { x: aNode.x, y: aNode.y });
          const bWorld = figureLocalToWorld(figure, { x: bNode.x, y: bNode.y });
          const cWorld = figureLocalToWorld(figure, { x: cNode.x, y: cNode.y });

          const baseWorld =
            computeDartBaseWorldPolyline(figure, dart.aNodeId, dart.bNodeId) ??
            [aWorld, bWorld];
          const baseShifted: number[] = [];
          for (const p of baseWorld) baseShifted.push(p.x - tileX, p.y - tileY);

          // Mask the underlying solid contour in this segment, then draw dashed.
          tileLayer.add(
            new Konva.Line({
              points: baseShifted,
              stroke: "#ffffff",
              strokeWidth: strokeWidth + 4,
              closed: false,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
              listening: false,
              name: "inaa-dart-base-mask",
              perfectDrawEnabled: false,
              shadowForStrokeEnabled: false,
            })
          );
          tileLayer.add(
            new Konva.Line({
              points: baseShifted,
              stroke: "#000000",
              strokeWidth,
              closed: false,
              opacity: 1,
              dash,
              lineCap: "round",
              lineJoin: "round",
              listening: false,
              name: "inaa-dart-base",
              perfectDrawEnabled: false,
              shadowForStrokeEnabled: false,
            })
          );

          // Legs
          tileLayer.add(
            new Konva.Line({
              points: [
                aWorld.x - tileX,
                aWorld.y - tileY,
                cWorld.x - tileX,
                cWorld.y - tileY,
              ],
              stroke: "#000000",
              strokeWidth: Math.max(1, strokeWidth * 0.9),
              closed: false,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
              listening: false,
              name: "inaa-dart-leg-a",
              perfectDrawEnabled: false,
              shadowForStrokeEnabled: false,
            })
          );
          tileLayer.add(
            new Konva.Line({
              points: [
                bWorld.x - tileX,
                bWorld.y - tileY,
                cWorld.x - tileX,
                cWorld.y - tileY,
              ],
              stroke: "#000000",
              strokeWidth: Math.max(1, strokeWidth * 0.9),
              closed: false,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
              listening: false,
              name: "inaa-dart-leg-b",
              perfectDrawEnabled: false,
              shadowForStrokeEnabled: false,
            })
          );

          // Height (midpoint to apex)
          const midWorld = lerp(aWorld, bWorld, 0.5);
          tileLayer.add(
            new Konva.Line({
              points: [
                midWorld.x - tileX,
                midWorld.y - tileY,
                cWorld.x - tileX,
                cWorld.y - tileY,
              ],
              stroke: "#000000",
              strokeWidth: Math.max(1, strokeWidth * 0.85),
              closed: false,
              opacity: 0.95,
              dash,
              lineCap: "round",
              lineJoin: "round",
              listening: false,
              name: "inaa-dart-height",
              perfectDrawEnabled: false,
              shadowForStrokeEnabled: false,
            })
          );

          // Height label

          if (shouldIncludeMeasures) {
            // AB label (chord)
            const abPx = dist(aWorld, bWorld);
            const abLabel = formatCm(pxToCm(abPx), 2);
            const abTangent = sub(bWorld, aWorld);
            const abNormal = norm(perp(abTangent));
            const abP = add(lerp(aWorld, bWorld, 0.5), mul(abNormal, 12));
            const abRawAngleDeg =
              (Math.atan2(abTangent.y, abTangent.x) * 180) / Math.PI;
            const abAngleDeg = normalizeUprightAngleDeg(abRawAngleDeg);
            const abFontSize = 14;
            const abApproxWidth = Math.max(
              60,
              abLabel.length * abFontSize * 0.62
            );

            tileLayer.add(
              new Konva.Text({
                x: abP.x - tileX,
                y: abP.y - tileY,
                text: abLabel,
                fontSize: abFontSize,
                fontStyle: "bold",
                fill: "#000000",
                opacity: 0.75,
                rotation: abAngleDeg,
                width: abApproxWidth,
                align: "center",
                offsetX: abApproxWidth / 2,
                offsetY: abFontSize / 2,
                listening: false,
                name: "inaa-dart-ab-label",
              })
            );

            // Height label
            const heightPx = dist(midWorld, cWorld);
            const label = formatCm(pxToCm(heightPx), 2);
            const tangent = sub(cWorld, midWorld);
            const normal = norm(perp(tangent));
            const p = add(lerp(midWorld, cWorld, 0.5), mul(normal, 12));
            const rawAngleDeg =
              (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
            const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);
            const fontSize = 14;
            const approxWidth = Math.max(60, label.length * fontSize * 0.62);

            tileLayer.add(
              new Konva.Text({
                x: p.x - tileX,
                y: p.y - tileY,
                text: label,
                fontSize,
                fontStyle: "bold",
                fill: "#000000",
                opacity: 0.85,
                rotation: angleDeg,
                width: approxWidth,
                align: "center",
                offsetX: approxWidth / 2,
                offsetY: fontSize / 2,
                listening: false,
                name: "inaa-dart-height-label",
              })
            );
          }
        }
      }

      // Piques (notches)
      const piques = figure.piques ?? [];
      if (shouldIncludePiques && figure.closed && piques.length) {
        for (const pk of piques) {
          const seg = computePiqueSegmentWorld(figure, pk);
          if (!seg) continue;
          tileLayer.add(
            new Konva.Line({
              points: [
                seg.aWorld.x - tileX,
                seg.aWorld.y - tileY,
                seg.bWorld.x - tileX,
                seg.bWorld.y - tileY,
              ],
              stroke: "#000000",
              strokeWidth: Math.max(1, (figure.strokeWidth || 1) * 0.9),
              closed: false,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
              listening: false,
              name: "inaa-pique",
            })
          );
        }
      }

      if (shouldIncludeMeasures) {
        // Seam allowance figures can contain many small edges (especially offset circles
        // approximated as polylines). Rendering per-edge length labels for them creates
        // dozens of overlapping labels and looks like a blurred/dragged stroke in print.
        // Seam figures already get a dedicated "Margem de Costura" label (below).
        const isSeam = figure.kind === "seam";

        if (!isSeam) {
          // Edge length labels (matches MeasureOverlay intent; no hover/selection UI)
          const fontSize = 11;
          const textWidth = 120;

          for (const edge of figure.edges) {
            const layout = computeEdgeMeasureLayoutWorld(figure, edge.id);
            if (!layout) continue;

            const fallbackLen = edgeWorldLengthFallbackPx(figure, edge.id);
            const lengthPx = safeEdgeLengthPx(figure, edge.id, fallbackLen);
            const label = formatCm(pxToCm(lengthPx), 2);

            if (layout.isShortEdge) {
              tileLayer.add(
                new Konva.Line({
                  points: [
                    layout.midWorld.x - tileX,
                    layout.midWorld.y - tileY,
                    layout.posWorld.x - tileX,
                    layout.posWorld.y - tileY,
                  ],
                  stroke: "#000000",
                  strokeWidth: 1,
                  dash: [4, 4],
                  opacity: 0.5,
                  listening: false,
                  lineCap: "round",
                  name: "inaa-measure-leader",
                  perfectDrawEnabled: false,
                  shadowForStrokeEnabled: false,
                })
              );
            }

            tileLayer.add(
              new Konva.Text({
                x: layout.posWorld.x - tileX,
                y: layout.posWorld.y - tileY,
                text: label,
                fontSize,
                fill: "#000000",
                opacity: 0.75,
                rotation: layout.angleDeg,
                width: textWidth,
                align: "center",
                offsetX: textWidth / 2,
                offsetY: fontSize / 2,
                listening: false,
                name: "inaa-measure-label",
              })
            );
          }

          // Circle summary block (radius/circumference)
          if (figure.tool === "circle" && figure.measures?.circle) {
            const c = figure.measures.circle;
            const isCircle = c.radiusPx != null;
            const lines: string[] = [];
            if (isCircle && c.radiusPx != null) {
              lines.push(`Raio: ${formatCm(pxToCm(c.radiusPx), 2)}`);
              lines.push(`Circ.: ${formatCm(pxToCm(c.circumferencePx), 2)}`);
            } else {
              lines.push(`Raio X: ${formatCm(pxToCm(c.rxPx), 2)}`);
              lines.push(`Raio Y: ${formatCm(pxToCm(c.ryPx), 2)}`);
              lines.push(
                `Circ. (aprox.): ${formatCm(pxToCm(c.circumferencePx), 2)}`
              );
            }

            const centroidWorld = figureLocalToWorld(
              figure,
              figureCentroidLocal(figure)
            );
            const text = lines.join("\n");

            tileLayer.add(
              new Konva.Text({
                x: centroidWorld.x - tileX,
                y: centroidWorld.y - tileY - (13 * lines.length) / 2,
                text,
                fontSize,
                lineHeight: 1.15,
                fill: "#000000",
                opacity: 0.75,
                width: 150,
                align: "center",
                offsetX: 150 / 2,
                listening: false,
                name: "inaa-measure-label",
              })
            );
          }
        }

        // Seam allowance labels ("Margem de Costura")
        if (figure.kind === "seam") {
          const fontSize = 11;
          const textWidth = 240;
          const centroidWorld = figureLocalToWorld(
            figure,
            figureCentroidLocal(figure)
          );

          const addSeamLabel = (posWorld: Vec2, angleDeg: number, text: string) => {
            tileLayer.add(
              new Konva.Text({
                x: posWorld.x - tileX,
                y: posWorld.y - tileY,
                text,
                fontSize,
                fill: "#000000",
                opacity: 0.75,
                rotation: angleDeg,
                width: textWidth,
                align: "center",
                offsetX: textWidth / 2,
                offsetY: fontSize / 2,
                listening: false,
                name: "inaa-seam-label",
              })
            );
          };

          const OFFSET_PX = 10;

          if (typeof figure.offsetCm === "number" && Number.isFinite(figure.offsetCm)) {
            // Place label near longest segment (or topmost tangent for circles).
            const flat = figureWorldPolyline(figure, 60);
            const pts: Vec2[] = [];
            for (let i = 0; i < flat.length; i += 2) {
              pts.push({ x: flat[i]!, y: flat[i + 1]! });
            }
            if (pts.length >= 2 && dist(pts[0]!, pts[pts.length - 1]!) < 1e-6) {
              pts.pop();
            }

            if (pts.length >= 2) {
              const label = `Margem de Costura: ${formatSeamLabelCm(figure.offsetCm)}`;

              if (figure.tool === "circle") {
                let bestIndex = 0;
                let bestY = pts[0]!.y;
                for (let i = 1; i < pts.length; i++) {
                  if (pts[i]!.y < bestY) {
                    bestY = pts[i]!.y;
                    bestIndex = i;
                  }
                }

                const prev = pts[(bestIndex - 1 + pts.length) % pts.length]!;
                const next = pts[(bestIndex + 1) % pts.length]!;
                const mid = pts[bestIndex]!;
                const tangent = sub(next, prev);
                const n = norm(perp(tangent));

                const p1 = add(mid, mul(n, OFFSET_PX));
                const p2 = add(mid, mul(n, -OFFSET_PX));
                const p = dist(p1, centroidWorld) >= dist(p2, centroidWorld) ? p1 : p2;
                const rawAngleDeg = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
                const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

                addSeamLabel(p, angleDeg, label);
              } else {
                const longest = findLongestSegmentWorld(pts, figure.closed);
                if (longest.a && longest.b && longest.len > 1e-6) {
                  const mid = lerp(longest.a, longest.b, 0.5);
                  const tangent = sub(longest.b, longest.a);
                  const n = norm(perp(tangent));
                  const p1 = add(mid, mul(n, OFFSET_PX));
                  const p2 = add(mid, mul(n, -OFFSET_PX));
                  const p = dist(p1, centroidWorld) >= dist(p2, centroidWorld) ? p1 : p2;
                  const rawAngleDeg =
                    (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
                  const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);
                  addSeamLabel(p, angleDeg, label);
                }
              }
            }
          } else if (
            figure.tool !== "circle" &&
            figure.seamSegments?.length &&
            figure.seamSegmentEdgeIds?.length &&
            figure.offsetCm &&
            typeof figure.offsetCm === "object"
          ) {
            // Per-edge seam labels.
            for (let index = 0; index < figure.seamSegments.length; index++) {
              const segment = figure.seamSegments[index];
              const edgeId = figure.seamSegmentEdgeIds[index];
              if (!edgeId || !segment) continue;

              const value = (figure.offsetCm as Record<string, number>)[edgeId];
              if (!Number.isFinite(value ?? NaN)) continue;

              const pts: Vec2[] = [];
              for (let i = 0; i < segment.length; i += 2) {
                const local = { x: segment[i]!, y: segment[i + 1]! };
                pts.push(figureLocalToWorld(figure, local));
              }
              if (pts.length < 2) continue;

              const longest = findLongestSegmentWorld(pts, false);
              if (!longest.a || !longest.b || longest.len <= 1e-6) continue;

              const mid = lerp(longest.a, longest.b, 0.5);
              const tangent = sub(longest.b, longest.a);
              const n = norm(perp(tangent));
              const p1 = add(mid, mul(n, OFFSET_PX));
              const p2 = add(mid, mul(n, -OFFSET_PX));
              const p = dist(p1, centroidWorld) >= dist(p2, centroidWorld) ? p1 : p2;
              const rawAngleDeg =
                (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
              const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);
              const label = `Margem de Costura: ${formatSeamLabelCm(value as number)}`;

              addSeamLabel(p, angleDeg, label);
            }
          }
        }
      }

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

      const figureName = (figure.name ?? "").trim();
      if (shouldIncludePatternName && figureName) {
        const layout = computeFigureNameLayoutLocal(figure, figureName);
        if (layout) {
          const worldPos = figureLocalToWorld(figure, layout.posLocal);
          const extraRot = figure.nameRotationDeg || 0;
          tileLayer.add(
            new Konva.Text({
              x: worldPos.x - tileX,
              y: worldPos.y - tileY,
              text: figureName,
              fontSize: layout.fontSize,
              fontStyle: "bold",
              fill: "#000000",
              opacity: 0.22,
              wrap: "none",
              rotation: (figure.rotation || 0) + extraRot,
              width: layout.width,
              align: "center",
              offsetX: layout.width / 2,
              offsetY: layout.fontSize / 2,
              listening: false,
              name: "inaa-figure-name",
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

    if (pageNum > 1) {
      pdf.addPage([pageFormatWidthCm, pageFormatHeightCm], resolved.orientation);
    }

    // Page guide lines (paper border + margin rectangle)
    if (resolved.showPageGuides) {
      pdf.setDrawColor(140, 140, 140);
      pdf.setLineWidth(0.03);

      // Outer paper border.
      pdf.rect(0, 0, paperWidthCm, paperHeightCm, "S");

      // Inner margin guide (useful area).
      if (marginCm > 0) {
        // Slightly darker inner guide.
        pdf.setDrawColor(110, 110, 110);
        pdf.setLineWidth(0.03);
        pdf.rect(marginCm, marginCm, safeWidthCm, safeHeightCm, "S");
      }
    }
    pdf.addImage(dataURL, "PNG", marginCm, marginCm, safeWidthCm, safeHeightCm);

    // Page assembly guide (top-right, in the paper margin): row/col coordinate + page N/T.
    // Drawn on the PDF (outside the tiled image) so it never overlaps the pattern.
    {
      const line = row + 1;
      const column = col + 1;
      const label = `L${line} C${column} · Pág. ${pageNum}/${totalPages}`;

      // Place it in the top-right margin area.
      const xCm = Math.max(0.1, paperWidthCm - 0.3);
      const yCm = Math.max(0.35, Math.min(marginCm - 0.2, 0.8));

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(30, 30, 30);
      pdf.text(label, xCm, yCm, { align: "right" });
    }
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

  const shouldIncludeMeasures = options?.includeMeasures !== false;
  const shouldIncludePatternName = options?.includePatternName !== false;
  const shouldIncludePiques = options?.includePiques !== false;

  const shouldIncludePointLabels =
    options?.includePointLabels === true &&
    options.pointLabelsMode &&
    options.pointLabelsMode !== "off";
  const nodeLabelsByFigureId = shouldIncludePointLabels
    ? computeNodeLabels(filtered, options!.pointLabelsMode!)
    : new Map<string, Record<string, string>>();

  if (filtered.length === 0) {
    toast("Não há nada para exportar. Desenhe algo primeiro.", "error");
    return;
  }

  const bbox = calculateFiguresBoundingBox(filtered);
  if (!bbox) {
    toast("Erro ao calcular a área de desenho.", "error");
    return;
  }

  const padding = 10;
  const viewBox = {
    x: bbox.x - padding,
    y: bbox.y - padding,
    width: bbox.width + 2 * padding,
    height: bbox.height + 2 * padding,
  };

  const dashArray = null;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" `;
  svg += `viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" `;
  svg += `width="${viewBox.width}px" height="${viewBox.height}px">\n`;

  for (const fig of filtered) {
    if (fig.tool === "text") {
      const value = (fig.textValue ?? "").toString();
      if (value.trim()) {
        const fontSize = (() => {
          const v = fig.textFontSizePx;
          if (!Number.isFinite(v ?? NaN)) return 18;
          return Math.max(6, Math.min(300, v as number));
        })();
        const lineHeight = (() => {
          const v = fig.textLineHeight;
          if (!Number.isFinite(v ?? NaN)) return 1.25;
          return Math.max(0.8, Math.min(3, v as number));
        })();
        const align = fig.textAlign ?? "left";
        const anchor =
          align === "center" ? "middle" : align === "right" ? "end" : "start";
        const x = fig.x;
        const y = fig.y;
        const rot = fig.rotation || 0;
        const fontFamily = (fig.textFontFamily ?? "sans-serif").replace(
          /"/g,
          "&quot;"
        );

        const textFill = (fig.textFill ?? "#000").replace(/"/g, "&quot;");
        const paddingPx = (() => {
          const v = fig.textPaddingPx;
          if (!Number.isFinite(v ?? NaN)) return 0;
          return Math.max(0, Math.min(50, v as number));
        })();
        const bgEnabled = fig.textBackgroundEnabled === true;
        const bgFill = (fig.textBackgroundFill ?? "#ffffff").replace(
          /"/g,
          "&quot;"
        );
        const bgOpacity = (() => {
          const v = fig.textBackgroundOpacity;
          if (!Number.isFinite(v ?? NaN)) return 1;
          return Math.max(0, Math.min(1, v as number));
        })();

        // Escape basic XML entities; preserve newlines using <tspan>.
        const escaped = value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const parts = escaped.split("\n");

        if (bgEnabled) {
          const approxCharWidth = fontSize * 0.62;
          const longest = value
            .split("\n")
            .reduce((m, l) => Math.max(m, l.length), 0);
          const widthLocal =
            ((Number.isFinite(fig.textWidthPx ?? NaN) &&
            (fig.textWidthPx ?? 0) > 0
              ? (fig.textWidthPx as number)
              : Math.max(12, longest * approxCharWidth)) as number) +
            paddingPx * 2;
          const heightLocal =
            Math.max(1, value.split("\n").length) * fontSize * lineHeight +
            paddingPx * 2;

          svg += `  <g class="inaa-text-group"`;
          if (rot) svg += ` transform="rotate(${rot} ${x} ${y})"`;
          svg += `>\n`;
          svg += `    <rect x="${x - paddingPx}" y="${y - paddingPx}" width="${widthLocal}" height="${heightLocal}"`;
          svg += ` fill="${bgFill}" fill-opacity="${(fig.opacity ?? 1) * bgOpacity}" />\n`;
        }

        svg += bgEnabled ? `    ` : `  `;
        svg += `<text class="inaa-text" x="${x}" y="${y}"`;
        svg += ` font-family="${fontFamily}" font-size="${fontSize}"`;
        svg += ` fill="${textFill}" fill-opacity="${fig.opacity ?? 1}"`;
        svg += ` text-anchor="${anchor}" dominant-baseline="hanging"`;
        svg += ` letter-spacing="${fig.textLetterSpacing ?? 0}"`;
        svg += ` style="white-space: pre;"`;
        if (rot && !bgEnabled) svg += ` transform="rotate(${rot} ${x} ${y})"`;
        svg += `>`;

        if (parts.length === 1) {
          svg += parts[0] ?? "";
        } else {
          for (let i = 0; i < parts.length; i++) {
            const dy = i === 0 ? 0 : fontSize * lineHeight;
            svg += `<tspan x="${x}" dy="${dy}">${parts[i] ?? ""}</tspan>`;
          }
        }

        svg += `</text>\n`;
        if (bgEnabled) svg += `  </g>\n`;
      }
      continue;
    }

    const points = figureWorldPolyline(fig, 120);
    const d = polylineToSvgPath(points, fig.closed);
    if (!d) continue;
    const strokeWidth = fig.strokeWidth ?? 1;

    svg += `  <path d="${d}" stroke="#000" stroke-width="${strokeWidth}" fill="none"`;
    if (dashArray) svg += ` stroke-dasharray="${dashArray}"`;
    svg += ` />\n`;

    // Dart/Pence overlays (vector): base dashed on contour + legs + height + height label.
    const darts = fig.darts ?? [];
    if (resolved.toolFilter.dart !== false && darts.length) {
      const dartDash = "12 6";
      for (const dart of darts) {
        const aNode = fig.nodes.find((n) => n.id === dart.aNodeId);
        const bNode = fig.nodes.find((n) => n.id === dart.bNodeId);
        const cNode = fig.nodes.find((n) => n.id === dart.cNodeId);
        if (!aNode || !bNode || !cNode) continue;

        const aWorld = figureLocalToWorld(fig, { x: aNode.x, y: aNode.y });
        const bWorld = figureLocalToWorld(fig, { x: bNode.x, y: bNode.y });
        const cWorld = figureLocalToWorld(fig, { x: cNode.x, y: cNode.y });

        const baseWorld =
          computeDartBaseWorldPolyline(fig, dart.aNodeId, dart.bNodeId) ??
          [aWorld, bWorld];
        const baseFlat: number[] = [];
        for (const p of baseWorld) baseFlat.push(p.x, p.y);
        const baseD = polylineToSvgPath(baseFlat, false);
        if (baseD) {
          // Mask the solid contour segment then draw it dashed.
          svg += `  <path d="${baseD}" stroke="#fff" stroke-width="${strokeWidth + 4}" fill="none" />\n`;
          svg += `  <path d="${baseD}" stroke="#000" stroke-width="${strokeWidth}" fill="none" stroke-dasharray="${dartDash}" />\n`;
        }

        // Legs
        svg += `  <line x1="${aWorld.x}" y1="${aWorld.y}" x2="${cWorld.x}" y2="${cWorld.y}" stroke="#000" stroke-width="${Math.max(1, strokeWidth * 0.9)}" />\n`;
        svg += `  <line x1="${bWorld.x}" y1="${bWorld.y}" x2="${cWorld.x}" y2="${cWorld.y}" stroke="#000" stroke-width="${Math.max(1, strokeWidth * 0.9)}" />\n`;

        // Height
        const midWorld = lerp(aWorld, bWorld, 0.5);
        svg += `  <line x1="${midWorld.x}" y1="${midWorld.y}" x2="${cWorld.x}" y2="${cWorld.y}" stroke="#000" stroke-width="${Math.max(1, strokeWidth * 0.85)}" stroke-dasharray="${dartDash}" />\n`;

        if (shouldIncludeMeasures) {
          // AB label (chord)
          const abPx = dist(aWorld, bWorld);
          const abLabel = formatCm(pxToCm(abPx), 2);
          const abTangent = sub(bWorld, aWorld);
          const abNormal = norm(perp(abTangent));
          const abPos = add(lerp(aWorld, bWorld, 0.5), mul(abNormal, 12));
          const abRawAngleDeg =
            (Math.atan2(abTangent.y, abTangent.x) * 180) / Math.PI;
          const abAngleDeg = normalizeUprightAngleDeg(abRawAngleDeg);

          const abEscaped = abLabel
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

          svg += `  <text class="inaa-dart-ab-label" x="${abPos.x}" y="${abPos.y}"`;
          svg += ` font-family="sans-serif" font-size="14" font-weight="700"`;
          svg += ` fill="#000" fill-opacity="0.75" text-anchor="middle" dominant-baseline="middle"`;
          svg += ` transform="rotate(${abAngleDeg} ${abPos.x} ${abPos.y})"`;
          svg += `>${abEscaped}</text>\n`;

          // Height label
          const heightPx = dist(midWorld, cWorld);
          const label = formatCm(pxToCm(heightPx), 2);
          const tangent = sub(cWorld, midWorld);
          const normal = norm(perp(tangent));
          const pos = add(lerp(midWorld, cWorld, 0.5), mul(normal, 12));
          const rawAngleDeg =
            (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
          const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

          const escaped = label
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

          svg += `  <text class="inaa-dart-height-label" x="${pos.x}" y="${pos.y}"`;
          svg += ` font-family="sans-serif" font-size="14" font-weight="700"`;
          svg += ` fill="#000" fill-opacity="0.85" text-anchor="middle" dominant-baseline="middle"`;
          svg += ` transform="rotate(${angleDeg} ${pos.x} ${pos.y})"`;
          svg += `>${escaped}</text>\n`;
        }
      }
    }

    // Piques (notches)
    const piques = fig.piques ?? [];
    if (shouldIncludePiques && fig.closed && piques.length) {
      for (const pk of piques) {
        const seg = computePiqueSegmentWorld(fig, pk);
        if (!seg) continue;
        svg += `  <line class="inaa-pique" x1="${seg.aWorld.x}" y1="${seg.aWorld.y}" x2="${seg.bWorld.x}" y2="${seg.bWorld.y}" stroke="#000" stroke-width="${Math.max(
          1,
          (fig.strokeWidth || 1) * 0.9
        )}" stroke-linecap="round" />\n`;
      }
    }

    if (shouldIncludeMeasures) {
      // Edge length labels (vector)
      const fontSize = 11;
      for (const edge of fig.edges) {
        const layout = computeEdgeMeasureLayoutWorld(fig, edge.id);
        if (!layout) continue;

        const fallbackLen = edgeWorldLengthFallbackPx(fig, edge.id);
        const lengthPx = safeEdgeLengthPx(fig, edge.id, fallbackLen);
        const label = formatCm(pxToCm(lengthPx), 2);
        const escaped = label
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        if (layout.isShortEdge) {
          svg += `  <line class="inaa-measure-leader" x1="${layout.midWorld.x}" y1="${layout.midWorld.y}" x2="${layout.posWorld.x}" y2="${layout.posWorld.y}" stroke="#000" stroke-width="1" stroke-dasharray="4 4" stroke-opacity="0.5" />\n`;
        }

        svg += `  <text class="inaa-measure-label" x="${layout.posWorld.x}" y="${layout.posWorld.y}"`;
        svg += ` font-family="sans-serif" font-size="${fontSize}"`;
        svg += ` fill="#000" fill-opacity="0.75" text-anchor="middle" dominant-baseline="middle"`;
        svg += ` transform="rotate(${layout.angleDeg} ${layout.posWorld.x} ${layout.posWorld.y})"`;
        svg += `>${escaped}</text>\n`;
      }

      // Circle summary block
      if (fig.tool === "circle" && fig.measures?.circle) {
        const c = fig.measures.circle;
        const isCircle = c.radiusPx != null;
        const lines: string[] = [];
        if (isCircle && c.radiusPx != null) {
          lines.push(`Raio: ${formatCm(pxToCm(c.radiusPx), 2)}`);
          lines.push(`Circ.: ${formatCm(pxToCm(c.circumferencePx), 2)}`);
        } else {
          lines.push(`Raio X: ${formatCm(pxToCm(c.rxPx), 2)}`);
          lines.push(`Raio Y: ${formatCm(pxToCm(c.ryPx), 2)}`);
          lines.push(
            `Circ. (aprox.): ${formatCm(pxToCm(c.circumferencePx), 2)}`
          );
        }

        const centroidWorld = figureLocalToWorld(fig, figureCentroidLocal(fig));
        const escapedLines = lines.map((line) =>
          line
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
        );

        svg += `  <text class="inaa-measure-label" x="${centroidWorld.x}" y="${centroidWorld.y}"`;
        svg += ` font-family="sans-serif" font-size="${fontSize}"`;
        svg += ` fill="#000" fill-opacity="0.75" text-anchor="middle" dominant-baseline="middle"`;
        svg += `>`;

        if (escapedLines.length === 1) {
          svg += escapedLines[0] ?? "";
        } else {
          for (let i = 0; i < escapedLines.length; i++) {
            const dy = i === 0 ? 0 : fontSize * 1.15;
            svg += `<tspan x="${centroidWorld.x}" dy="${dy}">${escapedLines[i] ?? ""}</tspan>`;
          }
        }

        svg += `</text>\n`;
      }

      // Seam allowance labels ("Margem de Costura")
      if (fig.kind === "seam") {
        const centroidWorld = figureLocalToWorld(fig, figureCentroidLocal(fig));
        const OFFSET_PX = 10;

        const addSeamLabel = (pos: Vec2, angleDeg: number, text: string) => {
          const escaped = escapeXml(text);
          svg += `  <text class="inaa-seam-label" x="${pos.x}" y="${pos.y}"`;
          svg += ` font-family="sans-serif" font-size="${fontSize}"`;
          svg += ` fill="#000" fill-opacity="0.75" text-anchor="middle" dominant-baseline="middle"`;
          svg += ` transform="rotate(${angleDeg} ${pos.x} ${pos.y})"`;
          svg += `>${escaped}</text>\n`;
        };

        if (typeof fig.offsetCm === "number" && Number.isFinite(fig.offsetCm)) {
          const flat = figureWorldPolyline(fig, 60);
          const pts: Vec2[] = [];
          for (let i = 0; i < flat.length; i += 2) {
            pts.push({ x: flat[i]!, y: flat[i + 1]! });
          }
          if (pts.length >= 2 && dist(pts[0]!, pts[pts.length - 1]!) < 1e-6) {
            pts.pop();
          }

          if (pts.length >= 2) {
            const label = `Margem de Costura: ${formatSeamLabelCm(fig.offsetCm)}`;

            if (fig.tool === "circle") {
              let bestIndex = 0;
              let bestY = pts[0]!.y;
              for (let i = 1; i < pts.length; i++) {
                if (pts[i]!.y < bestY) {
                  bestY = pts[i]!.y;
                  bestIndex = i;
                }
              }

              const prev = pts[(bestIndex - 1 + pts.length) % pts.length]!;
              const next = pts[(bestIndex + 1) % pts.length]!;
              const mid = pts[bestIndex]!;
              const tangent = sub(next, prev);
              const n = norm(perp(tangent));

              const p1 = add(mid, mul(n, OFFSET_PX));
              const p2 = add(mid, mul(n, -OFFSET_PX));
              const p =
                dist(p1, centroidWorld) >= dist(p2, centroidWorld) ? p1 : p2;
              const rawAngleDeg =
                (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
              const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);

              addSeamLabel(p, angleDeg, label);
            } else {
              const longest = findLongestSegmentWorld(pts, fig.closed);
              if (longest.a && longest.b && longest.len > 1e-6) {
                const mid = lerp(longest.a, longest.b, 0.5);
                const tangent = sub(longest.b, longest.a);
                const n = norm(perp(tangent));
                const p1 = add(mid, mul(n, OFFSET_PX));
                const p2 = add(mid, mul(n, -OFFSET_PX));
                const p =
                  dist(p1, centroidWorld) >= dist(p2, centroidWorld)
                    ? p1
                    : p2;
                const rawAngleDeg =
                  (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
                const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);
                addSeamLabel(p, angleDeg, label);
              }
            }
          }
        } else if (
          fig.tool !== "circle" &&
          fig.seamSegments?.length &&
          fig.seamSegmentEdgeIds?.length &&
          fig.offsetCm &&
          typeof fig.offsetCm === "object"
        ) {
          for (let index = 0; index < fig.seamSegments.length; index++) {
            const segment = fig.seamSegments[index];
            const edgeId = fig.seamSegmentEdgeIds[index];
            if (!edgeId || !segment) continue;

            const value = (fig.offsetCm as Record<string, number>)[edgeId];
            if (!Number.isFinite(value ?? NaN)) continue;

            const pts: Vec2[] = [];
            for (let i = 0; i < segment.length; i += 2) {
              const local = { x: segment[i]!, y: segment[i + 1]! };
              pts.push(figureLocalToWorld(fig, local));
            }
            if (pts.length < 2) continue;

            const longest = findLongestSegmentWorld(pts, false);
            if (!longest.a || !longest.b || longest.len <= 1e-6) continue;

            const mid = lerp(longest.a, longest.b, 0.5);
            const tangent = sub(longest.b, longest.a);
            const n = norm(perp(tangent));
            const p1 = add(mid, mul(n, OFFSET_PX));
            const p2 = add(mid, mul(n, -OFFSET_PX));
            const p =
              dist(p1, centroidWorld) >= dist(p2, centroidWorld) ? p1 : p2;
            const rawAngleDeg =
              (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
            const angleDeg = normalizeUprightAngleDeg(rawAngleDeg);
            const label = `Margem de Costura: ${formatSeamLabelCm(value as number)}`;

            addSeamLabel(p, angleDeg, label);
          }
        }

      }
    }

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

    const figName = (fig.name ?? "").trim();
    if (shouldIncludePatternName && figName) {
      const layout = computeFigureNameLayoutLocal(fig, figName);
      if (layout) {
        const worldPos = figureLocalToWorld(fig, layout.posLocal);
        const rot = (fig.rotation || 0) + (fig.nameRotationDeg || 0);
        svg += `  <text class="inaa-figure-name" x="${worldPos.x}" y="${worldPos.y}"`;
        svg += ` font-family="sans-serif" font-size="${layout.fontSize}" font-weight="700"`;
        svg += ` fill="#000" fill-opacity="0.22" text-anchor="middle" dominant-baseline="middle"`;
        if (rot) {
          svg += ` transform="rotate(${rot} ${worldPos.x} ${worldPos.y})"`;
        }
        svg += `>${figName}</text>\n`;
      }
    }
  }

  svg += `</svg>`;

  downloadBlob(
    new Blob([svg], { type: "image/svg+xml" }),
    `inaa-pattern-${new Date().getTime()}.svg`
  );
}
