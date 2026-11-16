import pc, { type Polygon } from "polygon-clipping";
import {
  elementBounds,
  elementQuantities,
  type Element,
  type Vec3,
} from "./model";
import { itemBounds, type SceneItem, steelSchemeAmount } from "./objects";
export type WorkKind = "concrete" | "bulk" | "steel" | "placement";
export type Phase =
  | "layout"
  | "boards"
  | "reinforce"
  | "pour"
  | "level"
  | "wait"
  | "strip"
  | "spread"
  | "compact"
  | "place"
  | "ready";
export type WorkStep = {
  phase: Phase;
  title: string;
  description: string;
  duration: number;
};
export type FormBoard = {
  position: Vec3;
  size: Vec3;
  rotation: number;
  outward: Vec3;
};
export type InstallationPlan = {
  kind: WorkKind;
  steps: WorkStep[];
  duration: number;
  boards: FormBoard[];
  bounds: { min: Vec3; max: Vec3 };
  size: Vec3;
  volume: number | null;
  quantity: string;
  note: string;
};
const f = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
const step = (
  phase: Phase,
  title: string,
  description: string,
  duration = 3,
): WorkStep => ({ phase, title, description, duration });
// Form boards are teaching aids only. Their 25 mm thickness is not project data.
export const illustrativeBoardThickness = 0.025;
export function formBoards(e: Element): FormBoard[] {
  const layers: { bottom: number; top: number; polygons: Polygon[] }[] = [];
  if (e.shape?.kind === "extrusion" && e.shape.axis === "y")
    layers.push({
      bottom: -e.shape.depth / 2,
      top: e.shape.depth / 2,
      polygons: [[e.shape.outline]],
    });
  else if (!e.shape) {
    const ys = [
      ...new Set(
        e.parts.flatMap((p) => [
          p.offset[1] - p.size[1] / 2,
          p.offset[1] + p.size[1] / 2,
        ]),
      ),
    ].sort((a, b) => a - b);
    for (let i = 0; i < ys.length - 1; i++) {
      const mid = (ys[i] + ys[i + 1]) / 2;
      const polygons = e.parts
        .filter((p) => Math.abs(mid - p.offset[1]) < p.size[1] / 2)
        .map((p) => {
          const [x, , z] = p.offset,
            [w, , d] = p.size;
          return [
            [
              [x - w / 2, z - d / 2],
              [x + w / 2, z - d / 2],
              [x + w / 2, z + d / 2],
              [x - w / 2, z + d / 2],
            ],
          ] as Polygon;
        });
      if (polygons.length)
        layers.push({ bottom: ys[i], top: ys[i + 1], polygons });
    }
  }
  const boards: FormBoard[] = [];
  for (const layer of layers) {
    const union = pc.union(layer.polygons[0], ...layer.polygons.slice(1));
    for (const polygon of union)
      for (const ring of polygon) {
        // polygon-clipping outer rings are CCW; holes are CW. Right normal is outside the solid.
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i],
            b = ring[i + 1],
            dx = b[0] - a[0],
            dz = b[1] - a[1],
            length = Math.hypot(dx, dz);
          if (length < 1e-6) continue;
          const normal: Vec3 = [dz / length, 0, -dx / length],
            t = illustrativeBoardThickness;
          const maxLength = 1.5,
            n = Math.min(48, Math.ceil(length / maxLength));
          for (let j = 0; j < n; j++) {
            const u = (j + 0.5) / n;
            if (boards.length >= 768) return [];
            boards.push({
              position: [
                a[0] + dx * u + (normal[0] * t) / 2,
                (layer.bottom + layer.top) / 2,
                a[1] + dz * u + (normal[2] * t) / 2,
              ],
              size: [length / n, layer.top - layer.bottom, t],
              rotation: -Math.atan2(dz, dx),
              outward: normal,
            });
          }
        }
      }
  }
  return boards;
}
export function installationPlan(item: SceneItem): InstallationPlan | null {
  const e = item.element;
  if (["diagram", "envelope"].includes(e.evidence?.representation ?? ""))
    return null;
  const bounds = itemBounds(item),
    size = bounds.max.map((v, a) => v - bounds.min[a]) as Vec3;
  if (size.some((v) => v > 500 || !Number.isFinite(v))) return null;
  const kind: WorkKind =
    item.kind === "steel" || e.shape?.kind === "bar"
      ? "steel"
      : /щеб|песок|грунт/i.test(e.material)
        ? "bulk"
        : /бетон/i.test(e.material) &&
            /Фм|подбет|бетонная подготовка|монолит/i.test(
              e.name + " " + e.category + " " + e.mark,
            )
          ? "concrete"
          : "placement";
  const boards = kind === "concrete" ? formBoards(e) : [];
  // Never invent a rectangular form for an unsupported solid profile.
  if (kind === "concrete" && !boards.length) return null;
  const volume =
    item.kind === "steel"
      ? steelSchemeAmount(item.bars ?? []).volume
      : elementQuantities(e).volume;
  const quantity =
    item.kind === "steel"
      ? `${steelSchemeAmount(item.bars ?? []).count} стержней · ${f(steelSchemeAmount(item.bars ?? []).length)} м в схеме`
      : `${e.material} · ${f(volume)} м³ по модели`;
  const layout = step(
    "layout",
    "Контур и отметки",
    "Показаны размеры выбранной части в исходной модели. Привязка к соседним частям — по проектным координатам.",
    2.5,
  );
  let steps: WorkStep[];
  if (kind === "concrete")
    steps = [
      layout,
      step(
        "boards",
        "Установка досок",
        "Щиты по контуру показаны условными досками толщиной 25 мм. Высота соответствует телу; раскрой, крепёж и раскрепление не заданы.",
        4,
      ),
      ...(e.evidence?.bars?.length
        ? [
            step(
              "reinforce",
              "Установка арматуры",
              "Показанные в модели сетки и анкеры занимают свои проектные положения. Это схемное армирование, без полной деталировки фиксаторов.",
              4,
            ),
          ]
        : []),
      step(
        "pour",
        "Заполнение бетоном",
        "Уровень демонстрационной заливки поднимается до верха тела. Вырезы и профиль сохраняются; показан полный объём части, не объём смеси с запасом.",
        6,
      ),
      step(
        "level",
        "Выравнивание поверхности",
        "Показана проектная отметка верха. Приёмы укладки и ухода за бетоном этой анимацией не задаются.",
        2.5,
      ),
      step(
        "wait",
        "Технологическая пауза",
        "Условный переход времени. Продолжительность ухода и условия распалубки в модели не заданы; секунды проигрывателя не являются сроками работ.",
        2.5,
      ),
      step(
        "strip",
        "Снятие досок",
        "Условная распалубка после выполнения требований проекта и технологии. Доски — временные объекты демонстрации.",
        4,
      ),
      step(
        "ready",
        "Готовая часть",
        "Показано исходное тело выбранной части. Проектные размеры и расчётные количества сохранены.",
        2,
      ),
    ];
  else if (kind === "bulk")
    steps = [
      layout,
      step(
        "spread",
        "Отсыпка материала",
        "Материал заполняет восстановленный контур снизу вверх. Показан объём готового слоя; рыхлый объём и коэффициент уплотнения не заданы.",
        6,
      ),
      step(
        "compact",
        "Уплотнение слоя",
        "Показан условный проход уплотнения. Толщина исходного слоя и коэффициент уплотнения не выводятся из анимации.",
        4,
      ),
      step(
        "ready",
        "Готовый слой",
        "Геометрия соответствует модели с её статусом достоверности. Проектные отметки и количество материала не изменены.",
        2,
      ),
    ];
  else if (kind === "steel")
    steps = [
      layout,
      step(
        "place",
        "Установка стержней",
        "Стержни последовательно занимают положения из модели. Порядок установки и крепление условные; количество относится к показанной схеме.",
        7,
      ),
      step(
        "ready",
        "Арматура на месте",
        "Показана выбранная группа. Полная спецификация и схема армирования имеют разные области учёта.",
        2,
      ),
    ];
  else
    steps = [
      layout,
      step(
        "place",
        "Установка части",
        "Тело плавно опускается в положение из модели. Способ подъёма, строповка, крепёж и монтажные допуски не заданы.",
        6,
      ),
      step(
        "ready",
        "Часть на месте",
        "Показано проектное положение выбранного тела. Это схема размещения, а не технологическая карта монтажа.",
        2,
      ),
    ];
  return {
    kind,
    steps,
    duration: steps.reduce((v, s) => v + s.duration, 0),
    boards,
    bounds,
    size,
    volume,
    quantity,
    note:
      kind === "concrete"
        ? "Схема устройства · доски 25 мм условные · сроки не заданы"
        : "Схема устройства · порядок и технология условные",
  };
}
export function workFrame(plan: InstallationPlan, time: number) {
  const t = Math.max(0, Math.min(plan.duration, time));
  let start = 0,
    index = 0;
  for (; index < plan.steps.length - 1; index++) {
    if (t < start + plan.steps[index].duration) break;
    start += plan.steps[index].duration;
  }
  return {
    index,
    step: plan.steps[index],
    progress: Math.min(1, (t - start) / plan.steps[index].duration),
    ended: t >= plan.duration,
  };
}
export function stepStart(plan: InstallationPlan, index: number) {
  return plan.steps
    .slice(0, Math.max(0, index))
    .reduce((t, s) => t + s.duration, 0);
}
export const ease = (t: number) => {
  const v = Math.min(1, Math.max(0, t));
  return v * v * (3 - 2 * v);
};
// Contour data stays local; no mutation of Element/Project or temporary viewer offsets.
export function boardMotion(
  plan: InstallationPlan,
  time: number,
  index: number,
) {
  const frame = workFrame(plan, time),
    phase = frame.step.phase;
  if (phase === "layout" || phase === "ready")
    return { visible: false, amount: 0 };
  if (phase === "boards") {
    const p = ease(
      frame.progress * 1.45 - (index / Math.max(1, plan.boards.length)) * 0.45,
    );
    return { visible: p > 0, amount: p };
  }
  if (phase === "strip") {
    const p =
      1 -
      ease(
        frame.progress * 1.45 -
          (index / Math.max(1, plan.boards.length)) * 0.45,
      );
    return { visible: p > 0, amount: p };
  }
  return { visible: true, amount: 1 };
}
export function fillAmount(plan: InstallationPlan, time: number) {
  const f = workFrame(plan, time);
  if (f.step.phase === "pour" || f.step.phase === "spread")
    return ease(f.progress);
  return ["level", "wait", "strip", "compact", "ready"].includes(f.step.phase)
    ? 1
    : 0;
}
export function modelLevel(e: Element) {
  const b = elementBounds(e);
  return { bottom: e.position[1] + b.min[1], top: e.position[1] + b.max[1] };
}
