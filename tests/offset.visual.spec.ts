import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type Box = { x: number; y: number; width: number; height: number };

type FigureSnapshot = {
  id: string;
  kind?: string;
  parentId?: string;
  offsetCm?: number | Record<string, number>;
  seamSegmentEdgeIds?: string[];
};

type TestFigure = {
  id: string;
  tool: "line" | "rectangle";
  kind?: "mold";
  x: number;
  y: number;
  rotation: number;
  closed: boolean;
  nodes: Array<{ id: string; x: number; y: number; mode: "corner" }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    kind: "line";
  }>;
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
};

function createRectFigure(
  id: string,
  opts: { kind?: "mold"; x: number; y: number; w: number; h: number }
): TestFigure {
  const { kind, x, y, w, h } = opts;
  const n1 = `${id}_n1`;
  const n2 = `${id}_n2`;
  const n3 = `${id}_n3`;
  const n4 = `${id}_n4`;

  return {
    id,
    tool: "line",
    kind,
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    nodes: [
      { id: n1, x, y, mode: "corner" },
      { id: n2, x: x + w, y, mode: "corner" },
      { id: n3, x: x + w, y: y + h, mode: "corner" },
      { id: n4, x, y: y + h, mode: "corner" },
    ],
    edges: [
      { id: `${id}_e1`, from: n1, to: n2, kind: "line" },
      { id: `${id}_e2`, from: n2, to: n3, kind: "line" },
      { id: `${id}_e3`, from: n3, to: n4, kind: "line" },
      { id: `${id}_e4`, from: n4, to: n1, kind: "line" },
    ],
    stroke: "aci7",
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
  };
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

async function loadFigures(
  page: import("@playwright/test").Page,
  figures: TestFigure[]
) {
  await page.evaluate((payload) => {
    window.__INAA_DEBUG__?.loadTestProject?.({ figures: payload });
  }, figures);
}

async function getSnapshot(
  page: import("@playwright/test").Page
): Promise<FigureSnapshot[]> {
  return await page.evaluate(() => {
    return (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as FigureSnapshot[];
  });
}

async function selectOffsetTool(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Margem de costura" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ?? null
    )
    .toBe("offset");
}

test.describe("Offset Tool Visual (moldes)", () => {
  test("gera margem quando clicar dentro de um molde", async ({ page }) => {
    await gotoEditor(page);

    const mold = createRectFigure("mold_full", {
      kind: "mold",
      x: 200,
      y: 200,
      w: 140,
      h: 100,
    });
    await loadFigures(page, [mold]);

    await expect
      .poll(async () => (await getSnapshot(page)).length)
      .toBe(1);

    await selectOffsetTool(page);

    const box = await getStageBox(page);
    await page.mouse.click(box.x + 260, box.y + 250);

    await expect
      .poll(async () => {
        const figs = await getSnapshot(page);
        return figs.filter((f) => f.kind === "seam").length;
      })
      .toBe(1);

    const seam = (await getSnapshot(page)).find((f) => f.kind === "seam") ?? null;
    expect(seam?.parentId).toBe("mold_full");
  });

  test("nao gera margem para figura convencional", async ({ page }) => {
    await gotoEditor(page);

    const conventional = createRectFigure("conv_no_offset", {
      x: 200,
      y: 200,
      w: 140,
      h: 100,
    });
    await loadFigures(page, [conventional]);

    await expect
      .poll(async () => (await getSnapshot(page)).length)
      .toBe(1);

    await selectOffsetTool(page);

    const box = await getStageBox(page);
    await page.mouse.click(box.x + 260, box.y + 250);

    await expect
      .poll(async () => {
        const figs = await getSnapshot(page);
        return figs.filter((f) => f.kind === "seam").length;
      })
      .toBe(0);
  });

  test("clique na aresta do molde cria offset por aresta", async ({ page }) => {
    await gotoEditor(page);

    const mold = createRectFigure("mold_edge", {
      kind: "mold",
      x: 200,
      y: 200,
      w: 140,
      h: 100,
    });
    await loadFigures(page, [mold]);

    await expect
      .poll(async () => (await getSnapshot(page)).length)
      .toBe(1);

    await selectOffsetTool(page);

    const box = await getStageBox(page);
    const edgeX = box.x + 270;
    const edgeY = box.y + 200;
    await page.mouse.move(edgeX, edgeY);
    await page.waitForTimeout(120);
    await page.mouse.click(edgeX, edgeY);

    await expect
      .poll(async () => {
        const figs = await getSnapshot(page);
        return figs.filter((f) => f.kind === "seam").length;
      })
      .toBe(1);

    const seam = (await getSnapshot(page)).find((f) => f.kind === "seam") ?? null;
    expect(seam).toBeTruthy();
    expect(typeof seam?.offsetCm).toBe("object");
    expect((seam?.seamSegmentEdgeIds ?? []).length).toBeGreaterThan(0);
  });

  test("ctrl+clique remove margem do molde", async ({ page }) => {
    await gotoEditor(page);

    const mold = createRectFigure("mold_remove", {
      kind: "mold",
      x: 200,
      y: 200,
      w: 140,
      h: 100,
    });
    await loadFigures(page, [mold]);

    await expect
      .poll(async () => (await getSnapshot(page)).length)
      .toBe(1);

    await selectOffsetTool(page);

    const box = await getStageBox(page);
    const centerX = box.x + 260;
    const centerY = box.y + 250;

    await page.mouse.click(centerX, centerY);
    await expect
      .poll(async () => {
        const figs = await getSnapshot(page);
        return figs.filter((f) => f.kind === "seam").length;
      })
      .toBe(1);

    await page.keyboard.down("Control");
    await page.mouse.click(centerX, centerY);
    await page.keyboard.up("Control");

    await expect
      .poll(async () => {
        const figs = await getSnapshot(page);
        return figs.filter((f) => f.kind === "seam").length;
      })
      .toBe(0);
  });
});
