import { useEffect, useState } from "react";
import { z } from "zod";
import { api } from "./workspaceClient";
import { noteSchema } from "./workspaceTypes";
import { signatureModels } from "./signatures";
import { useConstruction } from "./useConstruction";
import { ofKind } from "./construction";
import PdfCanvas from "./PdfCanvas";
export default function OrderEvidencePane({ orderId }: { orderId: string }) {
  const { records } = useConstruction(true);
  const [notes, setNotes] = useState<z.infer<typeof noteSchema>[]>([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0),
    [page, setPage] = useState(1);
  useEffect(() => {
    let current = true;
    setNotes([]);
    setError("");
    setRotation(0);
    void Promise.all(
      Object.values(signatureModels).map((model) =>
        api(
          `/api/notes?model=${model}&element=${encodeURIComponent(orderId)}`,
        ).then((v) => z.object({ notes: z.array(noteSchema) }).parse(v).notes),
      ),
    )
      .then((values) => {
        if (current) {
          setNotes(values.flat());
          setError("");
        }
      })
      .catch((e) => {
        if (current)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить оригиналы",
          );
      });
    setSelected("");
    setZoom(1);
    setPage(1);
    return () => {
      current = false;
    };
  }, [orderId]);
  const files = [
    ...notes
      .filter((n) => n.imageId)
      .map((n, i) => ({
        id: n.id,
        title: `Лист подписей ${i + 1} · ${n.model === signatureModels.start ? "выход" : "окончание"}`,
        url: `/api/images/${n.imageId}`,
        type: "image",
      })),
    ...ofKind(records, "document")
      .filter((d) => d.payload.orderId === orderId && d.file)
      .map((d) => ({
        id: d.id,
        title: d.payload.title,
        url: `/api/construction-files/${d.file!.id}`,
        type: /\.pdf$/i.test(d.file!.name)
          ? "pdf"
          : /\.(mp4|webm|mov)$/i.test(d.file!.name)
            ? "video"
            : /\.(png|jpe?g)$/i.test(d.file!.name)
              ? "image"
              : "file",
      })),
  ];
  const file = files.find((f) => f.id === selected) ?? files[0];
  return (
    <aside className="order-evidence-pane" aria-label="Оригинал отчёта">
      <header>
        <h3>Оригинал отчёта</h3>
        <small>Сверяйте сведения с приложенным документом</small>
      </header>
      {error && <p role="alert">{error}</p>}
      {files.length ? (
        <>
          <select
            aria-label="Документ для сверки"
            value={file?.id ?? ""}
            onChange={(e) => {
              setSelected(e.target.value);
              setZoom(1);
              setRotation(0);
              setPage(1);
            }}
          >
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
          <div className="order-evidence-stage">
            {file.type === "image" ? (
              <img
                src={file.url}
                alt={file.title}
                onError={() =>
                  setError(
                    "Не удалось открыть изображение. Попробуйте открыть оригинал отдельно.",
                  )
                }
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
              />
            ) : file.type === "pdf" ? (
              <PdfCanvas url={file.url} page={page} />
            ) : file.type === "video" ? (
              <video controls playsInline src={file.url} />
            ) : (
              <a href={file.url}>Скачать оригинал</a>
            )}
          </div>
          <div className="evidence-inline-controls">
            {file.type === "image" && (
              <>
                <button
                  aria-label="Уменьшить оригинал"
                  onClick={() => setZoom((v) => Math.max(0.5, v - 0.25))}
                >
                  −
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  aria-label="Увеличить оригинал"
                  onClick={() => setZoom((v) => Math.min(4, v + 0.25))}
                >
                  +
                </button>
                <button onClick={() => setRotation((v) => v + 90)}>
                  Повернуть
                </button>
              </>
            )}
            {file.type === "pdf" && (
              <label>
                Страница
                <input
                  aria-label="Страница оригинала отчёта"
                  min={1}
                  type="number"
                  value={page}
                  onChange={(e) => setPage(Math.max(1, +e.target.value))}
                />
              </label>
            )}
            <a href={file.url} target="_blank" rel="noreferrer">
              Открыть отдельно
            </a>
          </div>
        </>
      ) : (
        <p className="evidence-empty">
          Оригинал ещё не приложен. Добавьте фото или документ во вкладке
          «Вложения». Проверки остаются незаполненными до сверки.
        </p>
      )}
    </aside>
  );
}
