import { useConstruction } from "./useConstruction";
import type { ConstructionRecord } from "./construction";
import type { SharedOrder } from "./workspaceTypes";
export default function ConstructionObjectContext({
  model,
  ids,
  orders,
  onRecord,
  onOrders,
}: {
  model: string;
  ids: string[];
  orders: SharedOrder[];
  onRecord: (record: ConstructionRecord) => void;
  onOrders: () => void;
}) {
  const data = useConstruction(true);
  const records = data.records.filter(
    (r) =>
      "model" in r.payload &&
      r.payload.model === model &&
      r.payload.elementIds.some((id) => ids.includes(id)),
  );
  const linkedOrders = orders.filter((o) =>
    o.order.draft.rows.some((row) =>
      row.elementIds.some((id) => ids.includes(id)),
    ),
  );
  return (
    <section className="construction-object-context">
      <h3>Работы и документы конструкции</h3>
      {data.error && <p role="alert">{data.error}</p>}
      {linkedOrders.length > 0 && (
        <button onClick={onOrders}>
          Наряды конструкции: {linkedOrders.length}
        </button>
      )}
      {records.map((r) => (
        <button key={r.id} onClick={() => onRecord(r)}>
          <span>
            {r.payload.kind === "task"
              ? "Работа"
              : r.payload.kind === "issue"
                ? "Замечание"
                : r.payload.kind === "document"
                  ? "Документ"
                  : r.payload.kind === "movement"
                    ? "Материал"
                    : "Объект"}
          </span>
          {r.payload.title}
        </button>
      ))}
      {!records.length && !linkedOrders.length && (
        <p>К этой конструкции пока нет привязанных рабочих записей.</p>
      )}
    </section>
  );
}
