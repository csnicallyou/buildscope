import { test, expect, type Page } from "@playwright/test";
import { openTree, openProperties } from "./mobile-helpers";
async function readView(page: Page) {
  return page.locator(".model-stage canvas").evaluate((node) => {
    const c = node as HTMLCanvasElement;
    const copy = document.createElement("canvas");
    copy.width = 96;
    copy.height = 96;
    const ctx = copy.getContext("2d")!;
    ctx.drawImage(c, 0, 0, 96, 96);
    return Array.from(ctx.getImageData(0, 0, 96, 96).data);
  });
}
async function stepByTitle(page: Page, title: string, offset = 0) {
  const option = page
    .getByLabel("Этап устройства", { exact: true })
    .locator("option")
    .filter({ hasText: title })
    .first();
  await page
    .getByLabel("Этап устройства", { exact: true })
    .selectOption((await option.getAttribute("value"))!);
  if (offset) {
    const range = page.getByLabel("Ход устройства", { exact: true });
    await range.fill(String(+(await range.inputValue()) + offset));
  }
}
async function choosePart(
  page: Page,
  part = "БП Бетонная подготовка Фм1 · 1/А",
) {
  await page.goto("/?assembly=canopy");
  await openTree(page);
  await page.getByLabel("Поиск конструкций").fill("Фм1 · оси 1/А");
  await page
    .getByRole("button", { name: "Фм1 Фм1 · оси 1/А", exact: true })
    .click();
  await openProperties(page);
  await page
    .getByRole("button", { name: "Открыть отдельно", exact: true })
    .click();
  await openTree(page);
  await page.getByRole("button", { name: part, exact: true }).click();
  if ((page.viewportSize()?.width ?? 1440) <= 850) await openProperties(page);
}
for (const mobile of [false, true])
  test(`Устройство подбетонки из свойств части${mobile ? " на телефоне" : ""}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await choosePart(page);
    await expect(page.getByTestId("element-volume")).toHaveText("0,676 м³");
    const main = page.locator(".model-stage canvas");
    if (!mobile) {
      const box = await main.boundingBox();
      await page.mouse.move(
        box!.x + box!.width * 0.5,
        box!.y + box!.height * 0.5,
      );
      await page.mouse.down();
      await page.mouse.move(
        box!.x + box!.width * 0.7,
        box!.y + box!.height * 0.6,
        { steps: 10 },
      );
      await page.mouse.up();
    }
    await main.evaluate(
      () =>
        new Promise<void>((r) => {
          let n = 60;
          function f() {
            if (--n) requestAnimationFrame(f);
            else r();
          }
          requestAnimationFrame(f);
        }),
    );
    const before = await readView(page);
    await page.screenshot({
      path: `test-results/installation-before${mobile ? "-mobile" : ""}.png`,
    });
    await page.getByTestId("start-installation").click();
    const player = page.getByTestId("installation-player");
    await expect(player).toBeVisible();
    const stage = await player.locator(".installation-stage").boundingBox();
    expect(stage!.height).toBeGreaterThan(page.viewportSize()!.height * 0.5);
    expect(stage!.width).toBeGreaterThan(page.viewportSize()!.width * 0.9);
    await page
      .getByRole("button", { name: "Пауза анимации", exact: true })
      .click();
    await stepByTitle(page, "Установка досок", 3);
    await expect(player).toHaveAttribute("data-phase", "boards");
    const t = page.getByLabel("Ход устройства", { exact: true });

    await page.screenshot({
      path: `docs/screenshots/installation-boards${mobile ? "-mobile" : ""}.png`,
    });
    await stepByTitle(page, "Заполнение бетоном", 4);

    await expect(player).toHaveAttribute("data-phase", "pour");
    await expect(player).toContainText("0,676 м³");
    await expect(player.getByTestId("installation-size")).toContainText(
      "Y 0,1 м",
    );
    await page.screenshot({
      path: `docs/screenshots/installation-pour${mobile ? "-mobile" : ""}.png`,
    });
    const paused = await t.inputValue();
    await page.waitForTimeout(150);
    expect(await t.inputValue()).toBe(paused);
    await page
      .getByLabel("Скорость анимации", { exact: true })
      .selectOption("2");
    await page
      .getByRole("button", { name: "Продолжить анимацию", exact: true })
      .click();
    await expect
      .poll(async () => Number(await t.inputValue()))
      .toBeGreaterThan(Number(paused) + 0.2);
    await page
      .getByRole("button", { name: "Пауза анимации", exact: true })
      .click();
    await stepByTitle(page, "Готовая часть");
    await expect(player).toHaveAttribute("data-phase", "ready");
    await page
      .getByRole("button", { name: "Завершить анимацию", exact: true })
      .click();
    await expect(player).not.toBeVisible();
    await expect(page.getByTestId("element-volume")).toHaveText("0,676 м³");
    await main.evaluate(
      () =>
        new Promise<void>((r) => {
          let n = 15;
          function f() {
            if (--n) requestAnimationFrame(f);
            else r();
          }
          requestAnimationFrame(f);
        }),
    );
    const after = await readView(page);
    await page.screenshot({
      path: `test-results/installation-after${mobile ? "-mobile" : ""}.png`,
    });
    const meanDifference =
      before.reduce(
        (sum, v, i) => sum + (i % 4 === 3 ? 0 : Math.abs(v - after[i])),
        0,
      ) /
      (96 * 96 * 3);
    // Closer framing magnifies subpixel edges in the 96px downsample.
    // <6 is <2.4% of the RGB range, and still rejects a camera reset.
    expect(meanDifference).toBeLessThan(6);
    if (mobile) {
      await page.getByTestId("start-installation").click();
      await expect(player).toBeVisible();
      await openTree(page);
      await expect(player).not.toBeVisible();
      await expect(page.getByLabel("Поиск конструкций")).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
test("Щебень, анкеры, смена части и reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await choosePart(page, "ЩП Щебёночная подготовка Фм1 · 1/А");
  await page.getByTestId("start-installation").click();
  await expect(page.getByTestId("installation-player")).toHaveAttribute(
    "data-playing",
    "false",
  );
  await expect(page.getByLabel("Этап устройства")).toHaveText(
    /Отсыпка материала/,
  );
  await stepByTitle(page, "Уплотнение слоя");
  await expect(page.getByTestId("installation-player")).toHaveAttribute(
    "data-phase",
    "compact",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("installation-player")).not.toBeVisible();
  await page.getByRole("button", { name: /Арматура Анкеры M24/ }).click();
  await page.getByTestId("start-installation").click();
  await stepByTitle(page, "Установка стержней", 3);

  await expect(page.getByTestId("installation-player")).toContainText(
    "стержней",
  );
  await page.getByRole("button", { name: "Завершить анимацию" }).click();
  await page
    .getByRole("button", {
      name: "БП Бетонная подготовка Фм1 · 1/А",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("installation-player")).not.toBeVisible();
  await expect(page.getByTestId("element-volume")).toHaveText("0,676 м³");
});

test("Профиль Фм2 сохраняет вырез во время заливки", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?assembly=canopy");
  await page.getByLabel("Поиск конструкций").fill("Фм2");
  await page
    .getByRole("button", { name: "Фм2 Фм2 · оси 2–3/А–Б", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Открыть отдельно", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Фм2 Фм2 · оси 2–3/А–Б", exact: true })
    .click();
  const volume = await page.getByTestId("element-volume").innerText();
  await page.getByTestId("start-installation").click();
  await stepByTitle(page, "Заполнение бетоном", 4);

  await expect(page.getByTestId("installation-player")).toHaveAttribute(
    "data-phase",
    "pour",
  );
  await page.screenshot({ path: "docs/screenshots/installation-notch.png" });
  await page.getByRole("button", { name: "Завершить анимацию" }).click();
  await expect(page.getByTestId("element-volume")).toHaveText(volume);
  expect(errors).toEqual([]);
});

test("Плёнка основания и укрытие — разные варианты, инструменты видны", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await choosePart(page);
  await page.getByTestId("start-installation").click();
  await page
    .getByText("Варианты технологии и источники", { exact: true })
    .click();
  await page.getByLabel("Разделительная плёнка под бетоном").check();
  await stepByTitle(page, "Разделительная плёнка", 2.5);
  await expect(page.getByTestId("installation-player")).toHaveAttribute(
    "data-phase",
    "film",
  );
  await page
    .getByText("Варианты технологии и источники", { exact: true })
    .click();
  await page.locator(".installation-stage canvas").evaluate(
    () =>
      new Promise<void>((r) => {
        let n = 6;
        const f = () => {
          if (--n) requestAnimationFrame(f);
          else r();
        };
        requestAnimationFrame(f);
      }),
  );
  await page.screenshot({ path: "docs/screenshots/installation-film.png" });
  await stepByTitle(page, "Уплотнение бетона", 3);
  await expect(page.getByTestId("installation-player")).toHaveAttribute(
    "data-phase",
    "vibrate",
  );
  await expect(page.locator(".installation-tool-list")).toContainText(
    "Оборудование",
  );
  await page.screenshot({
    path: "docs/screenshots/installation-vibration.png",
  });
  await stepByTitle(page, "Уход за поверхностью", 3);
  await expect(page.getByTestId("installation-player")).toHaveAttribute(
    "data-phase",
    "care",
  );
  await page.screenshot({ path: "docs/screenshots/installation-care.png" });
  expect(errors).toEqual([]);
});
