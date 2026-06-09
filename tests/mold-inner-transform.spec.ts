import { expect, test } from "./helpers/test";
import { getEditorState, gotoEditor } from "./helpers/e2e";

// Inner transform mode: double-click on the doc-block / grain-arrow handle
// attaches a dedicated Transformer (resize + rotate) to that inner element.
// Scale bakes into font sizes (doc) or arrow length (grain); rotation into
// nameRotationDeg / grainline.angleDeg. The OUTER figure transformer is
// detached while the mode is active.

type TestNode = { id: string; x: number; y: number; mode: "corner" };
type TestFigure = {
  id: string;
  tool: "line";
  kind?: "mold";
  name?: string;
  x: number;
  y: number;
  rotation: number;
  closed: boolean;
  nodes: TestNode[];
  edges: Array<{ id: string; from: string; to: string; kind: "line" }>;
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
  moldMeta?: {
    baseSize?: string;
    grainline?: { angleDeg: number };
  };
};

const CENTER = { x: 300, y: 280 };

function moldRect(id: string, extra?: Partial<TestFigure>): TestFigure {
  const x = 220;
  const y = 180;
  const w = 160;
  const h = 200;
  const a = `${id}_a`;
  const b = `${id}_b`;
  const c = `${id}_c`;
  const d = `${id}_d`;
  return {
    id,
    tool: "line",
    kind: "mold",
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    nodes: [
      { id: a, x, y, mode: "corner" },
      { id: b, x: x + w, y, mode: "corner" },
      { id: c, x: x + w, y: y + h, mode: "corner" },
      { id: d, x, y: y + h, mode: "corner" },
    ],
    edges: [
      { id: `${id}_e1`, from: a, to: b, kind: "line" },
      { id: `${id}_e2`, from: b, to: c, kind: "line" },
      { id: `${id}_e3`, from: c, to: d, kind: "line" },
      { id: `${id}_e4`, from: d, to: a, kind: "line" },
    ],
    stroke: "aci7",
    strokeWidth: 2,
    fill: "rgba(96,165,250,0.22)",
    opacity: 1,
    ...extra,
  };
}

async function loadFigures(
  page: import("@playwright/test").Page,
  figures: TestFigure[]
) {
  await page.evaluate((payload) => {
    window.__INAA_DEBUG__?.loadTestProject?.({ figures: payload });
  }, figures);
  await expect
    .poll(async () =>
      page.evaluate(() => window.__INAA_DEBUG__?.getState?.().figuresCount ?? 0)
    )
    .toBe(figures.length);
}

async function selectMold(page: import("@playwright/test").Page) {
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();
  await stage.click({ position: CENTER });
  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .not.toBeNull();
}

async function countByName(
  page: import("@playwright/test").Page,
  name: string
): Promise<number> {
  return page.evaluate(
    (n) => window.__INAA_DEBUG__?.countStageNodesByName?.(n) ?? 0,
    name
  );
}

/** All abs positions for a node name; inner-transformer chrome comes LAST. */
async function absPositions(
  page: import("@playwright/test").Page,
  name: string
) {
  return page.evaluate(
    (n) =>
      window.__INAA_DEBUG__?.getStageNodeAbsolutePositionsByName?.(n) ?? [],
    name
  );
}

/**
 * Visual center of the LAST node with this name (inner-transformer chrome is
 * mounted after the outer one). Uses client rects so it works for rotated
 * anchors too — stock Konva anchors report their top-left as position.
 */
