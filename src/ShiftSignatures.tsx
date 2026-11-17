import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { Camera, ExternalLink } from "lucide-react";
import ObjectNotes from "./ObjectNotes";
import { api } from "./workspaceClient";
import {
  noteSchema,
  type ObjectNote,
  type WorkspaceUser,
} from "./workspaceTypes";
import type { SavedWorkOrder } from "./workOrderArchive";
import {
  signatureModels,
  signatureFields,
  signatureLabels,
  signatureStatus,
  signatureStatusLabels,
  type SignatureStatus,
  type SignaturePhase,
} from "./signatures";
export default function ShiftSignatures({
  order,
  user,
  disabled,
  accepted,
  onChange,
}: {
  order: SavedWorkOrder;
  user: WorkspaceUser;
  disabled: boolean;
  accepted: boolean;
  onChange: (
    personId: string,
    phase: SignaturePhase,
    noteId: string | null,
    status?: SignatureStatus,
  ) => void;
}) {
  const [photos, setPhotos] = useState<Record<SignaturePhase, ObjectNote[]>>({
      start: [],
      end: [],
    }),
    [phase, setPhase] = useState<SignaturePhase | null>(null),
    [error, setError] = useState("");
  const readonly =
    disabled ||
    user.role === "viewer" ||
    accepted ||
    (!!order.submittedAt && user.role !== "admin");
  const [bulk, setBulk] = useState<
    Record<SignaturePhase, { photo: string; status: SignatureStatus }>
  >({
    start: { photo: "", status: "present" },
    end: { photo: "", status: "present" },
  });
  const refresh = useCallback(async () => {
    try {
      const values = await Promise.all(
        (["start", "end"] as SignaturePhase[]).map(async (p) =>
          z
            .object({ notes: z.array(noteSchema) })
            .parse(
              await api(
                `/api/notes?model=${signatureModels[p]}&element=${encodeURIComponent(order.id)}`,
              ),
            )
            .notes.filter((n) => !!n.imageId),
        ),
      );
      setPhotos({ start: values[0], end: values[1] });
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось загрузить фото подписей",
      );
    }
  }, [order.id]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const close = useCallback(() => {
    setPhase(null);
    void refresh();
  }, [refresh]);
  return (
    <details open className="shift-signatures">
      <summary>
        Подписи сотрудников · выход{" "}
        {
          order.draft.crew.filter(
            (p) => signatureStatus(p, "start") === "present",
          ).length
        }
        /{order.draft.crew.length} · окончание{" "}
        {
          order.draft.crew.filter(
            (p) => signatureStatus(p, "end") === "present",
          ).length
        }
        /{order.draft.crew.length}
      </summary>
      <p>
        Прикрепите фотографии подписанных листов и отметьте подписи, которые вы
        проверили. Для каждого сотрудника сохраните время выхода и окончания
        смены. Отсутствие галочки означает, что проверка не подтверждена.
        Проверка подписи не подтверждает автоматически отработанные часы.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="signature-albums">
        {(["start", "end"] as SignaturePhase[]).map((p) => (
          <section key={p}>
            <h3>{signatureLabels[p]}</h3>
            <button onClick={() => setPhase(p)}>
              <Camera size={16} />
              {readonly
                ? "Посмотреть фото"
                : `Фото подписей: ${p === "start" ? "выход" : "окончание"}`}
            </button>
            <small>
              {photos[p].length
                ? `Фотографий: ${photos[p].length}`
                : "Фото ещё не приложено"}
            </small>
            {!!photos[p].length && !readonly && (
              <div className="signature-bulk">
                <label>
                  Лист для проверки списка
                  <select
                    aria-label={`Лист для списка ${p}`}
                    value={bulk[p].photo || photos[p][0].id}
                    onChange={(e) =>
                      setBulk((b) => ({
                        ...b,
                        [p]: { ...b[p], photo: e.target.value },
                      }))
                    }
                  >
                    {photos[p].map((n, i) => (
                      <option key={n.id} value={n.id}>
                        Лист {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Результат для списка
                  <select
                    aria-label={`Проверка списка ${p}`}
                    value={bulk[p].status}
                    onChange={(e) =>
                      setBulk((b) => ({
                        ...b,
                        [p]: {
                          ...b[p],
                          status: e.target.value as SignatureStatus,
                        },
                      }))
                    }
                  >
                    {Object.entries(signatureStatusLabels).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <button
                  onClick={() =>
                    order.draft.crew
                      .filter(
                        (person) => bulk[p].status !== "present" || person[p],
                      )
                      .forEach((person) =>
                        onChange(
                          person.id,
                          p,
                          bulk[p].status === "unchecked"
                            ? null
                            : bulk[p].photo || photos[p][0].id,
                          bulk[p].status,
                        ),
                      )
                  }
                >
                  Применить к списку сотрудников
                </button>
                <small>
                  Выберите лист, на котором указан этот список. Для отметки
                  «Есть» время должно быть заполнено; остальные строки останутся
                  без подтверждения.
                </small>
              </div>
            )}
            {photos[p].map((n, i) => (
              <a
                key={n.id}
                href={`/api/images/${n.imageId}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={13} />
                Лист {i + 1} · {new Date(n.createdAt).toLocaleString("ru-RU")}
              </a>
            ))}
          </section>
        ))}
      </div>
      {!order.draft.crew.length && (
        <p>
          Поимённый состав в этом наряде не указан. Фото листов можно сохранить,
          а отметки проверок появятся у сотрудников из табеля.
        </p>
      )}
      {order.draft.crew.map((person, i) => (
        <div className="signature-person" key={person.id}>
          <strong>{person.name}</strong>
          {(["start", "end"] as SignaturePhase[]).map((p) => {
            const noteId = person[signatureFields[p]],
              matched = photos[p].find((n) => n.id === noteId);
            return (
              <div key={p}>
                <label>
                  <input
                    aria-label={`Подпись ${p === "start" ? "при выходе" : "при окончании"} ${i + 1}`}
                    type="checkbox"
                    checked={signatureStatus(person, p) === "present"}
                    disabled={
                      readonly || (!noteId && (!photos[p].length || !person[p]))
                    }
                    onChange={(e) =>
                      onChange(
                        person.id,
                        p,
                        e.target.checked ? photos[p][0].id : null,
                        e.target.checked ? "present" : "unchecked",
                      )
                    }
                  />
                  {p === "start" ? "Выход" : "Окончание"}: подпись на фото
                  проверена
                </label>
                <label>
                  Состояние подписи
                  <select
                    aria-label={`Состояние подписи ${p === "start" ? "при выходе" : "при окончании"} ${i + 1}`}
                    value={signatureStatus(person, p)}
                    disabled={readonly || !photos[p].length}
                    onChange={(e) => {
                      const status = e.target.value as SignatureStatus;
                      onChange(
                        person.id,
                        p,
                        status === "unchecked"
                          ? null
                          : (noteId ?? photos[p][0].id),
                        status,
                      );
                    }}
                  >
                    {Object.entries(signatureStatusLabels).map(
                      ([key, label]) => (
                        <option
                          key={key}
                          value={key}
                          disabled={key === "present" && !person[p]}
                        >
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                {noteId && (
                  <select
                    aria-label={`Фото подписи ${p === "start" ? "при выходе" : "при окончании"} ${i + 1}`}
                    disabled={readonly}
                    value={noteId}
                    onChange={(e) =>
                      onChange(
                        person.id,
                        p,
                        e.target.value,
                        signatureStatus(person, p),
                      )
                    }
                  >
                    {!matched && (
                      <option value={noteId}>Выбранное фото недоступно</option>
                    )}
                    {photos[p].map((n, j) => (
                      <option key={n.id} value={n.id}>
                        Лист {j + 1} ·{" "}
                        {new Date(n.createdAt).toLocaleString("ru-RU")}
                      </option>
                    ))}
                  </select>
                )}
                {!noteId && (
                  <small>
                    {!person[p]
                      ? "Укажите время в табеле"
                      : !photos[p].length
                        ? "Сначала прикрепите фото"
                        : "Проверка не отмечена"}
                  </small>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {!readonly && (
        <small>
          {order.submittedAt
            ? "Сохраните отметки кнопкой «Сохранить проверку подписей» или при приёмке наряда."
            : "Отметки сохраняются кнопками «Сохранить выполнение» или «Сдать наряд»."}
          Фото сохраняются сразу после загрузки.
        </small>
      )}
      {phase && (
        <ObjectNotes
          user={user}
          readonly={readonly}
          onClose={close}
          context={{
            model: signatureModels[phase],
            elementId: order.id,
            orderId: order.id,
            label: `${signatureLabels[phase]} · ${order.draft.date} · ${order.draft.shift} · ${order.draft.brigade}`,
            brigade: order.draft.brigade,
          }}
        />
      )}
    </details>
  );
}
