import { test, expect } from "@playwright/test";
import { openSection } from "../e2e/navigation-helpers";

test("Главная показывает сохранённые координаты, объект открывается со своим контекстом", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("Browser-admin-1234!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Объекты строительства" }),
  ).toBeVisible();
  await openSection(page, "Объекты и участки");
  await page
    .getByRole("button", { name: "Добавить объект", exact: true })
    .click();
  await page
    .getByLabel("Название записи", { exact: true })
    .fill("Тестовая станция на карте");
  await page.getByLabel("Родительский объект").selectOption("");
  await page
    .getByLabel("Координаты на карте", { exact: true })
    .fill("55.75, 37.62");
  await page
    .getByRole("button", { name: "Сохранить запись", exact: true })
    .click();
  await expect(page.getByLabel("Редактор записи стройки")).toHaveCount(0);
  await openSection(page, "Карта объектов");
  await page
    .locator(".portfolio-site")
    .filter({ hasText: "Тестовая станция на карте" })
    .click();
  await expect(page.locator(".portfolio-preview h2")).toHaveText(
    "Тестовая станция на карте",
  );
  await expect(page.locator(".preview-bottom")).toContainText("55.75, 37.62");
  await expect(page.locator(".leaflet-interactive")).not.toHaveCount(0);
  await page.screenshot({ path: ".deploy/screenshots/personal-site.png" });
  await page
    .getByRole("button", { name: "Открыть объект", exact: true })
    .click();
  await expect(page.locator(".station-context")).toContainText(
    "Тестовая станция на карте",
  );
  await expect(
    page
      .locator(".station-workspaces")
      .getByRole("button", { name: "Модель", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Все даты и смены").check();
  await expect(page.locator(".shift-table tbody tr")).toHaveCount(0);
  await page
    .locator(".station-workspaces")
    .getByRole("button", { name: "Наряды", exact: true })
    .click();
  await expect(page.locator(".daily-order-card")).toHaveCount(0);
});
