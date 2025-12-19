import { test, expect } from "@playwright/test";
import { gotoEditor } from "./helpers/e2e";

function worldToScreen(containerBox: { x: number; y: number }, p: { x: number; y: number }) {
  return { x: containerBox.x + p.x, y: containerBox.y + p.y };
}

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

  // Use Line tool
  await page.keyboard.press("L");

  const box = await page.getByTestId("editor-stage-container").boundingBox();
  expect(box).toBeTruthy();

  // Stage starts with scale=1 and position=(0,0) by default.
  // The test rectangle is at world coords x=0..200, y=0..120.
  const startWorld = { x: 200, y: 200 };
  const nearRightEdgeWorld = { x: 203, y: 60 }; // should snap to x=200 on the right edge

  const start = worldToScreen(box!, startWorld);
  const end = worldToScreen(box!, nearRightEdgeWorld);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();

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
