import { expect, test } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type TestFigure = {
  id: string;
  tool: "line";
  kind: "mold";
  x: number;
  y: number;
  rotation: number;
  closed: boolean;
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    mode: "corner";
  }>;
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

function createMoldFigure(id: string, x: number, y: number): TestFigure {
  const n1 = `${id}_n1`;
  const n2 = `${id}_n2`;
  const n3 = `${id}_n3`;
  const n4 = `${id}_n4`;

  return {
    id,
    tool: "line",
    kind: "mold",
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    nodes: [
      { id: n1, x, y, mode: "corner" },
      { id: n2, x: x + 90, y, mode: "corner" },
      { id: n3, x: x + 90, y: y + 140, mode: "corner" },
      { id: n4, x, y: y + 140, mode: "corner" },
    ],
    edges: [
      { id: `${id}_e1`, from: n1, to: n2, kind: "line" },
      { id: `${id}_e2`, from: n2, to: n3, kind: "line" },
      { id: `${id}_e3`, from: n3, to: n4, kind: "line" },
      { id: `${id}_e4`, from: n4, to: n1, kind: "line" },
    ],
    stroke: "aci7",
    strokeWidth: 2,
    fill: "rgba(96,165,250,0.22)",
    opacity: 1,
  };
}

test("moldes extraidos: ocupa a altura disponivel quando a lista aparece sozinha", async ({
  page,
}) => {
  await gotoEditor(page);

  const figures = Array.from({ length: 14 }, (_, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    return createMoldFigure(`mold_${index + 1}`, 160 + col * 180, 140 + row * 170);
  });

  await page.evaluate((payload) => {
    window.__INAA_DEBUG__?.loadTestProject?.({ figures: payload });
  }, figures);

  await expect(
    page.getByRole("button", { name: "Moldes extraídos" })
  ).toBeVisible();

  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();
  await stage.click({ position: { x: 20, y: 20 } });

  await expect
    .poll(async () => page.evaluate(() => window.__INAA_DEBUG__?.getState?.().selectedFigureId ?? null))
    .toBe(null);

  const idleContent = page.getByTestId("properties-panel-idle-content");
  const moldListScroll = page.getByTestId("mold-list-scroll");

  await expect(idleContent).toBeVisible();
  await expect(moldListScroll).toBeVisible();

  const { contentHeight, listHeight } = await page.evaluate(() => {
    const content = document.querySelector(
      '[data-testid="properties-panel-idle-content"]'
    );
    const list = document.querySelector('[data-testid="mold-list-scroll"]');
    if (!(content instanceof HTMLElement) || !(list instanceof HTMLElement)) {
      throw new Error("Painel de moldes não encontrado");
    }
    return {
      contentHeight: content.getBoundingClientRect().height,
      listHeight: list.getBoundingClientRect().height,
    };
  });

  expect(listHeight / contentHeight).toBeGreaterThan(0.7);
});