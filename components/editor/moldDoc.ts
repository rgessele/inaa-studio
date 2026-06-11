import type { Figure } from "./types";
import { figureCentroidLocal, figureLocalBounds } from "./figurePath";
import { rotate, mul, add, sub, type Vec2 } from "./figureGeometry";

/**
 * Shared, pure layout for the documentation a mold (`kind === "mold"`) shows on
 * the canvas and in PDF/print export. Keeping the geometry/text in one place
 * ensures the on-canvas (FigureRenderer) and exported (export.ts) drawings stay
 * in sync — the two pipelines draw independently with fresh Konva nodes.
 *
 * All coordinates are in the figure's LOCAL space. The caller applies the
 * figure's own world transform (x/y/rotation/scale).
 *
 * Decisions (see docs/specs/mold-documentation-spec.md):
 * - Watermark style block, name on top (own font size), other filled fields
 *   below (shared docFontSizePx).
 * - `nameRotationDeg` rotates the whole TEXT block (not the grain arrow).
 * - Fio is shown ONLY as a single-headed arrow (no redundant text line).
 * - "Cortar na dobra" line drawn only when cutOnFold === true.
 * - Text lines are LEFT-aligned within the block (`textAlign`).
 * - The grain arrow parks to the LEFT of the text block, cleared by the
 *   block's circumradius so it never overlaps the texts at any
 *   nameRotationDeg, and never moves when only the texts rotate. It follows
 *   the block anchor (nameOffsetLocal), so dragging keeps them apart. With no
 *   text lines it stays centered on the centroid.
 * - `moldMeta.grainOffsetLocal` (set by dragging the arrow's handle) overrides
 *   the automatic parking: the arrow centers on centroid + offset and no
 *   longer follows the text block.
 * - The project-wide logo (DesignDataV2.meta.moldDocLogo) parks LEFT of the
 *   text lines (letterhead style), vertically centered, default height = text
 *   block height. It lives in BLOCK coordinates, so it rotates with the texts.
 *   Per-mold overrides: docImageOffsetLocal (center), docImageHeightLocal,
 *   docImageRotationDeg (relative to the block). The grain arrow's automatic
 *   parking clears the union of texts + logo.
 */

export const MOLD_DOC_NAME_DEFAULT_PX = 24;
export const MOLD_DOC_TEXT_DEFAULT_PX = 14;
const MOLD_DOC_LINE_HEIGHT = 1.25;
const MOLD_DOC_NOTES_MAX_LINES = 6;

function clampFont(v: number | undefined, fallback: number): number {
  if (!Number.isFinite(v ?? NaN)) return fallback;
  return Math.max(6, Math.min(256, v as number));
}

function estimateLineWidth(text: string, fontSizePx: number): number {
  return Math.max(12, text.length * fontSizePx * 0.62 + fontSizePx);
}

export interface MoldDocTextLine {
  key: string;
  text: string;
  fontSizePx: number;
  bold: boolean;
  /** Top y of the line's box, relative to the block's vertical center. */
  y: number;
  /** Box height (local px). For wrapped notes this spans several visual lines. */
  height: number;
  /** Whether to word-wrap (notes) or keep on a single line. */
  wrap: boolean;
}

export interface MoldGrainArrow {
  tail: Vec2;
  tip: Vec2;
  headA: Vec2;
  headB: Vec2;
  strokeWidth: number;
}

/** Project-wide logo image info needed by the layout (post-normalization). */
export interface MoldDocLogoInput {
  naturalWidth: number;
  naturalHeight: number;
}

export interface MoldDocLogoBox {
  /**
   * Logo CENTER in BLOCK coordinates (origin at the block anchor,
   * pre-rotation). The caller draws it inside the rotated block group.
   */
  center: Vec2;
  width: number;
  height: number;
  /** Additional rotation relative to the block (deg). */
  rotationDeg: number;
}

