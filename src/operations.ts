import type { SavedWorkOrder } from "./workOrderArchive";
import type { SharedOrder } from "./workspaceTypes";

export type OrderSignal =
  "all" | "attendance" | "reports" | "review" | "signatures";
export function orderSignals(order: SavedWorkOrder, shared: SharedOrder[]) {
  const entry = shared.find((o) => o.order.id === order.id);
  const people = order.draft.crew;
  return {
    received: !!order.submittedAt,
    accepted: entry?.stage === "accepted",
    attendance: !people.length || people.some((p) => !p.start),
    signatures:
      !people.length ||
      people.some((p) => !p.startSignatureNoteId || !p.endSignatureNoteId),
    review: !!order.submittedAt && entry?.stage !== "accepted",
  };
}
export function matchesSignal(
  order: SavedWorkOrder,
  shared: SharedOrder[],
  signal: OrderSignal,
) {
  const state = orderSignals(order, shared);
  return (
    signal === "all" || (signal === "reports" ? !state.received : state[signal])
  );
}
export function shiftCaption(date: string, shift: string) {
  const d = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(+d)) return `${date} · ${shift}`;
  const fmt = (v: Date) =>
    v.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  // Times are deliberately omitted: the project has no approved shift schedule yet.
  if (shift !== "Ночь") return `${fmt(d)} · дневная смена`;
  const end = new Date(d);
  end.setDate(end.getDate() + 1);
  return `${fmt(d)} → ${fmt(end)} · ночная смена`;
}
export function shiftSummary(orders: SavedWorkOrder[], shared: SharedOrder[]) {
  return orders
    .map((o) => {
      const s = orderSignals(o, shared);
      const started = o.draft.crew.filter((p) => p.start).length;
      return `${o.draft.contractor || o.draft.brigade}: ${o.draft.site}; ${shiftCaption(o.draft.date, o.draft.shift)}. Выход в табеле: ${started} из ${o.draft.crew.length || "нет списка"}. ${s.received ? "Отчёт сдан" : "Отчёт ещё не сдан"}; ${s.accepted ? "наряд принят" : "наряд не принят"}; ${s.signatures ? "подписи проверены не полностью" : "отметки проверки подписей есть"}.`;
    })
    .join("\n\n");
}
