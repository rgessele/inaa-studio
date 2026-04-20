import { expect, test } from "./helpers/test";
import { getEditorState, gotoEditor } from "./helpers/e2e";

type Box = { x: number; y: number; width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function getStageBox(
  page: import("@playwright/test").Page
): Promise<Box> {
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  return box as Box;
}

async function chooseLineMode(
  page: import("@playwright/test").Page,
  mode: "single" | "continuous"
) {
  await page.getByTestId("line-tool-button").click();
  await expect(page.getByTestId("line-tool-mode-popover")).toBeVisible();
  await page.getByTestId(`line-tool-mode-${mode}`).click();
  await expect(page.getByTestId("line-tool-mode-popover")).toHaveCount(0);
  await expect
    .poll(async () => (await getEditorState(page)).tool)
    .toBe("line");
  await expect
    .poll(async () => (await getEditorState(page)).lineToolMode)
    .toBe(mode);
}

test("linha simples: segundo clique finaliza a figura imediatamente", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    window.__INAA_DEBUG__?.loadTestProject?.({ figures: [] });
  });

  await chooseLineMode(page, "single");

  const beforeCount = await page.evaluate(
    () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
  );

  const box = await getStageBox(page);
  const p1 = { x: 220, y: 190 };
  const p2 = { x: 340, y: 240 };

  await page.mouse.click(
    clamp(box.x + p1.x, box.x + 1, box.x + box.width - 2),
    clamp(box.y + p1.y, box.y + 1, box.y + box.height - 2)
  );
  await page.mouse.move(
    clamp(box.x + p2.x, box.x + 1, box.x + box.width - 2),
    clamp(box.y + p2.y, box.y + 1, box.y + box.height - 2)
  );
  await page.mouse.click(
    clamp(box.x + p2.x, box.x + 1, box.x + box.width - 2),
    clamp(box.y + p2.y, box.y + 1, box.y + box.height - 2)
  );

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
  expect(last!.edges.length).toBe(1);
});

test("linha simples: Enter não finaliza a figura", async ({ page }) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    window.__INAA_DEBUG__?.loadTestProject?.({ figures: [] });
  });

  await chooseLineMode(page, "single");

  const box = await getStageBox(page);
  const p1 = { x: 240, y: 210 };
  const p2 = { x: 360, y: 250 };

  await page.mouse.click(
    clamp(box.x + p1.x, box.x + 1, box.x + box.width - 2),
    clamp(box.y + p1.y, box.y + 1, box.y + box.height - 2)
  );
  await page.keyboard.press("Enter");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        return figs.length;
      });
    })
    .toBe(0);

  await page.mouse.click(
    clamp(box.x + p2.x, box.x + 1, box.x + box.width - 2),
    clamp(box.y + p2.y, box.y + 1, box.y + box.height - 2)
  );

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        return figs.length;
      });
    })
    .toBe(1);
});

test("linha: último submodo persiste após reload e via atalho L", async ({
  page,
}) => {
  await gotoEditor(page);

  await chooseLineMode(page, "single");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__INAA_DEBUG__), {
    timeout: 15_000,
  });

  await expect
    .poll(async () => (await getEditorState(page)).lineToolMode)
    .toBe("single");

  await page.keyboard.press("V");
  await expect
    .poll(async () => (await getEditorState(page)).tool)
    .toBe("select");

  await page.keyboard.press("L");
  await expect
    .poll(async () => (await getEditorState(page)).tool)
    .toBe("line");
  await expect
    .poll(async () => (await getEditorState(page)).lineToolMode)
    .toBe("single");

  await chooseLineMode(page, "continuous");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__INAA_DEBUG__), {
    timeout: 15_000,
  });

  await expect
    .poll(async () => (await getEditorState(page)).lineToolMode)
    .toBe("continuous");
});
