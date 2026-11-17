import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  X,
  Camera,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "./workspaceClient";
import {
  noteSchema,
  type ObjectNote,
  type WorkspaceUser,
} from "./workspaceTypes";
export type EvidenceContext = {
  model: string;
  elementId: string;
  label: string;
  orderId?: string;
  brigade: string;
};
async function imagePayload(file: File, signature = false) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw Error("Выберите фотографию JPEG, PNG или WebP до 20 МБ");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(
    1,
    (signature ? 3200 : 1600) / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const base64 = canvas
    .toDataURL("image/jpeg", signature ? 0.95 : 0.85)
    .split(",")[1];
  if ((base64.length * 3) / 4 > 5 * 1024 * 1024)
    throw Error(
      "Фото после обработки больше 5 МБ. Выберите фото меньшего размера или снимите лист отдельно.",
    );
  return {
    mime: "image/jpeg" as const,
    base64,
  };
}
export default function ObjectNotes({
  context,
  user,
  onClose,
  readonly = false,
}: {
  context: EvidenceContext;
  user: WorkspaceUser;
  onClose: () => void;
  readonly?: boolean;
}) {
  const signature = context.model.startsWith("shift-signatures-");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const dialog = useRef<HTMLElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusRoot = photoId
      ? dialog.current?.querySelector(".evidence-reader")
      : dialog.current;
    focusRoot?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (photoId) setPhotoId(null);
        else onClose();
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        focusRoot?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, textarea, a[href]",
        ) ?? [],
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [onClose, photoId]);
  const [notes, setNotes] = useState<ObjectNote[]>([]),
    [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      const result = z
        .object({ notes: z.array(noteSchema) })
        .parse(
          await api(
            `/api/notes?model=${encodeURIComponent(context.model)}&element=${encodeURIComponent(context.elementId)}`,
          ),
        );
      setNotes(result.notes);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось загрузить замечания",
      );
    }
  };
  useEffect(() => {
    void refresh();
  }, [context.model, context.elementId]);
  return (
    <div className="workspace-modal-backdrop">
      <section
        className="workspace-modal"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={
          signature ? "Фото подписей смены" : "Фото и замечания объекта"
        }
      >
        <header>
          <div>
            <h2>
              {signature ? "Фотографии подписных листов" : "Фото и замечания"}
            </h2>
            <p>{context.label}</p>
          </div>
          <button aria-label="Закрыть фото и замечания" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <p role="alert">{error}</p>}
        {user.role !== "viewer" && !readonly && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              void (async () => {
                try {
                  await api("/api/notes", "POST", {
                    ...context,
                    text,
                    image: file ? await imagePayload(file, signature) : null,
                  });
                  setText("");
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = "";
                  await refresh();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Не удалось сохранить",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <label>
              Комментарий
              <textarea
                aria-label="Комментарий к объекту"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={4000}
              />
            </label>
            <label>
              Фотография
              <input
                ref={fileInput}
                aria-label={
                  signature ? "Фото подписного листа" : "Фотография объекта"
                }
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              disabled={busy || (signature ? !file : !text.trim() && !file)}
            >
              <Camera size={16} />
              {busy
                ? "Сохранение…"
                : signature
                  ? "Прикрепить фото подписей"
                  : "Добавить к объекту"}
            </button>
          </form>
        )}
        {!notes.length && (
          <p>
            {signature
              ? "Фото подписного листа пока не приложены."
              : "К этому объекту пока нет фотографий и замечаний."}
          </p>
        )}
        {notes.map((note) => (
          <article className="object-note" key={note.id}>
            <p>{note.text}</p>
            {note.imageId && (
              <button
                className="evidence-thumbnail"
                aria-label="Открыть фотографию крупно"
                onClick={() => {
                  setPhotoId(note.imageId);
                  setZoom(1);
                  setRotation(0);
                }}
              >
                <img
                  src={`/api/images/${note.imageId}`}
                  alt={`Фотография: ${context.label}`}
                />
              </button>
            )}
            <small>
              {note.author} · {new Date(note.createdAt).toLocaleString("ru-RU")}{" "}
              · {note.brigade}
            </small>
          </article>
        ))}
        {photoId && (
          <div className="evidence-reader" aria-label="Просмотр фотографии">
            <header>
              <div>
                <strong>Бумажный документ / фотография</strong>
                <small>{context.label}</small>
              </div>
              <button
                aria-label="Закрыть крупную фотографию"
                onClick={() => setPhotoId(null)}
              >
                <X />
              </button>
            </header>
            <div className="evidence-reader-stage">
              <div
                className="evidence-reader-paper"
                style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
              >
                <img
                  src={`/api/images/${photoId}`}
                  alt={`Увеличенная фотография: ${context.label}`}
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
              </div>
            </div>
            <div className="evidence-reader-tools">
              <button
                aria-label="Предыдущая фотография"
                disabled={
                  notes
                    .filter((n) => n.imageId)
                    .findIndex((n) => n.imageId === photoId) <= 0
                }
                onClick={() => {
                  const photos = notes.filter((n) => n.imageId);
                  setPhotoId(
                    photos[photos.findIndex((n) => n.imageId === photoId) - 1]
                      ?.imageId ?? photoId,
                  );
                  setZoom(1);
                  setRotation(0);
                }}
              >
                <ChevronLeft />
              </button>
              <button
                aria-label="Уменьшить фотографию"
                disabled={zoom <= 1}
                onClick={() => setZoom(Math.max(1, zoom - 0.5))}
              >
                <ZoomOut />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                aria-label="Увеличить фотографию"
                disabled={zoom >= 4}
                onClick={() => setZoom(Math.min(4, zoom + 0.5))}
              >
                <ZoomIn />
              </button>
              <button
                aria-label="Повернуть фотографию"
                onClick={() => setRotation((r) => (r + 90) % 360)}
              >
                <RotateCw />
              </button>
              <button
                aria-label="Следующая фотография"
                disabled={
                  notes
                    .filter((n) => n.imageId)
                    .findIndex((n) => n.imageId === photoId) >=
                  notes.filter((n) => n.imageId).length - 1
                }
                onClick={() => {
                  const photos = notes.filter((n) => n.imageId);
                  setPhotoId(
                    photos[photos.findIndex((n) => n.imageId === photoId) + 1]
                      ?.imageId ?? photoId,
                  );
                  setZoom(1);
                  setRotation(0);
                }}
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
