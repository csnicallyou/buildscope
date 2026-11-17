import { test, expect } from "@playwright/test";
import { openSection } from "../e2e/navigation-helpers";

test.use({ hasTouch: true });
test("Рабочий контекст сохраняется между моделью, документами, ресурсами и сменами", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("Browser-admin-1234!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page
    .getByLabel("Текущая станция")
    .selectOption({ label: "Картографический тест 1" });
  await expect(page.locator(".model-stage canvas")).toBeVisible();
  const station = await page.getByLabel("Текущая станция").inputValue();
  await page.getByLabel("Рабочая дата", { exact: true }).fill("2026-11-16");
  await page
    .getByRole("region", { name: "Рабочий контекст" })
    .getByRole("button", { name: "День", exact: true })
    .click();
  for (const section of [
    "Документы",
    "Техника",
    "Бригады",
    "Материалы",
    "Контроль смены",
  ]) {
    await openSection(page, section);
    await expect(page.getByLabel("Текущая станция")).toHaveValue(station);
    await expect(page.getByLabel("Рабочая дата", { exact: true })).toHaveValue(
      "2026-11-16",
    );
    await expect(
      page
        .getByRole("region", { name: "Рабочий контекст" })
        .getByRole("button", { name: "День", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const dock = page.getByRole("navigation", { name: "Управление стройкой" });
  const labels = await dock.getByRole("button").allTextContents();
  await dock.getByRole("button", { name: "Модель", exact: true }).tap();
  await expect(page.locator(".model-stage canvas")).toBeVisible();
  expect(await dock.getByRole("button").allTextContents()).toEqual(labels);
  await expect(page.getByLabel("Текущая станция")).toHaveValue(station);
  await openSection(page, "Документы");
  expect(await dock.getByRole("button").allTextContents()).toEqual(labels);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Оригинал отчёта рядом с данными и Фото/Данные на телефоне сохраняют ввод проверки", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("Browser-admin-1234!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await openSection(page, "Наряды по дням");
  await page
    .locator(".daily-order-card")
    .filter({ hasText: "ООО Тест-014" })
    .click();
  await page.getByRole("button", { name: "Проверка", exact: true }).click();
  const original = page.getByRole("complementary", { name: "Оригинал отчёта" });
  await expect(original.locator("img")).toBeVisible();
  await expect
    .poll(() =>
      original
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  const amount = page.getByLabel("Проверенный объём 1", { exact: true });
  const before = await amount.inputValue();
  await amount.fill("1.25");
  const a = (await original.boundingBox())!;
  const b = (await page.locator(".order-detail-fields").boundingBox())!;
  expect(a.x + a.width).toBeLessThanOrEqual(b.x);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Фото", exact: true }).tap();
  await expect(original).toBeVisible();
  await expect(amount).toBeHidden();
  await page.getByRole("button", { name: "Данные", exact: true }).tap();
  await expect(amount).toHaveValue("1.25");
  await amount.fill(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
