import { test, expect } from "@playwright/test";

test("login page renders", async ({ page }) => {
  await page.goto("/login");

  await expect(page).toHaveTitle(/Inaá Studio/i);
  await expect(
    page.getByRole("heading", { name: "Inaá Studio" })
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar Link de Acesso" })
  ).toBeVisible();
});
