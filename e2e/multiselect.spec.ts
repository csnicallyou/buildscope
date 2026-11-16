import { showTools, modelView, openTree } from "./mobile-helpers";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { elementBounds, type Project } from "../src/model";

test.use({ hasTouch: true });
for (const mobile of [false, true])
  test(`Два объекта выбираются подряд в 3D без включения калькулятора${mobile ? " касаниями на телефоне" : ""}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?assembly=canopy");
    await showTools(page);
    await page.getByRole("button", { name: "Сверху", exact: true }).click();
    await page
      .getByRole("button", { name: "Перспектива", exact: true })
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
    const canvas = page.locator("canvas");
    await page.waitForLoadState("networkidle");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const point = async (name: string) => {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
          ),
      );
      const rect = await canvas.boundingBox();
      if (!rect) throw Error("Canvas unavailable");
      const zoom = Math.min(
        rect.width / ((max[0] - min[0]) * 1.15),
        rect.height / ((max[2] - min[2]) * 1.15),
      );
      const e = project.elements.find((e) => e.name === name)!;
      return {
        x: rect.width / 2 + (e.position[0] - (min[0] + max[0]) / 2) * zoom,
        y: rect.height / 2 + (e.position[2] - (min[2] + max[2]) / 2) * zoom,
      };
    };
    const tap = async (name: string) =>
      mobile
        ? canvas.tap({ position: await point(name) })
        : canvas.click({ position: await point(name) });
    await tap("Фм4 · оси 8/А");
    await expect(page.getByTestId("selection-count")).toHaveText("Выбрано: 1");
    await tap("Фм4 · оси 9/А");
    await expect(page.getByTestId("selection-count")).toHaveText("Выбрано: 2");
    await openTree(page);
    await expect(
      page.getByLabel("В расчёт Фм4 · оси 8/А", { exact: true }),
    ).toBeChecked();
    await expect(
      page.getByLabel("В расчёт Фм4 · оси 9/А", { exact: true }),
    ).toBeChecked();
    await modelView(page);
    await expect(page.getByTestId("selection-calculator")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `test-results/multiselect${mobile ? "-mobile" : ""}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Рассчитать выбранные", exact: true })
      .click();
    await expect(page.getByTestId("selection-calculator")).toContainText(
      "В расчёте: 2",
    );
    await expect(page.getByTestId("calculation-materials")).toContainText(
      "16 шт.",
    );
    await page
      .getByRole("button", { name: "Закрыть калькулятор", exact: true })
      .click();
    await tap("Фм4 · оси 8/А");
    await expect(page.getByTestId("selection-count")).toHaveText("Выбрано: 1");
    await page
      .getByRole("button", { name: "Снять весь выбор", exact: true })
      .click();
    await expect(page.getByTestId("selection-count")).toHaveText("Выбрано: 0");
    if (mobile)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
  });
