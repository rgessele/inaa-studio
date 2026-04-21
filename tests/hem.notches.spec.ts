import { expect, test } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";
import { makeHemFigure } from "../components/editor/hemFigure";
import type { Figure } from "../components/editor/types";

test.describe.configure({ mode: "serial" });

type Box = { x: number; y: number; width: number; height: number };

function makeRectFigure(): Figure {
  return {
    id: "base_rect",
    tool: "line",
    x: 0,
    y: 0,
    rotation: 0,
    closed: true,
    stroke: "aci7",
    strokeWidth: 2,
    fill: "transparent",
    opacity: 1,
    nodes: [
      { id: "n1", x: 220, y: 200, mode: "corner" },
      { id: "n2", x: 420, y: 200, mode: "corner" },
      { id: "n3", x: 420, y: 320, mode: "corner" },
      { id: "n4", x: 220, y: 320, mode: "corner" },
    ],
    edges: [
      { id: "e12", from: "n1", to: "n2", kind: "line" },
      { id: "e23", from: "n2", to: "n3", kind: "line" },
      { id: "e34", from: "n3", to: "n4", kind: "line" },
      { id: "e41", from: "n4", to: "n1", kind: "line" },
    ],
  };
}

function vectorLength(v: { x: number; y: number }) {
  return Math.hypot(v.x, v.y);
}

function cross(
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  return a.x * b.y - a.y * b.x;
}

function dot(
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  return a.x * b.x + a.y * b.y;
}

async function getStageBox(
  page: import("@playwright/test").Page
): Promise<Box> {
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  return box as Box;
}

test("bainha: piques automáticos ficam só nas dobras internas", async () => {
  const base = makeRectFigure();
  const singleFoldHem = makeHemFigure(base, {
    widthCm: 1,
    folds: 1,
    notchesEnabled: true,
    notchType: "seta",
    selectedOuterEdgeIds: [],
    controlNodeIds: [],
    anchorEdgeId: null,
  });

  expect(singleFoldHem).toBeTruthy();
  expect(singleFoldHem?.piques?.length ?? 0).toBe(0);

  const hem = makeHemFigure(base, {
    widthCm: 1,
    folds: 2,
    notchesEnabled: true,
    notchType: "seta",
    selectedOuterEdgeIds: ["e12", "e23", "e34"],
    controlNodeIds: [],
    anchorEdgeId: null,
  });

  expect(hem).toBeTruthy();
  expect(hem?.piques?.length ?? 0).toBe(2);
  expect(hem?.piques?.every((pique) => pique.orientation === "tangent")).toBe(
    true
  );

  for (const pique of hem!.piques!) {
    const edge = hem!.edges.find((candidate) => candidate.id === pique.edgeId);
    expect(edge).toBeTruthy();

    const from = hem!.nodes.find((node) => node.id === edge!.from);
    const to = hem!.nodes.find((node) => node.id === edge!.to);
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();

    const edgeVector = { x: to!.x - from!.x, y: to!.y - from!.y };
    const edgeLength = vectorLength(edgeVector);
    expect(edgeLength).toBeGreaterThan(1);

    const edgeUnit = {
      x: edgeVector.x / edgeLength,
      y: edgeVector.y / edgeLength,
    };
    const piqueVector = {
      x: edgeUnit.x * pique.side,
      y: edgeUnit.y * pique.side,
    };
    const piqueLength = vectorLength(piqueVector);
    const normalizedCross =
      Math.abs(cross(edgeVector, piqueVector)) / (edgeLength * piqueLength);
    expect(normalizedCross).toBeLessThan(1e-6);

    const expectedSide = pique.t01 === 0 ? 1 : -1;
    expect(pique.t01 === 0 || pique.t01 === 1).toBe(true);
    expect(pique.side).toBe(expectedSide);
    if (pique.t01 === 0) {
      expect(dot(edgeVector, piqueVector)).toBeGreaterThan(0);
    } else {
      expect(dot(edgeVector, piqueVector)).toBeLessThan(0);
    }
  }
});

