import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mock-backend.mjs";

test("exibe a tela de login quando não existe sessão", async ({ page }) => {
  await installMockBackend(page, { authenticated: false });
  await page.goto("/");
  await expect(page.locator("#login-view")).toBeVisible();
  await expect(page.locator("#login-form")).toBeVisible();
  await expect(page.locator("#login-email")).toBeEditable();
  await expect(page.locator("#login-password")).toBeEditable();
  await expect(page.locator("#app-view")).toBeHidden();
});