async function anchorCenter(
  page: import("@playwright/test").Page,
  name: string
) {
  const rects = await page.evaluate(
    (n) => window.__INAA_DEBUG__?.getStageNodeClientRectsByName?.(n) ?? [],
    name
  );
  expect(rects.length).toBeGreaterThan(0);
  const r = rects[rects.length - 1]!;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function getFigure(page: import("@playwright/test").Page) {
  const figs = await page.evaluate(
    () =>
      (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as Array<{
        x?: number;
        y?: number;
        rotation?: number;
        nameFontSizePx?: number;
        nameRotationDeg?: number;
        moldMeta?: {
          docFontSizePx?: number;
          grainLengthLocal?: number;
          grainline?: { angleDeg: number };
        };
      }>
  );
  return figs[0] ?? null;
}

async function stageBox(page: import("@playwright/test").Page) {
  const box = await page.getByTestId("editor-stage-container").boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function drag(
  page: import("@playwright/test").Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

function rotateAround(
  p: { x: number; y: number },
  pivot: { x: number; y: number },
  deg: number
) {
  const rad = (deg * Math.PI) / 180;
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return {
    x: pivot.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: pivot.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

async function enterInnerMode(
  page: import("@playwright/test").Page,
  handleName: "inaa-figure-name-handle" | "inaa-grain-handle",
  proxyName: string
) {
  const box = await stageBox(page);
  const handles = await absPositions(page, handleName);
  expect(handles.length).toBeGreaterThan(0);
  const h = handles[0]!;
  await page.mouse.dblclick(box.x + h.x, box.y + h.y);
  await expect.poll(() => countByName(page, proxyName)).toBe(1);
  return box;
}

test("duplo clique no handle entra no modo interno; Esc sai e restaura o externo", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadFigures(page, [moldRect("mold_mode", { name: "Frente" })]);
  await selectMold(page);

  // Outer transform UX active (rotation pivot visible), no proxy yet.
  await expect.poll(() => countByName(page, "inaa-rotation-pivot")).toBe(1);
  await expect.poll(() => countByName(page, "inaa-inner-proxy-doc")).toBe(0);

  await enterInnerMode(page, "inaa-figure-name-handle", "inaa-inner-proxy-doc");

  // Outer transform UX suspended while the inner mode is active.
  await expect.poll(() => countByName(page, "inaa-rotation-pivot")).toBe(0);

  await page.keyboard.press("Escape");
  await expect.poll(() => countByName(page, "inaa-inner-proxy-doc")).toBe(0);
  await expect.poll(() => countByName(page, "inaa-rotation-pivot")).toBe(1);
});

test("redimensionar o bloco muda as fontes e reflete no painel; figura intacta", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadFigures(page, [moldRect("mold_scale", { name: "Frente" })]);
  await selectMold(page);

  const box = await enterInnerMode(
    page,
    "inaa-figure-name-handle",
    "inaa-inner-proxy-doc"
  );

  // Drag the inner transformer's bottom-right corner outward (centered
  // scaling around the block anchor at CENTER).
  const corner = await anchorCenter(page, "bottom-right");
  const start = { x: box.x + corner.x, y: box.y + corner.y };
  const end = {
    x: box.x + CENTER.x + (corner.x - CENTER.x) * 1.6,
    y: box.y + CENTER.y + (corner.y - CENTER.y) * 1.6,
  };
  await drag(page, start, end);

  const fig = await getFigure(page);
  expect(fig?.nameFontSizePx ?? 24).toBeGreaterThan(28);
  expect(fig?.moldMeta?.docFontSizePx ?? 14).toBeGreaterThan(16);
  // Both fonts scale by (roughly) the same factor.
  const nameRatio = (fig?.nameFontSizePx ?? 24) / 24;
  const docRatio = (fig?.moldMeta?.docFontSizePx ?? 14) / 14;
  expect(Math.abs(nameRatio - docRatio)).toBeLessThan(0.2);
  // The figure itself did not move/scale/rotate.
  expect(fig?.x ?? 0).toBe(0);
  expect(fig?.y ?? 0).toBe(0);
  expect(fig?.rotation ?? 0).toBe(0);

  // Panel reflects the committed font size (injected option in the select).
  await expect(page.getByTestId("mold-name-font-size")).toHaveValue(
    String(fig?.nameFontSizePx)
  );
});

test("rotacionar o bloco muda nameRotationDeg sem girar a figura", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadFigures(page, [moldRect("mold_rotate", { name: "Frente" })]);
  await selectMold(page);

  const box = await enterInnerMode(
    page,
    "inaa-figure-name-handle",
    "inaa-inner-proxy-doc"
  );

  const rotater = await anchorCenter(page, "rotater");
  const start = { x: box.x + rotater.x, y: box.y + rotater.y };
  const pivot = { x: box.x + CENTER.x, y: box.y + CENTER.y };
  await drag(page, start, rotateAround(start, pivot, 45));

  const fig = await getFigure(page);
  const rot = fig?.nameRotationDeg ?? 0;
  expect(Math.abs(rot - 45)).toBeLessThan(8);
  expect(fig?.rotation ?? 0).toBe(0);
});

test("seta do fio: rotacionar muda o fio; redimensionar muda o comprimento", async ({
  page,
}) => {
  await gotoEditor(page);
  // No text fields: the arrow sits exactly on the centroid (300, 280).
  await loadFigures(page, [
    moldRect("mold_grain_tr", { moldMeta: { grainline: { angleDeg: 0 } } }),
  ]);
  await selectMold(page);

  const box = await enterInnerMode(
    page,
    "inaa-grain-handle",
    "inaa-inner-proxy-grain"
  );

  // Rotate +90° around the arrow center.
  const rotater = await anchorCenter(page, "rotater");
  const start = { x: box.x + rotater.x, y: box.y + rotater.y };
  const pivot = { x: box.x + CENTER.x, y: box.y + CENTER.y };
  await drag(page, start, rotateAround(start, pivot, 90));

  let fig = await getFigure(page);
  const angle = fig?.moldMeta?.grainline?.angleDeg ?? 0;
  expect(Math.abs(angle - 90)).toBeLessThan(8);
  expect(fig?.rotation ?? 0).toBe(0);

  // Scale the arrow ~1.5x (default auto length is 96 = 0.6 * min(160, 200)).
  const corner = await anchorCenter(page, "bottom-right");
  const cStart = { x: box.x + corner.x, y: box.y + corner.y };
  const cEnd = {
    x: box.x + CENTER.x + (corner.x - CENTER.x) * 1.5,
    y: box.y + CENTER.y + (corner.y - CENTER.y) * 1.5,
  };
  await drag(page, cStart, cEnd);

  fig = await getFigure(page);
  const len = fig?.moldMeta?.grainLengthLocal ?? 0;
  expect(len).toBeGreaterThan(115);
  expect(len).toBeLessThan(190);
});
