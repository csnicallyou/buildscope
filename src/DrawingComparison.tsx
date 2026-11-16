import type { Element, Project } from "./model";
import PdfCanvas from "./PdfCanvas";
export default function DrawingComparison({
  project,
  selected,
  url,
  page,
  onPage,
  onOpen,
  onClose,
}: {
  project: Project;
  selected?: Element;
  url: string | null;
  page: number;
  onPage: (p: number) => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const pages = selected?.evidence?.pages ?? [];
  return (
    <aside className="drawing-comparison">
      <div className="comparison-heading">
        <strong>{selected?.name ?? "Чертёж рядом с моделью"}</strong>
        <button onClick={onClose}>Закрыть чертёж</button>
      </div>
      <div className="comparison-pages">
        {pages.map((p) => (
          <button
            key={p}
            className={p === page ? "active" : ""}
            onClick={() => onPage(p)}
          >
            Лист{" "}
            {project.document?.sheets.find((s) => s.pages.includes(p))?.sheet ??
              "?"}{" "}
            · PDF {p}
          </button>
        ))}
        <label>
          PDF{" "}
          <input
            aria-label="Страница рядом с моделью"
            type="number"
            min={1}
            max={project.document?.pageCount ?? 30}
            value={page}
            onChange={(e) =>
              onPage(
                Math.max(
                  1,
                  Math.min(
                    project.document?.pageCount ?? 30,
                    +e.target.value || 1,
                  ),
                ),
              )
            }
          />
        </label>
        <button onClick={onOpen}>Выбрать PDF</button>
      </div>
      {url ? (
        <PdfCanvas url={url} page={page} />
      ) : (
        <div className="comparison-empty">
          <p>
            Выберите исходный PDF один раз. Кнопки листов откроют нужную
            страницу рядом с выбранным объектом.
          </p>
          <p>Файл остаётся в браузере и не отправляется на сервер.</p>
          <button onClick={onOpen}>Открыть локальный PDF</button>
        </div>
      )}
    </aside>
  );
}
