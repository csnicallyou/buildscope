import { z } from "zod";
const number = z.number().finite().min(-1e7).max(1e7);
const v3 = z.tuple([number, number, number]);
const v2 = z.tuple([number, number]);
export const shapeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bar"),
    diameter: z.number().min(0.001).max(0.1),
    points: z.array(v3).min(2).max(256),
  }),
  z.object({
    kind: z.literal("extrusion"),
    axis: z.enum(["x", "y", "z"]),
    outline: z.array(v2).min(3).max(256),
    depth: z.number().min(0.000001).max(1e7),
  }),
  z.object({
    kind: z.literal("solid"),
    vertices: z.array(v3).min(4).max(1000),
    faces: z
      .array(
        z.tuple([
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
        ]),
      )
      .min(4)
      .max(4000),
  }),
]);
export type ShapeData = z.infer<typeof shapeSchema>;
export const barSchema = z.object({
  id: z.string(),
  label: z.string(),
  diameter: z.number().positive().max(0.1),
  points: z.array(v3).min(2).max(100),
});
export const rebarSpecSchema = z.object({
  position: z.string(),
  name: z.string(),
  grade: z.string(),
  diameter: z.number().positive(),
  count: z.number().nonnegative().nullable(),
  length: z.number().nonnegative().nullable(),
  totalLength: z.number().nonnegative().nullable(),
  unitMass: z.number().nonnegative().nullable(),
  totalMass: z.number().nonnegative().nullable(),
  page: z.number().int().min(1).max(30),
  note: z.string().optional(),
});
export type Bar = z.infer<typeof barSchema>;
export type RebarSpec = z.infer<typeof rebarSpecSchema>;
export const evidenceSchema = z.object({
  pages: z.array(z.number().int().min(1).max(30)),
  sheet: z.string(),
  assembly: z.string(),
  representation: z.enum(["dimensioned", "nominal", "diagram", "envelope"]),
  notes: z.array(z.string()),
  reportedVolume: z.number().nonnegative().optional(),
  reinforcement: z.array(rebarSpecSchema).optional(),
  bars: z.array(barSchema).max(4000).optional(),
});
export const documentSchema = z.object({
  code: z.string(),
  assembly: z.string(),
  zeroAbsolute: z.number(),
  sourceName: z.string(),
  pageCount: z.number().int(),
  variant: z.enum(["plan", "sections"]).optional(),
  issues: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      pages: z.array(z.number().int()),
      detail: z.string(),
    }),
  ),
  sheets: z.array(
    z.object({
      sheet: z.number().int(),
      pages: z.array(z.number().int()),
      title: z.string(),
      status: z.string(),
    }),
  ),
  materials: z.array(
    z.object({
      name: z.string(),
      value: z.number().nonnegative(),
      unit: z.string(),
      page: z.number().int(),
    }),
  ),
  additionalReinforcement: z.array(rebarSpecSchema).optional(),
  axes: z.object({
    x: z.array(z.object({ label: z.string(), value: z.number() })),
    z: z.array(z.object({ label: z.string(), value: z.number() })),
  }),
});
export type EngineeringDocument = z.infer<typeof documentSchema>;

function polygonArea(points: [number, number][]) {
  return (
    Math.abs(
      points.reduce((s, p, i) => {
        const q = points[(i + 1) % points.length];
        return s + p[0] * q[1] - p[1] * q[0];
      }, 0),
    ) / 2
  );
}
export function shapeQuantities(shape: ShapeData) {
  if (shape.kind === "bar") {
    const length = shape.points
      .slice(1)
      .reduce(
        (s, p, i) => s + Math.hypot(...p.map((v, a) => v - shape.points[i][a])),
        0,
      );
    const r = shape.diameter / 2;
    return {
      volume: Math.PI * r * r * length,
      area: 2 * Math.PI * r * length + 2 * Math.PI * r * r,
    };
  }
  if (shape.kind === "extrusion") {
    const area = polygonArea(shape.outline);
    const perimeter = shape.outline.reduce((s, p, i) => {
      const q = shape.outline[(i + 1) % shape.outline.length];
      return s + Math.hypot(p[0] - q[0], p[1] - q[1]);
    }, 0);
    return {
      volume: area * shape.depth,
      area: 2 * area + perimeter * shape.depth,
    };
  }
  let volume = 0,
    area = 0;
  for (const face of shape.faces) {
    const [a, b, c] = face.map((i) => shape.vertices[i]);
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
    const ab = b.map((n, i) => n - a[i]),
      ac = c.map((n, i) => n - a[i]);
    area +=
      Math.hypot(
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ) / 2;
  }
  return { volume: Math.abs(volume), area };
}

export function validateShape(shape: ShapeData): string | null {
  if (shape.kind === "bar")
    return shapeQuantities(shape).volume > 1e-12
      ? null
      : "Нулевая длина стержня";
  if (shape.kind === "solid") {
    const edges = new Map<string, number>();
    const directions = new Map<string, number>();
    for (const face of shape.faces) {
      if (face.some((i) => i >= shape.vertices.length))
        return "Индекс грани вне массива вершин";
      for (let j = 0; j < 3; j++) {
        const a = face[j],
          b = face[(j + 1) % 3];
        if (a === b) return "Вырожденная грань";
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
        directions.set(key, (directions.get(key) ?? 0) + (a < b ? 1 : -1));
      }
    }
    if ([...edges.values()].some((n) => n !== 2))
      return "Тело должно быть замкнутым";
    if ([...directions.values()].some((n) => n !== 0))
      return "Несогласованная ориентация граней";
  } else {
    const points = shape.outline;
    // Reject self intersections, including collinear overlapping edges.
    const cross = (a: number[], b: number[], c: number[]) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const between = (a: number[], b: number[], c: number[]) =>
      Math.min(a[0], b[0]) - 1e-10 <= c[0] &&
      c[0] <= Math.max(a[0], b[0]) + 1e-10 &&
      Math.min(a[1], b[1]) - 1e-10 <= c[1] &&
      c[1] <= Math.max(a[1], b[1]) + 1e-10;
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9)
        return "Повторяющиеся вершины контура";
      for (let j = i + 1; j < points.length; j++) {
        if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
        const c = points[j],
          d = points[(j + 1) % points.length];
        const p = cross(a, b, c),
          q = cross(a, b, d),
          r = cross(c, d, a),
          s = cross(c, d, b);
        if (
          (p * q < 0 && r * s < 0) ||
          (Math.abs(p) < 1e-10 && between(a, b, c)) ||
          (Math.abs(q) < 1e-10 && between(a, b, d)) ||
          (Math.abs(r) < 1e-10 && between(c, d, a)) ||
          (Math.abs(s) < 1e-10 && between(c, d, b))
        )
          return "Самопересечение контура";
      }
    }
  }
  return shapeQuantities(shape).volume > 1e-12 ? null : "Нулевой объём тела";
}
