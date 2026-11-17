import type { Page } from "@playwright/test";
export async function openSection(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Режимы работы" });
  if (!(await nav.isVisible()))
    await page
      .getByRole("button", { name: "Разделы управления стройкой", exact: true })
      .click();
  await nav.getByRole("button", { name, exact: true }).click();
}
