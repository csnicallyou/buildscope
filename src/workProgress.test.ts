import { describe, it, expect } from "vitest";
import { progressGroups, allocationErrors } from "./workProgress";
import { createKzh } from "./kzh";
import { modelObjects } from "./objects";
import { initialWorkDraft, workTargets, addWork } from "./workOrders";
import { issueWorkOrder } from "./workOrderArchive";
import type { SharedOrder } from "./workspaceTypes";
const p = createKzh("canopy"),
  o = modelObjects(p).find((o) => o.root.mark === "Фм1")!,
  t = workTargets(p, null).find((t) => t.id === `object:${o.id}`)!;
function entry(): SharedOrder {
  const d = initialWorkDraft();
  d.rows.push(addWork(d, t, "concrete", p)!);
  return {
    order: issueWorkOrder(d),
    revision: 1,
    stage: "submitted",
    updatedAt: "",
    updatedBy: "test",
  };
}
describe("Остатки и назначения", () => {
  it("проверенный ноль сохраняет заявленное значение и даёт независимый остаток", () => {
    const e = entry();
    e.order.draft.rows[0].actual = 1;
    e.order.draft.rows[0].verifiedActual = 0;
    const g = progressGroups([e])[0];
    expect(g.actual).toBe(1);
    expect(g.verified).toBe(0);
    expect(g.verifiedRemaining).toBeCloseTo(2.592);
    const next = entry().order;
    next.draft.rows[0].plan = 2.592;
    expect(allocationErrors(next, [e])).toEqual([]);
  });
  it("не смешивает проверенные количества разных единиц и не придумывает проверенный остаток", () => {
    const a = entry(),
      b = entry();
    a.order.draft.rows[0].actual = 1;
    a.order.draft.rows[0].verifiedActual = 1;
    b.order.draft.rows[0].unit = "т";
    b.order.draft.rows[0].verifiedActual = 0.5;
    const g = progressGroups([a, b])[0];
    expect(g.verified).toBeNull();
    expect(g.verifiedRemaining).toBeNull();
  });
  it("неизвестный сданный факт не превращается в ноль или известный остаток", () => {
    const e = entry(),
      g = progressGroups([e])[0];
    expect(g.actualIncomplete).toBe(true);
    expect(g.remaining).toBeNull();
    expect(allocationErrors(entry().order, [e])).not.toHaveLength(0);
  });
  it("частичная сдача освобождает только известный остаток, не весь объём", () => {
    const e = entry();
    e.order.draft.rows[0].actual = 1;
    expect(progressGroups([e])[0].remaining).toBeCloseTo(1.592);
    const next = entry().order;
    next.draft.rows[0].plan = 1.592;
    expect(allocationErrors(next, [e])).toEqual([]);
    next.draft.rows[0].plan = 2;
    expect(allocationErrors(next, [e])).not.toHaveLength(0);
  });
  it("разные размерности не складываются, изменённая потребность требует уточнения", () => {
    const a = entry(),
      b = entry();
    a.order.draft.rows[0].actual = 1;
    b.order.draft.rows[0].unit = "т";
    const g = progressGroups([a, b])[0];
    expect(g.conflict).toBe(true);
    expect(g.need).toBeNull();
    expect(g.remaining).toBeNull();
  });
});
