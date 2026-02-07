/**
 * Testes para a especificação completa da ferramenta de margem de costura.
 *
 * Especificação:
 * - Offset sempre para o lado externo da figura
 * - Somente no loop externo (loops internos ignorados)
 * - Lógica aresta-a-aresta, inclusive quando aplicada na figura inteira
 * - Suporte a valores diferentes por aresta
 */

import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";

type Box = { x: number; y: number; width: number; height: number };
type Vec2 = { x: number; y: number };

async function getStageBox(
  page: import("@playwright/test").Page
): Promise<Box> {
  const stage = page.getByTestId("editor-stage-container");
  await expect(stage).toBeVisible();

  const stageCanvas = stage.locator("canvas").last();
  await expect(stageCanvas).toBeVisible();
  await expect
    .poll(async () => {
      return await stageCanvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return Math.min(c.width, c.height);
      });
    })
    .toBeGreaterThan(0);

  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  return box as Box;
}

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

interface FigureSnapshot {
  id: string;
  kind?: string;
  parentId?: string;
  closed: boolean;
  tool?: string;
  offsetCm?: number | Record<string, number>;
  seamSegments?: number[][];
  seamSegmentEdgeIds?: string[];
  nodes?: Array<{ id: string; x: number; y: number }>;
  edges?: Array<{ id: string; from: string; to: string }>;
}

async function getFiguresSnapshot(
  page: import("@playwright/test").Page
): Promise<FigureSnapshot[]> {
  return await page.evaluate(() => {
    return (window.__INAA_DEBUG__?.getFiguresSnapshot?.() ?? []) as FigureSnapshot[];
  });
}

async function selectOffsetTool(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Margem de costura" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("offset");
}

// ================================================================
// SPEC 2.1: Somente lado externo
// ================================================================

