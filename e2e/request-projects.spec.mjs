import { expect, test } from "playwright/test";
import { installMockBackend } from "./support/mock-backend.mjs";

test.beforeEach(async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/");
  await expect(page.locator("#app-view")).toBeVisible();
});

test("alterna entre os formulários nativos sem abrir o formulário personalizado", async ({ page }) => {
  await page.locator("#new-request-button").click();
  const dialog = page.locator("#request-dialog");
  const project = page.locator("#request-type");
  const programming = page.locator("#programming-fields");
  const cancellation = page.locator("#cancellation-fields");
  const tef = page.locator("#tef-fields");
  const custom = page.locator("#custom-project-fields");

  await expect(dialog).toHaveJSProperty("open", true);
  await expect(project).toHaveValue("programacao");
  await expect(programming).toBeVisible();
  await expect(cancellation).toBeHidden();
  await expect(tef).toBeHidden();
  await expect(custom).toBeHidden();

  await project.selectOption("cancelamento");
  await expect(cancellation).toBeVisible();
  await expect(programming).toBeHidden();
  await expect(tef).toBeHidden();
  await expect(custom).toBeHidden();
  await expect(page.locator("#custom-project-title")).not.toHaveText("change");

  await project.selectOption("tef_elgin");
  await expect(tef).toBeVisible();
  await expect(programming).toBeHidden();
  await expect(cancellation).toBeHidden();
  await expect(custom).toBeHidden();

  await project.selectOption("programacao");
  await expect(programming).toBeVisible();
  await expect(cancellation).toBeHidden();
  await expect(tef).toBeHidden();
  await expect(custom).toBeHidden();

  await project.selectOption("acesso-remoto");
  await expect(custom).toBeVisible();
  await expect(programming).toBeHidden();
  await expect(cancellation).toBeHidden();
  await expect(tef).toBeHidden();
  await expect(page.locator("#custom-project-title")).toHaveText("Acesso remoto");
  await expect(page.locator('[data-custom-field="motivo"]')).toHaveAttribute(
    "placeholder",
    "Descreva o motivo do acesso remoto."
  );
});

test("fecha e reabre a nova solicitação sem prender o modal", async ({ page }) => {
  await page.locator("#new-request-button").click();
  await expect(page.locator("#request-dialog")).toHaveJSProperty("open", true);
  await page.locator("#request-dialog .close-modal").first().click();
  await expect(page.locator("#request-dialog")).toHaveJSProperty("open", false);
  await page.locator("#new-request-button").click();
  await expect(page.locator("#request-dialog")).toHaveJSProperty("open", true);
  await expect(page.locator("#request-type")).toHaveValue("programacao");
});
