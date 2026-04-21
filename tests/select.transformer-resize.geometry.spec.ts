import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type AnchorName =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

// Regression: Konva's node.getTransform().getMatrix() returns a live reference
// that mutates when node.scaleX/Y or node.skewX/Y are reset. If the capture is
// not cloned before the reset, the bake uses an identity-scale matrix and the
// figure appears to "snap back" to its pre-resize geometry.
async function loadRect(page: Page, figId: string, rotation = 0) {
  await page.evaluate(
    ({ targetId, rot }) => {
      window.__INAA_DEBUG__!.loadTestProject!({
        projectId: "resize-geometry",
        projectName: "Resize geometry",
        figures: [
          {
            id: targetId,
            tool: "rectangle",
            x: 260,
            y: 220,
            rotation: rot,
            closed: true,
            stroke: "aci7",
            strokeWidth: 2,
            fill: "transparent",
            opacity: 1,
            nodes: [
              { x: 0, y: 0 },
              { x: 200, y: 0 },
              { x: 200, y: 120 },
              { x: 0, y: 120 },
            ].map((n, i) => ({
              id: `${targetId}_n${i + 1}`,
              x: n.x,
              y: n.y,
              mode: "corner" as const,
            })),
            edges: [
              { id: `${targetId}_e1`, from: `${targetId}_n1`, to: `${targetId}_n2`, kind: "line" as const },
              { id: `${targetId}_e2`, from: `${targetId}_n2`, to: `${targetId}_n3`, kind: "line" as const },
              { id: `${targetId}_e3`, from: `${targetId}_n3`, to: `${targetId}_n4`, kind: "line" as const },
              { id: `${targetId}_e4`, from: `${targetId}_n4`, to: `${targetId}_n1`, kind: "line" as const },
            ],
          },
        ],
      });
    },
    { targetId: figId, rot: rotation }
  );
}

async function dragAnchor(
  page: Page,
  box: { x: number; y: number },
  anchorName: AnchorName,
  dxPx: number,
  dyPx: number
) {
  const rect = await page.evaluate((name) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const konva = (window as any).Konva;
    const a = konva.stages[0].findOne(`.${name}`);
    if (!a) return null;
    const r = a.getClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, anchorName);
  expect(rect).toBeTruthy();
  const startX = box.x + rect!.x + rect!.w / 2;
  const startY = box.y + rect!.y + rect!.h / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dxPx * 0.1, startY + dyPx * 0.1, { steps: 3 });
  await page.mouse.move(startX + dxPx, startY + dyPx, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function figureSnapshot(page: Page, figId: string) {
  return await page.evaluate((id) => {
    return window.__INAA_DEBUG__?.getFiguresSnapshot?.().find((f) => f.id === id);
  }, figId);
}

test("resize bottom-right anchor scales node geometry outward", async ({ page }) => {
  await gotoEditor(page);
  const figId = "fig_br";
  await loadRect(page, figId);
  const stage = page.getByTestId("editor-stage-container");
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.click(box!.x + 360, box!.y + 280);
  await page.waitForTimeout(150);

  await dragAnchor(page, box!, "bottom-right", 50, 50);
  const after = await figureSnapshot(page, figId);
  const n3 = after?.nodes?.[2];
  expect(n3!.x).toBeGreaterThan(220);
  expect(n3!.y).toBeGreaterThan(140);
});

test("resize middle-left anchor extends width", async ({ page }) => {
  await gotoEditor(page);
  const figId = "fig_ml";
  await loadRect(page, figId);
  const stage = page.getByTestId("editor-stage-container");
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.click(box!.x + 360, box!.y + 280);
  await page.waitForTimeout(150);

  await dragAnchor(page, box!, "middle-left", -60, 0);
  const after = await figureSnapshot(page, figId);
  const n2 = after?.nodes?.[1];
  expect(n2!.x).toBeGreaterThan(220);
});

test("resize rotated rectangle preserves rotation and scales geometry", async ({ page }) => {
  await gotoEditor(page);
  const figId = "fig_rot";
  await loadRect(page, figId, 30);
  const stage = page.getByTestId("editor-stage-container");
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.click(box!.x + 340, box!.y + 290);
  await page.waitForTimeout(150);
  let sel = await page.evaluate(() => window.__INAA_DEBUG__?.getState().selectedFigureId);
  if (sel !== figId) {
    await page.mouse.click(box!.x + 320, box!.y + 300);
    await page.waitForTimeout(150);
    sel = await page.evaluate(() => window.__INAA_DEBUG__?.getState().selectedFigureId);
  }
  expect(sel).toBe(figId);

  const before = await figureSnapshot(page, figId);
  await dragAnchor(page, box!, "top-center", 0, -80);
  const after = await figureSnapshot(page, figId);

  expect(after?.rotation).toBeCloseTo(before!.rotation ?? 0, 1);
  const changed = after!.nodes.some((n, i) => {
    const b = before!.nodes[i];
    return Math.abs(n.x - b.x) > 1 || Math.abs(n.y - b.y) > 1;
  });
  expect(changed).toBe(true);
});

test("resize: consecutive resizes accumulate geometry changes", async ({ page }) => {
  await gotoEditor(page);
  const figId = "fig_seq";
  await loadRect(page, figId);
  const stage = page.getByTestId("editor-stage-container");
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.click(box!.x + 360, box!.y + 280);
  await page.waitForTimeout(150);

  await dragAnchor(page, box!, "top-center", 0, -80);
  await page.waitForTimeout(200);
  await dragAnchor(page, box!, "bottom-right", 40, 40);

  const after = await figureSnapshot(page, figId);
  const n3 = after?.nodes?.[2];
  expect(n3!.x).toBeGreaterThan(210);
  expect(n3!.y).toBeGreaterThan(150);
});
