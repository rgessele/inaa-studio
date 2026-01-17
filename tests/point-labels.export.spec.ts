import { test, expect } from "./helpers/test";
import fs from "node:fs";
import crypto from "node:crypto";
import { gotoEditor } from "./helpers/e2e";

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const next = haystack.indexOf(needle, idx);
    if (next === -1) break;
    count += 1;
    idx = next + needle.length;
  }
  return count;
}

test("point labels: toolbar cycle + SVG export respects editor mode", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.addTestRectangle) {
      throw new Error("addTestRectangle not available");
    }
    window.__INAA_DEBUG__.addTestRectangle();
  });

  const countLabels = async () => {
    return await page.evaluate(() => {
      if (!window.__INAA_DEBUG__?.countStageNodesByName) return -1;
      return window.__INAA_DEBUG__.countStageNodesByName("inaa-point-label");
    });
  };

  await expect.poll(countLabels).toBe(0);

  // Enable labels: off -> numGlobal
  await page.getByTestId("point-labels-mode-button").click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getState().pointLabelsMode
        )) ?? ""
    )
    .toBe("numGlobal");

  await expect.poll(countLabels).toBe(4);

  // Export modal: enable include labels and export SVG
  await page.getByRole("button", { name: "Exportar" }).click();
  await page.getByRole("switch", { name: "Rótulos de pontos" }).click();

  const download1 = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar SVG" }).click(),
  ]);

  const svgPath1 = await download1[0].path();
  expect(svgPath1).toBeTruthy();
  const svg1 = fs.readFileSync(svgPath1!, "utf8");
  expect(svg1).toContain("inaa-point-label");
  expect(svg1).toContain(">1<");
  expect(svg1).toContain(">4<");

  // Turn mode off again (cycle 4 times from numGlobal -> off)
  await page.getByTestId("point-labels-mode-button").click();
  await page.getByTestId("point-labels-mode-button").click();
  await page.getByTestId("point-labels-mode-button").click();
  await page.getByTestId("point-labels-mode-button").click();

  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getState().pointLabelsMode
        )) ?? ""
    )
    .toBe("off");

  await expect.poll(countLabels).toBe(0);

  // Export again with toggle ON: should export no labels because editor mode is off
  await page.getByRole("button", { name: "Exportar" }).click();
  await page.getByRole("switch", { name: "Rótulos de pontos" }).click();

  const download2 = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar SVG" }).click(),
  ]);

  const svgPath2 = await download2[0].path();
  expect(svgPath2).toBeTruthy();
  const svg2 = fs.readFileSync(svgPath2!, "utf8");
  expect(svg2).not.toContain("inaa-point-label");
});

test("point labels: global vs per-figure + alpha modes in SVG", async ({
  page,
}) => {
  await gotoEditor(page);

  // Create 2 rectangles (8 nodes total).
  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.addTestRectangle) {
      throw new Error("addTestRectangle not available");
    }
    window.__INAA_DEBUG__.addTestRectangle();
    window.__INAA_DEBUG__.addTestRectangle();
  });

  // Enable labels (off -> numGlobal)
  await page.getByTestId("point-labels-mode-button").click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getState().pointLabelsMode
        )) ?? ""
    )
    .toBe("numGlobal");

  // Export SVG with labels ON: should contain 1..8
  await page.getByRole("button", { name: "Exportar" }).click();
  await page.getByRole("switch", { name: "Rótulos de pontos" }).click();

  const downloadGlobal = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar SVG" }).click(),
  ]);
  const svgPathGlobal = await downloadGlobal[0].path();
  expect(svgPathGlobal).toBeTruthy();
  const svgGlobal = fs.readFileSync(svgPathGlobal!, "utf8");
  expect(svgGlobal).toContain("inaa-point-label");
  expect(svgGlobal).toContain(">1<");
  expect(svgGlobal).toContain(">8<");
  // In global mode, "1" should appear once (not twice).
  expect(countOccurrences(svgGlobal, ">1<")).toBe(1);

  // Switch to per-figure numbering
  await page.getByTestId("point-labels-mode-button").click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getState().pointLabelsMode
        )) ?? ""
    )
    .toBe("numPerFigure");

  await page.getByRole("button", { name: "Exportar" }).click();
  // toggle is already ON from previous export; keep it on.

  const downloadPerFigure = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar SVG" }).click(),
  ]);
  const svgPathPerFigure = await downloadPerFigure[0].path();
  expect(svgPathPerFigure).toBeTruthy();
  const svgPerFigure = fs.readFileSync(svgPathPerFigure!, "utf8");
  expect(svgPerFigure).toContain("inaa-point-label");
  // In per-figure mode, 1..4 repeats for each rectangle: ">1<" appears twice.
  expect(countOccurrences(svgPerFigure, ">1<")).toBe(2);
  expect(countOccurrences(svgPerFigure, ">4<")).toBe(2);
  expect(svgPerFigure).not.toContain(">8<");

  // Switch to alpha global (A..H)
  await page.getByTestId("point-labels-mode-button").click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getState().pointLabelsMode
        )) ?? ""
    )
    .toBe("alphaGlobal");

  await page.getByRole("button", { name: "Exportar" }).click();
  const downloadAlphaGlobal = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar SVG" }).click(),
  ]);
  const svgPathAlphaGlobal = await downloadAlphaGlobal[0].path();
  expect(svgPathAlphaGlobal).toBeTruthy();
  const svgAlphaGlobal = fs.readFileSync(svgPathAlphaGlobal!, "utf8");
  expect(svgAlphaGlobal).toContain(">A<");
  expect(svgAlphaGlobal).toContain(">H<");
  expect(countOccurrences(svgAlphaGlobal, ">A<")).toBe(1);

  // Switch to alpha per-figure (A..D twice)
  await page.getByTestId("point-labels-mode-button").click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getState().pointLabelsMode
        )) ?? ""
    )
    .toBe("alphaPerFigure");

  await page.getByRole("button", { name: "Exportar" }).click();
  const downloadAlphaPerFigure = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar SVG" }).click(),
  ]);
  const svgPathAlphaPerFigure = await downloadAlphaPerFigure[0].path();
  expect(svgPathAlphaPerFigure).toBeTruthy();
  const svgAlphaPerFigure = fs.readFileSync(svgPathAlphaPerFigure!, "utf8");
  expect(countOccurrences(svgAlphaPerFigure, ">A<")).toBe(2);
  expect(countOccurrences(svgAlphaPerFigure, ">D<")).toBe(2);
  expect(svgAlphaPerFigure).not.toContain(">H<");
});

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

  // Enable labels (off -> numGlobal)
  await page.getByTestId("point-labels-mode-button").click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getState().pointLabelsMode
        )) ?? ""
    )
    .toBe("numGlobal");

  // Export PDF with labels included.
  await page.getByRole("button", { name: "Exportar" }).click();
  await page.getByRole("switch", { name: "Rótulos de pontos" }).click();

  const downloadWithLabels = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Imprimir" }).click(),
  ]);
  const pdfPathWithLabels = await downloadWithLabels[0].path();
  expect(pdfPathWithLabels).toBeTruthy();

  // Export PDF without labels.
  await page.getByRole("button", { name: "Exportar" }).click();
  await page.getByRole("switch", { name: "Rótulos de pontos" }).click();

  const downloadWithoutLabels = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Imprimir" }).click(),
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
