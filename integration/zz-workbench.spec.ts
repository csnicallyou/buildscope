import { test, expect } from "@playwright/test";
import { jsPDF } from "jspdf";
import { openSection } from "../e2e/navigation-helpers";

test.use({ hasTouch: true });
test("Сохранённый PDF автоматически открывается рядом с моделью", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("Browser-admin-1234!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page
    .getByLabel("Текущая станция")
    .selectOption({ label: "Картографический тест 1" });
  await openSection(page, "Документы");
  await page
    .getByRole("button", { name: "Добавить документ", exact: true })
    .click();
  await page
    .getByLabel("Название записи", { exact: true })
    .fill("Синтетический источник КЖ");
  await page.getByLabel("Номер документа").fill("10-25-М-КЖ1.5");
  await page.getByLabel("Вид документа").selectOption("drawing");
  const pdf = new jsPDF();
  for (let i = 1; i <= 30; i++) {
    if (i > 1) pdf.addPage();
    pdf.text(`SYNTHETIC DRAWING ${i}`, 20, 20);
  }
  await page.getByLabel("Файл документа").setInputFiles({
    name: "synthetic-linked-kzh.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdf.output("arraybuffer")),
  });
  await page
    .getByRole("button", { name: "Сохранить запись", exact: true })
    .click();
  await expect(page.getByLabel("Редактор записи стройки")).toHaveCount(0);
  await page.reload();
  await page
    .getByLabel("Текущая станция")
    .selectOption({ label: "Картографический тест 1" });
  await page.getByLabel("Поиск конструкций").fill("Фм4 · оси 8/А");
  await page
    .getByRole("button", { name: "Фм4 Фм4 · оси 8/А", exact: true })
    .click();
  await page.getByRole("button", { name: "Чертёж рядом", exact: true }).click();
  await expect(page.locator(".drawing-comparison")).toBeVisible();
  await expect(page.getByTestId("pdf-page-status")).toContainText("из 30", {
    timeout: 15000,
  });
  await expect(page.locator(".drawing-comparison canvas")).toBeVisible();
  await expect(page.locator(".comparison-empty")).toHaveCount(0);
});
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
