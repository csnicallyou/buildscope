import { describe, it, expect } from "vitest";
import { intersectionVolume, inspectModel } from "./inspection";
import { demo, type Element } from "./model";
import {
  matchesFilters,
  emptyFilters,
  barKind,
  sceneOptions,
} from "./viewRules";
import { dimensionData } from "./dimensionData";
import { visibleItems } from "./objects";
import { useStore } from "./store";
import { createKzh } from "./kzh";
const box = (id: string, x = 0): Element => ({
  ...demo().elements[0],
  id,
  position: [x, 0, 0],
  shape: undefined,
  parts: [{ size: [2, 2, 2], offset: [0, 0, 0] }],
  category: "ФБС",
  material: "Бетон",
});
describe("Проверки геометрии", () => {
  it("считает объединение без двойного объёма", () => {
    const a = box("a");
    a.parts.push({ ...a.parts[0] });
    expect(intersectionVolume(a, box("b", 1))).toBe(4);
  });
  it("не считает вырез пересечением по габаритам", () => {
    const a = box("a");
    a.parts = [];
    a.shape = {
      kind: "extrusion",
      axis: "y",
      depth: 2,
      outline: [
        [-2, -2],
        [2, -2],
        [2, 2],
        [1, 2],
        [1, -1],
        [-1, -1],
        [-1, 2],
        [-2, 2],
      ],
    };
    const b = box("b");
    b.parts = [{ size: [1, 1, 1], offset: [0, 0, 0] }];
    expect(intersectionVolume(a, b)).toBe(0);
    expect(
      inspectModel([a, b]).findings.filter((f) => f.kind === "overlap"),
    ).toHaveLength(0);
  });
  it("разделяет коллизии, швы, дубли и незаданные материалы", () => {
    const missing = box("m", 10);
    missing.material = "";
    const r = inspectModel([
      box("a"),
      box("dup"),
      box("b", 1),
      box("gap", 3.02),
      missing,
    ]);
    expect(r.findings.some((f) => f.kind === "duplicate")).toBe(true);
    expect(
      r.findings.some(
        (f) => f.kind === "overlap" && f.method === "exact" && f.value === 4,
      ),
    ).toBe(true);
    expect(
      r.findings.some(
        (f) => f.kind === "gap" && Math.abs(f.value! - 0.02) < 1e-6,
      ),
    ).toBe(true);
    expect(r.findings.some((f) => f.kind === "material")).toBe(true);
  });
  it("ограничивает большие модели без квадратичной таблицы дублей", () => {
    const r = inspectModel(
      Array.from({ length: 2100 }, (_, i) => box(String(i))),
    );
    expect(r.truncated).toBe(true);
    expect(r.tested).toBe(2000);
  });
});
describe("Инструменты представления", () => {
  it("фильтры не меняют исходные количества и данные", () => {
    const project = createKzh("canopy");
    const before = JSON.stringify(project);
    useStore.getState().load(project);
    const s = useStore.getState();
    const visible = visibleItems(project, null, [], null, null, {
      ...sceneOptions(s),
      filters: { ...emptyFilters, material: "Щебень" },
    });
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((i) => i.element.material === "Щебень")).toBe(true);
    expect(JSON.stringify(project)).toBe(before);
    expect(
      matchesFilters(box("a"), { ...emptyFilters, category: "Несуществующий" }),
    ).toBe(false);
  });
  it("размеры и отметки берутся из исходного тела", () => {
    const e = box("a");
    e.position = [0, -5, 0];
    const d = dimensionData({
      id: e.id,
      element: e,
      kind: "body",
      label: e.name,
      layer: 0,
    });
    expect(d.size).toEqual([2, 2, 2]);
    expect(d.levels).toEqual({ bottom: -6, top: -4 });
  });
  it("сетки, хомуты и анкеры разделены", () => {
    expect(barKind("Сетка С1")).toBe("grid");
    expect(barKind("Х1")).toBe("stirrup");
    expect(barKind("Анкер M24")).toBe("anchor");
    expect(barKind("Продольная")).toBe("other");
  });
});
import { Mesh, MeshBasicMaterial, DoubleSide, Vector3 } from "three";
import { elementGeometries } from "./geometry";
import { pointInsideMesh } from "./SectionCap";
it("выбор заливки учитывает вырезы и положение тела", () => {
  const e = box("notch");
  e.parts = [];
  e.shape = {
    kind: "extrusion",
    axis: "y",
    depth: 2,
    outline: [
      [-2, -2],
      [2, -2],
      [2, 2],
      [1, 2],
      [1, -1],
      [-1, -1],
      [-1, 2],
      [-2, 2],
    ],
  };
  const g = elementGeometries(e)[0];
  const mesh = new Mesh(
    g.geometry,
    new MeshBasicMaterial({ side: DoubleSide }),
  );
  mesh.matrixWorld.makeTranslation(10, 0, 0);
  expect(pointInsideMesh(mesh, new Vector3(10, 0, 0))).toBe(false);
  expect(pointInsideMesh(mesh, new Vector3(11.5, 0, 0))).toBe(true);
  expect(pointInsideMesh(mesh, new Vector3(15, 0, 0))).toBe(false);
  g.geometry.dispose();
  (mesh.material as MeshBasicMaterial).dispose();
});
it("сложная форма даёт только кандидата по габаритам", () => {
  const a = box("solid");
  a.parts = [];
  a.shape = {
    kind: "solid",
    vertices: [
      [-1, -1, -1],
      [1, -1, -1],
      [0, 1, -1],
      [0, 0, 1],
    ],
    faces: [
      [0, 2, 1],
      [0, 1, 3],
      [1, 2, 3],
      [2, 0, 3],
    ],
  };
  expect(intersectionVolume(a, box("b"))).toBeNull();
  expect(
    inspectModel([a, box("b")]).findings.find((f) => f.kind === "overlap")
      ?.method,
  ).toBe("bounds");
});
