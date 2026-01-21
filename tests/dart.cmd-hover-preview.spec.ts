import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type Box = { x: number; y: number; width: number; height: number };

type FigureSnapshot = {
  id: string;
  nodes: Array<{ id: string; x: number; y: number }>;
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

test("pence: Cmd alta precisão não deve esconder preview do ponto A", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    const n1 = { id: "n1", x: 220, y: 200, mode: "corner" as const };
    const n2 = { id: "n2", x: 420, y: 200, mode: "corner" as const };
    const n3 = { id: "n3", x: 420, y: 300, mode: "corner" as const };
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

  // Hover somewhere along the top edge.
  const hoverWorld = { x: 300, y: 200 };
  const toScreen = (p: { x: number; y: number }) => {
    return {
      x: clamp(box.x + p.x, box.x + 2, box.x + box.width - 2),
      y: clamp(box.y + p.y, box.y + 2, box.y + box.height - 2),
    };
  };

  const s = toScreen(hoverWorld);
  await page.mouse.move(s.x, s.y);

  // Baseline: preview labels for point A are visible.
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return window.__INAA_DEBUG__?.countStageNodesByName?.(
          "inaa-dart-preview-a"
        );
      });
    })
    .toBeGreaterThan(0);

  const before = await page.evaluate(() => {
    return window.__INAA_DEBUG__?.getStageNodeAbsolutePositionsByName?.(
      "inaa-dart-preview-a"
    );
  });

  // Hold Cmd (Meta) to enable high precision while hovering.
  await page.keyboard.down("Meta");
  await page.mouse.move(s.x + 1, s.y + 1);

  // Preview should still be present (this was previously disappearing).
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return window.__INAA_DEBUG__?.countStageNodesByName?.(
          "inaa-dart-preview-a"
        );
      });
    })
    .toBeGreaterThan(0);

  // Move along the edge while still holding Cmd; the preview should move.
  await page.mouse.move(s.x + 50, s.y);
  const after = await page.evaluate(() => {
    return window.__INAA_DEBUG__?.getStageNodeAbsolutePositionsByName?.(
      "inaa-dart-preview-a"
    );
  });

  expect(Array.isArray(before)).toBeTruthy();
  expect(Array.isArray(after)).toBeTruthy();

  const moved = (() => {
    const b = Array.isArray(before)
      ? (before as Array<{ x: number; y: number }>).filter(
          (p) => Number.isFinite(p.x) && Number.isFinite(p.y)
        )
      : [];
    const a = Array.isArray(after)
      ? (after as Array<{ x: number; y: number }>).filter(
          (p) => Number.isFinite(p.x) && Number.isFinite(p.y)
        )
      : [];
    if (b.length === 0 || a.length === 0) return false;
    const n = Math.min(b.length, a.length);
    let maxD = 0;
    for (let i = 0; i < n; i++) {
      const dx = a[i].x - b[i].x;
      const dy = a[i].y - b[i].y;
      const d = Math.hypot(dx, dy);
      if (d > maxD) maxD = d;
    }
    return maxD > 1;
  })();
  expect(moved).toBeTruthy();

  await page.keyboard.up("Meta");

  // Sanity: still hovering the same figure and nothing exploded.
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs = (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ??
          []) as unknown;
        const list = Array.isArray(figs) ? (figs as FigureSnapshot[]) : [];
        const base = list.find((f) => f.id === "fig_base") ?? null;
        return base ? base.nodes.length : 0;
      });
    })
    .toBeGreaterThan(0);
});
