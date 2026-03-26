import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type Box = { x: number; y: number; width: number; height: number };

type TestFigure = {
  id: string;
  tool: "line";
  kind?: "mold";
  name?: string;
  x: number;
  y: number;
  rotation: number;
  closed: boolean;
  nodes: Array<{ id: string; x: number; y: number; mode: "corner" }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    kind: "line";
  }>;
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
};

function createRectFigure(
  id: string,
  opts: { kind?: "mold"; name?: string; x: number; y: number; w: number; h: number }
): TestFigure {
  const { kind, name, x, y, w, h } = opts;
  const n1 = `${id}_n1`;
  const n2 = `${id}_n2`;
  const n3 = `${id}_n3`;
  const n4 = `${id}_n4`;

  return {
    id,
    tool: "line",
    kind,
    name,
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    nodes: [
      { id: n1, x, y, mode: "corner" },
      { id: n2, x: x + w, y, mode: "corner" },
      { id: n3, x: x + w, y: y + h, mode: "corner" },
      { id: n4, x, y: y + h, mode: "corner" },
    ],
    edges: [
      { id: `${id}_e1`, from: n1, to: n2, kind: "line" },
      { id: `${id}_e2`, from: n2, to: n3, kind: "line" },
      { id: `${id}_e3`, from: n3, to: n4, kind: "line" },
      { id: `${id}_e4`, from: n4, to: n1, kind: "line" },
    ],
    stroke: "aci7",
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
  };
}

async function getStageBox(
  page: import("@playwright/test").Page
): Promise<Box> {
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  const stageCanvas = stage.locator("canvas").last();
  await expect(stageCanvas).toBeVisible();
  await expect
    .poll(async () => {
      return await stageCanvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return Math.min(c.width, c.height);
      });
    })
    .toBeGreaterThan(0);

  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  return box as Box;
}

async function worldToViewport(
  page: import("@playwright/test").Page,
  world: { x: number; y: number }
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((target) => {
    const debug = window.__INAA_DEBUG__ as
      | {
          getPosition?: () => { x: number; y: number };
          getScale?: () => number;
        }
      | undefined;
    const position = debug?.getPosition?.();
    const scale = debug?.getScale?.();
    if (!position || !Number.isFinite(scale) || (scale ?? 0) <= 0) {
      return null;
    }

    return {
      x: target.x * scale + position.x,
      y: target.y * scale + position.y,
    };
  }, world);

  expect(point).toBeTruthy();
  const stageBox = await getStageBox(page);
  return {
    x: stageBox.x + point!.x,
    y: stageBox.y + point!.y,
  };
}

test("bainha: oculta preview global ao pairar na aresta antes da parcial", async ({
  page,
}) => {
  await gotoEditor(page);

  const mold = createRectFigure("hem_preview_mold", {
    kind: "mold",
    name: "Molde Hem",
    x: 220,
    y: 180,
    w: 180,
    h: 120,
  });

  await page.evaluate((payload) => {
    window.__INAA_DEBUG__?.loadTestProject?.({ figures: [payload] });
  }, mold);

  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
        )) ?? 0
    )
    .toBe(1);

  await page.getByRole("button", { name: "Bainha" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ?? null
    )
    .toBe("hem");

  const center = await worldToViewport(page, { x: 310, y: 240 });
  await page.mouse.move(center.x, center.y);

  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.countStageNodesByName?.("inaa-hem-preview-line") ?? 0
        )) ?? 0
    )
    .toBeGreaterThan(0);

  const topEdgeMid = await worldToViewport(page, { x: 310, y: 180 });
  await page.mouse.move(topEdgeMid.x, topEdgeMid.y);

  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.countStageNodesByName?.("inaa-hem-preview-line") ?? 0
        )) ?? 0
    )
    .toBe(0);
});
