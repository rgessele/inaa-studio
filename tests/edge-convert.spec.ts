import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

test("edge: converter linha/curva via menu de contexto", async ({ page }) => {
  await gotoEditor(page);

  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.addTestRectangle) {
      throw new Error("addTestRectangle not available");
    }
    window.__INAA_DEBUG__.addTestRectangle();
  });

  // Right click near the top edge of the rectangle.
  await stage.click({ button: "right", position: { x: 140, y: 8 } });
  await expect(page.getByTestId("edge-context-menu")).toBeVisible();

  await page.getByTestId("edge-context-convert-to-curve").click();

  await expect(page.getByTestId("edge-context-menu")).toHaveCount(0);

  // When a cubic edge is selected (converted), the side panel should expose
  // the standard curve settings panel.
  await expect(page.getByText("Estilo de Curva")).toBeVisible();

  // Apply a preset to the selected cubic edge and verify it updates handles.
  await page.getByTestId("curve-style-preset").selectOption("CAVA_CAVADA");
  await expect(page.getByTestId("curve-style-height")).toBeVisible();

  const afterToCurve = await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.getFiguresSnapshot) {
      throw new Error("getFiguresSnapshot not available");
    }
    return window.__INAA_DEBUG__.getFiguresSnapshot();
  });

  const base1 = afterToCurve.find((f) => !f.kind);
  expect(base1).toBeTruthy();
  expect(base1!.closed).toBe(true);
  expect(base1!.edges.filter((e) => e.kind === "cubic").length).toBe(1);
  expect(base1!.nodes.some((n) => n.inHandle || n.outHandle)).toBe(true);

  // Presets should introduce some curvature (handles not collinear with node).
  expect(
    base1!.nodes.some(
      (n) =>
        (n.outHandle && Math.abs(n.outHandle.y - n.y) > 0.01) ||
        (n.inHandle && Math.abs(n.inHandle.y - n.y) > 0.01)
    )
  ).toBe(true);

  // Convert back.
  const cubic = base1!.edges.find((e) => e.kind === "cubic")!;
  const n0 = base1!.nodes.find((n) => n.id === cubic.from)!;
  const n3 = base1!.nodes.find((n) => n.id === cubic.to)!;
  const p0 = { x: n0.x, y: n0.y };
  const p1 = n0.outHandle ?? { x: n0.x, y: n0.y };
  const p2 = n3.inHandle ?? { x: n3.x, y: n3.y };
  const p3 = { x: n3.x, y: n3.y };
  const t = 0.5;
  const u = 1 - t;
  const mid = {
    x:
      u * u * u * p0.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t * t * t * p3.x +
      base1!.x,
    y:
      u * u * u * p0.y +
      3 * u * u * t * p1.y +
      3 * u * t * t * p2.y +
      t * t * t * p3.y +
      base1!.y,
  };

  await stage.click({
    button: "right",
    position: { x: Math.round(mid.x), y: Math.round(mid.y) },
  });
  await expect(page.getByTestId("edge-context-menu")).toBeVisible();

  await page.getByTestId("edge-context-convert-to-line").click();
  await expect(page.getByTestId("edge-context-menu")).toHaveCount(0);

  await expect
    .poll(async () => {
      const figs = await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.getFiguresSnapshot) {
          throw new Error("getFiguresSnapshot not available");
        }
        return window.__INAA_DEBUG__.getFiguresSnapshot();
      });
      const base = figs.find((f) => !f.kind);
      if (!base) return false;
      return base.edges.every((e) => e.kind === "line");
    })
    .toBe(true);

  const afterToLine = await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.getFiguresSnapshot) {
      throw new Error("getFiguresSnapshot not available");
    }
    return window.__INAA_DEBUG__.getFiguresSnapshot();
  });

  const base2 = afterToLine.find((f) => !f.kind);
  expect(base2).toBeTruthy();
  expect(base2!.closed).toBe(true);
  expect(base2!.edges.every((e) => e.kind === "line")).toBe(true);
  expect(base2!.nodes.every((n) => !n.inHandle && !n.outHandle)).toBe(true);
});

