import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";
import type { Page, Locator } from "@playwright/test";

// Types for figure snapshot
interface FigureNode {
  id: string;
  x: number;
  y: number;
}

interface FigureEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
}

interface FigureSnapshot {
  id: string;
  x: number;
  y: number;
  nodes: FigureNode[];
  edges: FigureEdge[];
  tool?: string;
}

/**
 * Get figures snapshot with node/edge counts
 */
async function getFiguresSnapshot(page: Page): Promise<FigureSnapshot[]> {
  return await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.getFiguresSnapshot) {
      return [];
    }
    return window.__INAA_DEBUG__.getFiguresSnapshot();
  });
}

/**
 * Get canvas locator and its bounding box
 */
async function getCanvas(page: Page) {
  const canvas = page.getByTestId("editor-stage-container");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  return { canvas, box };
}

/**
 * Draw a rectangle using drag
 */
async function drawRectangle(
  page: Page,
  canvas: Locator,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  await page.getByRole("button", { name: "Retângulo" }).click();
  
  // Wait for tool to be active
  await expect
    .poll(async () => {
      const state = await page.evaluate(() => window.__INAA_DEBUG__?.getState());
      return state?.tool;
    })
    .toBe("rectangle");

  // Get canvas position
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not available");

  // Drag to draw rectangle
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 5 });
  await page.mouse.up();
  
  await page.waitForTimeout(100);
}

/**
 * Draw a line between points
 */
async function drawLine(
  page: Page,
  canvas: Locator,
  points: Array<{ x: number; y: number }>,
  finishWithEnter = true
) {
  await page.getByRole("button", { name: "Linha" }).click();
  
  // Wait for tool to be active
  await expect
    .poll(async () => {
      const state = await page.evaluate(() => window.__INAA_DEBUG__?.getState());
      return state?.tool;
    })
    .toBe("line");

  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not available");

  for (const point of points) {
    await page.mouse.click(box.x + point.x, box.y + point.y);
    await page.waitForTimeout(50);
  }

  if (finishWithEnter) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}

/**
 * Enable magnet join mode
 */
async function enableMagnetJoin(page: Page) {
  const toggle = page.getByTestId("magnet-join-toggle-button");
  await toggle.click();
  await page.waitForTimeout(50);
}

/**
 * Enable regular magnet (snap) mode
 */
async function enableMagnet(page: Page) {
  const toggle = page.getByTestId("magnet-toggle-button");
  await toggle.click();
  await page.waitForTimeout(50);
}

