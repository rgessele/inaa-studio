import { expect, test } from "./helpers/test";
import { dragOnCanvas, getEditorState, gotoEditor } from "./helpers/e2e";

test("select chooses nearest contour (edge priority) under overlap", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }

    window.__INAA_DEBUG__.loadTestProject({
      figures: [
        {
          id: "bottom",
          kind: "figure",
          name: "Bottom",
          tool: "rectangle",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          fill: "transparent",
          nodes: [
            {
              id: "b1",
              x: 200,
              y: 200,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "b2",
              x: 500,
              y: 200,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "b3",
              x: 500,
              y: 500,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "b4",
              x: 200,
              y: 500,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
          ],
          edges: [
            { id: "be1", from: "b1", to: "b2", kind: "line" },
            { id: "be2", from: "b2", to: "b3", kind: "line" },
            { id: "be3", from: "b3", to: "b4", kind: "line" },
            { id: "be4", from: "b4", to: "b1", kind: "line" },
          ],
          style: {
            stroke: "#000000",
            strokeWidth: 2,
            fill: "rgba(0,0,0,0)",
            opacity: 1,
          },
        },
        {
          id: "top",
          kind: "figure",
          name: "Top",
          tool: "rectangle",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          fill: "transparent",
          nodes: [
            {
              id: "t1",
              x: 280,
              y: 280,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "t2",
              x: 560,
              y: 280,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "t3",
              x: 560,
              y: 560,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "t4",
              x: 280,
              y: 560,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
          ],
          edges: [
            { id: "te1", from: "t1", to: "t2", kind: "line" },
            { id: "te2", from: "t2", to: "t3", kind: "line" },
            { id: "te3", from: "t3", to: "t4", kind: "line" },
            { id: "te4", from: "t4", to: "t1", kind: "line" },
          ],
          style: {
            stroke: "#000000",
            strokeWidth: 2,
            fill: "rgba(0,0,0,0)",
            opacity: 1,
          },
        },
      ],
    });
  });

  const stageCanvas = page
    .getByTestId("editor-stage-container")
    .locator("canvas")
    .last();
  await expect(stageCanvas).toBeVisible();

  await page.keyboard.press("V");

  // Click near the *bottom* contour (left edge at x=200) but inside the top figure.
  await stageCanvas.click({ position: { x: 210, y: 350 } });
  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .toBe("bottom");

  // Click near the *top* contour (left edge at x=280).
  await stageCanvas.click({ position: { x: 290, y: 350 } });
  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .toBe("top");
});

test("select: direct drag snaps to nodes/edges when magnet is enabled", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }

    window.__INAA_DEBUG__.loadTestProject({
      figures: [
        // Target figure (has a node at world 200,0)
        {
          id: "target",
          kind: "figure",
          name: "Target",
          tool: "rectangle",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          fill: "transparent",
          nodes: [
            {
              id: "t1",
              x: 0,
              y: 0,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "t2",
              x: 200,
              y: 0,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "t3",
              x: 200,
              y: 120,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "t4",
              x: 0,
              y: 120,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
          ],
          edges: [
            { id: "te1", from: "t1", to: "t2", kind: "line" },
            { id: "te2", from: "t2", to: "t3", kind: "line" },
            { id: "te3", from: "t3", to: "t4", kind: "line" },
            { id: "te4", from: "t4", to: "t1", kind: "line" },
          ],
          style: {
            stroke: "#000000",
            strokeWidth: 2,
            fill: "rgba(0,0,0,0)",
            opacity: 1,
          },
        },
        // Draggable figure (single segment line)
        {
          id: "line",
          kind: "figure",
          name: "Line",
          tool: "line",
          x: 320,
          y: 260,
          rotation: 0,
          closed: false,
          nodes: [
            {
              id: "l1",
              x: 0,
              y: 0,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "l2",
              x: 120,
              y: 0,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
          ],
          edges: [{ id: "le1", from: "l1", to: "l2", kind: "line" }],
          style: {
            stroke: "#000000",
            strokeWidth: 2,
            fill: "rgba(0,0,0,0)",
            opacity: 1,
          },
        },
      ],
    });
  });

  // Ensure the project is fully loaded before interacting (avoids races under load).
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        return {
          count: figs.length,
          hasTarget: figs.some((f) => f.id === "target"),
          hasLine: figs.some((f) => f.id === "line"),
        };
      });
    })
    .toEqual({ count: 2, hasTarget: true, hasLine: true });

  // Enable magnet
  await page.getByTestId("magnet-toggle-button").click();
  await expect
    .poll(async () => {
      return (
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getState().magnetEnabled
        )) ?? false
      );
    })
    .toBe(true);

  // Ensure we are in Select tool (keyboard can be flaky when focus changes).
  await page.getByRole("button", { name: "Selecionar" }).click();
  await expect
    .poll(async () => (await getEditorState(page)).tool)
    .toBe("select");

  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();

  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

  // Start pointer near the line and drag to near the target node at world (200,0).
  // With magnet on, the selection anchor (pointer) should snap, making the line
  // translation snap as well.
  const start = { x: 330, y: 260 };
  // Aim very close to the target node at world (200,0).
  const endNearTargetNode = { x: 200, y: 1 };

  const startX = clamp(box!.x + start.x, box!.x + 1, box!.x + box!.width - 2);
  const startY = clamp(box!.y + start.y, box!.y + 1, box!.y + box!.height - 2);
  const endX = clamp(
    box!.x + endNearTargetNode.x,
    box!.x + 1,
    box!.x + box!.width - 2
  );
  const endY = clamp(
    box!.y + endNearTargetNode.y,
    box!.y + 1,
    box!.y + box!.height - 2
  );

  // Click-select the line first to avoid dragging empty space under load.
  await page.mouse.click(startX, startY);
  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .toBe("line");

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();

  const figLine = await page.evaluate(() => {
    const figs = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
    return figs.find((f) => f.id === "line") ?? null;
  });
  expect(figLine).toBeTruthy();

  // Without snapping, we'd expect approximately (dx,dy)=(-124,-254) and thus
  // line.x ~ 320-124=196, line.y ~ 260-254=6.
  // With snapping of the pointer anchor to the node at world (200,0), dx becomes
  // -130 and dy becomes -260, thus line.x=190 and line.y=0.
  // Allow tiny rounding differences across engines.
  expect(Math.abs(figLine!.x - 190)).toBeLessThanOrEqual(2);
  expect(Math.abs(figLine!.y - 0)).toBeLessThanOrEqual(2);
});

