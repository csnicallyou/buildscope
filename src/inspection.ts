import pc, {
  type MultiPolygon,
  type Polygon,
  type Pair,
} from "polygon-clipping";
import { elementBounds, type Element, type Vec3 } from "./model";
import { needsReview } from "./viewRules";
type Prism = { bottom: number; top: number; polygon: Polygon };
const eps = 1e-7;
function prisms(e: Element): Prism[] | null {
  if (e.shape && (e.shape.kind !== "extrusion" || e.shape.axis !== "y"))
    return null;
  if (e.shape?.kind === "extrusion")
    return [
      {
        bottom: e.position[1] - e.shape.depth / 2,
        top: e.position[1] + e.shape.depth / 2,
        polygon: [
          e.shape.outline.map(
            ([x, z]) => [x + e.position[0], z + e.position[2]] as Pair,
          ),
        ],
      },
    ];
  return e.parts.map((p) => {
    const [x, y, z] = p.offset.map((v, a) => v + e.position[a]),
      [w, h, d] = p.size;
    return {
      bottom: y - h / 2,
      top: y + h / 2,
      polygon: [
        [
          [x - w / 2, z - d / 2],
          [x + w / 2, z - d / 2],
          [x + w / 2, z + d / 2],
          [x - w / 2, z + d / 2],
        ],
      ],
    };
  });
}
const area = (polygons: MultiPolygon) =>
  polygons.reduce(
    (sum, polygon) =>
      sum +
      polygon.reduce((s, ring, i) => {
        const a =
          Math.abs(
            ring.reduce((v, p, k) => {
              const q = ring[(k + 1) % ring.length];
              return v + p[0] * q[1] - q[0] * p[1];
            }, 0),
          ) / 2;
        return s + (i === 0 ? a : -a);
      }, 0),
    0,
  );
// Exact for unions of AABBs and vertical polygon extrusions, including notches.
// Other shapes explicitly return null: a bounding-box hit is not a solid hit.
export function intersectionVolume(a: Element, b: Element): number | null {
  const aa = prisms(a),
    bb = prisms(b);
  if (!aa || !bb) return null;
  const ys = [
    ...new Set([...aa, ...bb].flatMap((p) => [p.bottom, p.top])),
  ].sort((a, b) => a - b);
  let volume = 0;
  for (let i = 0; i < ys.length - 1; i++) {
    const mid = (ys[i] + ys[i + 1]) / 2;
    const active = (list: Prism[]) =>
      list.filter((p) => p.bottom < mid && p.top > mid).map((p) => p.polygon);
    const ap = active(aa),
      bp = active(bb);
    if (!ap.length || !bp.length) continue;
    const au = pc.union(ap[0], ...ap.slice(1)),
      bu = pc.union(bp[0], ...bp.slice(1));
    volume += area(pc.intersection(au, bu)) * (ys[i + 1] - ys[i]);
  }
  return Math.max(0, volume);
}
export type FindingKind =
  "overlap" | "gap" | "duplicate" | "material" | "unverified";
