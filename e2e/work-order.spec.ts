import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { openTree, modelView } from "./mobile-helpers";
const cell = (xml: string, ref: string) =>
  xml
    .replace(/<(\/?)\w+:/g, "<$1")
    .match(new RegExp(`<c[^>]*\\br="${ref}"[^>]*>([\\s\\S]*?)<\\/c>`))?.[1] ??
  "";
for (const mobile of [false, true])
  test(`Наряд: части из 3D, план/факт, табель, Excel${mobile ? " телефон" : ""}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [],
      posts: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.method() === "POST") posts.push(r.url());
    });
    await page.goto("/?assembly=canopy");
    await openTree(page);
    await page.getByLabel("Поиск конструкций").fill("Фм1 · оси 1/А");
    await page
      .getByRole("button", { name: "Фм1 Фм1 · оси 1/А", exact: true })
      .click();
    await modelView(page);
    await page.getByRole("button", { name: "Наряд", exact: true }).click();
    await page.getByLabel("Подрядчик наряда").fill("=2+2");
    await page.getByLabel("Тип работы наряда").selectOption("prep");
    await page
      .getByRole("button", { name: "Добавить работу", exact: true })
      .click();
    await expect(page.getByTestId("work-order-row")).toHaveCount(1);
    await expect(page.getByLabel("План работы 1")).toHaveValue("0.676");
    await expect(page.getByLabel("Факт работы 1")).toHaveValue("");
    await page
      .getByRole("button", { name: "Добавить работу", exact: true })
      .click();
    await expect(page.getByTestId("work-order-row")).toHaveCount(1);
    await page.getByLabel("Факт работы 1").fill("0");
    await page.getByLabel("Тип работы наряда").selectOption("concrete");
    await page
      .getByRole("button", { name: "Добавить работу", exact: true })
      .click();
    await expect(page.getByLabel("План работы 2")).toHaveValue("2.592");
    await page.getByLabel("Смена наряда").selectOption("Ночь");
    await page.getByText("Табель (0)", { exact: true }).click();
    await page
      .getByRole("button", { name: "Добавить сотрудника", exact: true })
      .click();
    await page.getByLabel("ФИО 1", { exact: true }).fill("Тестовый сотрудник");
    await page.getByLabel("Начало смены 1").fill("20:00");
    await page.getByLabel("Конец смены 1").fill("08:00");
    await page.getByLabel("Перерыв 1").fill("60");
    await expect(page.locator(".work-crew-row")).toContainText("11 ч");
    await page
      .locator(".work-order-panel")
      .evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path: `docs/screenshots/work-order${mobile ? "-mobile" : ""}.png`,
      fullPage: true,
    });
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Скачать Excel", exact: true })
      .click();
    const dl = await pending;
    await mkdir("output/xlsx", { recursive: true });
    const path = `output/xlsx/narad${mobile ? "-mobile" : ""}.xlsx`;
    await dl.saveAs(path);
    const files = unzipSync(new Uint8Array(await readFile(path))),
      vol = strFromU8(files["xl/worksheets/sheet1.xml"]),
      crew = strFromU8(files["xl/worksheets/sheet2.xml"]),
      summary = strFromU8(files["xl/worksheets/sheet3.xml"]);
    expect(cell(vol, "I2")).toContain("<v>0.676</v>");
    expect(cell(vol, "K2")).toContain("<v>0</v>");
    expect(cell(vol, "K3")).not.toContain("<v>");
    expect(cell(vol, "E2")).toContain("=2+2");
    expect(cell(vol, "E2")).not.toContain("<f>");
    expect(cell(vol, "Q2")).toContain("canopy-БП-167");
    expect(cell(crew, "I2")).toContain("<v>11</v>");
    expect(cell(crew, "I2")).toContain("MOD(");
    expect(cell(summary, "D2")).toContain("<v>0</v>");
    expect(cell(summary, "D3")).not.toMatch(/<v>[0-9.]+<\/v>/);
    expect(cell(summary, "F3")).toContain("<v>1</v>");
    expect(strFromU8(files["xl/tables/table1.xml"])).toContain('ref="A1:R3"');
    await page
      .getByTestId("work-order-row")
      .first()
      .getByRole("button", { name: "Показать в 3D" })
      .click();
    await expect(page.locator(".model-stage canvas")).toBeVisible();
    await page.getByRole("button", { name: "Наряд", exact: true }).click();
    await expect(page.getByTestId("work-order-row")).toHaveCount(2);
    await expect(page.getByLabel("Факт работы 1")).toHaveValue("0");
    expect(posts).toEqual([]);
    expect(errors).toEqual([]);
  });
