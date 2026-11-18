import type { Element, Vec3 } from "./model";
import { elementBounds } from "./model";
import type { Bar } from "./engineering";

// Manual transcription of the supplied 10-25-М-КЖ1.5. Coordinates are local,
// in the drawing plan; drawingPlanToWorld is applied once by the caller.
// No grid is inferred from a bounding box or a specification mass.
export const reinforcementSourceHash =
  "4c660baecfdb6ceb53d10da72bd615611f0f362c6b8ac10482544ea72580dfc8";

type Mat = {
  page: number;
  x: [number, number, number]; // first centre from left, count, spacing, metres
  z: [number, number, number]; // first centre from bottom of drawing
};
const pavilion: Record<string, Mat> = {
  Пм1: { page: 9, x: [0.07, 18, 0.2], z: [0.07, 21, 0.2] },
  Пм2: { page: 9, x: [0.04, 13, 0.2], z: [0.07, 21, 0.2] },
  Пм3: { page: 9, x: [0.07, 14, 0.2], z: [0.07, 21, 0.2] },
};
const canopy: Record<string, Mat> = {
  "Пм1.1": { page: 18, x: [0.075, 24, 0.2], z: [0.065, 11, 0.2] },
  "Пм1.2": { page: 18, x: [0.075, 24, 0.2], z: [0.065, 11, 0.2] },
  "Пм2.1": { page: 19, x: [0.11, 11, 0.2], z: [0.06, 16, 0.2] },
  Пм3: { page: 19, x: [0.075, 24, 0.2], z: [0.05, 13, 0.2] },
  Пм4: { page: 19, x: [0.07, 41, 0.1], z: [0.06, 31, 0.1] },
  Пм5: { page: 19, x: [0.09, 12, 0.2], z: [0.06, 16, 0.2] },
};

export function beamStirrupStations(mark: "Бм1" | "Бм2"): number[] {
  // Dimension chains on PDF 22/23, from the left concrete face. A shared
  // station at a zone boundary is counted once, not once per zone.
  const [start, zones]: [number, [number, number][]] =
    mark === "Бм1"
      ? [
          0.075,
          [
            [6, 0.15],
            [9, 0.1],
            [1, 0.15],
            [1, 0.15],
            [1, 0.2],
            [8, 0.3],
            [1, 0.2],
            [1, 0.15],
            [1, 0.15],
            [9, 0.1],
            [6, 0.15],
          ],
        ]
      : [
          0.195,
          [
            [10, 0.2],
            [30, 0.1],
            [6, 0.3],
            [25, 0.1],
            [5, 0.3],
          ],
        ];
  const result = [start];
  for (const [count, step] of zones)
    for (let i = 0; i < count; i++)
      result.push(+(result.at(-1)! + step).toFixed(6));
  return result;
}

