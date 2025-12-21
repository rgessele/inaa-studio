import { expect, test } from "@playwright/test";
import { gotoEditor } from "./helpers/e2e";

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

test.describe("offset tool - seam label", () => {
  test("seam label moves when seam is dragged", async ({ page }) => {
    // Force seam labels to stay visible outside the Offset tool.
    await page.addInitScript(() => {
      localStorage.setItem("inaa:measureDisplayMode", "always");
    });

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

    // Create an offset (seam allowance) from the base rectangle.
    await page.keyboard.press("O");
    await stageCanvas.click({ position: { x: 100, y: 60 } });

    const getLabelPos = async () => {
      const pts = await page.evaluate(() => {
        return (
          window.__INAA_DEBUG__?.getStageNodeAbsolutePositionsByName?.(
            "inaa-seam-label"
          ) ?? []
        );
      });
      expect(pts.length).toBeGreaterThan(0);
      return pts[0];
    };

    const before = await getLabelPos();

    // Drag the base figure; the derived seam (and its label) should move too.
    await page.keyboard.press("V");
    await stageCanvas.click({ position: { x: 100, y: 60 } });

    await stageCanvas.dragTo(stageCanvas, {
      sourcePosition: { x: 100, y: 60 },
      targetPosition: { x: 220, y: 160 },
    });

    const after = await getLabelPos();

    expect(dist(before, after)).toBeGreaterThan(5);
  });
});
