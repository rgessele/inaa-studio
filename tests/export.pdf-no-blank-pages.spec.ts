import { execFileSync } from "node:child_process";
import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

function getPdfPageCount(pdfPath: string): number {
  const script = [
    "from pypdf import PdfReader",
    "import sys",
    "reader = PdfReader(sys.argv[1])",
    "print(len(reader.pages))",
  ].join("\n");

  const out = execFileSync("python3", ["-c", script, pdfPath], {
    encoding: "utf8",
  });

  return Number(out.trim());
}

test("export PDF skips blank gap pages by default", async ({ page }) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }

    const createMold = (id: string, x: number) => ({
      id,
      name: id,
      tool: "line" as const,
      kind: "mold" as const,
      x: 0,
      y: 0,
      rotation: 0,
      closed: true,
      nodes: [
        { id: `${id}-n1`, x, y: 120, mode: "corner" as const },
        { id: `${id}-n2`, x: x + 160, y: 120, mode: "corner" as const },
        { id: `${id}-n3`, x: x + 160, y: 260, mode: "corner" as const },
        { id: `${id}-n4`, x, y: 260, mode: "corner" as const },
      ],
      edges: [
        {
          id: `${id}-e1`,
          from: `${id}-n1`,
          to: `${id}-n2`,
          kind: "line" as const,
        },
        {
          id: `${id}-e2`,
          from: `${id}-n2`,
          to: `${id}-n3`,
          kind: "line" as const,
        },
        {
          id: `${id}-e3`,
          from: `${id}-n3`,
          to: `${id}-n4`,
          kind: "line" as const,
        },
        {
          id: `${id}-e4`,
          from: `${id}-n4`,
          to: `${id}-n1`,
          kind: "line" as const,
        },
      ],
      stroke: "aci7",
      strokeWidth: 2,
      fill: "transparent",
      opacity: 1,
      moldMeta: {
        visible: true,
        printEnabled: true,
        baseSize: "M",
        cutQuantity: 1,
        cutOnFold: false,
        notes: "",
      },
    });

    window.__INAA_DEBUG__.loadTestProject({
      figures: [
        createMold("molde-a", 120),
        createMold("molde-b", 1750),
      ],
      projectName: "Export PDF Gap Test",
    });
  });

  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().figuresCount)) ?? 0
    )
    .toBe(2);

  await page.getByRole("button", { name: "Exportar", exact: true }).click();

  const blankPagesSwitch = page.getByRole("switch", { name: "Páginas em branco" });
  await expect(blankPagesSwitch).toHaveAttribute("aria-checked", "false");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar PDF" }).click(),
  ]);

  const pdfPath = await download.path();
  expect(pdfPath).toBeTruthy();
  expect(getPdfPageCount(pdfPath!)).toBe(2);
});
