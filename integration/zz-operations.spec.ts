import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { jsPDF } from "jspdf";
import { openSection, openDisclosure } from "../e2e/navigation-helpers";
test("Координатор: техника, путевой лист, заявка, предложение, наряд, проверка и видео", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("Browser-admin-1234!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Объекты строительства", exact: true }),
  ).toBeVisible();
  const add = async () =>
    page
      .locator(".field-main")
      .getByRole("button", { name: "Добавить", exact: true })
      .click();
  const save = async () => {
    await page
      .getByRole("button", { name: "Сохранить рабочую запись", exact: true })
      .click();
    await expect(page.locator(".field-editor")).toHaveCount(0);
  };
  await openSection(page, "Подрядчики");
  await add();
  await page.getByLabel("Подрядчик", { exact: true }).fill("ООО Тест-014");
  await page.getByLabel("Контактное лицо").fill("Тестовый представитель");
  await save();
  await openSection(page, "Техника");
  await add();
  await page
    .getByLabel("Название техники", { exact: true })
    .fill("Тестовый экскаватор");
  await page.getByLabel("Государственный / инвентарный номер").fill("ТЕСТ-014");
  await page.getByLabel("Собственник техники").fill("Тестовый собственник");
  await save();
  await openSection(page, "Путевые листы");
  await add();
  await page.getByLabel("Номер путевого листа").fill("ПЛ-014");
  await page
    .getByLabel("Техника путевого листа")
    .selectOption({ label: "Тестовый экскаватор · ТЕСТ-014" });
  await page.getByLabel("Смена", { exact: true }).selectOption("Ночь");
  const date = await page.getByLabel("Дата", { exact: true }).inputValue();
  const tomorrow = new Date(date + "T12:00:00Z");
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await page.getByLabel("Начало работы техники").fill(date + "T20:00");
  await page
    .getByLabel("Окончание работы техники")
    .fill(tomorrow.toISOString().slice(0, 10) + "T08:00");
  await page.getByLabel("Общие часы по путевому листу").fill("12");
  await page.getByLabel("Источник сведений").fill("Бумажный путевой лист");
  await page
    .getByRole("button", { name: "Добавить участок техники", exact: true })
    .click();
  await page
    .getByLabel("Работа техники 1")
    .fill("Разработка грунта на тестовом участке");
  await page.getByLabel("Часы на участке 1").fill("8");
  const pdf = new jsPDF();
  pdf.text("SYNTHETIC WAYBILL", 20, 20);
  await page.getByLabel("Оригинал рабочей записи").setInputFiles({
    name: "synthetic-waybill.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdf.output("arraybuffer")),
  });
  await save();
  await page
    .locator(".field-card")
    .filter({ hasText: "ПЛ-014" })
    .getByRole("button", { name: "Открыть карточку" })
    .click();
  await page.getByLabel("Состояние").selectOption("checked");
  await save();
  await expect(
    page.locator(".field-card").filter({ hasText: "ПЛ-014" }),
  ).toContainText("Проверено");
  await page.screenshot({ path: ".deploy/screenshots/operations-waybill.png" });
  await openSection(page, "Заявки");
  await add();
  await page
    .getByLabel("Что требуется", { exact: true })
    .fill("Тестовая заявка на щебень");
  await page.getByLabel("Количество", { exact: true }).fill("3");
  await page.getByLabel("Источник сведений").fill("Сообщение подрядчика");
  await save();
  for (const status of ["approved", "ordered", "received"]) {
    await page
      .locator(".field-card")
      .filter({ hasText: "Тестовая заявка" })
      .getByRole("button", { name: "Открыть карточку" })
      .click();
    await page.getByLabel("Состояние").selectOption(status);
    await save();
  }
  await openSection(page, "Предложения работ");
  await add();
  await page
    .getByLabel("Предлагаемая работа", { exact: true })
    .fill("Тестовое бетонирование 014");
  await page
    .getByLabel("Подрядчик предложения")
    .selectOption({ label: "ООО Тест-014" });
  await page
    .getByLabel("Объект и участок")
    .selectOption({ label: "Маленковская" });
  await page.getByLabel("Смена", { exact: true }).selectOption("Ночь");
  await page.getByLabel("Количество", { exact: true }).fill("3");
  await page.getByLabel("Источник сведений").fill("Предложение из переписки");
  await page.getByLabel("Состояние").selectOption("approved");
  await save();
  await page
    .locator(".field-card")
    .filter({ hasText: "Тестовое бетонирование 014" })
    .getByRole("button", { name: "Составить наряд" })
    .click();
  await expect(page.getByLabel("План работы 1")).toHaveValue("3");
  await openDisclosure(page.locator(".work-crew summary"));
  await page
    .getByRole("button", { name: "Добавить сотрудника", exact: true })
    .click();
  await page.getByLabel("ФИО 1", { exact: true }).fill("Тестовый работник 014");
  await page.getByRole("button", { name: "Выдать наряд", exact: true }).click();
  await page
    .locator(".daily-order-card")
    .filter({ hasText: "ООО Тест-014" })
    .click();
  await page.getByLabel("Факт работы 1", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Люди и подписи", exact: true })
    .click();
  await page.getByLabel("Заявлено людей на смену").fill("2");
  await page
    .getByRole("button", { name: "Сохранить выполнение", exact: true })
    .click();
  await page.getByRole("button", { name: "Проверка", exact: true }).click();
  await openDisclosure(
    page
      .locator(".order-review > details > summary")
      .filter({ hasText: "План, заявленный и проверенный объём" }),
  );
  await page.getByLabel("Проверенный объём 1").fill("1.5");
  await page
    .getByLabel("Основание проверки 1")
    .fill("Контрольный замер на участке");
  await page
    .getByRole("button", { name: "Сохранить проверку объёмов", exact: true })
    .click();
  await expect(
    page.getByText("Проверенные объёмы сохранены отдельно от заявленных", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByText("Добавить дополнительную работу", { exact: true })
    .click();
  await page
    .getByLabel("Наименование дополнительной работы")
    .fill("Тестовая уборка участка");
  await page.getByLabel("Единица дополнительной работы").fill("м²");
  await page
    .getByLabel("Основание дополнительной работы")
    .fill("Устное указание координатора");
  await page
    .getByRole("button", {
      name: "Добавить дополнительную работу в наряд",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Работы", exact: true }).click();
  await page.getByLabel("Факт работы 2", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Сохранить выполнение", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Люди и подписи", exact: true })
    .click();
  await expect(
    page.getByText(/Заявленное количество отличается/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Люди и подписи", exact: true })
    .click();
  await openDisclosure(page.locator(".handoff-crew summary"));
  await page.getByLabel("Начало смены 1").fill("20:00");
  await page.getByLabel("Конец смены 1").fill("08:00");
  await openDisclosure(page.locator(".shift-signatures summary"));
  await page
    .getByRole("button", { name: "Фото подписей: выход", exact: true })
    .click();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 800;
    const x = c.getContext("2d")!;
    x.fillStyle = "white";
    x.fillRect(0, 0, 600, 800);
    x.fillStyle = "black";
    x.font = "24px Arial";
    x.fillText("SYNTHETIC SIGNATURE SHEET", 20, 40);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Фото подписного листа").setInputFiles({
    name: "synthetic-signature.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page
    .getByRole("button", { name: "Прикрепить фото подписей", exact: true })
    .click();
  await expect(page.locator(".object-note img")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page
    .getByLabel("Состояние подписи при выходе 1", { exact: true })
    .selectOption("illegible");
  await page
    .getByRole("button", { name: "Сохранить выполнение", exact: true })
    .click();
  await expect(
    page.getByLabel("Состояние подписи при выходе 1", { exact: true }),
  ).toHaveValue("illegible");
  await expect(
    page.getByLabel("Подпись при выходе 1", { exact: true }),
  ).not.toBeChecked();
  await page.screenshot({ path: ".deploy/screenshots/operations-review.png" });
  await page.getByRole("button", { name: "Вложения", exact: true }).click();
  await openDisclosure(page.locator(".order-media summary"));
  const video = await readFile(
    new URL("./fixtures/synthetic-report.webm", import.meta.url),
  );
  expect(video.length).toBeGreaterThan(200);
  await page
    .getByLabel("Источник вложения наряда")
    .fill("Тестовый видеоматериал координатора");
  await page.getByLabel("Файл наряда", { exact: true }).setInputFiles({
    name: "synthetic-report.webm",
    mimeType: "video/webm",
    buffer: video,
  });
  await page
    .getByRole("button", { name: "Прикрепить файл к наряду", exact: true })
    .click();
  await expect(
    page.getByText("Вложение сохранено в наряде и документах объекта", {
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".order-media video")
        .evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(1);
  await page.locator(".order-media video").evaluate((v: HTMLVideoElement) => {
    v.muted = true;
    return v.play();
  });
  await expect
    .poll(() =>
      page
        .locator(".order-media video")
        .evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThan(0.1);
  await page
    .locator(".order-media video")
    .evaluate((v: HTMLVideoElement) => v.pause());
  const src = await page.locator(".order-media video").getAttribute("src");
  const partial = await page.request.get(src!, {
    headers: { Range: "bytes=0-9" },
  });
  expect(partial.status()).toBe(206);
  expect((await partial.body()).length).toBe(10);
  const anon = await browser.newContext({ baseURL: "http://127.0.0.1:8781" });
  expect((await anon.request.get(src!)).status()).toBe(401);
  await anon.close();
  const payload = (await (await page.request.get("/api/orders")).json()) as {
    orders: {
      order: {
        draft: {
          contractor: string;
          rows: {
            actual: number | null;
            verifiedActual?: number | null;
            plan: number | null;
          }[];
        };
      };
    }[];
  };
  const found = payload.orders.find(
    (o) => o.order.draft.contractor === "ООО Тест-014",
  )!;
  expect(found.order.draft.rows[0].actual).toBe(2);
  expect(found.order.draft.rows[0].verifiedActual).toBe(1.5);
  expect(found.order.draft.rows[0].plan).toBe(3);
  expect(found.order.draft.rows[1].plan).toBeNull();
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await openSection(page, "Карта объектов");
  const tiles = page.locator(".operations-kpis .operation-kpi");
  await expect(tiles).toHaveCount(5);
  for (const tile of await tiles.all()) {
    const box = (await tile.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({
    path: ".deploy/screenshots/operations-mobile-icons.png",
  });
  await openSection(page, "Техника");
  await page.screenshot({
    path: ".deploy/screenshots/operations-mobile-machines.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
