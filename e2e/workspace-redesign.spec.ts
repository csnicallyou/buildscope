import { openSection } from "./navigation-helpers";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { elementBounds, type Project } from "../src/model";
test.use({ hasTouch: true });

for (const mobile of [false, true]) {
  test(`Рабочее пространство и выбор в наряде${mobile ? " касаниями" : " на компьютере"}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?assembly=canopy");
    await expect(
      mobile
        ? page.getByRole("button", {
            name: "Разделы управления стройкой",
            exact: true,
          })
        : page.getByRole("navigation", { name: "Режимы работы" }),
    ).toBeVisible();
    const scene = page.locator(".model-stage canvas");
    await expect(scene).toBeVisible();
    const original = await scene.boundingBox();
    expect(original!.height).toBeGreaterThan(mobile ? 300 : 500);
    if (!mobile) {
      await page.getByLabel("Свернуть дерево", { exact: true }).click();
      await expect
        .poll(async () => (await scene.boundingBox())!.width)
        .toBeGreaterThan(original!.width + 150);
      await page.getByLabel("Показать дерево", { exact: true }).click();
      await page.getByLabel("Свернуть свойства", { exact: true }).click();
      await expect
        .poll(async () => (await scene.boundingBox())!.width)
        .toBeGreaterThan(original!.width + 200);
      await page.getByLabel("Показать свойства", { exact: true }).click();
    }
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `docs/screenshots/workspace-09${mobile ? "-mobile" : ""}.png`,
    });
    await openSection(page, "Наряд");
    await expect(page.getByLabel("Конструкция для наряда")).toHaveValue("");
    await page
      .getByRole("button", { name: "План сверху", exact: true })
      .click();
    const project = JSON.parse(
      await readFile(
        new URL(
          "../output/projects/canopy-plan.buildscope.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as Project;
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const e of project.elements) {
      const b = elementBounds(e);
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], b.min[a] + e.position[a]);
        max[a] = Math.max(max[a], b.max[a] + e.position[a]);
      }
    }
    const canvas = page.locator(".work-order-map canvas");
    await canvas.evaluate(
      () =>
        new Promise<void>((r) => {
          let n = 10;
          const tick = () => (--n ? requestAnimationFrame(tick) : r());
          requestAnimationFrame(tick);
        }),
    );
    const rect = (await canvas.boundingBox())!;
    const zoom = Math.min(
      rect.width / ((max[0] - min[0]) * 1.15),
      rect.height / ((max[2] - min[2]) * 1.15),
    );
    const first = project.elements.find((e) => e.name === "Фм4 · оси 8/А")!;
    const position = {
      x: rect.width / 2 + (first.position[0] - (min[0] + max[0]) / 2) * zoom,
      y: rect.height / 2 + (first.position[2] - (min[2] + max[2]) / 2) * zoom,
    };
    if (mobile) await canvas.tap({ position });
    else await canvas.click({ position });
    await expect(page.getByLabel("Конструкция для наряда")).toHaveValue(
      `object:${first.id}`,
    );
    const second = project.elements.find((e) => e.name === "Фм4 · оси 9/А")!;
    await page
      .getByLabel("Конструкция для наряда")
      .selectOption(`object:${second.id}`);
    await expect(page.locator(".work-order-map-heading strong")).toHaveText(
      second.name,
    );
    await page
      .getByRole("button", { name: "Выбрать части объекта", exact: true })
      .click();
    await canvas.click({ position: { x: rect.width / 2, y: rect.height / 2 } });
    await expect(page.getByLabel("Конструкция для наряда")).toHaveValue(
      /^part:/,
    );
    await expect(
      page.getByRole("heading", { name: "Наряд", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/work-order-map${mobile ? "-mobile" : ""}.png`,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(errors).toEqual([]);
  });
}

test("Невысокий экран и светлая тема оставляют место сцене", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?assembly=canopy");
  await expect(page.locator(".app")).toHaveClass(/light/);
  expect(
    (await page.locator(".model-stage canvas").boundingBox())!.height,
  ).toBeGreaterThanOrEqual(350);
  await page.screenshot({ path: "docs/screenshots/workspace-09-light.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  await openSection(page, "Наряд");
  await expect(page.locator(".work-order-map canvas")).toBeVisible();
  expect(
    (await page.locator(".work-order-map canvas").boundingBox())!.height,
  ).toBeGreaterThan(140);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(844);
});
