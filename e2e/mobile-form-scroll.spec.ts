import { test, expect, type Locator } from "@playwright/test";
import { openSection } from "./navigation-helpers";

test.use({ hasTouch: true });

async function expectTouchable(field: Locator) {
  await expect(field).toBeInViewport();
  await expect
    .poll(() =>
      field.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
        );
        return hit === el || (hit !== null && el.contains(hit));
      }),
    )
    .toBe(true);
}

for (const viewport of [
  { width: 390, height: 664 },
  { width: 360, height: 640 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 390, height: 400 },
]) {
  test(`Поля наряда доступны без перекрытия ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?assembly=canopy");
    await openSection(page, "Наряд");
    await page.getByRole("button", { name: "1. Смена", exact: true }).tap();
    const contractor = page.getByLabel("Подрядчик наряда");
    await contractor.tap();
    await contractor.fill("Мобильная проверка");
    await expectTouchable(contractor);
    await page.getByRole("button", { name: "2. Работы", exact: true }).tap();
    const construction = page.getByLabel("Конструкция для наряда");
    await construction.scrollIntoViewIfNeeded();
    await construction.selectOption({ label: "Объект · Фм1 · оси 1/А" });
    await expectTouchable(construction);
    await page.getByLabel("Тип работы наряда").selectOption("concrete");
    await page
      .getByRole("button", { name: "Добавить работу", exact: true })
      .tap();
    const plan = page.getByLabel("План работы 1");
    await plan.tap();
    await plan.fill("2");
    await expectTouchable(plan);
    await page
      .getByRole("button", { name: "3. Люди и техника", exact: true })
      .tap();
    await page
      .getByRole("button", { name: "Добавить сотрудника", exact: true })
      .tap();
    const name = page.getByLabel("ФИО 1", { exact: true });
    await name.tap();
    await name.fill("Проверка на телефоне");
    await expectTouchable(name);
    await page.getByRole("button", { name: "Выдать наряд", exact: true }).tap();
    await expect(
      page.getByRole("heading", { name: "Наряды по дням", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: `.deploy/mobile-orders-${viewport.width}x${viewport.height}.png`,
    });
  });
}
