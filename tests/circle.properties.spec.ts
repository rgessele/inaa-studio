import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

test("circle: editar raio/raios e circunferência no painel", async ({
  page,
}) => {
  await gotoEditor(page);

  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  // Draw an ellipse (non-perfect circle) with the Circle tool.
  await page.getByRole("button", { name: "Círculo" }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ?? null)
    .toBe("circle");

  const box = await stage.boundingBox();
  expect(box).toBeTruthy();

  const x0 = Math.round(box!.x + 120);
  const y0 = Math.round(box!.y + 120);
  const x1 = Math.round(box!.x + 220);
  const y1 = Math.round(box!.y + 170);

  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1);
  await page.mouse.up();

  // Select it.
  await page.getByRole("button", { name: "Selecionar" }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ?? null)
    .toBe("select");

  const canvas = stage.locator("canvas").last();
  await expect(canvas).toBeVisible();
  await canvas.click({ position: { x: 170, y: 145 } });

  await expect(page.getByText("Elipse", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("circle-rx")).toBeVisible();
  await expect(page.getByTestId("circle-ry")).toBeVisible();
  await expect(page.getByTestId("circle-circumference")).toBeVisible();

  // Set Rx to 1cm and commit.
  await page.getByTestId("circle-rx").fill("1,00");
  await page.getByTestId("circle-rx").press("Enter");

  const snap = await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.getFiguresSnapshot) {
      throw new Error("getFiguresSnapshot not available");
    }
    return window.__INAA_DEBUG__.getFiguresSnapshot();
  });

  const circle = snap.find((f) => f.tool === "circle" && !f.kind);
  expect(circle).toBeTruthy();

  const xs = circle!.nodes.map((n) => n.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);

  // Rx=1cm => width ≈ 2cm in local px units.
  const widthPx = maxX - minX;
  const PX_PER_CM = 37.7952755906;
  expect(widthPx).toBeGreaterThan(2 * PX_PER_CM * 0.9);
  expect(widthPx).toBeLessThan(2 * PX_PER_CM * 1.1);
});
