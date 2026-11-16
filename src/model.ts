import { z } from "zod";
import {
  shapeSchema,
  evidenceSchema,
  documentSchema,
  shapeQuantities,
  validateShape,
} from "./engineering";

export const vector = z.tuple([
  z.number().finite().min(-10000000).max(10000000),
  z.number().finite().min(-10000000).max(10000000),
  z.number().finite().min(-10000000).max(10000000),
]);
const box = z.object({
  size: vector.refine(
    (v) => v.every((n) => n >= 0.000001),
    "Размеры должны быть не менее 0,000001 м",
  ),
  offset: vector,
});
export const elementSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  mark: z.string(),
  category: z.string(),
  material: z.string(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  position: vector,
  parts: z.array(box).max(64),
  shape: shapeSchema.optional(),
  evidence: evidenceSchema.optional(),
  source: z.string(),
  confidence: z.enum(["drawing", "computed", "manual", "assumed", "unknown"]),
  parentId: z.string().nullable().default(null),
  sourceRef: z.string().nullable().default(null),
});
export const projectSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    name: z.string(),
    units: z.literal("m"),
    elements: z.array(elementSchema).max(10000),
    document: documentSchema.optional(),
  })
  .superRefine((p, ctx) => {
    if (p.version === 1 && p.document)
      ctx.addIssue({ code: "custom", message: "Документ требует формат v2" });
    const ids = new Set(p.elements.map((e) => e.id));
    const parents = new Map(p.elements.map((e) => [e.id, e.parentId]));
    const checked = new Set<string>();
    if (ids.size !== p.elements.length)
      ctx.addIssue({ code: "custom", message: "Повторяющийся ID" });
    let totalCells = 0;
    for (const e of p.elements) {
      if ((e.shape ? 1 : 0) + (e.parts.length > 0 ? 1 : 0) !== 1)
        ctx.addIssue({
          code: "custom",
          message: "Элемент должен содержать один вид геометрии",
        });
      if (p.version === 1 && (e.shape || e.evidence || p.document))
        ctx.addIssue({
          code: "custom",
          message: "Инженерные расширения требуют формат v2",
        });
      if (e.shape) {
        const error = validateShape(e.shape);
        if (error)
          ctx.addIssue({ code: "custom", message: `${e.id}: ${error}` });
      }
      const cells = [0, 1, 2]
        .map(
          (a) =>
            new Set(
              e.parts.flatMap((b) => [
                b.offset[a] - b.size[a] / 2,
                b.offset[a] + b.size[a] / 2,
              ]),
            ).size - 1,
        )
        .reduce((a, b) => a * b, 1);
      totalCells += cells;
      if (cells > 250000)
        ctx.addIssue({
          code: "custom",
          message: "Слишком сложная геометрия элемента",
        });
      if (e.parentId && !ids.has(e.parentId))
        ctx.addIssue({ code: "custom", message: "Неизвестный родитель" });
      let parent: string | null = e.id;
      const visited = new Set<string>();
      while (parent && !checked.has(parent)) {
        if (visited.has(parent)) {
          ctx.addIssue({ code: "custom", message: "Цикл связей" });
          break;
        }
        visited.add(parent);
        parent = parents.get(parent) ?? null;
      }
      for (const id of visited) checked.add(id);
    }
    if (totalCells > 2000000)
      ctx.addIssue({
        code: "custom",
        message: "Превышен расчётный бюджет проекта",
      });
  });
export type Vec3 = z.infer<typeof vector>;
export type Element = z.infer<typeof elementSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Box = Element["parts"][number];

