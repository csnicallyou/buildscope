import { footprintPolygons } from "./footprints";
import { elementQuantities, type Element, type Project } from "./model";
import { modelObjects, sceneItems, type SceneItem } from "./objects";
import { formBoards } from "./installation";
import { elementQuantityStatus, quantityStatuses } from "./quality";
import catalogue from "./data/work-catalogue.json";
export const proposedWorkTypes = [
  { id: "prep", label: "Устройство бетонной подготовки", unit: "м³" },
  { id: "concrete", label: "Бетонирование монолитной конструкции", unit: "м³" },
  { id: "gravel", label: "Устройство щебёночной подготовки", unit: "м³" },
  { id: "sand", label: "Устройство песчаной подготовки", unit: "м³" },
  { id: "forms", label: "Установка опалубки", unit: "м²" },
  { id: "strip", label: "Разборка опалубки", unit: "м²" },
  { id: "steel", label: "Армирование конструкции", unit: "т" },
  { id: "anchors", label: "Установка анкеров", unit: "шт." },
  { id: "install", label: "Монтаж сборной конструкции", unit: "шт." },
  { id: "film", label: "Укладка разделительной плёнки", unit: "м²" },
  { id: "care", label: "Уход за бетоном", unit: "м²" },
  { id: "other", label: "Другая работа", unit: "чел.-ч" },
] as const;
type ModelWorkId = (typeof proposedWorkTypes)[number]["id"];
export type WorkId = ModelWorkId | `excel:${number}`;
export const sourceWorkTypes = catalogue.map((w) => ({
  ...w,
  id: w.id as WorkId,
}));
export const workTypes = [...sourceWorkTypes, ...proposedWorkTypes];
// Only these operations have an unambiguous body/material match in this model.
// Other source names retain their original unit and require a manual plan.
const sourceRules: Record<string, ModelWorkId> = {
  "Бетонирование подбетонного основания": "prep",
  "Устройство подстилающего слоя из песка с уплотнением": "sand",
  "Устройство подстилающего слоя из щебня с уплотнением": "gravel",
};
export const operationKey = (id: WorkId): WorkId => {
  const source = sourceWorkTypes.find((w) => w.id === id);
  return source && source.unit === "м3"
    ? (sourceRules[source.label] ?? id)
    : id;
};
export type WorkTarget = {
  id: string;
  label: string;
  elements: Element[];
  item?: SceneItem;
};
export function workTargets(p: Project, opened: string | null): WorkTarget[] {
  return [
    ...modelObjects(p).map((o) => ({
      id: `object:${o.id}`,
      label: `Объект · ${o.root.name}`,
      elements: o.members,
    })),
    ...(opened
      ? sceneItems(p, opened).map((item) => ({
          id: `part:${item.id}`,
          label: `Часть · ${item.kind === "steel" ? item.label : item.element.name}`,
          elements: [item.element],
          item,
        }))
      : []),
  ];
}
const known = (e: Element) =>
  !["diagram", "envelope"].includes(e.evidence?.representation ?? "");
const mono = (e: Element) =>
  /бетон/i.test(e.material) && /Фм|монолит/i.test(e.name + " " + e.category);
const prep = (e: Element) =>
  /бетон/i.test(e.material) && /подготовка|подбет/i.test(e.name);
