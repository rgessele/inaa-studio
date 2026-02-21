import { test, expect } from "./helpers/test";
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
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  return box as Box;
}

test("node: clicar na interseção funde arestas e mescla figuras", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    const mkLineFigure = (
      figureId: string,
      edgeId: string,
      fromId: string,
      toId: string,
      from: { x: number; y: number },
      to: { x: number; y: number }
    ) => ({
      id: figureId,
      tool: "line" as const,
      x: 0,
      y: 0,
      rotation: 0,
      closed: false,
      nodes: [
        { id: fromId, x: from.x, y: from.y, mode: "corner" as const },
        { id: toId, x: to.x, y: to.y, mode: "corner" as const },
      ],
      edges: [{ id: edgeId, from: fromId, to: toId, kind: "line" as const }],
      stroke: "aci7",
      strokeWidth: 2,
      fill: "transparent",
      opacity: 1,
    });

    const figA = mkLineFigure(
      "fig_a",
      "edge_a",
      "a1",
      "a2",
      { x: 120, y: 120 },
      { x: 320, y: 320 }
    );
    const figB = mkLineFigure(
      "fig_b",
      "edge_b",
      "b1",
      "b2",
      { x: 120, y: 320 },
      { x: 320, y: 120 }
    );

    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }
    window.__INAA_DEBUG__.loadTestProject({ figures: [figA, figB] });
  });

  await page.keyboard.press("N");
  const box = await getStageBox(page);

  const selectX = clamp(box.x + 150, box.x + 1, box.x + box.width - 2);
  const selectY = clamp(box.y + 150, box.y + 1, box.y + box.height - 2);
  await page.mouse.click(selectX, selectY);

  const interX = clamp(box.x + 220, box.x + 1, box.x + box.width - 2);
  const interY = clamp(box.y + 220, box.y + 1, box.y + box.height - 2);
  await page.mouse.click(interX, interY);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const snap = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        return snap.length;
      });
    })
    .toBe(1);

  const merged = await page.evaluate(() => {
    const snap = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
    return snap[0] ?? null;
  });

  expect(merged).toBeTruthy();
  expect(merged!.nodes.length).toBe(5);
  expect(merged!.edges.length).toBe(4);

  const centerNode = merged!.nodes.find(
    (n: { x: number; y: number }) =>
      Math.hypot(n.x - 220, n.y - 220) <= 2
  );
  expect(centerNode).toBeTruthy();

  const incident = merged!.edges.filter(
    (e: { from: string; to: string }) =>
      e.from === centerNode.id || e.to === centerNode.id
  );
  expect(incident.length).toBe(4);
});

test("node: interseção ambígua por sobreposição não deve fundir", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    const mkLineFigure = (
      figureId: string,
      edgeId: string,
      fromId: string,
      toId: string,
      from: { x: number; y: number },
      to: { x: number; y: number }
    ) => ({
      id: figureId,
      tool: "line" as const,
      x: 0,
      y: 0,
      rotation: 0,
      closed: false,
      nodes: [
        { id: fromId, x: from.x, y: from.y, mode: "corner" as const },
        { id: toId, x: to.x, y: to.y, mode: "corner" as const },
      ],
      edges: [{ id: edgeId, from: fromId, to: toId, kind: "line" as const }],
      stroke: "aci7",
      strokeWidth: 2,
      fill: "transparent",
      opacity: 1,
    });

    const figA = mkLineFigure(
      "fig_overlap_a",
      "edge_overlap_a",
      "oa1",
      "oa2",
      { x: 100, y: 200 },
      { x: 340, y: 200 }
    );
    const figB = mkLineFigure(
      "fig_overlap_b",
      "edge_overlap_b",
      "ob1",
      "ob2",
      { x: 180, y: 200 },
      { x: 400, y: 200 }
    );

    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }
    window.__INAA_DEBUG__.loadTestProject({ figures: [figA, figB] });
  });

  await page.keyboard.press("N");
  const box = await getStageBox(page);

  const selectX = clamp(box.x + 120, box.x + 1, box.x + box.width - 2);
  const selectY = clamp(box.y + 200, box.y + 1, box.y + box.height - 2);
  await page.mouse.click(selectX, selectY);

  const overlapX = clamp(box.x + 240, box.x + 1, box.x + box.width - 2);
  const overlapY = clamp(box.y + 200, box.y + 1, box.y + box.height - 2);
  await page.mouse.click(overlapX, overlapY);

  const snap = await page.evaluate(() => {
    return window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
  });

  expect(snap.length).toBe(2);
  for (const fig of snap as Array<{
    nodes: Array<unknown>;
    edges: Array<unknown>;
  }>) {
    expect(fig.nodes.length).toBe(2);
    expect(fig.edges.length).toBe(1);
  }
});
