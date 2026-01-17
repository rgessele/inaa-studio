import { test, expect } from "./helpers/test";
import { getEditorState, gotoEditor } from "./helpers/e2e";

test.describe("prefs: persistence", () => {
  test("grid contrast persists via localStorage", async ({ page }) => {
    await gotoEditor(page);

    await page.getByTestId("view-menu-button").click();
    await page.getByTestId("grid-contrast-slider").fill("80");

    await expect
      .poll(async () => (await getEditorState(page)).gridContrast)
      .toBeGreaterThan(0.79);

    const raw = await page.evaluate(() =>
      localStorage.getItem("inaa:gridContrast")
    );
    expect(raw).toBe("0.8");

    // Re-navigate and wait for editor hydration/debug hooks.
    await gotoEditor(page);

    await expect
      .poll(async () => (await getEditorState(page)).gridContrast)
      .toBeGreaterThan(0.79);
  });

  test("page guide settings are project-scoped (showPageGuides stays global)", async ({
    page,
  }) => {
    await gotoEditor(page);

    await page.getByTestId("view-menu-button").click();
    await page.getByTestId("toggle-page-guides").click();
    await page.getByTestId("page-size-select").selectOption("A0");
    await page.getByTestId("page-orientation-select").selectOption("portrait");

    await expect
      .poll(
        async () => (await getEditorState(page)).pageGuideSettings.paperSize
      )
      .toBe("A0");

    const globalToggle = await page.evaluate(() =>
      localStorage.getItem("inaa:showPageGuides")
    );
    expect(globalToggle).toBe("1");

    await page.evaluate(() => {
      if (!window.__INAA_DEBUG__?.loadTestProject) {
        throw new Error("loadTestProject not available");
      }
      window.__INAA_DEBUG__.loadTestProject({
        projectId: "p2",
        projectName: "Projeto 2",
        pageGuideSettings: {
          paperSize: "A4",
          orientation: "landscape",
          marginCm: 1.5,
        },
      });
    });

    await expect
      .poll(async () => (await getEditorState(page)).projectId)
      .toBe("p2");

    const state = await getEditorState(page);
    expect(state.pageGuideSettings.paperSize).toBe("A4");
    expect(state.pageGuideSettings.orientation).toBe("landscape");
    expect(state.pageGuideSettings.marginCm).toBe(1.5);

    const stillGlobal = await page.evaluate(() =>
      localStorage.getItem("inaa:showPageGuides")
    );
    expect(stillGlobal).toBe("1");
  });
});
