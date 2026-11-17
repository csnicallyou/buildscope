import { openSection } from "./navigation-helpers";
import {
  openTree,
  openProperties,
  showTools,
  modelView,
} from "./mobile-helpers";
import { test, expect } from "@playwright/test";

test("Фм4 8/А: расчётный щебень с откосами, свойства части и всего объекта на телефоне", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?assembly=canopy");
  await openTree(page);
  await page.getByLabel("Поиск конструкций").fill("Фм4 · оси 8/А");
  await page
    .getByRole("button", { name: "Фм4 Фм4 · оси 8/А", exact: true })
    .click();
  await expect(
    page.locator(".inspector").getByTestId("material-amounts"),
  ).toContainText("3,376 м³");
  await openProperties(page);
  await page
    .getByRole("button", { name: "Открыть отдельно", exact: true })
    .click();
  await openTree(page);
  await page
    .getByRole("button", {
      name: "ЩП Щебёночная подготовка Фм4 · 8/А",
      exact: true,
    })
    .click();
  const panel = page.locator(".inspector");
  await expect(panel.getByTestId("element-volume")).toHaveText("3,376 м³");
  await expect(panel).toContainText("Объём (расчётный)");
  await expect(panel).toContainText("3.050 × 3.050");
  await expect(panel).toContainText("3.650 × 3.650");
  await expect(panel).toContainText("одинаковые откосы");
  await expect(panel).toContainText("39,8 м³");
  await showTools(page);
  await page.getByRole("button", { name: "Разобрать", exact: true }).click();
  await expect(panel.getByTestId("element-volume")).toHaveText("3,376 м³");
  await openProperties(page);
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: "test-results/fm4-gravel-mobile.png",
    fullPage: true,
  });
  await modelView(page);
  await page
    .getByRole("button", { name: "← Ко всем объектам", exact: true })
    .click();
  await openSection(page, "Источник");
  await expect(page.locator(".source-review")).toContainText("44,80485");
});
