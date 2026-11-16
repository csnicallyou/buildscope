import {
  openTree,
  openProperties,
  showTools,
  modelView,
} from "./mobile-helpers";
import { test, expect } from "@playwright/test";

for (const mobile of [false, true])
  test(`Объект → части → возврат, материалы${mobile ? " на телефоне" : ""}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?assembly=canopy");
    await openTree(page);
    await page.getByLabel("Поиск конструкций").fill("Фм1 · оси 1/А");
    await page
      .getByRole("button", { name: "Фм1 Фм1 · оси 1/А", exact: true })
      .click();
    const inspector = page.locator(".inspector");
    await expect(inspector).toContainText("Объект целиком");
    const materials = inspector.getByTestId("material-amounts");
    await expect(materials).toContainText("2,592 м³");
    await expect(materials).toContainText("0,676 м³");
    await expect(materials).toContainText("339,4 кг");
    await expect(materials).toContainText("Щебень");
    await expect(materials).toContainText("2,532 м³");
    await expect(materials).toContainText("одинаковые откосы");
    if (!mobile) {
      await page
        .getByRole("button", { name: "Изолировать", exact: true })
        .click();
      await page.waitForFunction(() => {
        const canvas = document.querySelector("canvas")!;
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        const c = copy.getContext("2d")!;
        c.drawImage(canvas, 0, 0);
        const pixels = c.getImageData(0, 0, copy.width, copy.height).data;
        return pixels.some(
          (v, i) =>
            i % 4 === 0 &&
            v > 140 &&
            v > pixels[i + 1] * 1.1 &&
            pixels[i + 1] > pixels[i + 2] * 1.25,
        );
      });
      // Pick the lowest highlighted surface: the preparation belongs to the
      // same object, so a real WebGL click must select the foundation root.
      const hit = await page.locator("canvas").evaluate((node) => {
        const canvas = node as HTMLCanvasElement;
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        const c = copy.getContext("2d")!;
        c.drawImage(canvas, 0, 0);
        const pixels = c.getImageData(0, 0, copy.width, copy.height).data;
        for (let y = copy.height - 4; y > 0; y--)
          for (let x = 4; x < copy.width - 4; x++) {
            const i = (y * copy.width + x) * 4;
            if (
              pixels[i] > 140 &&
              pixels[i] > pixels[i + 1] * 1.1 &&
              pixels[i + 1] > pixels[i + 2] * 1.25
            )
              return {
                x: (x * canvas.clientWidth) / canvas.width,
                y: (y * canvas.clientHeight) / canvas.height,
              };
          }
        throw Error("No highlighted surface");
      });
      await page.locator("canvas").click({ position: { x: 3, y: 3 } });
      await expect(page.getByTestId("selection-count")).toHaveText(
        "Выбрано: 0",
      );
      await page.locator("canvas").click({ position: hit });
      await expect(inspector).toContainText("Объект целиком");
      await expect(materials).toContainText("339,4 кг");
    }
    await openProperties(page);
    await page
      .getByRole("button", { name: "Открыть отдельно", exact: true })
      .click();
    await expect(page.locator(".object-navigation")).toContainText("5 частей");
    await expect(page.locator(".tree-scroll .element-button")).toHaveCount(5);
    await openTree(page);
    await page
      .getByRole("button", {
        name: "БП Бетонная подготовка Фм1 · 1/А",
        exact: true,
      })
      .click();
    await expect(inspector.getByTestId("element-volume")).toHaveText(
      "0,676 м³",
    );
    await expect(inspector.getByTestId("material-amounts")).toContainText(
      "Бетон B7.5",
    );
    await expect(inspector.getByTestId("material-amounts")).not.toContainText(
      "Сталь",
    );
    await showTools(page);
    await page.getByRole("button", { name: "Разобрать", exact: true }).click();
    await expect(inspector.getByTestId("element-volume")).toHaveText(
      "0,676 м³",
    );
    await openTree(page);
    await page
      .getByRole("button", { name: "Арматура Анкеры M24 · схема", exact: true })
      .click();
    await expect(inspector).toContainText("8 шт.");
    await expect(inspector).toContainText("24 мм");
    await page
      .getByRole("button", {
        name: "Арматура Основная сетка · схема",
        exact: true,
      })
      .click();
    await expect(inspector).toContainText("Объём в схеме");
    await expect(inspector).toContainText("Спецификация на весь Фм1");
    await openProperties(page);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `test-results/object-detail${mobile ? "-mobile" : ""}.png`,
      fullPage: true,
    });
    await modelView(page);
    await page
      .getByRole("button", { name: "← Ко всем объектам", exact: true })
      .click();
    await expect(page.locator(".object-navigation")).toHaveCount(0);
    await expect(inspector).toContainText("Объект целиком");
    await expect(inspector.getByTestId("material-amounts")).toContainText(
      "339,4 кг",
    );
    await showTools(page);
    await expect(
      page.getByRole("button", { name: "Разобрать", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    if (mobile)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
    expect(errors).toEqual([]);
  });
