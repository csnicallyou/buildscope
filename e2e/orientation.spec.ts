import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Project } from "../src/model";
import { PerspectiveCamera, Vector3 } from "three";
import { showTools } from "./mobile-helpers";
for (const mobile of [false, true])
  test(`План сверху: ось А внизу, Е наверху, 1 слева${mobile ? " телефон" : ""}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?assembly=canopy");
    await showTools(page);
    await page.getByRole("button", { name: "Сверху", exact: true }).click();
    // Probe actual WebGL geometry at the projected footprint of the asymmetric
    // foundation 8/A, rather than accepting a flipped screenshot or DOM label.
    const p = JSON.parse(
        await readFile("output/projects/canopy-plan.buildscope.json", "utf8"),
      ) as Project,
      elements = p.elements;
    const { elementBounds } = await import("../src/model");
    let min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const e of elements) {
      const b = elementBounds(e);
      min = min.map((v, a) => Math.min(v, b.min[a] + e.position[a]));
      max = max.map((v, a) => Math.max(v, b.max[a] + e.position[a]));
    }
    const box = await page.locator(".model-stage canvas").boundingBox();
    const center = new Vector3(
      ...(min.map((v, a) => (v + max[a]) / 2) as [number, number, number]),
    );
    const diameter = Math.hypot(...max.map((v, a) => v - min[a]));
    const distance = (diameter * 1.5) / Math.min(1, box!.width / box!.height);
    const cam = new PerspectiveCamera(
      42,
      box!.width / box!.height,
      0.01,
      10000,
    );
    cam.position
      .copy(center)
      .add(new Vector3(0, 1, 0.0001).normalize().multiplyScalar(distance));
    cam.lookAt(center);
    cam.updateMatrixWorld();
    const foundation = elements.find((e) => e.name === "Фм4 · оси 8/А")!;
    const point = new Vector3(...foundation.position).project(cam);
    const x = ((point.x + 1) * box!.width) / 2,
      y = ((1 - point.y) * box!.height) / 2;
    await expect
      .poll(() =>
        page.locator(".model-stage canvas").evaluate(
          (node, { x, y }) => {
            const c = node as HTMLCanvasElement,
              copy = document.createElement("canvas");
            copy.width = c.width;
            copy.height = c.height;
            const ctx = copy.getContext("2d")!;
            ctx.drawImage(c, 0, 0);
            const pixel = ctx.getImageData(
              Math.round((x * c.width) / c.clientWidth),
              Math.round((y * c.height) / c.clientHeight),
              1,
              1,
            ).data;
            return pixel[0] > 70 && pixel[1] > 70;
          },
          { x, y },
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/screenshots/plan-corrected${mobile ? "-mobile" : ""}.png`,
    });
  });
