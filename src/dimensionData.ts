import { itemBounds, type SceneItem } from "./objects";
import type { Vec3 } from "./model";
export type DimensionSegment = { from: Vec3; to: Vec3; label: string };
const f = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
export function dimensionData(item: SceneItem) {
  const b = itemBounds(item),
    size = b.max.map((v, a) => v - b.min[a]) as Vec3;
  const gap = Math.max(0.05, Math.min(0.45, Math.hypot(...size) * 0.065));
  const [x, y, z] = b.min,
    [X, Y, Z] = b.max;
  const segments: DimensionSegment[] = [
    {
      from: [x, y - gap, Z + gap],
      to: [X, y - gap, Z + gap],
      label: `X ${f(size[0])} м`,
    },
    {
      from: [X + gap, y, Z + gap],
      to: [X + gap, Y, Z + gap],
      label: `Y ${f(size[1])} м`,
    },
    {
      from: [X + gap, y - gap, z],
      to: [X + gap, y - gap, Z],
      label: `Z ${f(size[2])} м`,
    },
  ];
  const s = item.element.shape;
  const cutouts: DimensionSegment[] = [];
  if (item.kind === "body" && s?.kind === "extrusion") {
    const mins = [0, 1].map((a) => Math.min(...s.outline.map((p) => p[a]))),
      maxs = [0, 1].map((a) => Math.max(...s.outline.map((p) => p[a])));
    const position = ([u, v]: [number, number]): Vec3 =>
      s.axis === "y"
        ? [u, s.depth / 2 + gap * 0.1, v]
        : s.axis === "x"
          ? [s.depth / 2 + gap * 0.1, v, u]
          : [u, v, s.depth / 2 + gap * 0.1];
    for (let i = 0; i < s.outline.length; i++) {
      const a = s.outline[i],
        c = s.outline[(i + 1) % s.outline.length];
      const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const outer = [0, 1].some(
        (k) =>
          Math.abs(a[k] - c[k]) < 1e-7 &&
          (Math.abs(a[k] - mins[k]) < 1e-7 || Math.abs(a[k] - maxs[k]) < 1e-7),
      );
      if (!outer && length >= 0.12 && cutouts.length < 6)
        cutouts.push({
          from: position(a),
          to: position(c),
          label: `Профиль ${f(length)} м`,
        });
    }
  }
  return {
    bounds: b,
    size,
    gap,
    segments,
    cutouts,
    levels: {
      bottom: item.element.position[1] + y,
      top: item.element.position[1] + Y,
    },
  };
}
