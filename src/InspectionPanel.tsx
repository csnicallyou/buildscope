import { useState } from "react";
import {
  inspectModel,
  type InspectionResult,
  type Finding,
  type FindingKind,
} from "./inspection";
import type { Project, Element } from "./model";
const names: Record<FindingKind, string> = {
  overlap: "Пересечения",
  gap: "Зазоры",
  duplicate: "Дубли",
  material: "Материалы",
  unverified: "Неуточнённое",
};
export default function InspectionPanel({
  project,
  visible,
  result,
  onResult,
  onFocus,
}: {
  project: Project;
  visible: Element[];
  result: InspectionResult | null;
  onResult: (r: InspectionResult) => void;
  onFocus: (f: Finding) => void;
}) {
  const [scope, setScope] = useState("project"),
    [kind, setKind] = useState<FindingKind | "all">("all"),
    [busy, setBusy] = useState(false);
  return (
    <section className="schedule inspection-panel">
      <h1>Проверка модели</h1>
      <p>
        Проверка исходной геометрии, без временных перемещений и разборки.
        Замечание не означает ошибку проекта: пересечения могут быть
        сопряжениями, зазоры - проектными швами.
      </p>
      <div className="inspection-actions">
        <label>
          Проверить{" "}
          <select
            aria-label="Область проверки"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="project">Весь проект</option>
            <option value="visible">Показанные тела</option>
          </select>
        </label>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            );
            onResult(
              inspectModel(scope === "project" ? project.elements : visible),
            );
            setBusy(false);
          }}
        >
          {busy ? "Проверка…" : "Запустить проверку"}
        </button>
      </div>
      {result && (
        <>
          <p role="status">
            В области: {result.total}. Геометрия проверена: {result.tested};
            схемы/огибающие исключены: {result.excluded}. Пар рассмотрено:{" "}
            {result.pairs}.
            {result.truncated
              ? " Проверка неполная: ограничьте область. Достигнут лимит тел, пар или замечаний."
              : ""}
          </p>
          <div className="inspection-types">
            <button
              className={kind === "all" ? "active" : ""}
              onClick={() => setKind("all")}
            >
              Все ({result.findings.length})
            </button>
            {Object.entries(names).map(([key, label]) => (
              <button
                key={key}
                className={kind === key ? "active" : ""}
                onClick={() => setKind(key as FindingKind)}
              >
                {label} ({result.findings.filter((f) => f.kind === key).length})
              </button>
            ))}
          </div>
          <p>
            Точные пересечения рассчитываются для объединений прямоугольных тел
            и вертикальных профилей, включая вырезы. Для остальных форм явно
            показаны только кандидаты по габаритам.
          </p>
          {!result.findings.filter((f) => kind === "all" || f.kind === kind)
            .length && (
            <p>
              В этой категории замечаний не найдено в пределах указанной
              проверки.
            </p>
          )}
          {result.findings
            .filter((f) => kind === "all" || f.kind === kind)
            .map((f) => (
              <article key={f.id} className="inspection-finding">
                <div>
                  <strong>{f.title}</strong>
                  <span
                    className={`quantity-badge ${f.method === "exact" ? "quality-dimensioned" : "quality-assumed"}`}
                  >
                    {f.method === "exact"
                      ? "Точно для модели"
                      : f.method === "bounds"
                        ? "По габаритам"
                        : "По данным"}
                  </span>
                </div>
                <p>
                  {f.ids
                    .map(
                      (id) =>
                        project.elements.find((e) => e.id === id)?.name ?? id,
                    )
                    .join(" / ")}
                </p>
                <p>{f.detail}</p>
                <button onClick={() => onFocus(f)}>Открыть и приблизить</button>
              </article>
            ))}
        </>
      )}
    </section>
  );
}
