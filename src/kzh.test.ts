import { describe, it, expect } from "vitest";
import { createKzh } from "./kzh";
import {
  parseProject,
  elementQuantities,
  elementBounds,
  totals,
  toCSV,
  type Element,
} from "./model";
import { shapeQuantities, validateShape } from "./engineering";
import { elementGeometries } from "./geometry";
import { createKzhDetails } from "./details";
import { toSourceCSV } from "./model";
const count = (list: Element[], mark: string) =>
  list.filter((e) => e.mark === mark).length;
describe("КЖ1.5: сверка с независимыми спецификациями", () => {
  it("павильон: все ФБС, ФЛ, плиты; повторные подписи не удваивают блоки", () => {
    const p = createKzh("pavilion");
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    for (const [mark, n] of [
      ["СБ1", 50],
      ["СБ2", 22],
      ["СБ3", 30],
      ["ФЛ1", 22],
      ["ФЛ2", 5],
      ["Пм1", 2],
      ["Пм2", 8],
      ["Пм3", 2],
    ] as const)
      expect(count(p.elements, mark), mark).toBe(n);
    expect(p.elements.filter((e) => e.category === "ФБС")).toHaveLength(102);
    expect(p.elements.filter((e) => e.category === "ФЛ")).toHaveLength(27);
    expect(
      p.elements
        .filter((e) => e.category === "Плиты")
        .reduce((s, e) => s + elementQuantities(e).volume, 0),
    ).toBeCloseTo(26.77826, 8);
    expect(
      p.document!.materials.find((r) => r.name.includes("плиты"))!.value,
    ).toBe(27.2);
  });
  it("навес: 103 ФБС, 31 ФЛ, 17 Фм и все марки перекрытия", () => {
    const p = createKzh("canopy");
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    for (const [mark, n] of [
      ["СБ1", 51],
      ["СБ2", 11],
      ["СБ3", 41],
      ["ФЛ1", 8],
      ["ФЛ2", 23],
      ["Фм1", 11],
      ["Фм2", 1],
      ["Фм3", 1],
      ["Фм4", 4],
      ["Пм1.1", 4],
      ["Пм1.2", 1],
      ["Пм2.1", 3],
      ["Пм2.2", 1],
      ["Пм2.3", 1],
      ["Пм3", 1],
      ["Пм4", 1],
      ["Пм5", 1],
      ["Пм6", 1],
      ["Бм1", 2],
      ["Бм2", 1],
      ["Лм1", 1],
    ] as const)
      expect(count(p.elements, mark), mark).toBe(n);
    expect(
      p.elements
        .filter((e) => e.category === "Фундаменты Фм")
        .reduce((s, e) => s + elementQuantities(e).volume, 0),
    ).toBeCloseTo(54.231075, 7);
    expect(
      p.elements
        .filter((e) => e.category === "Плиты")
        .reduce((s, e) => s + elementQuantities(e).volume, 0),
    ).toBeCloseTo(24.19112, 7);
  });
  it("П-образный фундамент и вырезы плит не считаются по габаритам", () => {
    const p = createKzh("canopy");
    expect(
      elementQuantities(p.elements.find((e) => e.mark === "Фм2")!).volume,
    ).toBeCloseTo((7.15 * 2.975 - 2.35 * 2.085) * 0.45, 9);
    expect(
      elementQuantities(p.elements.find((e) => e.mark === "Пм2.2")!).volume,
    ).toBeCloseTo((2.22 * 3.12 - 0.41 * 0.6) * 0.2, 9);
    expect(
      elementQuantities(p.elements.find((e) => e.mark === "Пм2.3")!).volume,
    ).toBeCloseTo((2.22 * 3.12 - 0.52 * 0.6) * 0.2, 9);
  });
  it("варианты отметок не меняют объёмы; низ Фм выше низа подготовки", () => {
    const plan = createKzh("canopy"),
      sections = createKzh("canopy", "sections");
    expect(totals(plan.elements)).toEqual(totals(sections.elements));
    const slab = plan.elements.find((e) => e.mark === "Пм2.1")!;
    expect(slab.position[1] + elementBounds(slab).max[1]).toBeCloseTo(-0.05);
    const alternate = sections.elements.find((e) => e.id === slab.id)!;
    expect(alternate.position[1] + elementBounds(alternate).max[1]).toBeCloseTo(
      -0.1,
    );
    const f = plan.elements.find((e) => e.name === "Фм1 · оси 1/А")!;
    expect(f.position[1] + elementBounds(f).min[1]).toBeCloseTo(-1.83);
    expect(f.position[1] + elementBounds(f).max[1]).toBeCloseTo(-1.38);
    const level9 = plan.elements.find((e) => e.name === "Фм4 · оси 9/А")!;
    expect(level9.position[1]).not.toBe(
      sections.elements.find((e) => e.id === level9.id)!.position[1],
    );
  });
  it("схемы и огибающие не попадают в материальный объём / CSV", () => {
    const p = createKzh("canopy");
    const stair = p.elements.find((e) => e.mark === "Лм1")!;
    expect(stair.evidence!.representation).toBe("diagram");
    expect(stair.evidence!.reportedVolume).toBe(5.45);
    expect(totals([stair])).toEqual({});
    const row = toCSV(p)
      .split("\r\n")
      .find((r) => r.includes(stair.id))!;
    expect(row).toContain('"";"";"1"');
  });
  it("152 анкера M24, уникальные ID схем и все 25 листов", () => {
    const p = createKzh("canopy");
    const bars = p.elements.flatMap((e) => e.evidence?.bars ?? []);
    expect(bars.filter((b) => b.label.includes("Анкер M24"))).toHaveLength(152);
    expect(new Set(bars.map((b) => b.id)).size).toBe(bars.length);
    expect(p.document!.sheets).toHaveLength(25);
    expect(p.document!.sheets.find((s) => s.sheet === 10)!.pages).toEqual([
      12, 15,
    ]);
    expect(
      p.elements
        .filter((e) => e.evidence?.reinforcement)
        .every((e) =>
          e.evidence!.reinforcement!.every(
            (r) => r.count !== null || r.totalLength !== null,
          ),
        ),
    ).toBe(true);
  });
});
describe("Произвольные профили и согласованность viewer / количеств", () => {
  it("каталог гнутых деталей сохраняет схемы и длины заготовок отдельно", () => {
    const p = createKzhDetails();
    expect(p.elements).toHaveLength(22);
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    expect(
      p.elements.every(
        (e) =>
          e.shape?.kind === "bar" && e.evidence?.representation === "diagram",
      ),
    ).toBe(true);
    expect(totals(p.elements)).toEqual({});
    expect(toSourceCSV(p)).toContain('"1.815"');
    expect(toSourceCSV(p)).toContain('"120"');
  });
  it("треугольная призма: аналитические объём / площадь", () => {
    expect(
      shapeQuantities({
        kind: "extrusion",
        axis: "x",
        depth: 2,
        outline: [
          [0, 0],
          [3, 0],
          [0, 4],
        ],
      }),
    ).toEqual({ volume: 12, area: 36 });
  });
  it("отклоняет самопересечение и незамкнутые тела", () => {
    expect(
      validateShape({
        kind: "extrusion",
        axis: "y",
        depth: 1,
        outline: [
          [0, 0],
          [2, 2],
          [0, 2],
          [2, 0],
        ],
      }),
    ).toContain("Самопересечение");
    expect(
      validateShape({
        kind: "solid",
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        faces: [
          [0, 1, 2],
          [0, 2, 3],
          [0, 3, 1],
          [0, 2, 1],
        ],
      }),
    ).toBeTruthy();
  });
  it("объём треугольников совпадает с ядром для пазов, вырезов и ФЛ", () => {
    const list = [
      ...createKzh("pavilion").elements,
      ...createKzh("canopy").elements,
    ];
    for (const mark of ["СБ1", "ФЛ1", "Фм2", "Пм2.2", "Пм2.3", "Лм1"]) {
      const e = list.find((e) => e.mark === mark)!;
      const geometries = elementGeometries(e);
      let volume = 0;
      for (const { geometry: g, offset } of geometries) {
        const geo = g.index ? g.toNonIndexed() : g;
        const pos = geo.getAttribute("position");
        for (let i = 0; i < pos.count; i += 3) {
          const [a, b, c] = [0, 1, 2].map((k) => [
            pos.getX(i + k) + offset[0],
            pos.getY(i + k) + offset[1],
            pos.getZ(i + k) + offset[2],
          ]);
          volume +=
            (a[0] * (b[1] * c[2] - b[2] * c[1]) -
              a[1] * (b[0] * c[2] - b[2] * c[0]) +
              a[2] * (b[0] * c[1] - b[1] * c[0])) /
            6;
        }
        if (geo !== g) geo.dispose();
        g.dispose();
      }
      expect(Math.abs(volume), mark).toBeCloseTo(
        elementQuantities(e).volume,
        5,
      );
    }
  });
});
