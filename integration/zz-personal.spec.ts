import { test, expect } from "@playwright/test";
import { openSection } from "../e2e/navigation-helpers";
test.use({ hasTouch: true });

test("Главная показывает сохранённые координаты, объект открывается со своим контекстом", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("Browser-admin-1234!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Объекты строительства" }),
  ).toBeVisible();
  await openSection(page, "Объекты и участки");
  await page
    .getByRole("button", { name: "Добавить объект", exact: true })
    .click();
  await page
    .getByLabel("Название записи", { exact: true })
    .fill("Тестовая станция на карте");
  await page.getByLabel("Родительский объект").selectOption("");
  await page
    .getByLabel("Координаты на карте", { exact: true })
    .fill("55.75, 37.62");
  await page
    .getByRole("button", { name: "Сохранить запись", exact: true })
    .click();
  await expect(page.getByLabel("Редактор записи стройки")).toHaveCount(0);
  for (let i = 0; i < 4; i++) {
    const response = await page.request.post("/api/construction", {
      headers: { Origin: "http://127.0.0.1:8781" },
      data: {
        id: null,
        revision: null,
        payload: {
          kind: "node",
          title: `Картографический тест ${i + 1}`,
          level: "site",
          parentId: null,
          model: i === 0 ? "kzh-canopy" : "",
          elementIds: [],
          description: "Синтетический источник. ".repeat(30),
          location: { lat: 55.77 + i * 0.03, lng: 37.64 + i * 0.02 },
        },
      },
    });
    expect(response.ok()).toBe(true);
  }
  await openSection(page, "Карта объектов");
  const markers = page.locator(
    ".leaflet-overlay-pane path.leaflet-interactive",
  );
  await expect(markers).toHaveCount(5);
  const allMarkersFit = async () => {
    const bounds = (await page.locator(".portfolio-map").boundingBox())!;
    for (const marker of await markers.all()) {
      const box = (await marker.boundingBox())!;
      if (
        box.width > 30 ||
        box.height > 30 ||
        box.x < bounds.x ||
        box.y < bounds.y ||
        box.x + box.width > bounds.x + bounds.width ||
        box.y + box.height > bounds.y + bounds.height
      )
        return false;
    }
    return true;
  };
  await expect.poll(allMarkersFit).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(allMarkersFit).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(allMarkersFit).toBe(true);
  await page.screenshot({ path: ".deploy/screenshots/personal-site.png" });
  // The already selected first station must open on the first click too.
  const firstSite = page.locator(".portfolio-site").first();
  const firstTitle = await firstSite.locator("strong").innerText();
  await firstSite.click();
  await expect(page.locator(".station-context")).toContainText(firstTitle);
  await openSection(page, "Карта объектов");
  await page
    .locator(".portfolio-site")
    .filter({ hasText: "Картографический тест 1" })
    .click();
  await expect(page.locator(".station-context")).toContainText(
    "Картографический тест 1",
  );
  await expect(
    page
      .locator(".station-workspaces")
      .getByRole("button", { name: "Модель", exact: true }),
  ).toHaveClass(/active/);
  await expect(page.locator(".viewport-heading")).toContainText(
    "Навес «сухие ноги»",
  );
  await expect(page.locator("canvas").first()).toBeVisible();
  await openSection(page, "Карта объектов");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".map-site-link")
    .filter({ hasText: "Картографический тест 1" })
    .tap();
  await expect(
    page
      .locator(".station-workspaces")
      .getByRole("button", { name: "Модель", exact: true }),
  ).toHaveClass(/active/);
  await expect(page.locator(".viewport-heading")).toContainText(
    "Навес «сухие ноги»",
  );
  await openSection(page, "Карта объектов");
  await page
    .locator(".map-site-link")
    .filter({ hasText: "Тестовая станция на карте" })
    .tap();
  await expect(page.locator(".station-context")).toContainText(
    "Тестовая станция на карте",
  );
  await expect(
    page
      .locator(".station-workspaces")
      .getByRole("button", { name: "Модель", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Для этого объекта 3D-модель ещё не добавлена.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByLabel("Все даты и смены").check();
  await expect(page.locator(".shift-table tbody tr")).toHaveCount(0);
  await page
    .locator(".station-workspaces")
    .getByRole("button", { name: "Наряды", exact: true })
    .click();
  await expect(page.locator(".daily-order-card")).toHaveCount(0);
  await openSection(page, "Карта объектов");
  await page
    .locator(".portfolio-site")
    .filter({ hasText: "Тестовая станция на карте" })
    .tap();
  await expect(page.locator(".station-context")).toContainText(
    "Тестовая станция на карте",
  );
  await openSection(page, "Карта объектов");
  const circle = (await markers.first().boundingBox())!;
  const gesture = await page.context().newCDPSession(page);
  const point = {
    x: circle.x + circle.width / 2,
    y: circle.y + circle.height / 2,
  };
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: point.x + 24, y: point.y + 12 }],
  });
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await gesture.detach();
  await expect(page.locator(".portfolio-map")).toBeVisible();
  await expect(page.locator(".station-context")).toHaveCount(0);
  await markers.first().tap();
  await expect(page.locator(".station-context")).toContainText(
    "Тестовая станция на карте",
  );
  await openSection(page, "Карта объектов");
  await markers.first().press("Enter");
  await expect(page.locator(".station-context")).toContainText(
    "Тестовая станция на карте",
  );
});
