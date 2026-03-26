import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

test("export feedback: explains why a conventional figure does not export by default", async ({
  page,
}) => {
  await gotoEditor(page);

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }

    const fig = {
      id: "fig_conv_export_feedback",
      name: "Figura Convencional",
      tool: "line" as const,
      x: 0,
      y: 0,
      rotation: 0,
      closed: true,
      nodes: [
        { id: "n1", x: 120, y: 120, mode: "corner" as const },
        { id: "n2", x: 320, y: 120, mode: "corner" as const },
        { id: "n3", x: 320, y: 260, mode: "corner" as const },
        { id: "n4", x: 120, y: 260, mode: "corner" as const },
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
    };

    window.__INAA_DEBUG__.loadTestProject({
      figures: [fig],
      projectName: "Export Feedback",
    });
  });

  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().figuresCount)) ?? 0
    )
    .toBe(1);

  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await page.getByRole("button", { name: "Exportar PDF" }).click();

  await expect(
    page.getByText(
      'Nenhum molde ativo para impressão. Extraia um molde ou ative "Imprimir figuras convencionais".'
    )
  ).toBeVisible();
});
