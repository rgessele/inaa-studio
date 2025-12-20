import { test, expect } from "@playwright/test";
import { gotoEditor } from "./helpers/e2e";

test.describe("visual: page guides tiles", () => {
  test("A4 tiles render", async ({ page }) => {
    await gotoEditor(page);

    await page.getByTestId("view-menu-button").click();
    await page.getByTestId("toggle-page-guides").click();
    await page.getByTestId("page-size-select").selectOption("A4");

    // Close the dropdown so it doesn't overlap the canvas screenshot.
    await page.getByTestId("view-menu-button").click();
    await expect(page.getByRole("heading", { name: "Régua" })).toBeHidden();

    const region = page.getByTestId("editor-stage-container");
    await expect(region).toHaveScreenshot("page-guides-a4.png", {
      animations: "disabled",
      caret: "hide",
    });
  });

  test("A0 tiles render", async ({ page }) => {
    await gotoEditor(page);

    await page.getByTestId("view-menu-button").click();
    await page.getByTestId("toggle-page-guides").click();
    await page.getByTestId("page-size-select").selectOption("A0");

    // Close the dropdown so it doesn't overlap the canvas screenshot.
    await page.getByTestId("view-menu-button").click();
    await expect(page.getByRole("heading", { name: "Régua" })).toBeHidden();

    const region = page.getByTestId("editor-stage-container");
    await expect(region).toHaveScreenshot("page-guides-a0.png", {
      animations: "disabled",
      caret: "hide",
    });
  });
});
