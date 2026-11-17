import { openSection } from "./navigation-helpers";
import { openTree, openCalculator, enableMultiple } from "./mobile-helpers";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Калькулятор выбирает весь объект прямыми нажатиями в 3D и учитывает изоляцию", async ({
  page,
}) => {
  await page.goto("/?assembly=canopy");
  await enableMultiple(page);
  await page.getByLabel("Поиск конструкций").fill("Фм1 · оси 1/А");
  await page
    .getByRole("button", { name: "Фм1 Фм1 · оси 1/А", exact: true })
    .click();
  await page.getByRole("button", { name: "Изолировать", exact: true }).click();
  await page
    .getByRole("button", { name: "Калькулятор материалов", exact: true })
    .click();
  const calculator = page.getByTestId("selection-calculator");
  await expect(calculator).toContainText("В расчёте: 1");
  await page.waitForLoadState("networkidle");
  const canvas = page.locator("canvas");
  const size = await canvas.boundingBox();
  if (!size) throw Error("Canvas unavailable");
  await canvas.click({ position: { x: size.width / 2, y: size.height / 2 } });
  await expect(calculator).toContainText("В расчёте: 0");
  await canvas.click({ position: { x: size.width / 2, y: size.height / 2 } });
  await expect(calculator).toContainText("В расчёте: 1");
  await expect(calculator.getByTestId("calculation-materials")).toContainText(
    "2,532 м³",
  );
  await calculator
    .getByRole("button", { name: "Очистить выбор", exact: true })
    .click();
  await calculator
    .getByRole("button", { name: "Добавить видимые", exact: true })
    .click();
  await expect(calculator).toContainText("В расчёте: 1");
});

for (const mobile of [false, true])
  test(`Калькулятор: два объекта, материалы, CSV и видимые${mobile ? " на телефоне" : ""}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?assembly=canopy");
    await openCalculator(page);
    const calculator = page.getByTestId("selection-calculator");
    await expect(calculator).toContainText("В расчёте: 0");
    await openTree(page);
    await page.getByLabel("Поиск конструкций").fill("Фм4");
    await page.getByLabel("В расчёт Фм4 · оси 8/А", { exact: true }).check();
    await page
      .getByRole("button", { name: "Фм4 Фм4 · оси 9/А", exact: true })
      .click();
    await expect(calculator).toContainText("В расчёте: 2");
    const amounts = calculator.getByTestId("calculation-materials");
    await expect(amounts).toContainText("7,31 м³");
    await expect(amounts).toContainText("1,861 м³");
    await expect(amounts).toContainText("6,752 м³");
    await expect(amounts).toContainText("938,4 кг");
    await expect(amounts).toContainText("16 шт.");
    await expect(amounts).toContainText("одинаковые откосы");
    await openCalculator(page);
    const pending = page.waitForEvent("download");
    await calculator
      .getByRole("button", { name: "Скачать расчёт CSV" })
      .click();
    const csv = await readFile((await (await pending).path())!, "utf8");
    expect(csv).toContain('"Выбрано объектов";"2"');
    expect(csv).toContain('"Анкеры M24";"шт.";"16"');
    expect(csv).toContain('"Фм4 · оси 8/А"');
    expect(csv).toContain('"Фм4 · оси 9/А"');
    await openTree(page);
    await page
      .getByRole("button", { name: "Видимость Фм4", exact: true })
      .first()
      .click();
    await expect(calculator).toContainText("Скрыто выбранных объектов: 1");
    await expect(amounts).toContainText("938,4 кг");
    await openCalculator(page);
    await calculator
      .getByRole("button", {
        name: "Убрать из расчёта Фм4 · оси 9/А",
        exact: true,
      })
      .click();
    await expect(calculator).toContainText("В расчёте: 1");
    await expect(amounts).toContainText("3,376 м³");
    await calculator
      .getByRole("button", { name: "Очистить выбор", exact: true })
      .click();
    await expect(calculator).toContainText("В расчёте: 0");
    await calculator
      .getByRole("button", { name: "Добавить видимые", exact: true })
      .click();
    await expect(calculator).toContainText("В расчёте: 168");
    await expect(amounts).toContainText("+ не определено");
    await calculator
      .getByRole("button", { name: "Очистить выбор", exact: true })
      .click();
    await openTree(page);
    await page.getByLabel("В расчёт Фм4 · оси 9/А", { exact: true }).check();
    await page.getByLabel("В расчёт Фм4 · оси 10/А", { exact: true }).check();
    await openCalculator(page);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `test-results/calculator${mobile ? "-mobile" : ""}.png`,
      fullPage: true,
    });
    if (mobile)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
    await openSection(page, "Кассовый павильон");
    await expect(calculator).toHaveCount(0);
    await openCalculator(page);
    await expect(calculator).toContainText("В расчёте: 0");
    expect(errors).toEqual([]);
  });