export interface MoldDocLayout {
  /** Block anchor in local coords (centroid + nameOffsetLocal). */
  anchor: Vec2;
  /** Rotation (deg) applied to the text block only. */
  rotationDeg: number;
  /** Uniform box width used to position every line on the anchor. */
  blockWidth: number;
  /** Total stacked height of all lines (box is centered on the anchor). */
  blockHeight: number;
  /** Horizontal alignment of the text inside each line's box. */
  textAlign: "left" | "center";
  lines: MoldDocTextLine[];
  /** Single-headed grain arrow in local coords, or null when fio unset. */
  grain: MoldGrainArrow | null;
  /** Project logo box in block coords, or null when no logo is attached. */
  logo: MoldDocLogoBox | null;
}

/**
 * Builds the documentation layout for a mold. Returns null when the figure is
 * not a mold or has nothing to draw (no filled fields, no grain line and no
 * project logo).
 */
export function computeMoldDocLayoutLocal(
  figure: Figure,
  logo?: MoldDocLogoInput | null
): MoldDocLayout | null {
  if (figure.kind !== "mold") return null;

  const meta = figure.moldMeta;
  const nameFont = clampFont(figure.nameFontSizePx, MOLD_DOC_NAME_DEFAULT_PX);
  const docFont = clampFont(meta?.docFontSizePx, MOLD_DOC_TEXT_DEFAULT_PX);

  // ---- Collect text lines (only filled fields) -------------------------------
  type Pending = { key: string; text: string; fontSizePx: number; bold: boolean; wrap: boolean };
  const pending: Pending[] = [];

  const name = (figure.name ?? "").trim();
  if (name) pending.push({ key: "name", text: name, fontSizePx: nameFont, bold: true, wrap: false });

  const baseSize = (meta?.baseSize ?? "").trim();
  if (baseSize)
    pending.push({
      key: "baseSize",
      text: `Tamanho: ${baseSize}`,
      fontSizePx: docFont,
      bold: false,
      wrap: false,
    });

  if (typeof meta?.cutQuantity === "number" && Number.isFinite(meta.cutQuantity))
    pending.push({
      key: "cutQuantity",
      text: `Quantidade: ${Math.max(1, Math.round(meta.cutQuantity))}`,
      fontSizePx: docFont,
      bold: false,
      wrap: false,
    });

  if (meta?.cutOnFold === true)
    pending.push({ key: "cutOnFold", text: "Cortar na dobra", fontSizePx: docFont, bold: false, wrap: false });

  // ---- Block width (uniform, for centering) ----------------------------------
  let maxSingleWidth = 0;
  for (const p of pending) maxSingleWidth = Math.max(maxSingleWidth, estimateLineWidth(p.text, p.fontSizePx));

  // Notes (wrapped, always last)
  let notesText = (meta?.notes ?? "").trim();
  let notesWrapWidth = 0;
  let notesHeight = 0;
  if (notesText) {
    notesWrapWidth = Math.max(maxSingleWidth, docFont * 12);
    const charsPerLine = Math.max(8, Math.round(notesWrapWidth / (docFont * 0.55)));
    let estLines = Math.max(1, Math.ceil(notesText.length / charsPerLine));
    if (estLines > MOLD_DOC_NOTES_MAX_LINES) {
      estLines = MOLD_DOC_NOTES_MAX_LINES;
      const maxChars = charsPerLine * MOLD_DOC_NOTES_MAX_LINES - 1;
      notesText = notesText.slice(0, Math.max(0, maxChars)).trimEnd() + "…";
    }
    notesHeight = estLines * docFont * MOLD_DOC_LINE_HEIGHT;
  }

  const blockWidth = Math.max(12, maxSingleWidth, notesWrapWidth);

  // ---- Stack vertically, centered on the anchor ------------------------------
  const singleHeights = pending.map((p) => p.fontSizePx * MOLD_DOC_LINE_HEIGHT);
  const totalHeight = singleHeights.reduce((a, b) => a + b, 0) + notesHeight;

  const lines: MoldDocTextLine[] = [];
  let cursor = -totalHeight / 2;
  pending.forEach((p, i) => {
    const h = singleHeights[i]!;
    lines.push({ key: p.key, text: p.text, fontSizePx: p.fontSizePx, bold: p.bold, y: cursor, height: h, wrap: false });
    cursor += h;
  });
  if (notesText) {
    lines.push({
      key: "notes",
      text: notesText,
      fontSizePx: docFont,
      bold: false,
      y: cursor,
      height: notesHeight,
      wrap: true,
    });
  }

  // ---- Project logo (letterhead style, left of the text lines) --------------
  const logoBox = computeLogoBox(figure, logo, blockWidth, totalHeight, docFont, lines.length > 0);

  // ---- Grain arrow (single-headed). 0° points up; rotates clockwise. ---------
  let grain = computeGrainArrow(figure);

  if (!lines.length && !grain && !logoBox) return null;

  const centroid = figureCentroidLocal(figure);
  const offset = figure.nameOffsetLocal ?? { x: 0, y: 0 };
  const anchor: Vec2 = { x: centroid.x + offset.x, y: centroid.y + offset.y };
  const rotationDeg = (((figure.nameRotationDeg ?? 0) % 360) + 360) % 360;

  // Position the arrow (computeGrainArrow returns it centered on the
  // centroid). A user-dragged offset wins; otherwise park it to the left of
  // the text block, cleared by the block's circumradius (rotation-invariant)
  // so it stays put — and stays clear of the texts — for any nameRotationDeg.
  const grainOffset = meta?.grainOffsetLocal;
  const hasGrainOffset =
    !!grainOffset &&
    Number.isFinite(grainOffset.x) &&
    Number.isFinite(grainOffset.y);
  if (grain && hasGrainOffset) {
    grain = shiftGrain(grain, grainOffset as Vec2);
  } else if (grain && (lines.length || logoBox)) {
    let maxXFromCenter = grain.strokeWidth / 2;
    for (const p of [grain.tail, grain.tip, grain.headA, grain.headB])
      maxXFromCenter = Math.max(maxXFromCenter, p.x - centroid.x + grain.strokeWidth / 2);
    // Clearance radius of the whole block unit (texts ∪ logo) around the
    // anchor — rotation-invariant for both the block and the logo rotation.
    let unionRadius = Math.hypot(blockWidth, totalHeight) / 2;
    if (logoBox) {
      const logoReach =
        Math.hypot(logoBox.center.x, logoBox.center.y) +
        Math.hypot(logoBox.width, logoBox.height) / 2;
      unionRadius = Math.max(unionRadius, logoReach);
    }
    const gapPx = Math.max(12, docFont);
    const center: Vec2 = {
      x: anchor.x - unionRadius - gapPx - maxXFromCenter,
      y: anchor.y,
    };
    grain = shiftGrain(grain, sub(center, centroid));
  }

  return {
    anchor,
    rotationDeg,
    blockWidth,
    blockHeight: totalHeight,
    textAlign: "left",
    lines,
    grain,
    logo: logoBox,
  };
}

