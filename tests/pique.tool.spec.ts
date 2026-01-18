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

  // Right edge (x=320). This edge runs from y=200 (t01=0) to y=300 (t01=1).
  const pMid = { x: 320, y: 250 };
  const xMid = clamp(box.x + pMid.x, box.x + 2, box.x + box.width - 2);
  const yMid = clamp(box.y + pMid.y, box.y + 2, box.y + box.height - 2);

  // First insertion with Alt: locks to midpoint (t01 ~ 0.5).
  const pNearTop = { x: 320, y: 210 };
  const xNearTop = clamp(box.x + pNearTop.x, box.x + 2, box.x + box.width - 2);
  const yNearTop = clamp(box.y + pNearTop.y, box.y + 2, box.y + box.height - 2);

  await page.keyboard.down("Alt");
  await page.mouse.move(xNearTop, yNearTop);
  await page.mouse.click(xNearTop, yNearTop);
  await page.keyboard.up("Alt");

  // Second insertion with Alt, but cursor stays in the top subsegment: snaps to midpoint of [0..0.5] => ~0.25.
  const pTopAgain = { x: 320, y: 215 };
  const xTopAgain = clamp(box.x + pTopAgain.x, box.x + 2, box.x + box.width - 2);
  const yTopAgain = clamp(box.y + pTopAgain.y, box.y + 2, box.y + box.height - 2);

  await page.keyboard.down("Alt");
  await page.mouse.move(xTopAgain, yTopAgain);
  await page.mouse.click(xTopAgain, yTopAgain);
  await page.keyboard.up("Alt");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        const ts = (base?.piques ?? []).map((p) => p.t01).sort((a, b) => a - b);
        return ts;
      });
    })
    .toHaveLength(2);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        const ts = (base?.piques ?? []).map((p) => p.t01).sort((a, b) => a - b);
        return ts[0] ?? null;
      });
    })
    .toBeGreaterThan(0.2);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        const ts = (base?.piques ?? []).map((p) => p.t01).sort((a, b) => a - b);
        return ts[0] ?? null;
      });
    })
    .toBeLessThan(0.3);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        const ts = (base?.piques ?? []).map((p) => p.t01).sort((a, b) => a - b);
        return ts[1] ?? null;
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
        const ts = (base?.piques ?? []).map((p) => p.t01).sort((a, b) => a - b);
        return ts[1] ?? null;
      });
    })
    .toBeLessThan(0.55);

  // Remove both piques by clicking at their snapped locations (midpoint and quarter point).
  const pQuarter = { x: 320, y: 225 };
  const xQuarter = clamp(box.x + pQuarter.x, box.x + 2, box.x + box.width - 2);
  const yQuarter = clamp(box.y + pQuarter.y, box.y + 2, box.y + box.height - 2);

  await page.mouse.move(xQuarter, yQuarter);
  await page.mouse.click(xQuarter, yQuarter);

  await page.mouse.move(xMid, yMid);
  await page.mouse.click(xMid, yMid);

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
