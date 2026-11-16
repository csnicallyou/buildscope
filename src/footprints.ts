import pc, { type Polygon, type MultiPolygon } from "polygon-clipping";
import type { Element } from "./model";
export function footprintPolygons(e: Element): MultiPolygon {
  const polygons: Polygon[] = [];
  const s = e.shape;
  if (s?.kind === "bar") return [];
  if (s?.kind === "extrusion") {
    if (s.axis === "y") polygons.push([s.outline]);
    else {
      const u = s.outline.map((p) => p[0]),
        a = Math.min(...u),
        b = Math.max(...u),
        d = s.depth / 2;
      polygons.push(
        s.axis === "x"
          ? [
              [
                [-d, a],
                [d, a],
                [d, b],
                [-d, b],
              ],
            ]
          : [
              [
                [a, -d],
                [b, -d],
                [b, d],
                [a, d],
              ],
            ],
      );
    }
  } else if (s?.kind === "solid") {
    for (const face of s.faces) {
      const ring = face.map(
        (i) => [s.vertices[i][0], s.vertices[i][2]] as [number, number],
      );
      if (
        Math.abs(
          ring.reduce((v, p, i) => {
            const q = ring[(i + 1) % ring.length];
            return v + p[0] * q[1] - q[0] * p[1];
          }, 0),
        ) > 1e-10
      )
        polygons.push([ring]);
    }
  } else
    for (const p of e.parts) {
      const [x, , z] = p.offset,
        [w, , d] = p.size;
      polygons.push([
        [
          [x - w / 2, z - d / 2],
          [x + w / 2, z - d / 2],
          [x + w / 2, z + d / 2],
          [x - w / 2, z + d / 2],
        ],
      ]);
    }
  return polygons.length ? pc.union(polygons[0], ...polygons.slice(1)) : [];
}
export function pointInFootprint(polygons: MultiPolygon, x: number, z: number) {
  const inside = (ring: number[][]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (
        a[1] > z !== b[1] > z &&
        x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
      )
        hit = !hit;
    }
    return hit;
  };
  return polygons.some((p) => inside(p[0]) && !p.slice(1).some(inside));
}
