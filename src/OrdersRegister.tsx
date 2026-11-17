import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { SavedWorkOrder } from "./workOrderArchive";
import type { SharedOrder } from "./workspaceTypes";
import { orderSignals, shiftCaption } from "./operations";

export default function OrdersRegister({
  orders,
  contextDate,
  contextShift,
  onContextDate,
  onContextShift,
  shared,
  selected,
  onSelect,
}: {
  orders: SavedWorkOrder[];
  contextDate?: string;
  contextShift?: string;
  onContextDate?: (v: string) => void;
  onContextShift?: (v: string) => void;
  shared: SharedOrder[];
  selected?: string;
  onSelect: (order: SavedWorkOrder) => void;
}) {
  const [query, setQuery] = useState("");
  const [shift, setShift] = useState("");
  const [state, setState] = useState("");
  const [date, setDate] = useState(contextDate ?? "");
  useEffect(() => {
    if (contextDate) setDate(contextDate);
  }, [contextDate]);
  useEffect(() => {
    if (contextShift) setShift(contextShift);
  }, [contextShift]);
  const filtered = orders
    .filter((o) => {
      const s = orderSignals(o, shared);
      return (
        (!shift || o.draft.shift === shift) &&
        (!date || o.draft.date === date) &&
        (!state ||
          (state === "issued"
            ? !s.received
            : state === "accepted"
              ? s.accepted
              : s.review)) &&
        `${o.draft.site} ${o.draft.brigade} ${o.draft.contractor} ${o.draft.rows.map((r) => r.work).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort(
      (a, b) =>
        b.draft.date.localeCompare(a.draft.date) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <div className="orders-register">
      <div className="orders-register-filters">
        <label className="register-search">
          <Search size={16} />
          <input
            aria-label="Поиск наряда"
            value={query}
            placeholder="Работа, подрядчик, объект…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Дата
          <input
            aria-label="Дата наряда"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (e.target.value) onContextDate?.(e.target.value);
            }}
          />
        </label>
        <label>
          Смена
          <select
            aria-label="Фильтр смены наряда"
            value={shift}
            onChange={(e) => {
              setShift(e.target.value);
              if (e.target.value) onContextShift?.(e.target.value);
            }}
          >
            <option value="">Все смены</option>
            <option>День</option>
            <option>Ночь</option>
          </select>
        </label>
        <label>
          Состояние
          <select
            aria-label="Состояние наряда"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">Все состояния</option>
            <option value="issued">Выдан</option>
            <option value="submitted">Ожидает приёмки</option>
            <option value="accepted">Принят</option>
          </select>
        </label>
      </div>
      <div className="orders-register-table">
        <table>
          <thead>
            <tr>
              <th>Объект / подрядчик</th>
              <th>Работа</th>
              <th>План / заявлено / проверено</th>
              <th>Смена</th>
              <th>Состояние</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => {
              const status = orderSignals(order, shared);
              return (
                <tr
                  key={order.id}
                  className={selected === order.id ? "selected" : ""}
                >
                  <td>
                    <button
                      className="daily-order-card"
                      onClick={() => onSelect(order)}
                    >
                      <strong>{order.draft.site}</strong>
                      <span>
                        {order.draft.contractor || order.draft.brigade}
                      </span>
                      <small>{order.draft.zone || "Участок не указан"}</small>
                      <small>
                        {order.draft.brigade} · {order.draft.date} ·{" "}
                        {order.draft.shift}
                      </small>
                      <span className="register-mobile-state">
                        {status.accepted
                          ? "Принят"
                          : status.received
                            ? "Сдан — открыть"
                            : "Открыть для сдачи"}
                      </span>
                    </button>
                  </td>
                  <td>
                    {order.draft.rows.slice(0, 2).map((r) => (
                      <p key={r.id}>{r.work}</p>
                    ))}
                    {order.draft.rows.length > 2 && (
                      <small>Ещё {order.draft.rows.length - 2} работ</small>
                    )}
                  </td>
                  <td>
                    {order.draft.rows.slice(0, 2).map((r) => (
                      <p key={r.id}>
                        {r.plan ?? "—"} / {r.actual ?? "—"} /{" "}
                        {r.verifiedActual ?? "—"} {r.unit}
                      </p>
                    ))}
                  </td>
                  <td>{shiftCaption(order.draft.date, order.draft.shift)}</td>
                  <td>
                    <span
                      className={`operation-status ${status.accepted ? "good" : status.received ? "neutral" : "pending"}`}
                    >
                      {status.accepted
                        ? "Принят"
                        : status.received
                          ? "Ожидает приёмки"
                          : "Выдан"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <div className="operations-empty">
          <h2>
            {orders.length
              ? "Нет нарядов по этому фильтру"
              : "Нарядов пока нет"}
          </h2>
          <p>
            {orders.length
              ? "Измените дату, смену или условия поиска."
              : "Составьте план работ, добавьте людей и выдайте наряд. Выполнение заполняется отдельно."}
          </p>
        </div>
      )}
      <footer>
        Нарядов: {filtered.length} · Количества разных работ и единиц не
        суммируются
      </footer>
    </div>
  );
}
