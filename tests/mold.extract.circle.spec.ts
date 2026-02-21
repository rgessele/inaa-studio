import { expect, test } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type Box = { x: number; y: number; width: number; height: number };

type FigureSnapshot = {
  id: string;
  kind?: string;
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    mode: "corner" | "smooth";
    inHandle: { x: number; y: number } | null;
    outHandle: { x: number; y: number } | null;
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    kind: "line" | "cubic";
  }>;
};

type EditorTransform = { x: number; y: number; scale: number };

async function getStageBox(
  page: import("@playwright/test").Page
): Promise<Box> {
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  return box as Box;
}

async function getEditorTransform(
  page: import("@playwright/test").Page
): Promise<EditorTransform> {
  return await page.evaluate(() => {
    const dbg = window.__INAA_DEBUG__;
    if (!dbg?.getPosition || !dbg?.getScale) {
      throw new Error("__INAA_DEBUG__.getPosition/getScale não disponível");
    }
    const pos = dbg.getPosition() as { x: number; y: number };
    const scale = dbg.getScale() as number;
    return { x: pos.x, y: pos.y, scale };
  });
}

async function clickWorld(
  page: import("@playwright/test").Page,
  world: { x: number; y: number }
) {
  const [box, tr] = await Promise.all([getStageBox(page), getEditorTransform(page)]);
  const sx = box.x + tr.x + world.x * tr.scale;
  const sy = box.y + tr.y + world.y * tr.scale;
  await page.mouse.click(sx, sy);
}

async function getSnapshot(
  page: import("@playwright/test").Page
): Promise<FigureSnapshot[]> {
  return await page.evaluate(
    () => (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as FigureSnapshot[]
  );
}

test("extract mold: círculo mantém 4 nós e 4 arestas cúbicas", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    const kappa = 0.5522847498307936;
    const cx = 320;
    const cy = 260;
    const rx = 100;
    const ry = 80;
    const hx = rx * kappa;
    const hy = ry * kappa;

    window.__INAA_DEBUG__?.loadTestProject?.({
      figures: [
        {
          id: "fig_circle_source",
          tool: "circle",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          stroke: "aci7",
          strokeWidth: 2,
          fill: "transparent",
          opacity: 1,
          nodes: [
            {
              id: "n1",
              x: cx + rx,
              y: cy,
              mode: "smooth",
              inHandle: { x: cx + rx, y: cy - hy },
              outHandle: { x: cx + rx, y: cy + hy },
            },
            {
              id: "n2",
              x: cx,
              y: cy + ry,
              mode: "smooth",
              inHandle: { x: cx + hx, y: cy + ry },
              outHandle: { x: cx - hx, y: cy + ry },
            },
            {
              id: "n3",
              x: cx - rx,
              y: cy,
              mode: "smooth",
              inHandle: { x: cx - rx, y: cy + hy },
              outHandle: { x: cx - rx, y: cy - hy },
            },
            {
              id: "n4",
              x: cx,
              y: cy - ry,
              mode: "smooth",
              inHandle: { x: cx - hx, y: cy - ry },
              outHandle: { x: cx + hx, y: cy - ry },
            },
          ],
          edges: [
            { id: "e1", from: "n1", to: "n2", kind: "cubic" },
            { id: "e2", from: "n2", to: "n3", kind: "cubic" },
            { id: "e3", from: "n3", to: "n4", kind: "cubic" },
            { id: "e4", from: "n4", to: "n1", kind: "cubic" },
          ],
        },
      ],
    });
  });

  await expect
    .poll(async () => (await getSnapshot(page)).length)
    .toBe(1);

  await page.getByRole("button", { name: "Extrair molde" }).click();
  await expect
    .poll(async () => {
      return await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool);
    })
    .toBe("extractMold");

  // Midpoints of each quarter edge (clockwise): e1 -> e2 -> e3 -> e4.
  await clickWorld(page, { x: 390, y: 310 });
  await clickWorld(page, { x: 250, y: 310 });
  await clickWorld(page, { x: 250, y: 210 });
  await clickWorld(page, { x: 390, y: 210 });

  await expect(page.getByRole("heading", { name: "Gerar molde" })).toBeVisible();
  await page.getByRole("button", { name: "Gerar molde" }).click();

  await expect
    .poll(async () => {
      const figs = await getSnapshot(page);
      return figs.filter((f) => f.kind === "mold").length;
    })
    .toBe(1);

  const mold = (await getSnapshot(page)).find((f) => f.kind === "mold") ?? null;
  expect(mold).toBeTruthy();
  expect(mold?.nodes.length).toBe(4);
  expect(mold?.edges.length).toBe(4);
  expect(mold?.edges.every((e) => e.kind === "cubic")).toBe(true);
  expect(
    mold?.nodes.every(
      (n) => n.mode === "smooth" && n.inHandle != null && n.outHandle != null
    )
  ).toBe(true);
});
