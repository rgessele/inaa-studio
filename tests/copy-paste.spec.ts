import { expect, test } from "@playwright/test";
import { gotoEditor } from "./helpers/e2e";

function shortcut(isMac: boolean, key: string) {
  return `${isMac ? "Meta" : "Control"}+${key}`;
}

test("copy/paste: duplica seleção via atalho", async ({ page }) => {
  const isMac = await page.evaluate(() => {
    return /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);
  });

  page.on("pageerror", (err) => {
    // eslint-disable-next-line no-console
    console.log("PAGEERROR:", err.message);
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // eslint-disable-next-line no-console
    console.log("CONSOLE(error):", msg.text());
  });

  await gotoEditor(page);

  const debugAvailable = await page.evaluate(() => {
    return Boolean(window.__INAA_DEBUG__);
  });
  expect(debugAvailable).toBe(true);

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.addTestRectangle) {
      throw new Error("addTestRectangle not available");
    }
    window.__INAA_DEBUG__.addTestRectangle();
  });

  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  // Select the rectangle (click near its center).
  await stage.click({ position: { x: 100, y: 60 } });

  const before = await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.getFiguresSnapshot) {
      throw new Error("getFiguresSnapshot not available");
    }
    return window.__INAA_DEBUG__.getFiguresSnapshot();
  });

  expect(before.length).toBeGreaterThan(0);

  const base = before.find((f) => !f.kind);
  expect(base).toBeTruthy();

  await page.keyboard.press(shortcut(isMac, "C"));
  await page.keyboard.press(shortcut(isMac, "V"));

  const after = await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.getFiguresSnapshot) {
      throw new Error("getFiguresSnapshot not available");
    }
    return window.__INAA_DEBUG__.getFiguresSnapshot();
  });

  // One new figure should be created (no seams in this scenario).
  expect(after.length).toBe(before.length + 1);

  const afterBases = after.filter((f) => !f.kind);
  expect(afterBases.length).toBe(
    before.filter((f) => !f.kind).length + 1
  );

  // Verify the pasted figure is offset from the original.
  const pasted = afterBases[afterBases.length - 1];
  expect(pasted.id).not.toBe(base!.id);
  expect(pasted.x).toBeCloseTo(base!.x + 20, 1);
  expect(pasted.y).toBeCloseTo(base!.y + 20, 1);
});
