import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  ExtrudeGeometry,
  Shape,
  CylinderGeometry,
  Vector3,
  Quaternion,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Element, Vec3 } from "./model";
import type { Bar } from "./engineering";
export function elementGeometries(
  e: Element,
): { geometry: BufferGeometry; offset: Vec3 }[] {
  if (!e.shape)
    return e.parts.map((p) => ({
      geometry: new BoxGeometry(...p.size),
      offset: p.offset,
    }));
  const s = e.shape;
  if (s.kind === "bar") {
    const geometry = barsGeometry([
      { id: e.id, label: e.mark, diameter: s.diameter, points: s.points },
    ]);
    return geometry ? [{ geometry, offset: [0, 0, 0] }] : [];
  }
  if (s.kind === "solid") {
    const g = new BufferGeometry();
    g.setAttribute(
      "position",
      new Float32BufferAttribute(s.vertices.flat(), 3),
    );
    g.setIndex(s.faces.flat());
    const flat = g.toNonIndexed();
    g.dispose();
    flat.computeVertexNormals();
    return [{ geometry: flat, offset: [0, 0, 0] }];
  }
  const shape = new Shape();
  s.outline.forEach(([u, v], i) => {
    const x = s.axis === "x" ? -u : u,
      y = s.axis === "y" ? -v : v;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const g = new ExtrudeGeometry(shape, {
    depth: s.depth,
    bevelEnabled: false,
    steps: 1,
  });
  g.translate(0, 0, -s.depth / 2);
  if (s.axis === "y") g.rotateX(-Math.PI / 2);
  if (s.axis === "x") g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return [{ geometry: g, offset: [0, 0, 0] }];
}
export function barsGeometry(bars: Bar[]): BufferGeometry | null {
  const segments: BufferGeometry[] = [];
  const up = new Vector3(0, 1, 0);
  for (const bar of bars)
    for (let i = 1; i < bar.points.length; i++) {
      const a = new Vector3(...bar.points[i - 1]),
        b = new Vector3(...bar.points[i]);
      const delta = b.clone().sub(a),
        length = delta.length();
      if (length < 1e-8) continue;
      const g = new CylinderGeometry(
        bar.diameter / 2,
        bar.diameter / 2,
        length,
        6,
        1,
        false,
      );
      g.applyQuaternion(
        new Quaternion().setFromUnitVectors(up, delta.normalize()),
      );
      g.translate(...a.add(b).multiplyScalar(0.5).toArray());
      segments.push(g);
    }
  if (!segments.length) return null;
  const merged = mergeGeometries(segments, false);
  segments.forEach((g) => g.dispose());
  return merged;
}
