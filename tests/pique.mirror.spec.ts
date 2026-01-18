import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type FigurePiqueSnapshot = {
  id: string;
  edgeId: string;
  t01: number;
  lengthCm: number;
  side: 1 | -1;
};

type FigureSnapshot = {
  id: string;
  piques?: FigurePiqueSnapshot[];
};

test("pique: espelho inverte a direção (side)", async ({ page }) => {
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
      piques: [
        {
          id: "pk1",
          edgeId: "e23",
          t01: 0.5,
          lengthCm: 0.5,
          side: 1 as const,
        },
      ],
      stroke: "aci7",
      strokeWidth: 2,
      fill: "transparent",
      opacity: 1,
    };

    window.__INAA_DEBUG__?.loadTestProject({ figures: [fig] });
  });

  await page.getByLabel("Espelhar", { exact: true }).click();
  await expect
    .poll(async () => {
      return (
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
      );
    })
    .toBe("mirror");

  // Click on the right edge (x=320, y≈250) to create a mirrored copy.
  const stage = page.getByTestId("editor-stage-container");
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  const b = box!;

  const x = Math.min(Math.max(b.x + 320, b.x + 2), b.x + b.width - 2);
  const y = Math.min(Math.max(b.y + 250, b.y + 2), b.y + b.height - 2);

  await page.mouse.move(x, y);
  await page.mouse.click(x, y);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        return list.length;
      });
    })
    .toBe(2);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        const other = list.find((f) => f.id !== "fig_base") ?? null;
        return {
          baseSide: base?.piques?.[0]?.side ?? null,
          mirrorSide: other?.piques?.[0]?.side ?? null,
        };
      });
    })
    .toEqual({ baseSide: 1, mirrorSide: -1 });
});
