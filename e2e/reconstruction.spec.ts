import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("Каталог деталей: выбор, крупный вид, длина заготовки и узкий экран", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?assembly=details");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".project-name")).toContainText("Каталог");
  await page
    .getByRole("button", { name: "Ск1 · Ø12 Скоба плит", exact: true })
    .click();
  await expect(page.getByTestId("element-volume")).toHaveText("Не определён");
  await page.getByRole("button", { name: "Изолировать", exact: true }).click();
  await page.getByRole("button", { name: "Спереди", exact: true }).click();
  await page.screenshot({
    path: "test-results/kzh-detail.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Армирование", exact: true }).click();
  await expect(page.locator(".schedule")).toContainText("0,9");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("button", { name: "Навес «сухие ноги»", exact: true })
    .click();
  await page.getByLabel("Сменить тему").click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.screenshot({
    path: "test-results/kzh-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("Павильон: исходная сборка, свойства, арматура и JSON v2", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".project-name")).toContainText(
    "Кассовый павильон",
  );
  await page
    .getByRole("button", { name: "Пм1 Плита Пм1", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("element-volume")).toContainText("2,928");
  await page.screenshot({
    path: "test-results/kzh-pavilion.png",
    fullPage: true,
  });
  await page.locator("canvas").click({ position: { x: 10, y: 10 } });
  await page.getByLabel("Схема арматуры", { exact: true }).check();
  await expect(page.getByLabel("Непрозрачность")).toHaveValue("0.2");
  // Assert the rendered steel is actually visible, beyond the checkbox state.
  await page.waitForFunction(() => {
    const source = document.querySelector("canvas")!;
    const c = document.createElement("canvas");
    c.width = source.width;
    c.height = source.height;
    const context = c.getContext("2d")!;
    context.drawImage(source, 0, 0);
    const data = context.getImageData(0, 0, c.width, c.height).data;
    let gold = 0;
    for (let i = 0; i < data.length; i += 4)
      if (
        data[i] > data[i + 1] * 1.04 &&
        data[i + 1] > data[i + 2] * 1.15 &&
        data[i] > 80
      )
        gold++;
    return gold > 1000;
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({
    path: "test-results/kzh-pavilion-rebar.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Армирование", exact: true }).click();
  await expect(page.locator(".schedule")).toContainText("324,5");
  await expect(page.locator(".schedule")).toContainText("Ск1");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  const result = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(result.version).toBe(2);
  expect(
    result.elements.filter((e: { category: string }) => e.category === "ФБС"),
  ).toHaveLength(102);
  expect(result.document.sheets).toHaveLength(25);
  expect(errors).toEqual([]);
});
test("Навес: Фм2 с вырезом, лестница, источники и варианты отметок", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Навес «сухие ноги»", exact: true })
    .click();
  await page.getByLabel("Поиск конструкций").fill("Фм2");
  await page
    .getByRole("button", { name: "Фм2 Фм2 · оси 2–3/А–Б", exact: true })
    .click();
  await expect(page.getByTestId("element-volume")).toContainText("7,367");
  await page.getByRole("button", { name: "Изолировать", exact: true }).click();
  await page.getByRole("button", { name: "Изометрия", exact: true }).click();
  await page.screenshot({ path: "test-results/kzh-fm2.png", fullPage: true });
  await page
    .getByRole("button", { name: "Сбросить перемещения", exact: true })
    .click();
  await page.getByLabel("Поиск конструкций").fill("Лм1");
  await page
    .getByRole("button", { name: "Лм1 Лестничный марш Лм1", exact: true })
    .click();
  await expect(page.getByTestId("element-volume")).toHaveText("Не определён");
  await expect(page.locator(".inspector")).toContainText("5,45");
  await page.getByLabel("Вариант отметок").selectOption("sections");
  await expect(page.locator(".project-name")).toContainText("по разрезам");
  await page
    .getByRole("button", { name: "Источники и расхождения", exact: true })
    .click();
  await expect(page.locator(".source-review")).toContainText("−0,050");
  await expect(page.locator(".source-review")).toContainText("−0,100");
  await expect(page.locator(".review-content tbody tr")).toHaveCount(25);
  expect(errors).toEqual([]);
});
test("Навес: экспорт GLB, обратная загрузка v2 и ведомость источника", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Навес «сухие ноги»", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ведомость материалов", exact: true })
    .click();
  await expect(page.locator(".schedule")).toContainText("54,2");
  await expect(page.locator(".schedule")).toContainText("7 183,8");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  const saved = await pending;
  await page
    .getByLabel("Загрузить JSON", { exact: true })
    .setInputFiles((await saved.path())!);
  await expect(page.locator(".project-name")).toContainText("Навес");
  const result = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт GLB" }).click();
  const data = await readFile((await (await result).path())!);
  expect(data.subarray(0, 4).toString()).toBe("glTF");
  expect(data.readUInt32LE(8)).toBe(data.length);
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: "test-results/kzh-canopy.png",
    fullPage: true,
  });
});
