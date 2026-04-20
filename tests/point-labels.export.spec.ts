import { test, expect } from "./helpers/test";
import fs from "node:fs";
import crypto from "node:crypto";
import { getEditorState, gotoEditor } from "./helpers/e2e";

async function choosePointLabelsMode(
  page: import("@playwright/test").Page,
  mode:
    | "off"
    | "numGlobal"
    | "numPerFigure"
    | "alphaGlobal"
    | "alphaPerFigure"
) {
  await page.getByTestId("point-labels-mode-button").click();
  await expect(page.getByTestId("point-labels-mode-popover")).toBeVisible();
  await page.getByTestId(`point-labels-mode-option-${mode}`).click();
  await expect(page.getByTestId("point-labels-mode-popover")).toHaveCount(0);
}

test("point labels: PDF export toggles inclusion (size sanity)", async ({
  page,
}) => {
  await gotoEditor(page);

  // Load a figure with many nodes so labels have a measurable impact.
  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }

    const nodesCount = 40;
    const nodes: Array<{ id: string; x: number; y: number; mode: "corner" }> =
      [];
    const edges: Array<{ id: string; from: string; to: string; kind: "line" }> =
      [];

    for (let i = 0; i < nodesCount; i++) {
      const t = (i / nodesCount) * Math.PI * 2;
      nodes.push({
        id: `n${i}`,
        x: Math.cos(t) * 220,
        y: Math.sin(t) * 160,
        mode: "corner",
      });
    }
    for (let i = 0; i < nodesCount; i++) {
      edges.push({
        id: `e${i}`,
        from: nodes[i].id,
        to: nodes[(i + 1) % nodesCount].id,
        kind: "line",
      });
    }

    const fig = {
      id: "fig-many-nodes",
      tool: "line",
      x: 0,
      y: 0,
      rotation: 0,
      closed: true,
      nodes,
      edges,
      stroke: "aci7",
      strokeWidth: 2,
      fill: "transparent",
      opacity: 1,
    };

    window.__INAA_DEBUG__.loadTestProject({ figures: [fig] });
  });

  // Enable labels explicitly through the mode submenu.
  await choosePointLabelsMode(page, "numGlobal");
  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getState().pointLabelsMode
        )) ?? ""
    )
    .toBe("numGlobal");

  // Export PDF with labels included.
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const includeConventionalInTest3 = page.getByRole("switch", {
    name: "Imprimir figuras convencionais",
  });
  if (
    (await includeConventionalInTest3.getAttribute("aria-checked")) !== "true"
  ) {
    await includeConventionalInTest3.click();
  }
  await page.getByRole("switch", { name: "Rótulos de pontos" }).click();

  const downloadWithLabels = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar PDF" }).click(),
  ]);
  const pdfPathWithLabels = await downloadWithLabels[0].path();
  expect(pdfPathWithLabels).toBeTruthy();

  // Export PDF without labels.
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await page.getByRole("switch", { name: "Rótulos de pontos" }).click();

  const downloadWithoutLabels = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar PDF" }).click(),
  ]);
  const pdfPathWithoutLabels = await downloadWithoutLabels[0].path();
  expect(pdfPathWithoutLabels).toBeTruthy();

  const bytesWith = fs.readFileSync(pdfPathWithLabels!);
  const bytesWithout = fs.readFileSync(pdfPathWithoutLabels!);

  const sizeWith = bytesWith.byteLength;
  const sizeWithout = bytesWithout.byteLength;

  // Sanity: both are non-trivial PDFs.
  expect(sizeWith).toBeGreaterThan(10_000);
  expect(sizeWithout).toBeGreaterThan(10_000);

  // Including labels should change output; we assert the PDFs are not identical.
  const hashWith = crypto.createHash("sha256").update(bytesWith).digest("hex");
  const hashWithout = crypto
    .createHash("sha256")
    .update(bytesWithout)
    .digest("hex");
  expect(hashWith).not.toBe(hashWithout);
});

test("point labels: submenu choice persists after reload", async ({ page }) => {
  await gotoEditor(page);

  await page.getByTestId("point-labels-mode-button").click();
  await expect(page.getByTestId("point-labels-mode-popover")).toBeVisible();
  await expect
    .poll(async () => (await getEditorState(page)).pointLabelsMode)
    .toBe("off");

  await page.getByTestId("point-labels-mode-option-alphaPerFigure").click();
  await expect(page.getByTestId("point-labels-mode-popover")).toHaveCount(0);
  await expect
    .poll(async () => (await getEditorState(page)).pointLabelsMode)
    .toBe("alphaPerFigure");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__INAA_DEBUG__), {
    timeout: 15_000,
  });

  await expect
    .poll(async () => (await getEditorState(page)).pointLabelsMode)
    .toBe("alphaPerFigure");
});