test("bainha: oculta linhas pontilhadas internas sem remover piques", async () => {
  const base = makeRectFigure();
  const visibleInternalFoldsHem = makeHemFigure(base, {
    widthCm: 1,
    folds: 3,
    showInternalFoldLines: true,
    notchesEnabled: true,
    notchType: "seta",
    selectedOuterEdgeIds: ["e12"],
    controlNodeIds: [],
    anchorEdgeId: null,
  });
  const hiddenInternalFoldsHem = makeHemFigure(base, {
    widthCm: 1,
    folds: 3,
    showInternalFoldLines: false,
    notchesEnabled: true,
    notchType: "seta",
    selectedOuterEdgeIds: ["e12"],
    controlNodeIds: [],
    anchorEdgeId: null,
  });

  expect(visibleInternalFoldsHem).toBeTruthy();
  expect(hiddenInternalFoldsHem).toBeTruthy();
  expect(visibleInternalFoldsHem?.seamSegments?.length ?? 0).toBe(4);
  expect(hiddenInternalFoldsHem?.seamSegments?.length ?? 0).toBe(2);
  expect(hiddenInternalFoldsHem?.hemMeta?.showInternalFoldLines).toBe(false);
  expect(hiddenInternalFoldsHem?.piques?.length ?? 0).toBe(4);
});

test("bainha: alternar piques no painel atualiza bainha existente", async ({
  page,
}) => {
  const base = makeRectFigure();
  const hem = makeHemFigure(base, {
    widthCm: 1,
    folds: 2,
    notchesEnabled: false,
    notchType: "seta",
    selectedOuterEdgeIds: ["e12"],
    controlNodeIds: [],
    anchorEdgeId: null,
  });

  expect(hem).toBeTruthy();
  expect(hem?.piques?.length ?? 0).toBe(0);

  await gotoEditor(page);
  await page.evaluate((payload) => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }
    window.__INAA_DEBUG__.loadTestProject({
      figures: [payload.base, payload.hem],
    });
  }, { base, hem });

  const box = await getStageBox(page);
  await page.mouse.click(box.x + 320, box.y + 320);
  await expect
    .poll(async () => {
      return await page.evaluate(
        (id) => window.__INAA_DEBUG__?.getState?.().selectedFigureId === id,
        base.id
      );
    })
    .toBe(true);

  const checkbox = page.getByLabel("Piques nas dobras").first();
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();

  await checkbox.check();
  await expect
    .poll(async () => {
      return await page.evaluate((id) => {
        const figures = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        const currentHem = figures.find((figure) => figure.id === id);
        return currentHem?.piques?.length ?? 0;
      }, hem!.id);
    })
    .toBeGreaterThan(0);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const konva = (
          window as typeof window & {
            Konva?: {
              stages?: Array<{
                width: () => number;
                find: (selector: string) => Array<{
                  getAttr: (name: string) => unknown;
                }>;
              }>;
            };
          }
        ).Konva;
        const mainStage = (konva?.stages ?? []).find(
          (stage) => stage.width() !== 240
        );
        const pique = mainStage?.find(".inaa-pique")?.[0];
        return Number(pique?.getAttr("strokeWidth") ?? 0);
      });
    })
    .toBeGreaterThan(2);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const konva = (
          window as typeof window & {
            Konva?: {
              stages?: Array<{
                width: () => number;
                find: (selector: string) => Array<{
                  getAttr: (name: string) => unknown;
                }>;
              }>;
            };
          }
        ).Konva;
        const mainStage = (konva?.stages ?? []).find(
          (stage) => stage.width() !== 240
        );
        const pique = mainStage?.find(".inaa-pique")?.[0];
        const dash = pique?.getAttr("dash");
        return Array.isArray(dash) ? dash.length : 0;
      });
    })
    .toBe(0);

  await checkbox.uncheck();
  await expect
    .poll(async () => {
      return await page.evaluate((id) => {
        const figures = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        const currentHem = figures.find((figure) => figure.id === id);
        return currentHem?.piques?.length ?? 0;
      }, hem!.id);
    })
    .toBe(0);
});

