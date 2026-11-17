import OrderEvidencePane from "./OrderEvidencePane";
import OrderReview from "./OrderReviewPanel";
import OrderMedia from "./OrderMedia";
import type { additionalSchema, reviewSchema } from "./orderReview";
import type { z } from "zod";
import { useEffect, useState } from "react";
import { Download, Plus, Check, ArrowLeft } from "lucide-react";
import {
  type SavedWorkOrder,
  handoffErrors,
  submitWorkOrder,
} from "./workOrderArchive";
import { download } from "./export";
import {
  reportErrors,
  crewHours,
  type WorkDraft,
  type WorkRow,
} from "./workOrders";
import type { SharedOrder, WorkspaceUser } from "./workspaceTypes";
import OrderWorkflow from "./OrderWorkflow";
import OrdersRegister from "./OrdersRegister";
import ShiftSignatures from "./ShiftSignatures";
import {
  signatureFields,
  signatureStatusFields,
  type SignatureStatus,
} from "./signatures";
const f = (n: number | null) =>
  n === null
    ? "Не определён"
    : n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });

export default function DailyWorkOrders({
  orders,
  contextDate,
  contextShift,
  onContextDate,
  onContextShift,
  error,
  onSave,
  onSaveSignatures,
  onNew,
  user = null,
  shared,
  onAction,
  onCarry,
  onEvidence,
  onReview,
  onAdditional,
  initialOrderId,
  onInitialOpened,
}: {
  orders: SavedWorkOrder[];
  contextDate?: string;
  contextShift?: string;
  onContextDate?: (v: string) => void;
  onContextShift?: (v: string) => void;
  error: string;
  onSave: (order: SavedWorkOrder) => Promise<SavedWorkOrder | null>;
  onSaveSignatures: (order: SavedWorkOrder) => Promise<SavedWorkOrder | null>;
  onNew: () => void;
  user?: WorkspaceUser | null;
  shared?: SharedOrder[];
  onAction: (
    id: string,
    action: "accept" | "reopen" | "replan",
    reason?: string,
    order?: SavedWorkOrder,
  ) => Promise<SavedWorkOrder | null>;
  onCarry: (draft: WorkDraft) => void;
  onEvidence: (order: SavedWorkOrder, row: WorkRow) => void;
  onReview: (
    order: SavedWorkOrder,
    rows: z.infer<typeof reviewSchema>["rows"],
  ) => Promise<SavedWorkOrder | null>;
  onAdditional: (
    order: SavedWorkOrder,
    fields: Omit<z.infer<typeof additionalSchema>, "revision">,
  ) => Promise<SavedWorkOrder | null>;
  initialOrderId?: string | null;
  onInitialOpened?: () => void;
}) {
  const [editing, setEditing] = useState<SavedWorkOrder | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [detailView, setDetailView] = useState("work");
  const [reviewSide, setReviewSide] = useState("data");
  useEffect(() => {
    setDetailView("work");
    setReviewSide("data");
  }, [editing?.id]);
  useEffect(() => {
    if (!initialOrderId) return;
    const order = orders.find((o) => o.id === initialOrderId);
    if (order) {
      setEditing(structuredClone(order));
      onInitialOpened?.();
    }
  }, [initialOrderId, orders, onInitialOpened]);

  const errors = editing ? handoffErrors(editing) : [];
  const canIssue = !user || user.role === "admin",
    canEdit = !user || user.role !== "viewer";
  const checks = (order: SavedWorkOrder | undefined | null) =>
    order?.draft.crew.map((p) => ({
      id: p.id,
      start: p.startSignatureNoteId ?? null,
      end: p.endSignatureNoteId ?? null,
      startStatus: p.startSignatureStatus,
      endStatus: p.endSignatureStatus,
    }));
  const signatureChanges =
    !!editing &&
    JSON.stringify(checks(editing)) !==
      JSON.stringify(checks(orders.find((o) => o.id === editing.id)));
  const saveSignatureChecks = async () => {
    if (!editing) return null;
    setBusy(true);
    try {
      const saved = await onSaveSignatures(editing);
      if (saved) {
        setEditing(saved);
        setMessage("Проверка подписей по фото сохранена");
      }
      return saved;
    } finally {
      setBusy(false);
    }
  };
  const persistCurrent = async () => {
    if (reviewDirty) {
      setMessage("Сначала сохраните или отмените правки проверки объёмов");
      return false;
    }
    if (!editing || !canEdit) return true;
    if (editing.submittedAt)
      return !signatureChanges || !!(await saveSignatureChecks());
    return !!(await onSave(editing));
  };
  const save = async (submit: boolean) => {
    if (!editing) return;
    setBusy(true);
    try {
      const invalid = reportErrors(editing.draft);
      if (invalid.length) throw Error(invalid.join("; "));
      const order = submit ? submitWorkOrder(editing) : editing;
      const saved = await onSave(order);
      if (saved) {
        setEditing(saved);
        setMessage(
          submit
            ? "Наряд сдан и сохранён"
            : "Выполнение и фактические значения сохранены",
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось сохранить наряд");
    } finally {
      setBusy(false);
    }
  };
  const exportReport = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const { createWorkOrder } = await import("./workOrderExcel");
      const bytes = await createWorkOrder(editing.draft);
      download(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
        `Наряд-${editing.draft.date}-${editing.id.slice(0, 8)}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className={`schedule daily-work-orders ${editing ? "order-detail-open" : ""}`}
      aria-label="Наряды по дням"
    >
      <header className="daily-orders-heading">
        <div>
          <h1>{editing ? "Наряд смены" : "Наряды по дням"}</h1>
          <p>
            Составьте наряд заранее. При сдаче отметьте выполнение и внесите
            факт.
          </p>
        </div>
        <button
          className="primary"
          disabled={!canIssue || busy}
          onClick={async () => {
            if (await persistCurrent()) onNew();
          }}
        >
          <Plus size={17} />
          Новый наряд
        </button>
      </header>
      <p className="storage-note">
        {shared
          ? "Общая база бригады: наряды доступны на компьютере и телефоне. Изменения проверяются по версии записи."
          : "Хранится в этом браузере. Между устройствами наряды автоматически не синхронизируются."}
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="orders-work-area">
        <OrdersRegister
          contextDate={contextDate}
          contextShift={contextShift}
          onContextDate={onContextDate}
          onContextShift={onContextShift}
          orders={orders}
          shared={shared ?? []}
          selected={editing?.id}
          onSelect={(order) => {
            void (async () => {
              if (await persistCurrent()) {
                setEditing(structuredClone(order));
                setMessage("");
              }
            })();
          }}
        />
        {editing && (
          <div
            className={`order-detail detail-${detailView} review-${reviewSide}`}
          >
            <button
              onClick={async () => {
                if (await persistCurrent()) {
                  setEditing(null);
                  setMessage("");
                }
              }}
            >
              <ArrowLeft size={16} />К списку дней
            </button>
            <div className="handoff-heading">
              <h2>
                {editing.draft.date} · {editing.draft.shift} ·{" "}
                {editing.draft.site}
              </h2>
              <span>
                {editing.submittedAt ? "Сдан" : "Выдан, ожидает сдачи"}
              </span>
              <p>
                {editing.draft.brigade} ·{" "}
                {editing.draft.contractor || "Подрядчик не указан"} ·{" "}
                {editing.draft.zone}
              </p>
            </div>
            <nav className="order-detail-tabs" aria-label="Разделы наряда">
              {[
                ["work", "Работы"],
                ["people", "Люди и подписи"],
                ["media", "Вложения"],
                ["review", "Проверка"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={detailView === id}
                  onClick={() => setDetailView(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {detailView === "review" && (
              <div className="review-side-tabs">
                <button
                  aria-pressed={reviewSide === "data"}
                  onClick={() => setReviewSide("data")}
                >
                  Данные
                </button>
                <button
                  aria-pressed={reviewSide === "photo"}
                  onClick={() => setReviewSide("photo")}
                >
                  Фото
                </button>
              </div>
            )}
            {user && detailView === "review" && (
              <OrderEvidencePane orderId={editing.id} />
            )}
            <div className="order-detail-fields">
              {" "}
              {shared &&
                user &&
                shared.find((e) => e.order.id === editing.id) && (
                  <OrderWorkflow
                    acceptDisabled={reviewDirty}
                    key={editing.id}
                    entry={shared.find((e) => e.order.id === editing.id)!}
                    user={user}
                    onAction={async (...args) => {
                      if (editing.submittedAt && signatureChanges) {
                        const saved = await saveSignatureChecks();
                        if (!saved) return null;
                        args[3] = saved;
                      }
                      const saved = await onAction(...args);
                      if (saved) setEditing(saved);
                      return saved;
                    }}
                    onCarry={onCarry}
                  />
                )}
              {shared &&
                shared.find((e) => e.order.id === editing.id)?.revision !==
                  editing.serverRevision && (
                  <p className="workspace-error">
                    Запись обновлена на сервере.{" "}
                    <button
                      onClick={() => {
                        const latest = shared.find(
                          (e) => e.order.id === editing.id,
                        );
                        if (latest)
                          setEditing({
                            ...latest.order,
                            serverRevision: latest.revision,
                          });
                      }}
                    >
                      Загрузить актуальную версию вместо несохранённых полей
                    </button>
                  </p>
                )}
              <div hidden={detailView !== "media"}>
                {user && <OrderMedia order={editing} user={user} />}
              </div>
              <div hidden={detailView !== "review"}>
                <OrderReview
                  onDirty={setReviewDirty}
                  key={`${editing.id}:${editing.serverRevision ?? editing.createdAt}`}
                  order={editing}
                  admin={canIssue}
                  canEdit={canEdit}
                  accepted={
                    shared?.find((e) => e.order.id === editing.id)?.stage ===
                    "accepted"
                  }
                  onReview={async (rows) => {
                    const current = editing.submittedAt
                      ? signatureChanges
                        ? await saveSignatureChecks()
                        : editing
                      : await onSave(editing);
                    if (!current) return false;
                    const saved = await onReview(current, rows);
                    if (saved) {
                      setEditing(saved);
                      setMessage(
                        "Проверенные объёмы сохранены отдельно от заявленных",
                      );
                    }
                    return !!saved;
                  }}
                  onAdditional={async (fields) => {
                    if (reviewDirty) {
                      setMessage(
                        "Сначала сохраните или отмените правки проверки объёмов",
                      );
                      return false;
                    }
                    const current = await onSave(editing);
                    if (!current) return false;
                    const saved = await onAdditional(current, fields);
                    if (saved) {
                      setEditing(saved);
                      setMessage(
                        "Дополнительная работа добавлена. Исходный план сохранён.",
                      );
                    }
                    return !!saved;
                  }}
                />
              </div>
              <div hidden={detailView !== "work"}>
                {editing.draft.rows.map((row, index) => (
                  <article
                    className="handoff-row"
                    key={row.id}
                    data-testid="handoff-row"
                  >
                    <h3>
                      {index + 1}. {row.work}
                    </h3>
                    <p>{row.target}</p>
                    {row.additional && (
                      <p className="additional-badge">
                        Дополнительная работа · {row.additional.basis}
                      </p>
                    )}
                    {user && (
                      <button onClick={() => onEvidence(editing, row)}>
                        Фото и замечания
                      </button>
                    )}
                    <div className="handoff-values">
                      <span>
                        План
                        <strong>
                          {f(row.plan)} {row.unit}
                        </strong>
                      </span>
                      <span>
                        Нужно по модели
                        <strong>
                          {row.modelNeed
                            ? `${f(row.modelNeed.value)} ${row.modelNeed.unit}`
                            : "Не определено"}
                        </strong>
                      </span>
                      <label>
                        Заявленный факт, {row.unit}
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`Факт работы ${index + 1}`}
                          value={row.actual ?? ""}
                          disabled={!!editing.submittedAt || !canEdit || busy}
                          placeholder="Не введён"
                          onChange={(e) => {
                            const value =
                              e.target.value === "" ? null : +e.target.value;
                            setEditing(
                              (o) =>
                                o && {
                                  ...o,
                                  draft: {
                                    ...o.draft,
                                    rows: o.draft.rows.map((r) =>
                                      r.id === row.id
                                        ? { ...r, actual: value }
                                        : r,
                                    ),
                                  },
                                },
                            );
                          }}
                        />
                      </label>
                      <label className="completion-check">
                        <input
                          type="checkbox"
                          aria-label={`Выполнена работа ${index + 1}`}
                          checked={!!row.completed}
                          disabled={!!editing.submittedAt || !canEdit || busy}
                          onChange={(e) => {
                            const completed = e.target.checked;
                            setEditing(
                              (o) =>
                                o && {
                                  ...o,
                                  draft: {
                                    ...o.draft,
                                    rows: o.draft.rows.map((r) =>
                                      r.id === row.id ? { ...r, completed } : r,
                                    ),
                                  },
                                },
                            );
                          }}
                        />
                        Выполнено
                      </label>
                    </div>
                    <small>{row.modelNeed?.basis ?? row.basis}</small>
                  </article>
                ))}
              </div>
              <div hidden={detailView !== "people" && detailView !== "review"}>
                <div className="reported-people">
                  <label>
                    Заявлено трудовых единиц
                    <input
                      aria-label="Заявлено людей на смену"
                      type="number"
                      min="0"
                      step="1"
                      disabled={!!editing.submittedAt || !canEdit || busy}
                      value={editing.draft.reportedPeople ?? ""}
                      onChange={(e) =>
                        setEditing((o) =>
                          o
                            ? {
                                ...o,
                                draft: {
                                  ...o.draft,
                                  reportedPeople:
                                    e.target.value === ""
                                      ? null
                                      : +e.target.value,
                                },
                              }
                            : o,
                        )
                      }
                    />
                  </label>
                  <p>
                    По плану: {editing.draft.plannedPeople ?? "не указано"}.
                    Поимённых строк: {editing.draft.crew.length}.
                  </p>
                  {editing.draft.reportedPeople !== undefined &&
                    editing.draft.reportedPeople !== null &&
                    editing.draft.reportedPeople !==
                      editing.draft.crew.length && (
                      <p className="cm-warning">
                        Заявленное количество отличается от поимённого состава.
                        Уточните табель; значения не заменяются автоматически.
                      </p>
                    )}
                </div>
                {editing.draft.crew.length > 0 && (
                  <details open className="work-crew handoff-crew">
                    <summary>Табель ({editing.draft.crew.length})</summary>
                    <p>
                      Фактическое время смены. Дата — начало смены; ночное
                      окончание может быть на следующий день.
                    </p>
                    {editing.draft.crew.map((person, i) => (
                      <div className="work-crew-row" key={person.id}>
                        <strong>{person.name}</strong>
                        {(
                          [
                            ["start", "Начало смены"],
                            ["end", "Конец смены"],
                            ["breakMinutes", "Перерыв"],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key}>
                            {label}
                            {key === "breakMinutes" ? ", мин" : ""}
                            <input
                              aria-label={`${label} ${i + 1}`}
                              type={key === "breakMinutes" ? "number" : "time"}
                              min={key === "breakMinutes" ? 0 : undefined}
                              disabled={
                                !!editing.submittedAt || !canEdit || busy
                              }
                              value={person[key]}
                              onChange={(e) => {
                                const value =
                                  key === "breakMinutes"
                                    ? +e.target.value
                                    : e.target.value;
                                setEditing(
                                  (o) =>
                                    o && {
                                      ...o,
                                      draft: {
                                        ...o.draft,
                                        crew: o.draft.crew.map((r) =>
                                          r.id === person.id
                                            ? { ...r, [key]: value }
                                            : r,
                                        ),
                                      },
                                    },
                                );
                              }}
                            />
                          </label>
                        ))}
                        <span>{f(crewHours(person))} ч</span>
                      </div>
                    ))}
                  </details>
                )}
                {user && (
                  <ShiftSignatures
                    order={editing}
                    user={user}
                    disabled={busy}
                    accepted={
                      shared?.find((e) => e.order.id === editing.id)?.stage ===
                      "accepted"
                    }
                    onChange={(personId, phase, noteId, status) =>
                      setEditing(
                        (o) =>
                          o && {
                            ...o,
                            draft: {
                              ...o.draft,
                              crew: o.draft.crew.map((p) =>
                                p.id === personId
                                  ? {
                                      ...p,
                                      [signatureFields[phase]]: noteId,
                                      [signatureStatusFields[phase]]:
                                        status ??
                                        ((noteId
                                          ? "present"
                                          : "unchecked") as SignatureStatus),
                                    }
                                  : p,
                              ),
                            },
                          },
                      )
                    }
                  />
                )}
              </div>
              {errors.length > 0 && (
                <ul
                  className="work-order-errors"
                  aria-label="Что нужно заполнить перед сдачей"
                >
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="handoff-actions">
                {editing.submittedAt &&
                  user?.role === "admin" &&
                  shared?.find((e) => e.order.id === editing.id)?.stage !==
                    "accepted" && (
                    <button
                      className="primary"
                      disabled={busy || !signatureChanges}
                      onClick={() => void saveSignatureChecks()}
                    >
                      Сохранить проверку подписей
                    </button>
                  )}
                {!editing.submittedAt && canEdit && (
                  <>
                    <button disabled={busy} onClick={() => void save(false)}>
                      Сохранить выполнение
                    </button>
                    <button
                      className="primary"
                      onClick={() => save(true)}
                      disabled={busy || errors.length > 0}
                    >
                      <Check size={17} />
                      Сдать наряд
                    </button>
                  </>
                )}
                <button
                  onClick={() => void exportReport()}
                  disabled={busy || reportErrors(editing.draft).length > 0}
                >
                  <Download size={17} />
                  Скачать Excel
                </button>
              </div>
              {!editing.submittedAt && canEdit && (
                <small>
                  Изменения сохраняются кнопками. Невыполненные позиции могут
                  остаться без факта; ноль вводите только как действительное
                  значение.
                </small>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
