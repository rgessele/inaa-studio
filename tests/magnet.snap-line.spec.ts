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
    .poll(async () => (await page.evaluate(() => window.__INAA_DEBUG__?.getState().magnetEnabled)) ?? false)
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
    .first();
  await expect(stageCanvas).toBeVisible();
  await expect
    .poll(async () => {
      return await stageCanvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return { w: c.width, h: c.height };
      });
    })
    .toEqual(expect.objectContaining({ w: expect.any(Number), h: expect.any(Number) }));
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
  const startWorld = { x: 200, y: 200 };
  const nearRightEdgeWorld = { x: 203, y: 60 }; // should snap to x=200 on the right edge

  await stageCanvas.dragTo(stageCanvas, {
    sourcePosition: startWorld,
    targetPosition: nearRightEdgeWorld,
  });

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
