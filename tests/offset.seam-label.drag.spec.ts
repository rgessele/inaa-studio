import { expect, test } from "./helpers/test";
import { dragOnCanvas, gotoEditor } from "./helpers/e2e";

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
      const fig = {
        id: "fig_mold_drag",
        tool: "rectangle" as const,
        kind: "mold" as const,
        x: 0,
        y: 0,
        rotation: 0,
        closed: true,
        nodes: [
          { id: "n1", x: 0, y: 0, mode: "corner" as const },
          { id: "n2", x: 200, y: 0, mode: "corner" as const },
          { id: "n3", x: 200, y: 120, mode: "corner" as const },
          { id: "n4", x: 0, y: 120, mode: "corner" as const },
        ],
        edges: [
          { id: "e1", from: "n1", to: "n2", kind: "line" as const },
          { id: "e2", from: "n2", to: "n3", kind: "line" as const },
          { id: "e3", from: "n3", to: "n4", kind: "line" as const },
          { id: "e4", from: "n4", to: "n1", kind: "line" as const },
        ],
        stroke: "aci7",
        strokeWidth: 2,
        fill: "transparent",
        opacity: 1,
      };
      window.__INAA_DEBUG__.loadTestProject({ figures: [fig] });
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

    await dragOnCanvas(page, stageCanvas, {
      source: { x: 100, y: 60 },
      target: { x: 220, y: 160 },
    });

    const after = await getLabelPos();

    expect(dist(before, after)).toBeGreaterThan(5);
  });
});
