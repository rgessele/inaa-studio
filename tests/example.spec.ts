import { test, expect } from "./helpers/test";

test("login page renders", async ({ page }) => {
  await page.goto("/login");

  await expect(page).toHaveTitle(/Inaá Studio/i);
  await expect(page.getByAltText("Inaá Studio")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar Link de Acesso" })
  ).toBeVisible();
});
