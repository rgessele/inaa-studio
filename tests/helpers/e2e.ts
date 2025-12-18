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
        projectId: string | null;
        projectName: string;
      };
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
