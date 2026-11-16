import type { Vec3, Project, Element } from "./model";
import { documentInfo } from "./kzh";
import type { RebarSpec } from "./engineering";
import {
  pavilionRebar,
  canopyRebar,
  foundationRebar,
} from "./data/kzh-schedules";
type Point = [number, number];
const u = (upper: number, lower: number, height: number): Point[] => [
  [upper, height],
  [0, height],
  [0, 0],
  [lower, 0],
];
const fixer = (leg: number, height: number, width: number): Point[] => [
  [-leg, 0],
  [0, 0],
  [0, height],
  [width, height],
  [width, 0],
  [width + leg, 0],
];
const tie = (w: number, h: number): Point[] => [
  [0.04, h],
  [0, h],
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
];
// Rounded centerline sketches. The source dimensions use mixed outer / inner faces;
// specimens are diagrams, and cut lengths remain literal schedule values.
function rounded(points: Point[], radius: number): Vec3[] {
  const output: Vec3[] = [[...points[0], 0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]),
      lb = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const incoming = [(b[0] - a[0]) / la, (b[1] - a[1]) / la],
      outgoing = [(c[0] - b[0]) / lb, (c[1] - b[1]) / lb];
    const turn = incoming[0] * outgoing[1] - incoming[1] * outgoing[0];
    if (Math.abs(turn) < 1e-8) {
      output.push([...b, 0]);
      continue;
    }
    const angle = Math.acos(
      Math.max(
        -1,
        Math.min(1, incoming[0] * outgoing[0] + incoming[1] * outgoing[1]),
      ),
    );
    const cut = Math.min(radius * Math.tan(angle / 2), la * 0.4, lb * 0.4);
    const r = cut / Math.tan(angle / 2);
    const start = [b[0] - incoming[0] * cut, b[1] - incoming[1] * cut];
    const sign = Math.sign(turn),
      center = [
        start[0] - incoming[1] * r * sign,
        start[1] + incoming[0] * r * sign,
      ];
    const theta = Math.atan2(start[1] - center[1], start[0] - center[0]);
    for (let j = 0; j <= 8; j++) {
      const t = theta + (sign * angle * j) / 8;
      output.push([
        center[0] + r * Math.cos(t),
        center[1] + r * Math.sin(t),
        0,
      ]);
    }
  }
  output.push([...points[points.length - 1], 0]);
  return output;
}
export function createKzhDetails(): Project {
  const document = documentInfo("canopy");
  document.assembly = "Каталог гнутых деталей";
  document.materials = [];
  document.axes = {
    x: [0, 2, 4, 6, 8].map((value, i) => ({ label: String(i + 1), value })),
    z: [0, 2, 4, 6, 8].map((value, i) => ({ label: String(i + 1), value })),
  };
  document.additionalReinforcement = [];
  document.issues.unshift({
    id: "catalog",
    title: "Условная выкладка образцов",
    pages: [9, 10, 21, 28],
    detail:
      "Это отдельные образцы по эскизам ведомостей, без выдуманной привязки к сборкам. Положения на столе условны. Из-за разных правил размеров по внутренним/наружным граням формы являются схемой; длины заготовок сохранены по спецификации, не пересчитаны по картинке. Изготовительная деталировка не утверждена.",
  });
  const get = (list: RebarSpec[], position: string) =>
    list.find((r) => r.position === position)!;
  const loop: Point[] = [
    [-0.226, 0.064],
    [-0.19, 0.064],
    [-0.19, 0],
    [-0.03, 0],
    [-0.03, 0.252],
    [0.03, 0.252],
    [0.03, 0],
    [0.19, 0],
    [0.19, 0.064],
    [0.154, 0.064],
  ];
  const defs: {
    mark: string;
    name: string;
    points: Point[];
    radius: number;
    spec: RebarSpec;
    page: number;
  }[] = [
    {
      mark: "Ск1 · Ø12",
      name: "Скоба плит",
      points: u(0.409, 0.404, 0.139),
      radius: 0.036,
      spec: get(pavilionRebar.Пм1, "Ск1"),
      page: 10,
    },
    {
      mark: "Ф1 · Ø8",
      name: "Фиксатор плит",
      points: fixer(0.404, 0.101, 0.22),
      radius: 0.014,
      spec: get(pavilionRebar.Пм1, "Ф1"),
      page: 10,
    },
    {
      mark: "СП1 · Ø12",
      name: "Монтажная петля",
      points: loop,
      radius: 0.026,
      spec: get(pavilionRebar.Пм1, "СП1"),
      page: 9,
    },
    {
      mark: "Х1 · Ø8",
      name: "Хомут Пм6",
      points: tie(0.199, 0.131),
      radius: 0.014,
      spec: get(canopyRebar.Пм6, "Х1"),
      page: 21,
    },
    {
      mark: "Х2 · Ø8",
      name: "Хомут балок",
      points: tie(0.501, 0.219),
      radius: 0.014,
      spec: get(canopyRebar.Бм1, "Х2"),
      page: 21,
    },
    {
      mark: "Х3 · Ø8",
      name: "Хомут Лм1",
      points: tie(0.631, 0.212),
      radius: 0.014,
      spec: get(canopyRebar.Лм1, "Х3"),
      page: 21,
    },
    {
      mark: "Ш1 · Ø8",
      name: "Шпилька (длина не задана)",
      points: [
        [0, 0.04],
        [0, 0],
        [0.23, 0],
        [0.23, 0.04],
      ],
      radius: 0.014,
      spec: {
        position: "Ш1",
        name: "Шпилька",
        grade: "A240",
        diameter: 8,
        count: null,
        length: null,
        totalLength: null,
        unitMass: null,
        totalMass: null,
        page: 21,
        note: "Есть эскиз, нет полной спецификации данной позиции.",
      },
      page: 21,
    },
    {
      mark: "Ш2 · Ø8",
      name: "Шпилька балок",
      points: [
        [0, 0.04],
        [0, 0],
        [0.32, 0],
        [0.32, 0.04],
      ],
      radius: 0.014,
      spec: get(canopyRebar.Бм1, "Ш2"),
      page: 21,
    },
    {
      mark: "М1 · Ø12",
      name: "Стержень Лм1",
      points: [
        [0.515, 0.38],
        [0, 0.38],
        [0, 0],
      ],
      radius: 0.036,
      spec: get(canopyRebar.Лм1, "М1"),
      page: 21,
    },
    {
      mark: "М2 · Ø12",
      name: "Стержень Лм1",
      points: [
        [0.515, 0.225],
        [0, 0.225],
        [0, 0],
      ],
      radius: 0.036,
      spec: get(canopyRebar.Лм1, "М2"),
      page: 21,
    },
    {
      mark: "Ск2 · Ø12",
      name: "Скоба Лм1",
      points: u(1.33, 0.455, 0.218),
      radius: 0.036,
      spec: get(canopyRebar.Лм1, "Ск2"),
      page: 21,
    },
    {
      mark: "Ск3 · Ø12",
      name: "Скоба Лм1",
      points: u(0.69, 0.685, 0.629),
      radius: 0.036,
      spec: get(canopyRebar.Лм1, "Ск3"),
      page: 21,
    },
    {
      mark: "Ск4 · Ø12",
      name: "Скоба Лм1",
      points: u(0.51, 1.275, 0.218),
      radius: 0.036,
      spec: get(canopyRebar.Лм1, "Ск4"),
      page: 21,
    },
    {
      mark: "Ск7 · Ø12",
      name: "Скоба Лм1",
      points: u(0.57, 0.565, 0.218),
      radius: 0.036,
      spec: get(canopyRebar.Лм1, "Ск7"),
      page: 21,
    },
    {
      mark: "Ф2 · Ø8",
      name: "Фиксатор Лм1",
      points: fixer(0.404, 0.182, 0.1),
      radius: 0.014,
      spec: get(canopyRebar.Лм1, "Ф2"),
      page: 21,
    },
    {
      mark: "Ск5 · Ø16",
      name: "Скоба балок",
      points: u(0.855, 0.85, 0.32),
      radius: 0.048,
      spec: get(canopyRebar.Бм1, "Ск5"),
      page: 21,
    },
    {
      mark: "Ск6 · Ø16",
      name: "Скоба балок",
      points: u(1, 0.915, 0.5),
      radius: 0.048,
      spec: get(canopyRebar.Бм1, "Ск6"),
      page: 21,
    },
    {
      mark: "Ск1 Фм · Ø16",
      name: "Скоба Фм",
      points: u(0.83, 0.83, 0.364),
      radius: 0.048,
      spec: get(foundationRebar.Фм1, "Ск1"),
      page: 28,
    },
    {
      mark: "Ф1 Фм · Ø10",
      name: "Фиксатор Фм",
      points: fixer(0.405, 0.316, 0.25),
      radius: 0.0175,
      spec: get(foundationRebar.Фм1, "Ф1"),
      page: 28,
    },
    {
      mark: "Ск2 Фм · Ø12",
      name: "Скоба Фм2",
      points: u(0.52, 0.52, 0.815),
      radius: 0.036,
      spec: get(foundationRebar.Фм2, "Ск2"),
      page: 28,
    },
    {
      mark: "М-1 Фм · Ø12",
      name: "Выпуск Фм2",
      points: [
        [-0.167, 0],
        [0, 0],
        [0, 0.558],
        [
          1.722 * Math.cos((26 * Math.PI) / 180),
          0.558 + 1.722 * Math.sin((26 * Math.PI) / 180),
        ],
      ],
      radius: 0.036,
      spec: get(foundationRebar.Фм2, "М-1"),
      page: 28,
    },
    {
      mark: "М-2 Фм · Ø12",
      name: "Выпуск Фм2",
      points: [
        [-0.167, 0],
        [0, 0],
        [0, 0.707],
        [
          0.906 * Math.cos((26 * Math.PI) / 180),
          0.707 + 0.906 * Math.sin((26 * Math.PI) / 180),
        ],
      ],
      radius: 0.036,
      spec: get(foundationRebar.Фм2, "М-2"),
      page: 28,
    },
  ];
  const elements: Element[] = defs.map((d, i) => {
    const points = rounded(d.points, d.radius);
    return {
      id: `detail-${i + 1}`,
      name: d.name,
      mark: d.mark,
      category: "Гнутые детали",
      material: `Сталь ${d.spec.grade}`,
      color: "#dba45b",
      position: [(i % 5) * 2, 0, Math.floor(i / 5) * 2],
      parts: [],
      shape: { kind: "bar", diameter: d.spec.diameter / 1000, points },
      source: "Эскиз ведомости деталей · образец",
      confidence: "drawing",
      parentId: null,
      sourceRef: `10-25-М-КЖ1.5 · PDF ${d.page}`,
      evidence: {
        assembly: document.assembly,
        pages: [d.page, d.spec.page],
        sheet:
          d.page === 28
            ? "23"
            : d.page === 21
              ? "16"
              : d.page === 9
                ? "6"
                : "7",
        representation: "diagram",
        notes: [
          "Схема гнутой детали с радиусами. Положение в каталоге условное. Размеры по внешним/внутренним граням требуют проверки при выпуске изготовительной модели.",
          "Количество в спецификации относится к одному исходному изделию, а не к выкладке каталога.",
        ],
        reinforcement: [d.spec],
      },
    };
  });
  return {
    version: 2,
    name: "КЖ1.5 · Каталог гнутых деталей",
    units: "m",
    elements,
    document,
  };
}