const MOLD_DOC_LOGO_MIN_PX = 8;
const MOLD_DOC_LOGO_MAX_PX = 4096;

/**
 * Effective logo box for a mold, in BLOCK coordinates (origin at the block
 * anchor, pre-rotation). Default: parked left of the text lines, vertically
 * centered, height = text block height (bbox-proportional fallback when the
 * block has no lines). Per-mold overrides come from moldMeta.docImage*.
 */
function computeLogoBox(
  figure: Figure,
  logo: MoldDocLogoInput | null | undefined,
  blockWidth: number,
  blockHeight: number,
  docFont: number,
  hasLines: boolean
): MoldDocLogoBox | null {
  if (!logo) return null;
  if (
    !Number.isFinite(logo.naturalWidth) ||
    !Number.isFinite(logo.naturalHeight) ||
    logo.naturalWidth <= 0 ||
    logo.naturalHeight <= 0
  ) {
    return null;
  }

  const meta = figure.moldMeta;

  const customH = meta?.docImageHeightLocal;
  let height: number;
  if (Number.isFinite(customH ?? NaN) && (customH as number) > 0) {
    height = Math.max(MOLD_DOC_LOGO_MIN_PX, Math.min(MOLD_DOC_LOGO_MAX_PX, customH as number));
  } else if (hasLines && blockHeight > 0) {
    height = blockHeight;
  } else {
    const bounds = figureLocalBounds(figure);
    const span = bounds ? Math.min(bounds.width, bounds.height) : 60;
    height = Math.max(24, span * 0.3);
  }
  let width = height * (logo.naturalWidth / logo.naturalHeight);
  // Extreme banner aspects: cap the width too (preserving aspect by reducing
  // the height), so the box — and the grain arrow parked beyond it — stays
  // within sane reach.
  if (width > MOLD_DOC_LOGO_MAX_PX) {
    height = (height * MOLD_DOC_LOGO_MAX_PX) / width;
    width = MOLD_DOC_LOGO_MAX_PX;
  }

  const offset = meta?.docImageOffsetLocal;
  const hasOffset = !!offset && Number.isFinite(offset.x) && Number.isFinite(offset.y);
  let center: Vec2;
  if (hasOffset) {
    center = { x: (offset as Vec2).x, y: (offset as Vec2).y };
  } else if (hasLines) {
    const gapPx = Math.max(10, Math.round(0.5 * docFont));
    center = { x: -(blockWidth / 2) - gapPx - width / 2, y: 0 };
  } else {
    center = { x: 0, y: 0 };
  }

  const rotationRaw = meta?.docImageRotationDeg;
  const rotationDeg = Number.isFinite(rotationRaw ?? NaN)
    ? (((rotationRaw as number) % 360) + 360) % 360
    : 0;

  return { center, width, height, rotationDeg };
}

