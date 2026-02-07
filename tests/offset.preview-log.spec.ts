import { test, expect } from "./helpers/test";
import { gotoEditor } from "./helpers/e2e";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

type Box = { x: number; y: number; width: number; height: number };

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
    window.__INAA_DEBUG__?.addTestRectangle?.();
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

  const box = await getStageBox(page);
  await page.mouse.move(box.x + 100, box.y + 2);

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
