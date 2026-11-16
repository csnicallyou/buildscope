import layout from "./data/kzh-layout.json";
import {
  type Element,
  type Project,
  type Vec3,
  type Box,
  elementBounds,
} from "./model";
import type { ShapeData, EngineeringDocument, Bar } from "./engineering";
import {
  pavilionRebar,
  canopyRebar,
  foundationRebar,
  steelSchedule,
} from "./data/kzh-schedules";
export type Assembly = "pavilion" | "canopy";
const sheetNames = [
  "Общие данные",
  "Фундаменты павильона",
  "Разрезы павильона 1–3",
  "Разрезы павильона 4–7",
  "Плиты павильона",
  "Армирование и связи павильона",
  "Спецификация павильона",
  "Фундаменты навеса",
  "Плиты навеса",
  "Разрезы навеса 1–2",
  "Разрезы навеса 3–5",
  "Разрезы фундаментов 6–9",
  "Пм1.1 / Пм1.2",
  "Пм2.1 / Пм3 / Пм4 / Пм5",
  "Пм2.2 / Пм2.3 и связи",
  "Пм6 и гнутые детали",
  "Балка Бм1",
  "Балка Бм2",
  "Марш Лм1",
  "Спецификация навеса (начало)",
  "Спецификация навеса (окончание)",
  "Фм1 и спецификации Фм1–Фм4",
  "Фм2 и выпуски",
  "Фм3 и расход стали",
  "Фм4 и фиксаторы",
];
const pages = [
  [4],
  [5],
  [6],
  [7],
  [8],
  [9],
  [10],
  [11],
  [14],
  [12, 15],
  [13, 16],
  [17],
  [18],
  [19],
  [20],
  [21],
  [22],
  [23],
  [24],
  [25],
  [26],
  [27],
  [28],
  [29],
  [30],
];
const code = "10-25-М-КЖ1.5";
export function documentInfo(assembly: Assembly): EngineeringDocument {
  return {
    code,
    assembly:
      assembly === "pavilion" ? "Кассовый павильон" : "Навес «сухие ноги»",
    zeroAbsolute: 146.35,
    sourceName: "10-25-М-КЖ1.5 (7).pdf",
    pageCount: 30,
    axes:
      assembly === "pavilion"
        ? {
            x: [0, 3.9, 6.8, 9.1, 12.55, 16].map((value, i) => ({
              label: String(i + 1),
              value,
            })),
            z: [0, 4, 8].map((value, i) => ({
              label: ["А", "Б", "В"][i],
              value,
            })),
          }
        : {
            x: Array.from({ length: 11 }, (_, i) => ({
              label: String(i + 1),
              value: 4.75 * i,
            })),
            z: [0, 1.055, 4.155, 10.675, 13.775, 21.025].map((value, i) => ({
              label: ["А", "Б", "В", "Г", "Д", "Е"][i],
              value,
            })),
          },
    sheets: sheetNames.map((title, i) => ({
      sheet: i + 1,
      pages: pages[i],
      title,
      status:
        i === 0
          ? "Данные и материалы"
          : i >= 19
            ? "Спецификации / детали"
            : "Геометрия / схема армирования",
    })),
    additionalReinforcement: [
      {
        position: "АС",
        name: assembly === "pavilion" ? "Связи АС1–АС4" : "Связи АС1–АС7",
        grade: "A240",
        diameter: 12,
        count: null,
        length: null,
        totalLength: assembly === "pavilion" ? 24.1 : 21.2,
        unitMass: 0.9,
        totalMass: assembly === "pavilion" ? 21.7 : 19.1,
        page: assembly === "pavilion" ? 10 : 20,
        note: "Длины гнутых связей уточняются по месту, пространственная модель не выдумывается.",
      },
    ],
    issues: [
      {
        id: "scope",
        title: "Границы комплекта",
        pages: [4],
        detail:
          "Реконструированы конструкции КЖ. Кровля, стальные колонны, надземные стены и пути в этом PDF не заданы. Общая привязка двух сборок отсутствует; они открываются раздельно.",
      },
      {
        id: "duplicates",
        title: "Повторяющиеся листы и подписи",
        pages: [12, 13, 15, 16],
        detail:
          "Листы 10 и 11 повторяются. Две подписи СБ1 на листе 4 дублируют уже обозначенные блоки. Исключены по совпадению границ, а не подгонкой количеств.",
      },
      {
        id: "elevation",
        title: "Разные отметки плит навеса",
        pages: [12, 13, 14, 15, 16, 18, 21],
        detail:
          "Основная сборка использует −0,050 по плану 9 и армированию. В разрезах 10–11 дано −0,100. Переключатель варианта меняет только отметки спорных плит; это выбор источника, не исправление проекта.",
      },
      {
        id: "footing-levels",
        title: "Расхождения отметок Фм4",
        pages: [11, 17],
        detail:
          "Вид по плану: оси 8/9/10/11 — низ подготовки −2,090/−2,020/−2,160/−2,150. В разрезе 6–6 — −2,090/−2,120/−2,150/−2,160. Основной вариант использует план, альтернативный — разрез. Низ Фм выше низа подготовки на 100 мм.",
      },
      {
        id: "nominal",
        title: "Серийные изделия и подрезки",
        pages: [5, 6, 7, 11, 13],
        detail:
          "ФЛ и ФБС имеют номинальные профили по указанным ГОСТ. Заводские риски, фаски, монтажные петли серийных изделий не детализированы. Подрезки ФЛ «по месту» не имеют изготовительной деталировки; объём ФЛ — номинальный, до подрезок.",
      },
      {
        id: "reinforcement",
        title: "Армирование: схема и спецификация",
        pages: [9, 10, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
        detail:
          "В 3D показаны основные сетки, продольные стержни и хомуты балок/Пм6. Все позиции спецификаций сохранены отдельно, включая скобы, фиксаторы, петли и выпуски. Гибка, сварка, нахлёсты и полная пространственная расстановка каждой гнутой детали не утверждены этой моделью.",
      },
      {
        id: "stair",
        title: "Лм1: разные представления и количество М2",
        pages: [12, 14, 24, 26],
        detail:
          "Ступени восстановлены по 320×6=1920, подступенкам 140, начальной ступени 280 и площадке 1390; низ марша показан схематично, расчётный объём исключён. По спецификации 5,45 м³ (план) / 5,5 м³ (округление). М2: на узле подпись 24 шт., в спецификации 120 шт.; сохранено 120 с предупреждением.",
      },
      {
        id: "rounding",
        title: "Табличные и геометрические количества",
        pages: [4, 8, 10, 14, 25, 26, 27],
        detail:
          "Для павильона геометрия плит даёт 26,77826 м³, ведомость 27,2 м³ (по округлённым объёмам типов). Значения сохраняются раздельно. Песок, обмазка, грунтовка, швы и монолитные доборы без полного контура учтены по ведомости, не выданы за точные 3D-тела.",
      },
    ],
    materials:
      assembly === "pavilion"
        ? [
            ["Песчаная подготовка", 5.8, "м³"],
            ["Бетон B15 W4 F100 · доборы", 0.5, "м³"],
            ["Бетон B25 W6 F100 · плиты", 27.2, "м³"],
            ["Раствор M200 · швы", 0.7, "м³"],
            ["Грунтовка (1 слой)", 217.8, "м²"],
            ["Обмазка битумом (2 слоя)", 435.6, "м²"],
            ["Арматура · ведомость", steelSchedule.pavilion.total, "кг"],
            ["Анкерные связи · отдельно", steelSchedule.pavilion.anchors, "кг"],
          ].map(([name, value, unit]) => ({
            name: String(name),
            value: Number(value),
            unit: String(unit),
            page: String(unit) === "кг" ? 10 : 4,
          }))
        : [
            ["Песчаная подготовка", 6.5, "м³"],
            ["Щебёночная подготовка", 39.8, "м³"],
            ["Бетон B15 W4 F100 · доборы", 0.4, "м³"],
            ["Бетон B25 W6 F150 · плиты, балки, Лм1", 35.5, "м³"],
            ["Бетон B25 W8 F150 · Фм", 54.2, "м³"],
            ["Раствор M200 · швы", 0.7, "м³"],
            ["Грунтовка (1 слой)", 564, "м²"],
            ["Обмазка битумом (2 слоя)", 1128.1, "м²"],
            ["Бетон B7.5", 13.9, "м³"],
            ["Арматура плит / балок / марша", steelSchedule.canopy.total, "кг"],
            ["Анкерные связи · отдельно", steelSchedule.canopy.anchors, "кг"],
            ["Арматура Фм · ведомость", steelSchedule.canopy.foundations, "кг"],
          ].map(([name, value, unit]) => ({
            name: String(name),
            value: Number(value),
            unit: String(unit),
            page:
              String(unit) === "кг"
                ? String(name).includes("Фм")
                  ? 29
                  : String(name).includes("связи")
                    ? 20
                    : 26
                : 4,
          })),
  };
}
const box = (size: Vec3, offset: Vec3 = [0, 0, 0]): Box => ({ size, offset });
function fbsShape(length: number, direction: string): ShapeData {
  // Nominal plan, with end grooves. No fabricated factory lifting reinforcement.
  const a = length / 2;
  const outline: [number, number][] = [
    [-a, -0.2],
    [a, -0.2],
    [a, -0.12],
    [a - 0.05, -0.08],
    [a - 0.05, 0.08],
    [a, 0.12],
    [a, 0.2],
    [-a, 0.2],
    [-a, 0.12],
    [-a + 0.05, 0.08],
    [-a + 0.05, -0.08],
    [-a, -0.12],
  ];
  return {
    kind: "extrusion",
    axis: "y",
    outline: direction === "x" ? outline : outline.map(([u, v]) => [v, -u]),
    depth: 0.58,
  };
}
function flShape(length: number, direction: string): ShapeData {
  const ring = (l: number, w: number, y: number): Vec3[] =>
    [
      [-l / 2, y, -w / 2],
      [l / 2, y, -w / 2],
      [l / 2, y, w / 2],
      [-l / 2, y, w / 2],
    ].map(([x, y, z]) =>
      direction === "x" ? [x, y, z] : [z, y, -x],
    ) as Vec3[];
  const quads = [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [2, 6, 7, 3],
    [3, 7, 4, 0],
  ];
  return {
    kind: "solid",
    vertices: [...ring(length, 0.6, -0.15), ...ring(length - 0.18, 0.5, 0.15)],
    faces: quads.flatMap(([a, b, c, d]) => [
      [a, b, c],
      [a, c, d],
    ]) as [number, number, number][],
  };
}
function segmentsInPolygon(
  outline: [number, number][],
  axis: 0 | 1,
  value: number,
) {
  const cut: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i],
      b = outline[(i + 1) % outline.length];
    if (
      (a[axis] <= value && b[axis] > value) ||
      (b[axis] <= value && a[axis] > value)
    ) {
      const t = (value - a[axis]) / (b[axis] - a[axis]);
      cut.push(a[1 - axis] + t * (b[1 - axis] - a[1 - axis]));
    }
  }
  cut.sort((a, b) => a - b);
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < cut.length; i += 2)
    if (cut[i + 1] - cut[i] > 0.06)
      pairs.push([cut[i] + 0.025, cut[i + 1] - 0.025]);
  return pairs;
}
function cage(e: Element, spacing = 0.2, diameter = 0.012) {
  const bounds = elementBounds(e);
  const [lx, , lz] = bounds.min,
    [rx, , rz] = bounds.max;
  const t = bounds.max[1] - bounds.min[1];
  const outline =
    e.shape?.kind === "extrusion" && e.shape.axis === "y"
      ? e.shape.outline
      : ([
          [lx, lz],
          [rx, lz],
          [rx, rz],
          [lx, rz],
        ] as [number, number][]);
  const bars: Bar[] = [];
  for (const y of [
    bounds.min[1] + 0.025 + diameter / 2,
    bounds.max[1] - 0.025 - diameter / 2,
  ])
    for (const axis of [0, 1] as const) {
      const lo = axis === 0 ? lx : lz,
        hi = axis === 0 ? rx : rz;
      const count = Math.floor((hi - lo - 0.06) / spacing) + 1;
      for (let i = 0; i < count; i++) {
        const v = (lo + hi) / 2 + (i - (count - 1) / 2) * spacing;
        for (const [a, b] of segmentsInPolygon(outline, axis, v)) {
          const pts: Vec3[] =
            axis === 0
              ? [
                  [v, y, a],
                  [v, y, b],
                ]
              : [
                  [a, y + diameter, v],
                  [b, y + diameter, v],
                ];
          bars.push({
            id: `${e.id}:grid:${bars.length + 1}`,
            label: "Основная сетка · схема",
            diameter,
            points: pts,
          });
        }
      }
    }
  if (t > 0.1) e.evidence!.bars = bars;
}
function beamCage(
  e: Element,
  length: number,
  count: number,
  stirrupCount: number,
) {
  const bars: Bar[] = [];
  const half = length / 2 - 0.025;
  const zValues =
    count === 10 ? [-0.152, -0.05, 0.05, 0.152] : [-0.152, -0.05, 0.05, 0.152];
  for (const y of [-0.242, 0.242])
    for (const z of zValues)
      bars.push({
        id: `${e.id}:long:${bars.length}`,
        label: "1 · продольная арматура",
        diameter: 0.016,
        points: [
          [-half, y, z],
          [half, y, z],
        ],
      });
  const middle = count === 10 ? [0] : [-0.107, 0, 0.107];
  for (const y of middle)
    for (const z of [-0.152, 0.152])
      bars.push({
        id: `${e.id}:long:${bars.length}`,
        label: "1 · боковые стержни",
        diameter: 0.016,
        points: [
          [-half, y, z],
          [half, y, z],
        ],
      });
  for (let i = 0; i < stirrupCount / 2; i++) {
    const x = -half + 0.05 + ((length - 0.15) * i) / (stirrupCount / 2 - 1);
    for (const center of [-0.076, 0.076])
      bars.push({
        id: `${e.id}:stirrup:${bars.length}`,
        label: "Х2 · схема хомутов",
        diameter: 0.008,
        points: [
          [x, -0.246, center - 0.08],
          [x, 0.246, center - 0.08],
          [x, 0.246, center + 0.08],
          [x, -0.246, center + 0.08],
          [x, -0.246, center - 0.08],
        ],
      });
  }
  e.evidence!.bars = bars;
}

