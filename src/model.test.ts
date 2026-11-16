import { describe, expect, it } from "vitest";
import {
  demo,
  parseProject,
  quantities,
  totals,
  toCSV,
  type Box,
} from "./model";
import { displayPosition, useStore } from "./store";
import { dxfImporter } from "./importers";
const b = (
  size: [number, number, number],
  offset: [number, number, number] = [0, 0, 0],
): Box => ({ size, offset });
describe("Точные количества", () => {
  it("прямоугольный параллелепипед", () =>
    expect(quantities([b([2, 3, 4])])).toEqual({ volume: 24, area: 52 }));
  it("пересечения составного тела считаются один раз", () =>
    expect(quantities([b([2, 2, 2]), b([2, 2, 2], [1, 0, 0])])).toEqual({
      volume: 12,
      area: 32,
    }));
  it("сквозной проём из четырёх непересекающихся частей", () => {
    const q = quantities([
      b([1, 4, 1], [-1.5, 0, 0]),
      b([1, 4, 1], [1.5, 0, 0]),
      b([2, 1, 1], [0, 1.5, 0]),
      b([2, 1, 1], [0, -1.5, 0]),
    ]);
    expect(q.volume).toBe(12);
    expect(q.area).toBe(48);
  });
  it("полость учитывает внутренние поверхности", () => {
    expect(
      quantities([
        b([3, 1, 3], [0, 1, 0]),
        b([3, 1, 3], [0, -1, 0]),
        b([1, 1, 3], [-1, 0, 0]),
        b([1, 1, 3], [1, 0, 0]),
        b([1, 1, 1], [0, 0, -1]),
        b([1, 1, 1], [0, 0, 1]),
      ]),
    ).toEqual({ volume: 26, area: 60 });
  });
  it("защита от слишком сложной геометрии", () =>
    expect(() =>
      quantities(
        Array.from({ length: 40 }, (_, i) =>
          b([1, 1, 1], [i * 2, i * 2, i * 2]),
        ),
      ),
    ).toThrow());
});
describe("Проекты и представление", () => {
  it("демо содержит все группы и уникальные ID", () => {
    const p = demo();
    expect(new Set(p.elements.map((e) => e.id)).size).toBe(p.elements.length);
    expect(new Set(p.elements.map((e) => e.category)).size).toBe(9);
    expect(p.elements.every((e) => e.confidence === "assumed")).toBe(true);
    expect(parseProject(JSON.stringify(p))).toEqual(p);
  });
  it("параметризация и некорректные длины", () => {
    expect(demo(12).elements.length).toBeLessThan(demo(36).elements.length);
    expect(() => demo(13)).toThrow();
    expect(() => demo(NaN)).toThrow();
  });
  it("перемещения и разборка не влияют на объём / координаты", () => {
    const p = demo();
    useStore.getState().load(p);
    const before = JSON.stringify(p);
    const summary = totals(p.elements);
    useStore
      .getState()
      .set({ offsets: { "demo-1": [2, 3, 4] }, exploded: true });
    expect(displayPosition([1, 2, 3], [2, 3, 4], true, 2)).toEqual([3, 8.2, 7]);
    expect(totals(useStore.getState().project.elements)).toEqual(summary);
    expect(JSON.stringify(p)).toBe(before);
    useStore.getState().reset();
    expect(useStore.getState().offsets).toEqual({});
    expect(useStore.getState().exploded).toBe(false);
  });
  it("ведомость суммирует каждый элемент", () => {
    const p = demo();
    const total = Object.values(totals(p.elements)).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(
      p.elements.reduce((a, e) => a + quantities(e.parts).volume, 0),
      8,
    );
    expect(toCSV(p).split("\r\n")).toHaveLength(p.elements.length + 1);
  });
  it("CSV экранирует кавычки и формулы", () => {
    const p = demo();
    p.elements[0].name = '=HYPERLINK("bad")';
    expect(toCSV(p)).toContain('"\'=HYPERLINK(""bad"")"');
  });
  it("отклоняет новые версии, отрицательные размеры, дубли и NaN", () => {
    const p = demo();
    expect(() => parseProject(JSON.stringify({ ...p, version: 2 }))).toThrow();
    p.elements[0].parts[0].size[0] = -1;
    expect(() => parseProject(JSON.stringify(p))).toThrow();
    const d = demo();
    d.elements.push(d.elements[0]);
    expect(() => parseProject(JSON.stringify(d))).toThrow();
    d.elements[0].position[0] = NaN;
    expect(() => parseProject(JSON.stringify(d))).toThrow();
  });
  it("отклоняет сломанные связи и циклы", () => {
    const p = demo();
    p.elements[0].parentId = "missing";
    expect(() => parseProject(JSON.stringify(p))).toThrow();
    p.elements[0].parentId = p.elements[1].id;
    p.elements[1].parentId = p.elements[0].id;
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
});
describe("DXF чертёж", () => {
  it("читает LINE без изобретения размеров", () => {
    const d = dxfImporter.parse(
      "0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n30\n0\n11\n10\n21\n5\n31\n0\n0\nENDSEC\n0\nEOF\n",
      "test.dxf",
    );
    expect(d.segments).toEqual([
      [
        [0, 0, 0],
        [10, 5, 0],
      ],
    ]);
    expect(d.units).toBe("не заданы");
  });
  it("сообщает о неподдерживаемом файле", () =>
    expect(() => dxfImporter.parse("broken", "bad.dxf")).toThrow());
});