test("select prefers inner closed shape even if drawn first", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }

    // Inner is created first; outer is created later (so it is on top visually).
    window.__INAA_DEBUG__.loadTestProject({
      figures: [
        {
          id: "inner",
          kind: "figure",
          name: "Inner",
          tool: "rectangle",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          fill: "transparent",
          nodes: [
            {
              id: "i1",
              x: 320,
              y: 260,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "i2",
              x: 440,
              y: 260,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "i3",
              x: 440,
              y: 380,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "i4",
              x: 320,
              y: 380,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
          ],
          edges: [
            { id: "ie1", from: "i1", to: "i2", kind: "line" },
            { id: "ie2", from: "i2", to: "i3", kind: "line" },
            { id: "ie3", from: "i3", to: "i4", kind: "line" },
            { id: "ie4", from: "i4", to: "i1", kind: "line" },
          ],
          style: {
            stroke: "#000000",
            strokeWidth: 2,
            fill: "rgba(0,0,0,0)",
            opacity: 1,
          },
        },
        {
          id: "outer",
          kind: "figure",
          name: "Outer",
          tool: "rectangle",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          fill: "transparent",
          nodes: [
            {
              id: "o1",
              x: 220,
              y: 160,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "o2",
              x: 540,
              y: 160,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "o3",
              x: 540,
              y: 480,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "o4",
              x: 220,
              y: 480,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
          ],
          edges: [
            { id: "oe1", from: "o1", to: "o2", kind: "line" },
            { id: "oe2", from: "o2", to: "o3", kind: "line" },
            { id: "oe3", from: "o3", to: "o4", kind: "line" },
            { id: "oe4", from: "o4", to: "o1", kind: "line" },
          ],
          style: {
            stroke: "#000000",
            strokeWidth: 2,
            fill: "rgba(0,0,0,0)",
            opacity: 1,
          },
        },
      ],
    });
  });

  const stageCanvas = page
    .getByTestId("editor-stage-container")
    .locator("canvas")
    .last();
  await expect(stageCanvas).toBeVisible();

  await page.keyboard.press("V");

  // Click well inside both shapes; should select the inner (most specific) one.
  await stageCanvas.click({ position: { x: 380, y: 320 } });
  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .toBe("inner");
});

