import { useState } from "react";
import { Download, Plus, Check, ArrowLeft } from "lucide-react";
import {
  type SavedWorkOrder,
  handoffErrors,
  submitWorkOrder,
} from "./workOrderArchive";
import { download } from "./export";
import { reportErrors, crewHours } from "./workOrders";
const f = (n: number | null) =>
  n === null
    ? "Не определён"
    : n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });

export default function DailyWorkOrders({
  orders,
  error,
  onSave,
  onNew,
}: {
  orders: SavedWorkOrder[];
  error: string;
  onSave: (order: SavedWorkOrder) => boolean;
  onNew: () => void;
}) {
  const [editing, setEditing] = useState<SavedWorkOrder | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dates = [...new Set(orders.map((o) => o.draft.date))].sort().reverse();
  const errors = editing ? handoffErrors(editing) : [];
  const save = (submit: boolean) => {
    if (!editing) return;
    try {
      const invalid = reportErrors(editing.draft);
      if (invalid.length) throw Error(invalid.join("; "));
      const order = submit ? submitWorkOrder(editing) : editing;
      if (onSave(order)) {
        setEditing(order);
        setMessage(
          submit
            ? "Наряд сдан и сохранён"
            : "Выполнение и фактические значения сохранены",
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось сохранить наряд");
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
          onClick={() => {
            if (!editing || editing.submittedAt || onSave(editing)) onNew();
          }}
        >
          <Plus size={17} />
          Новый наряд
        </button>
      </header>
      <p className="storage-note">
        Хранится в этом браузере. Между устройствами наряды автоматически не
        синхронизируются.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {editing ? (
        <>
          <button
            onClick={() => {
              if (editing.submittedAt || onSave(editing)) {
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
                    disabled={!!editing.submittedAt}
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
                    disabled={!!editing.submittedAt}
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
                        disabled={!!editing.submittedAt}
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
          {errors.length > 0 && (
            <ul className="work-order-errors">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="handoff-actions">
            {!editing.submittedAt && (
              <>
                <button onClick={() => save(false)}>
                  Сохранить выполнение
                </button>
                <button
                  className="primary"
                  onClick={() => save(true)}
                  disabled={errors.length > 0}
                >
                  <Check size={17} />
                  Сдать наряд
                </button>
              </>
            )}
            <button
              onClick={() => void exportReport()}
              disabled={busy || errors.length > 0}
            >
              <Download size={17} />
              Скачать Excel
            </button>
          </div>
          {!editing.submittedAt && (
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
          {dates.map((date) => (
            <section className="work-order-day" key={date}>
              <h2>{date}</h2>
              {orders
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
