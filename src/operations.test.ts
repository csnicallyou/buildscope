import { describe, expect, it } from "vitest";
import { initialWorkDraft } from "./workOrders";
import {
  matchesSignal,
  orderSignals,
  shiftCaption,
  shiftSummary,
} from "./operations";
import type { SavedWorkOrder } from "./workOrderArchive";
import { payloadSchema } from "./construction";

const order = (): SavedWorkOrder => ({
  id: "test-order",
  createdAt: "2026-11-16T18:00:00Z",
  submittedAt: null,
  draft: {
    ...initialWorkDraft(),
    contractor: "Тестовый подрядчик",
    date: "2026-11-16",
    shift: "Ночь",
    crew: [],
  },
});
describe("Оперативный контроль", () => {
  it("не превращает отсутствие табеля в подтверждённый невыход или нулевой факт", () => {
    const o = order();
    expect(orderSignals(o, []).attendance).toBe(true);
    expect(matchesSignal(o, [], "reports")).toBe(true);
    expect(shiftSummary([o], [])).toContain("нет списка");
    expect(shiftSummary([o], [])).not.toContain("невыход");
    expect(shiftSummary([o], [])).not.toContain("объёмы проверены");
  });
  it("не считает сданный наряд принятым без серверной приёмки", () => {
    const o = { ...order(), submittedAt: "2026-11-17T05:00:00Z" };
    expect(orderSignals(o, []).accepted).toBe(false);
    expect(matchesSignal(o, [], "review")).toBe(true);
    expect(matchesSignal(o, [], "reports")).toBe(false);
  });
  it("ночная смена показывает две даты даже при переходе года, без выдуманного расписания", () => {
    const label = shiftCaption("2026-12-31", "Ночь");
    expect(label).toContain("31");
    expect(label).toContain("1");
    expect(label).toContain("→");
    expect(label).not.toContain("20:00");
  });
  it("старые объекты читаются без координат, новые координаты проверяются на границах", () => {
    const node = {
      kind: "node",
      title: "Тестовый объект",
      level: "site",
      parentId: null,
      model: "",
      elementIds: [],
      description: "",
    };
    expect(payloadSchema.safeParse(node).success).toBe(true);
    expect(
      payloadSchema.safeParse({ ...node, location: { lat: 55, lng: 37 } })
        .success,
    ).toBe(true);
    expect(
      payloadSchema.safeParse({ ...node, location: { lat: 91, lng: 37 } })
        .success,
    ).toBe(false);
  });
});
