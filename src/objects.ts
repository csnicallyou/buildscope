import {
  elementBounds,
  elementQuantities,
  type Element,
  type Project,
  type Vec3,
} from "./model";
import type { Bar } from "./engineering";

export type ModelObject = { id: string; root: Element; members: Element[] };
export type SceneItem = {
  id: string;
  element: Element;
  label: string;
  kind: "body" | "steel";
  bars?: Bar[];
  layer: number;
};
export type MaterialAmount = {
  name: string;
  unit: "м³" | "кг" | "шт.";
  value: number;
  unknown: number;
  basis: string;
};
export const hasObjects = (p: Project) =>
  !!p.document &&
  p.document.assembly !== "Каталог гнутых деталей" &&
  p.elements.some((e) => e.category !== "Гнутые детали");

export function modelObjects(project: Project): ModelObject[] {
  const byId = new Map(project.elements.map((e) => [e.id, e]));
  const groups = new Map<string, ModelObject>();
  for (const e of project.elements) {
    let root = e;
    const visited = new Set<string>();
    while (root.parentId && byId.has(root.parentId) && !visited.has(root.id)) {
      visited.add(root.id);
      root = byId.get(root.parentId)!;
    }
    if (!groups.has(root.id))
      groups.set(root.id, { id: root.id, root, members: [] });
    groups.get(root.id)!.members.push(e);
  }
  return [...groups.values()];
}

export function objectFor(project: Project, id: string) {
  return modelObjects(project).find((o) => o.members.some((e) => e.id === id));
}

export function objectItems(object: ModelObject): SceneItem[] {
  const items: SceneItem[] = [];
  for (const e of [...object.members].sort(
    (a, b) => a.position[1] - b.position[1],
  )) {
    items.push({
      id: e.id,
      element: e,
      label: e.name,
      kind: "body",
      layer: items.length,
    });
    const groups = new Map<string, Bar[]>();
    for (const bar of e.evidence?.bars ?? []) {
      const label = bar.label.startsWith("Анкер")
        ? "Анкеры M24 · схема"
        : bar.label;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(bar);
    }
    for (const [label, bars] of groups)
      items.push({
        id: `${e.id}::steel:${items.length}`,
        element: e,
        label,
        kind: "steel",
        bars,
        layer: items.length,
      });
  }
  return items;
}

export function sceneItems(
  project: Project,
  opened: string | null,
): SceneItem[] {
  const object = opened
    ? modelObjects(project).find((o) => o.id === opened)
    : null;
  return object
    ? objectItems(object)
    : project.elements.map((e) => ({
        id: e.id,
        element: e,
        label: e.name,
        kind: "body",
        layer: 0,
      }));
}

export function itemBounds(item: SceneItem): { min: Vec3; max: Vec3 } {
  if (!item.bars?.length) return elementBounds(item.element);
  const points = item.bars.flatMap((b) =>
    b.points.flatMap((p) =>
      [-1, 1].map((s) => p.map((v) => v + (s * b.diameter) / 2)),
    ),
  );
  return {
    min: [0, 1, 2].map((a) => Math.min(...points.map((p) => p[a]))) as Vec3,
    max: [0, 1, 2].map((a) => Math.max(...points.map((p) => p[a]))) as Vec3,
  };
}

export function visibleItems(
  project: Project,
  opened: string | null,
  hidden: string[],
  isolated: string | null,
) {
  const objects = modelObjects(project);
  return sceneItems(project, opened).filter((item) => {
    const rootId = !opened
      ? objects.find((o) => o.members.some((e) => e.id === item.element.id))?.id
      : item.id;
    return (
      !hidden.includes(item.id) &&
      !hidden.includes(rootId ?? item.id) &&
      (!isolated || item.id === isolated || rootId === isolated)
    );
  });
}

// Source steel mass is kept separate from the illustrative bar geometry.
// Concrete volumes are gross body volumes; steel is not subtracted from them.
export function materialAmounts(
  elements: Element[],
  includeRebar = true,
): MaterialAmount[] {
  const rows = new Map<string, MaterialAmount>();
  const add = (
    name: string,
    unit: MaterialAmount["unit"],
    value: number | null,
    basis: string,
  ) => {
    const key = `${name}:${unit}:${basis}`;
    const row = rows.get(key) ?? { name, unit, value: 0, unknown: 0, basis };
    if (value === null) row.unknown++;
    else row.value += value;
    rows.set(key, row);
  };
  for (const e of elements) {
    const excluded = ["envelope", "diagram"].includes(
      e.evidence?.representation ?? "",
    );
    add(
      e.material,
      "м³",
      excluded ? null : elementQuantities(e).volume,
      excluded
        ? "Контур / тело не определены"
        : e.material === "Щебень" && e.confidence === "assumed"
          ? "Расчёт по разрезу · одинаковые откосы со всех сторон"
          : e.evidence?.representation === "nominal"
            ? "Номинальная геометрия"
            : "Геометрия",
    );
    for (const r of includeRebar ? (e.evidence?.reinforcement ?? []) : [])
      add(
        `Сталь ${r.grade}`,
        "кг",
        r.totalMass,
        "Спецификация на выбранные элементы",
      );
    const anchors =
      e.evidence?.bars?.filter((b) => b.label.startsWith("Анкер")) ?? [];
    if (includeRebar && anchors.length)
      add(
        "Анкеры M24",
        "шт.",
        anchors.length,
        "Количество в схеме; масса не задана",
      );
  }
  return [...rows.values()];
}

export function steelSchemeAmount(bars: Bar[]) {
  let volume = 0,
    length = 0;
  for (const b of bars) {
    const l = b.points
      .slice(1)
      .reduce(
        (s, p, i) => s + Math.hypot(...p.map((v, a) => v - b.points[i][a])),
        0,
      );
    length += l;
    volume += ((Math.PI * b.diameter ** 2) / 4) * l;
  }
  return { volume, length, count: bars.length };
}
