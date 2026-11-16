import { describe, expect, it } from "vitest";
import { createKzh } from "./kzh";
import { modelObjects, visibleItems, materialAmounts } from "./objects";
import { calculateSelection } from "./calculator";
import { useStore } from "./store";
import { elementQuantityStatus } from "./quality";

describe("Группа выбора и основания количеств", () => {
  it("показ выбранной группы раскрывает все её тела, а возврат восстанавливает прежнее скрытие/изоляцию", () => {
    const p = createKzh("canopy"),
      original = JSON.stringify(p);
    const [a, b] = modelObjects(p).filter((o) => o.root.mark === "Фм4");
    const s = useStore;
    s.getState().load(p);
    s.getState().setMultipleSelection(true);
    s.getState().select(a.id);
    s.getState().select(b.id);
    s.getState().set({ hidden: [a.id], isolated: b.id });
    const total = calculateSelection(
      p,
      s.getState().calculatedObjects,
    ).materials;
    s.getState().toggleOnlySelected();
    expect(s.getState().hidden).toEqual([]);
    expect(s.getState().isolated).toBeNull();
    expect(
      visibleItems(p, null, [], null, s.getState().calculatedObjects),
    ).toHaveLength(6);
    s.getState().toggleOnlySelected();
    expect(s.getState().hidden).toEqual([a.id]);
    expect(s.getState().isolated).toBe(b.id);
    expect(
      calculateSelection(p, s.getState().calculatedObjects).materials,
    ).toEqual(total);
    expect(JSON.stringify(p)).toBe(original);
  });
  it("удаление последнего объекта и очистка возвращают общий вид", () => {
    const p = createKzh("canopy");
    const a = modelObjects(p).find((o) => o.root.mark === "Фм4")!;
    const s = useStore;
    s.getState().load(p);
    s.getState().setMultipleSelection(true);
    s.getState().select(a.id);
    s.getState().toggleOnlySelected();
    s.getState().select(a.id);
    expect(s.getState().onlySelected).toBe(false);
    s.getState().select(a.id);
    s.getState().toggleOnlySelected();
    s.getState().clearSelection();
    expect(s.getState().onlySelected).toBe(false);
    expect(s.getState().groupVisibility).toBeNull();
    expect(s.getState().calculatedObjects).toEqual([]);
  });
  it("статусы различают размеры, номинальные изделия, допущения, ведомости, схемы и отсутствие данных", () => {
    const p = createKzh("canopy");
    const objects = modelObjects(p);
    const a = objects.find((o) => o.root.mark === "Фм4")!;
    expect(elementQuantityStatus(a.root)).toBe("dimensioned");
    expect(elementQuantityStatus(a.members.find((e) => e.mark === "ЩП")!)).toBe(
      "assumed",
    );
    const fl = objects.find((o) => o.root.mark === "ФЛ1")!;
    expect(elementQuantityStatus(fl.root)).toBe("nominal");
    expect(
      elementQuantityStatus(fl.members.find((e) => e.mark === "ПП")!),
    ).toBe("unknown");
    const rows = materialAmounts(a.members);
    expect(rows.find((r) => r.name === "Сталь A500C")!.statuses).toEqual([
      "source",
    ]);
    expect(rows.find((r) => r.name === "Анкеры M24")!.statuses).toEqual([
      "scheme",
    ]);
    const fm2 = objects.find((o) => o.root.mark === "Фм2")!;
    const gravel = calculateSelection(p, [a.id, fm2.id]).materials.find(
      (r) => r.name === "Щебень",
    )!;
    expect(gravel.statuses).toEqual(
      expect.arrayContaining(["assumed", "unknown"]),
    );
    expect(gravel.value).toBeCloseTo(3.37575);
    expect(gravel.unknown).toBe(1);
  });
});
