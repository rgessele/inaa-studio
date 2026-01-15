import { test, expect } from "@playwright/test";
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

test("texto: inserir e editar inline (Cmd/Ctrl+Enter)", async ({ page }) => {
  await gotoEditor(page);

  await page.keyboard.press("t");
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("text");

  const beforeCount = await page.evaluate(
    () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
  );

  const box = await getStageBox(page);
  const p1 = { x: 240, y: 180 };
  const p1X = clamp(box.x + p1.x, box.x + 2, box.x + box.width - 3);
  const p1Y = clamp(box.y + p1.y, box.y + 2, box.y + box.height - 3);

  await page.mouse.click(p1X, p1Y);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        return figs.length;
      });
    })
    .toBe(beforeCount + 1);

  await expect(page.getByTestId("text-inline-editor")).toBeVisible();
  await page.getByTestId("text-inline-editor").fill("Olá\nMundo");
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Enter" : "Control+Enter"
  );

  await expect(page.getByTestId("text-inline-editor")).toHaveCount(0);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        const last = figs[figs.length - 1];
        const maybeText = last as { textValue?: unknown } | undefined;
        return {
          tool: last?.tool ?? null,
          textValue:
            typeof maybeText?.textValue === "string"
              ? maybeText.textValue
              : null,
        };
      });
    })
    .toEqual({ tool: "text", textValue: "Olá\nMundo" });

  // Also verify the side panel is wired for text.
  const panelToggle = page.getByRole("button", { name: "Exibir painel" });
  if (await panelToggle.isVisible()) {
    await panelToggle.click();
  }
  await expect(page.getByTestId("text-content")).toBeVisible();
  await expect(page.getByTestId("text-content")).toHaveValue("Olá\nMundo");
});
