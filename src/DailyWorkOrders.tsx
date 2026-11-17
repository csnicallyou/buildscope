import { useState } from "react";
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
import ShiftSignatures from "./ShiftSignatures";
import { signatureFields } from "./signatures";
const f = (n: number | null) =>
  n === null
    ? "Не определён"
    : n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });

export default function DailyWorkOrders({
  orders,
  error,
  onSave,
  onSaveSignatures,
  onNew,
  user = null,
  shared,
  onAction,
  onCarry,
  onEvidence,
}: {
  orders: SavedWorkOrder[];
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
}) {
  const [editing, setEditing] = useState<SavedWorkOrder | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const errors = editing ? handoffErrors(editing) : [];
  const canIssue = !user || user.role === "admin",
    canEdit = !user || user.role !== "viewer";
  const checks = (order: SavedWorkOrder | undefined | null) =>
    order?.draft.crew.map((p) => ({
      id: p.id,
      start: p.startSignatureNoteId ?? null,
      end: p.endSignatureNoteId ?? null,
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
    if (!editing || !canEdit) return true;
    if (editing.submittedAt)
      return !signatureChanges || !!(await saveSignatureChecks());
    return !!(await onSave(editing));
  };
  const [brigadeFilter, setBrigadeFilter] = useState(""),
    [shiftFilter, setShiftFilter] = useState("");
  const filteredOrders = orders.filter(
    (o) =>
      (!brigadeFilter || o.draft.brigade === brigadeFilter) &&
      (!shiftFilter || o.draft.shift === shiftFilter),
  );
  const dates = [...new Set(filteredOrders.map((o) => o.draft.date))]
    .sort()
    .reverse();
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
    <section className="schedule daily-work-orders" aria-label="Наряды по дням">
      <header className="daily-orders-heading">
        <div>
          <h1>{editing ? "Сдача наряда" : "Наряды по дням"}</h1>
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
      {editing ? (
        <>
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
          {shared && user && shared.find((e) => e.order.id === editing.id) && (
            <OrderWorkflow
              key={`${editing.id}:${shared.find((e) => e.order.id === editing.id)!.revision}`}
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
          <div className="handoff-heading">
            <h2>
              {editing.draft.date} · {editing.draft.shift} ·{" "}
              {editing.draft.site}
            </h2>
            <span>{editing.submittedAt ? "Сдан" : "Выдан, ожидает сдачи"}</span>
            <p>
              {editing.draft.brigade} ·{" "}
              {editing.draft.contractor || "Подрядчик не указан"} ·{" "}
              {editing.draft.zone}
            </p>
          </div>
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
                  Факт, {row.unit}
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
                                r.id === row.id ? { ...r, actual: value } : r,
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
          {editing.draft.crew.length > 0 && (
            <details className="work-crew handoff-crew">
              <summary>Табель ({editing.draft.crew.length})</summary>
              <p>
                Фактическое время смены. Дата — начало смены; ночное окончание
                может быть на следующий день.
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
                        disabled={!!editing.submittedAt || !canEdit || busy}
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
              onChange={(personId, phase, noteId) =>
                setEditing(
                  (o) =>
                    o && {
                      ...o,
                      draft: {
                        ...o.draft,
                        crew: o.draft.crew.map((p) =>
                          p.id === personId
                            ? { ...p, [signatureFields[phase]]: noteId }
                            : p,
                        ),
                      },
                    },
                )
              }
            />
          )}
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
        </>
      ) : (
        <>
          {!orders.length && (
            <div className="orders-empty">
              <h2>Нарядов пока нет</h2>
              <p>
                Создайте наряд, выберите работы и объекты на модели, затем
                нажмите «Выдать наряд».
              </p>
            </div>
          )}
          <div className="daily-filters">
            <label>
              Бригада
              <select
                value={brigadeFilter}
                onChange={(e) => setBrigadeFilter(e.target.value)}
              >
                <option value="">Все доступные</option>
                {[...new Set(orders.map((o) => o.draft.brigade))].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label>
              Смена
              <select
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value)}
              >
                <option value="">Все смены</option>
                <option>День</option>
                <option>Ночь</option>
              </select>
            </label>
          </div>
          {dates.map((date) => (
            <section className="work-order-day" key={date}>
              <h2>{date}</h2>
              {filteredOrders
                .filter((o) => o.draft.date === date)
                .map((order) => (
                  <button
                    className="daily-order-card"
                    key={order.id}
                    onClick={() => {
                      setEditing(structuredClone(order));
                      setMessage("");
                    }}
                  >
                    <strong>
                      {order.draft.site} · {order.draft.shift}
                    </strong>
                    <span>
                      {order.draft.brigade} ·{" "}
                      {order.draft.contractor || "Без подрядчика"}
                    </span>
                    <span>
                      {order.draft.rows.length} работ · выполнено{" "}
                      {order.draft.rows.filter((r) => r.completed).length}
                    </span>
                    <span
                      className={
                        order.submittedAt ? "order-submitted" : "order-issued"
                      }
                    >
                      {order.submittedAt
                        ? "Сдан — открыть"
                        : "Открыть для сдачи"}
                    </span>
                  </button>
                ))}
            </section>
          ))}
        </>
      )}
    </section>
  );
}
