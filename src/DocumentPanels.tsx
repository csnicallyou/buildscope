import { useEffect, useState } from "react";
import QuantityBadges from "./QuantityBadges";
import PdfCanvas from "./PdfCanvas";
import type { Project, Element } from "./model";
const f = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
export function ReinforcementPanel({
  project,
  selected,
}: {
  project: Project;
  selected?: Element;
}) {
  const [mark, setMark] = useState("");
  useEffect(() => setMark(""), [project.name]);
  const candidates = selected?.evidence?.reinforcement
    ? [selected]
    : project.elements.filter((e) => e.evidence?.reinforcement);
  const types = [...new Map(candidates.map((e) => [e.mark, e])).values()];
  return (
    <section className="schedule">
      <h1>Армирование</h1>
      <label>
        Конструкция
        <select
          aria-label="Марка армирования"
          value={mark}
          onChange={(e) => setMark(e.target.value)}
        >
          <option value="">Все марки</option>
          {types.map((e) => (
            <option key={e.mark} value={e.mark}>
              {e.mark} · {e.name}
            </option>
          ))}
        </select>
      </label>
      <QuantityBadges statuses={["source"]} />
      <p>
        Позиции переписаны из спецификаций. Количества, длины и массы сохранены
        в исходных единицах. Ниже отдельно показаны результаты сверки 3D с
        чертежом. Видимые стержни не означают, что весь каркас восстановлен.
      </p>
      {types.length === 0 ? (
        <p>Для выбранного проекта спецификация армирования отсутствует.</p>
      ) : (
        types
          .filter((e) => !mark || e.mark === mark)
          .map((e) => {
            const count = selected
              ? 1
              : project.elements.filter((x) => x.mark === e.mark).length;
            return (
              <div key={e.mark}>
                <h2>
                  {e.mark}{" "}
                  <small>× {count} · значения ниже на один элемент</small>
                </h2>
                <ReinforcementReview element={e} />
                <table>
                  <thead>
                    <tr>
                      <th>Поз.</th>
                      <th>Сталь / Ø мм</th>
                      <th>Кол., шт.</th>
                      <th>В 3D, шт.</th>
                      <th>L, м</th>
                      <th>ΣL, м</th>
                      <th>Масса, кг</th>
                      <th>PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.evidence!.reinforcement!.map((r, i) => (
                      <tr key={i}>
                        <td>{r.position}</td>
                        <td>
                          {r.grade} / {r.diameter}
                        </td>
                        <td>{f(r.count)}</td>
                        <td>
                          {e.evidence!.reinforcementReview
                            ? (e.evidence!.bars ?? []).filter(
                                (b) => b.drawing?.position === r.position,
                              ).length
                            : "Не сверено"}
                        </td>
                        <td>{f(r.length)}</td>
                        <td>{f(r.totalLength)}</td>
                        <td>{f(r.totalMass)}</td>
                        <td>{r.page}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
      )}
      {project.document?.additionalReinforcement && (
        <>
          <h2>Дополнительные связи · на всю сборку</h2>
          <table>
            <thead>
              <tr>
                <th>Позиция</th>
                <th>Сталь / Ø</th>
                <th>ΣL, м</th>
                <th>Масса, кг</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {project.document.additionalReinforcement.map((r) => (
                <tr key={r.position}>
                  <td>{r.name}</td>
                  <td>
                    {r.grade} / {r.diameter}
                  </td>
                  <td>{f(r.totalLength)}</td>
                  <td>{f(r.totalMass)}</td>
                  <td>{r.page}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export function ReinforcementReview({ element }: { element: Element }) {
  const review = element.evidence?.reinforcementReview;
  if (!review)
    return (
      <p>
        Размещение арматуры этой модели не проходило новую сверку с чертежом.
      </p>
    );
  return (
    <section
      className="reinforcement-review"
      aria-label={`Сверка армирования ${element.mark}`}
    >
      <strong>
        {review.status === "partial"
          ? "Каркас восстановлен частично"
          : "Каркас в 3D не восстановлен"}
      </strong>
      <p>Проверены страницы PDF: {review.pages.join(", ")}.</p>
      {review.placed.length > 0 && (
        <>
          <h3>Построено</h3>
          <ul>
            {review.placed.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {review.pending.length > 0 && (
        <>
          <h3>Не восстановлено в 3D</h3>
          <ul>
            {review.pending.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {review.conflicts.map((t) => (
        <p className="reinforcement-conflict" key={t}>
          <strong>Расхождение чертежа: </strong>
          {t}
        </p>
      ))}
      <details>
        <summary>Основания и ограничения сверки</summary>
        {review.notes.map((t) => (
          <p key={t}>{t}</p>
        ))}
        {review.distributions?.map((d) => (
          <details key={d.position}>
            <summary>
              {d.position}: {d.distances.length} сечений × {d.perStation} · PDF{" "}
              {d.page}
            </summary>
            <p>
              {d.from}. Расстояния до осей в метрах:{" "}
              {d.distances.map((v) => f(v)).join("; ")}.
            </p>
            <p>
              Это размерная цепь размещения; форма и размещение самих гнутых
              деталей в 3D пока не восстановлены.
            </p>
          </details>
        ))}
      </details>
    </section>
  );
}
export function SourcePanel({
  project,
  pdfUrl,
  page,
  onPage,
  onOpen,
}: {
  project: Project;
  pdfUrl: string | null;
  page: number;
  onPage: (n: number) => void;
  onOpen: () => void;
}) {
  const doc = project.document;
  if (!doc)
    return (
      <section className="schedule">
        <h1>Источники</h1>
        <p>Для демонстрационной модели исходные чертежи отсутствуют.</p>
      </section>
    );
  return (
    <section className="source-review">
      <div className="source-heading">
        <div>
          <h1>{doc.code}</h1>
          <p>
            {doc.assembly} ·{" "}
            {doc.zeroAbsolute === null
              ? "Условная выкладка"
              : "0,000 = " + f(doc.zeroAbsolute)}{" "}
            · 30 страниц / 25 листов
          </p>
        </div>
        <button onClick={onOpen}>Открыть исходный PDF</button>
        <label>
          Страница{" "}
          <input
            aria-label="Страница PDF"
            type="number"
            min={1}
            max={30}
            value={page}
            onChange={(e) =>
              onPage(Math.min(30, Math.max(1, Number(e.target.value) || 1)))
            }
          />
        </label>
      </div>
      {pdfUrl ? (
        <div className="source-pdf-canvas">
          <PdfCanvas url={pdfUrl} page={page} />
        </div>
      ) : (
        <div className="pdf-empty">
          <p>
            Выберите исходный файл, если он ещё не сохранён в документах. Он
            используется для просмотра листов рядом с моделью. Он не
            отправляется в сеть и не включён в репозиторий.
          </p>
          <button onClick={onOpen}>Выбрать PDF</button>
        </div>
      )}
      <div className="review-content">
        <h2>Проверка исходных данных</h2>
        {doc.issues.map((issue) => (
          <details
            key={issue.id}
            open={
              ["elevation", "footing-levels"].includes(issue.id) &&
              doc.assembly.includes("Навес")
            }
          >
            <summary>
              {issue.title}
              <span>
                {issue.pages.map((n) => (
                  <button
                    key={n}
                    onClick={(e) => {
                      e.preventDefault();
                      onPage(n);
                    }}
                  >
                    PDF {n}
                  </button>
                ))}
              </span>
            </summary>
            <p>{issue.detail}</p>
          </details>
        ))}
        <h2>Реестр всех листов</h2>
        <table>
          <thead>
            <tr>
              <th>Лист</th>
              <th>Содержание</th>
              <th>Страницы PDF</th>
              <th>Представление</th>
            </tr>
          </thead>
          <tbody>
            {doc.sheets.map((s) => (
              <tr key={s.sheet}>
                <td>{s.sheet}</td>
                <td>{s.title}</td>
                <td>
                  {s.pages.map((n) => (
                    <button key={n} onClick={() => onPage(n)}>
                      {n}
                    </button>
                  ))}
                </td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
