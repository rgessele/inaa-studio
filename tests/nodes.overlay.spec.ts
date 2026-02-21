import { test, expect } from "./helpers/test";
import { getEditorState, gotoEditor } from "./helpers/e2e";

test("editor: nós (pontinhos) overlay modes (never/always/hover)", async ({
  page,
}) => {
  // Ensure this test doesn't depend on a persisted preference.
  await page.addInitScript(() => {
    localStorage.removeItem("inaa:nodesDisplayMode");
  });

  await gotoEditor(page);

  await expect(page.getByTestId("editor-stage-container")).toBeVisible();

  // Add a deterministic rectangle
  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.addTestRectangle) {
      throw new Error("addTestRectangle not available");
    }
    window.__INAA_DEBUG__.addTestRectangle();
  });

  await expect
    .poll(async () => (await getEditorState(page)).figuresCount)
    .toBeGreaterThan(0);

  // Mode defaults to always
  await expect
    .poll(async () => (await getEditorState(page)).nodesDisplayMode)
    .toBe("always");

  // Switch to hover
  await page.getByTestId("nodes-mode-button").click();
  await expect
    .poll(async () => (await getEditorState(page)).nodesDisplayMode)
    .toBe("hover");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) {
          throw new Error("countStageNodesByName not available");
        }
        return window.__INAA_DEBUG__.countStageNodesByName("inaa-node-point");
      });
    })
    .toBe(4);

  // Switch to never (no points rendered)
  await page.getByTestId("nodes-mode-button").click();
  await expect
    .poll(async () => (await getEditorState(page)).nodesDisplayMode)
    .toBe("never");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) return 0;
        return window.__INAA_DEBUG__.countStageNodesByName("inaa-node-point");
      });
    })
    .toBe(0);

  // Switch back to always
  await page.getByTestId("nodes-mode-button").click();
  await expect
    .poll(async () => (await getEditorState(page)).nodesDisplayMode)
    .toBe("always");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) return 0;
        return window.__INAA_DEBUG__.countStageNodesByName("inaa-node-point");
      });
    })
    .toBe(4);
});

test("editor: molde denso não renderiza overlay de nós fora da ferramenta de nós", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("inaa:nodesDisplayMode", "always");
  });

  await gotoEditor(page);
  await expect(page.getByTestId("editor-stage-container")).toBeVisible();

  await page.evaluate(() => {
    if (!window.__INAA_DEBUG__?.loadTestProject) {
      throw new Error("loadTestProject not available");
    }

    const count = 160;
    const radius = 140;
    const cx = 640;
    const cy = 360;

    const nodes = Array.from({ length: count }, (_, i) => {
      const t = (i / count) * Math.PI * 2;
      return {
        id: `n_${i}`,
        x: cx + Math.cos(t) * radius,
        y: cy + Math.sin(t) * radius,
        mode: "corner",
      };
    });

    const edges = Array.from({ length: count }, (_, i) => ({
      id: `e_${i}`,
      from: `n_${i}`,
      to: `n_${(i + 1) % count}`,
      kind: "line",
    }));

    window.__INAA_DEBUG__.loadTestProject({
      figures: [
        {
          id: "fig_dense_mold",
          name: "Molde Denso",
          tool: "line",
          kind: "mold",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          nodes,
          edges,
          stroke: "aci7",
          strokeWidth: 2,
          fill: "rgba(96,165,250,0.22)",
          opacity: 1,
        },
      ],
    });
  });

  await expect
    .poll(async () => (await getEditorState(page)).figuresCount)
    .toBe(1);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        if (!window.__INAA_DEBUG__?.countStageNodesByName) return 0;
        return window.__INAA_DEBUG__.countStageNodesByName("inaa-node-point");
      });
    })
    .toBe(0);
});
