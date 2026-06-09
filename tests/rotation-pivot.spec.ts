import { expect, test } from "./helpers/test";
import { getEditorState, gotoEditor } from "./helpers/e2e";

// Rotation pivot (gold anchor marker): defaults to the selection center, can
// be dragged anywhere, and the rotater anchor rotates the selection around it.
// Ephemeral — resets to the center on every new selection.

type TestNode = { id: string; x: number; y: number; mode: "corner" };
type TestFigure = {
  id: string;
  tool: "line";
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
};

const RECT_X = 220;
const RECT_Y = 180;
const RECT_W = 160;
const RECT_H = 200;
const CENTER = { x: RECT_X + RECT_W / 2, y: RECT_Y + RECT_H / 2 }; // (300, 280)

function rectFigure(id: string): TestFigure {
  const a = `${id}_a`;
  const b = `${id}_b`;
  const c = `${id}_c`;
  const d = `${id}_d`;
  return {
    id,
    tool: "line",
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    nodes: [
      { id: a, x: RECT_X, y: RECT_Y, mode: "corner" },
      { id: b, x: RECT_X + RECT_W, y: RECT_Y, mode: "corner" },
      { id: c, x: RECT_X + RECT_W, y: RECT_Y + RECT_H, mode: "corner" },
      { id: d, x: RECT_X, y: RECT_Y + RECT_H, mode: "corner" },
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
  };
}

async function loadRect(page: import("@playwright/test").Page, id: string) {
  await page.evaluate((payload) => {
    window.__INAA_DEBUG__?.loadTestProject?.({ figures: payload });
  }, [rectFigure(id)]);
  await expect
    .poll(async () =>
      page.evaluate(() => window.__INAA_DEBUG__?.getState?.().figuresCount ?? 0)
    )
    .toBe(1);
}

async function selectAt(
  page: import("@playwright/test").Page,
  x: number,
  y: number
) {
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();
  await stage.click({ position: { x, y } });
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

async function absPosByName(
  page: import("@playwright/test").Page,
  name: string
): Promise<{ x: number; y: number } | null> {
  const positions = await page.evaluate(
    (n) =>
      window.__INAA_DEBUG__?.getStageNodeAbsolutePositionsByName?.(n) ?? [],
    name
  );
  return positions[0] ?? null;
}

async function getFigure(page: import("@playwright/test").Page) {
  const figs = await page.evaluate(
    () =>
      (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as Array<{
        x?: number;
        y?: number;
        rotation?: number;
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

/** Rotate `p` around `pivot` by `deg` (screen/world coords, y down). */
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

test("âncora aparece centrada ao selecionar e some ao desselecionar", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadRect(page, "fig_pivot");

  await expect.poll(() => countByName(page, "inaa-rotation-pivot")).toBe(0);

  await selectAt(page, CENTER.x, CENTER.y);
  await expect.poll(() => countByName(page, "inaa-rotation-pivot")).toBe(1);

  const pos = await absPosByName(page, "inaa-rotation-pivot");
  expect(Math.abs(pos!.x - CENTER.x)).toBeLessThan(1.5);
  expect(Math.abs(pos!.y - CENTER.y)).toBeLessThan(1.5);

  // Deselect on empty canvas.
  const stage = page.getByTestId("editor-stage-container");
  await stage.click({ position: { x: 560, y: 90 } });
  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .toBeNull();
  await expect.poll(() => countByName(page, "inaa-rotation-pivot")).toBe(0);
});

test("rotação padrão gira em torno do centro da seleção", async ({ page }) => {
  await gotoEditor(page);
  await loadRect(page, "fig_rot_center");
  await selectAt(page, CENTER.x, CENTER.y);

  const box = await stageBox(page);
  const rotater = await absPosByName(page, "rotater");
  expect(rotater).not.toBeNull();

  const start = { x: box.x + rotater!.x, y: box.y + rotater!.y };
  const pivotPage = { x: box.x + CENTER.x, y: box.y + CENTER.y };
  await drag(page, start, rotateAround(start, pivotPage, 60));

  const fig = await getFigure(page);
  const delta = fig?.rotation ?? 0;
  expect(Math.abs(delta - 60)).toBeLessThan(2);

  // Figure position must satisfy rotation-around-CENTER: since the figure
  // origin started at (0,0), expected pos = C + R(delta)(0 - C).
  const expected = rotateAround({ x: 0, y: 0 }, CENTER, delta);
  expect(Math.abs((fig?.x ?? 0) - expected.x)).toBeLessThan(2);
  expect(Math.abs((fig?.y ?? 0) - expected.y)).toBeLessThan(2);
});

test("âncora reposicionada vira o pivô da rotação (sem mover a figura)", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadRect(page, "fig_rot_pivot");
  await selectAt(page, CENTER.x, CENTER.y);

  const box = await stageBox(page);
  const pivotTarget = { x: RECT_X, y: RECT_Y }; // top-left corner (220, 180)

  // Drag the gold anchor from the center to the corner.
  await drag(
    page,
    { x: box.x + CENTER.x, y: box.y + CENTER.y },
    { x: box.x + pivotTarget.x, y: box.y + pivotTarget.y }
  );

  const markerPos = await absPosByName(page, "inaa-rotation-pivot");
  expect(Math.abs(markerPos!.x - pivotTarget.x)).toBeLessThan(1.5);
  expect(Math.abs(markerPos!.y - pivotTarget.y)).toBeLessThan(1.5);

  // Dragging the pivot must NOT move the figure.
  const figBefore = await getFigure(page);
  expect(figBefore?.x ?? 0).toBe(0);
  expect(figBefore?.y ?? 0).toBe(0);
  expect(figBefore?.rotation ?? 0).toBe(0);

  // Rotate ~90° with the pointer orbiting the NEW pivot.
  const rotater = await absPosByName(page, "rotater");
  const start = { x: box.x + rotater!.x, y: box.y + rotater!.y };
  const pivotPage = { x: box.x + pivotTarget.x, y: box.y + pivotTarget.y };
  await drag(page, start, rotateAround(start, pivotPage, 90));

  const fig = await getFigure(page);
  const delta = fig?.rotation ?? 0;
  expect(Math.abs(delta - 90)).toBeLessThan(2);

  // Figure position must satisfy rotation-around-PIVOT (not center).
  const expected = rotateAround({ x: 0, y: 0 }, pivotTarget, delta);
  expect(Math.abs((fig?.x ?? 0) - expected.x)).toBeLessThan(2);
  expect(Math.abs((fig?.y ?? 0) - expected.y)).toBeLessThan(2);
});

test("âncora sofre magnetismo e gruda exatamente no nó próximo", async ({
  page,
}) => {
  await gotoEditor(page);
  await loadRect(page, "fig_pivot_snap");
  await selectAt(page, CENTER.x, CENTER.y);

  const box = await stageBox(page);
  // Drop the pivot ~7px away from the top-left node (220,180): the node
  // magnetism must pull it exactly onto the node.
  await drag(
    page,
    { x: box.x + CENTER.x, y: box.y + CENTER.y },
    { x: box.x + RECT_X + 6, y: box.y + RECT_Y + 4 }
  );

  const pos = await absPosByName(page, "inaa-rotation-pivot");
  expect(Math.abs(pos!.x - RECT_X)).toBeLessThan(0.5);
  expect(Math.abs(pos!.y - RECT_Y)).toBeLessThan(0.5);
});

test("âncora volta ao centro a cada nova seleção", async ({ page }) => {
  await gotoEditor(page);
  await loadRect(page, "fig_pivot_reset");
  await selectAt(page, CENTER.x, CENTER.y);

  const box = await stageBox(page);
  await drag(
    page,
    { x: box.x + CENTER.x, y: box.y + CENTER.y },
    { x: box.x + 460, y: box.y + 120 }
  );
  const moved = await absPosByName(page, "inaa-rotation-pivot");
  expect(Math.abs(moved!.x - 460)).toBeLessThan(1.5);
  expect(Math.abs(moved!.y - 120)).toBeLessThan(1.5);

  // Deselect, reselect: pivot must be back at the selection center.
  const stage = page.getByTestId("editor-stage-container");
  await stage.click({ position: { x: 560, y: 90 } });
  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .toBeNull();

  await selectAt(page, CENTER.x, CENTER.y);
  await expect.poll(() => countByName(page, "inaa-rotation-pivot")).toBe(1);
  const reset = await absPosByName(page, "inaa-rotation-pivot");
  expect(Math.abs(reset!.x - CENTER.x)).toBeLessThan(1.5);
  expect(Math.abs(reset!.y - CENTER.y)).toBeLessThan(1.5);
});