export function createKzh(
  assembly: Assembly,
  variant: "plan" | "sections" = "plan",
): Project {
  const elements: Element[] = [];
  const document = documentInfo(assembly);
  if (assembly === "canopy") document.variant = variant;
  const add = (
    mark: string,
    name: string,
    category: string,
    material: string,
    position: Vec3,
    parts: Box[],
    sourcePages: number[],
    shape?: ShapeData,
    representation:
      "dimensioned" | "nominal" | "diagram" | "envelope" = "dimensioned",
    notes: string[] = [],
    reportedVolume?: number,
  ) => {
    const id = `${assembly}-${mark}-${elements.length + 1}`;
    const e: Element = {
      id,
      name,
      mark,
      category,
      material,
      color:
        category === "Фундаменты Фм"
          ? "#7da5aa"
          : category === "ФЛ"
            ? "#9aa7ae"
            : category === "ФБС"
              ? "#b2c0ba"
              : category === "Подготовка"
                ? "#718883"
                : category === "Лестницы"
                  ? "#b3b7ac"
                  : "#8fb6b8",
      position,
      parts,
      shape,
      confidence: "drawing",
      parentId: null,
      sourceRef: `${code} · PDF ${sourcePages.join(", ")}`,
      source: "Ручная реконструкция из предоставленного PDF",
      evidence: {
        pages: sourcePages,
        sheet: sourcePages
          .map(
            (p) =>
              document.sheets.find((s) => s.pages.includes(p))?.sheet ?? "?",
          )
          .join(", "),
        assembly: document.assembly,
        representation,
        notes,
        reportedVolume,
      },
    };
    elements.push(e);
    return e;
  };
  const fbs = assembly === "pavilion" ? layout.pavilion : layout.canopy;
  for (const item of fbs) {
    const length = { СБ1: 2.38, СБ2: 1.18, СБ3: 0.88 }[item.mark]!;
    add(
      item.mark,
      `ФБС${item.mark === "СБ1" ? "24" : item.mark === "СБ2" ? "12" : "9"}.4.6-Т`,
      "ФБС",
      "Бетон B15 · сборный",
      item.position as Vec3,
      [],
      [item.page],
      fbsShape(length, item.direction),
      "nominal",
      [
        `Разрез ${item.section}; положение извлечено из векторных границ и калибровано по высоте 580 мм.`,
        `Профиль пазов номинальный по ГОСТ 13579-2018; заводские фаски и петли не детализированы.`,
      ],
    );
  }
  const footings =
    assembly === "pavilion" ? layout.pavilionFootings : layout.canopyFootings;
  for (const item of footings) {
    const long =
      assembly === "pavilion" ? item.mark === "ФЛ1" : item.mark === "ФЛ2";
    const length = long ? 2.38 : 1.18;
    const footing = add(
      item.mark,
      `ФЛ6.${long ? "24" : "12"}-4`,
      "ФЛ",
      "Бетон · ФЛ (класс не задан)",
      item.position as Vec3,
      [],
      [item.page],
      flShape(length, item.direction),
      "nominal",
      [
        "Форма по ГОСТ 13580-2021: скос 90 мм по торцам, 50 мм по ширине. Риски и подрезки по месту не учтены в номинальном объёме.",
      ],
    );
    const size: Vec3 =
      item.direction === "x" ? [length, 0.1, 0.6] : [0.6, 0.1, length];
    const pos = [...item.position] as Vec3;
    pos[1] -= 0.2;
    const sand = add(
      "ПП",
      "Песчаная подготовка под ФЛ",
      "Подготовка",
      "Песок",
      pos,
      [box(size)],
      [4, item.page],
      undefined,
      "envelope",
      [
        "Толщина 100 мм задана. Показан след подошвы; полный контур подготовки не задан, объём см. ведомость листа 1.",
      ],
    );
    sand.parentId = footing.id;
  }
  if (assembly === "pavilion") {
    let x = -0.145;
    for (const [type, width] of [
      ["Пм1", 3.54],
      ["Пм2", 2.48],
      ["Пм2", 2.48],
      ["Пм2", 2.48],
      ["Пм2", 2.48],
      ["Пм3", 2.73],
    ] as [string, number][]) {
      for (const z of [1.9225, 6.0775]) {
        const e = add(
          type,
          `Плита ${type}`,
          "Плиты",
          "Бетон B25 W6 F100",
          [x + width / 2, -0.305, z],
          [box([width, 0.2, 4.135])],
          [8, 9, 10],
          undefined,
          "dimensioned",
          [],
          type === "Пм1" ? 2.93 : type === "Пм2" ? 2.05 : 2.26,
        );
        e.evidence!.reinforcement = pavilionRebar[type];
        cage(e);
      }
      x += width + 0.02;
    }
  } else {
    const foundation = (
      type: string,
      axis: string,
      centerX: number,
      centerZ: number,
      bottomPrep: number,
      width: number,
      depth: number,
      shape?: ShapeData,
      notes: string[] = [],
    ) => {
      const pos: Vec3 = [centerX, bottomPrep + 0.325, centerZ];
      const page =
        type === "Фм1" ? 27 : type === "Фм2" ? 28 : type === "Фм3" ? 29 : 30;
      const e = add(
        type,
        `${type} · оси ${axis}`,
        "Фундаменты Фм",
        "Бетон B25 W8 F150",
        pos,
        shape ? [] : [box([width, 0.45, depth])],
        [11, 17, page],
        shape,
        "dimensioned",
        notes,
        type === "Фм1"
          ? 2.59
          : type === "Фм2"
            ? 7.37
            : type === "Фм3"
              ? 3.73
              : 3.66,
      );
      e.evidence!.reinforcement = foundationRebar[type];
      cage(e, 0.2, 0.016);
      const outline: [number, number][] | undefined =
        type === "Фм2"
          ? [
              [-3.675, -1.5875],
              [-1.075, -1.5875],
              [-1.075, 0.5975],
              [1.075, 0.5975],
              [1.075, -1.5875],
              [3.675, -1.5875],
              [3.675, 1.5875],
              [-3.675, 1.5875],
            ]
          : undefined;
      const blinding = add(
        "БП",
        `Бетонная подготовка ${type} · ${axis}`,
        "Подготовка",
        "Бетон B7.5",
        [centerX, bottomPrep + 0.05, centerZ],
        outline ? [] : [box([width + 0.2, 0.1, depth + 0.2])],
        [4, page],
        outline
          ? { kind: "extrusion", axis: "y", depth: 0.1, outline }
          : undefined,
        "dimensioned",
        ["Выступ 100 мм в каждую сторону."],
      );
      const gravel = add(
        "ЩП",
        `Щебёночная подготовка ${type} · ${axis}`,
        "Подготовка",
        "Щебень",
        [centerX, bottomPrep - 0.15, centerZ],
        [box([width + 0.8, 0.3, depth + 0.8])],
        [4, page],
        undefined,
        "envelope",
        [
          "Толщина 300 мм. Показан огибающий объём; откосы/стыковка слоёв не выданы за расчётное тело. Ведомость: 39,8 м³.",
        ],
      );
      blinding.parentId = e.id;
      gravel.parentId = e.id;
      if (type !== "Фм2") {
        const boltCenters =
          type === "Фм3"
            ? [
                [centerX, centerZ - 0.5275],
                [centerX, centerZ + 0.5275],
              ]
            : type === "Фм4"
              ? [[centerX, centerZ + 0.35]]
              : [[centerX + (axis.startsWith("6/") ? -0.45 : 0), centerZ]];
        e.evidence!.bars ??= [];
        for (const [bx, bz] of boltCenters)
          for (let i = 0; i < 8; i++) {
            const angle = (2 * Math.PI * i) / 8;
            const x = bx - centerX + 0.25 * Math.cos(angle),
              z = bz - centerZ + 0.25 * Math.sin(angle);
            e.evidence!.bars.push({
              id: `${e.id}:M24:${i}:${bx}:${bz}`,
              label: "Анкер M24×450 · R250 · 8 шт.",
              diameter: 0.024,
              points: [
                [x, 0.225 - 0.25, z],
                [x, 0.225 + 0.2, z],
              ],
            });
          }
      } else {
        for (const bx of [-2.375, 2.375])
          for (let i = 0; i < 8; i++) {
            const a = (2 * Math.PI * i) / 8;
            e.evidence!.bars!.push({
              id: `${e.id}:M24:${bx}:${i}`,
              label: "Анкер M24×450 · R250",
              diameter: 0.024,
              points: [
                [bx + 0.25 * Math.cos(a), -0.025, -0.2875 + 0.25 * Math.sin(a)],
                [bx + 0.25 * Math.cos(a), 0.425, -0.2875 + 0.25 * Math.sin(a)],
              ],
            });
          }
      }
    };
    foundation("Фм1", "1/А", 0, 0, -1.93, 2.4, 2.4);
    const pi: [number, number][] = [
      [-3.575, -1.4875],
      [-1.175, -1.4875],
      [-1.175, 0.5975],
      [1.175, 0.5975],
      [1.175, -1.4875],
      [3.575, -1.4875],
      [3.575, 1.4875],
      [-3.575, 1.4875],
    ];
    foundation("Фм2", "2–3/А–Б", 7.125, 0.2875, -2.03, 7.15, 2.975, {
      kind: "extrusion",
      axis: "y",
      outline: pi,
      depth: 0.45,
    });
    foundation("Фм1", "4/А", 14.25, 0, -2.07, 2.4, 2.4);
    foundation("Фм1", "5/А", 19, 0, -2.07, 2.4, 2.4);
    foundation("Фм1", "6/А", 24.2, 0, -2.065, 2.4, 2.4, undefined, [
      "Центр тела смещён на +450 мм относительно оси 6; анкеры на оси.",
    ]);
    foundation("Фм3", "7/А–Б", 28.5, 0.5275, -2.06, 2.4, 3.455, undefined, [
      "Оси А/Б расположены в 1200 мм от торцов.",
    ]);
    const levels =
      variant === "plan"
        ? [-2.09, -2.02, -2.16, -2.15]
        : [-2.09, -2.12, -2.15, -2.16];
    levels.forEach((v, i) =>
      foundation(
        "Фм4",
        `${i + 8}/А`,
        (i + 7) * 4.75,
        -0.35,
        v,
        2.85,
        2.85,
        undefined,
        [
          "План и разрез 6–6 содержат несовпадающие отметки. Выбран вариант: " +
            variant,
        ],
      ),
    );
    for (const [axis, x, z, bottom] of [
      ["4/В", 14.25, 4.155, -2.02],
      ["5/В", 19, 4.155, -2.02],
      ["6/В", 24.2, 4.155, -2.03],
      ["7/В", 28.5, 4.155, -2.03],
      ["6/Г", 24.2, 10.675, -1.99],
      ["7/Г", 28.5, 10.675, -1.99],
      ["7/Д", 28.5, 13.775, -1.975],
    ] as [string, number, number, number][]) {
      foundation(
        "Фм1",
        axis,
        x,
        z,
        bottom,
        2.4,
        2.4,
        undefined,
        axis.startsWith("6/")
          ? ["Центр тела на +450 мм от цифровой оси; анкеры на оси."]
          : [],
      );
    }
    const top = variant === "plan" ? -0.05 : -0.1;
    const slab = (
      mark: string,
      x: number,
      z: number,
      width: number,
      depth: number,
      reported: number,
      cut?: "right" | "left",
    ) => {
      let parts = [box([width, 0.2, depth])];
      if (cut) {
        const n = cut === "right" ? 0.41 : 0.52;
        const sign = cut === "right" ? 1 : -1;
        parts = [
          box([width - n, 0.2, depth], [(-sign * n) / 2, 0, 0]),
          box(
            [n, 0.2, 0.46],
            [(sign * (width - n)) / 2, 0, (depth - 0.46) / 2],
          ),
          box([n, 0.2, depth - 1.06], [(sign * (width - n)) / 2, 0, -1.06 / 2]),
        ];
      }
      const e = add(
        mark,
        `Плита ${mark}`,
        "Плиты",
        "Бетон B25 W6 F150",
        [x, top - 0.1, z],
        parts,
        [
          14,
          mark.startsWith("Пм1")
            ? 18
            : mark.startsWith("Пм2.") && mark !== "Пм2.1"
              ? 20
              : mark === "Пм6"
                ? 21
                : 19,
          25,
        ],
        undefined,
        "dimensioned",
        [
          "Верх: " +
            top.toFixed(3) +
            "; альтернативная отметка в других листах сохранена в реестре.",
        ],
        reported,
      );
      e.evidence!.reinforcement = canopyRebar[mark];
      if (cut) {
        const w = width / 2,
          d = depth / 2,
          n = cut === "right" ? 0.41 : 0.52;
        const points: [number, number][] = [
          [-w, -d],
          [w, -d],
          [w, d - 1.06],
          [w - n, d - 1.06],
          [w - n, d - 0.46],
          [w, d - 0.46],
          [w, d],
          [-w, d],
        ];
        e.shape = {
          kind: "extrusion",
          axis: "y",
          outline: cut === "right" ? points : points.map(([a, b]) => [-a, b]),
          depth: 0.2,
        };
        e.parts = [];
      }
      if (mark === "Пм6") {
        const bars: Bar[] = [];
        for (const y of [-0.065, 0.065])
          for (const z of [-0.182, -0.09, 0, 0.092, 0.182])
            bars.push({
              id: `${e.id}:main:${bars.length}`,
              label: "1 · 16 A500C",
              diameter: 0.016,
              points: [
                [-4.47, y, z],
                [4.47, y, z],
              ],
            });
        for (let i = 0; i < 75; i++)
          for (const center of [-0.091, 0.091]) {
            const x = -4.44 + i * 0.12;
            bars.push({
              id: `${e.id}:X1:${bars.length}`,
              label: "Х1 · 8 A240",
              diameter: 0.008,
              points: [
                [x, -0.0655, center - 0.0995],
                [x, 0.0655, center - 0.0995],
                [x, 0.0655, center + 0.0995],
                [x, -0.0655, center + 0.0995],
                [x, -0.0655, center - 0.0995],
              ],
            });
          }
        e.evidence!.bars = bars;
      } else cage(e, mark === "Пм4" ? 0.1 : 0.2);
      return e;
    };
    const stripX = 6.925;
    let edge = 18.085;
    slab("Пм3", stripX, edge - 1.25, 4.75, 2.5, 2.38);
    edge -= 2.52;
    for (const type of ["Пм1.1", "Пм1.1", "Пм1.2", "Пм1.1", "Пм1.1"]) {
      slab(type, stripX, edge - 1.065, 4.75, 2.13, 2.02);
      edge -= 2.15;
    }
    let x = 4.55;
    for (const [mark, w, v, cut] of [
      ["Пм4", 4.14, 2.58],
      ["Пм2.1", 2.22, 1.39],
      ["Пм2.2", 2.22, 1.34, "right"],
      ["Пм2.3", 2.22, 1.32, "left"],
      ["Пм2.1", 2.22, 1.39],
      ["Пм2.1", 2.22, 1.39],
      ["Пм5", 2.39, 1.49],
    ] as [string, number, number, ("right" | "left")?][]) {
      slab(mark, x + w / 2, 19.665, w, 3.12, v, cut);
      x += w + 0.02;
    }
    slab("Пм6", 26.795, 21.025, 8.99, 0.45, 0.81);
    for (const z of [19.075, 21.025]) {
      const e = add(
        "Бм1",
        "Балка Бм1",
        "Балки",
        "Бетон B25 W6 F150",
        [16.625, -0.61, z],
        [box([7.15, 0.58, 0.4])],
        [13, 22, 25],
        undefined,
        "dimensioned",
        ["Низ −0,900; толщина 580 мм."],
        1.66,
      );
      e.evidence!.reinforcement = canopyRebar.Бм1;
      beamCage(e, 7.15, 10, 90);
    }
    const beam = add(
      "Бм2",
      "Балка Бм2",
      "Балки",
      "Бетон B25 W6 F150",
      [25.745, -0.61, 21.025],
      [box([11.09, 0.58, 0.4])],
      [13, 23, 25],
      undefined,
      "dimensioned",
      [],
      2.57,
    );
    beam.evidence!.reinforcement = canopyRebar.Бм2;
    beamCage(beam, 11.09, 14, 168);
    // Stated tread geometry; ambiguous lower profile is explicitly a diagram, excluded from takeoff.
    const outline: [number, number][] = [
      [0, -1.48],
      [0, -1.34],
      [0.64, -1.34],
      [0.64, -1.06],
    ];
    for (let i = 1; i <= 6; i++) {
      outline.push(
        [0.64 + i * 0.32, -1.06 + (i - 1) * 0.14],
        [0.64 + i * 0.32, -1.06 + i * 0.14],
      );
    }
    outline.push(
      [3.95, -0.22],
      [3.95, -0.92],
      [3.56, -0.92],
      [3.56, -0.52],
      [2.56, -0.52],
      [0.89, -1.36],
      [0.89, -1.48],
    );
    const stair = add(
      "Лм1",
      "Лестничный марш Лм1",
      "Лестницы",
      "Бетон B25 W6 F150",
      [6.925, 0, 0.885],
      [],
      [12, 14, 24, 26],
      { kind: "extrusion", axis: "x", outline, depth: 4.75 },
      "diagram",
      [
        "Ступени и площадки по размерам. Нижняя грань марша и местное понижение под балку показаны схематично; геометрический объём не входит в итог.",
        "Спецификация: 5,45 м³ на листе 9 и 5,5 м³ на листе 21.",
      ],
      5.45,
    );
    stair.evidence!.reinforcement = canopyRebar.Лм1;
  }
  return {
    version: 2,
    name: `Маленковская · ${document.assembly}${assembly === "canopy" ? " · " + (variant === "plan" ? "по плану" : "по разрезам") : ""}`,
    units: "m",
    elements,
    document,
  };
}
