import { test, expect } from "@playwright/test";
import { gotoEditor } from "./helpers/e2e";

test("imã: linha faz snap no contorno de outra figura", async ({ page }) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.addTestRectangle) {
      throw new Error("addTestRectangle not available");
    }
    window.__INAA_DEBUG__.addTestRectangle();
  });

  // Enable magnet
  await page.getByTestId("magnet-toggle-button").click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getState().magnetEnabled
        )) ?? false
    )
    .toBe(true);

  // Use Line tool (UI click is more deterministic than keyboard in E2E)
  await page.getByRole("button", { name: "Linha" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("line");

  const beforeCount = await page.evaluate(
    () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
  );

  // Ensure Konva stage has rendered with a real canvas size.
  const stageCanvas = page
    .getByTestId("editor-stage-container")
    .locator("canvas")
    .last();
  await expect(stageCanvas).toBeVisible();
  await expect
    .poll(async () => {
      return await stageCanvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return { w: c.width, h: c.height };
      });
    })
    .toEqual(
      expect.objectContaining({ w: expect.any(Number), h: expect.any(Number) })
    );
  await expect
    .poll(async () => {
      return await stageCanvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return Math.min(c.width, c.height);
      });
    })
    .toBeGreaterThan(0);

  // Stage starts with scale=1 and position=(0,0) by default.
  // The test rectangle is at world coords x=0..200, y=0..120.
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  const box = await stage.boundingBox();
  expect(box).toBeTruthy();

  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

  // Coordinates are relative to the stage container top-left (scale=1).
  const start = { x: 220, y: 200 };
  const end = { x: 203, y: 60 }; // should snap to x=200 on the right edge
  const third = { x: 260, y: 220 };

  const startX = clamp(box!.x + start.x, box!.x + 1, box!.x + box!.width - 2);
  const startY = clamp(box!.y + start.y, box!.y + 1, box!.y + box!.height - 2);
  const endX = clamp(box!.x + end.x, box!.x + 1, box!.x + box!.width - 2);
  const endY = clamp(box!.y + end.y, box!.y + 1, box!.y + box!.height - 2);

  const thirdX = clamp(box!.x + third.x, box!.x + 1, box!.x + box!.width - 2);
  const thirdY = clamp(box!.y + third.y, box!.y + 1, box!.y + box!.height - 2);

  // New Line tool flow: click points; close by clicking the first point.
  await page.mouse.click(startX, startY);
  await page.mouse.click(endX, endY);
  await page.mouse.click(thirdX, thirdY);
  await page.mouse.click(startX, startY);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        return figs.length;
      });
    })
    .toBe(beforeCount + 1);

  const last = await page.evaluate(() => {
    const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
    return figs[figs.length - 1] ?? null;
  });

  expect(last).toBeTruthy();
  expect(last!.tool).toBe("line");

  // Line figure uses x/y transform + local node coords.
  const n2 = last!.nodes[1];
  const endWorldActual = { x: last!.x + n2.x, y: last!.y + n2.y };

  expect(endWorldActual.x).toBeCloseTo(200, 0);
  expect(endWorldActual.y).toBeCloseTo(60, 0);
});
