import { test, expect } from "@playwright/test";
import { getEditorState, gotoEditor } from "./helpers/e2e";

test("editor: nós (pontinhos) overlay modes (never/always/hover)", async ({
  page,
}) => {
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

  // Mode starts at never
  await expect
    .poll(async () => (await getEditorState(page)).nodesDisplayMode)
    .toBe("never");

  // Switch to always
  await page.getByTestId("nodes-mode-button").click();
  await expect
    .poll(async () => (await getEditorState(page)).nodesDisplayMode)
    .toBe("always");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) {
          throw new Error("countStageNodesByName not available");
        }
        return window.__INAA_DEBUG__.countStageNodesByName("inaa-node-point");
      });
    })
    .toBe(4);

  // Switch to hover (selected figure still shows)
  await page.getByTestId("nodes-mode-button").click();
  await expect
    .poll(async () => (await getEditorState(page)).nodesDisplayMode)
    .toBe("hover");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) return 0;
        return window.__INAA_DEBUG__.countStageNodesByName("inaa-node-point");
      });
    })
    .toBe(4);

  // Switch back to never (no points rendered)
  await page.getByTestId("nodes-mode-button").click();
  await expect
    .poll(async () => (await getEditorState(page)).nodesDisplayMode)
    .toBe("never");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) return 0;
        return window.__INAA_DEBUG__.countStageNodesByName("inaa-node-point");
      });
    })
    .toBe(0);
});
