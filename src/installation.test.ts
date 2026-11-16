import { describe, it, expect } from "vitest";
import { createKzh } from "./kzh";
import { objectItems, modelObjects, type SceneItem } from "./objects";
import {
  installationPlan,
  formBoards,
  workFrame,
  stepStart,
  fillAmount,
  boardMotion,
} from "./installation";
import { elementQuantities, type Element } from "./model";
const project = createKzh("canopy");
const object = modelObjects(project).find((o) => o.root.mark === "Фм1")!;
const items = objectItems(object);
const prep = items.find((i) => i.element.mark === "БП")!;
const body = (e: Element): SceneItem => ({
  id: e.id,
  element: e,
  label: e.name,
  kind: "body",
  layer: 0,
});
describe("Сценарии устройства частей", () => {
  it("подбетонка имеет доски, заливку и условную паузу перед распалубкой", () => {
    const p = installationPlan(prep)!;
    expect(p.kind).toBe("concrete");
    expect(p.steps.map((s) => s.phase)).toEqual([
      "layout",
      "base",
      "boards",
      "seal",
      "check",
      "pour",
      "vibrate",
      "level",
      "care",
      "wait",
      "strip",
      "ready",
    ]);
    expect(p.boards.length).toBeGreaterThan(3);
    expect(p.boards.every((b) => b.size[2] === 0.025)).toBe(true);
    expect(p.volume).toBeCloseTo(elementQuantities(prep.element).volume);
  });
  it("доски идут по внешнему контуру объединения, без внутренних перегородок", () => {
    const e = {
      ...prep.element,
      shape: undefined,
      parts: [
        {
          size: [2, 1, 2] as [number, number, number],
          offset: [-1, 0, 0] as [number, number, number],
        },
        {
          size: [2, 1, 2] as [number, number, number],
          offset: [1, 0, 0] as [number, number, number],
        },
      ],
    };
    expect(formBoards(e).reduce((v, b) => v + b.size[0], 0)).toBeCloseTo(12);
  });
  it("П-образный профиль сохраняет доски на внутренних сторонах выреза", () => {
    const e = {
      ...prep.element,
      parts: [],
      shape: {
        kind: "extrusion" as const,
        axis: "y" as const,
        depth: 0.1,
        outline: [
          [-2, -2],
          [2, -2],
          [2, 2],
          [1, 2],
          [1, -1],
          [-1, -1],
          [-1, 2],
          [-2, 2],
        ] as [number, number][],
      },
    };
    const boards = formBoards(e);
    expect(boards.reduce((v, b) => v + b.size[0], 0)).toBeCloseTo(22);
    expect(
      boards.some(
        (b) => Math.abs(b.position[0] - 0.9875) < 1e-6 && b.position[2] > -1,
      ),
    ).toBe(true);
  });
  it("проигрывание детерминировано и не меняет исходную геометрию/количества", () => {
    const p = installationPlan(prep)!;
    const before = JSON.stringify(project);
    const pour = p.steps.findIndex((s) => s.phase === "pour"),
      t = stepStart(p, pour);
    expect(fillAmount(p, t)).toBe(0);
    expect(fillAmount(p, t + p.steps[pour].duration / 2)).toBeCloseTo(0.5);
    expect(fillAmount(p, p.duration)).toBe(1);
    expect(workFrame(p, -4).step.phase).toBe("layout");
    expect(workFrame(p, p.duration + 4).ended).toBe(true);
    for (let t = 0; t <= p.duration; t += 0.1) {
      workFrame(p, t);
      boardMotion(p, t, 0);
    }
    expect(JSON.stringify(project)).toBe(before);
  });
  it("после снятия временные доски отсутствуют", () => {
    const p = installationPlan(prep)!;
    expect(boardMotion(p, 0, 0).visible).toBe(false);
    expect(
      boardMotion(
        p,
        stepStart(
          p,
          p.steps.findIndex((s) => s.phase === "pour"),
        ),
        0,
      ).amount,
    ).toBe(1);
    expect(boardMotion(p, p.duration, 0).visible).toBe(false);
  });
  it("для щебня не придумывает доски или коэффициент рыхлого объёма", () => {
    const gravel = items.find((i) => i.element.material === "Щебень")!;
    const p = installationPlan(gravel)!;
    expect(p.kind).toBe("bulk");
    expect(p.boards).toHaveLength(0);
    expect(p.steps.map((s) => s.phase)).toEqual([
      "layout",
      "base",
      "spread",
      "compact",
      "check",
      "ready",
    ]);
    expect(p.volume).toBeCloseTo(elementQuantities(gravel.element).volume);
  });
  it("неизвестный контур не превращается в точную анимацию", () => {
    const p = createKzh("canopy");
    const unknown = p.elements.find(
      (e) => e.evidence?.representation === "envelope",
    )!;
    expect(installationPlan(body(unknown))).toBeNull();
  });
  it("схема арматуры учитывает выбранную группу, а не массу всего фундамента", () => {
    const item = items.find(
      (i) => i.kind === "steel" && i.label.startsWith("Анкер"),
    )!;
    const p = installationPlan(item)!;
    expect(p.kind).toBe("steel");
    expect(p.quantity).toContain(`${item.bars!.length} стержней`);
    expect(p.steps.some((s) => s.phase === "pour")).toBe(false);
  });
  it("сборный ФБС опускается целиком, без выдуманной заливки", () => {
    const e = project.elements.find((e) => e.category === "ФБС")!;
    const p = installationPlan(body(e))!;
    expect(p.kind).toBe("placement");
    expect(p.steps.map((s) => s.phase)).toEqual([
      "layout",
      "place",
      "check",
      "ready",
    ]);
  });
});

it("плёнка основания включается явно, отличается от укрытия и не меняет объём", () => {
  const base = installationPlan(prep)!;
  expect(base.steps.some((s) => s.phase === "film")).toBe(false);
  const withFilm = installationPlan(prep, {
    baseFilm: true,
    curingCover: true,
    vibration: "surface",
  })!;
  expect(withFilm.steps.some((s) => s.phase === "film")).toBe(true);
  expect(withFilm.steps.some((s) => s.phase === "care")).toBe(true);
  expect(withFilm.volume).toBe(base.volume);
  expect(withFilm.steps.findIndex((s) => s.phase === "film")).toBeLessThan(
    withFilm.steps.findIndex((s) => s.phase === "pour"),
  );
});
it("у анкеров показан монтажный шаблон, а не выдуманная сварка", () => {
  const item = items.find(
    (i) => i.kind === "steel" && i.label.startsWith("Анкер"),
  )!;
  expect(
    installationPlan(item)!.steps.find((s) => s.phase === "tie")!.title,
  ).toBe("Фиксация анкеров");
});
