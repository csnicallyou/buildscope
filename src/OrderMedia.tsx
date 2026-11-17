import { useState } from "react";
import type { SavedWorkOrder } from "./workOrderArchive";
import type { WorkspaceUser } from "./workspaceTypes";
import { useConstruction } from "./useConstruction";
import { ofKind, type ConstructionRecord } from "./construction";
import { uploadConstructionFile } from "./constructionFiles";
import { today } from "./workOrders";
export default function OrderMedia({
  order,
  user,
}: {
  order: SavedWorkOrder;
  user: WorkspaceUser;
}) {
  const { records, error, save, refresh } = useConstruction(true);
  const [playbackErrors, setPlaybackErrors] = useState<Record<string, boolean>>(
    {},
  );
  const [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState<ConstructionRecord | null>(null);
  const docs = ofKind(records, "document").filter(
    (r) => r.payload.orderId === order.id,
  );
  return (
    <details className="order-media">
      <summary>Фото, видео и документы наряда ({docs.length})</summary>
      <p>
        Оригиналы связаны с этим нарядом. Факт получения файла не означает
        проверку объёмов или подписей.
      </p>
      {error && <p role="alert">{error}</p>}
      {docs.map((r) => (
        <article key={r.id}>
          <strong>{r.payload.title}</strong>
          <p>Источник: {r.payload.description}</p>
          {r.file ? (
            <>
              {r.payload.category === "video" && (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  onError={() =>
                    setPlaybackErrors((errors) => ({ ...errors, [r.id]: true }))
                  }
                  src={`/api/construction-files/${r.file.id}`}
                />
              )}
              {playbackErrors[r.id] && (
                <p>
                  Браузер не смог воспроизвести этот формат видео. Откройте
                  оригинальный файл.
                </p>
              )}
              <a
                href={`/api/construction-files/${r.file.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Открыть оригинал: {r.file.name}
              </a>
            </>
          ) : (
            <small>Файл ещё не загружен</small>
          )}
          <small>
            {r.author} · {new Date(r.updatedAt).toLocaleString("ru-RU")}
          </small>
        </article>
      ))}
      {user.role === "admin" && (
        <>
          <label>
            Источник / комментарий
            <input
              aria-label="Источник вложения наряда"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label>
            Фото, видео или документ
            <input
              aria-label="Файл наряда"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx,.mp4,.webm,.mov"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPending(null);
              }}
            />
          </label>
          <button
            disabled={busy || !file || !source.trim()}
            onClick={() => {
              if (!file) return;
              setBusy(true);
              setMessage("");
              void (async () => {
                try {
                  const isVideo = /\.(mp4|webm|mov)$/i.test(file.name);
                  const doc =
                    pending ??
                    (await save(
                      {
                        kind: "document",
                        title: file.name.slice(0, 180),
                        orderId: order.id,
                        nodeId: order.draft.nodeId ?? null,
                        model: "",
                        elementIds: [],
                        brigade: order.draft.brigade,
                        number: `Наряд ${order.id.slice(0, 8)}`,
                        edition: "1",
                        category: isVideo
                          ? "video"
                          : /\.(jpg|jpeg|png)$/i.test(file.name)
                            ? "photo"
                            : "other",
                        date: today(),
                        supersedes: null,
                        description: source,
                      },
                      null,
                    ));
                  setPending(doc);
                  await uploadConstructionFile(doc, file);
                  await refresh();
                  setFile(null);
                  setPending(null);
                  setMessage(
                    "Вложение сохранено в наряде и документах объекта",
                  );
                } catch (e) {
                  setMessage(
                    e instanceof Error
                      ? e.message
                      : "Не удалось загрузить файл",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Прикрепить файл к наряду
          </button>
          <small>
            MP4, WebM, MOV, JPEG, PNG, PDF, XLSX, DOCX до 25 МБ. Крупное видео
            разделите на фрагменты.
          </small>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
