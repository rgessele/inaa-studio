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

  const stageCanvas = stage.locator("canvas").last();
  await expect(stageCanvas).toBeVisible();
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

test("caneta: arrasto mão livre cria traço aberto", async ({ page }) => {
  await gotoEditor(page);

  await page.getByRole("button", { name: "Caneta" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("pen");

  const beforeCount = await page.evaluate(
    () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
  );

  const box = await getStageBox(page);

  const p0 = { x: 220, y: 180 };
  const p1 = { x: 270, y: 140 };
  const p2 = { x: 330, y: 210 };
  const p3 = { x: 390, y: 170 };
  const p4 = { x: 440, y: 235 };

  const points = [p0, p1, p2, p3, p4].map((p) => ({
    x: clamp(box.x + p.x, box.x + 1, box.x + box.width - 2),
    y: clamp(box.y + p.y, box.y + 1, box.y + box.height - 2),
  }));

  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (let i = 1; i < points.length; i++) {
    await page.mouse.move(points[i].x, points[i].y, { steps: 10 });
  }
  await page.mouse.up();

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
  expect(last!.tool).toBe("line");
  expect(last!.closed).toBe(false);
  expect(last!.nodes.length).toBeGreaterThan(2);
  expect(last!.edges.length).toBe(last!.nodes.length - 1);
});

test("caneta: fechar voltando ao início gera forma fechada", async ({ page }) => {
  await gotoEditor(page);

  await page.getByRole("button", { name: "Caneta" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("pen");

  const beforeCount = await page.evaluate(
    () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
  );

  const box = await getStageBox(page);

  const p0 = { x: 220, y: 250 };
  const p1 = { x: 320, y: 230 };
  const p2 = { x: 360, y: 300 };
  const p3 = { x: 280, y: 340 };

  const toWorld = (p: { x: number; y: number }) => ({
    x: clamp(box.x + p.x, box.x + 1, box.x + box.width - 2),
    y: clamp(box.y + p.y, box.y + 1, box.y + box.height - 2),
  });

  const w0 = toWorld(p0);
  const w1 = toWorld(p1);
  const w2 = toWorld(p2);
  const w3 = toWorld(p3);

  await page.mouse.move(w0.x, w0.y);
  await page.mouse.down();
  await page.mouse.move(w1.x, w1.y, { steps: 12 });
  await page.mouse.move(w2.x, w2.y, { steps: 12 });
  await page.mouse.move(w3.x, w3.y, { steps: 12 });
  await page.mouse.move(w0.x, w0.y, { steps: 12 });
  await page.mouse.up();

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
  expect(last!.tool).toBe("line");
  expect(last!.closed).toBe(true);
  expect(last!.nodes.length).toBeGreaterThanOrEqual(3);
  expect(last!.edges.length).toBe(last!.nodes.length);
});
