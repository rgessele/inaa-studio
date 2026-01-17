import { expect, test as base } from "@playwright/test";

const e2eToken = process.env.E2E_TOKEN ?? "inaa-e2e-token";

export const test = base.extend({});

test.beforeEach(async ({ baseURL, page }) => {
  const origin = baseURL ? new URL(baseURL).origin : undefined;

  await page.route("**/*", async (route) => {
    const request = route.request();
    const headers = { ...request.headers() };

    // Never send the auth bypass header to third-party origins (fonts, analytics, etc).
    delete headers["x-e2e-token"];

    if (origin && request.url().startsWith(origin)) {
      headers["x-e2e-token"] = e2eToken;
    }

    await route.continue({ headers });
  });
});

export { expect };
