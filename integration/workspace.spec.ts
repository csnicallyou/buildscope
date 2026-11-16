import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, role: string) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(role);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill(`Browser-${role}-1234!`);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Команда и доступ", exact: true }),
  ).toBeVisible();
}
test("Общая база: черновик, выдача, сдача другим пользователем, приёмка, фото и остаток", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "admin");
  await page.goto("/?assembly=canopy");
  await page.getByLabel("Поиск конструкций").fill("Фм1 · оси 1/А");
  await page
    .getByRole("button", { name: "Фм1 Фм1 · оси 1/А", exact: true })
    .click();
  await page.getByRole("button", { name: "Наряд", exact: true }).click();
  await page.getByLabel("Тип работы наряда").selectOption("concrete");
  await page
    .getByRole("button", { name: "Добавить работу", exact: true })
    .click();
  await expect(page.getByLabel("План работы 1")).toHaveValue("2.592");
  await expect(page.locator(".workspace-sync")).toContainText(
    "Черновик сохранён",
  );
  await page.reload();
  await page.getByRole("button", { name: "Наряд", exact: true }).click();
  await expect(page.getByLabel("План работы 1")).toHaveValue("2.592");
  await page.getByRole("button", { name: "Выдать наряд", exact: true }).click();
  await expect(page.locator(".daily-order-card")).toHaveCount(1);
  const foreman = await browser.newContext({
    baseURL: "http://127.0.0.1:8781",
    viewport: { width: 1440, height: 1000 },
  });
  const worker = await foreman.newPage();
  await login(worker, "foreman");
  await worker
    .getByRole("button", { name: "Наряды по дням", exact: true })
    .click();
  await worker.locator(".daily-order-card").click();
  await expect(
    worker.getByRole("button", { name: "Новый наряд", exact: true }),
  ).toBeDisabled();
  await worker.getByLabel("Факт работы 1").fill("1.2");
  await worker
    .getByRole("button", { name: "Фото и замечания", exact: true })
    .click();
  await worker
    .getByLabel("Комментарий к объекту")
    .fill("Первая часть заливки, продолжить ночью");
  await worker.getByLabel("Фотография объекта").setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      await worker.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        canvas.getContext("2d")!.fillRect(0, 0, 32, 32);
        return canvas.toDataURL("image/png").split(",")[1];
      }),
      "base64",
    ),
  });
  await worker.getByRole("button", { name: "Добавить к объекту" }).click();
  await expect(worker.locator(".object-note img")).toBeVisible();
  await worker.screenshot({ path: ".deploy/screenshots/photo-note.png" });
  await worker.keyboard.press("Escape");
  await worker
    .getByRole("button", { name: "Сдать наряд", exact: true })
    .click();
  await expect(worker.locator(".order-workflow")).toContainText(
    "ожидает проверки",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Наряды по дням", exact: true })
    .click();
  await page.locator(".daily-order-card").click();
  await page
    .getByRole("button", { name: "Принять наряд", exact: true })
    .click();
  await expect(page.locator(".order-workflow")).toContainText(
    "Принят руководителем",
  );
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  await expect(page.locator(".order-history")).toContainText("Приёмка");
  await page.screenshot({ path: ".deploy/screenshots/accepted-order.png" });
  await page
    .getByText("Перенести незавершённое в другую смену", { exact: true })
    .click();
  await page.getByLabel("Смена продолжения").selectOption("Ночь");
  await page
    .getByRole("button", { name: "Подготовить продолжение", exact: true })
    .click();
  await expect(page.getByLabel("План работы 1")).toHaveValue("1.392");
  await page.getByRole("button", { name: "Выдать наряд", exact: true }).click();
  await expect(page.locator(".daily-order-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Ход работ", exact: true }).click();
  await expect(page.locator(".schedule table")).toContainText("1,392");
  await page.screenshot({ path: ".deploy/screenshots/progress.png" });
  await page
    .getByRole("button", { name: "Команда и доступ", exact: true })
    .click();
  await expect(page.locator(".team-users > div")).toHaveCount(3);
  await page.screenshot({ path: ".deploy/screenshots/team.png" });
  await foreman.close();
  expect(errors).toEqual([]);
});
test("Просмотр с телефона не позволяет менять наряды и получать чужие права", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.screenshot({ path: ".deploy/screenshots/login-mobile.png" });
  await login(page, "viewer");
  // The account button remains available on mobile even when mode navigation scrolls.
  await page
    .getByRole("button", { name: "Тестовый наблюдатель", exact: true })
    .click();
  await expect(
    page.getByText("Добавить пользователя", { exact: true }),
  ).toHaveCount(0);
  const denied = await page.request.post("/api/users", {
    headers: { Origin: "http://127.0.0.1:8781" },
    data: {},
  });
  expect(denied.status()).toBe(403);
  await page.screenshot({ path: ".deploy/screenshots/account-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
