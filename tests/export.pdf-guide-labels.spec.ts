import { execFileSync } from "node:child_process";
import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

function extractPdfText(pdfPath: string): string {
  const script = [
    "from pypdf import PdfReader",
    "import sys",
    "reader = PdfReader(sys.argv[1])",
    "parts = []",
    "for page in reader.pages:",
    "    parts.append(page.extract_text() or '')",
    "print('\\n'.join(parts))",
  ].join("\n");

  return execFileSync("python3", ["-c", script, pdfPath], {
    encoding: "utf8",
  });
}

test("export PDF resets L/C guide labels to exported pages", async ({ page }) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }

    const fig = {
      id: "molde-guide-label",
      name: "Molde Guide",
      tool: "line" as const,
      kind: "mold" as const,
      x: 0,
      y: 0,
      rotation: 0,
      closed: true,
      nodes: [
        { id: "n1", x: 45, y: 45, mode: "corner" as const },
        { id: "n2", x: 205, y: 45, mode: "corner" as const },
        { id: "n3", x: 205, y: 185, mode: "corner" as const },
        { id: "n4", x: 45, y: 185, mode: "corner" as const },
      ],
      edges: [
        { id: "e1", from: "n1", to: "n2", kind: "line" as const },
        { id: "e2", from: "n2", to: "n3", kind: "line" as const },
        { id: "e3", from: "n3", to: "n4", kind: "line" as const },
        { id: "e4", from: "n4", to: "n1", kind: "line" as const },
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
    };

    window.__INAA_DEBUG__.loadTestProject({
      figures: [fig],
      projectName: "Export Guide Label Reset",
    });
  });

  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().figuresCount)) ?? 0
    )
    .toBe(1);

  await page.getByRole("button", { name: "Exportar", exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar PDF" }).click(),
  ]);

  const pdfPath = await download.path();
  expect(pdfPath).toBeTruthy();

  const text = extractPdfText(pdfPath!);
  expect(text).toContain("L1 C1");
  expect(text).not.toContain("L2 C2");
});
