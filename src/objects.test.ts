import { describe, expect, it } from "vitest";
import { createKzh } from "./kzh";
import { parseProject } from "./model";
import {
  hasObjects,
  modelObjects,
  objectFor,
  objectItems,
  materialAmounts,
  visibleItems,
  steelSchemeAmount,
} from "./objects";
import { createKzhDetails } from "./details";
import { useStore } from "./store";

describe("Объект и его части", () => {
  it("каждый элемент входит ровно в один объект, связи переживают JSON", () => {
    for (const assembly of ["pavilion", "canopy"] as const) {
      const p = parseProject(JSON.stringify(createKzh(assembly)));
      const objects = modelObjects(p);
      expect(objects).toHaveLength(assembly === "pavilion" ? 141 : 169);
      const ids = objects.flatMap((o) => o.members.map((e) => e.id));
      expect(ids).toHaveLength(p.elements.length);
      expect(new Set(ids).size).toBe(ids.length);
      const sand = p.elements.find((e) => e.mark === "ПП")!;
      expect(objectFor(p, sand.id)?.root.category).toBe("ФЛ");
    }
    expect(hasObjects(createKzhDetails())).toBe(false);
  });
  it("Фм1 содержит бетон, подготовку, арматуру и анкеры без двойного счёта", () => {
    const p = createKzh("canopy");
    const o = modelObjects(p).find((o) => o.root.mark === "Фм1")!;
    expect(o.members).toHaveLength(3);
    const rows = materialAmounts(o.members);
    expect(rows.find((r) => r.name === "Бетон B25 W8 F150")?.value).toBeCloseTo(
      2.592,
    );
    expect(rows.find((r) => r.name === "Бетон B7.5")?.value).toBeCloseTo(0.676);
    expect(rows.find((r) => r.name === "Сталь A500C")?.value).toBeCloseTo(
      339.4,
    );
    expect(rows.find((r) => r.name === "Анкеры M24")?.value).toBe(8);
    expect(rows.find((r) => r.name === "Щебень")?.unknown).toBe(1);
    expect(materialAmounts([o.root], false)).toHaveLength(1);
    expect(objectItems(o).filter((i) => i.kind === "steel")).toHaveLength(2);
  });
  it("схемные объёмы не подменяют ведомость; неизвестная масса остаётся неизвестной", () => {
    const p = createKzh("canopy");
    const o = modelObjects(p).find((o) => o.root.mark === "Фм2")!;
    const item = objectItems(o).find((i) => i.kind === "steel")!;
    const q = steelSchemeAmount(item.bars!);
    expect(q.count).toBeGreaterThan(20);
    expect(q.volume).toBeGreaterThan(0);
    expect(q.length).toBeGreaterThan(0);
    const copy = structuredClone(o.root);
    copy.evidence!.reinforcement![0].totalMass = null;
    expect(
      materialAmounts([copy]).find((r) => r.name === "Сталь A500C")?.unknown,
    ).toBe(1);
  });
  it("выбор подготовки снаружи выбирает весь Фм, внутри — только часть; возврат не меняет проект", () => {
    const p = createKzh("canopy");
    const original = JSON.stringify(p);
    const o = modelObjects(p).find((o) => o.root.mark === "Фм1")!;
    const prep = o.members.find((e) => e.mark === "БП")!;
    const s = useStore;
    s.getState().load(p);
    s.getState().select(prep.id);
    expect(s.getState().selected).toBe(o.id);
    expect(visibleItems(p, null, [o.id], null)).toHaveLength(
      p.elements.length - 3,
    );
    expect(visibleItems(p, null, [], o.id)).toHaveLength(3);
    s.getState().openObject(o.id);
    s.getState().select(prep.id);
    expect(s.getState().selected).toBe(prep.id);
    expect(visibleItems(p, o.id, [], null)).toHaveLength(5);
    s.getState().set({ exploded: true, offsets: { [prep.id]: [5, 4, 3] } });
    s.getState().openObject(null);
    expect(s.getState().selected).toBe(o.id);
    expect(s.getState().exploded).toBe(false);
    expect(s.getState().offsets).toEqual({});
    expect(JSON.stringify(p)).toBe(original);
  });
});
