import type { RebarSpec } from "../engineering";
type Row = [
  string,
  string,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];
// position, grade, diameter(mm), count, cut length(m), aggregate length(m), unit kg, total kg.
const rows = (page: number, list: Row[]): RebarSpec[] =>
  list.map(
    ([
      position,
      grade,
      diameter,
      count,
      length,
      totalLength,
      unitMass,
      totalMass,
    ]) => ({
      position,
      name: position === "1" ? "Основные стержни" : position,
      grade,
      diameter,
      count,
      length,
      totalLength,
      unitMass,
      totalMass,
      page,
    }),
  );
const slab = (
  page: number,
  sk: number,
  f: number,
  sp: number,
  aggregate: number,
  mainMass: number,
): RebarSpec[] =>
  rows(page, [
    ["Ск1", "A500C", 12, sk, 0.9, null, 0.8, +(sk * 0.8).toFixed(1)],
    ["Ф1", "A240", 8, f, 1.225, null, 0.48, +(f * 0.48).toFixed(1)],
    ["СП1", "A240", 12, sp, 1.01, null, 0.9, +(sp * 0.9).toFixed(1)],
    ["1", "A500C", 12, null, null, aggregate, 0.89, mainMass],
  ]);
export const pavilionRebar: Record<string, RebarSpec[]> = {
  Пм1: slab(10, 78, 40, 8, 324.5, 288.2),
  Пм2: slab(10, 68, 28, 6, 228.2, 202.6),
  Пм3: slab(10, 70, 31, 6, 249.2, 221.3),
};
export const canopyRebar: Record<string, RebarSpec[]> = {
  "Пм1.1": slab(25, 70, 28, 6, 221.9, 197.1),
  "Пм1.2": [
    ...slab(25, 80, 28, 6, 221.9, 197.1),
    ...rows(25, [["2", "A500C", 12, 10, 1.95, null, 1.73, 17.3]]),
  ],
  "Пм2.1": slab(25, 54, 19, 6, 148.3, 131.7),
  "Пм2.2": [
    ...slab(25, 77, 18, 6, 140.9, 125.1),
    ...rows(25, [
      ["2", "A500C", 12, 6, 0.9, null, 0.8, 4.8],
      ["3", "A500C", 12, 4, 1.67, null, 1.48, 5.9],
      ["4", "A500C", 12, 2, 1.95, null, 1.73, 3.5],
    ]),
  ],
  "Пм2.3": [
    ...slab(25, 75, 18, 6, 138.2, 122.7),
    ...rows(25, [
      ["2", "A500C", 12, 6, 1.17, null, 1.04, 6.2],
      ["3", "A500C", 12, 4, 1.67, null, 1.48, 5.9],
      ["4", "A500C", 12, 2, 1.95, null, 1.73, 3.5],
    ]),
  ],
  Пм3: slab(25, 74, 33, 6, 263.4, 233.9),
  Пм4: slab(25, 144, 36, 8, 572.7, 508.6),
  Пм5: slab(25, 56, 21, 6, 161.4, 143.3),
  Пм6: rows(25, [
    ["Х1", "A240", 8, 150, 0.815, null, 0.32, 48],
    ["СП1", "A240", 12, 6, 1.01, null, 0.9, 5.4],
    ["1", "A500C", 16, 10, 8.94, null, 14.11, 141.1],
  ]),
  Бм1: rows(25, [
    ["Х2", "A240", 8, 90, 1.595, null, 0.63, 56.7],
    ["Ск5", "A500C", 16, 2, 1.95, null, 3.08, 6.2],
    ["Ск6", "A500C", 16, 8, 2.34, null, 3.69, 29.5],
    ["Ш2", "A240", 8, 45, 0.47, null, 0.19, 8.6],
    ["СП1", "A240", 12, 6, 1.01, null, 0.9, 5.4],
    ["1", "A500C", 16, 10, 7.1, null, 11.2, 112],
  ]),
  Бм2: rows(25, [
    ["Х2", "A240", 8, 168, 1.595, null, 0.63, 105.8],
    ["Ск5", "A500C", 16, 2, 1.95, null, 3.08, 6.2],
    ["Ск6", "A500C", 16, 8, 2.34, null, 3.69, 29.5],
    ["Ш2", "A240", 8, 84, 0.47, null, 0.19, 16],
    ["СП1", "A240", 12, 8, 1.01, null, 0.9, 7.2],
    ["1", "A500C", 16, 14, 11.03, null, 17.41, 243.7],
  ]),
  Лм1: rows(26, [
    ["М1", "A500C", 12, 24, 0.87, null, 0.77, 18.5],
    ["М2", "A500C", 12, 120, 0.715, null, 0.63, 75.6],
    ["Х3", "A240", 8, 38, 1.84, null, 0.73, 27.7],
    ["Ск2", "A500C", 12, 48, 1.95, null, 1.73, 83],
    ["Ск3", "A500C", 12, 5, 1.95, null, 1.73, 8.7],
    ["Ск4", "A500C", 12, 4, 1.95, null, 1.73, 6.9],
    ["Ск7", "A500C", 12, 10, 1.3, null, 1.15, 11.5],
    ["Ф2", "A240", 8, 12, 1.265, null, 0.5, 6],
    ["1", "A500C", 12, 48, 2.43, null, 2.16, 103.7],
    ["2", "A500C", 12, 4, 3.9, null, 3.46, 13.8],
    ["3", "A500C", 12, 43, 4.71, null, 4.18, 179.7],
  ]),
};
const footing = (sk: number, f: number, l: number, m: number) =>
  rows(27, [
    ["Ск1", "A500C", 16, sk, 1.95, null, 3.08, +(sk * 3.08).toFixed(1)],
    ["Ф1", "A240", 10, f, 1.68, null, 1.04, +(f * 1.04).toFixed(1)],
    ["1", "A500C", 16, null, null, l, 1.58, m],
  ]);
export const foundationRebar: Record<string, RebarSpec[]> = {
  Фм1: footing(48, 16, 121.4, 191.6),
  Фм2: [
    ...footing(48, 45, 326.7, 515.6),
    ...rows(27, [
      ["М-1", "A500C", 12, 24, 1.815, null, 1.61, 38.6],
      ["М-2", "A500C", 12, 24, 1.75, null, 1.55, 37.2],
      ["Ск2", "A500C", 12, 24, 1.82, null, 1.62, 38.9],
    ]),
  ],
  Фм3: footing(58, 16, 181.3, 286),
  // PDF27, sheet22: printed total is 282,4 kg (previous transcription:284,4).
  Фм4: footing(60, 22, 179, 282.4),
};
// Literal totals as printed in the steel schedules, kept separately from rounded row products.
export const steelSchedule = {
  pavilion: { total: 3556.2, anchors: 21.7 },
  canopy: { total: 5121.6, anchors: 19.1, foundations: 7183.8 },
};
