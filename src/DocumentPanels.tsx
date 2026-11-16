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
  const candidates = selected?.evidence?.reinforcement
    ? [selected]
    : project.elements.filter((e) => e.evidence?.reinforcement);
  const types = [...new Map(candidates.map((e) => [e.mark, e])).values()];
  return (
    <section className="schedule">
      <h1>Армирование</h1>
      <p>
        Позиции переписаны из спецификаций. Количества, длины и массы сохранены
        в исходных единицах. Сетка в 3D — схема размещения; гнутые детали,
        сварку и нахлёсты проверяйте по PDF.
      </p>
      {types.length === 0 ? (
        <p>Для выбранного проекта спецификация армирования отсутствует.</p>
      ) : (
        types.map((e) => {
          const count = selected
            ? 1
            : project.elements.filter((x) => x.mark === e.mark).length;
          return (
            <div key={e.mark}>
              <h2>
                {e.mark}{" "}
                <small>× {count} · значения ниже на один элемент</small>
              </h2>
              <table>
                <thead>
                  <tr>
                    <th>Поз.</th>
                    <th>Сталь / Ø мм</th>
                    <th>Кол., шт.</th>
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
            {doc.assembly} · 0,000 = {f(doc.zeroAbsolute)} · 30 страниц / 25
            листов
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
        <iframe
          title="Исходный PDF"
          src={`${pdfUrl}#page=${page}&view=FitH`}
          key={pdfUrl + page}
          className="pdf-frame"
        />
      ) : (
        <div className="pdf-empty">
          <p>
            PDF остаётся на вашем компьютере. Выберите исходный файл для
            просмотра листов рядом с моделью. Он не отправляется в сеть и не
            включён в репозиторий.
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
