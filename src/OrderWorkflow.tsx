import { signatureStatus, signatureStatusLabels } from "./signatures";
import { useEffect, useState } from "react";
import { z } from "zod";
import { api } from "./workspaceClient";
import {
  eventSchema,
  type WorkspaceUser,
  type SharedOrder,
  type WorkEvent,
} from "./workspaceTypes";
import { savedSchema, type SavedWorkOrder } from "./workOrderArchive";
import { today, type WorkDraft } from "./workOrders";
export default function OrderWorkflow({
  entry,
  user,
  onAction,
  onCarry,
  acceptDisabled = false,
}: {
  entry: SharedOrder;
  user: WorkspaceUser;
  onAction: (
    id: string,
    action: "accept" | "reopen" | "replan",
    reason?: string,
    order?: SavedWorkOrder,
  ) => Promise<SavedWorkOrder | null>;
  onCarry: (draft: WorkDraft) => void;
  acceptDisabled?: boolean;
}) {
  const [reason, setReason] = useState(""),
    [events, setEvents] = useState<WorkEvent[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [date, setDate] = useState(today()),
    [shift, setShift] = useState("День"),
    [brigade, setBrigade] = useState(entry.order.draft.brigade);
  const [plans, setPlans] = useState(() =>
    entry.order.draft.rows.map((r) => r.plan),
  );
  useEffect(() => {
    setPlans(entry.order.draft.rows.map((r) => r.plan));
    setEvents(null);
  }, [entry.revision]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="order-workflow">
      <p>
        Состояние:{" "}
        {entry.stage === "accepted"
          ? "Принят руководителем"
          : entry.stage === "submitted"
            ? "Сдан, ожидает проверки"
            : "Выдан"}{" "}
        · версия {entry.revision} · {entry.updatedBy}
      </p>
      {error && <p role="alert">{error}</p>}
      {user.role === "admin" && (
        <>
          {entry.stage === "submitted" && (
            <button
              disabled={busy || acceptDisabled}
              title={
                acceptDisabled
                  ? "Сначала сохраните или отмените правки проверки объёмов"
                  : "Принять наряд"
              }
              onClick={() =>
                void run(async () => {
                  await onAction(entry.order.id, "accept");
                })
              }
            >
              Принять наряд
            </button>
          )}
          <details>
            <summary>
              {entry.stage === "issued"
                ? "Исправить план с записью в историю"
                : "Вернуть на исправление"}
            </summary>
            <label>
              Причина
              <textarea
                aria-label="Причина изменения наряда"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={3}
              />
            </label>
            {entry.stage === "issued" &&
              entry.order.draft.rows.map((r, i) => (
                <label key={r.id}>
                  {r.work}, {r.unit}
                  <input
                    aria-label={`Новый план ${i + 1}`}
                    type="number"
                    min={0}
                    step="any"
                    value={plans[i] ?? ""}
                    onChange={(e) =>
                      setPlans((p) =>
                        p.map((v, j) =>
                          i === j
                            ? e.target.value === ""
                              ? null
                              : +e.target.value
                            : v,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            <button
              disabled={busy || reason.trim().length < 3}
              onClick={() =>
                void run(async () => {
                  const order =
                    entry.stage === "issued"
                      ? {
                          ...entry.order,
                          serverRevision: entry.revision,
                          draft: {
                            ...entry.order.draft,
                            rows: entry.order.draft.rows.map((r, i) => ({
                              ...r,
                              plan: plans[i],
                            })),
                          },
                        }
                      : undefined;
                  await onAction(
                    entry.order.id,
                    entry.stage === "issued" ? "replan" : "reopen",
                    reason,
                    order,
                  );
                })
              }
            >
              {entry.stage === "issued"
                ? "Сохранить исправленный план"
                : "Вернуть в работу"}
            </button>
          </details>
          {entry.stage !== "issued" && (
            <details>
              <summary>Перенести незавершённое в другую смену</summary>
              <label>
                Дата начала
                <input
                  aria-label="Дата продолжения"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                Смена
                <select
                  aria-label="Смена продолжения"
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                >
                  <option>День</option>
                  <option>Ночь</option>
                </select>
              </label>
              <label>
                Бригада
                <input
                  value={brigade}
                  onChange={(e) => setBrigade(e.target.value)}
                />
              </label>
              <p>
                Будет подготовлен черновик. Если прежний факт неизвестен, новый
                план также останется не определён до уточнения.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = z
                      .object({ draft: savedSchema.shape.draft })
                      .parse(
                        await api(
                          `/api/orders/${entry.order.id}/carryover`,
                          "POST",
                          { date, shift, brigade },
                        ),
                      );
                    onCarry(result.draft);
                  })
                }
              >
                Подготовить продолжение
              </button>
            </details>
          )}
        </>
      )}
      <button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            setEvents(
              z
                .object({ events: z.array(eventSchema) })
                .parse(await api(`/api/orders/${entry.order.id}/history`))
                .events,
            );
          })
        }
      >
        История изменений
      </button>
      {events && (
        <div className="order-history">
          {events.map((e) => (
            <details key={e.id}>
              <summary>
                {new Date(e.createdAt).toLocaleString("ru-RU")} · {e.actor} ·{" "}
                {(
                  {
                    issued: "Выдача",
                    submitted: "Сдача",
                    accepted: "Приёмка",
                    reopen: "Возврат на исправление",
                    replan: "Изменение плана",
                    "progress-saved": "Изменение заявленного факта",
                    "volumes-verified": "Проверка объёмов",
                    "additional-work": "Дополнительная работа",
                    "imported-local": "Перенос из браузера",
                    "object-note": "Фото / замечание",
                    "signatures-verified": "Проверка подписей по фото",
                  } as Record<string, string>
                )[e.action] ?? e.action}
              </summary>
              <p>{e.reason}</p>
              {e.snapshot?.draft.rows.map((r) => (
                <p key={r.id}>
                  {r.work} · план {r.plan ?? "не указан"} {r.unit} · факт{" "}
                  {r.actual ?? "не указан"} {r.unit} ·{" "}
                  {r.completed ? "выполнено" : "не завершено"} · проверено{" "}
                  {r.verifiedActual ?? "не проверено"} {r.unit} ·{" "}
                  {r.verificationBasis || "без основания проверки"}
                  {r.additional
                    ? ` · дополнительная работа: ${r.additional.basis}`
                    : ""}
                </p>
              ))}
              {e.snapshot?.draft.crew.map((p) => (
                <p key={p.id}>
                  {p.name} · выход {p.start || "не указан"} · окончание{" "}
                  {p.end || "не указано"} · проверка подписи на фото: выход{" "}
                  {signatureStatusLabels[signatureStatus(p, "start")]},
                  окончание {signatureStatusLabels[signatureStatus(p, "end")]}
                </p>
              ))}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
