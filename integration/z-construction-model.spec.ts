import { test, expect, type Page } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("Browser-admin-1234!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Обзор стройки", exact: true }),
  ).toBeVisible();
}
async function save(page: Page) {
  await page
    .getByRole("button", { name: "Сохранить запись", exact: true })
    .click();
  await expect(page.getByLabel("Редактор записи стройки")).toHaveCount(0);
}
test("Конструкция связана с задачей и выдаваемым нарядом без смены проектной геометрии", async ({
  page,
}) => {
  await login(page);
  await page.goto("/?assembly=canopy");
  await page.getByLabel("Поиск конструкций").fill("Фм4 · оси 8/А");
  await page
    .getByRole("button", { name: "Фм4 Фм4 · оси 8/А", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Запланировать работу", exact: true })
    .click();
  await page
    .getByLabel("Название записи", { exact: true })
    .fill("Работа выбранного фундамента");
  await expect(page.locator(".cm-binding")).toContainText("kzh-canopy");
  await save(page);
  const task = page
    .locator(".cm-task")
    .filter({ hasText: "Работа выбранного фундамента" });
  await task
    .getByRole("button", { name: "Показать в модели", exact: true })
    .click();
  await expect(page.locator(".construction-object-context")).toContainText(
    "Работа выбранного фундамента",
  );
  await page.screenshot({
    path: ".deploy/screenshots/construction-object-context.png",
  });
  await page
    .locator(".construction-object-context")
    .getByRole("button", { name: /Работа выбранного фундамента/ })
    .click();
  await expect(page.getByLabel("Название записи", { exact: true })).toHaveValue(
    "Работа выбранного фундамента",
  );
  await page
    .getByRole("button", { name: "Закрыть редактор", exact: true })
    .click();
  await task
    .getByRole("button", { name: "Выдать наряд по задаче", exact: true })
    .click();
  await page.getByLabel("Тип работы наряда").selectOption("concrete");
  await page
    .getByRole("button", { name: "Добавить работу", exact: true })
    .click();
  await expect(page.getByLabel("План работы 1")).not.toHaveValue("");
  await page.getByRole("button", { name: "Выдать наряд", exact: true }).click();
  await expect(page.locator(".daily-order-card").first()).toContainText("День");
  const entries = (await (await page.request.get("/api/orders")).json()) as {
    orders: { order: { draft: { taskId?: string | null } } }[];
  };
  expect(entries.orders.some((o) => !!o.order.draft.taskId)).toBe(true);
});
