import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { openSection } from "../e2e/navigation-helpers";
async function login(page: Page, user: "admin" | "foreman" | "viewer") {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(user);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill(`Browser-${user}-1234!`);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.locator(".app")).toBeVisible();
}
async function openOrder(page: Page) {
  await openSection(page, "Наряды по дням");
  await page
    .locator(".daily-order-card")
    .filter({ hasText: "Подписи-тест" })
    .click();
  await page.locator(".handoff-crew summary").click();
  await page.locator(".shift-signatures summary").click();
}
async function photo(page: Page, phase: "выход" | "окончание") {
  await page
    .getByRole("button", { name: `Фото подписей: ${phase}`, exact: true })
    .click();
  await page.getByLabel("Фото подписного листа").setInputFiles({
    name: `synthetic-${phase}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 900;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 640, 900);
        ctx.fillStyle = "#22344a";
        ctx.font = "24px Arial";
        ctx.fillText("SYNTHETIC SHIFT SHEET", 40, 70);
        ctx.font = "18px Arial";
        for (let i = 0; i < 12; i++) {
          ctx.fillText(
            `Test row ${i + 1} - sample data only`,
            40,
            130 + i * 48,
          );
          ctx.fillRect(40, 145 + i * 48, 560, 1);
        }
        return canvas.toDataURL("image/png").split(",")[1];
      }),
      "base64",
    ),
  });
  const count = await page.locator(".object-note img").count();
  const uploaded = page.waitForResponse(
    (r) => r.url().endsWith("/api/notes") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Прикрепить фото подписей", exact: true })
    .click();
  expect((await uploaded).status()).toBe(201);
  await expect(page.locator(".object-note img")).toHaveCount(count + 1);
  await expect(page.locator(".object-note img").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Открыть фотографию крупно", exact: true })
    .first()
    .click();
  await expect(
    page.getByLabel("Просмотр фотографии", { exact: true }),
  ).toBeVisible();
  const readerImage = page.locator(".evidence-reader-stage img");
  await expect(readerImage).toHaveJSProperty("naturalWidth", 640);
  await expect
    .poll(async () => (await readerImage.boundingBox())!.height)
    .toBeGreaterThan(200);
  const readerStage = (await page
    .locator(".evidence-reader-stage")
    .boundingBox())!;
  expect((await readerImage.boundingBox())!.height).toBeLessThanOrEqual(
    readerStage.height,
  );
  await page
    .getByRole("button", { name: "Увеличить фотографию", exact: true })
    .click();
  await expect(page.locator(".evidence-reader-tools")).toContainText("150%");
  await page
    .getByRole("button", { name: "Повернуть фотографию", exact: true })
    .click();
  await page.screenshot({
    path: ".deploy/screenshots/personal-photo-reader.png",
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByLabel("Просмотр фотографии", { exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
}
test("Подписи смены: фото, утренний выход без окончания, ночной табель, сохранение и Excel", async ({
  page,
  browser,
}) => {
  await login(page, "admin");
  await page.goto("/?assembly=canopy");
  await page.getByLabel("Поиск конструкций").fill("Фм4 · оси 8/А");
  await page
    .getByRole("button", { name: "Фм4 Фм4 · оси 8/А", exact: true })
    .click();
  await openSection(page, "Наряд");
  await page
    .locator(".work-order-shift summary")
    .filter({ hasText: "Параметры смены" })
    .click();
  await page.getByLabel("Подрядчик наряда").fill("Подписи-тест");
  await page.getByLabel("Смена наряда").selectOption("Ночь");
  await page.getByLabel("Тип работы наряда").selectOption("film");
  await page
    .getByRole("button", { name: "Добавить работу", exact: true })
    .click();
  await page.getByLabel("План работы 1").fill("1");
  await page.getByText("Табель (0)", { exact: true }).click();
  await page
    .getByRole("button", { name: "Добавить сотрудника", exact: true })
    .click();
  await page
    .getByLabel("ФИО 1", { exact: true })
    .fill("Тестовый сотрудник подписей");
  await page.getByRole("button", { name: "Выдать наряд", exact: true }).click();
  const workerContext = await browser.newContext({
      baseURL: "http://127.0.0.1:8781",
      viewport: { width: 390, height: 844 },
    }),
    worker = await workerContext.newPage();
  await login(worker, "foreman");
  await openOrder(worker);
  await expect(
    worker.getByLabel("Подпись при выходе 1", { exact: true }),
  ).toBeDisabled();
  await worker.getByLabel("Начало смены 1", { exact: true }).fill("20:00");
  await photo(worker, "выход");
  await worker.getByLabel("Подпись при выходе 1", { exact: true }).check();
  await worker
    .getByRole("button", { name: "Сохранить выполнение", exact: true })
    .click();
  await expect(
    worker
      .getByRole("status")
      .filter({ hasText: "фактические значения сохранены" }),
  ).toBeVisible();
  await expect(worker.getByLabel("Конец смены 1", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    worker.getByRole("button", { name: "Скачать Excel", exact: true }),
  ).toBeEnabled();
  await worker.reload();
  await openOrder(worker);
  await expect(
    worker.getByLabel("Подпись при выходе 1", { exact: true }),
  ).toBeChecked();
  await worker.getByLabel("Конец смены 1", { exact: true }).fill("08:00");
  await worker.getByLabel("Перерыв 1", { exact: true }).fill("60");
  await photo(worker, "окончание");
  await worker.getByLabel("Подпись при окончании 1", { exact: true }).check();
  await worker.screenshot({
    path: ".deploy/screenshots/shift-signatures-mobile.png",
  });
  await worker
    .getByRole("button", { name: "Сдать наряд", exact: true })
    .click();
  await expect(
    worker.getByLabel("Подпись при окончании 1", { exact: true }),
  ).toBeDisabled();
  await page.reload();
  await openOrder(page);
  await expect(
    page.getByLabel("Подпись при выходе 1", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Подпись при окончании 1", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("Подпись при окончании 1", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Сохранить проверку подписей", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Проверка подписей по фото сохранена" }),
  ).toBeVisible();
  await photo(page, "окончание");
  await page.getByLabel("Подпись при окончании 1", { exact: true }).check();
  await page
    .getByRole("button", { name: "Принять наряд", exact: true })
    .click();
  await expect(page.locator(".order-workflow")).toContainText(
    "Принят руководителем",
  );
  await expect(
    page.getByLabel("Подпись при окончании 1", { exact: true }),
  ).toBeDisabled();
  await page.locator(".shift-signatures").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".deploy/screenshots/shift-signatures-desktop.png",
  });
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать Excel", exact: true })
    .click();
  const download = await pending;
  const path = await download.path();
  const files = unzipSync(new Uint8Array(await readFile(path!)));
  expect(strFromU8(files["xl/worksheets/sheet2.xml"])).toContain(
    "Проверка подписей по фото: выход — Есть; окончание — Есть",
  );
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  await expect(page.locator(".order-history")).toContainText(
    "проверка подписи на фото: выход Есть",
  );
  await workerContext.close();
});