export function workElements(t: WorkTarget, kind: WorkId) {
  if (t.item?.kind === "steel")
    return kind === "anchors" || kind === "steel" || kind === "other"
      ? t.elements
      : [];
  return t.elements.filter((e) =>
    kind === "prep"
      ? prep(e)
      : kind === "concrete"
        ? mono(e) && !prep(e)
        : kind === "gravel"
          ? /щеб/i.test(e.material)
          : kind === "sand"
            ? /песок/i.test(e.material)
            : ["forms", "strip"].includes(kind)
              ? mono(e) || prep(e)
              : kind === "steel" || kind === "anchors"
                ? !!e.evidence?.bars?.length ||
                  !!e.evidence?.reinforcement?.length
                : kind === "install"
                  ? /бетон/i.test(e.material) && !mono(e) && !prep(e)
                  : true,
  );
}
export function footprintArea(e: Element) {
  const polys = footprintPolygons(e);
  if (!polys.length) return null;
  return polys.reduce(
    (a, poly) =>
      a +
      poly.reduce(
        (sum, ring, i) =>
          sum +
          ((i ? -1 : 1) *
            Math.abs(
              ring.reduce((v, p, j) => {
                const q = ring[(j + 1) % ring.length];
                return v + p[0] * q[1] - q[0] * p[1];
              }, 0),
            )) /
            2,
        0,
      ),
    0,
  );
}
export function workReference(
  t: WorkTarget,
  id: WorkId,
): {
  elements: Element[];
  value: number | null;
  basis: string;
  unit: string;
} {
  if (id.startsWith("excel:")) {
    const type = sourceWorkTypes.find((w) => w.id === id)!;
    const rule = sourceRules[type.label];
    if (rule && type.unit === "м3") {
      const ref = workReference(t, rule);
      return {
        ...ref,
        unit: type.unit,
        basis: `Работа из Excel, ОБЪЕМ H/J; ${ref.basis}`,
      };
    }
    return {
      elements: t.elements,
      value: null,
      unit: type.unit,
      basis:
        "Работа и единица из Excel, ОБЪЕМ H/J. Расчёт для этой операции не настроен; план введите вручную.",
    };
  }
  const es = workElements(t, id);
  let value: number | null = null,
    basis = "Объём работы вводится вручную";
  const unit = workTypes.find((w) => w.id === id)!.unit;
  if (!es.length)
    return {
      elements: es,
      value,
      basis: "Работа не соответствует выбранной части",
      unit,
    };
  if (["prep", "concrete", "gravel", "sand"].includes(id)) {
    if (es.every(known)) {
      value = es.reduce((v, e) => v + elementQuantities(e).volume, 0);
      basis =
        "Геометрия выбранных тел; " +
        [
          ...new Set(
            es.map((e) => quantityStatuses[elementQuantityStatus(e)].label),
          ),
        ].join(", ");
    } else basis = "Контур не определён: количество не вычислено";
  }
  if (id === "steel") {
    if (t.item?.kind === "steel")
      basis = "Выбрана группа схемы: масса всей конструкции не подставляется";
    else {
      const specs = es.flatMap((e) => e.evidence?.reinforcement ?? []);
      if (specs.length && specs.every((s) => s.totalMass !== null)) {
        value = specs.reduce((v, s) => v + s.totalMass!, 0) / 1000;
        basis = "Полная спецификация арматуры выбранных конструкций";
      } else basis = "Масса арматуры по спецификации не определена полностью";
    }
  }
  if (id === "anchors") {
    const bars =
      t.item?.kind === "steel"
        ? (t.item.bars ?? [])
        : es.flatMap((e) => e.evidence?.bars ?? []);
    const anchors = bars.filter((b) => /анкер|M24/i.test(b.label));
    if (anchors.length) {
      value = anchors.length;
      basis = "Количество анкеров в показанной схеме";
    } else basis = "Выбранная схема не содержит анкеров";
  }
  if (id === "install") {
    value = es.length;
    basis = "Количество выбранных сборных элементов";
  }
  if (["forms", "strip"].includes(id)) {
    const boards = es.map(formBoards);
    if (boards.every((b) => b.length)) {
      value = boards.flat().reduce((v, b) => v + b.size[0] * b.size[1], 0);
      basis =
        "Условная площадь контакта опалубки по контуру модели; уточнить по ППР";
    }
  }
  if (id === "film" || id === "care") {
    basis =
      "Требуется площадь по технологии работ; площадь следа модели не учитывает нахлёсты и выпуски";
  }
  return { elements: es, value, basis, unit };
}
export type WorkRow = {
  id: string;
  date: string;
  site: string;
  shift: string;
  contractor: string;
  zone: string;
  axes: string;
  workId: WorkId;
  work: string;
  plan: number | null;
  unit: string;
  actual: number | null;
  equipment: string;
  brand: string;
  plate: string;
  note: string;
  target: string;
  elementIds: string[];
  project: string;
  basis: string;
  modelPlan: number | null;
  modelNeed?: { value: number | null; unit: string; basis: string } | null;
  completed?: boolean;
  quantityElementIds?: string[];
};
export function workMaterialNeed(target: WorkTarget, id: WorkId) {
  const type = workTypes.find((w) => w.id === id)!;
  const key = operationKey(id);
  const rule = [
    "prep",
    "concrete",
    "sand",
    "gravel",
    "steel",
    "anchors",
    "install",
  ].includes(key)
    ? key
    : /^Бетонирование\s/i.test(type.label)
      ? "concrete"
      : null;
  if (!rule) return null;
  const ref = workReference(target, rule as WorkId);
  return ref.elements.length
    ? {
        value: ref.value,
        unit: ref.unit,
        basis: `Справочная потребность выбранных тел, без запаса и потерь. ${ref.basis}`,
      }
    : null;
}
export function workQuantityElementIds(target: WorkTarget, id: WorkId) {
  const type = workTypes.find((w) => w.id === id)!;
  const key = operationKey(id);
  const rule = [
    "prep",
    "concrete",
    "sand",
    "gravel",
    "steel",
    "anchors",
    "install",
  ].includes(key)
    ? key
    : /^Бетонирование\s/i.test(type.label)
      ? "concrete"
      : null;
  return rule
    ? workReference(target, rule as WorkId).elements.map((e) => e.id)
    : target.elements.map((e) => e.id);
}
export type CrewRow = {
  id: string;
  date: string;
  site: string;
  contractor: string;
  shift: string;
  name: string;
  start: string;
  end: string;
  breakMinutes: number;
  note: string;
};
export type WorkDraft = {
  brigade: string;
  date: string;
  site: string;
  shift: string;
  contractor: string;
  zone: string;
  rows: WorkRow[];
  crew: CrewRow[];
};
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const initialWorkDraft = (): WorkDraft => ({
  brigade: "Наша бригада",
  date: today(),
  site: "Маленковская",
  shift: "День",
  contractor: "",
  zone: "",
  rows: [],
  crew: [],
});
export function addWork(
  draft: WorkDraft,
  target: WorkTarget,
  kind: WorkId,
  p: Project,
): WorkRow | null {
  const ref = workReference(target, kind);
  if (!ref.elements.length) return null;
  const ids = ref.elements.map((e) => e.id);
  if (
    draft.rows.some(
      (r) =>
        operationKey(r.workId) === operationKey(kind) &&
        (kind !== "other" || r.work === "Другая работа") &&
        r.date === draft.date &&
        r.shift === draft.shift &&
        r.elementIds.some((id) => ids.includes(id)),
    )
  )
    return null;
  const type = workTypes.find((t) => t.id === kind)!;
  return {
    id: crypto.randomUUID(),
    date: draft.date,
    site: draft.site,
    shift: draft.shift,
    contractor: draft.contractor,
    zone: draft.zone || p.document?.assembly || p.name,
    axes: [
      ...new Set(
        ref.elements.flatMap(
          (e) => e.name.match(/(?:оси|·)\s*([\d–−-]+\/[А-Я–−-]+)$/)?.[1] ?? [],
        ),
      ),
    ].join("; "),
    workId: kind,
    work: type.label,
    plan: ref.value,
    actual: null,
    unit: type.unit,
    equipment: "",
    brand: "",
    plate: "",
    note: "",
    target: target.label,
    elementIds: ids,
    project: p.name,
    basis: ref.basis,
    modelPlan: ref.value,
    modelNeed: workMaterialNeed(target, kind),
    completed: false,
    quantityElementIds: workQuantityElementIds(target, kind),
  };
}
export function crewHours(r: CrewRow): number | null {
  if (!r.start || !r.end) return null;
  const minutes = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const a = minutes(r.start),
    b = minutes(r.end);
  return (((b - a + 1440) % 1440) - r.breakMinutes) / 60;
}
export function reportErrors(d: WorkDraft) {
  const errors: string[] = [];
  if (!d.rows.length) errors.push("Добавьте хотя бы одну работу");
  d.rows.forEach((r, i) => {
    if (!r.date || !r.work.trim() || !r.site.trim() || !r.unit.trim())
      errors.push(`Строка ${i + 1}: заполните дату, объект, работу и единицу`);
    if (
      [r.plan, r.actual].some(
        (v) => v !== null && (!Number.isFinite(v) || v < 0),
      )
    )
      errors.push(`Строка ${i + 1}: количество должно быть неотрицательным`);
  });
  d.crew.forEach((r, i) => {
    const h = crewHours(r);
    if (!r.name.trim() || !r.date)
      errors.push(`Табель ${i + 1}: заполните ФИО и дату`);
    if ((h !== null && h < 0) || r.breakMinutes < 0)
      errors.push(`Табель ${i + 1}: перерыв превышает продолжительность смены`);
    if (!!r.start !== !!r.end)
      errors.push(`Табель ${i + 1}: укажите начало и конец смены`);
  });
  return errors;
}
