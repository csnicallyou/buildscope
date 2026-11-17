import type { Page, Locator } from "@playwright/test";
export async function openDisclosure(summary: Locator) {
  if (!(await summary.locator("..").evaluate((el) => el.hasAttribute("open"))))
    await summary.click();
}
export async function openSection(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Режимы работы" });
  if (!(await nav.isVisible()))
    await page
      .getByRole("button", { name: "Все разделы", exact: true })
      .click();
  await nav
    .getByRole("button", {
      name: name === "Контроль качества" ? "Замечания" : name,
      exact: true,
    })
    .click();
}
