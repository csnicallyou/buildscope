import { jsPDF } from "jspdf";
import type { Project } from "./model";
import { calculateSelection } from "./calculator";
import { quantityStatuses } from "./quality";
import { renderReportPreview } from "./reportPreview";
import fontUrl from "./assets/NotoSans-Regular.ttf?url";
import licenseUrl from "./assets/NotoSans-OFL.txt?url";

const f = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
let fontData: Promise<string> | undefined;
function font() {
  return (fontData ??= fetch(fontUrl)
    .then(async (r) => {
      if (!r.ok) throw Error("Не удалось загрузить шрифт отчёта");
      const bytes = new Uint8Array(await r.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    })
    .catch((e) => {
      fontData = undefined;
      throw e;
    }));
}

export async function createSelectionReport(
  project: Project,
  ids: string[],
): Promise<ArrayBuffer> {
  const c = calculateSelection(project, ids);
  if (!c.objects.length) throw Error("Сначала выберите объекты");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.addFileToVFS("NotoSans-Regular.ttf", await font());
  pdf.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  pdf.setFont("NotoSans");
  pdf.setProperties({
    title: "BuildScope - Отчёт по выбранным объектам",
    author: "BuildScope",
    subject: project.name,
  });
  let y = 20;
  const clean = (s: string) =>
    s.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\u00a0/g, " ");
  const line = (
    text: string,
    size = 10,
    color: [number, number, number] = [35, 57, 66],
    gap = 3,
  ) => {
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(clean(text), 178) as string[];
    const leading = size * 0.45;
    if (lines.length <= 14 && y + lines.length * leading + gap > 276) {
      pdf.addPage();
      y = 21;
    }
    for (const l of lines) {
      if (y + leading > 276) {
        pdf.addPage();
        y = 21;
      }
      pdf.text(l, 16, y);
      y += leading;
    }
    y += gap;
  };
  const heading = (text: string) => {
    if (y > 250) {
      pdf.addPage();
      y = 21;
    }
    y += 3;
    line(text, 15, [28, 91, 99], 5);
  };
  line("BuildScope / Ведомость выбранных объектов", 18, [28, 91, 99], 7);
  line(project.name, 11);
  line(
    `Объектов: ${c.objects.length}. Тел и слоёв: ${c.elements.length}. Единицы модели: метры.`,
    10,
  );
  line(
    `Сформировано: ${new Date().toLocaleString("ru-RU")}. Документ: ${project.document?.code ?? "пользовательская модель"}.`,
    9,
    [80, 99, 105],
  );
  if (y + 110 > 276) {
    pdf.addPage();
    y = 21;
  }
  const image = renderReportPreview(c.elements);
  pdf.addImage(image, "PNG", 16, y, 178, 104);
  y += 110;
  line(
    "Выбранные тела в проектном положении, анкеры - по схеме. Полная изготовительная арматура не показана. Временные смещения и разборка в отчёт не входят.",
    9,
    [80, 99, 105],
  );
  heading("Материалы и количества");
  for (const r of c.materials) {
    const value = r.unknown
      ? r.value
        ? `${f(r.value)} ${r.unit} + не определено`
        : "Не определено"
      : `${f(r.value)} ${r.unit}`;
    const status = r.statuses.map((s) => quantityStatuses[s].label).join(" / ");
    // Keep each heading with the first quantity lines; long notes may continue.
    if (y > 246) {
      pdf.addPage();
      y = 21;
    }
    pdf.setDrawColor(204, 217, 221);
    pdf.line(16, y - 2, 194, y - 2);
    y += 3;
    line(`${r.name}: ${value}`, 11, [35, 57, 66], 2);
    line(
      `Статус: ${status}. ${r.basis}${r.unknown ? `. Без полного количества: ${r.unknown} поз.` : "."}`,
      9,
      [80, 99, 105],
      5,
    );
  }
  heading("Состав выбора");
  for (const o of c.objects) {
    line(
      `${o.root.name}. Тел и слоёв: ${o.members.length}.`,
      10,
      [35, 57, 66],
      2,
    );
    line(
      o.members.map((e) => `${e.mark}: ${e.material}`).join("; "),
      9,
      [80, 99, 105],
      5,
    );
  }
  heading("Замечания и принятые условия");
  line(
    "Геометрические объёмы и значения ведомостей - разные основания расчёта. Бетон без вычета арматуры; цемент без рецептуры не рассчитывается. Сталь - по имеющимся спецификациям, анкеры - по схеме. Общие работы и связи PDF без привязки к объектам не включены. Неопределённое не считается нулём. Запас, разрыхление и стоимость не добавлялись.",
    9,
  );
  const notes = [
    ...new Set(c.elements.flatMap((e) => e.evidence?.notes ?? [])),
  ];
  for (const note of notes) line(note, 9, [80, 99, 105]);
  const pages = new Set(c.elements.flatMap((e) => e.evidence?.pages ?? []));
  const issues =
    project.document?.issues.filter((i) => i.pages.some((p) => pages.has(p))) ??
    [];
  for (const issue of issues) {
    const needed =
      (
        pdf.splitTextToSize(
          clean(`PDF: ${issue.pages.join(", ")}. ${issue.detail}`),
          178,
        ) as string[]
      ).length *
        4.05 +
      13;
    if (needed < 240 && y + needed > 276) {
      pdf.addPage();
      y = 21;
    }
    line(issue.title, 10);
    line(`PDF: ${issue.pages.join(", ")}. ${issue.detail}`, 9, [80, 99, 105]);
  }
  line("Обозначения статусов", 11);
  for (const s of Object.values(quantityStatuses))
    line(`${s.label}: ${s.detail}`, 9, [80, 99, 105]);
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setTextColor(100, 115, 120);
    pdf.text(`BuildScope | ${p} / ${total}`, 16, 288);
    pdf.text("Инженерное исследование / проверьте замечания", 194, 288, {
      align: "right",
    });
  }
  // License travels alongside the bundled font; no external font service is used.
  void licenseUrl;
  return pdf.output("arraybuffer");
}
