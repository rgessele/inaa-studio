import type { Locator, Page } from "@playwright/test";

export async function initE2EState(page: Page) {
  await page.addInitScript(() => {
    try {
      // Keep runs deterministic.
      if (localStorage.getItem("inaa:gridContrast") === null) {
        localStorage.setItem("inaa:gridContrast", "0.5");
      }
      if (localStorage.getItem("inaa:measureSnapStrengthPx") === null) {
        localStorage.setItem("inaa:measureSnapStrengthPx", "12");
      }
      if (localStorage.getItem("inaa:showPageGuides") === null) {
        localStorage.setItem("inaa:showPageGuides", "0");
      }
      if (localStorage.getItem("inaa:measureDisplayMode") === null) {
        localStorage.setItem("inaa:measureDisplayMode", "always");
      }
      if (localStorage.getItem("inaa:nodesDisplayMode") === null) {
        localStorage.setItem("inaa:nodesDisplayMode", "always");
      }
      if (localStorage.getItem("inaa:magnetEnabled") === null) {
        localStorage.setItem("inaa:magnetEnabled", "0");
      }
      // If the app uses theme persistence elsewhere, we keep default.
    } catch {
      // ignore
    }
  });
}

export async function gotoEditor(page: Page) {
  await initE2EState(page);
  await page.goto("/editor", { waitUntil: "networkidle" });
}

declare global {
  interface Window {
    __INAA_DEBUG__?: {
      getState: () => {
        tool: string;
        figuresCount: number;
        selectedFigureId: string | null;
        showGrid: boolean;
        showPageGuides: boolean;
        pageGuideSettings: {
          paperSize: string;
          orientation: string;
          marginCm: number;
        };
        gridContrast: number;
        measureSnapStrengthPx: number;
        measureDisplayMode: "never" | "always" | "hover";
        nodesDisplayMode: "never" | "always" | "hover";
        pointLabelsMode:
          | "off"
          | "numGlobal"
          | "numPerFigure"
          | "alphaGlobal"
          | "alphaPerFigure";
        magnetEnabled: boolean;
        projectId: string | null;
        projectName: string;
      };
      countStageNodesByName?: (name: string) => number;
      getStageNodeAbsolutePositionsByName?: (
        name: string
      ) => Array<{ x: number; y: number }>;
      getFiguresSnapshot?: () => Array<{
        id: string;
        tool: string;
        kind?: string;
        parentId?: string;
        x: number;
        y: number;
        rotation: number;
        closed: boolean;
        textValue?: string;
        textFontFamily?: string;
        textFontSizePx?: number;
        textFill?: string;
        textAlign?: "left" | "center" | "right";
        textLineHeight?: number;
        textLetterSpacing?: number;
        textWidthPx?: number;
        textWrap?: "none" | "word" | "char";
        textPaddingPx?: number;
        textBackgroundEnabled?: boolean;
        textBackgroundFill?: string;
        textBackgroundOpacity?: number;
        nodes: Array<{
          id: string;
          x: number;
          y: number;
          mode: "smooth" | "corner";
          inHandle: { x: number; y: number } | null;
          outHandle: { x: number; y: number } | null;
        }>;
        edges: Array<{ id: string; from: string; to: string; kind: string }>;
      }>;
      getSelectedFigureStats?: () => {
        nodesCount: number;
        edgesCount: number;
      } | null;
      addTestRectangle?: () => void;
      loadTestProject?: (opts?: {
        figures?: unknown[];
        pageGuideSettings?: {
          paperSize: string;
          orientation: string;
          marginCm: number;
        };
        projectId?: string;
        projectName?: string;
      }) => void;
    };
  }
}

export async function getEditorState(page: Page) {
  return await page.evaluate(() => {
    if (!window.__INAA_DEBUG__) {
      throw new Error("__INAA_DEBUG__ not available (E2E not enabled?)");
    }
    return window.__INAA_DEBUG__.getState();
  });
}

export async function dragOnCanvas(
  page: Page,
  canvas: Locator,
  opts: {
    source: { x: number; y: number };
    target: { x: number; y: number };
    steps?: number;
  }
) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas boundingBox not available");

  const steps = opts.steps ?? 12;
  await page.mouse.move(box.x + opts.source.x, box.y + opts.source.y);
  await page.mouse.down();
  await page.mouse.move(box.x + opts.target.x, box.y + opts.target.y, {
    steps,
  });
  await page.mouse.up();
}
