import { describe, it, expect } from "vitest";
import {
  initialWorkDraft,
  addWork,
  workTargets,
  workMaterialNeed,
  sourceWorkTypes,
} from "./workOrders";
import { createKzh } from "./kzh";
import { modelObjects } from "./objects";
import {
  issueWorkOrder,
  submitWorkOrder,
  parseWorkOrders,
  serializeWorkOrders,
  handoffErrors,
} from "./workOrderArchive";
const project = createKzh("canopy");
const object = modelObjects(project).find((o) => o.root.mark === "Фм4")!;
const target = workTargets(project, null).find(
  (t) => t.id === `object:${object.id}`,
)!;
function draft() {
  const d = initialWorkDraft();
  d.rows.push(addWork(d, target, "concrete", project)!);
  return d;
}
describe("Наряды по дням и сменам", () => {
  it("потребность бетонирования ФП известна отдельно от ручного плана и факта", () => {
    const type = sourceWorkTypes.find((t) => t.label === "Бетонирование ФП")!;
    const row = addWork(initialWorkDraft(), target, type.id, project)!;
    expect(row.plan).toBeNull();
    expect(row.actual).toBeNull();
    expect(row.modelNeed!.value).toBeCloseTo(3.655125);
    expect(workMaterialNeed(target, type.id)!.basis).toContain("без запаса");
  });
  it("выдача сохраняет снимок, бригаду и дату начала ночной смены без фиктивного факта", () => {
    const d = draft();
    d.shift = "Ночь";
    d.brigade = "Бригада 1";
    d.crew.push({
      id: "person",
      date: d.date,
      site: d.site,
      contractor: "",
      shift: "Ночь",
      name: "Сотрудник",
      start: "20:00",
      end: "08:00",
      breakMinutes: 60,
      note: "",
    });
    d.rows = d.rows.map((r) => ({
      ...r,
      shift: "Ночь",
      actual: 99,
      completed: true,
    }));
    const order = issueWorkOrder(d);
    expect(order.draft.rows[0].actual).toBeNull();
    expect(order.draft.rows[0].completed).toBe(false);
    expect(order.draft.shift).toBe("Ночь");
    expect(order.draft.date).toBe(d.date);
    expect(order.draft.brigade).toBe("Бригада 1");
    expect(order.draft.crew[0].start).toBe("");
    expect(order.draft.crew[0].end).toBe("");
    d.rows[0].plan = 100;
    expect(order.draft.rows[0].plan).not.toBe(100);
  });
  it("при сдаче выполненная строка требует факта, реальный ноль и неполное выполнение сохраняются", () => {
    const order = issueWorkOrder(draft());
    order.draft.rows[0].completed = true;
    expect(handoffErrors(order)).toHaveLength(1);
    expect(() => submitWorkOrder(order)).toThrow();
    order.draft.rows[0].actual = 0;
    const submitted = submitWorkOrder(order);
    expect(submitted.submittedAt).not.toBeNull();
    const read = parseWorkOrders(serializeWorkOrders([submitted]))[0];
    expect(read.draft.rows[0].actual).toBe(0);
    expect(read.draft.rows[0].completed).toBe(true);
  });
  it("одинаковая дата не смешивает дневные, ночные наряды и разные бригады", () => {
    const day = issueWorkOrder(draft()),
      nightDraft = draft();
    nightDraft.shift = "Ночь";
    nightDraft.rows[0].shift = "Ночь";
    nightDraft.brigade = "Другая бригада";
    const night = issueWorkOrder(nightDraft);
    const read = parseWorkOrders(serializeWorkOrders([day, night]));
    expect(read).toHaveLength(2);
    expect(read[0].id).not.toBe(read[1].id);
    expect(read.map((o) => o.draft.shift)).toEqual(["День", "Ночь"]);
    expect(read[1].draft.brigade).toBe("Другая бригада");
  });
  it("повреждённое хранилище, чужая версия и отрицательные количества не принимаются", () => {
    expect(parseWorkOrders(null)).toEqual([]);
    expect(() => parseWorkOrders("{bad")).toThrow();
    expect(() => parseWorkOrders('{"version":2,"orders":[]}')).toThrow();
    const order = issueWorkOrder(draft());
    order.draft.rows[0].actual = -1;
    expect(() => serializeWorkOrders([order])).toThrow();
  });
});
