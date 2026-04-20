import { expect, test } from "./helpers/test";
import { getEditorState, gotoEditor } from "./helpers/e2e";
import type { Page } from "@playwright/test";

async function seedAndSelectRectangle(page: Page) {
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
  await page.keyboard.press("V");
  await stageCanvas.click({ position: { x: 100, y: 60 } });

  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .not.toBeNull();
  await expect
    .poll(async () => (await getEditorState(page)).figuresCount)
    .toBe(1);
}

test.describe("delete shortcuts", () => {
  test("Backspace apaga a figura selecionada", async ({ page }) => {
    await gotoEditor(page);
    await seedAndSelectRectangle(page);

    await page.keyboard.press("Backspace");

    await expect
      .poll(async () => (await getEditorState(page)).figuresCount)
      .toBe(0);
    await expect
      .poll(async () => (await getEditorState(page)).selectedFigureId)
      .toBeNull();
  });

  test("Delete apaga a figura selecionada", async ({ page }) => {
    await gotoEditor(page);
    await seedAndSelectRectangle(page);

    await page.keyboard.press("Delete");

    await expect
      .poll(async () => (await getEditorState(page)).figuresCount)
      .toBe(0);
    await expect
      .poll(async () => (await getEditorState(page)).selectedFigureId)
      .toBeNull();
  });
});
