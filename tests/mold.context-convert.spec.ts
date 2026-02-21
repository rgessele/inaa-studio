import { expect, test } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type FigureSnapshot = {
  id: string;
  kind?: "mold" | "seam";
  parentId?: string;
  tool: string;
  closed: boolean;
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    mode: "corner" | "smooth";
    inHandle?: { x: number; y: number };
    outHandle?: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    kind: "line" | "cubic";
  }>;
};

type TestFigure = {
  id: string;
  tool: "line" | "rectangle" | "circle";
  kind?: "mold" | "seam";
  parentId?: string;
  x: number;
  y: number;
  rotation: number;
  closed: boolean;
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    mode: "corner" | "smooth";
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    kind: "line" | "cubic";
  }>;
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
};

function polygonAreaAbs(flat: number[]): number {
  if (flat.length < 6) return 0;
  let area2 = 0;
  const n = Math.floor(flat.length / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = flat[i * 2]!;
    const yi = flat[i * 2 + 1]!;
    const xj = flat[j * 2]!;
    const yj = flat[j * 2 + 1]!;
    area2 += xi * yj - xj * yi;
  }
  return Math.abs(area2) * 0.5;
}

function createRectFigure(
  id: string,
  opts: {
    kind?: "mold" | "seam";
    parentId?: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }
): TestFigure {
  const n1 = `${id}_n1`;
  const n2 = `${id}_n2`;
  const n3 = `${id}_n3`;
  const n4 = `${id}_n4`;
  return {
    id,
    tool: "line",
    kind: opts.kind,
    parentId: opts.parentId,
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    nodes: [
      { id: n1, x: opts.x, y: opts.y, mode: "corner" },
      { id: n2, x: opts.x + opts.w, y: opts.y, mode: "corner" },
      { id: n3, x: opts.x + opts.w, y: opts.y + opts.h, mode: "corner" },
      { id: n4, x: opts.x, y: opts.y + opts.h, mode: "corner" },
    ],
    edges: [
      { id: `${id}_e1`, from: n1, to: n2, kind: "line" },
      { id: `${id}_e2`, from: n2, to: n3, kind: "line" },
      { id: `${id}_e3`, from: n3, to: n4, kind: "line" },
      { id: `${id}_e4`, from: n4, to: n1, kind: "line" },
    ],
    stroke: "aci7",
    strokeWidth: 2,
    fill: opts.kind === "mold" ? "rgba(96,165,250,0.22)" : "transparent",
    opacity: 1,
  };
}

function createOpenLine(id: string): TestFigure {
  return {
    id,
    tool: "line",
    x: 0,
    y: 0,
    rotation: 0,
    closed: false,
    nodes: [
      { id: `${id}_n1`, x: 200, y: 220, mode: "corner" },
      { id: `${id}_n2`, x: 360, y: 220, mode: "corner" },
    ],
    edges: [
      {
        id: `${id}_e1`,
        from: `${id}_n1`,
        to: `${id}_n2`,
        kind: "line",
      },
    ],
    stroke: "aci7",
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
  };
}

function createBranchedClosedFigure(
  id: string,
  opts?: { kind?: "mold"; fill?: string }
): TestFigure {
  // Outer contour: a -> b -> d -> c -> a
  // Internal edge: a -> d
  const a = `${id}_a`;
  const b = `${id}_b`;
  const c = `${id}_c`;
  const d = `${id}_d`;
  return {
    id,
    tool: "line",
    kind: opts?.kind,
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    nodes: [
      { id: a, x: 220, y: 160, mode: "corner" },
      { id: b, x: 430, y: 170, mode: "corner" },
      { id: d, x: 360, y: 245, mode: "corner" },
      { id: c, x: 300, y: 330, mode: "corner" },
    ],
    edges: [
      { id: `${id}_e1`, from: a, to: b, kind: "line" },
      { id: `${id}_e2`, from: b, to: d, kind: "line" },
      { id: `${id}_e3`, from: d, to: c, kind: "line" },
      { id: `${id}_e4`, from: c, to: a, kind: "line" },
      { id: `${id}_e5`, from: a, to: d, kind: "line" },
    ],
    stroke: "aci7",
    strokeWidth: 2,
    fill: opts?.fill ?? (opts?.kind === "mold" ? "rgba(96,165,250,0.22)" : "transparent"),
    opacity: 1,
  };
}

