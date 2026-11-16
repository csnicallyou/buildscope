import type { Project } from "./model";
import { materialAmounts, modelObjects, type MaterialAmount } from "./objects";

// Canonical roots and unique member IDs prevent selecting a preparation and
// its foundation from counting the same material twice.
export function calculateSelection(project: Project, selectedIds: string[]) {
  const selected = new Set(selectedIds);
  const objects = modelObjects(project).filter((o) =>
    o.members.some((e) => selected.has(e.id)),
  );
  const elements = [
    ...new Map(
      objects.flatMap((o) => o.members).map((e) => [e.id, e]),
    ).values(),
  ];
  const rows = new Map<string, MaterialAmount & { bases: Set<string> }>();
  for (const r of materialAmounts(elements)) {
    const key = `${r.name}:${r.unit}`;
    const row = rows.get(key) ?? {
      ...r,
      value: 0,
      unknown: 0,
      bases: new Set<string>(),
    };
    row.value += r.value;
    row.unknown += r.unknown;
    row.bases.add(r.basis);
    rows.set(key, row);
  }
  const materials = [...rows.values()].map(({ bases, ...row }) => ({
    ...row,
    basis: [...bases].join("; "),
  }));
  const assumptions = elements.filter((e) => e.confidence === "assumed").length;
  return { objects, elements, materials, assumptions };
}
export type Calculation = ReturnType<typeof calculateSelection>;

export function calculationCSV(project: Project, selectedIds: string[]) {
  const c = calculateSelection(project, selectedIds);
  const cell = (value: unknown) =>
    `"${String(value)
      .replace(/"/g, '""')
      .replace(/^[=+@-]/, "'$&")}"`;
  const rows: unknown[][] = [
    ["Проект", project.name],
    ["Выбрано объектов", c.objects.length],
    ["Тел и слоёв", c.elements.length],
    [
      "Материал",
      "Ед.",
      "Известное количество",
      "Неопределённых позиций",
      "Основание",
    ],
    ...c.materials.map((r) => [
      r.name,
      r.unit,
      r.value || !r.unknown ? r.value : "",
      r.unknown,
      r.basis,
    ]),
    [],
    ["Включённые объекты", "ID", "Тел и слоёв"],
    ...c.objects.map((o) => [o.root.name, o.id, o.members.length]),
    [],
    [
      "Примечание",
      "Каждый объект учтён целиком; скрытие/разборка не меняет выбор. Геометрия и сталь по спецификации разделены. Неопределённое не считается нулём. Объёмы бетона без вычета арматуры. Общие работы/связи PDF без привязки к объектам в расчёт не включены.",
    ],
    [
      "Принятые условия",
      ...c.elements
        .filter((e) => e.confidence === "assumed")
        .map((e) => `${e.name}: ${e.evidence?.notes.join(" ") ?? e.source}`),
    ],
  ];
  return "\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n");
}
