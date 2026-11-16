import templateUrl from "./assets/work-order-template.xlsx?url";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { crewHours, reportErrors, type WorkDraft } from "./workOrders";
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
type Cell =
  string | number | null | { formula: string; cached: number | string | null };
const serial = (date: string) =>
  Math.round(
    (Date.parse(date + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 86400000,
  );
const fraction = (t: string) =>
  t ? +t.slice(0, 2) / 24 + +t.slice(3, 5) / 1440 : null;
function xml(text: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length)
    throw Error("Не удалось прочитать шаблон Excel");
  return doc;
}
function updateSheet(bytes: Uint8Array, rows: Cell[][], columns: number) {
  const doc = xml(strFromU8(bytes)),
    data = doc.getElementsByTagNameNS(NS, "sheetData")[0];
  const original = Array.from(data.children),
    header = original[0],
    prototype = original.find((r) => r.getAttribute("r") === "2");
  const styleMap = new Map(
    Array.from(prototype?.children ?? []).map((c) => [
      c.getAttribute("r")!.replace(/\d/g, ""),
      c.getAttribute("s"),
    ]),
  );
  data.replaceChildren(header);
  const actual = rows.length
    ? rows
    : [Array.from({ length: columns }, () => null)];
  for (let i = 0; i < actual.length; i++) {
    const row = doc.createElementNS(NS, "row");
    row.setAttribute("r", String(i + 2));
    const widths =
      columns === 18
        ? [
            6, 13, 24, 11, 24, 24, 14, 48, 13, 12, 13, 24, 19, 17, 45, 32, 28,
            52,
          ]
        : columns === 11
          ? [6, 13, 24, 24, 11, 30, 20, 23, 20, 44, 18]
          : [54, 13, 17, 17, 17, 17];
    const lines = Math.max(
      1,
      ...actual[i].map((value, j) =>
        typeof value === "string"
          ? value
              .split("\n")
              .reduce(
                (n, line) =>
                  n + Math.max(1, Math.ceil(line.length / (widths[j] * 0.85))),
                0,
              )
          : 1,
      ),
    );
    row.setAttribute("ht", String(Math.min(409, Math.max(36, lines * 14 + 8))));
    row.setAttribute("customHeight", "1");
    for (let j = 0; j < columns; j++) {
      const letter = String.fromCharCode(65 + j),
        cell = doc.createElementNS(NS, "c");
      cell.setAttribute("r", letter + (i + 2));
      const style = styleMap.get(letter);
      if (style) cell.setAttribute("s", style);
      const value = actual[i][j] ?? null;
      if (typeof value === "number") {
        if (!Number.isFinite(value))
          throw Error("В отчёте есть недопустимое число");
        const v = doc.createElementNS(NS, "v");
        v.textContent = String(value);
        cell.appendChild(v);
      } else if (typeof value === "string") {
        cell.setAttribute("t", "inlineStr");
        const is = doc.createElementNS(NS, "is"),
          t = doc.createElementNS(NS, "t");
        t.setAttributeNS(
          "http://www.w3.org/XML/1998/namespace",
          "xml:space",
          "preserve",
        );
        t.textContent = value;
        is.appendChild(t);
        cell.appendChild(is);
      } else if (value) {
        const f = doc.createElementNS(NS, "f");
        f.textContent = value.formula.replace(/^=/, "");
        cell.appendChild(f);
        if (value.cached !== null) {
          if (typeof value.cached === "string") cell.setAttribute("t", "str");
          const v = doc.createElementNS(NS, "v");
          v.textContent = String(value.cached);
          cell.appendChild(v);
        }
      }
      row.appendChild(cell);
    }
    data.appendChild(row);
  }
  const ref = `A1:${String.fromCharCode(64 + columns)}${actual.length + 1}`;
  doc.getElementsByTagNameNS(NS, "dimension")[0]?.setAttribute("ref", ref);
  for (const filter of Array.from(doc.getElementsByTagNameNS(NS, "autoFilter")))
    filter.setAttribute("ref", ref);
  return { bytes: strToU8(new XMLSerializer().serializeToString(doc)), ref };
}
function updateTable(bytes: Uint8Array, ref: string) {
  const doc = xml(strFromU8(bytes));
  doc.documentElement.setAttribute("ref", ref);
  for (const f of Array.from(doc.getElementsByTagNameNS(NS, "autoFilter")))
    f.setAttribute("ref", ref);
  return strToU8(new XMLSerializer().serializeToString(doc));
}
export async function createWorkOrder(draft: WorkDraft) {
  const errors = reportErrors(draft);
  if (errors.length) throw Error(errors.join("\n"));
  if (draft.rows.length > 500 || draft.crew.length > 200)
    throw Error("За один раз можно выгрузить до 500 работ и 200 строк табеля");
  const response = await fetch(templateUrl);
  if (!response.ok) throw Error("Не удалось загрузить шаблон наряда");
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const rows: Cell[][] = draft.rows.map((r, i) => [
    i + 1,
    serial(r.date),
    r.site,
    r.shift,
    r.contractor,
    r.zone,
    r.axes,
    r.work,
    r.plan,
    r.unit,
    r.actual,
    r.equipment,
    r.brand,
    r.plate,
    r.note,
    r.target,
    r.elementIds.join("; "),
    r.plan === r.modelPlan
      ? r.basis
      : `План введён вручную. ${r.basis}${r.modelPlan === null ? "" : `; модель: ${r.modelPlan} ${r.unit}`}`,
  ]);
  const crew: Cell[][] = draft.crew.map((r, i) => [
    i + 1,
    serial(r.date),
    r.site,
    r.contractor,
    r.shift,
    r.name,
    fraction(r.start),
    fraction(r.end),
    {
      formula: `IF(COUNT(G${i + 2}:H${i + 2})<2,"",MOD(H${i + 2}-G${i + 2},1)*24-K${i + 2}/60)`,
      cached: crewHours(r) ?? "",
    },
    r.note,
    r.breakMinutes,
  ]);
  const groups = [
    ...new Map(
      draft.rows.map((r) => [
        JSON.stringify([r.work, r.unit]),
        { work: r.work, unit: r.unit },
      ]),
    ).values(),
  ];
  const last = draft.rows.length + 1,
    H = `'ОБЪЕМ'!$H$2:$H$${last}`,
    J = `'ОБЪЕМ'!$J$2:$J$${last}`,
    I = `'ОБЪЕМ'!$I$2:$I$${last}`,
    K = `'ОБЪЕМ'!$K$2:$K$${last}`;
  const summary: Cell[][] = groups.map((g, i) => {
    const r = i + 2,
      rs = draft.rows.filter((r) => r.work === g.work && r.unit === g.unit),
      planned = rs.filter((r) => r.plan !== null),
      actual = rs.filter((r) => r.actual !== null);
    return [
      g.work,
      g.unit,
      {
        formula: `IF(COUNTIFS(${H},A${r},${J},B${r},${I},"<>")=COUNTIFS(${H},A${r},${J},B${r}),SUMIFS(${I},${H},A${r},${J},B${r}),"")`,
        cached:
          planned.length === rs.length
            ? planned.reduce((n, r) => n + r.plan!, 0)
            : "",
      },
      {
        formula: `IF(COUNTIFS(${H},A${r},${J},B${r},${K},"<>")=0,"",SUMIFS(${K},${H},A${r},${J},B${r}))`,
        cached: actual.length ? actual.reduce((n, r) => n + r.actual!, 0) : "",
      },
      { formula: `COUNTIFS(${H},A${r},${J},B${r})`, cached: rs.length },
      {
        formula: `E${r}-COUNTIFS(${H},A${r},${J},B${r},${K},"<>")`,
        cached: rs.length - actual.length,
      },
    ];
  });
  for (const [index, data, columns] of [
    [1, rows, 18],
    [2, crew, 11],
    [3, summary, 6],
  ] as const) {
    const path = `xl/worksheets/sheet${index}.xml`;
    const updated = updateSheet(files[path], data, columns);
    files[path] = updated.bytes;
    const table = `xl/tables/table${index}.xml`;
    if (files[table]) files[table] = updateTable(files[table], updated.ref);
  }
  // Recalculate on open after any edits in Excel; cached values are independently
  // calculated above and keep the freshly downloaded report immediately readable.
  const workbook = xml(strFromU8(files["xl/workbook.xml"]));
  let calc = workbook.getElementsByTagNameNS(NS, "calcPr")[0];
  if (!calc) {
    calc = workbook.createElementNS(NS, "calcPr");
    workbook.documentElement.appendChild(calc);
  }
  calc.setAttribute("fullCalcOnLoad", "1");
  calc.setAttribute("forceFullCalc", "1");
  files["xl/workbook.xml"] = strToU8(
    new XMLSerializer().serializeToString(workbook),
  );
  return zipSync(files, { level: 6 });
}