function shiftGrain(grain: MoldGrainArrow, delta: Vec2): MoldGrainArrow {
  return {
    ...grain,
    tail: add(grain.tail, delta),
    tip: add(grain.tip, delta),
    headA: add(grain.headA, delta),
    headB: add(grain.headB, delta),
  };
}

/**
 * Effective arrow length: the user-resized `grainLengthLocal` when set,
 * otherwise proportional to the figure's local bounds.
 */
export function computeGrainArrowLength(figure: Figure): number {
  const custom = figure.moldMeta?.grainLengthLocal;
  if (Number.isFinite(custom ?? NaN) && (custom as number) > 0) {
    return Math.max(12, custom as number);
  }
  const bounds = figureLocalBounds(figure);
  const span = bounds ? Math.min(bounds.width, bounds.height) : 60;
  return Math.max(24, span * 0.6);
}

/** Single-headed grain arrow, in local coords. null when fio not set. */
export function computeGrainArrow(figure: Figure): MoldGrainArrow | null {
  const angle = figure.moldMeta?.grainline?.angleDeg;
  if (typeof angle !== "number" || !Number.isFinite(angle)) return null;

  const len = computeGrainArrowLength(figure);
  const half = len / 2;

  const centroid = figureCentroidLocal(figure);
  const dir = rotate({ x: 0, y: -1 }, angle); // 0° = up, clockwise
  const tail = sub(centroid, mul(dir, half));
  const tip = add(centroid, mul(dir, half));

  const headLen = Math.max(8, len * 0.18);
  const back = mul(dir, -1);
  const headA = add(tip, mul(rotate(back, 28), headLen));
  const headB = add(tip, mul(rotate(back, -28), headLen));

  const strokeWidth = Math.max(1.2, len * 0.02);

  return { tail, tip, headA, headB, strokeWidth };
}
