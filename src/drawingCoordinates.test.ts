import { it, expect } from "vitest";
import {
  Vector3,
  PerspectiveCamera,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  Raycaster,
} from "three";
import { drawingPlanToWorld, drawingShapeToWorld } from "./drawingCoordinates";
import { createKzh } from "./kzh";
import { parseProject, elementQuantities, totals, demo } from "./model";
import { elementGeometries } from "./geometry";
import { validateShape } from "./engineering";
function screen(p: Vector3) {
  const cam = new PerspectiveCamera(42, 1, 0.01, 1000);
  cam.position.set(0, 100, 0.01);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return p.clone().project(cam);
}
it("лист 8: цифры идут слева направо, А снизу, Е сверху при взгляде с +Y", () => {
  const p = createKzh("canopy"),
    d = p.document!;
  expect(d.axes.z.map((a) => a.value)).toEqual([
    0, -1.055, -4.155, -10.675, -13.775, -21.025,
  ]);
  const a = screen(new Vector3(0, 0, d.axes.z[0].value)),
    e = screen(new Vector3(0, 0, d.axes.z[5].value));
  expect(e.y).toBeGreaterThan(a.y);
  expect(screen(new Vector3(d.axes.x[10].value, 0, 0)).x).toBeGreaterThan(a.x);
  expect(p.elements.find((e) => e.name === "Балка Бм2")!.position[2]).toBe(
    -21.025,
  );
  expect(p.elements.find((e) => e.mark === "Лм1")!.position[2]).toBe(-0.885);
});
it("знак второй координаты меняется также в смещениях частей и арматуре", () => {
  const source = demo(),
    e = source.elements[0];
  e.parts = [{ size: [2, 1, 3], offset: [1, 2, 3] }];
  e.position = [4, 5, 6];
  e.evidence = {
    pages: [1],
    sheet: "synthetic",
    assembly: "synthetic",
    representation: "dimensioned",
    notes: [],
    bars: [
      {
        id: "b",
        label: "Сетка",
        diameter: 0.01,
        points: [
          [1, 2, 3],
          [4, 5, 6],
        ],
      },
    ],
  };
  const before = JSON.stringify(source),
    result = drawingPlanToWorld(source),
    r = result.elements[0];
  expect(r.position).toEqual([4, 5, -6]);
  expect(r.parts[0].offset).toEqual([1, 2, -3]);
  expect(r.evidence!.bars![0].points).toEqual([
    [1, 2, -3],
    [4, 5, -6],
  ]);
  expect(JSON.stringify(source)).toBe(before);
});
it("вырез отражается вместе с телом, а не становится наружной гранью", () => {
  const e = createKzh("canopy").elements.find((e) => e.mark === "Фм2")!;
  const parts = elementGeometries(e),
    material = new MeshBasicMaterial({ side: DoubleSide });
  const hit = (z: number) =>
    parts.some((g) => {
      const mesh = new Mesh(g.geometry, material);
      mesh.position.set(...g.offset);
      mesh.updateMatrixWorld();
      return (
        new Raycaster(
          new Vector3(0, 2, z),
          new Vector3(0, -1, 0),
        ).intersectObject(mesh).length > 0
      );
    });
  expect(hit(0.8)).toBe(false);
  expect(hit(-0.8)).toBe(true);
  parts.forEach((g) => g.geometry.dispose());
  material.dispose();
});
it("объёмы, площади, материалы и нормали замкнутых тел сохраняются", () => {
  for (const assembly of ["canopy", "pavilion"] as const) {
    const current = createKzh(assembly),
      opposite = drawingPlanToWorld(current);
    expect(parseProject(JSON.stringify(current))).toEqual(current);
    for (const [material, volume] of Object.entries(totals(current.elements)))
      expect(volume).toBeCloseTo(totals(opposite.elements)[material], 8);
    current.elements.forEach((e, i) => {
      const q = elementQuantities(e),
        r = elementQuantities(opposite.elements[i]);
      expect(q.volume).toBeCloseTo(r.volume, 9);
      expect(q.area).toBeCloseTo(r.area, 8);
      if (e.shape) expect(validateShape(e.shape)).toBeNull();
    });
  }
});
it("экструзии X/Y/Z и стержни после двойного отражения возвращают форму", () => {
  for (const axis of ["x", "y", "z"] as const) {
    const shape = {
      kind: "extrusion" as const,
      axis,
      depth: 0.8,
      outline: [
        [0, 0],
        [2, 0],
        [1, 3],
      ] as [number, number][],
    };
    expect(drawingShapeToWorld(drawingShapeToWorld(shape))).toEqual(shape);
  }
  const shape = {
    kind: "bar" as const,
    diameter: 0.01,
    points: [
      [1, 2, 3],
      [3, 4, 5],
    ] as [number, number, number][],
  };
  expect(drawingShapeToWorld(drawingShapeToWorld(shape))).toEqual(shape);
});
