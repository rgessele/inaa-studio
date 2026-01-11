import { test, expect } from "@playwright/test";
import { getEditorState, initE2EState } from "./helpers/e2e";

test("page guides: project loader does not revert size/orientation", async ({
  page,
}) => {
  await initE2EState(page);

  // This route renders ProjectLoader (app/editor/[id]) and, in E2E mode,
  // uses a deterministic fake project with figures already present.
  await page.goto("/editor/e2e-project", { waitUntil: "networkidle" });

  await expect(page.getByTestId("editor-stage-container")).toBeVisible();

  await expect
    .poll(async () => (await getEditorState(page)).figuresCount)
    .toBeGreaterThan(0);

  // Open View menu and enable page guides
  await page.getByTestId("view-menu-button").click();
  await page.getByTestId("toggle-page-guides").click();

  // Change settings
  await page.getByTestId("page-size-select").selectOption("A0");
  await page.getByTestId("page-orientation-select").selectOption("landscape");

  await expect
    .poll(async () => (await getEditorState(page)).pageGuideSettings.paperSize)
    .toBe("A0");

  await expect
    .poll(
      async () => (await getEditorState(page)).pageGuideSettings.orientation
    )
    .toBe("landscape");

  // Regression check: previously, changing pageGuideSettings could cause a
  // ProjectLoader reload that reverted the state.
  await page.waitForTimeout(250);

  const stateAfter = await getEditorState(page);
  expect(stateAfter.pageGuideSettings.paperSize).toBe("A0");
  expect(stateAfter.pageGuideSettings.orientation).toBe("landscape");
});
