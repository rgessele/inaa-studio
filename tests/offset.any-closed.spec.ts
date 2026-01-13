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

test("margem: funciona em figura fechada com edges fora de ordem", async ({
  page,
}) => {
  await gotoEditor(page);

  // Load a closed square, but shuffle the edges array.
  await page.evaluate(() => {
    const n1 = { id: "n1", x: 220, y: 200, mode: "corner" as const };
    const n2 = { id: "n2", x: 320, y: 200, mode: "corner" as const };
    const n3 = { id: "n3", x: 320, y: 300, mode: "corner" as const };
    const n4 = { id: "n4", x: 220, y: 300, mode: "corner" as const };

    const e12 = { id: "e12", from: "n1", to: "n2", kind: "line" as const };
    const e23 = { id: "e23", from: "n2", to: "n3", kind: "line" as const };
    const e34 = { id: "e34", from: "n3", to: "n4", kind: "line" as const };
    const e41 = { id: "e41", from: "n4", to: "n1", kind: "line" as const };

    const fig = {
      id: "fig_base",
      tool: "line" as const,
      x: 0,
      y: 0,
      rotation: 0,
      closed: true,
      nodes: [n1, n2, n3, n4],
      edges: [e23, e41, e12, e34],
      stroke: "aci7",
      strokeWidth: 2,
      fill: "transparent",
      opacity: 1,
    };

    window.__INAA_DEBUG__?.loadTestProject({ figures: [fig] });
  });

  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getState().figuresCount
        )) ?? 0
    )
    .toBe(1);

  await page.getByRole("button", { name: "Margem de costura" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("offset");

  const before = await page.evaluate(
    () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
  );

  const box = await getStageBox(page);

  // Click inside the square area.
  const p = { x: 270, y: 250 };
  const x = clamp(box.x + p.x, box.x + 2, box.x + box.width - 2);
  const y = clamp(box.y + p.y, box.y + 2, box.y + box.height - 2);
  await page.mouse.click(x, y);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        return figs.length;
      });
    })
    .toBe(before + 1);

  const seam = await page.evaluate(() => {
    const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
    return figs.find((f) => f.kind === "seam") ?? null;
  });

  expect(seam).toBeTruthy();
  expect(seam!.parentId).toBe("fig_base");
  expect(seam!.closed).toBe(true);
});
