import { test, expect } from "@playwright/test";
test("Заполненный разрез X/Y/Z сохраняет вырез и количества", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?demo=1");
  const e = {
    id: "u",
    name: "Профиль с вырезом",
    mark: "U",
    category: "Плиты",
    material: "Бетон",
    color: "#88aeb0",
    position: [0, 0, 0],
    parts: [],
    shape: {
      kind: "extrusion",
      axis: "y",
      depth: 2,
      outline: [
        [-2, -2],
        [2, -2],
        [2, 2],
        [1, 2],
        [1, -1],
        [-1, -1],
        [-1, 2],
        [-2, 2],
      ],
    },
    source: "Синтетическая проверка",
    confidence: "manual",
    parentId: null,
    sourceRef: null,
  };
  await page
    .getByLabel("Загрузить JSON", { exact: true })
    .setInputFiles({
      name: "synthetic.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 2,
          name: "Сечение",
          units: "m",
          elements: [e],
        }),
      ),
    });
  await page.getByLabel("Размеры", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Разрез", exact: true }).click();
  await page.getByLabel("Ось разреза").selectOption("y");
  await page.getByLabel("Положение разреза").fill("0");
  await page.getByRole("button", { name: "Сверху", exact: true }).click();
  await page.waitForFunction(() => {
    const c = document.querySelector(
      ".model-stage canvas",
    ) as HTMLCanvasElement;
    const copy = document.createElement("canvas");
    copy.width = c.width;
    copy.height = c.height;
    const ctx = copy.getContext("2d")!;
    ctx.drawImage(c, 0, 0);
    const p = ctx.getImageData(0, 0, c.width, c.height).data;
    let warm = 0;
    for (let i = 0; i < p.length; i += 4)
      if (p[i] > 140 && p[i] > p[i + 1] * 1.15 && p[i + 1] > p[i + 2] * 1.2)
        warm++;
    return warm > 1000;
  });
  await page.screenshot({ path: "docs/screenshots/section-filled.png" });
  // The notch opens toward +Z (bottom of the top view); its centre stays empty.
  const inside = await page.locator(".model-stage canvas").evaluate((node) => {
    const c = node as HTMLCanvasElement;
    const copy = document.createElement("canvas");
    copy.width = c.width;
    copy.height = c.height;
    const ctx = copy.getContext("2d")!;
    ctx.drawImage(c, 0, 0);
    const [r, g, b] = ctx.getImageData(
      Math.floor(c.width / 2),
      Math.floor(c.height * 0.55),
      1,
      1,
    ).data;
    return r > 140 && r > g * 1.15 && g > b * 1.2;
  });
  expect(inside).toBe(false);
  for (const axis of ["x", "z"]) {
    await page.getByLabel("Ось разреза").selectOption(axis);
    await expect(page.getByLabel("Положение разреза")).toBeVisible();
  }
  await expect(page.locator(".model-footer")).toContainText("20 м³");
  expect(errors).toEqual([]);
});
