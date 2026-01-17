import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

test("edge: converter linha/curva via menu de contexto", async ({ page }) => {
  await gotoEditor(page);

  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.addTestRectangle) {
      throw new Error("addTestRectangle not available");
    }
    window.__INAA_DEBUG__.addTestRectangle();
  });

  // Right click near the top edge of the rectangle.
  await stage.click({ button: "right", position: { x: 140, y: 8 } });
  await expect(page.getByTestId("edge-context-menu")).toBeVisible();

  await page.getByTestId("edge-context-convert-to-curve").click();

  await expect(page.getByTestId("edge-context-menu")).toHaveCount(0);

  // When a cubic edge is selected (converted), the side panel should expose
  // the standard curve settings panel.
  await expect(page.getByText("Estilo de Curva")).toBeVisible();

  // Apply a preset to the selected cubic edge and verify it updates handles.
  await page.getByTestId("curve-style-preset").selectOption("CAVA_CAVADA");
  await expect(page.getByTestId("curve-style-height")).toBeVisible();

  const afterToCurve = await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.getFiguresSnapshot) {
      throw new Error("getFiguresSnapshot not available");
    }
    return window.__INAA_DEBUG__.getFiguresSnapshot();
  });

  const base1 = afterToCurve.find((f) => !f.kind);
  expect(base1).toBeTruthy();
  expect(base1!.closed).toBe(true);
  expect(base1!.edges.filter((e) => e.kind === "cubic").length).toBe(1);
  expect(base1!.nodes.some((n) => n.inHandle || n.outHandle)).toBe(true);

  // Presets should introduce some curvature (handles not collinear with node).
  expect(
    base1!.nodes.some(
      (n) =>
        (n.outHandle && Math.abs(n.outHandle.y - n.y) > 0.01) ||
        (n.inHandle && Math.abs(n.inHandle.y - n.y) > 0.01)
    )
  ).toBe(true);

  // Convert back.
  const cubic = base1!.edges.find((e) => e.kind === "cubic")!;
  const n0 = base1!.nodes.find((n) => n.id === cubic.from)!;
  const n3 = base1!.nodes.find((n) => n.id === cubic.to)!;
  const p0 = { x: n0.x, y: n0.y };
  const p1 = n0.outHandle ?? { x: n0.x, y: n0.y };
  const p2 = n3.inHandle ?? { x: n3.x, y: n3.y };
  const p3 = { x: n3.x, y: n3.y };
  const t = 0.5;
  const u = 1 - t;
  const mid = {
    x:
      u * u * u * p0.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t * t * t * p3.x +
      base1!.x,
    y:
      u * u * u * p0.y +
      3 * u * u * t * p1.y +
      3 * u * t * t * p2.y +
      t * t * t * p3.y +
      base1!.y,
  };

  await stage.click({
    button: "right",
    position: { x: Math.round(mid.x), y: Math.round(mid.y) },
  });
  await expect(page.getByTestId("edge-context-menu")).toBeVisible();

  await page.getByTestId("edge-context-convert-to-line").click();
  await expect(page.getByTestId("edge-context-menu")).toHaveCount(0);

  await expect
    .poll(async () => {
      const figs = await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.getFiguresSnapshot) {
          throw new Error("getFiguresSnapshot not available");
        }
        return window.__INAA_DEBUG__.getFiguresSnapshot();
      });
      const base = figs.find((f) => !f.kind);
      if (!base) return false;
      return base.edges.every((e) => e.kind === "line");
    })
    .toBe(true);

  const afterToLine = await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.getFiguresSnapshot) {
      throw new Error("getFiguresSnapshot not available");
    }
    return window.__INAA_DEBUG__.getFiguresSnapshot();
  });

  const base2 = afterToLine.find((f) => !f.kind);
  expect(base2).toBeTruthy();
  expect(base2!.closed).toBe(true);
  expect(base2!.edges.every((e) => e.kind === "line")).toBe(true);
  expect(base2!.nodes.every((n) => !n.inHandle && !n.outHandle)).toBe(true);
});
