import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type Box = { x: number; y: number; width: number; height: number };

type DartSnapshot = {
  id: string;
  aNodeId: string;
  bNodeId: string;
  cNodeId: string;
};

type NodeSnapshot = { id: string; x: number; y: number };

type FigureSnapshot = {
  id: string;
  darts?: DartSnapshot[];
  nodes: NodeSnapshot[];
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

test("pence: Cmd alta precisão não quebra preview/commit durante posicionamento do ápice", async ({
  page,
}) => {
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

    window.__INAA_DEBUG__?.loadTestProject?.({ figures: [fig] });
  });

  await page.getByRole("button", { name: "Pence" }).click();
  await expect
    .poll(async () => {
      return (
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
      );
    })
    .toBe("dart");

  const box = await getStageBox(page);

  // A and B on the top edge (y=200)
  const pA = { x: 245, y: 200 };
  const pB = { x: 295, y: 200 };
  const pApex = { x: 270, y: 235 };

  const toScreen = (p: { x: number; y: number }) => {
    return {
      x: clamp(box.x + p.x, box.x + 2, box.x + box.width - 2),
      y: clamp(box.y + p.y, box.y + 2, box.y + box.height - 2),
    };
  };

  // Click A
  {
    const s = toScreen(pA);
    await page.mouse.move(s.x, s.y);
    await page.mouse.click(s.x, s.y);
  }

  // Click B
  {
    const s = toScreen(pB);
    await page.mouse.move(s.x, s.y);
    await page.mouse.click(s.x, s.y);
  }

  // While positioning apex, toggle Cmd (Meta) to enable high precision.
  {
    const s = toScreen(pApex);
    await page.mouse.move(s.x, s.y);

    await page.keyboard.down("Meta");
    await page.mouse.move(s.x + 7, s.y + 3);
    await page.mouse.move(s.x + 2, s.y + 1);
    await page.mouse.click(s.x + 2, s.y + 1);
    await page.keyboard.up("Meta");
  }

  // Assert dart was created and the apex node has finite coordinates.
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        const dart = base?.darts?.[0] ?? null;
        if (!base || !dart) return null;

        const apex = base.nodes.find((n) => n.id === dart.cNodeId) ?? null;
        if (!apex) return null;

        return {
          dartsCount: base.darts?.length ?? 0,
          apexX: apex.x,
          apexY: apex.y,
        };
      });
    })
    .toEqual(
      expect.objectContaining({
        dartsCount: 1,
        apexX: expect.any(Number),
        apexY: expect.any(Number),
      })
    );

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs =
          (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        const dart = base?.darts?.[0] ?? null;
        if (!base || !dart) return null;

        const apex = base.nodes.find((n) => n.id === dart.cNodeId) ?? null;
        if (!apex) return null;

        const ok = Number.isFinite(apex.x) && Number.isFinite(apex.y);
        return ok ? "ok" : "bad";
      });
    })
    .toBe("ok");
});
