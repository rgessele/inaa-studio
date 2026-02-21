import { expect, test } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type Box = { x: number; y: number; width: number; height: number };
type EditorTransform = { x: number; y: number; scale: number };

type FigureSnapshot = {
  id: string;
  kind?: string;
  nodes: Array<{ id: string; x: number; y: number }>;
  edges: Array<{ id: string; from: string; to: string; kind: "line" | "cubic" }>;
};

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

test("extract mold: aceita sequência válida mesmo no sentido oposto da orientação das arestas", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    window.__INAA_DEBUG__?.loadTestProject?.({
      figures: [
        {
          id: "fig_square_source",
          tool: "line",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          stroke: "aci7",
          strokeWidth: 2,
          fill: "transparent",
          opacity: 1,
          nodes: [
            { id: "n1", x: 260, y: 180, mode: "corner" },
            { id: "n2", x: 420, y: 180, mode: "corner" },
            { id: "n3", x: 420, y: 320, mode: "corner" },
            { id: "n4", x: 260, y: 320, mode: "corner" },
          ],
          edges: [
            { id: "e1", from: "n1", to: "n2", kind: "line" as const },
            { id: "e2", from: "n2", to: "n3", kind: "line" as const },
            { id: "e3", from: "n3", to: "n4", kind: "line" as const },
            { id: "e4", from: "n4", to: "n1", kind: "line" as const },
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
    .poll(async () => page.evaluate(() => window.__INAA_DEBUG__?.getState().tool))
    .toBe("extractMold");

  // Start on top edge and continue anti-clockwise:
  // this requires connecting on both ends of the draft path.
  await clickWorld(page, { x: 340, y: 180 });
  await clickWorld(page, { x: 260, y: 250 });
  await clickWorld(page, { x: 340, y: 320 });
  await clickWorld(page, { x: 420, y: 250 });

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
  expect(mold?.edges.length).toBe(4);
  expect(mold?.nodes.length).toBe(4);
  expect(mold?.edges.every((e) => e.kind === "line")).toBe(true);
});
