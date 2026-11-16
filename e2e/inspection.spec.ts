import { test, expect } from "@playwright/test";
import { jsPDF } from "jspdf";
import { openTree, modelView } from "./mobile-helpers";
for (const mobile of [false, true])
  test(`Инструменты проверки и чертежа${mobile ? " телефон" : ""}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?assembly=canopy");
    await page.getByRole("button", { name: "Фильтры", exact: true }).click();
    await page.getByLabel("Фильтр по материалу").selectOption("Щебень");
    await expect(page.locator(".model-footer")).toContainText("17 / 234");
    await page
      .getByRole("button", { name: "Сбросить фильтры", exact: true })
      .click();
    await page.getByRole("button", { name: "Фильтры", exact: true }).click();
    await openTree(page);
    await page.getByLabel("Поиск конструкций").fill("Фм1 · оси 1/А");
    await page
      .getByRole("button", { name: "Фм1 Фм1 · оси 1/А", exact: true })
      .click();
    await modelView(page);
    await expect(page.getByTestId("selected-dimensions")).toContainText(
      "X 2,4 м",
    );
    await page
      .getByRole("button", { name: "Чертёж рядом", exact: true })
      .click();
    await expect(page.locator(".drawing-comparison")).toBeVisible();
    const pdf = new jsPDF();
    for (let i = 1; i <= 30; i++) {
      if (i > 1) pdf.addPage();
      pdf.text(`SHEET ${i}`, 20, 20);
    }
    await page.getByLabel("Исходный PDF", { exact: true }).setInputFiles({
      name: "synthetic.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdf.output("arraybuffer")),
    });
    await page.getByLabel("Страница рядом с моделью").fill("30");
    await expect(page.getByTestId("pdf-page-status")).toHaveText(
      "Страница 30 из 30",
    );
    await page.screenshot({
      path: `docs/screenshots/inspection-pdf${mobile ? "-mobile" : ""}.png`,
    });
    await page.getByRole("button", { name: "Закрыть чертёж" }).click();
    await page
      .getByRole("button", { name: "Проверка модели", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Запустить проверку", exact: true })
      .click();
    await expect(page.locator(".inspection-finding").first()).toBeVisible();
    await page
      .locator(".inspection-finding")
      .first()
      .getByRole("button", { name: "Открыть и приблизить" })
      .click();
    await expect(page.locator(".audit-focus")).toBeVisible();
    await expect(page.locator(".model-stage canvas")).toBeVisible();
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      mobile ? 390 : 1440,
    );
    expect(errors).toEqual([]);
  });

test("Арматура по группам и размеры отдельного объекта", async ({ page }) => {
  await page.goto("/?assembly=canopy");
  await page.getByLabel("Поиск конструкций").fill("Фм1 · оси 1/А");
  await page
    .getByRole("button", { name: "Фм1 Фм1 · оси 1/А", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Открыть отдельно", exact: true })
    .click();
  await page.getByRole("button", { name: "Отображение", exact: true }).click();
  await page.getByLabel("Скрыть бетон", { exact: true }).check();
  await page.getByLabel("Сетки", { exact: true }).uncheck();
  await page.getByLabel("Хомуты и скобы", { exact: true }).uncheck();
  await page.getByLabel("Продольные и прочие", { exact: true }).uncheck();
  await expect(page.locator(".model-footer")).toContainText("2 / 5");
  await page.getByLabel("Анкеры", { exact: true }).uncheck();
  await expect(page.locator(".model-footer")).toContainText("1 / 5");
  await page.getByRole("button", { name: "Вся схема", exact: true }).click();
  await expect(page.locator(".model-footer")).toContainText("5 / 5");
  await page
    .getByRole("button", { name: "Фм1 Фм1 · оси 1/А", exact: true })
    .click();
  await expect(page.getByTestId("selected-dimensions")).toContainText("2,4 м");
  await expect(page.getByTestId("element-volume")).toHaveText("2,592 м³");
  await page.screenshot({ path: "docs/screenshots/dimensions-rebar.png" });
});
