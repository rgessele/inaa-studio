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

test("linha: Enter com 1 ponto cancela", async ({ page }) => {
  await gotoEditor(page);

  await page.getByRole("button", { name: "Linha" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("line");

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

test("linha: fecha ao clicar no primeiro nó", async ({ page }) => {
  await gotoEditor(page);

  await page.getByRole("button", { name: "Linha" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("line");

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

  // Create a triangle and close by clicking back on the first point.
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
  expect(last!.tool).toBe("line");
  expect(last!.closed).toBe(true);
  expect(last!.nodes.length).toBe(3);
  expect(last!.edges.length).toBe(3);
});

test("linha: Enter com 2 pontos não duplica nós", async ({ page }) => {
  await gotoEditor(page);

  await page.getByRole("button", { name: "Linha" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("line");

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
  expect(last!.tool).toBe("line");
  expect(last!.closed).toBe(false);
  expect(last!.nodes.length).toBe(2);
});

test("visual: linha não duplica ponto no preview", async ({ page }) => {
  await gotoEditor(page);

  await page.getByRole("button", { name: "Linha" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("line");

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
    path: "test-results/line-preview-1-first-click.png",
  });

  await page.mouse.move(p2X, p2Y);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: "test-results/line-preview-2-after-move.png",
  });
});

test("visual: guia de ângulo aparece em 90/180", async ({ page }) => {
  await gotoEditor(page);

  await page.getByRole("button", { name: "Linha" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("line");

  const box = await getStageBox(page);
  const p1 = { x: 220, y: 200 };
  const pHoriz = { x: 380, y: 200 };
  const pVert = { x: 220, y: 360 };

  const p1X = clamp(box.x + p1.x, box.x + 1, box.x + box.width - 2);
  const p1Y = clamp(box.y + p1.y, box.y + 1, box.y + box.height - 2);
  const pHX = clamp(box.x + pHoriz.x, box.x + 1, box.x + box.width - 2);
  const pHY = clamp(box.y + pHoriz.y, box.y + 1, box.y + box.height - 2);
  const pVX = clamp(box.x + pVert.x, box.x + 1, box.x + box.width - 2);
  const pVY = clamp(box.y + pVert.y, box.y + 1, box.y + box.height - 2);

  await page.mouse.click(p1X, p1Y);
  await page.waitForTimeout(100);

  await page.keyboard.down("Shift");
  await page.mouse.move(pHX, pHY);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: "test-results/line-angle-guide-horizontal.png",
  });

  await page.mouse.move(pVX, pVY);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: "test-results/line-angle-guide-vertical.png",
  });
  await page.keyboard.up("Shift");
});

test("com magnetJoin ativo, clicar no primeiro ponto FECHA a figura", async ({
  page,
}) => {
  await gotoEditor(page);

  // ATIVAR MAGNET JOIN
  const magnetJoinToggle = page.getByTestId("magnet-join-toggle-button");
  await magnetJoinToggle.click();
  await page.waitForTimeout(100);

  const magnetJoinEnabled = await page.evaluate(() => {
    return window.__INAA_DEBUG__?.getState()?.magnetJoinEnabled;
  });
  console.log("magnetJoinEnabled:", magnetJoinEnabled);
  expect(magnetJoinEnabled).toBe(true);

  await page.getByRole("button", { name: "Linha" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("line");

  const beforeCount = await page.evaluate(
    () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
  );

  const box = await getStageBox(page);
  const cx = box.width / 2;
  const cy = box.height / 2;

  const p1 = { x: cx, y: cy - 100 };
  const p2 = { x: cx + 100, y: cy + 80 };
  const p3 = { x: cx - 100, y: cy + 80 };

  // Desenhar triângulo: 3 pontos
  await page.mouse.click(box.x + p1.x, box.y + p1.y);
  await page.waitForTimeout(50);
  await page.mouse.click(box.x + p2.x, box.y + p2.y);
  await page.waitForTimeout(50);
  await page.mouse.click(box.x + p3.x, box.y + p3.y);
  await page.waitForTimeout(50);

  // Hover no primeiro ponto
  await page.mouse.move(box.x + p1.x, box.y + p1.y);
  await page.waitForTimeout(100);

  // Clicar no primeiro ponto - DEVE fechar a figura mesmo com magnetJoin ativo
  await page.mouse.click(box.x + p1.x, box.y + p1.y);
  await page.waitForTimeout(100);

  // Verificar se lineDraft foi limpo (figura fechada)
  const lineDraft = await page.evaluate(() => {
    return window.__INAA_DEBUG__?.getState()?.lineDraft;
  });

  console.log(
    "lineDraft após clicar no P1:",
    lineDraft ? `ATIVO com ${lineDraft.pointsWorld?.length} pontos` : "NULL/UNDEFINED"
  );

  // Com a correção, lineDraft deve ser falsy (null ou undefined = figura fechou)
  expect(lineDraft).toBeFalsy();

  // Verificar que a figura foi criada e está fechada
  const figures = await page.evaluate(() => {
    const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
    return figs;
  });

  expect(figures.length).toBe(beforeCount + 1);
  const lastFig = figures[figures.length - 1];
  expect(lastFig.closed).toBe(true);
  expect(lastFig.nodes.length).toBe(3);
  expect(lastFig.edges.length).toBe(3);
  console.log("Figura criada: closed=", lastFig.closed, "nodes=", lastFig.nodes.length);
});
