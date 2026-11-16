import type { Page } from "@playwright/test";
const mobile = (page: Page) => (page.viewportSize()?.width ?? 1440) <= 850;
export async function openTree(page: Page) {
  if (mobile(page) && !(await page.getByLabel("Поиск конструкций").isVisible()))
    await page
      .getByRole("navigation", { name: "Панели просмотра" })
      .getByRole("button", { name: "Конструкции", exact: true })
      .click();
}
export async function modelView(page: Page) {
  if (mobile(page))
    await page
      .getByRole("navigation", { name: "Панели просмотра" })
      .getByRole("button", { name: "Модель", exact: true })
      .click();
}
export async function showTools(page: Page) {
  if (mobile(page)) {
    await modelView(page);
    const tools = page.getByRole("button", {
      name: "Инструменты",
      exact: true,
    });
    if ((await tools.getAttribute("aria-pressed")) !== "true")
      await tools.click();
  }
}
export async function openProperties(page: Page) {
  if (mobile(page)) {
    await page
      .getByRole("navigation", { name: "Панели просмотра" })
      .getByRole("button", { name: "Свойства", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Развернуть панель", exact: true })
      .click();
  }
}
export async function openCalculator(page: Page) {
  if (mobile(page)) {
    await page
      .getByRole("navigation", { name: "Панели просмотра" })
      .getByRole("button", { name: /^Расчёт/ })
      .click();
    await page
      .getByRole("button", { name: "Развернуть панель", exact: true })
      .click();
  } else {
    const toggle = page.getByRole("button", {
      name: "Калькулятор материалов",
      exact: true,
    });
    if ((await toggle.getAttribute("aria-pressed")) !== "true")
      await toggle.click();
  }
}
