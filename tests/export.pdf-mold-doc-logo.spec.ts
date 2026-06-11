import { execFileSync } from "node:child_process";
import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

// O export rasteriza o stage inteiro em UM PNG por página (jsPDF addImage),
// então o logo não vira um XObject separado — ele é composto no raster da
// página. A asserção correta é: o raster embutido MUDA quando o logo global
// está presente, e os textos da documentação continuam no PDF.

const LOGO_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAQUlEQVR42u3QMQEAAAQAMLnEUEtoerBjBRadNZ+FAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQcN8CBVuw8TKWKDIAAAAASUVORK5CYII=";

function pageImagesDigest(pdfPath: string): string {
  const script = [
    "from pypdf import PdfReader",
    "import sys, hashlib",
    "reader = PdfReader(sys.argv[1])",
    "h = hashlib.sha256()",
    "page = reader.pages[0]",
    "xobjects = page['/Resources']['/XObject']",
    "for name in sorted(xobjects.keys()):",
    "    h.update(xobjects[name].get_object().get_data())",
    "print(h.hexdigest())",
  ].join("\n");
  return execFileSync("python3", ["-c", script, pdfPath], {
    encoding: "utf8",
  }).trim();
}

function extractPdfText(pdfPath: string): string {
  const script = [
    "from pypdf import PdfReader",
    "import sys",
    "reader = PdfReader(sys.argv[1])",
    "print('\\n'.join((page.extract_text() or '') for page in reader.pages))",
  ].join("\n");
  return execFileSync("python3", ["-c", script, pdfPath], {
    encoding: "utf8",
  });
}

const MOLD_FIGURE = {
  id: "molde-logo-pdf",
  name: "Frente",
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
    baseSize: "G",
    cutQuantity: 2,
    cutOnFold: false,
    notes: "",
  },
};

async function exportPdf(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar PDF" }).click(),
  ]);
  const pdfPath = await download.path();
  expect(pdfPath).toBeTruthy();
  return pdfPath!;
}

test("export PDF compõe o logotipo global no raster da página", async ({
  page,
}) => {
  await gotoEditor(page);

  // 1) Projeto COM logo global.
  await page.evaluate(
    ({ fig, b64 }) => {
      if (!window.__INAA_DEBUG__?.loadTestProject) {
        throw new Error("loadTestProject not available");
      }
      window.__INAA_DEBUG__.loadTestProject({
        figures: [fig],
        projectName: "Export Logo PDF",
        meta: {
          moldDocLogo: {
            dataUrl: `data:image/png;base64,${b64}`,
            naturalWidth: 64,
            naturalHeight: 32,
          },
        },
      });
    },
    { fig: MOLD_FIGURE, b64: LOGO_B64 }
  );
  await expect
    .poll(async () =>
      page.evaluate(
        () => window.__INAA_DEBUG__?.getState().moldDocLogo?.naturalWidth ?? 0
      )
    )
    .toBe(64);
  // Aguarda o logo aparecer no canvas (imagem decodificada) antes de exportar.
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          window.__INAA_DEBUG__?.countStageNodesByName?.(
            "inaa-mold-doc-logo"
          ) ?? 0
      )
    )
    .toBeGreaterThan(0);

  const withLogoPath = await exportPdf(page);
  const withLogoDigest = pageImagesDigest(withLogoPath);
  // Sanidade: o PDF saiu com a página esperada (textos da documentação são
  // rasterizados junto com o stage; só os rótulos de página são texto).
  expect(extractPdfText(withLogoPath)).toContain("Pág. 1/1");

  // 2) Mesmo projeto SEM logo.
  await page.evaluate(
    ({ fig }) => {
      window.__INAA_DEBUG__!.loadTestProject!({
        figures: [fig],
        projectName: "Export Logo PDF",
      });
    },
    { fig: MOLD_FIGURE }
  );
  await expect
    .poll(async () =>
      page.evaluate(
        () => window.__INAA_DEBUG__?.getState().moldDocLogo ?? null
      )
    )
    .toBeNull();

  const withoutLogoPath = await exportPdf(page);
  const withoutLogoDigest = pageImagesDigest(withoutLogoPath);

  // O raster embutido difere apenas pela presença do logo.
  expect(withLogoDigest).not.toBe(withoutLogoDigest);
});
