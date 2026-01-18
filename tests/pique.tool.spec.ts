import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type Box = { x: number; y: number; width: number; height: number };

type PiqueSnapshot = {
  id: string;
  edgeId: string;
  t01: number;
  lengthCm: number;
  side: 1 | -1;
};

type FigureSnapshot = {
  id: string;
  piques?: PiqueSnapshot[];
};

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

test("pique: adiciona e remove em figura fechada", async ({ page }) => {
  await gotoEditor(page);

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
      edges: [e12, e23, e34, e41],
      stroke: "aci7",
      strokeWidth: 2,
      fill: "transparent",
      opacity: 1,
    };

    window.__INAA_DEBUG__?.loadTestProject({ figures: [fig] });
  });

  await page.getByRole("button", { name: "Pique" }).click();
  await expect
    .poll(async () => {
      return (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ?? null;
    })
    .toBe("pique");

  const box = await getStageBox(page);

  // Point on the right edge (x=320) roughly centered.
  const p = { x: 320, y: 250 };
  const x = clamp(box.x + p.x, box.x + 2, box.x + box.width - 2);
  const y = clamp(box.y + p.y, box.y + 2, box.y + box.height - 2);

  // With Alt/Option held, the hover/click locks to the midpoint.
  const pNear = { x: 320, y: 210 };
  const xNear = clamp(box.x + pNear.x, box.x + 2, box.x + box.width - 2);
  const yNear = clamp(box.y + pNear.y, box.y + 2, box.y + box.height - 2);

  await page.keyboard.down("Alt");
  await page.mouse.move(xNear, yNear);
  await page.mouse.click(xNear, yNear);
  await page.keyboard.up("Alt");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        const pk = base?.piques?.[0] ?? null;
        return pk?.t01 ?? null;
      });
    })
    .toBeGreaterThan(0.45);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        const pk = base?.piques?.[0] ?? null;
        return pk?.t01 ?? null;
      });
    })
    .toBeLessThan(0.55);

  // Remove the inserted pique (move to the midpoint so hover removal hits it).
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        return base?.piques?.length ?? 0;
      });
    })
    .toBe(0);

  await page.mouse.move(x, y);
  await page.mouse.click(x, y);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        return base?.piques?.length ?? 0;
      });
    })
    .toBe(1);

  // Move again to ensure hover detection runs, then click to remove.
  await page.mouse.move(x + 1, y + 1);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        return base?.piques?.length ?? 0;
      });
    })
    .toBe(0);
});