test("bainha: alternar dobras internas no painel atualiza bainha existente", async ({
  page,
}) => {
  const base = makeRectFigure();
  const hem = makeHemFigure(base, {
    widthCm: 1,
    folds: 2,
    showInternalFoldLines: true,
    notchesEnabled: false,
    notchType: "seta",
    selectedOuterEdgeIds: [],
    controlNodeIds: [],
    anchorEdgeId: null,
  });

  expect(hem).toBeTruthy();
  expect(hem?.seamSegments?.length ?? 0).toBe(2);

  await gotoEditor(page);
  await page.evaluate((payload) => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }
    window.__INAA_DEBUG__.loadTestProject({
      figures: [payload.base, payload.hem],
    });
  }, { base, hem });

  const box = await getStageBox(page);
  await page.mouse.click(box.x + 320, box.y + 320);
  await expect
    .poll(async () => {
      return await page.evaluate(
        (id) => window.__INAA_DEBUG__?.getState?.().selectedFigureId === id,
        base.id
      );
    })
    .toBe(true);

  const checkbox = page.getByLabel("Dobras internas pontilhadas").first();
  await expect(checkbox).toBeVisible();
  await expect(checkbox).toBeChecked();

  await checkbox.uncheck();
  await expect
    .poll(async () => {
      return await page.evaluate((id) => {
        const figures = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        const currentHem = figures.find((figure) => figure.id === id);
        return {
          segments: currentHem?.seamSegments?.length ?? 0,
          showInternalFoldLines:
            currentHem?.hemMeta?.showInternalFoldLines ?? null,
        };
      }, hem!.id);
    })
    .toEqual({ segments: 1, showInternalFoldLines: false });

  await checkbox.check();
  await expect
    .poll(async () => {
      return await page.evaluate((id) => {
        const figures = window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? [];
        const currentHem = figures.find((figure) => figure.id === id);
        return {
          segments: currentHem?.seamSegments?.length ?? 0,
          showInternalFoldLines:
            currentHem?.hemMeta?.showInternalFoldLines ?? null,
        };
      }, hem!.id);
    })
    .toEqual({ segments: 2, showInternalFoldLines: true });
});

test("minimapa: bainha desenha segmentos separados sem cruzamentos artificiais", async ({
  page,
}) => {
  const base = makeRectFigure();
  const hem = makeHemFigure(base, {
    widthCm: 1,
    folds: 2,
    notchesEnabled: true,
    notchType: "seta",
    selectedOuterEdgeIds: [],
    controlNodeIds: [],
    anchorEdgeId: null,
  });

  expect(hem).toBeTruthy();
  expect(hem?.seamSegments?.length ?? 0).toBeGreaterThan(1);

  await page.addInitScript(() => {
    localStorage.setItem("inaa:showMinimap", "true");
  });
  await gotoEditor(page);
  await page.evaluate((payload) => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }
    window.__INAA_DEBUG__.loadTestProject({
      figures: [payload.base, payload.hem],
    });
  }, { base, hem });

  await expect
    .poll(async () => {
      return await page.evaluate(
        (id) =>
          window.__INAA_DEBUG__
            ?.getFiguresSnapshot?.()
            ?.some((figure) => figure.id === id) ?? false,
        hem!.id
      );
    })
    .toBe(true);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const konva = (
          window as typeof window & {
            Konva?: {
              stages?: Array<{
                width: () => number;
                height: () => number;
                find: (selector: string) => unknown[];
              }>;
            };
          }
        ).Konva;
        const minimaps = (konva?.stages ?? []).filter(
          (stage) => stage.width() === 240 && stage.height() === 160
        );
        const minimap = minimaps[minimaps.length - 1];
        return minimap?.find(".inaa-minimap-seam-segment").length ?? 0;
      });
    })
    .toBe(hem!.seamSegments!.length);

  const minimapState = await page.evaluate(() => {
    const konva = (
      window as typeof window & {
        Konva?: {
          stages?: Array<{
            width: () => number;
            height: () => number;
            find: (selector: string) => Array<{
              getAttr: (name: string) => unknown;
            }>;
          }>;
        };
      }
    ).Konva;
    const minimaps = (konva?.stages ?? []).filter(
      (stage) => stage.width() === 240 && stage.height() === 160
    );
    const minimap = minimaps[minimaps.length - 1];
    if (!minimap) return null;
    return {
      seamSegmentPointLengths: minimap
        .find(".inaa-minimap-seam-segment")
        .map((node) => {
          const points = node.getAttr("points");
          return Array.isArray(points) ? points.length : 0;
        }),
      combinedFigureLines: minimap.find(".inaa-minimap-figure").length,
    };
  });

  expect(minimapState).toBeTruthy();
  expect(minimapState!.combinedFigureLines).toBe(1);
  expect(minimapState!.seamSegmentPointLengths).toEqual(
    hem!.seamSegments!.map((segment) => segment.length)
  );
});
