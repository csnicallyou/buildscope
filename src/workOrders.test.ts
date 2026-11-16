import { describe, it, expect } from "vitest";
import { createKzh } from "./kzh";
import {
  workTargets,
  workReference,
  addWork,
  initialWorkDraft,
  crewHours,
  reportErrors,
  footprintArea,
  type CrewRow,
} from "./workOrders";
import { modelObjects, objectItems } from "./objects";
const project = createKzh("canopy"),
  object = modelObjects(project).find((o) => o.root.mark === "Фм1")!,
  target = workTargets(project, object.id).find(
    (t) => t.id === `object:${object.id}`,
  )!;
describe("Наряд из модели", () => {
  it("объект целиком разворачивается в подходящие части для конкретной работы", () => {
    expect(workReference(target, "prep").value).toBeCloseTo(0.676);
    expect(workReference(target, "concrete").value).toBeCloseTo(2.592);
    expect(workReference(target, "gravel").value).toBeCloseTo(2.532);
    expect(workReference(target, "concrete").elements).toHaveLength(1);
  });
  it("неопределённая огибающая и плёнка не становятся нулём или проектным расходом", () => {
    const fm2 = modelObjects(project).find((o) => o.root.mark === "Фм2")!;
    const t = workTargets(project, null).find(
      (t) => t.id === `object:${fm2.id}`,
    )!;
    expect(workReference(t, "gravel").value).toBeNull();
    expect(workReference(target, "film").value).toBeNull();
  });
  it("масса всей арматуры не подставляется в выбранную группу схемы", () => {
    const steel = objectItems(object).find((i) => i.kind === "steel")!;
    const t = {
      id: steel.id,
      label: steel.label,
      elements: [steel.element],
      item: steel,
    };
    expect(workReference(t, "steel").value).toBeNull();
    expect(workReference(target, "steel").value).toBeGreaterThan(0);
    expect(workReference(target, "anchors").value).toBe(8);
  });
  it("одна физическая часть не дублируется через целый объект, часть или альтернативный вариант отметок", () => {
    const d = initialWorkDraft(),
      row = addWork(d, target, "concrete", project)!;
    d.rows.push(row);
    const t = workTargets(project, object.id).find(
      (t) => t.id === `part:${object.id}`,
    )!;
    expect(addWork(d, t, "concrete", project)).toBeNull();
    expect(
      addWork(d, target, "concrete", {
        ...project,
        name: project.name + " другой вариант",
      }),
    ).toBeNull();
    d.date = "2026-11-17";
    expect(addWork(d, target, "concrete", project)).not.toBeNull();
  });
  it("реальный факт 0 сохраняется, отсутствие факта остаётся неизвестным", () => {
    const d = initialWorkDraft(),
      row = addWork(d, target, "prep", project)!;
    d.rows.push(row);
    expect(row.actual).toBeNull();
    row.actual = 0;
    expect(reportErrors(d)).toHaveLength(0);
    expect(row.actual).toBe(0);
    row.plan = -1;
    expect(reportErrors(d).length).toBeGreaterThan(0);
  });
  it("ночные часы учитывают полночь и перерыв", () => {
    const r: CrewRow = {
      id: "1",
      date: "2026-11-16",
      site: "Тест",
      contractor: "",
      shift: "Ночь",
      name: "Тестовый сотрудник",
      start: "20:00",
      end: "08:00",
      breakMinutes: 60,
      note: "",
    };
    expect(crewHours(r)).toBe(11);
    expect(crewHours({ ...r, start: "" })).toBeNull();
    expect(crewHours({ ...r, breakMinutes: 800 })).toBeLessThan(0);
  });
  it("площадь следа учитывает вырез, а не только габарит", () => {
    const e = project.elements.find((e) => e.mark === "Фм2")!;
    expect(footprintArea(e)).toBeCloseTo(elementArea(e));
    function elementArea(e: (typeof project.elements)[number]) {
      if (e.shape?.kind !== "extrusion") throw Error("shape");
      const p = e.shape.outline;
      return (
        Math.abs(
          p.reduce((s, a, i) => {
            const b = p[(i + 1) % p.length];
            return s + a[0] * b[1] - b[0] * a[1];
          }, 0),
        ) / 2
      );
    }
  });
});