test("can drag-move inner shape even when outer is visually on top", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }

    window.__INAA_DEBUG__.loadTestProject({
      figures: [
        {
          id: "inner",
          kind: "figure",
          name: "Inner",
          tool: "rectangle",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          fill: "transparent",
          nodes: [
            {
              id: "i1",
              x: 320,
              y: 260,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "i2",
              x: 440,
              y: 260,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "i3",
              x: 440,
              y: 380,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "i4",
              x: 320,
              y: 380,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
          ],
          edges: [
            { id: "ie1", from: "i1", to: "i2", kind: "line" },
            { id: "ie2", from: "i2", to: "i3", kind: "line" },
            { id: "ie3", from: "i3", to: "i4", kind: "line" },
            { id: "ie4", from: "i4", to: "i1", kind: "line" },
          ],
          style: {
            stroke: "#000000",
            strokeWidth: 2,
            fill: "rgba(0,0,0,0)",
            opacity: 1,
          },
        },
        {
          id: "outer",
          kind: "figure",
          name: "Outer",
          tool: "rectangle",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          fill: "transparent",
          nodes: [
            {
              id: "o1",
              x: 220,
              y: 160,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "o2",
              x: 540,
              y: 160,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "o3",
              x: 540,
              y: 480,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "o4",
              x: 220,
              y: 480,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
          ],
          edges: [
            { id: "oe1", from: "o1", to: "o2", kind: "line" },
            { id: "oe2", from: "o2", to: "o3", kind: "line" },
            { id: "oe3", from: "o3", to: "o4", kind: "line" },
            { id: "oe4", from: "o4", to: "o1", kind: "line" },
          ],
          style: {
            stroke: "#000000",
            strokeWidth: 2,
            fill: "rgba(0,0,0,0)",
            opacity: 1,
          },
        },
      ],
    });
  });

  const stageCanvas = page
    .getByTestId("editor-stage-container")
    .locator("canvas")
    .last();
  await expect(stageCanvas).toBeVisible();

  await page.getByRole("button", { name: "Selecionar" }).click();
  await expect
    .poll(async () => (await getEditorState(page)).tool)
    .toBe("select");

  const before = await page.evaluate(() => {
    const snap = window.__INAA_DEBUG__?.getFiguresSnapshot?.();
    if (!snap) throw new Error("getFiguresSnapshot not available");
    const inner = snap.find((f) => f.id === "inner");
    if (!inner) throw new Error("inner not found");
    return { x: inner.x, y: inner.y };
  });

  // Drag inside the inner shape.
  await stageCanvas.click({ position: { x: 380, y: 320 } });
  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .toBe("inner");

  await dragOnCanvas(page, stageCanvas, {
    source: { x: 380, y: 320 },
    target: { x: 430, y: 360 },
    steps: 18,
  });

  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .toBe("inner");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const snap = window.__INAA_DEBUG__?.getFiguresSnapshot?.();
        if (!snap) throw new Error("getFiguresSnapshot not available");
        const inner = snap.find((f) => f.id === "inner");
        if (!inner) throw new Error("inner not found");
        return { x: inner.x, y: inner.y };
      });
    })
    .toEqual({ x: before.x + 50, y: before.y + 40 });
});

test("direct drag does not jump when releasing over another figure", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }

    window.__INAA_DEBUG__.loadTestProject({
      figures: [
        {
          id: "line",
          kind: "figure",
          name: "Line",
          tool: "line",
          x: 0,
          y: 0,
          rotation: 0,
          closed: false,
          fill: "transparent",
          nodes: [
            {
              id: "l1",
              x: 180,
              y: 140,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "l2",
              x: 420,
              y: 140,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
          ],
          edges: [{ id: "le1", from: "l1", to: "l2", kind: "line" }],
          style: {
            stroke: "#000000",
            strokeWidth: 2,
            fill: "rgba(0,0,0,0)",
            opacity: 1,
          },
        },
        {
          id: "rect",
          kind: "figure",
          name: "Rect",
          tool: "rectangle",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          fill: "transparent",
          nodes: [
            {
              id: "r1",
              x: 360,
              y: 220,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "r2",
              x: 560,
              y: 220,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "r3",
              x: 560,
              y: 380,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
            {
              id: "r4",
              x: 360,
              y: 380,
              mode: "corner",
              inHandle: null,
              outHandle: null,
            },
          ],
          edges: [
            { id: "re1", from: "r1", to: "r2", kind: "line" },
            { id: "re2", from: "r2", to: "r3", kind: "line" },
            { id: "re3", from: "r3", to: "r4", kind: "line" },
            { id: "re4", from: "r4", to: "r1", kind: "line" },
          ],
          style: {
            stroke: "#000000",
            strokeWidth: 2,
            fill: "rgba(0,0,0,0)",
            opacity: 1,
          },
        },
      ],
    });
  });

  const stageCanvas = page
    .getByTestId("editor-stage-container")
    .locator("canvas")
    .last();
  await expect(stageCanvas).toBeVisible();

  await page.keyboard.press("V");

  const before = await page.evaluate(() => {
    const snap = window.__INAA_DEBUG__?.getFiguresSnapshot?.();
    if (!snap) throw new Error("getFiguresSnapshot not available");
    const line = snap.find((f) => f.id === "line");
    if (!line) throw new Error("line not found");
    return { x: line.x, y: line.y };
  });

  // Drag the line and release on top of the rectangle.
  await dragOnCanvas(page, stageCanvas, {
    source: { x: 300, y: 140 },
    target: { x: 460, y: 300 },
  });

  await expect
    .poll(async () => (await getEditorState(page)).selectedFigureId)
    .toBe("line");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const snap = window.__INAA_DEBUG__?.getFiguresSnapshot?.();
        if (!snap) throw new Error("getFiguresSnapshot not available");
        const line = snap.find((f) => f.id === "line");
        if (!line) throw new Error("line not found");
        return { x: line.x, y: line.y };
      });
    })
    .toEqual({ x: before.x + 160, y: before.y + 160 });
});