export function applyDrawingReinforcement(
  e: Element,
  assembly: "pavilion" | "canopy",
) {
  const evidence = e.evidence;
  if (!evidence?.reinforcement) return;
  const bounds = elementBounds(e);
  const bars: Bar[] = [];
  const notes: string[] = [];
  const conflicts: string[] = [];
  const placed: string[] = [];
  const pages: number[] = [];
  const distributions: {
    position: string;
    page: number;
    from: string;
    distances: number[];
    perStation: number;
  }[] = [];
  const add = (
    position: string,
    page: number,
    diameter: number,
    points: Vec3[],
    label: string,
  ) => {
    bars.push({
      id: `${e.id}:drawing:${position}:${bars.length}`,
      label,
      diameter,
      points,
      drawing: { position, page },
    });
  };
  const mat = (assembly === "pavilion" ? pavilion : canopy)[e.mark];
  if (mat) {
    pages.push(
      mat.page,
      assembly === "pavilion" ? 10 : 18,
      assembly === "pavilion" ? 10 : 25,
    );
    const diameter = 0.012;
    // PDF 9/18 section1-1: 25mm clear cover, two contacting directions per
    // face. The second direction moves INTO the concrete at the top too.
    for (const top of [false, true]) {
      const outer = top
        ? bounds.max[1] - 0.025 - diameter / 2
        : bounds.min[1] + 0.025 + diameter / 2;
      for (const [axis, family] of [
        [0, mat.x],
        [2, mat.z],
      ] as const) {
        const y = outer + (axis === 0 ? 0 : top ? -diameter : diameter);
        for (let i = 0; i < family[1]; i++) {
          const fixed = bounds.min[axis] + family[0] + i * family[2];
          const other = axis === 0 ? 2 : 0;
          const start: Vec3 = [0, y, 0],
            end: Vec3 = [0, y, 0];
          start[axis] = end[axis] = fixed;
          start[other] = bounds.min[other] + 0.025 + diameter / 2;
          end[other] = bounds.max[other] - 0.025 - diameter / 2;
          add("1", mat.page, diameter, [start, end], "Основная сетка · схема");
        }
      }
    }
    placed.push(
      "1 · основные сетки: шаг и крайние привязки по плану, слои по сечению 1–1",
    );
    notes.push(
      `PDF ${mat.page}: раскладка ${mat.x[1]} × ${mat.z[1]}, шаг ${mat.x[2] * 1000}/${mat.z[2] * 1000} мм; защитный слой 25 мм. Видимые прямые участки не включают нахлёсты.`,
    );
  } else if (e.mark === "Фм1") {
    pages.push(27, 28);
    const d = 0.016;
    for (const top of [false, true]) {
      const outer = top
        ? bounds.max[1] - 0.03 - d / 2
        : bounds.min[1] + 0.04 + d / 2;
      for (const axis of [0, 2] as const) {
        const y = outer + (axis === 0 ? 0 : top ? -d : d);
        const other = axis === 0 ? 2 : 0;
        for (let i = 0; i < 12; i++) {
          const a: Vec3 = [0, y, 0],
            b: Vec3 = [0, y, 0];
          a[axis] = b[axis] = bounds.min[axis] + 0.1 + i * 0.2;
          a[other] = bounds.min[other] + 0.03 + d / 2;
          b[other] = bounds.max[other] - 0.03 - d / 2;
          add("1", 27, d, [a, b], "Основная сетка · схема");
        }
      }
    }
    placed.push("1 · две сетки Ø16, шаг 200 мм");
    notes.push(
      "PDF 27: крайние привязки 100 мм, боковой/верхний слой 30 мм, нижний 40 мм; универсальный отступ 25 мм удалён.",
    );
  } else if (e.mark === "Пм6") {
    distributions.push({
      position: "Х1",
      page: 21,
      from: "Левый торец, вдоль плиты",
      distances: Array.from(
        { length: 75 },
        (_, i) => +(0.055 + i * 0.12).toFixed(6),
      ),
      perStation: 2,
    });
    pages.push(21, 25);
    // PDF 21 section1-1: 43+90+92+92+90+43=450mm; 35mm clear cover.
    for (const y of [-0.057, 0.057])
      for (const z of [-0.182, -0.092, 0, 0.092, 0.182])
        add(
          "1",
          21,
          0.016,
          [
            [-4.47, y, z],
            [4.47, y, z],
          ],
          "1 · продольная арматура Ø16",
        );
    placed.push("1 · 10 стержней Ø16, L=8,94 м");
    notes.push(
      "PDF 21: защитный слой 35 мм; оси крайних стержней в 43 мм от грани. Х1: 75 сечений, 120×74=8880 мм, отступы 55 мм, по два хомута.",
    );
  } else if (e.mark === "Бм1" || e.mark === "Бм2") {
    const page = e.mark === "Бм1" ? 22 : 23;
    pages.push(page, 21, 25);
    const length = e.mark === "Бм1" ? 7.1 : 11.03;
    for (const y of [-0.242, 0.242])
      for (const z of [-0.152, -0.05, 0.05, 0.152])
        add(
          "1",
          page,
          0.016,
          [
            [-length / 2, y, z],
            [length / 2, y, z],
          ],
          "1 · продольная арматура",
        );
    for (const y of e.mark === "Бм1" ? [0] : [-0.135, 0, 0.135])
      for (const z of [-0.152, 0.152])
        add(
          "1",
          page,
          0.016,
          [
            [-length / 2, y, z],
            [length / 2, y, z],
          ],
          "1 · боковые стержни",
        );
    placed.push(
      `1 · ${e.mark === "Бм1" ? 10 : 14} стержней Ø16, L=${length} м`,
    );
    const stations = beamStirrupStations(e.mark);
    distributions.push({
      position: "Х2",
      page,
      from: "Левый торец, вдоль балки",
      distances: stations,
      perStation: 2,
    });
    notes.push(
      `PDF${page}: Х2 по размерной цепи — ${stations.length} сечений × 2 = ${stations.length * 2} хомутов. Шаг переменный; равномерная расстановка удалена. Точные координаты сечений сохранены в реестре сверки.`,
    );
    if (e.mark === "Бм2")
      conflicts.push(
        "PDF 23: размерная цепь Х2 даёт 77 сечений × 2 = 154 шт.; PDF 25 требует 168 шт. Не добавлены 14 хомутов в произвольных местах; нужна проверка проектировщика.",
      );
  } else if (e.mark === "Фм4") {
    pages.push(27, 28, 30);
    notes.push(
      "PDF 27: исправлена ошибка переноса массы поз.1 — 282,4 кг вместо 284,4 кг. Для четырёх Фм4 это уменьшает итог по строкам спецификации на 8 кг; исходная общая ведомость стали сохранена отдельно.",
    );
    notes.push(
      "PDF 30: Ск1 — 15 шт. по каждой стороне с шагом 195 мм и крайними привязками60 мм; поз.1 подписана с шагом 200 мм. Это разные указания: сетка не заменена скобами и не подогнана под их число. Начальная привязка основных стержней требует отдельного восстановления.",
    );
  } else if (e.mark === "Фм3") {
    pages.push(27, 28, 29);
    notes.push(
      "PDF 29: отдельные крайние стержни поз.1, привязки50/55/150 мм, Ск1 по12/17 шт. Прежняя автоматически центрированная сетка не соответствует этой раскладке и удалена; полный узел ещё не детализирован.",
    );
  } else if (e.mark === "Фм2") {
    pages.push(27, 28);
    notes.push(
      "PDF 28: П-образная сетка и выпуски М-1/М-2/Ск2 имеют отдельные зоны и привязки. Прежнее автоматическое обрезание прямоугольной сетки по контуру удалено; пространственная деталировка ещё не восстановлена.",
    );
  } else if (e.mark === "Пм2.2" || e.mark === "Пм2.3") {
    pages.push(18, 20, 21, 25);
    notes.push(
      "PDF 20: у выреза меняются шаг и число Ск1, добавлены поз.2/3/4 в разных слоях. Равномерная сетка, обрезанная по вырезу, удалена; локальное усиление ещё не восстановлено в 3D.",
    );
  } else if (e.mark === "Лм1") {
    pages.push(21, 24, 26);
    conflicts.push(
      "PDF 24: подпись М2 — 24 шт.; PDF 26: спецификация М2 — 120 шт. Спецификация сохранена буквально, размещение120 деталей не выдумано.",
    );
    notes.push(
      "Нижний профиль Лм1 в существующей модели схематичный; точное размещение каркаса на нём не подтверждено. В3D не добавлены условные стержни.",
    );
  }
  const anchors = (evidence.bars ?? []).filter((b) =>
    b.label.startsWith("Анкер"),
  );
  for (const b of anchors)
    b.drawing = {
      page:
        e.mark === "Фм1"
          ? 27
          : e.mark === "Фм2"
            ? 28
            : e.mark === "Фм3"
              ? 29
              : 30,
      position: "Анкер M24",
    };
  evidence.bars = [...bars, ...anchors];
  if (anchors.length)
    placed.push(
      "Анкеры M24×450: оси R250, вылет200 мм; резьба, гайки, шайбы и клеевой состав не моделируются",
    );
  const pending = evidence.reinforcement
    .filter((r) => !(bars.length && r.position === "1"))
    .map((r) =>
      r.name === r.position ? r.position : `${r.position} · ${r.name}`,
    );
  if (mat || e.mark === "Фм1")
    pending.push("Стыки и нахлёсты поз.1: в 3D показаны только прямые участки");
  notes.push(
    "Количество и масса по спецификации независимы от видимой части каркаса. Непостроенные детали сохранены в ведомости; их отсутствие в 3D не означает отсутствие в проекте.",
  );
  evidence.reinforcementReview = {
    revision: 1,
    sourceHash: reinforcementSourceHash,
    pages: [...new Set(pages)].sort((a, b) => a - b),
    status: bars.length ? "partial" : "schedule-only",
    placed,
    pending,
    notes,
    conflicts,
    distributions,
  };
}
