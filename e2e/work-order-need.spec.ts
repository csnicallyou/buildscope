import { test, expect } from "@playwright/test";
test("Потребность бетона для ФП отделена от ручного плана и факта", async ({
  page,
}) => {
  await page.goto("/?assembly=canopy");
  await page.getByLabel("Поиск конструкций").fill("Фм4 · оси 8/А");
  await page
    .getByRole("button", { name: "Фм4 Фм4 · оси 8/А", exact: true })
    .click();
  await page.getByRole("button", { name: "Наряд", exact: true }).click();
  await page.getByLabel("Тип работы наряда").selectOption("excel:9");
  await expect(page.locator(".model-need-preview")).toContainText("3,655 м³");
  await page
    .getByRole("button", { name: "Добавить работу", exact: true })
    .click();
  await expect(page.getByLabel("План работы 1")).toHaveValue("");
  await expect(page.getByLabel("Факт работы 1")).toHaveCount(0);
  await expect(page.getByTestId("work-model-need")).toContainText("3,655 м³");
  await page.screenshot({ path: "docs/screenshots/work-order-need.png" });
});
