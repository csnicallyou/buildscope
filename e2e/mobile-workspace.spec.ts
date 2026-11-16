import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("Телефон: выдвижной список, группа, нижние панели, статусы и PDF", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?assembly=canopy");
  const dock = page.getByRole("navigation", { name: "Панели просмотра" });
  await expect(dock).toBeVisible();
  await expect(page.getByLabel("Поиск конструкций")).not.toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(844);
  await dock.getByRole("button", { name: "Конструкции", exact: true }).click();
  await page.getByLabel("Поиск конструкций").fill("Фм4");
  await page.getByLabel("В расчёт Фм4 · оси 8/А", { exact: true }).check();
  await page.getByLabel("В расчёт Фм4 · оси 9/А", { exact: true }).check();
  await page.screenshot({
    path: "test-results/mobile-drawer.png",
    fullPage: true,
  });
  await dock.getByRole("button", { name: "Модель", exact: true }).click();
  await page
    .getByRole("button", { name: "Показать только выбранные", exact: true })
    .click();
  await expect(page.locator(".model-footer")).toContainText("6 / 234");
  await expect(page.locator(".model-footer")).toContainText("15,922");
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: "test-results/mobile-group.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Рассчитать выбранные", exact: true })
    .click();
  const calc = page.getByTestId("selection-calculator");
  await expect(calc).toBeVisible();
  await expect(calc).toContainText("В расчёте: 2");
  await page
    .getByRole("button", { name: "Развернуть панель", exact: true })
    .click();
  await expect(calc.getByTestId("calculation-materials")).toContainText(
    "По размерам",
  );
  await expect(calc.getByTestId("calculation-materials")).toContainText(
    "С допущением",
  );
  await expect(calc.getByTestId("calculation-materials")).toContainText(
    "Из ведомости",
  );
  await expect(calc.getByTestId("calculation-materials")).toContainText(
    "По схеме",
  );
  await page.screenshot({
    path: "test-results/mobile-quantities.png",
    fullPage: true,
  });
  await calc
    .getByRole("button", { name: "Скачать PDF-отчёт", exact: true })
    .scrollIntoViewIfNeeded();
  const pending = page.waitForEvent("download");
  await calc
    .getByRole("button", { name: "Скачать PDF-отчёт", exact: true })
    .click();
  const downloaded = await pending;
  await mkdir("output/pdf", { recursive: true });
  await downloaded.saveAs("output/pdf/buildscope-selected-report.pdf");
  await page
    .getByRole("button", { name: "Свернуть панель", exact: true })
    .click();
  await expect(page.locator("canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Вернуть весь проект", exact: true })
    .click();
  await expect(page.locator(".model-footer")).toContainText("234 / 234");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(844);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 844, height: 390 });
  const canvas = await page.locator("canvas").boundingBox();
  expect(canvas!.height).toBeGreaterThanOrEqual(100);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/mobile-landscape.png",
    fullPage: true,
  });
});
