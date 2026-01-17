import { test, expect } from "./helpers/test";
import { getEditorState, gotoEditor } from "./helpers/e2e";

test("editor smoke: draw + undo/redo + page guides", async ({ page }) => {
  await gotoEditor(page);

  // Editor loaded
  await expect(page.getByTestId("editor-stage-container")).toBeVisible();

  // Open View menu
  await page.getByTestId("view-menu-button").click();

  // Toggle page guides on
  await page.getByTestId("toggle-page-guides").click();

  // Configure page settings (should appear only when enabled)
  await expect(page.getByTestId("page-size-select")).toBeVisible();
  await page.getByTestId("page-size-select").selectOption("A0");
  await page.getByTestId("page-orientation-select").selectOption("portrait");

  // Close View menu so it doesn't intercept pointer events
  await page.keyboard.press("Escape");

  // Draw a rectangle
  await page.getByRole("button", { name: "Retângulo" }).click();

  await expect
    .poll(async () => (await getEditorState(page)).tool)
    .toBe("rectangle");

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.addTestRectangle) {
      throw new Error("addTestRectangle not available");
    }
    window.__INAA_DEBUG__.addTestRectangle();
  });

  await expect
    .poll(async () => (await getEditorState(page)).figuresCount)
    .toBeGreaterThan(0);

  const afterDraw = await getEditorState(page);

  // Undo removes the last figure
  await page.getByRole("button", { name: "Desfazer" }).click();
  const afterUndo = await getEditorState(page);
  expect(afterUndo.figuresCount).toBeLessThan(afterDraw.figuresCount);

  // Redo restores
  await page.getByRole("button", { name: "Refazer" }).click();
  const afterRedo = await getEditorState(page);
  expect(afterRedo.figuresCount).toBe(afterDraw.figuresCount);

  // Page guides preference is global: persisted in localStorage
  const lsValue = await page.evaluate(() =>
    localStorage.getItem("inaa:showPageGuides")
  );
  expect(lsValue).toBe("1");
});
