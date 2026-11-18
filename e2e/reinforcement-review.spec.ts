import { test, expect } from "@playwright/test";
import { openSection } from "./navigation-helpers";
for (const mobile of [false, true])
  test(`Сверка армирования показывает состав и расхождения${mobile ? " на телефоне" : ""}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 664 });
    await page.goto("/?assembly=canopy");
    await openSection(page, "Армирование");
    await page.getByLabel("Марка армирования").selectOption("Бм2");
    const review = page.getByRole("region", {
      name: "Сверка армирования Бм2",
      exact: true,
    });
    await expect(review).toContainText("Каркас восстановлен частично");
    await expect(review).toContainText("154 шт.");
    await expect(review).toContainText("168 шт.");
    await review
      .getByText("Основания и ограничения сверки", { exact: true })
      .click();
    await review
      .getByText("Х2: 77 сечений × 2 · PDF 23", { exact: true })
      .click();
    await expect(review).toContainText("0,195; 0,395");
    await expect(review).toContainText(
      "форма и размещение самих гнутых деталей в 3D пока не восстановлены",
    );
    await page.screenshot({
      path: `.deploy/rebar-review-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.getByLabel("Марка армирования").selectOption("Фм4");
    const footing = page.getByRole("region", {
      name: "Сверка армирования Фм4",
      exact: true,
    });
    await expect(footing).toContainText("Каркас в 3D не восстановлен");
    await footing
      .getByText("Основания и ограничения сверки", { exact: true })
      .click();
    await expect(footing).toContainText("шагом 195");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(mobile ? 390 : 1440);
  });

test("Отдельный вид сразу предупреждает о неполноте каркаса", async ({
  page,
}) => {
  await page.goto("/?assembly=canopy");
  await page.getByLabel("Поиск конструкций").fill("Пм6");
  await page
    .getByRole("button", { name: "Пм6 Плита Пм6", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Открыть отдельно", exact: true })
    .click();
  const warning = page.getByRole("button", {
    name: "Полнота армирования Пм6",
    exact: true,
  });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Каркас частично");
  await warning.click();
  await expect(
    page
      .getByRole("region", { name: "Сверка армирования Пм6", exact: true })
      .first(),
  ).toContainText("Х1");
  await expect(
    page.getByLabel("Марка армирования").locator("option"),
  ).toHaveCount(2);
});
