import type { Page } from "@playwright/test";

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
        localStorage.setItem("inaa:measureDisplayMode", "never");
      }
      if (localStorage.getItem("inaa:nodesDisplayMode") === null) {
        localStorage.setItem("inaa:nodesDisplayMode", "never");
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
        projectId: string | null;
        projectName: string;
      };
      countStageNodesByName?: (name: string) => number;
      getSelectedFigureStats?: () =>
        | {
            nodesCount: number;
            edgesCount: number;
          }
        | null;
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