test.describe("Magnet Join Mode", () => {
  test("rectangles without magnet join should create separate figures", async ({
    page,
  }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    // Draw first rectangle
    await drawRectangle(page, canvas, cx - 50, cy - 50, cx + 50, cy + 50);

    let figures = await getFiguresSnapshot(page);
    expect(figures.length).toBe(1);

    // Draw second rectangle (overlapping corner) without magnet join
    await drawRectangle(page, canvas, cx + 50, cy - 50, cx + 150, cy + 50);

    figures = await getFiguresSnapshot(page);
    // Without magnet join, should have 2 separate figures
    expect(figures.length).toBe(2);
  });

  test("rectangles with magnet join should merge when corners overlap", async ({
    page,
  }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    // Enable magnet join AND regular magnet
    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw first rectangle (100x100)
    await drawRectangle(page, canvas, cx - 50, cy - 50, cx + 50, cy + 50);

    let figures = await getFiguresSnapshot(page);
    expect(figures.length).toBe(1);
    console.log("After first rect:", JSON.stringify(figures.map(f => ({
      nodes: f.nodes.length,
      edges: f.edges.length
    })), null, 2));

    // Draw second rectangle that shares top-right corner with first
    await drawRectangle(page, canvas, cx + 50, cy - 50, cx + 150, cy + 50);

    figures = await getFiguresSnapshot(page);
    console.log("After second rect:", JSON.stringify(figures.map(f => ({
      nodes: f.nodes.length,
      edges: f.edges.length
    })), null, 2));

    // With magnet join, should merge into 1 figure
    // 2 rects sharing 2 corners (entire edge) = 6 unique nodes (4 + 4 - 2)
    expect(figures.length).toBe(1);
    expect(figures[0].nodes.length).toBe(6);
  });

  test("line starting from rectangle node should merge correctly", async ({
    page,
  }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    // Enable magnet AND magnet join
    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw rectangle (100x100 centered)
    await drawRectangle(page, canvas, cx - 50, cy - 50, cx + 50, cy + 50);

    let figures = await getFiguresSnapshot(page);
    expect(figures.length).toBe(1);
    expect(figures[0].nodes.length).toBe(4);
    expect(figures[0].edges.length).toBe(4);

    // Draw line starting from top-left corner to a point outside
    // Top-left corner is at (cx - 50, cy - 50)
    await drawLine(page, canvas, [
      { x: cx - 50, y: cy - 50 }, // Should snap to corner
      { x: cx - 100, y: cy - 100 }, // Free endpoint
    ]);

    figures = await getFiguresSnapshot(page);
    console.log("After line from node:", JSON.stringify(figures.map(f => ({
      nodes: f.nodes.length,
      edges: f.edges.length
    })), null, 2));

    // Should merge: 4 rect nodes + 1 new endpoint = 5 nodes
    // Edges: 4 rect + 1 line = 5 edges
    expect(figures.length).toBe(1);
    expect(figures[0].nodes.length).toBe(5);
    expect(figures[0].edges.length).toBe(5);
  });

  test("line starting from rectangle edge should split edge and merge", async ({
    page,
  }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    // Enable magnet AND magnet join
    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw rectangle
    await drawRectangle(page, canvas, cx - 50, cy - 50, cx + 50, cy + 50);

    let figures = await getFiguresSnapshot(page);
    expect(figures.length).toBe(1);

    // Draw line starting from middle of top edge
    // Top edge goes from (cx-50, cy-50) to (cx+50, cy-50)
    // Middle is at (cx, cy-50)
    await drawLine(page, canvas, [
      { x: cx, y: cy - 50 }, // Middle of top edge - should snap
      { x: cx, y: cy - 100 }, // Free endpoint above
    ]);

    figures = await getFiguresSnapshot(page);
    console.log("After line from edge:", JSON.stringify(figures.map(f => ({
      nodes: f.nodes.length,
      edges: f.edges.length
    })), null, 2));

    // Should merge with edge split:
    // 4 rect nodes + 1 split node + 1 endpoint = 6 nodes
    // 4 rect edges + 1 extra from split + 1 line = 6 edges
    expect(figures.length).toBe(1);
    expect(figures[0].nodes.length).toBe(6);
    expect(figures[0].edges.length).toBe(6);
  });

  test("line endpoint should NOT merge when far from figure", async ({
    page,
  }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    // Enable magnet AND magnet join
    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw rectangle
    await drawRectangle(page, canvas, cx - 50, cy - 50, cx + 50, cy + 50);

    // Draw line: start from top edge middle, end very far away
    await drawLine(page, canvas, [
      { x: cx, y: cy - 50 }, // Middle of top edge
      { x: cx + 200, y: cy - 200 }, // Very far from rectangle
    ]);

    const figures = await getFiguresSnapshot(page);
    console.log("After line with far endpoint:", JSON.stringify(figures.map(f => ({
      nodes: f.nodes.length,
      edges: f.edges.length
    })), null, 2));

    // Should merge but endpoint NOT connected to rect node
    // 6 nodes: 4 rect + 1 split + 1 free endpoint
    // 6 edges: 5 from split rect + 1 line
    // Bug would show more edges if endpoint wrongly connected
    expect(figures.length).toBe(1);
    expect(figures[0].nodes.length).toBe(6);
    expect(figures[0].edges.length).toBe(6);
  });

  test("line from edge should connect to split node, not existing node", async ({
    page,
  }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    // Enable magnet AND magnet join
    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw rectangle: nodes A(top-left), B(top-right), C(bottom-right), D(bottom-left)
    await drawRectangle(page, canvas, cx - 50, cy - 50, cx + 50, cy + 50);

    // Draw line starting from middle of TOP edge (should create split node E)
    // The split node should be BETWEEN A and B (on the top edge)
    const topEdgeMidX = cx; // Middle of top edge
    const topEdgeMidY = cy - 50; // Y of top edge
    await drawLine(page, canvas, [
      { x: topEdgeMidX, y: topEdgeMidY }, // Start at middle of top edge
      { x: topEdgeMidX, y: topEdgeMidY - 100 }, // End above
    ]);

    const figures = await getFiguresSnapshot(page);
    expect(figures.length).toBe(1);
    const fig = figures[0];

    // Find the split node (should be at topEdgeMidX, topEdgeMidY)
    // Note: coordinates are in canvas world space
    const splitNode = fig.nodes.find(n => {
      const dx = Math.abs(n.x - topEdgeMidX);
      const dy = Math.abs(n.y - topEdgeMidY);
      return dx < 10 && dy < 10; // tolerance
    });
    expect(splitNode).toBeDefined();
    console.log("Split node ID:", splitNode?.id);

    // Find the endpoint node (should be at topEdgeMidX, topEdgeMidY - 100)
    const endNode = fig.nodes.find(n => {
      const dx = Math.abs(n.x - topEdgeMidX);
      const dy = Math.abs(n.y - (topEdgeMidY - 100));
      return dx < 10 && dy < 10;
    });
    expect(endNode).toBeDefined();
    console.log("End node ID:", endNode?.id);

    // There should be an edge connecting split node to end node
    const connectingEdge = fig.edges.find(e =>
      (e.from === splitNode?.id && e.to === endNode?.id) ||
      (e.from === endNode?.id && e.to === splitNode?.id)
    );
    console.log("Edges:", fig.edges.map(e => `${e.from} -> ${e.to}`));
    expect(connectingEdge).toBeDefined();
  });

  test("line from circle edge should connect to split node", async ({
    page,
  }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    // Enable magnet AND magnet join
    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw circle at center
    await page.getByRole("button", { name: "Círculo" }).click();
    await expect.poll(() =>
      page.evaluate(() => window.__INAA_DEBUG__?.getState()?.tool)
    ).toBe("circle");
    
    // Draw circle from center outward
    const circleCenter = { x: cx, y: cy };
    const circleRadius = 60;
    await page.mouse.move(box.x + circleCenter.x, box.y + circleCenter.y);
    await page.mouse.down();
    await page.mouse.move(box.x + circleCenter.x + circleRadius, box.y + circleCenter.y);
    await page.mouse.up();

    let figures = await getFiguresSnapshot(page);
    expect(figures.length).toBe(1);
    console.log("Circle nodes:", figures[0].nodes.length);
    console.log("Circle edges:", figures[0].edges.length);

    // Draw line starting from RIGHT side of circle (where we ended the drag)
    // This point (cx + circleRadius, cy) should be on the circle
    const startX = cx + circleRadius;
    const startY = cy;
    const endX = cx + circleRadius + 100;
    const endY = cy;

    await drawLine(page, canvas, [
      { x: startX, y: startY },
      { x: endX, y: endY },
    ]);

    figures = await getFiguresSnapshot(page);
    console.log("After line from circle:", JSON.stringify(figures.map(f => ({
      nodes: f.nodes.length,
      edges: f.edges.length,
      nodeCoords: f.nodes.map(n => ({ id: n.id.slice(-8), x: Math.round(n.x), y: Math.round(n.y) }))
    })), null, 2));

    // Should have merged
    expect(figures.length).toBe(1);
    const fig = figures[0];

    // Find the split node on circle (should be at startX, startY)
    const splitNode = fig.nodes.find(n => {
      const dx = Math.abs(n.x - startX);
      const dy = Math.abs(n.y - startY);
      return dx < 15 && dy < 15;
    });
    console.log("Split node:", splitNode ? `${splitNode.id.slice(-8)} at (${Math.round(splitNode.x)}, ${Math.round(splitNode.y)})` : "NOT FOUND");

    // Find end node
    const endNode = fig.nodes.find(n => {
      const dx = Math.abs(n.x - endX);
      const dy = Math.abs(n.y - endY);
      return dx < 15 && dy < 15;
    });
    console.log("End node:", endNode ? `${endNode.id.slice(-8)} at (${Math.round(endNode.x)}, ${Math.round(endNode.y)})` : "NOT FOUND");

    // There should be an edge connecting split node to end node
    const connectingEdge = fig.edges.find(e =>
      (e.from === splitNode?.id && e.to === endNode?.id) ||
      (e.from === endNode?.id && e.to === splitNode?.id)
    );
    console.log("Edges:", fig.edges.map(e => `${e.from.slice(-8)} -> ${e.to.slice(-8)}`));
    
    expect(splitNode).toBeDefined();
    expect(endNode).toBeDefined();
    expect(connectingEdge).toBeDefined();
  });

  test("line from rect edge with multiple segments should connect first point to split", async ({
    page,
  }) => {
    // This test simulates: start on edge, add more points, finalize with Enter
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw rectangle
    await drawRectangle(page, canvas, cx - 50, cy - 50, cx + 50, cy + 50);

    // Draw line: start from middle of top edge, go to multiple points
    // Simulating: click on edge (snap), click point 2, click point 3, press Enter
    await page.getByRole("button", { name: "Linha" }).click();
    await expect.poll(() =>
      page.evaluate(() => window.__INAA_DEBUG__?.getState()?.tool)
    ).toBe("line");

    const topEdgeMidX = cx;
    const topEdgeMidY = cy - 50;

    // Point 1: Middle of top edge (should snap to edge)
    await page.mouse.click(box.x + topEdgeMidX, box.y + topEdgeMidY);
    await page.waitForTimeout(100);

    // Point 2: Above and to the right
    await page.mouse.click(box.x + topEdgeMidX + 50, box.y + topEdgeMidY - 50);
    await page.waitForTimeout(100);

    // Point 3: Further right (far from rect)
    await page.mouse.click(box.x + topEdgeMidX + 150, box.y + topEdgeMidY - 30);
    await page.waitForTimeout(100);

    // Finalize with Enter
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    const figures = await getFiguresSnapshot(page);
    console.log("After multi-point line:", JSON.stringify(figures.map(f => ({
      nodes: f.nodes.length,
      edges: f.edges.length
    })), null, 2));

    expect(figures.length).toBe(1);
    const fig = figures[0];

    // Should have: 4 rect nodes + 1 split + 2 line endpoints = 7 nodes
    // 5 rect edges (after split) + 2 line edges = 7 edges
    expect(fig.nodes.length).toBe(7);
    expect(fig.edges.length).toBe(7);

    // Find the split node (on top edge)
    const splitNode = fig.nodes.find(n => {
      const dx = Math.abs(n.x - topEdgeMidX);
      const dy = Math.abs(n.y - topEdgeMidY);
      return dx < 15 && dy < 15;
    });
    console.log("Split node:", splitNode?.id?.slice(-8), "at", splitNode ? `(${Math.round(splitNode.x)}, ${Math.round(splitNode.y)})` : "N/A");
    expect(splitNode).toBeDefined();

    // The split node should have an edge going to the second point of the line
    const edgesFromSplit = fig.edges.filter(e => 
      e.from === splitNode?.id || e.to === splitNode?.id
    );
    console.log("Edges from/to split node:", edgesFromSplit.length);
    // Should be 3: edge to left rect node, edge to right rect node, edge to line point 2
    expect(edgesFromSplit.length).toBe(3);
  });

  test("VISUAL: line from rect edge - screenshot test", async ({ page }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    // Enable magnet AND magnet join
    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw large rectangle for visibility
    const rectLeft = cx - 100;
    const rectTop = cy - 100;
    const rectRight = cx + 100;
    const rectBottom = cy + 100;
    await drawRectangle(page, canvas, rectLeft, rectTop, rectRight, rectBottom);

    // Screenshot after rectangle
    await page.screenshot({ path: "test-results/magnet-join-1-rect.png" });

    let figures = await getFiguresSnapshot(page);
    console.log("=== AFTER RECTANGLE ===");
    console.log("Figures:", figures.length);
    console.log("Nodes:", figures[0]?.nodes?.map(n => 
      `${n.id.slice(-6)}: (${Math.round(n.x)}, ${Math.round(n.y)})`
    ));
    console.log("Edges:", figures[0]?.edges?.map(e => 
      `${e.from.slice(-6)} -> ${e.to.slice(-6)}`
    ));

    // Switch to line tool
    await page.getByRole("button", { name: "Linha" }).click();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__INAA_DEBUG__?.getState());
      return state?.tool;
    }).toBe("line");

    // Click on middle of TOP edge - should snap
    const topEdgeMidX = cx;
    const topEdgeMidY = rectTop; // top edge Y

    // Move mouse to edge first to trigger snap preview
    await page.mouse.move(box.x + topEdgeMidX, box.y + topEdgeMidY);
    await page.waitForTimeout(200);
    
    // Screenshot showing snap indicator
    await page.screenshot({ path: "test-results/magnet-join-2-hover-edge.png" });

    // Click to start line
    await page.mouse.click(box.x + topEdgeMidX, box.y + topEdgeMidY);
    await page.waitForTimeout(100);

    // Screenshot after first click
    await page.screenshot({ path: "test-results/magnet-join-3-first-click.png" });

    // Check state after first click
    const stateAfterClick = await page.evaluate(() => {
      const debug = window.__INAA_DEBUG__;
      return {
        lineDraft: debug?.getState()?.lineDraft,
      };
    });
    console.log("=== AFTER FIRST CLICK ===");
    console.log("Line draft points:", stateAfterClick.lineDraft?.pointsWorld?.length);
    console.log("Line draft joinHits:", stateAfterClick.lineDraft?.joinHits);

    // Move to second point (above the rectangle)
    const endX = topEdgeMidX;
    const endY = topEdgeMidY - 150;
    await page.mouse.move(box.x + endX, box.y + endY);
    await page.waitForTimeout(100);

    // Screenshot showing line preview
    await page.screenshot({ path: "test-results/magnet-join-4-line-preview.png" });

    // Click second point
    await page.mouse.click(box.x + endX, box.y + endY);
    await page.waitForTimeout(100);

    // Finalize with Enter
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    // Screenshot after finalize
    await page.screenshot({ path: "test-results/magnet-join-5-after-enter.png" });

    figures = await getFiguresSnapshot(page);
    console.log("=== AFTER LINE FINALIZED ===");
    console.log("Figures:", figures.length);
    if (figures.length > 0) {
      const fig = figures[0];
      console.log("Total nodes:", fig.nodes.length);
      console.log("Nodes:");
      fig.nodes.forEach((n) => {
        console.log(`  ${n.id.slice(-6)}: (${Math.round(n.x)}, ${Math.round(n.y)})`);
      });
      console.log("Total edges:", fig.edges.length);
      console.log("Edges:");
      fig.edges.forEach((e) => {
        const fromNode = fig.nodes.find((n) => n.id === e.from);
        const toNode = fig.nodes.find((n) => n.id === e.to);
        console.log(`  ${e.from.slice(-6)} -> ${e.to.slice(-6)} | (${Math.round(fromNode?.x || 0)}, ${Math.round(fromNode?.y || 0)}) -> (${Math.round(toNode?.x || 0)}, ${Math.round(toNode?.y || 0)})`);
      });

      // Find split node (should be at topEdgeMidX, topEdgeMidY in world coords)
      // Note: need to account for canvas offset
      const expectedSplitX = topEdgeMidX;
      const expectedSplitY = topEdgeMidY;
      console.log("Expected split node at:", expectedSplitX, expectedSplitY);

      const splitNode = fig.nodes.find((n) => {
        const dx = Math.abs(n.x - expectedSplitX);
        const dy = Math.abs(n.y - expectedSplitY);
        return dx < 20 && dy < 20;
      });
      
      if (splitNode) {
        console.log("Split node FOUND:", splitNode.id.slice(-6), "at", Math.round(splitNode.x), Math.round(splitNode.y));
        
        // Check edges from split node
        const edgesFromSplit = fig.edges.filter((e) => 
          e.from === splitNode.id || e.to === splitNode.id
        );
        console.log("Edges from/to split node:", edgesFromSplit.length);
        edgesFromSplit.forEach((e) => {
          const other = e.from === splitNode.id ? e.to : e.from;
          const otherNode = fig.nodes.find((n) => n.id === other);
          console.log(`  -> ${other.slice(-6)} at (${Math.round(otherNode?.x || 0)}, ${Math.round(otherNode?.y || 0)})`);
        });
      } else {
        console.log("Split node NOT FOUND at expected position!");
        console.log("Looking for a node near Y =", expectedSplitY, "(top edge)");
      }

      // Find end node
      const expectedEndX = endX;
      const expectedEndY = endY;
      const endNode = fig.nodes.find((n) => {
        const dx = Math.abs(n.x - expectedEndX);
        const dy = Math.abs(n.y - expectedEndY);
        return dx < 20 && dy < 20;
      });
      
      if (endNode) {
        console.log("End node FOUND:", endNode.id.slice(-6), "at", Math.round(endNode.x), Math.round(endNode.y));
      } else {
        console.log("End node NOT FOUND!");
      }
    }

    // Select tool to see the final result clearly
    await page.getByRole("button", { name: "Selecionar" }).click();
    await page.waitForTimeout(100);
    
    // Final screenshot
    await page.screenshot({ path: "test-results/magnet-join-6-final.png" });
  });

  test("VISUAL: line from circle edge - like user's screenshot", async ({ page }) => {
    await gotoEditor(page);
    const { box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    // Enable magnet AND magnet join
    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw circle
    await page.getByRole("button", { name: "Círculo" }).click();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__INAA_DEBUG__?.getState());
      return state?.tool;
    }).toBe("circle");

    // Draw circle: center at cx, cy with radius 80
    const circleRadius = 80;
    await page.mouse.move(box.x + cx, box.y + cy);
    await page.mouse.down();
    await page.mouse.move(box.x + cx + circleRadius, box.y + cy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Screenshot after circle
    await page.screenshot({ path: "test-results/magnet-circle-1-circle.png" });

    let figures = await getFiguresSnapshot(page);
    console.log("=== AFTER CIRCLE ===");
    console.log("Nodes:", figures[0]?.nodes?.length);
    figures[0]?.nodes?.forEach((n) => {
      console.log(`  ${n.id.slice(-6)}: (${Math.round(n.x)}, ${Math.round(n.y)})`);
    });

    // Switch to line tool
    await page.getByRole("button", { name: "Linha" }).click();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__INAA_DEBUG__?.getState());
      return state?.tool;
    }).toBe("line");

    // Click on the RIGHT side of circle (at cx + circleRadius, cy)
    // This is where circle node A should be
    const startX = cx + circleRadius;
    const startY = cy;

    // Move mouse to that point
    await page.mouse.move(box.x + startX, box.y + startY);
    await page.waitForTimeout(200);
    await page.screenshot({ path: "test-results/magnet-circle-2-hover.png" });

    // Click to start line
    await page.mouse.click(box.x + startX, box.y + startY);
    await page.waitForTimeout(100);
    await page.screenshot({ path: "test-results/magnet-circle-3-first-click.png" });

    // Second point: go right
    const midX = startX + 100;
    const midY = startY;
    await page.mouse.move(box.x + midX, box.y + midY);
    await page.waitForTimeout(100);
    await page.mouse.click(box.x + midX, box.y + midY);
    await page.waitForTimeout(100);

    // Third point: go down-right (like in user's screenshot)
    const endX = midX + 80;
    const endY = midY + 150;
    await page.mouse.move(box.x + endX, box.y + endY);
    await page.waitForTimeout(100);
    await page.screenshot({ path: "test-results/magnet-circle-4-preview.png" });
    await page.mouse.click(box.x + endX, box.y + endY);
    await page.waitForTimeout(100);

    // Finalize
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    await page.screenshot({ path: "test-results/magnet-circle-5-after-enter.png" });

    figures = await getFiguresSnapshot(page);
    console.log("=== AFTER LINE ===");
    console.log("Figures:", figures.length);
    if (figures.length > 0) {
      const fig = figures[0];
      console.log("Total nodes:", fig.nodes.length);
      fig.nodes.forEach((n) => {
        console.log(`  ${n.id.slice(-6)}: (${Math.round(n.x)}, ${Math.round(n.y)})`);
      });
      console.log("Total edges:", fig.edges.length);
      fig.edges.forEach((e) => {
        const fromNode = fig.nodes.find((n) => n.id === e.from);
        const toNode = fig.nodes.find((n) => n.id === e.to);
        console.log(`  ${e.from.slice(-6)} -> ${e.to.slice(-6)} | (${Math.round(fromNode?.x || 0)}, ${Math.round(fromNode?.y || 0)}) -> (${Math.round(toNode?.x || 0)}, ${Math.round(toNode?.y || 0)})`);
      });

      // The first point of line should connect to circle node at (startX, startY)
      const circleNode = fig.nodes.find((n) => {
        const dx = Math.abs(n.x - startX);
        const dy = Math.abs(n.y - startY);
        return dx < 10 && dy < 10;
      });
      console.log("Circle node at start position:", circleNode?.id?.slice(-6));

      // Check if this node has edge to the second point of line (midX, midY)
      const secondNode = fig.nodes.find((n) => {
        const dx = Math.abs(n.x - midX);
        const dy = Math.abs(n.y - midY);
        return dx < 10 && dy < 10;
      });
      console.log("Second node (E):", secondNode?.id?.slice(-6));

      if (circleNode && secondNode) {
        const connectingEdge = fig.edges.find((e) => 
          (e.from === circleNode.id && e.to === secondNode.id) ||
          (e.from === secondNode.id && e.to === circleNode.id)
        );
        console.log("Edge connecting circle to line:", connectingEdge ? "FOUND" : "NOT FOUND - BUG!");
      }
    }

    // Select to see final
    await page.getByRole("button", { name: "Selecionar" }).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: "test-results/magnet-circle-6-final.png" });
  });

  test("VISUAL: line NOT snapping to edge - starts slightly off", async ({ page }) => {
    // This tests when user clicks NEAR an edge but not exactly on it
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    // Enable magnet AND magnet join
    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw rectangle
    const rectLeft = cx - 100;
    const rectTop = cy - 100;
    const rectRight = cx + 100;
    const rectBottom = cy + 100;
    await drawRectangle(page, canvas, rectLeft, rectTop, rectRight, rectBottom);

    // Screenshot after rectangle
    await page.screenshot({ path: "test-results/magnet-offsnap-1-rect.png" });

    let figures = await getFiguresSnapshot(page);
    console.log("=== AFTER RECTANGLE ===");
    console.log("Rectangle top edge Y:", rectTop);
    console.log("Nodes:", figures[0]?.nodes?.map((n) => 
      `(${Math.round(n.x)}, ${Math.round(n.y)})`
    ));

    // Switch to line tool
    await page.getByRole("button", { name: "Linha" }).click();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__INAA_DEBUG__?.getState());
      return state?.tool;
    }).toBe("line");

    // Click 30 pixels ABOVE the top edge - should NOT snap if outside tolerance
    const startX = cx;
    const startY = rectTop - 30; // 30px above top edge

    await page.mouse.move(box.x + startX, box.y + startY);
    await page.waitForTimeout(200);
    await page.screenshot({ path: "test-results/magnet-offsnap-2-hover.png" });

    await page.mouse.click(box.x + startX, box.y + startY);
    await page.waitForTimeout(100);

    // Second point further up
    const endX = startX;
    const endY = startY - 100;
    await page.mouse.click(box.x + endX, box.y + endY);
    await page.waitForTimeout(100);

    // Finalize
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    await page.screenshot({ path: "test-results/magnet-offsnap-3-after-enter.png" });

    figures = await getFiguresSnapshot(page);
    console.log("=== AFTER LINE (clicked 30px above edge) ===");
    console.log("Figures:", figures.length);
    
    // Should be 2 separate figures since we didn't snap
    if (figures.length === 2) {
      console.log("CORRECT: 2 separate figures (line didn't snap to rect)");
    } else if (figures.length === 1) {
      console.log("Merged into 1 figure - checking connection...");
      const fig = figures[0];
      console.log("Nodes:", fig.nodes.length);
      fig.nodes.forEach((n) => {
        console.log(`  (${Math.round(n.x)}, ${Math.round(n.y)})`);
      });
    }

    // Select to see final
    await page.getByRole("button", { name: "Selecionar" }).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: "test-results/magnet-offsnap-4-final.png" });
  });

  // Helper to draw line with detailed logging
  async function drawLineWithLogging(
    page: Page,
    canvas: Locator,
    points: Array<{ x: number; y: number }>,
    testName: string
  ) {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not available");

    await page.getByRole("button", { name: "Linha" }).click();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__INAA_DEBUG__?.getState());
      return state?.tool;
    }).toBe("line");

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      
      // Move to point first
      await page.mouse.move(box.x + pt.x, box.y + pt.y);
      await page.waitForTimeout(100);
      
      // Check snap state before clicking
      const snapState = await page.evaluate(() => {
        const debug = window.__INAA_DEBUG__;
        return debug?.getState()?.snap;
      });
      console.log(`  Point ${i}: (${Math.round(pt.x)}, ${Math.round(pt.y)}) - Snap:`, snapState?.isSnapped ? `YES at (${Math.round(snapState.pointWorld?.x)}, ${Math.round(snapState.pointWorld?.y)}) kind=${snapState.kind}` : 'NO');

      await page.screenshot({ path: `test-results/${testName}-pt${i}-hover.png` });
      
      // Click
      await page.mouse.click(box.x + pt.x, box.y + pt.y);
      await page.waitForTimeout(50);

      // Check lineDraft after click
      const draftState = await page.evaluate(() => {
        const debug = window.__INAA_DEBUG__;
        const state = debug?.getState();
        return {
          lineDraft: state?.lineDraft,
        };
      });
      console.log(`  After click ${i}: lineDraft points=${draftState.lineDraft?.pointsWorld?.length}, joinHits=${JSON.stringify(draftState.lineDraft?.joinHits?.map((h) => h ? { kind: h.kind, pointIndex: h.pointIndex } : null))}`);
    }

    await page.screenshot({ path: `test-results/${testName}-before-enter.png` });
    
    // Finalize
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    await page.screenshot({ path: `test-results/${testName}-after-enter.png` });
  }

  test("COMPREHENSIVE: line from rect EDGE (not node)", async ({ page }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw rectangle
    const rectSize = 100;
    await drawRectangle(page, canvas, cx - rectSize, cy - rectSize, cx + rectSize, cy + rectSize);
    await page.screenshot({ path: "test-results/comp-rect-1-initial.png" });

    let figures = await getFiguresSnapshot(page);
    console.log("=== RECTANGLE CREATED ===");
    console.log("Rect nodes:", figures[0]?.nodes?.map((n) => `(${Math.round(n.x)}, ${Math.round(n.y)})`));

    // Draw line starting from MIDDLE of TOP edge
    const topEdgeY = cy - rectSize;
    const topEdgeMidX = cx;

    console.log("=== DRAWING LINE FROM TOP EDGE ===");
    console.log("Expected snap position:", topEdgeMidX, topEdgeY);

    await drawLineWithLogging(page, canvas, [
      { x: topEdgeMidX, y: topEdgeY },           // Start: middle of top edge
      { x: topEdgeMidX, y: topEdgeY - 100 },     // End: above
    ], "comp-rect");

    figures = await getFiguresSnapshot(page);
    console.log("=== AFTER LINE ===");
    console.log("Figures:", figures.length);
    
    if (figures.length === 1) {
      const fig = figures[0];
      console.log("Merged! Nodes:", fig.nodes.length);
      fig.nodes.forEach((n) => console.log(`  (${Math.round(n.x)}, ${Math.round(n.y)})`));
      console.log("Edges:", fig.edges.length);
      fig.edges.forEach((e) => {
        const from = fig.nodes.find((n) => n.id === e.from);
        const to = fig.nodes.find((n) => n.id === e.to);
        console.log(`  (${Math.round(from?.x)}, ${Math.round(from?.y)}) -> (${Math.round(to?.x)}, ${Math.round(to?.y)})`);
      });

      // Verify: split node should exist at (topEdgeMidX, topEdgeY)
      const splitNode = fig.nodes.find((n) => 
        Math.abs(n.x - topEdgeMidX) < 15 && Math.abs(n.y - topEdgeY) < 15
      );
      // End node should exist at (topEdgeMidX, topEdgeY - 100)
      const endNode = fig.nodes.find((n) => 
        Math.abs(n.x - topEdgeMidX) < 15 && Math.abs(n.y - (topEdgeY - 100)) < 15
      );

      console.log("Split node:", splitNode ? `FOUND at (${Math.round(splitNode.x)}, ${Math.round(splitNode.y)})` : "NOT FOUND");
      console.log("End node:", endNode ? `FOUND at (${Math.round(endNode.x)}, ${Math.round(endNode.y)})` : "NOT FOUND");

      if (splitNode && endNode) {
        // Check edge between them
        const connectingEdge = fig.edges.find((e) => 
          (e.from === splitNode.id && e.to === endNode.id) ||
          (e.from === endNode.id && e.to === splitNode.id)
        );
        if (connectingEdge) {
          console.log("✓ CORRECT: Edge from split to end exists");
        } else {
          console.log("✗ BUG: No edge from split to end!");
          // What edges does split node have?
          const splitEdges = fig.edges.filter((e) => e.from === splitNode.id || e.to === splitNode.id);
          console.log("Split node edges:", splitEdges.map((e) => {
            const other = e.from === splitNode.id ? e.to : e.from;
            const otherNode = fig.nodes.find((n) => n.id === other);
            return `-> (${Math.round(otherNode?.x)}, ${Math.round(otherNode?.y)})`;
          }));
        }
      }
    } else {
      console.log("NOT merged - 2 separate figures");
    }

    await page.getByRole("button", { name: "Selecionar" }).click();
    await page.screenshot({ path: "test-results/comp-rect-final.png" });
  });

  test("COMPREHENSIVE: line from circle CURVED edge", async ({ page }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw circle
    const radius = 80;
    await page.getByRole("button", { name: "Círculo" }).click();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__INAA_DEBUG__?.getState());
      return state?.tool;
    }).toBe("circle");
    
    const cbox = await canvas.boundingBox();
    if (!cbox) throw new Error("No canvas");
    await page.mouse.move(cbox.x + cx - radius, cbox.y + cy - radius);
    await page.mouse.down();
    await page.mouse.move(cbox.x + cx + radius, cbox.y + cy + radius, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    await page.screenshot({ path: "test-results/comp-circle-1-initial.png" });

    let figures = await getFiguresSnapshot(page);
    console.log("=== CIRCLE CREATED ===");
    const circleFig = figures[0];
    console.log("Circle center:", circleFig?.x, circleFig?.y);
    circleFig?.nodes?.forEach((n, i: number) => {
      const wx = circleFig.x + n.x;
      const wy = circleFig.y + n.y;
      console.log(`  Node ${i}: LOCAL(${Math.round(n.x)}, ${Math.round(n.y)}) WORLD(${Math.round(wx)}, ${Math.round(wy)})`);
    });

    // Click on the arc at 45 degrees (between right and top nodes)
    const angle = Math.PI / 4;
    const arcX = cx + radius * Math.cos(angle);
    const arcY = cy - radius * Math.sin(angle);

    console.log("=== DRAWING LINE FROM ARC ===");
    console.log("Arc click position:", Math.round(arcX), Math.round(arcY));

    await drawLineWithLogging(page, canvas, [
      { x: arcX, y: arcY },           // Start: on arc
      { x: arcX + 100, y: arcY - 50 }, // End: away from circle
    ], "comp-circle");

    figures = await getFiguresSnapshot(page);
    console.log("=== AFTER LINE ===");
    console.log("Figures:", figures.length);
    
    if (figures.length === 1) {
      const fig = figures[0];
      console.log("Merged! Nodes:", fig.nodes.length);
      fig.nodes.forEach((n) => console.log(`  (${Math.round(n.x)}, ${Math.round(n.y)})`));
      console.log("Edges:", fig.edges.length);
      fig.edges.forEach((e) => {
        const from = fig.nodes.find((n) => n.id === e.from);
        const to = fig.nodes.find((n) => n.id === e.to);
        console.log(`  (${Math.round(from?.x)}, ${Math.round(from?.y)}) -> (${Math.round(to?.x)}, ${Math.round(to?.y)})`);
      });

      // Verify split node
      const splitNode = fig.nodes.find((n) => 
        Math.abs(n.x - arcX) < 20 && Math.abs(n.y - arcY) < 20
      );
      const endNode = fig.nodes.find((n) => 
        Math.abs(n.x - (arcX + 100)) < 20 && Math.abs(n.y - (arcY - 50)) < 20
      );

      console.log("Split node:", splitNode ? `FOUND at (${Math.round(splitNode.x)}, ${Math.round(splitNode.y)})` : "NOT FOUND");
      console.log("End node:", endNode ? `FOUND at (${Math.round(endNode.x)}, ${Math.round(endNode.y)})` : "NOT FOUND");

      if (splitNode && endNode) {
        const connectingEdge = fig.edges.find((e) => 
          (e.from === splitNode.id && e.to === endNode.id) ||
          (e.from === endNode.id && e.to === splitNode.id)
        );
        if (connectingEdge) {
          console.log("✓ CORRECT: Edge from split to end exists");
        } else {
          console.log("✗ BUG: No edge from split to end!");
        }
      }
    }

    await page.getByRole("button", { name: "Selecionar" }).click();
    await page.screenshot({ path: "test-results/comp-circle-final.png" });
  });

  test("COMPREHENSIVE: curve tool from rect edge", async ({ page }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw rectangle
    const rectSize = 100;
    await drawRectangle(page, canvas, cx - rectSize, cy - rectSize, cx + rectSize, cy + rectSize);

    let figures = await getFiguresSnapshot(page);
    console.log("=== RECTANGLE CREATED ===");

    // Draw CURVE starting from middle of left edge
    const leftEdgeX = cx - rectSize;
    const leftEdgeMidY = cy;

    console.log("=== DRAWING CURVE FROM LEFT EDGE ===");
    
    await page.getByRole("button", { name: "Curva" }).click();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__INAA_DEBUG__?.getState());
      return state?.tool;
    }).toBe("curve");

    const cbox = await canvas.boundingBox();
    if (!cbox) throw new Error("No canvas");

    // Point 1: on edge
    await page.mouse.move(cbox.x + leftEdgeX, cbox.y + leftEdgeMidY);
    await page.waitForTimeout(100);
    const snapState = await page.evaluate(() => window.__INAA_DEBUG__?.getState()?.snap);
    console.log("Point 0 snap:", snapState?.isSnapped ? `YES kind=${snapState.kind}` : 'NO');
    await page.mouse.click(cbox.x + leftEdgeX, cbox.y + leftEdgeMidY);
    await page.waitForTimeout(50);

    // Point 2: away
    await page.mouse.click(cbox.x + leftEdgeX - 80, cbox.y + leftEdgeMidY - 40);
    await page.waitForTimeout(50);

    // Point 3: further
    await page.mouse.click(cbox.x + leftEdgeX - 120, cbox.y + leftEdgeMidY);
    await page.waitForTimeout(50);

    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    await page.screenshot({ path: "test-results/comp-curve-after-enter.png" });

    figures = await getFiguresSnapshot(page);
    console.log("=== AFTER CURVE ===");
    console.log("Figures:", figures.length);
    
    if (figures.length === 1) {
      const fig = figures[0];
      console.log("Merged! Nodes:", fig.nodes.length);

      const splitNode = fig.nodes.find((n) => 
        Math.abs(n.x - leftEdgeX) < 15 && Math.abs(n.y - leftEdgeMidY) < 15
      );
      console.log("Split node:", splitNode ? `FOUND at (${Math.round(splitNode.x)}, ${Math.round(splitNode.y)})` : "NOT FOUND");

      if (splitNode) {
        const splitEdges = fig.edges.filter((e) => e.from === splitNode.id || e.to === splitNode.id);
        console.log("Split node has", splitEdges.length, "edges (should be 3: 2 rect + 1 curve)");
      }
    }

    await page.getByRole("button", { name: "Selecionar" }).click();
    await page.screenshot({ path: "test-results/comp-curve-final.png" });
  });

  test("COMPREHENSIVE: line connecting circle to rect", async ({ page }) => {
    await gotoEditor(page);
    const { canvas, box } = await getCanvas(page);
    const cx = box.width / 2;
    const cy = box.height / 2;

    await enableMagnet(page);
    await enableMagnetJoin(page);

    // Draw rectangle on left
    const rectLeft = cx - 200;
    const rectTop = cy - 50;
    const rectRight = cx - 100;
    const rectBottom = cy + 50;
    await drawRectangle(page, canvas, rectLeft, rectTop, rectRight, rectBottom);

    // Draw circle on right
    await page.getByRole("button", { name: "Círculo" }).click();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__INAA_DEBUG__?.getState());
      return state?.tool;
    }).toBe("circle");
    
    const cbox = await canvas.boundingBox();
    if (!cbox) throw new Error("No canvas");
    const circleRadius = 50;
    const circleCenterX = cx + 150;
    await page.mouse.move(cbox.x + circleCenterX - circleRadius, cbox.y + cy - circleRadius);
    await page.mouse.down();
    await page.mouse.move(cbox.x + circleCenterX + circleRadius, cbox.y + cy + circleRadius, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    await page.screenshot({ path: "test-results/comp-combo-1-shapes.png" });

    let figures = await getFiguresSnapshot(page);
    console.log("=== TWO SHAPES CREATED ===");
    console.log("Figures:", figures.length);

    // Draw line connecting: rect right edge -> circle left side
    const rectRightEdgeX = rectRight;
    const rectRightEdgeMidY = cy;
    const circleLeftX = circleCenterX - circleRadius;

    console.log("=== DRAWING LINE FROM RECT TO CIRCLE ===");
    console.log("Start (rect right edge):", rectRightEdgeX, rectRightEdgeMidY);
    console.log("End (circle left):", circleLeftX, cy);

    await drawLineWithLogging(page, canvas, [
      { x: rectRightEdgeX, y: rectRightEdgeMidY },  // Rect right edge middle
      { x: circleLeftX, y: cy },                      // Circle left node
    ], "comp-combo");

    figures = await getFiguresSnapshot(page);
    console.log("=== AFTER LINE ===");
    console.log("Figures:", figures.length, "(should be 1 if all merged)");
    
    if (figures.length === 1) {
      console.log("✓ All shapes merged into one!");
      const fig = figures[0];
      console.log("Total nodes:", fig.nodes.length);
      console.log("Total edges:", fig.edges.length);
    } else {
      console.log("Figures not fully merged");
      figures.forEach((f, i) => {
        console.log(`  Figure ${i}: ${f.nodes.length} nodes, ${f.edges.length} edges`);
      });
    }

    await page.getByRole("button", { name: "Selecionar" }).click();
    await page.screenshot({ path: "test-results/comp-combo-final.png" });
  });
});