function createBranchedCurvedFigure(
  id: string,
  opts?: { kind?: "mold"; fill?: string }
): TestFigure {
  const kappa = 0.5522847498307936;
  const cx = 320;
  const cy = 240;
  const rx = 95;
  const ry = 78;
  const hx = rx * kappa;
  const hy = ry * kappa;

  const nt = `${id}_nt`;
  const nr = `${id}_nr`;
  const nb = `${id}_nb`;
  const nl = `${id}_nl`;

  return {
    id,
    tool: "line",
    kind: opts?.kind,
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    nodes: [
      {
        id: nt,
        x: cx,
        y: cy - ry,
        mode: "smooth",
      },
      {
        id: nr,
        x: cx + rx,
        y: cy,
        mode: "smooth",
      },
      {
        id: nb,
        x: cx,
        y: cy + ry,
        mode: "smooth",
      },
      {
        id: nl,
        x: cx - rx,
        y: cy,
        mode: "smooth",
      },
    ].map((n) => {
      if (n.id === nt) {
        return {
          ...n,
          inHandle: { x: cx - hx, y: cy - ry },
          outHandle: { x: cx + hx, y: cy - ry },
        };
      }
      if (n.id === nr) {
        return {
          ...n,
          inHandle: { x: cx + rx, y: cy - hy },
          outHandle: { x: cx + rx, y: cy + hy },
        };
      }
      if (n.id === nb) {
        return {
          ...n,
          inHandle: { x: cx + hx, y: cy + ry },
          outHandle: { x: cx - hx, y: cy + ry },
        };
      }
      return {
        ...n,
        inHandle: { x: cx - rx, y: cy + hy },
        outHandle: { x: cx - rx, y: cy - hy },
      };
    }),
    edges: [
      { id: `${id}_e1`, from: nt, to: nr, kind: "cubic" },
      { id: `${id}_e2`, from: nr, to: nb, kind: "cubic" },
      { id: `${id}_e3`, from: nb, to: nl, kind: "cubic" },
      { id: `${id}_e4`, from: nl, to: nt, kind: "cubic" },
      { id: `${id}_e5`, from: nt, to: nb, kind: "line" },
    ],
    stroke: "aci7",
    strokeWidth: 2,
    fill: opts?.fill ?? (opts?.kind === "mold" ? "rgba(96,165,250,0.22)" : "transparent"),
    opacity: 1,
  };
}

async function loadFigures(
  page: import("@playwright/test").Page,
  figures: TestFigure[]
) {
  await page.evaluate((payload) => {
    window.__INAA_DEBUG__?.loadTestProject?.({ figures: payload });
  }, figures);
}

