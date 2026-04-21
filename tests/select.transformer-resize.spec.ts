import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

const ORIGINAL_RECT = {
  x: 260,
  y: 220,
  rotation: 0,
  nodes: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 120 },
    { x: 0, y: 120 },
  ],
};

async function readResizeState(page: Page, figId: string) {
  return await page.evaluate((targetId) => {
    const debug = window.__INAA_DEBUG__;
    type KonvaNodeLike = {
      x: () => number;
      y: () => number;
      scaleX: () => number;
      scaleY: () => number;
      skewX: () => number;
      skewY: () => number;
      getClientRect?: () => {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
    type KonvaStageLike = {
      findOne: (selector: string) => KonvaNodeLike | null;
    };
    const konva = (
      window as typeof window & {
        Konva?: { stages?: KonvaStageLike[] };
      }
    ).Konva;
    if (!debug?.getState || !debug.getFiguresSnapshot) {
      throw new Error("__INAA_DEBUG__ helpers not available");
    }

    const stage =
      konva && Array.isArray(konva.stages)
        ? konva.stages[0] ?? null
        : null;
    const node = stage?.findOne(`.fig_${targetId}`) ?? null;
    const anchorNode = stage?.findOne(".top-center") ?? null;

    return {
      state: debug.getState(),
      figure:
        debug.getFiguresSnapshot().find((fig) => fig.id === targetId) ?? null,
      anchor:
        debug.getStageNodeAbsolutePositionsByName?.("top-center")?.[0] ?? null,
      anchorRect: anchorNode?.getClientRect?.() ?? null,
      node: node
        ? {
            x: node.x(),
            y: node.y(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
            skewX: node.skewX(),
            skewY: node.skewY(),
          }
        : null,
    };
  }, figId);
}

function figureStillMatchesOriginal(
  figure: Awaited<ReturnType<typeof readResizeState>>["figure"]
) {
  if (!figure) return false;
  if (figure.x !== ORIGINAL_RECT.x) return false;
  if (figure.y !== ORIGINAL_RECT.y) return false;
  if (figure.rotation !== ORIGINAL_RECT.rotation) return false;
  if (figure.nodes.length !== ORIGINAL_RECT.nodes.length) return false;
  return figure.nodes.every((node, index) => {
    const original = ORIGINAL_RECT.nodes[index];
    if (!original) return false;
    return node.x === original.x && node.y === original.y;
  });
}

function isResizeCommitted(
  figId: string,
  snapshot: Awaited<ReturnType<typeof readResizeState>>
) {
  return {
    selectedFigureId: snapshot.state.selectedFigureId,
    anchorVisible:
      !!snapshot.anchor &&
      Number.isFinite(snapshot.anchor.x) &&
      Number.isFinite(snapshot.anchor.y) &&
      snapshot.anchor.y > -1_000_000,
    geometryChanged: !figureStillMatchesOriginal(snapshot.figure),
    nodeReset:
      !!snapshot.node &&
      Math.abs(snapshot.node.scaleX - 1) < 1e-3 &&
      Math.abs(snapshot.node.scaleY - 1) < 1e-3 &&
      Math.abs(snapshot.node.skewX) < 1e-3 &&
      Math.abs(snapshot.node.skewY) < 1e-3,
    matchesTarget: snapshot.state.selectedFigureId === figId,
  };
}

test("select tool: top-center resize handle commits geometry without dropping selection", async ({
  page,
}) => {
  await gotoEditor(page);

  const figId = "fig_resize_commit";

  await page.evaluate((targetId) => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }

    window.__INAA_DEBUG__.loadTestProject({
      projectId: "resize-repro",
      projectName: "Resize repro",
      figures: [
        {
          id: targetId,
          tool: "rectangle",
          x: 260,
          y: 220,
          rotation: 0,
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
          ].map((node, index) => ({
            id: `${targetId}_n${index + 1}`,
            x: node.x,
            y: node.y,
            mode: "corner" as const,
          })),
          edges: [
            {
              id: `${targetId}_e1`,
              from: `${targetId}_n1`,
              to: `${targetId}_n2`,
              kind: "line" as const,
            },
            {
              id: `${targetId}_e2`,
              from: `${targetId}_n2`,
              to: `${targetId}_n3`,
              kind: "line" as const,
            },
            {
              id: `${targetId}_e3`,
              from: `${targetId}_n3`,
              to: `${targetId}_n4`,
              kind: "line" as const,
            },
            {
              id: `${targetId}_e4`,
              from: `${targetId}_n4`,
              to: `${targetId}_n1`,
              kind: "line" as const,
            },
          ],
        },
      ],
    });
  }, figId);

  const stage = page.getByTestId("editor-stage-container");
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.click(box!.x + 360, box!.y + 280);

  await expect
    .poll(async () => {
      const state = await page.evaluate(() => window.__INAA_DEBUG__?.getState());
      return state?.selectedFigureId ?? null;
    })
    .toBe(figId);

  const before = await readResizeState(page, figId);
  expect(before.anchor).toBeTruthy();

  let after = before;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current =
      attempt === 0 ? before : await readResizeState(page, figId);
    expect(current.anchor).toBeTruthy();

    const startX =
      box!.x +
      (current.anchorRect
        ? current.anchorRect.x + current.anchorRect.width / 2
        : current.anchor!.x);
    const startY =
      box!.y +
      (current.anchorRect
        ? current.anchorRect.y + current.anchorRect.height / 2
        : current.anchor!.y);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 6, { steps: 3 });
    await page.mouse.move(startX, startY - 80, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(120);

    after = await readResizeState(page, figId);
    const outcome = isResizeCommitted(figId, after);
    if (
      outcome.matchesTarget &&
      outcome.anchorVisible &&
      outcome.geometryChanged &&
      outcome.nodeReset
    ) {
      break;
    }

    await page.mouse.click(box!.x + 360, box!.y + 280);
    await page.waitForTimeout(80);
  }

  const outcome = isResizeCommitted(figId, after);
  expect({
    selectedFigureId: outcome.selectedFigureId,
    anchorVisible: outcome.anchorVisible,
    geometryChanged: outcome.geometryChanged,
    nodeReset: outcome.nodeReset,
  }).toEqual({
    selectedFigureId: figId,
    anchorVisible: true,
    geometryChanged: true,
    nodeReset: true,
  });
});
