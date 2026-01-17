import { expect, test } from "./helpers/test";
import { getEditorState, gotoEditor } from "./helpers/e2e";

test.describe("select tool - fill hit", () => {
  test("clicking inside a closed shape selects it", async ({ page }) => {
    await gotoEditor(page);

    await page.evaluate(() => {
      if (!window.__INAA_DEBUG__?.loadTestProject) {
        throw new Error("loadTestProject not available");
      }
      if (!window.__INAA_DEBUG__?.addTestRectangle) {
        throw new Error("addTestRectangle not available");
      }
      window.__INAA_DEBUG__.loadTestProject({ figures: [] });
      window.__INAA_DEBUG__.addTestRectangle();
    });

    const stageCanvas = page
      .getByTestId("editor-stage-container")
      .locator("canvas")
      .last();
    await expect(stageCanvas).toBeVisible();

    // Clear selection by clicking empty space.
    await page.keyboard.press("V");
    await stageCanvas.click({ position: { x: 360, y: 260 } });
    await expect
      .poll(async () => (await getEditorState(page)).selectedFigureId)
      .toBeNull();

    // Click inside the rectangle (fill-hit, not just stroke hit).
    await stageCanvas.click({ position: { x: 100, y: 60 } });
    await expect
      .poll(async () => (await getEditorState(page)).selectedFigureId)
      .not.toBeNull();
  });
});