// Exact union of axis-aligned boxes: overlapping parts are counted once.
// Surface counts only exposed cell faces, including recesses and through openings.
export function quantities(parts: Box[]) {
  const axes = [0, 1, 2].map((a) =>
    [
      ...new Set(
        parts.flatMap((p) => [
          p.offset[a] - p.size[a] / 2,
          p.offset[a] + p.size[a] / 2,
        ]),
      ),
    ].sort((a, b) => a - b),
  );
  if (axes.reduce((n, a) => n * (a.length - 1), 1) > 250000)
    throw new Error("Слишком сложное составное тело");
  let volume = 0,
    area = 0;
  const cells = new Set<string>();
  const key = (i: number, j: number, k: number) => `${i},${j},${k}`;
  for (let i = 0; i < axes[0].length - 1; i++)
    for (let j = 0; j < axes[1].length - 1; j++)
      for (let k = 0; k < axes[2].length - 1; k++) {
        const indices = [i, j, k];
        const mid = indices.map((n, a) => (axes[a][n] + axes[a][n + 1]) / 2);
        if (
          parts.some((p) =>
            mid.every(
              (v, a) =>
                v > p.offset[a] - p.size[a] / 2 &&
                v < p.offset[a] + p.size[a] / 2,
            ),
          )
        )
          cells.add(key(i, j, k));
      }
  for (const cell of cells) {
    const ijk = cell.split(",").map(Number);
    const d = ijk.map((n, a) => axes[a][n + 1] - axes[a][n]);
    volume += d[0] * d[1] * d[2];
    for (let a = 0; a < 3; a++)
      for (const sign of [-1, 1]) {
        const n = [...ijk];
        n[a] += sign;
        if (!cells.has(key(n[0], n[1], n[2])))
          area += d[(a + 1) % 3] * d[(a + 2) % 3];
      }
  }
  return { volume, area };
}
export function totals(elements: Element[]) {
  return elements.reduce<Record<string, number>>((a, e) => {
    if (
      e.evidence?.representation === "envelope" ||
      e.evidence?.representation === "diagram"
    )
      return a;
    a[e.material] = (a[e.material] ?? 0) + elementQuantities(e).volume;
    return a;
  }, {});
}
export function elementQuantities(e: Element) {
  return e.shape ? shapeQuantities(e.shape) : quantities(e.parts);
}
export function elementBounds(e: Element): { min: Vec3; max: Vec3 } {
  const shape = e.shape;
  let points: Vec3[];
  if (!shape)
    points = e.parts.flatMap((p) =>
      [-1, 1].map(
        (s) => p.offset.map((v, a) => v + (s * p.size[a]) / 2) as Vec3,
      ),
    );
  else if (shape.kind === "solid") points = shape.vertices;
  else if (shape.kind === "bar")
    points = shape.points.flatMap((p) =>
      [-1, 1].map(
        (sign) => p.map((v) => v + (sign * shape.diameter) / 2) as Vec3,
      ),
    );
  else
    points = shape.outline.flatMap(([u, v]) =>
      [-shape.depth / 2, shape.depth / 2].map(
        (d) =>
          (shape.axis === "y"
            ? [u, d, v]
            : shape.axis === "x"
              ? [d, v, u]
              : [u, v, d]) as Vec3,
      ),
    );
  return {
    min: [0, 1, 2].map((a) => Math.min(...points.map((p) => p[a]))) as Vec3,
    max: [0, 1, 2].map((a) => Math.max(...points.map((p) => p[a]))) as Vec3,
  };
}
const csvCell = (v: unknown) =>
  `"${String(v)
    .replace(/"/g, '""')
    .replace(/^[=+@-]/, "'$&")}"`;