async function getFigures(
  page: import("@playwright/test").Page
): Promise<FigureSnapshot[]> {
  return await page.evaluate(
    () => (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as FigureSnapshot[]
  );
}

test("context menu: converter molde em figura remove kind mold e seam derivada", async ({
  page,
}) => {
  await gotoEditor(page);
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  const mold = createRectFigure("mold_1", {
    kind: "mold",
    x: 200,
    y: 200,
    w: 140,
    h: 100,
  });
  const seam = createRectFigure("seam_1", {
    kind: "seam",
    parentId: "mold_1",
    x: 185,
    y: 185,
    w: 170,
    h: 130,
  });
  await loadFigures(page, [mold, seam]);

  await expect
    .poll(async () => (await getFigures(page)).length)
    .toBe(2);

  await stage.click({ button: "right", position: { x: 260, y: 250 } });
  await expect(page.getByTestId("edge-context-menu")).toBeVisible();
  await expect(
    page.getByTestId("edge-context-convert-mold-to-figure")
  ).toBeVisible();

  await page.getByTestId("edge-context-convert-mold-to-figure").click();
  await expect(page.getByTestId("edge-context-menu")).toHaveCount(0);

  await expect
    .poll(async () => (await getFigures(page)).length)
    .toBe(1);

  const figures = await getFigures(page);
  expect(figures[0]?.id).toBe("mold_1");
  expect(figures[0]?.kind).toBeUndefined();
});

test("context menu: converter figura em molde atualiza a própria figura", async ({
  page,
}) => {
  await gotoEditor(page);
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  const fig = createRectFigure("fig_1", {
    x: 200,
    y: 200,
    w: 140,
    h: 100,
  });
  await loadFigures(page, [fig]);

  await expect
    .poll(async () => (await getFigures(page)).length)
    .toBe(1);

  await stage.click({ button: "right", position: { x: 260, y: 250 } });
  await expect(page.getByTestId("edge-context-menu")).toBeVisible();
  await expect(
    page.getByTestId("edge-context-convert-figure-to-mold")
  ).toBeVisible();

  await page.getByTestId("edge-context-convert-figure-to-mold").click();
  await expect(page.getByTestId("edge-context-menu")).toHaveCount(0);

  await expect
    .poll(async () => {
      const figs = await getFigures(page);
      return figs.length === 1 ? figs[0]!.kind : null;
    })
    .toBe("mold");

  const figures = await getFigures(page);
  expect(figures[0]?.id).toBe("fig_1");
  expect(figures[0]?.kind).toBe("mold");
});

test("context menu: converter figura aberta em molde é bloqueado", async ({
  page,
}) => {
  await gotoEditor(page);
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  await loadFigures(page, [createOpenLine("open_line")]);

  await expect
    .poll(async () => (await getFigures(page)).length)
    .toBe(1);

  await stage.click({ button: "right", position: { x: 280, y: 220 } });
  await expect(page.getByTestId("edge-context-menu")).toBeVisible();
  await page.getByTestId("edge-context-convert-figure-to-mold").click();

  await expect
    .poll(async () => {
      const figs = await getFigures(page);
      return figs.filter((f) => f.kind === "mold").length;
    })
    .toBe(0);
});

test("context menu: converter em molde mantém preenchimento em figura com aresta interna", async ({
  page,
}) => {
  await gotoEditor(page);
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  await loadFigures(page, [createBranchedClosedFigure("branch_fig")]);

  await expect
    .poll(async () => (await getFigures(page)).length)
    .toBe(1);

  await stage.click({ button: "right", position: { x: 320, y: 230 } });
  await expect(page.getByTestId("edge-context-menu")).toBeVisible();
  await page.getByTestId("edge-context-convert-figure-to-mold").click();
  await expect(page.getByTestId("edge-context-menu")).toHaveCount(0);

  await expect
    .poll(async () => {
      const figs = await getFigures(page);
      return figs[0]?.kind ?? null;
    })
    .toBe("mold");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return window.__INAA_DEBUG__?.countStageNodesByName?.("inaa-fill-fallback") ?? 0;
      });
    })
    .toBeGreaterThan(0);
});

test("context menu: molde curvo com aresta interna usa fill com contorno amostrado (sem losango)", async ({
  page,
}) => {
  await gotoEditor(page);
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  await loadFigures(page, [createBranchedCurvedFigure("branch_curve")]);

  await expect
    .poll(async () => (await getFigures(page)).length)
    .toBe(1);

  await stage.click({ button: "right", position: { x: 320, y: 240 } });
  await expect(page.getByTestId("edge-context-menu")).toBeVisible();
  await page.getByTestId("edge-context-convert-figure-to-mold").click();
  await expect(page.getByTestId("edge-context-menu")).toHaveCount(0);

  await expect
    .poll(async () => {
      const figs = await getFigures(page);
      return figs[0]?.kind ?? null;
    })
    .toBe("mold");

  await expect
    .poll(async () => {
      const lengths = await page.evaluate(() => {
        return (
          window.__INAA_DEBUG__?.getStageNodePointsLengthByName?.(
            "inaa-fill-fallback"
          ) ?? []
        );
      });
      return lengths[0] ?? 0;
    })
    .toBeGreaterThan(100);

  const fillPoints = await page.evaluate(() => {
    const all =
      window.__INAA_DEBUG__?.getStageNodePointsByName?.("inaa-fill-fallback") ??
      [];
    return all[0] ?? [];
  });
  const fillArea = polygonAreaAbs(fillPoints);
  const expectedEllipseArea = Math.PI * 95 * 78;
  expect(fillArea).toBeGreaterThan(expectedEllipseArea * 0.8);
});
