import type { Project, Vec3 } from "./model";
import type { ShapeData } from "./engineering";
const minus = (n: number) => (n === 0 ? 0 : -n);
const vector = ([x, y, z]: Vec3): Vec3 => [x, y, minus(z)];
export function drawingShapeToWorld(shape: ShapeData): ShapeData {
  if (shape.kind === "solid")
    return {
      ...shape,
      vertices: shape.vertices.map(vector),
      faces: shape.faces.map(([a, b, c]) => [a, c, b]),
    };
  if (shape.kind === "bar")
    return { ...shape, points: shape.points.map(vector) };
  // For an extrusion along Z the profile is XY and the depth is centred, so
  // reversing the extrusion direction describes the very same solid.
  if (shape.axis === "z")
    return { ...shape, outline: shape.outline.map((p) => [...p]) };
  return {
    ...shape,
    outline: shape.outline
      .map(([u, v]): [number, number] =>
        shape.axis === "y" ? [u, minus(v)] : [minus(u), v],
      )
      .reverse(),
  };
}
// Source plans: horizontal axis -> +X, page-up axis -> -Z, heights -> +Y.
// Apply exactly once at the KZh reconstruction boundary, never to arbitrary
// imported v1/v2 projects or as a negative scale on the rendering scene.
export function drawingPlanToWorld(project: Project): Project {
  return {
    ...project,
    elements: project.elements.map((e) => ({
      ...e,
      position: vector(e.position),
      parts: e.parts.map((p) => ({
        ...p,
        size: [...p.size],
        offset: vector(p.offset),
      })),
      ...(e.shape ? { shape: drawingShapeToWorld(e.shape) } : {}),
      ...(e.evidence
        ? {
            evidence: {
              ...e.evidence,
              ...(e.evidence.bars
                ? {
                    bars: e.evidence.bars.map((b) => ({
                      ...b,
                      points: b.points.map(vector),
                    })),
                  }
                : {}),
            },
          }
        : {}),
    })),
    ...(project.document
      ? {
          document: {
            ...project.document,
            axes: {
              x: project.document.axes.x.map((a) => ({ ...a })),
              z: project.document.axes.z.map((a) => ({
                ...a,
                value: minus(a.value),
              })),
            },
          },
        }
      : {}),
  };
}
