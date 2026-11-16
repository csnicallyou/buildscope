import { describe, it, expect } from "vitest";
import { calculateSelection, calculationCSV } from "./calculator";
import { createKzh } from "./kzh";
import { modelObjects } from "./objects";
import { useStore } from "./store";

describe("Калькулятор выбранных объектов", () => {
  it("накопление объектов включается явно, отдельный вид остаётся одиночным", () => {
    const p = createKzh("canopy");
    const objects = modelObjects(p).filter((o) => o.root.mark === "Фм4");
    const s = useStore;
    s.getState().load(p);
    s.getState().setMultipleSelection(true);
    expect(s.getState().calculatorOpen).toBe(false);
    s.getState().select(objects[0].id);
    s.getState().select(objects[1].members[1].id);
    expect(s.getState().calculatedObjects).toEqual([
      objects[0].id,
      objects[1].id,
    ]);
    s.getState().set({ calculatorOpen: true });
    expect(
      calculateSelection(p, s.getState().calculatedObjects).objects,
    ).toHaveLength(2);
    s.getState().set({ calculatorOpen: false });
    s.getState().select(objects[0].id);
    expect(s.getState().calculatedObjects).toEqual([objects[1].id]);
    s.getState().openObject(objects[0].id);
    s.getState().select(objects[0].members[1].id);
    expect(s.getState().selected).toBe(objects[0].members[1].id);
    expect(s.getState().calculatedObjects).toEqual([objects[1].id]);
  });
  it("два Фм4: материалы полных сборок, марки стали и анкеры в своих единицах", () => {
    const p = createKzh("canopy");
    const selected = modelObjects(p)
      .filter((o) => o.root.mark === "Фм4")
      .slice(0, 2);
    const c = calculateSelection(
      p,
      selected.map((o) => o.id),
    );
    expect(c.objects).toHaveLength(2);
    expect(c.elements).toHaveLength(6);
    const value = (name: string) =>
      c.materials.find((r) => r.name === name)!.value;
    expect(value("Бетон B25 W8 F150")).toBeCloseTo(7.31025, 8);
    expect(value("Бетон B7.5")).toBeCloseTo(1.8605, 8);
    expect(value("Щебень")).toBeCloseTo(6.7515, 8);
    expect(value("Сталь A500C")).toBeCloseTo(938.4);
    expect(value("Сталь A240")).toBeCloseTo(45.8);
    expect(value("Анкеры M24")).toBe(16);
    expect(c.materials.find((r) => r.name === "Сталь A500C")!.unit).toBe("кг");
    expect(c.assumptions).toBe(2);
  });
  it("корень, его подготовка и повторные ID не удваивают расчёт", () => {
    const p = createKzh("canopy");
    const o = modelObjects(p).find((o) => o.root.mark === "Фм4")!;
    const c = calculateSelection(p, [
      o.id,
      o.members[1].id,
      o.id,
      "несуществующий",
    ]);
    expect(c.objects).toHaveLength(1);
    expect(c.elements).toHaveLength(3);
    expect(c.materials.find((r) => r.name === "Щебень")!.value).toBeCloseTo(
      3.37575,
    );
    expect(calculateSelection(p, []).materials).toEqual([]);
  });
  it("известный щебень и неопределённый контур Фм2 остаются одним неполным итогом", () => {
    const p = createKzh("canopy");
    const selected = modelObjects(p).filter((o) =>
      ["Фм2", "Фм3"].includes(o.root.mark),
    );
    const c = calculateSelection(
      p,
      selected.map((o) => o.id),
    );
    const gravel = c.materials.filter((r) => r.name === "Щебень");
    expect(gravel).toHaveLength(1);
    expect(gravel[0].value).toBeCloseTo(3.44985);
    expect(gravel[0].unknown).toBe(1);
    expect(gravel[0].basis).toContain("одинаковые откосы");
    expect(gravel[0].basis).toContain("не определены");
    expect(gravel[0].value).not.toBe(39.8);
  });
  it("режим выбора добавляет/убирает весь объект; скрытие/смещение/сброс не меняют итог, смена проекта очищает выбор", () => {
    const p = createKzh("canopy");
    const original = JSON.stringify(p);
    const o = modelObjects(p).find((o) => o.root.mark === "Фм4")!;
    const s = useStore;
    s.getState().load(p);
    s.getState().setMultipleSelection(true);
    s.getState().set({ calculatorOpen: true });
    s.getState().select(o.members[1].id);
    expect(s.getState().calculatedObjects).toEqual([o.id]);
    s.getState().select(o.id);
    expect(s.getState().calculatedObjects).toEqual([]);
    s.getState().select(o.id);
    const before = calculateSelection(p, s.getState().calculatedObjects);
    s.getState().set({
      hidden: [o.id],
      exploded: true,
      offsets: { [o.id]: [10, 1, 3] },
    });
    s.getState().reset();
    expect(calculateSelection(p, s.getState().calculatedObjects)).toEqual(
      before,
    );
    expect(JSON.stringify(p)).toBe(original);
    s.getState().load(createKzh("pavilion"));
    expect(s.getState().calculatedObjects).toEqual([]);
    expect(s.getState().calculatorOpen).toBe(false);
  });
  it("CSV отражает только выбранные объекты, не подменяет неизвестное нулём и экранирует формулы", () => {
    const p = createKzh("canopy");
    const o = modelObjects(p).find((o) => o.root.mark === "Фм2")!;
    const csv = calculationCSV(p, [o.id]);
    expect(csv).toContain('"Щебень";"м³";"";"1"');
    expect(csv).toContain(o.id);
    expect(csv).not.toContain('"Фм4 · оси 8/А"');
    o.root.material = "=SUM(1,2)";
    expect(calculationCSV(p, [o.id])).toContain('"\'=SUM(1,2)"');
  });
});
