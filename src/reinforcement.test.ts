import { describe, expect, it } from "vitest";
import { createKzh } from "./kzh";
import { parseProject, type Element } from "./model";
import { beamStirrupStations, reinforcementSourceHash } from "./reinforcement";
const find = (mark: string, assembly: "pavilion" | "canopy" = "canopy") =>
  createKzh(assembly).elements.find((e) => e.mark === mark)!;
const main = (e: Element) =>
  e.evidence!.bars!.filter((b) => b.drawing?.position === "1");

describe("Ручная сверка КЖ1.5 с листами армирования", () => {
  it("Пм6: лист16, 10Ø16 длиной8940; оси43/90/92/92/90/43 и слой35", () => {
    const e = find("Пм6"),
      bars = main(e);
    expect(bars).toHaveLength(10);
    expect(
      [...new Set(bars.map((b) => b.points[0][2]))].sort((a, b) => a - b),
    ).toEqual([-0.182, -0.092, 0, 0.092, 0.182]);
    expect(
      [...new Set(bars.map((b) => b.points[0][1]))].sort((a, b) => a - b),
    ).toEqual([-0.057, 0.057]);
    for (const b of bars) {
      expect(b.diameter).toBe(0.016);
      expect(b.points[1][0] - b.points[0][0]).toBeCloseTo(8.94, 10);
      expect(b.drawing?.page).toBe(21);
    }
    const d = e.evidence!.reinforcementReview!.distributions![0];
    expect(d.distances).toHaveLength(75);
    expect(d.distances[0]).toBe(0.055);
    expect(d.distances.at(-1)).toBe(8.935);
    expect(d.perStation).toBe(2);
  });
  it("Бм1: лист17, переменные зоны дают45 сечений, а не равномерный шаг", () => {
    const xs = beamStirrupStations("Бм1");
    expect(xs).toHaveLength(45);
    expect(xs[0]).toBe(0.075);
    expect(xs.at(-1)).toBe(7.075);
    const steps = xs.slice(1).map((x, i) => +(x - xs[i]).toFixed(3));
    expect(new Set(steps)).toEqual(new Set([0.1, 0.15, 0.2, 0.3]));
    expect(main(find("Бм1"))).toHaveLength(10);
  });
  it("Бм2: цепь лист18 даёт154 хомута при168 в ведомости; расхождение не скрыто", () => {
    const xs = beamStirrupStations("Бм2");
    expect(xs).toHaveLength(77);
    expect(xs[0]).toBe(0.195);
    expect(xs.at(-1)).toBe(10.995);
    const e = find("Бм2"),
      bars = main(e);
    expect(bars).toHaveLength(14);
    expect(
      bars.filter((b) => Math.abs(b.points[0][1] - 0.135) < 1e-8),
    ).toHaveLength(2);
    for (const b of bars)
      expect(b.points[1][0] - b.points[0][0]).toBeCloseTo(11.03, 10);
    expect(
      e.evidence!.reinforcement!.find((r) => r.position === "Х2")?.count,
    ).toBe(168);
    expect(e.evidence!.reinforcementReview!.conflicts.join(" ")).toContain(
      "154",
    );
    expect(
      e.evidence!.bars!.filter((b) => b.drawing?.position === "Х2"),
    ).toHaveLength(0);
  });
  it("Фм1: лист22,48 прямых участков; верхний слой не выходит за грань бетона", () => {
    const bars = main(find("Фм1"));
    expect(bars).toHaveLength(48);
    const ys = [...new Set(bars.map((b) => b.points[0][1]))].sort(
      (a, b) => a - b,
    );
    for (const [i, v] of [-0.177, -0.161, 0.171, 0.187].entries())
      expect(ys[i]).toBeCloseTo(v, 10);
  });
  it("Прямоугольные плиты: привязки и шаг взяты с планов, а не из габаритного округления", () => {
    const pavilion = find("Пм1", "pavilion");
    expect(main(pavilion)).toHaveLength(78);
    const pm4 = find("Пм4");
    expect(main(pm4)).toHaveLength(144);
    for (const e of [pavilion, pm4])
      for (const b of main(e)) expect(b.drawing).toBeDefined();
    // 25mm clear cover is respected by both directions on BOTH faces.
    for (const b of main(pm4))
      expect(Math.abs(b.points[0][1]) + b.diameter / 2).toBeLessThanOrEqual(
        0.07500001,
      );
  });
  it("Сложные узлы не получают выдуманную сетку; все19 марок имеют честный реестр", () => {
    const all = [
      ...createKzh("canopy").elements,
      ...createKzh("pavilion").elements,
    ].filter((e) => e.evidence?.reinforcement);
    expect(new Set(all.map((e) => e.evidence!.assembly + e.mark)).size).toBe(
      19,
    );
    for (const e of all) {
      expect(e.evidence!.reinforcementReview!.sourceHash).toBe(
        reinforcementSourceHash,
      );
      expect(e.evidence!.reinforcementReview!.pending.length).toBeGreaterThan(
        0,
      );
    }
    for (const mark of ["Фм2", "Фм3", "Фм4", "Пм2.2", "Пм2.3", "Лм1"]) {
      const e = find(mark);
      expect(main(e)).toHaveLength(0);
      expect(e.evidence!.reinforcementReview!.status).toBe("schedule-only");
    }
  });
  it("Фм4: масса поз.1 переписана буквально с PDF27 — 282,4 кг", () => {
    const e = find("Фм4");
    expect(
      e.evidence!.reinforcement!.find((r) => r.position === "1")?.totalMass,
    ).toBe(282.4);
  });
  it("Расширение v2 переживает JSON, старые проекты без реестра остаются читаемыми", () => {
    const project = createKzh("canopy");
    const copy = parseProject(JSON.stringify(project));
    expect(copy).toEqual(project);
    for (const e of copy.elements)
      if (e.evidence) {
        delete e.evidence.reinforcementReview;
        for (const b of e.evidence.bars ?? []) delete b.drawing;
      }
    expect(() => parseProject(JSON.stringify(copy))).not.toThrow();
  });
});