test("edge + offset: aresta convertida para curva mantém edição da margem por aresta", async ({
  page,
}) => {
  await gotoEditor(page);

  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }
    if (!window.__INAA_DEBUG__?.addTestRectangle) {
      throw new Error("addTestRectangle not available");
    }
    window.__INAA_DEBUG__.loadTestProject({ figures: [] });
    window.__INAA_DEBUG__.addTestRectangle();
  });

  type FigureSnapshot = {
    id: string;
    kind?: string;
    x: number;
    y: number;
    nodes: Array<{
      id: string;
      x: number;
      y: number;
      inHandle?: { x: number; y: number } | null;
      outHandle?: { x: number; y: number } | null;
    }>;
    edges: Array<{ id: string; from: string; to: string; kind: string }>;
    offsetCm?: number | Record<string, number>;
  };

  const getFigures = async () => {
    return await page.evaluate(() => {
      if (!window.__INAA_DEBUG__?.getFiguresSnapshot) {
        throw new Error("getFiguresSnapshot not available");
      }
      return window.__INAA_DEBUG__.getFiguresSnapshot();
    });
  };

  const pickTopEdge = (figure: FigureSnapshot) => {
    const nodeById = new Map(figure.nodes.map((n) => [n.id, n]));
    let best:
      | {
          edgeId: string;
          mid: { x: number; y: number };
        }
      | null = null;
    for (const edge of figure.edges) {
      const a = nodeById.get(edge.from);
      const b = nodeById.get(edge.to);
      if (!a || !b) continue;
      const y = (a.y + b.y) / 2;
      if (!best || y < best.mid.y) {
        best = {
          edgeId: edge.id,
          mid: {
            x: (a.x + b.x) / 2 + figure.x,
            y: (a.y + b.y) / 2 + figure.y,
          },
        };
      }
    }
    if (!best) throw new Error("top edge not found");
    return best;
  };

  const cubicMidpointWorld = (
    figure: FigureSnapshot,
    edgeId: string
  ): { x: number; y: number } => {
    const edge = figure.edges.find((e) => e.id === edgeId);
    if (!edge || edge.kind !== "cubic") {
      throw new Error("converted cubic edge not found");
    }
    const n0 = figure.nodes.find((n) => n.id === edge.from);
    const n3 = figure.nodes.find((n) => n.id === edge.to);
    if (!n0 || !n3) throw new Error("cubic nodes not found");

    const p0 = { x: n0.x, y: n0.y };
    const p1 = n0.outHandle ?? { x: n0.x, y: n0.y };
    const p2 = n3.inHandle ?? { x: n3.x, y: n3.y };
    const p3 = { x: n3.x, y: n3.y };
    const t = 0.5;
    const u = 1 - t;
    return {
      x:
        u * u * u * p0.x +
        3 * u * u * t * p1.x +
        3 * u * t * t * p2.x +
        t * t * t * p3.x +
        figure.x,
      y:
        u * u * u * p0.y +
        3 * u * u * t * p1.y +
        3 * u * t * t * p2.y +
        t * t * t * p3.y +
        figure.y,
    };
  };

  await expect
    .poll(async () => (await getFigures()).filter((f) => !f.kind).length)
    .toBe(1);

  const initial = await getFigures();
  const base0 = initial.find((f) => !f.kind) as FigureSnapshot;
  const topEdge = pickTopEdge(base0);
  const topEdgePickPoint = {
    x: Math.round(topEdge.mid.x),
    y: Math.round(topEdge.mid.y + 8),
  };

  await page.getByRole("button", { name: "Selecionar" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("select");
  await stage.click({
    modifiers: ["Alt"],
    position: topEdgePickPoint,
  });

  await expect(page.getByText("Margem nesta aresta")).toBeVisible();
  const initialEdgeSeamCheckbox = page.getByRole("checkbox", {
    name: /Margem ativa|Ativar margem/,
  });
  if (!(await initialEdgeSeamCheckbox.isChecked())) {
    await initialEdgeSeamCheckbox.click();
  }

  await expect
    .poll(async () => {
      const figs = (await getFigures()) as FigureSnapshot[];
      const seam = figs.find((f) => f.kind === "seam");
      if (!seam || !seam.offsetCm || typeof seam.offsetCm !== "object") {
        return false;
      }
      const value = seam.offsetCm[topEdge.edgeId];
      return Number.isFinite(value) && value > 0;
    })
    .toBe(true);

  await stage.click({
    button: "right",
    position: topEdgePickPoint,
  });

  await expect(page.getByTestId("edge-context-menu")).toBeVisible();
  await page.getByTestId("edge-context-convert-to-curve").click();
  await expect(page.getByTestId("edge-context-menu")).toHaveCount(0);

  await expect
    .poll(async () => {
      const figs = (await getFigures()) as FigureSnapshot[];
      const base = figs.find((f) => !f.kind);
      if (!base) return false;
      const edge = base.edges.find((e) => e.id === topEdge.edgeId);
      return edge?.kind === "cubic";
    })
    .toBe(true);

  const afterConvert = await getFigures();
  const base1 = afterConvert.find((f) => !f.kind) as FigureSnapshot;
  const edgeBeforeSplit = base1.edges.find((e) => e.id === topEdge.edgeId)!;
  const cubicMid = cubicMidpointWorld(base1, topEdge.edgeId);

  await page.getByRole("button", { name: "Selecionar" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("select");
  await stage.click({
    modifiers: ["Alt"],
    position: {
      x: Math.round(cubicMid.x),
      y: Math.round(cubicMid.y),
    },
  });

  await expect(page.getByText("Margem nesta aresta")).toBeVisible();

  const edgeSeamCheckbox = page.getByRole("checkbox", {
    name: /Margem ativa|Ativar margem/,
  });
  await expect(edgeSeamCheckbox).toBeEnabled();
  await expect(edgeSeamCheckbox).toBeChecked();

  const edgeSeamInput = page
    .locator("label", { hasText: "Margem nesta aresta" })
    .locator("xpath=following::input[@type='text'][1]");
  await expect(edgeSeamInput).toBeEnabled();

  await edgeSeamInput.fill("1,80");
  await edgeSeamInput.press("Enter");

  await expect
    .poll(async () => {
      const figs = (await getFigures()) as FigureSnapshot[];
      const seam = figs.find((f) => f.kind === "seam");
      if (!seam || !seam.offsetCm || typeof seam.offsetCm !== "object") {
        return null;
      }
      const v = seam.offsetCm[topEdge.edgeId];
      return Number.isFinite(v) ? Number(v) : null;
    })
    .toBe(1.8);

  // Split the converted cubic edge and ensure per-edge seam offsets are kept
  // on the new segments (instead of getting lost/disabled).
  await page.getByRole("button", { name: "Editar nós" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("node");

  await stage.click({
    position: {
      x: Math.round(cubicMid.x),
      y: Math.round(cubicMid.y),
    },
  });

  await expect
    .poll(async () => {
      const figs = (await getFigures()) as FigureSnapshot[];
      const base = figs.find((f) => !f.kind);
      const seam = figs.find((f) => f.kind === "seam");
      if (!base || !seam || !seam.offsetCm || typeof seam.offsetCm !== "object") {
        return false;
      }
      if (base.edges.some((e) => e.id === topEdge.edgeId)) return false;
      const baseEdgeIds = new Set(base.edges.map((e) => e.id));
      return Object.keys(seam.offsetCm).some((edgeId) => baseEdgeIds.has(edgeId));
    })
    .toBe(true);

  const afterSplit = (await getFigures()) as FigureSnapshot[];
  const base2 = afterSplit.find((f) => !f.kind) as FigureSnapshot;
  const splitCandidates = base2.edges.filter(
    (e) =>
      e.kind === "cubic" &&
      e.id !== topEdge.edgeId &&
      (e.from === edgeBeforeSplit.from ||
        e.to === edgeBeforeSplit.from ||
        e.from === edgeBeforeSplit.to ||
        e.to === edgeBeforeSplit.to)
  );
  const splitEdge = splitCandidates[0];
  expect(splitEdge).toBeTruthy();
  const splitEdgeMid = cubicMidpointWorld(base2, splitEdge!.id);

  await page.getByRole("button", { name: "Selecionar" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("select");

  await stage.click({
    modifiers: ["Alt"],
    position: {
      x: Math.round(splitEdgeMid.x),
      y: Math.round(splitEdgeMid.y),
    },
  });

  await expect(page.getByText("Margem nesta aresta")).toBeVisible();
  await expect(edgeSeamCheckbox).toBeChecked();
  await expect(edgeSeamInput).toBeEnabled();
});