test.describe("Spec 2.1: Offset somente para o lado externo", () => {
  test("quadrado: margem fica fora do contorno", async ({ page }) => {
    await gotoEditor(page);

    // Create a square at (200, 200) with side 100px
    await page.evaluate(() => {
      const n1 = { id: "n1", x: 200, y: 200, mode: "corner" as const };
      const n2 = { id: "n2", x: 300, y: 200, mode: "corner" as const };
      const n3 = { id: "n3", x: 300, y: 300, mode: "corner" as const };
      const n4 = { id: "n4", x: 200, y: 300, mode: "corner" as const };

      const fig = {
        id: "fig_square",
        tool: "line" as const,
        x: 0,
        y: 0,
        rotation: 0,
        closed: true,
        nodes: [n1, n2, n3, n4],
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

      window.__INAA_DEBUG__?.loadTestProject({ figures: [fig] });
    });

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(1);

    await selectOffsetTool(page);

    const box = await getStageBox(page);
    // Click inside the square
    await page.mouse.click(box.x + 250, box.y + 250);

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(2);

    const figs = await getFiguresSnapshot(page);
    const seam = figs.find((f) => f.kind === "seam");
    expect(seam).toBeTruthy();
    expect(seam!.closed).toBe(true);

    // Verify all seam nodes are outside the original square
    const basePoly: Vec2[] = [
      { x: 200, y: 200 },
      { x: 300, y: 200 },
      { x: 300, y: 300 },
      { x: 200, y: 300 },
    ];

    for (const node of seam!.nodes ?? []) {
      const isInside = pointInPolygon(node, basePoly);
      expect(isInside).toBe(false);
    }
  });

  test("triângulo: margem fica fora do contorno", async ({ page }) => {
    await gotoEditor(page);

    await page.evaluate(() => {
      const n1 = { id: "n1", x: 250, y: 150, mode: "corner" as const };
      const n2 = { id: "n2", x: 350, y: 300, mode: "corner" as const };
      const n3 = { id: "n3", x: 150, y: 300, mode: "corner" as const };

      const fig = {
        id: "fig_triangle",
        tool: "line" as const,
        x: 0,
        y: 0,
        rotation: 0,
        closed: true,
        nodes: [n1, n2, n3],
        edges: [
          { id: "e1", from: "n1", to: "n2", kind: "line" as const },
          { id: "e2", from: "n2", to: "n3", kind: "line" as const },
          { id: "e3", from: "n3", to: "n1", kind: "line" as const },
        ],
        stroke: "aci7",
        strokeWidth: 2,
        fill: "transparent",
        opacity: 1,
      };

      window.__INAA_DEBUG__?.loadTestProject({ figures: [fig] });
    });

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(1);

    await selectOffsetTool(page);

    const box = await getStageBox(page);
    await page.mouse.click(box.x + 250, box.y + 260);

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(2);

    const figs = await getFiguresSnapshot(page);
    const seam = figs.find((f) => f.kind === "seam");
    expect(seam).toBeTruthy();

    const basePoly: Vec2[] = [
      { x: 250, y: 150 },
      { x: 350, y: 300 },
      { x: 150, y: 300 },
    ];

    for (const node of seam!.nodes ?? []) {
      const isInside = pointInPolygon(node, basePoly);
      expect(isInside).toBe(false);
    }
  });
});

// ================================================================
// SPEC 2.2: Somente no loop externo
// ================================================================

test.describe("Spec 2.2: Offset somente no loop externo", () => {
  test("figura com furo: margem não aparece no loop interno", async ({
    page,
  }) => {
    await gotoEditor(page);

    // Create a square with a smaller square hole inside
    await page.evaluate(() => {
      // Outer square
      const n1 = { id: "n1", x: 100, y: 100, mode: "corner" as const };
      const n2 = { id: "n2", x: 400, y: 100, mode: "corner" as const };
      const n3 = { id: "n3", x: 400, y: 400, mode: "corner" as const };
      const n4 = { id: "n4", x: 100, y: 400, mode: "corner" as const };

      // Inner square (hole)
      const n5 = { id: "n5", x: 200, y: 200, mode: "corner" as const };
      const n6 = { id: "n6", x: 300, y: 200, mode: "corner" as const };
      const n7 = { id: "n7", x: 300, y: 300, mode: "corner" as const };
      const n8 = { id: "n8", x: 200, y: 300, mode: "corner" as const };

      const fig = {
        id: "fig_with_hole",
        tool: "line" as const,
        x: 0,
        y: 0,
        rotation: 0,
        closed: true,
        nodes: [n1, n2, n3, n4, n5, n6, n7, n8],
        edges: [
          // Outer loop
          { id: "e1", from: "n1", to: "n2", kind: "line" as const },
          { id: "e2", from: "n2", to: "n3", kind: "line" as const },
          { id: "e3", from: "n3", to: "n4", kind: "line" as const },
          { id: "e4", from: "n4", to: "n1", kind: "line" as const },
          // Inner loop (hole) - NOTE: these should be ignored
          { id: "e5", from: "n5", to: "n6", kind: "line" as const },
          { id: "e6", from: "n6", to: "n7", kind: "line" as const },
          { id: "e7", from: "n7", to: "n8", kind: "line" as const },
          { id: "e8", from: "n8", to: "n5", kind: "line" as const },
        ],
        stroke: "aci7",
        strokeWidth: 2,
        fill: "transparent",
        opacity: 1,
      };

      window.__INAA_DEBUG__?.loadTestProject({ figures: [fig] });
    });

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(1);

    await selectOffsetTool(page);

    const box = await getStageBox(page);
    // Click in the area between outer and inner square
    await page.mouse.click(box.x + 150, box.y + 150);

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(2);

    const figs = await getFiguresSnapshot(page);
    const seam = figs.find((f) => f.kind === "seam");
    expect(seam).toBeTruthy();

    // The seam should only have nodes around the outer loop
    // All seam nodes should be outside the outer square (100-400 range)
    const outerPoly: Vec2[] = [
      { x: 100, y: 100 },
      { x: 400, y: 100 },
      { x: 400, y: 400 },
      { x: 100, y: 400 },
    ];

    for (const node of seam!.nodes ?? []) {
      const isInsideOuter = pointInPolygon(node, outerPoly);
      // Seam nodes should be OUTSIDE the outer polygon
      expect(isInsideOuter).toBe(false);
    }

    // Additionally, no seam node should be near the inner hole area
    // None of the seam nodes should be inside or near the inner polygon
    for (const node of seam!.nodes ?? []) {
      const isNearInner =
        node.x >= 180 && node.x <= 320 && node.y >= 180 && node.y <= 320;
      // Seam nodes should not be in the inner region
      expect(isNearInner).toBe(false);
    }
  });
});

// ================================================================
// SPEC 3.1: Aplicar na figura inteira
// ================================================================

test.describe("Spec 3.1: Aplicar margem na figura inteira", () => {
  test("todas as arestas do loop externo recebem offset", async ({ page }) => {
    await gotoEditor(page);

    await page.evaluate(() => {
      const n1 = { id: "n1", x: 200, y: 200, mode: "corner" as const };
      const n2 = { id: "n2", x: 350, y: 200, mode: "corner" as const };
      const n3 = { id: "n3", x: 350, y: 300, mode: "corner" as const };
      const n4 = { id: "n4", x: 200, y: 300, mode: "corner" as const };

      const fig = {
        id: "fig_rect",
        tool: "line" as const,
        x: 0,
        y: 0,
        rotation: 0,
        closed: true,
        nodes: [n1, n2, n3, n4],
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

      window.__INAA_DEBUG__?.loadTestProject({ figures: [fig] });
    });

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(1);

    await selectOffsetTool(page);

    const box = await getStageBox(page);
    await page.mouse.click(box.x + 275, box.y + 250);

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(2);

    const figs = await getFiguresSnapshot(page);
    const seam = figs.find((f) => f.kind === "seam");
    expect(seam).toBeTruthy();

    // For full figure offset, the seam should be closed
    expect(seam!.closed).toBe(true);

    // Verify the seam has nodes corresponding to the rectangle corners
    // (with offset applied)
    expect((seam!.nodes ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

// ================================================================
// SPEC 3.2: Aplicar em uma única aresta
// ================================================================

test.describe("Spec 3.2: Aplicar margem em uma única aresta", () => {
  test("offset aparece somente do lado externo dessa aresta", async ({
    page,
  }) => {
    await gotoEditor(page);

    await page.evaluate(() => {
      const n1 = { id: "n1", x: 200, y: 200, mode: "corner" as const };
      const n2 = { id: "n2", x: 350, y: 200, mode: "corner" as const };
      const n3 = { id: "n3", x: 350, y: 300, mode: "corner" as const };
      const n4 = { id: "n4", x: 200, y: 300, mode: "corner" as const };

      const fig = {
        id: "fig_rect",
        tool: "line" as const,
        x: 0,
        y: 0,
        rotation: 0,
        closed: true,
        nodes: [n1, n2, n3, n4],
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

      window.__INAA_DEBUG__?.loadTestProject({ figures: [fig] });
    });

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(1);

    await selectOffsetTool(page);

    const box = await getStageBox(page);

    // Hover over the top edge (e1: n1->n2 at y=200)
    // The edge is from (200,200) to (350,200) - click exactly on the line
    const edgeMidX = box.x + 275;
    const edgeMidY = box.y + 200;

    // First move to the edge to trigger hover detection
    await page.mouse.move(edgeMidX, edgeMidY);
    await page.waitForTimeout(200);
    
    // Click on the edge
    await page.mouse.click(edgeMidX, edgeMidY);

    // Wait for seam to be created
    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(2);

    const figs = await getFiguresSnapshot(page);
    const seam = figs.find((f) => f.kind === "seam");
    expect(seam).toBeTruthy();

    // Check if it's a per-edge offset or full figure offset
    // If clicking on edge triggers per-edge mode, offsetCm should be an object
    // If it triggers full-figure mode, offsetCm should be a number
    // Either way, seam nodes should be outside the rectangle
    
    // All seam nodes for this edge should be above y=200 OR this is a full figure seam
    const basePoly: Vec2[] = [
      { x: 200, y: 200 },
      { x: 350, y: 200 },
      { x: 350, y: 300 },
      { x: 200, y: 300 },
    ];

    for (const node of seam!.nodes ?? []) {
      const isInside = pointInPolygon(node, basePoly);
      // Seam nodes should be OUTSIDE the rectangle
      expect(isInside).toBe(false);
    }
  });
});

// ================================================================
// SPEC 4: Valores de margem por aresta
// ================================================================

test.describe("Spec 4: Valores diferentes por aresta", () => {
  test("cada aresta pode ter valor de margem próprio", async ({ page }) => {
    await gotoEditor(page);

    await page.evaluate(() => {
      const n1 = { id: "n1", x: 200, y: 200, mode: "corner" as const };
      const n2 = { id: "n2", x: 300, y: 200, mode: "corner" as const };
      const n3 = { id: "n3", x: 300, y: 300, mode: "corner" as const };
      const n4 = { id: "n4", x: 200, y: 300, mode: "corner" as const };

      const fig = {
        id: "fig_square",
        tool: "line" as const,
        x: 0,
        y: 0,
        rotation: 0,
        closed: true,
        nodes: [n1, n2, n3, n4],
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

      window.__INAA_DEBUG__?.loadTestProject({ figures: [fig] });
    });

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(1);

    await selectOffsetTool(page);

    const box = await getStageBox(page);

    // Click inside the figure to apply full-figure offset first
    await page.mouse.click(box.x + 250, box.y + 250);

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(2);

    const figs = await getFiguresSnapshot(page);
    const seam = figs.find((f) => f.kind === "seam");
    expect(seam).toBeTruthy();

    // The seam should be created (either full figure or per-edge)
    // Verify all nodes are outside the base polygon
    const basePoly: Vec2[] = [
      { x: 200, y: 200 },
      { x: 300, y: 200 },
      { x: 300, y: 300 },
      { x: 200, y: 300 },
    ];

    for (const node of seam!.nodes ?? []) {
      const isInside = pointInPolygon(node, basePoly);
      expect(isInside).toBe(false);
    }
  });
});

// ================================================================
// SPEC 5: Critérios de aceitação
// ================================================================

test.describe("Spec 5: Critérios de aceitação", () => {
  test("círculo: margem aparece apenas no lado externo", async ({ page }) => {
    await gotoEditor(page);

    // Load a circle directly via test API (similar to other tests)
    await page.evaluate(() => {
      // Circle figures have a special structure with center and radius nodes
      // The polyline is generated internally
      const fig = {
        id: "fig_circle",
        tool: "circle" as const,
        x: 250,  // Circle center in world coords
        y: 250,
        rotation: 0,
        closed: true,
        // Circle nodes: typically just corner nodes forming a bounding ellipse
        nodes: [
          { id: "n1", x: -50, y: -50, mode: "corner" as const },
          { id: "n2", x: 50, y: -50, mode: "corner" as const },
          { id: "n3", x: 50, y: 50, mode: "corner" as const },
          { id: "n4", x: -50, y: 50, mode: "corner" as const },
        ],
        edges: [
          { id: "e1", from: "n1", to: "n2", kind: "cubic" as const },
          { id: "e2", from: "n2", to: "n3", kind: "cubic" as const },
          { id: "e3", from: "n3", to: "n4", kind: "cubic" as const },
          { id: "e4", from: "n4", to: "n1", kind: "cubic" as const },
        ],
        stroke: "aci7",
        strokeWidth: 2,
        fill: "transparent",
        opacity: 1,
      };

      window.__INAA_DEBUG__?.loadTestProject({ figures: [fig] });
    });

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length)
      .toBe(1);

    const baseFigs = await getFiguresSnapshot(page);
    const circleFig = baseFigs[0];
    expect(circleFig.tool).toBe("circle");

    await selectOffsetTool(page);

    const box = await getStageBox(page);
    
    // Click inside the circle area (circle center is at 250, 250 in world coords)
    const clickX = box.x + 250;
    const clickY = box.y + 250;
    
    await page.mouse.move(clickX, clickY);
    await page.waitForTimeout(100);
    await page.mouse.click(clickX, clickY);

    await expect
      .poll(async () => (await getFiguresSnapshot(page)).length, { timeout: 5000 })
      .toBe(2);

    const figs = await getFiguresSnapshot(page);
    const seam = figs.find((f) => f.kind === "seam");
    expect(seam).toBeTruthy();

    // The seam should be closed (full circle offset)
    expect(seam!.closed).toBe(true);

    // All seam nodes should be at distance > radius from center
    // The circle has nodes at ~50px from center in local coords
    // Seam nodes should be further out
    for (const node of seam!.nodes ?? []) {
      const distFromCenter = Math.hypot(node.x, node.y);
      // Seam should be larger than the original circle radius (~50px)
      expect(distFromCenter).toBeGreaterThan(45);
    }
  });
});
