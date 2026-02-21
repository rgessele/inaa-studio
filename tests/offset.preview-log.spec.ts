import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

type Point = { x: number; y: number };

type LogEvent = {
  type: string;
  payload?: {
    mode?: string;
    baseId?: string;
    edgeId?: string;
    previewKey?: string;
    pointsWorld?: Array<{ x: number; y: number }> | null;
    segmentsWorld?: Array<Array<{ x: number; y: number }>> | null;
  };
};

async function getOffsetEdgeHoverPoint(
  page: import("@playwright/test").Page
): Promise<Point> {
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

  const canvasBox = await stageCanvas.boundingBox();
  expect(canvasBox).toBeTruthy();

  const stagePoint = await page.evaluate(() => {
    const debug = window.__INAA_DEBUG__ as
      | {
          getFiguresSnapshot?: () => Array<{
            kind?: string;
            x: number;
            y: number;
            rotation: number;
            nodes: Array<{ id: string; x: number; y: number }>;
            edges: Array<{ from: string; to: string }>;
          }>;
          getPosition?: () => { x: number; y: number };
          getScale?: () => number;
        }
      | undefined;
    const figures = debug?.getFiguresSnapshot?.() ?? [];
    const base = figures.find(
      (f) =>
        f.kind !== "seam" &&
        Array.isArray(f.nodes) &&
        f.nodes.length > 1 &&
        Array.isArray(f.edges) &&
        f.edges.length > 0
    );
    if (!base) return null;

    const rotationRad = ((base.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);

    const position = debug?.getPosition?.();
    const scale = debug?.getScale?.();
    if (!position || !Number.isFinite(scale) || (scale ?? 0) <= 0) return null;

    const candidates = base.edges
      .map((edge) => {
        const from = base.nodes.find((n) => n.id === edge.from);
        const to = base.nodes.find((n) => n.id === edge.to);
        if (!from || !to) return null;

        const midLocal = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const world = {
          x: (base.x || 0) + midLocal.x * cos - midLocal.y * sin,
          y: (base.y || 0) + midLocal.x * sin + midLocal.y * cos,
        };
        return {
          x: world.x * scale + position.x,
          y: world.y * scale + position.y,
        };
      })
      .filter((entry): entry is { x: number; y: number } => entry !== null)
      .filter((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y))
      .sort((a, b) => b.y - a.y);

    return candidates[0] ?? null;
  });

  expect(stagePoint).toBeTruthy();
  const box = canvasBox as { x: number; y: number };
  const point = stagePoint as Point;
  return { x: box.x + point.x, y: box.y + point.y };
}

async function readDebugEvents(logPath: string): Promise<LogEvent[]> {
  try {
    const content = await readFile(logPath, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as LogEvent;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is LogEvent => Boolean(entry));
  } catch {
    return [];
  }
}

test("gera log de preview ao hover de aresta na margem", async ({ page }) => {
  const logDir = join(process.cwd(), ".debug");
  const logPath = join(logDir, "figure-events.log");

  await mkdir(logDir, { recursive: true });
  await rm(logPath, { force: true });

  await gotoEditor(page);

  await page.evaluate(() => {
    const fig = {
      id: "fig_mold_preview",
      tool: "rectangle" as const,
      kind: "mold" as const,
      x: 0,
      y: 0,
      rotation: 0,
      closed: true,
      nodes: [
        { id: "n1", x: 0, y: 0, mode: "corner" as const },
        { id: "n2", x: 200, y: 0, mode: "corner" as const },
        { id: "n3", x: 200, y: 120, mode: "corner" as const },
        { id: "n4", x: 0, y: 120, mode: "corner" as const },
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
    window.__INAA_DEBUG__?.loadTestProject?.({ figures: [fig] });
  });

  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => window.__INAA_DEBUG__?.getFiguresSnapshot?.().length ?? 0
        )) ?? 0
    )
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: "Margem de costura" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INAA_DEBUG__?.getState().tool)) ??
        null
    )
    .toBe("offset");

  const hoverPoint = await getOffsetEdgeHoverPoint(page);
  await page.mouse.move(hoverPoint.x, hoverPoint.y);

  await expect
    .poll(async () => {
      const events = await readDebugEvents(logPath);
      return events.find((e) => e.type === "offset-preview-edge") ?? null;
    })
    .toBeTruthy();

  const events = await readDebugEvents(logPath);
  const preview = events
    .filter((e) => e.type === "offset-preview-edge")
    .slice(-1)[0];

  expect(preview?.payload?.baseId).toBeTruthy();
  expect(preview?.payload?.edgeId).toBeTruthy();

  const segments = preview?.payload?.segmentsWorld ?? null;
  const points = preview?.payload?.pointsWorld ?? null;
  expect(segments || points).toBeTruthy();

  if (segments && segments.length > 0 && segments[0]?.length) {
    const first = segments[0][0];
    expect(Number.isFinite(first.x)).toBe(true);
    expect(Number.isFinite(first.y)).toBe(true);
  }

  if (points && points.length > 0) {
    const first = points[0];
    expect(Number.isFinite(first.x)).toBe(true);
    expect(Number.isFinite(first.y)).toBe(true);
  }
});
