import { expect, test } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

async function loadRect(
  page: import("@playwright/test").Page,
  figId: string
) {
  await page.evaluate((targetId) => {
    window.__INAA_DEBUG__!.loadTestProject!({
      projectId: "transformer-handle-size",
      projectName: "Transformer handle size",
      figures: [
        {
          id: targetId,
          tool: "rectangle",
          x: 260,
          y: 220,
          rotation: 0,
          closed: true,
          stroke: "aci7",
          strokeWidth: 2,
          fill: "transparent",
          opacity: 1,
          nodes: [
            { x: 0, y: 0 },
            { x: 200, y: 0 },
            { x: 200, y: 120 },
            { x: 0, y: 120 },
          ].map((node, index) => ({
            id: `${targetId}_n${index + 1}`,
            x: node.x,
            y: node.y,
            mode: "corner" as const,
          })),
          edges: [
            {
              id: `${targetId}_e1`,
              from: `${targetId}_n1`,
              to: `${targetId}_n2`,
              kind: "line" as const,
            },
            {
              id: `${targetId}_e2`,
              from: `${targetId}_n2`,
              to: `${targetId}_n3`,
              kind: "line" as const,
            },
            {
              id: `${targetId}_e3`,
              from: `${targetId}_n3`,
              to: `${targetId}_n4`,
              kind: "line" as const,
            },
            {
              id: `${targetId}_e4`,
              from: `${targetId}_n4`,
              to: `${targetId}_n1`,
              kind: "line" as const,
            },
          ],
        },
      ],
    });
  }, figId);
}

async function getScale(page: import("@playwright/test").Page) {
  return await page.evaluate(() => window.__INAA_DEBUG__?.getScale?.() ?? null);
}

async function getAnchorRect(
  page: import("@playwright/test").Page,
  anchorName: string
) {
  return await page.evaluate((name) => {
    type KonvaNodeLike = {
      getClientRect?: () => {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
    type KonvaStageLike = {
      findOne: (selector: string) => KonvaNodeLike | null;
    };
    const konva = (
      window as typeof window & {
        Konva?: { stages?: KonvaStageLike[] };
      }
    ).Konva;
    const stage =
      konva && Array.isArray(konva.stages) ? konva.stages[0] ?? null : null;
    const anchor = stage?.findOne(`.${name}`) ?? null;
    if (!anchor?.getClientRect) return null;
    const rect = anchor.getClientRect();
    return {
      width: rect.width,
      height: rect.height,
    };
  }, anchorName);
}

async function wheelZoom(
  page: import("@playwright/test").Page,
  deltaY: number,
  times: number,
  stageBox: { x: number; y: number; width: number; height: number }
) {
  const x = stageBox.x + stageBox.width / 2;
  const y = stageBox.y + stageBox.height / 2;

  await page.mouse.move(x, y);
  for (let index = 0; index < times; index += 1) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(40);
  }
}

function expectSameScreenSize(
  base: { width: number; height: number },
  next: { width: number; height: number }
) {
  // Konva Transformer anchors render with absoluteScale=1, so getClientRect
  // values are already in screen pixels. They must stay constant across zoom.
  expect(Math.abs(next.width - base.width)).toBeLessThan(0.75);
  expect(Math.abs(next.height - base.height)).toBeLessThan(0.75);
}

test("select transformer handles stay fixed on screen across zoom", async ({
  page,
}) => {
  await gotoEditor(page);

  const figId = "fig_transformer_handle_size";
  await loadRect(page, figId);

  const stage = page.getByTestId("editor-stage-container");
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.click(box!.x + 360, box!.y + 280);

  await expect
    .poll(
      async () =>
        await page.evaluate(() => window.__INAA_DEBUG__?.getState().selectedFigureId)
    )
    .toBe(figId);

  const at100 = await getAnchorRect(page, "top-left");
  expect(at100).toBeTruthy();

  const scaleStart = await getScale(page);
  expect(scaleStart).not.toBeNull();

  await wheelZoom(page, -120, 5, box!);

  await expect.poll(() => getScale(page)).toBeGreaterThan((scaleStart ?? 1) * 1.2);

  const zoomInRect = await getAnchorRect(page, "top-left");
  expect(zoomInRect).toBeTruthy();
  expectSameScreenSize(at100!, zoomInRect!);

  await wheelZoom(page, 120, 10, box!);

  await expect.poll(() => getScale(page)).toBeLessThan((scaleStart ?? 1) * 0.8);

  const zoomOutRect = await getAnchorRect(page, "top-left");
  expect(zoomOutRect).toBeTruthy();
  expectSameScreenSize(at100!, zoomOutRect!);
});