export type Finding = {
  id: string;
  kind: FindingKind;
  ids: string[];
  title: string;
  detail: string;
  method: "exact" | "bounds" | "metadata";
  value?: number;
};
export type InspectionResult = {
  findings: Finding[];
  total: number;
  tested: number;
  excluded: number;
  pairs: number;
  truncated: boolean;
};
export function worldBounds(e: Element): { min: Vec3; max: Vec3 } {
  const b = elementBounds(e);
  return {
    min: b.min.map((v, a) => v + e.position[a]) as Vec3,
    max: b.max.map((v, a) => v + e.position[a]) as Vec3,
  };
}
function fingerprint(e: Element) {
  return JSON.stringify({
    position: e.position,
    shape: e.shape,
    parts: e.parts.map((p) => JSON.stringify(p)).sort(),
  });
}
export function inspectModel(
  elements: Element[],
  gapLimit = 0.03,
): InspectionResult {
  const findings: Finding[] = [];
  let pairs = 0,
    truncated = false;
  const add = (
    kind: FindingKind,
    ids: string[],
    title: string,
    detail: string,
    method: Finding["method"],
    value?: number,
  ) => {
    if (findings.length >= 1500) {
      truncated = true;
      return;
    }
    findings.push({
      id: `${kind}:${ids.join("|")}`,
      kind,
      ids,
      title,
      detail,
      method,
      value,
    });
  };
  for (const e of elements) {
    if (
      !e.material.trim() ||
      /^(не задан[оа]?|неизвест[а-я]*|unknown|[-—])$/i.test(e.material.trim())
    )
      add(
        "material",
        [e.id],
        "Материал не задан",
        `${e.name}: заполните материал по исходному документу.`,
        "metadata",
      );
    else if (/не задан|неизвест/i.test(e.material))
      add(
        "material",
        [e.id],
        "Материал или класс требует уточнения",
        `${e.name}: ${e.material}.`,
        "metadata",
      );
    if (needsReview(e))
      add(
        "unverified",
        [e.id],
        "Есть допущение или неуточнённые данные",
        `${e.name}. ${e.evidence?.notes.join(" ") || e.source}`,
        "metadata",
      );
  }
  const candidates = elements.filter(
    (e) => !["diagram", "envelope"].includes(e.evidence?.representation ?? ""),
  );
  const groups = new Map<string, Element[]>();
  for (const e of candidates) {
    const key = fingerprint(e);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const fingerprints = new Map(candidates.map((e) => [e.id, fingerprint(e)]));
  for (const group of groups.values())
    if (group.length > 1) {
      add(
        "duplicate",
        group.map((e) => e.id),
        "Совпадающая геометрия и положение",
        `${group.length} элементов имеют одинаковое описание тела и координаты. Материалы могут различаться; перед удалением сверить источник.`,
        "exact",
      );
    }
  const limited = candidates.slice(0, 2000);
  if (limited.length < candidates.length) truncated = true;
  const indexed = limited
    .map((e) => ({ e, b: worldBounds(e) }))
    .sort((a, b) => a.b.min[0] - b.b.min[0]);
  outer: for (let i = 0; i < indexed.length; i++)
    for (let j = i + 1; j < indexed.length; j++) {
      const a = indexed[i],
        b = indexed[j];
      if (b.b.min[0] > a.b.max[0] + gapLimit) break;
      if (++pairs > 50000) {
        truncated = true;
        break outer;
      }
      if (fingerprints.get(a.e.id) === fingerprints.get(b.e.id)) continue;
      const overlap = [0, 1, 2].map(
        (k) =>
          Math.min(a.b.max[k], b.b.max[k]) - Math.max(a.b.min[k], b.b.min[k]),
      );
      if (overlap.some((d) => d < -gapLimit)) continue;
      if (overlap.every((d) => d > eps)) {
        let volume: number | null = null;
        try {
          volume = intersectionVolume(a.e, b.e);
        } catch {
          /* Explicitly retain a bounds-only candidate. */
        }
        if (volume !== null && volume <= eps) continue;
        add(
          "overlap",
          [a.e.id, b.e.id],
          volume === null
            ? "Возможное пересечение по габаритам"
            : "Пересечение тел модели",
          volume === null
            ? "Габариты пересекаются, но точное пересечение этих профилей не вычислено. Это кандидат, не подтверждённая коллизия."
            : `Пересечение геометрии ${volume.toLocaleString("ru-RU", { maximumFractionDigits: 6 })} м³. Проверить назначение сопряжения и исходный чертёж; это не вывод об ошибке проекта.`,
          volume === null ? "bounds" : "exact",
          volume ?? undefined,
        );
      } else {
        const negative = overlap.filter((d) => d < -eps);
        const related =
          a.e.parentId === b.e.id ||
          b.e.parentId === a.e.id ||
          (a.e.parentId && a.e.parentId === b.e.parentId);
        const sameCategory =
          a.e.category === b.e.category &&
          ["ФБС", "ФЛ", "Плиты", "Балки"].includes(a.e.category);
        const stack =
          overlap[1] < -eps &&
          [a.e.category, b.e.category].every((c) =>
            [
              "ФБС",
              "ФЛ",
              "Плиты",
              "Балки",
              "Подготовка",
              "Фундаменты Фм",
            ].includes(c),
          );
        if (
          negative.length === 1 &&
          overlap.filter((d) => d > eps).length === 2 &&
          (related || sameCategory || stack)
        ) {
          const gap = -negative[0];
          add(
            "gap",
            [a.e.id, b.e.id],
            "Зазор между соседними телами",
            `${(gap * 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} мм по габаритам. Может быть проектным швом или допустимым сопряжением; сверить размеры и примечания.`,
            "bounds",
            gap,
          );
        }
      }
    }
  return {
    findings,
    total: elements.length,
    tested: limited.length,
    excluded: elements.length - candidates.length,
    pairs,
    truncated,
  };
}
