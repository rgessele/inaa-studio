import { expect, test } from "./helpers/test";
import { dragOnCanvas, getEditorState, gotoEditor } from "./helpers/e2e";

async function chooseStrokeHex(
  page: import("@playwright/test").Page,
  hex: string
) {
  const button = page.getByTestId("stroke-color-button");
  await button.click();
  const popover = page.getByTestId("stroke-color-popover");
  await expect(popover).toBeVisible();
  const buttonBox = await button.boundingBox();
  const popoverBox = await popover.boundingBox();
  expect(buttonBox).toBeTruthy();
  expect(popoverBox).toBeTruthy();
  expect(popoverBox!.y).toBeGreaterThanOrEqual(buttonBox!.y - 2);
  expect(popoverBox!.x).toBeGreaterThan(buttonBox!.x + buttonBox!.width - 1);
  await page.getByTestId("stroke-color-hex-input").fill(hex);
  await page.getByTestId("stroke-color-hex-input").press("Enter");
  await page.keyboard.press("Escape");
}

test("cor da linha: primeiro preset restaura a cor original auto", async ({
  page,
}) => {
  await gotoEditor(page);

  await chooseStrokeHex(page, "#ef4444");
  expect((await getEditorState(page)).activeStrokeColor).toBe("#ef4444");

  await page.getByTestId("stroke-color-button").click();
  await page.getByTestId("stroke-color-preset-0").click();
  await expect
    .poll(async () => (await getEditorState(page)).activeStrokeColor)
    .toBe("aci7");
});

test("cor da linha: aplica em novos desenhos, figura inteira e aresta", async ({
  page,
}) => {
  await gotoEditor(page);

  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  await chooseStrokeHex(page, "#ef4444");

  await page.getByRole("button", { name: "Retângulo" }).click();
  await dragOnCanvas(page, stage, {
    source: { x: 260, y: 200 },
    target: { x: 380, y: 300 },
  });

  await expect
    .poll(async () => {
      const figs = await page.evaluate(
        () => window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []
      );
      const fig = figs.find((item) => item.tool === "rectangle");
      return {
        stroke: fig?.stroke,
        strokeMode: fig?.strokeMode,
      };
    })
    .toEqual({ stroke: "#ef4444", strokeMode: "solid" });

  await page.getByRole("button", { name: "Selecionar" }).click();
  await stage.click({ position: { x: 320, y: 250 } });
  await chooseStrokeHex(page, "#22c55e");

  await expect
    .poll(async () => {
      const figs = await page.evaluate(
        () => window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []
      );
      const fig = figs.find((item) => item.tool === "rectangle");
      return {
        stroke: fig?.stroke,
        edgeStrokes: fig?.edges.map((edge) => edge.stroke ?? null),
      };
    })
    .toEqual({
      stroke: "#22c55e",
      edgeStrokes: [null, null, null, null],
    });

  await page.keyboard.down("Alt");
  await stage.click({ position: { x: 320, y: 200 } });
  await page.keyboard.up("Alt");

  await chooseStrokeHex(page, "#3b82f6");

  await expect
    .poll(async () => {
      const figs = await page.evaluate(
        () => window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []
      );
      const fig = figs.find((item) => item.tool === "rectangle");
      return fig?.edges.filter((edge) => edge.stroke === "#3b82f6").length ?? 0;
    })
    .toBe(1);
});
