import { useMemo, useState } from "react";
import {
  ClipboardList,
  Copy,
  FileClock,
  Moon,
  PenLine,
  Search,
  Sun,
  UsersRound,
} from "lucide-react";
import type { SavedWorkOrder } from "./workOrderArchive";
import type { SharedOrder } from "./workspaceTypes";
import { today } from "./workOrders";
import { signatureSummary } from "./signatures";
import {
  matchesSignal,
  orderSignals,
  shiftCaption,
  shiftSummary,
  type OrderSignal,
} from "./operations";

export default function ShiftControl({
  orders,
  shared,
  onOpen,
  onNew,
  initialSignal = "all",
  siteTitle = "",
  siteIds,
  contextDate,
  contextShift,
  onContextDate,
  onContextShift,
}: {
  orders: SavedWorkOrder[];
  shared: SharedOrder[];
  onOpen: (id: string) => void;
  onNew: () => void;
  initialSignal?: OrderSignal;
  siteTitle?: string;
  siteIds?: string[];
  contextDate?: string;
  contextShift?: string;
  onContextDate?: (v: string) => void;
  onContextShift?: (v: string) => void;
}) {
  const [localDate, setLocalDate] = useState(today());
  const [localShift, setLocalShift] = useState("Ночь");
  const date = contextDate ?? localDate,
    shift = contextShift ?? localShift;
  const setDate = (v: string) => {
    setLocalDate(v);
    onContextDate?.(v);
  };
  const setShift = (v: string) => {
    setLocalShift(v);
    onContextShift?.(v);
  };
  const [signal, setSignal] = useState<OrderSignal>(initialSignal);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [allDates, setAllDates] = useState(
    contextDate ? false : initialSignal !== "all",
  );
  const current = useMemo(
    () =>
      orders.filter(
        (o) =>
          (!siteIds || siteIds.includes(o.draft.nodeId ?? "")) &&
          (allDates || (o.draft.date === date && o.draft.shift === shift)),
      ),
    [orders, date, shift, allDates, siteIds],
  );
  const filtered = current.filter(
    (o) =>
      matchesSignal(o, shared, signal) &&
      `${o.draft.contractor} ${o.draft.brigade} ${o.draft.site}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const summary = shiftSummary(current, shared);
  const metrics = [
    {
      key: "attendance" as const,
      title: "Сведения о выходе неполные",
      icon: UsersRound,
    },
    {
      key: "reports" as const,
      title: "Отчёты ещё не сданы",
      icon: ClipboardList,
    },
    {
      key: "review" as const,
      title: "Наряды ожидают приёмки",
      icon: FileClock,
    },
    { key: "signatures" as const, title: "Проверить подписи", icon: PenLine },
  ];
  return (
    <section className="shift-control" aria-label="Контроль смены">
      <header className="operations-heading">
        <div>
          <p>{siteTitle || "Все объекты"}</p>
          <h1>Контроль смены</h1>
        </div>
        <button className="primary" onClick={onNew}>
          Создать наряд
        </button>
      </header>
      <div className="shift-filter-bar">
        <label>
          Дата начала
          <input
            type="date"
            aria-label="Дата смены"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setAllDates(false);
            }}
          />
        </label>
        <label>
          Смена
          <select
            aria-label="Контролируемая смена"
            value={shift}
            onChange={(e) => {
              setShift(e.target.value);
              setAllDates(false);
            }}
          >
            <option>День</option>
            <option>Ночь</option>
          </select>
        </label>
        <span className="shift-date-caption">
          {shift === "Ночь" ? <Moon size={19} /> : <Sun size={19} />}{" "}
          {shiftCaption(date, shift)}
        </span>
        <label className="all-dates">
          <input
            type="checkbox"
            checked={allDates}
            onChange={(e) => setAllDates(e.target.checked)}
          />
          Все даты и смены
        </label>
      </div>
      <div className="operations-kpis shift-kpis">
        {metrics.map(({ key, title, icon: Icon }) => (
          <button
            key={key}
            title={title}
            aria-label={title}
            className={`operation-kpi ${signal === key ? "selected" : ""}`}
            onClick={() => setSignal(signal === key ? "all" : key)}
          >
            <Icon size={22} />
            <span>
              <span className="kpi-label">{title}</span>
              <strong>
                {current.filter((o) => matchesSignal(o, shared, key)).length}
              </strong>
            </span>
          </button>
        ))}
      </div>
      <div className="shift-body">
        <div className="shift-register">
          <div className="register-tools">
            <button
              className={signal === "all" ? "active" : ""}
              onClick={() => setSignal("all")}
            >
              Все наряды ({current.length})
            </button>
            <label>
              <Search size={17} />
              <input
                aria-label="Поиск по подрядчику"
                placeholder="Подрядчик, бригада, объект…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="shift-table-wrap">
            <table className="shift-table">
              <thead>
                <tr>
                  <th>Подрядчик / бригада</th>
                  <th>Выход по табелю</th>
                  <th>Работы</th>
                  <th>Объёмы</th>
                  <th>Техника в наряде</th>
                  <th>Отчёт</th>
                  <th>Подписи</th>
                  <th>Приёмка</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const state = orderSignals(o, shared);
                  const present = o.draft.crew.filter((p) => p.start).length;
                  return (
                    <tr key={o.id}>
                      <td data-label="Подрядчик / бригада">
                        <strong>
                          {o.draft.contractor || "Подрядчик не указан"}
                        </strong>
                        <small>
                          {o.draft.brigade} · {o.draft.site}
                        </small>
                        <small>
                          {shiftCaption(o.draft.date, o.draft.shift)}
                        </small>
                      </td>
                      <td data-label="Выход по табелю">
                        <small>
                          План / заявлено: {o.draft.plannedPeople ?? "—"} /{" "}
                          {o.draft.reportedPeople ?? "—"}
                        </small>
                        <strong>
                          {present} / {o.draft.crew.length || "—"}
                        </strong>
                        <small>
                          {state.attendance
                            ? "Сведения неполные"
                            : "Начало указано у всех"}
                        </small>
                      </td>
                      <td data-label="Работы">
                        {o.draft.rows.length}
                        <small>
                          {o.draft.rows.filter((r) => r.actual !== null).length}{" "}
                          с фактом
                        </small>
                      </td>
                      <td data-label="Объёмы">
                        <span className="operation-status neutral">
                          {
                            o.draft.rows.filter(
                              (r) =>
                                r.verifiedActual !== undefined &&
                                r.verifiedActual !== null,
                            ).length
                          }{" "}
                          / {o.draft.rows.length} проверено
                        </span>
                      </td>
                      <td data-label="Техника в наряде">
                        {Array.from(
                          new Set(
                            o.draft.rows
                              .map((r) => r.equipment)
                              .filter(Boolean),
                          ),
                        ).join(", ") || "Не указана"}
                      </td>
                      <td data-label="Отчёт">
                        <span
                          className={`operation-status ${state.received ? "good" : "pending"}`}
                        >
                          {state.received ? "Сдан" : "Ещё не сдан"}
                        </span>
                      </td>
                      <td data-label="Подписи">
                        <span
                          className={`operation-status ${state.signatures ? "pending" : "good"}`}
                        >
                          {signatureSummary(o.draft.crew)}
                        </span>
                      </td>
                      <td data-label="Приёмка">
                        <span
                          className={`operation-status ${state.accepted ? "good" : "neutral"}`}
                        >
                          {state.accepted ? "Принят" : "Не принят"}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => onOpen(o.id)}>Открыть</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <div className="operations-empty">
              <ClipboardList size={32} />
              <h2>
                {current.length
                  ? "Нет нарядов по этому фильтру"
                  : "На эту смену пока нет нарядов"}
              </h2>
              <p>
                Выберите другую дату или включите все даты. Отсутствие записи не
                означает невыход бригады.
              </p>
              <button
                onClick={() => {
                  setAllDates(true);
                  setSignal("all");
                  setQuery("");
                }}
              >
                Показать все наряды
              </button>
            </div>
          )}
        </div>
        <aside className="shift-summary">
          <Copy size={23} />
          <h2>Сводка для чата</h2>
          <p>
            Текст по текущей выборке дат и смен. Перед отправкой проверьте
            сведения.
          </p>
          <textarea
            aria-label="Предпросмотр сводки"
            readOnly
            value={summary || "На выбранную смену нет сохранённых нарядов."}
          />
          <button
            className="primary"
            disabled={!summary}
            onClick={() => {
              void navigator.clipboard
                .writeText(summary)
                .then(() => setCopied("Скопировано"))
                .catch(() => setCopied("Выделите и скопируйте текст из поля"));
            }}
          >
            <Copy size={16} />
            Копировать сводку
          </button>
          <small role="status">
            {copied || "Отправка в мессенджер — вручную."}
          </small>
        </aside>
      </div>
    </section>
  );
}
