import { test, expect } from "@playwright/test";
import { gotoEditor } from "./helpers/e2e";

test("node tool: dragging existing node does not split edge", async ({ page }) => {
  await gotoEditor(page);

  // Deterministic rectangle is selected by helper.
  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.addTestRectangle) {
      throw new Error("addTestRectangle not available");
    }
    window.__INAA_DEBUG__.addTestRectangle();
  });

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return window.__INAA_DEBUG__?.getSelectedFigureStats?.() ?? null;
      });
    })
    .toEqual({ nodesCount: 4, edgesCount: 4 });

  // Switch to node tool via shortcut.
  await page.keyboard.press("N");

  // Drag near the bottom-right node.
  const box = await page.getByTestId("editor-stage-container").boundingBox();
  expect(box).toBeTruthy();
  const b = box!;

  const startX = b.x + 200;
  const startY = b.y + 120;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 20, startY + 10);
  await page.mouse.up();

  // Ensure no split happened (no extra node/edge).
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return window.__INAA_DEBUG__?.getSelectedFigureStats?.() ?? null;
      });
    })
    .toEqual({ nodesCount: 4, edgesCount: 4 });
});
