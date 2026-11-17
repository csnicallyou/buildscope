import { test, expect, type Page } from "@playwright/test";
import { openSection } from "../e2e/navigation-helpers";
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
test("Панель стройки: объекты, задачи, бригады, материалы, качество и редакции документов", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.screenshot({
    path: ".deploy/screenshots/construction-overview.png",
  });
  await openSection(page, "Объекты и участки");
  await page
    .getByRole("button", {
      name: "Создать структуру по доступным моделям КЖ",
      exact: true,
    })
    .click();
  await expect(page.locator(".cm-object-row")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Добавить объект", exact: true })
    .click();
  await page.getByLabel("Название записи", { exact: true }).fill("Участок А");
  await page.getByLabel("Уровень объекта").selectOption("zone");
  await page
    .getByLabel("Родительский объект")
    .selectOption({ label: "Маленковская / Кассовый павильон" });
  await save(page);
  const nodes = (await (
    await page.request.get("/api/construction")
  ).json()) as {
    records: { id: string; payload: { kind: string; title: string } }[];
  };
  const node = nodes.records.find((r) => r.payload.title === "Участок А")!.id;
  await openSection(page, "Бригады");
  await page
    .getByRole("button", { name: "Добавить бригаду", exact: true })
    .click();
  await page
    .getByLabel("Название записи", { exact: true })
    .fill("Наша бригада");
  await page
    .getByLabel("Состав бригады")
    .fill("Тестовый сотрудник; бетонщик\nВторой сотрудник; монтажник");
  await save(page);
  await expect(page.locator(".cm-object-row")).toContainText("2 сотрудников");
  await openSection(page, "Планирование");
  await page
    .getByRole("button", { name: "Добавить задачу", exact: true })
    .click();
  await page
    .getByLabel("Название записи", { exact: true })
    .fill("Подготовка основания");
  await page.getByLabel("Участок стройки", { exact: true }).selectOption(node);
  await save(page);
  await page
    .getByRole("button", { name: "Добавить задачу", exact: true })
    .click();
  await page
    .getByLabel("Название записи", { exact: true })
    .fill("Заливка подбетонки");
  await page.getByLabel("Участок стройки", { exact: true }).selectOption(node);
  await page
    .getByLabel("Предшествующие работы")
    .selectOption({ label: "Подготовка основания" });
  await save(page);
  const dependent = page
    .locator(".cm-task")
    .filter({ hasText: "Заливка подбетонки" });
  await expect(
    dependent.getByRole("button", {
      name: "Выдать наряд по задаче",
      exact: true,
    }),
  ).toBeDisabled();
  await page.screenshot({
    path: ".deploy/screenshots/construction-planning.png",
  });
  await openSection(page, "Материалы");
  for (const [direction, quantity] of [
    ["receipt", "10"],
    ["consume", "3"],
  ]) {
    await page
      .getByRole("button", { name: "Добавить движение материала", exact: true })
      .click();
    await page.getByLabel("Материал и марка").fill("Щебень 20–40");
    await page
      .getByLabel("Участок стройки", { exact: true })
      .selectOption(node);
    await page.getByLabel("Операция материала").selectOption(direction);
    await page.getByLabel("Количество материала").fill(quantity);
    await page
      .getByLabel("Основание движения")
      .fill(direction === "receipt" ? "Накладная 17" : "Расход по смене");
    await save(page);
  }
  await expect(page.locator(".cm-table-wrap tbody tr")).toContainText("7 м³");
  await page.screenshot({
    path: ".deploy/screenshots/construction-materials.png",
  });
  await openSection(page, "Контроль качества");
  await page
    .getByRole("button", { name: "Добавить замечание", exact: true })
    .click();
  await page
    .getByLabel("Название записи", { exact: true })
    .fill("Проверить края подготовки");
  await page.getByLabel("Участок стройки", { exact: true }).selectOption(node);
  await page
    .getByLabel("Ответственный за замечание")
    .fill("Ответственный бригадир");
  await save(page);
  await page
    .getByRole("button", { name: "Открыть замечание", exact: true })
    .click();
  await page.getByLabel("Состояние замечания").selectOption("corrected");
  await page
    .getByLabel("Подтверждение устранения")
    .fill("Края исправлены, контроль выполнен");
  await save(page);
  await page
    .getByRole("button", { name: "Открыть замечание", exact: true })
    .click();
  await page.getByLabel("Состояние замечания").selectOption("closed");
  await save(page);
  await expect(page.locator(".cm-task")).toContainText("Закрыто");
  await openSection(page, "Документы");
  await page
    .getByRole("button", { name: "Добавить документ", exact: true })
    .click();
  await page
    .getByLabel("Название записи", { exact: true })
    .fill("Тестовый чертёж");
  await page.getByLabel("Участок стройки", { exact: true }).selectOption(node);
  await page.getByLabel("Номер документа").fill("КЖ-ТЕСТ-1");
  await page.getByLabel("Файл документа").setInputFiles({
    name: "synthetic.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nsynthetic fixture\n%%EOF"),
  });
  await save(page);
  await expect(
    page.getByRole("link", { name: "Скачать synthetic.pdf", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Добавить редакцию", exact: true })
    .click();
  await expect(page.getByLabel("Номер документа")).toHaveValue("КЖ-ТЕСТ-1");
  await page.getByLabel("Редакция документа").fill("2");
  await save(page);
  await expect(
    page.locator(".cm-object-row").filter({ hasText: "ред. 1" }),
  ).toContainText("Заменён новой редакцией");
  await page.screenshot({
    path: ".deploy/screenshots/construction-documents.png",
  });
  await page.getByRole("button", { name: "Сменить тему", exact: true }).click();
  await openSection(page, "Обзор стройки");
  await page.screenshot({ path: ".deploy/screenshots/construction-light.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openSection(page, "Планирование");
  await page.screenshot({
    path: ".deploy/screenshots/construction-mobile.png",
  });
  await page
    .getByRole("button", { name: "Добавить задачу", exact: true })
    .click();
  await page
    .getByLabel("Название записи", { exact: true })
    .fill("Мобильная задача");
  await page.screenshot({
    path: ".deploy/screenshots/construction-mobile-editor.png",
  });
  await save(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
