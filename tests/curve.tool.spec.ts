import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type Box = { x: number; y: number; width: number; height: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function getStageBox(
  page: import("@playwright/test").Page
): Promise<Box> {
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  // Ensure Konva has rendered with a non-zero canvas.
  const stageCanvas = stage.locator("canvas").last();
  await expect(stageCanvas).toBeVisible();
  await expect
    .poll(async () => {
      return await stageCanvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return { w: c.width, h: c.height };
      });
    })
    .toEqual(
      expect.objectContaining({ w: expect.any(Number), h: expect.any(Number) })
    );
  await expect
    .poll(async () => {
      return await stageCanvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return Math.min(c.width, c.height);
      });
    })
    .toBeGreaterThan(0);

  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  return box as Box;
}

test("curva: Enter com 1 ponto cancela", async ({ page }) => {
  await gotoEditor(page);

  await page.getByRole("button", { name: "Curva" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("curve");

  const beforeCount = await page.evaluate(
    () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
  );

  const box = await getStageBox(page);

  // Place a single point.
  const p1 = { x: 220, y: 180 };
  const p1X = clamp(box.x + p1.x, box.x + 1, box.x + box.width - 2);
  const p1Y = clamp(box.y + p1.y, box.y + 1, box.y + box.height - 2);
  await page.mouse.click(p1X, p1Y);

  // Enter with <2 points cancels (no new figure).
  await page.keyboard.press("Enter");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        return figs.length;
      });
    })
    .toBe(beforeCount);
});

test("curva: fecha ao clicar no primeiro nó", async ({ page }) => {
  await gotoEditor(page);

  await page.getByRole("button", { name: "Curva" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("curve");

  const beforeCount = await page.evaluate(
    () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
  );

  const box = await getStageBox(page);

  const p1 = { x: 220, y: 200 };
  const p2 = { x: 300, y: 120 };
  const p3 = { x: 260, y: 260 };

  const p1X = clamp(box.x + p1.x, box.x + 1, box.x + box.width - 2);
  const p1Y = clamp(box.y + p1.y, box.y + 1, box.y + box.height - 2);
  const p2X = clamp(box.x + p2.x, box.x + 1, box.x + box.width - 2);
  const p2Y = clamp(box.y + p2.y, box.y + 1, box.y + box.height - 2);
  const p3X = clamp(box.x + p3.x, box.x + 1, box.x + box.width - 2);
  const p3Y = clamp(box.y + p3.y, box.y + 1, box.y + box.height - 2);

  // Create a triangle-like curve and close by clicking back on the first point.
  await page.mouse.click(p1X, p1Y);
  await page.mouse.click(p2X, p2Y);
  await page.mouse.click(p3X, p3Y);
  await page.mouse.click(p1X, p1Y);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        return figs.length;
      });
    })
    .toBe(beforeCount + 1);

  const last = await page.evaluate(() => {
    const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
    return figs[figs.length - 1] ?? null;
  });

  expect(last).toBeTruthy();
  expect(last!.tool).toBe("curve");
  expect(last!.closed).toBe(true);
  expect(last!.nodes.length).toBe(3);
  expect(last!.edges.length).toBe(3);
});

test("curva: Enter com 2 pontos não duplica nós", async ({ page }) => {
  await gotoEditor(page);

  await page.getByRole("button", { name: "Curva" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("curve");

  const beforeCount = await page.evaluate(
    () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
  );

  const box = await getStageBox(page);
  const p1 = { x: 220, y: 200 };
  const p2 = { x: 320, y: 220 };

  const p1X = clamp(box.x + p1.x, box.x + 1, box.x + box.width - 2);
  const p1Y = clamp(box.y + p1.y, box.y + 1, box.y + box.height - 2);
  const p2X = clamp(box.x + p2.x, box.x + 1, box.x + box.width - 2);
  const p2Y = clamp(box.y + p2.y, box.y + 1, box.y + box.height - 2);

  await page.mouse.click(p1X, p1Y);
  await page.mouse.click(p2X, p2Y);
  await page.keyboard.press("Enter");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        return figs.length;
      });
    })
    .toBe(beforeCount + 1);

  const last = await page.evaluate(() => {
    const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
    return figs[figs.length - 1] ?? null;
  });

  expect(last).toBeTruthy();
  expect(last!.tool).toBe("curve");
  expect(last!.closed).toBe(false);
  expect(last!.nodes.length).toBe(2);
});

test("visual: curva não duplica ponto no preview", async ({ page }) => {
  await gotoEditor(page);

  await page.getByRole("button", { name: "Curva" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("curve");

  const box = await getStageBox(page);
  const p1 = { x: 220, y: 200 };
  const p2 = { x: 320, y: 240 };

  const p1X = clamp(box.x + p1.x, box.x + 1, box.x + box.width - 2);
  const p1Y = clamp(box.y + p1.y, box.y + 1, box.y + box.height - 2);
  const p2X = clamp(box.x + p2.x, box.x + 1, box.x + box.width - 2);
  const p2Y = clamp(box.y + p2.y, box.y + 1, box.y + box.height - 2);

  await page.mouse.click(p1X, p1Y);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: "test-results/curve-preview-1-first-click.png",
  });

  await page.mouse.move(p2X, p2Y);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: "test-results/curve-preview-2-after-move.png",
  });
});
