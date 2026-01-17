import { test, expect } from "./helpers/test";
import { getEditorState, gotoEditor } from "./helpers/e2e";

test("editor: medidas overlay modes (never/always/hover)", async ({ page }) => {
  await gotoEditor(page);

  await expect(page.getByTestId("editor-stage-container")).toBeVisible();

  // Add a deterministic rectangle
  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.addTestRectangle) {
      throw new Error("addTestRectangle not available");
    }
    window.__INAA_DEBUG__.addTestRectangle();
  });

  await expect
    .poll(async () => (await getEditorState(page)).figuresCount)
    .toBeGreaterThan(0);

  // Mode starts at always (E2E init)
  await expect
    .poll(async () => (await getEditorState(page)).measureDisplayMode)
    .toBe("always");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) {
          throw new Error("countStageNodesByName not available");
        }
        return window.__INAA_DEBUG__.countStageNodesByName(
          "inaa-measure-label"
        );
      });
    })
    .toBe(4);

  // Switch to hover
  await page.getByTestId("measures-mode-button").click();
  await expect
    .poll(async () => (await getEditorState(page)).measureDisplayMode)
    .toBe("hover");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) return 0;
        return window.__INAA_DEBUG__.countStageNodesByName(
          "inaa-measure-label"
        );
      });
    })
    .toBeGreaterThan(0);

  // Clear selection (use a tool that clears on background click).
  await page.keyboard.press("N");
  await page.getByTestId("editor-stage-container").click({
    position: { x: 260, y: 260 },
  });

  // In hover mode: without selection and without hover, labels should disappear.
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) return 0;
        return window.__INAA_DEBUG__.countStageNodesByName(
          "inaa-measure-label"
        );
      });
    })
    .toBe(0);

  // Hover the rectangle area (it's placed at world origin, so near top-left).
  await page.getByTestId("editor-stage-container").hover({
    position: { x: 80, y: 60 },
  });

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) return 0;
        return window.__INAA_DEBUG__.countStageNodesByName(
          "inaa-measure-label"
        );
      });
    })
    .toBe(4);

  // Move away: labels should hide again.
  await page.getByTestId("editor-stage-container").hover({
    position: { x: 420, y: 420 },
  });

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) return 0;
        return window.__INAA_DEBUG__.countStageNodesByName(
          "inaa-measure-label"
        );
      });
    })
    .toBe(0);

  // Switch back to never (no labels rendered)
  await page.getByTestId("measures-mode-button").click();
  await expect
    .poll(async () => (await getEditorState(page)).measureDisplayMode)
    .toBe("never");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) return 0;
        return window.__INAA_DEBUG__.countStageNodesByName(
          "inaa-measure-label"
        );
      });
    })
    .toBe(0);
});
