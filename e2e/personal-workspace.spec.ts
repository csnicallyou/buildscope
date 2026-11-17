import { test, expect } from "@playwright/test";
import { openSection } from "./navigation-helpers";
import type { SavedWorkOrder } from "../src/workOrderArchive";

for (const mobile of [false, true])
  test(`Personal: главная, контроль смены и переход к наряду${mobile ? " телефон" : ""}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Offline cartography must not block work. Never make automated tile requests.
    await page.route("https://tile.openstreetmap.org/**", (route) =>
      route.abort(),
    );
    const order: SavedWorkOrder = {
      id: "ui-test-order",
      createdAt: "2026-11-16T16:00:00Z",
      submittedAt: null,
      draft: {
        brigade: "Тестовая бригада",
        zone: "Тестовый участок",
        rows: [
          {
            id: "row",
            date: "2026-11-16",
            site: "Тестовая станция",
            shift: "Ночь",
            contractor: "Тестовый подрядчик",
            zone: "",
            axes: "",
            workId: "concrete",
            work: "Бетонирование",
            plan: 2,
            unit: "м³",
            actual: null,
            equipment: "",
            brand: "",
            plate: "",
            note: "",
            target: "Тестовая конструкция",
            elementIds: [],
            project: "",
            basis: "Вручную",
            modelPlan: null,
          },
        ],
        crew: [],
        site: "Тестовая станция",
        contractor: "Тестовый подрядчик",
        date: "2026-11-16",
        shift: "Ночь",
      },
    };
    await page.addInitScript(
      ({ key, value }) => localStorage.setItem(key, value),
      {
        key: "buildscope.work-orders.v1",
        value: JSON.stringify({ version: 1, orders: [order] }),
      },
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Объекты строительства", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".portfolio-local-model")).toContainText(
      "Инженерная модель",
    );
    await page.screenshot({
      path: `.deploy/screenshots/personal-home${mobile ? "-mobile" : ""}.png`,
    });
    await page.getByRole("button", { name: /Не сданы отчёты/ }).click();
    await expect(
      page.getByRole("heading", { name: "Контроль смены", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".shift-table tbody")).toContainText(
      "Тестовый подрядчик",
    );
    await page.screenshot({
      path: `.deploy/screenshots/personal-shift${mobile ? "-mobile" : ""}.png`,
    });
    await page
      .locator(".shift-table")
      .getByRole("button", { name: "Открыть", exact: true })
      .click();
    await expect(page.locator(".handoff-heading")).toContainText(
      "Тестовая станция",
    );
    await page.screenshot({
      path: `.deploy/screenshots/personal-order${mobile ? "-mobile" : ""}.png`,
    });
    await page
      .getByRole("button", { name: "К списку дней", exact: true })
      .click();
    await expect(page.getByLabel("Поиск наряда")).toBeVisible();
    await page.getByLabel("Поиск наряда").fill("несуществующий подрядчик");
    await expect(
      page.getByRole("heading", { name: "Нет нарядов по этому фильтру" }),
    ).toBeVisible();
    await openSection(page, "3D-модель");
    await expect(page.locator(".model-stage canvas")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