export function toCSV(p: Project) {
  return (
    "\uFEFF" +
    [
      [
        "ID",
        "Марка",
        "Наименование",
        "Материал",
        "Объем м3",
        "Площадь м2",
        "Количество",
        "Источник",
        "Достоверность",
        "Основание расчёта",
        "Объём в спецификации м3",
        "Страницы PDF",
      ],
      ...p.elements.map((e) => {
        const q = elementQuantities(e);
        const excluded =
          e.evidence?.representation === "diagram" ||
          e.evidence?.representation === "envelope";
        return [
          e.id,
          e.mark,
          e.name,
          e.material,
          excluded ? "" : q.volume,
          excluded ? "" : q.area,
          1,
          e.source,
          e.confidence,
          e.evidence?.representation ?? "dimensioned",
          e.evidence?.reportedVolume ?? "",
          e.evidence?.pages.join(", ") ?? "",
        ];
      }),
    ]
      .map((r) => r.map(csvCell).join(";"))
      .join("\r\n")
  );
}
export function parseProject(raw: string): Project {
  const result = projectSchema.safeParse(JSON.parse(raw));
  if (!result.success)
    throw new Error(
      result.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "Проект"}: ${issue.message}`)
        .join("; "),
    );
  return result.data;
}
export function toSourceCSV(p: Project) {
  const rows: unknown[][] = [
    [
      "Раздел",
      "Сборка",
      "Марка",
      "Экземпляров",
      "Позиция",
      "Наименование",
      "Сталь",
      "Диаметр мм",
      "Кол-во на изделие",
      "L м",
      "Суммарная L м на изделие",
      "Масса ед кг",
      "Масса на изделие кг",
      "Количество ведомости",
      "Ед.",
      "Страница PDF",
      "Примечание",
    ],
  ];
  const doc = p.document;
  if (doc) {
    for (const r of doc.materials)
      rows.push([
        "Ведомость",
        doc.assembly,
        "",
        "",
        "",
        r.name,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        r.value,
        r.unit,
        r.page,
        "На всю сборку. Независимые данные источника.",
      ]);
    for (const r of doc.additionalReinforcement ?? [])
      rows.push([
        "Анкерные связи",
        doc.assembly,
        "",
        1,
        r.position,
        r.name,
        r.grade,
        r.diameter,
        r.count,
        r.length,
        r.totalLength,
        r.unitMass,
        r.totalMass,
        "",
        "",
        r.page,
        r.note ?? "",
      ]);
  }
  const types = [
    ...new Map(
      p.elements
        .filter((e) => e.evidence?.reinforcement)
        .map((e) => [e.mark, e]),
    ).values(),
  ];
  for (const e of types)
    for (const r of e.evidence!.reinforcement!)
      rows.push([
        "Армирование",
        doc?.assembly ?? p.name,
        e.mark,
        p.elements.filter((x) => x.mark === e.mark).length,
        r.position,
        r.name,
        r.grade,
        r.diameter,
        r.count,
        r.length,
        r.totalLength,
        r.unitMass,
        r.totalMass,
        "",
        "",
        r.page,
        r.note ?? "На один исходный элемент. Массы и длины не подгоняются.",
      ]);
  return (
    "\uFEFF" +
    rows.map((row) => row.map((v) => csvCell(v ?? "")).join(";")).join("\r\n")
  );
}

export function demo(length = 36): Project {
  if (
    !Number.isFinite(length) ||
    length < 12 ||
    length > 120 ||
    length % 6 !== 0
  )
    throw new Error("Длина: 12–120 м с шагом 6 м");
  const elements: Element[] = [];
  const add = (
    name: string,
    category: string,
    material: string,
    color: string,
    size: Vec3,
    position: Vec3,
    parts?: Box[],
  ) => {
    const id = `demo-${elements.length + 1}`;
    elements.push({
      id,
      name,
      mark: `${category.slice(0, 2).toUpperCase()}-${String(elements.length + 1).padStart(3, "0")}`,
      category,
      material,
      color,
      position,
      parts: parts ?? [{ size, offset: [0, 0, 0] }],
      source: "Параметрическая демонстрация · все размеры условные",
      confidence: "assumed",
      parentId: null,
      sourceRef: null,
    });
  };
  add(
    "Щебёночное основание",
    "Основание",
    "Щебень",
    "#82908e",
    [length + 2, 0.35, 7],
    [0, -0.65, 0],
  );
  add(
    "Бетонная подготовка",
    "Основание",
    "Бетон В7.5",
    "#a2aaa6",
    [length + 0.6, 0.12, 6.2],
    [0, -0.415, 0],
  );
  add(
    "Ленточный фундамент лестницы",
    "Фундаменты",
    "Бетон В25",
    "#94a8ab",
    [3.6, 0.4, 2.4],
    [-length / 2 - 1.6, -0.2, 0],
  );
  for (let x = -length / 2 + 3; x < length / 2; x += 6) {
    for (const z of [-2.1, 2.1]) {
      add(
        "Фундамент ступенчатый",
        "Фундаменты",
        "Бетон В25",
        "#94a8ab",
        [1.6, 0.6, 1.6],
        [x, -0.08, z],
        [
          { size: [1.6, 0.3, 1.6], offset: [0, -0.15, 0] },
          { size: [0.9, 0.3, 0.9], offset: [0, 0.15, 0] },
        ],
      );
      add(
        "Опора платформы",
        "Опоры",
        "Бетон В30",
        "#aababc",
        [0.45, 1, 0.45],
        [x, 0.7, z],
      );
    }
    add(
      "Поперечная балка",
      "Балки",
      "Бетон В30",
      "#a4b7b9",
      [0.4, 0.4, 5.6],
      [x, 1.25, 0],
    );
    for (let s = 0; s < 3; s++)
      add(
        "Плита платформы",
        "Плиты",
        "Бетон В30",
        "#c2ccc8",
        [1.96, 0.22, 5.8],
        [x - 2 + s * 2, 1.56, 0],
      );
    add(
      "Покрытие платформы",
      "Покрытие",
      "Асфальтобетон",
      "#647b7b",
      [5.98, 0.08, 5.8],
      [x, 1.71, 0],
    );
    add(
      "Колонна навеса",
      "Навес",
      "Сталь",
      "#528c8f",
      [0.18, 3.2, 0.18],
      [x, 3.35, 0],
    );
    add(
      "Кровля навеса",
      "Навес",
      "Сталь",
      "#86b5b4",
      [5.96, 0.12, 4.8],
      [x, 5, 0],
    );
  }
  const steps: Box[] = Array.from({ length: 8 }, (_, i) => ({
    size: [0.4, (i + 1) * 0.22, 2],
    offset: [i * 0.4, (i + 1) * 0.11, 0],
  }));
  add(
    "Лестничный сход",
    "Лестницы",
    "Бетон В30",
    "#b3c2bf",
    [3.2, 1.76, 2],
    [-length / 2 - 3, 0, 0],
    steps,
  );
  for (const z of [-5, 5]) {
    add(
      "Балласт пути",
      "Пути",
      "Щебень",
      "#677a79",
      [length + 12, 0.3, 2.8],
      [0, -0.5, z],
    );
    for (const dz of [-0.76, 0.76])
      add(
        "Условный рельс",
        "Пути",
        "Сталь",
        "#789294",
        [length + 12, 0.16, 0.08],
        [0, -0.08, z + dz],
      );
    for (let x = -length / 2 - 5; x < length / 2 + 6; x += 0.8)
      add(
        "Шпала",
        "Пути",
        "Бетон В40",
        "#8b9690",
        [0.22, 0.18, 2.4],
        [x, -0.25, z],
      );
  }
  return { version: 1, name: "Платформа «Северная»", units: "m", elements };
}
