import { useEffect, useState } from "react";
import type { SavedWorkOrder } from "./workOrderArchive";
import type { additionalSchema, reviewSchema } from "./orderReview";
import type { z } from "zod";
export default function OrderReview({
  order,
  admin,
  canEdit,
  accepted,
  onReview,
  onAdditional,
  onDirty,
}: {
  order: SavedWorkOrder;
  admin: boolean;
  canEdit: boolean;
  accepted?: boolean;
  onReview: (rows: z.infer<typeof reviewSchema>["rows"]) => Promise<boolean>;
  onAdditional: (
    fields: Omit<z.infer<typeof additionalSchema>, "revision">,
  ) => Promise<boolean>;
  onDirty: (dirty: boolean) => void;
}) {
  const [checks, setChecks] = useState(() =>
    order.draft.rows.map((r) => ({
      id: r.id,
      value: r.verifiedActual ?? null,
      basis: r.verificationBasis ?? "",
    })),
  );
  const [extra, setExtra] = useState({
    work: "",
    unit: "м³",
    basis: "",
    target: order.draft.zone,
  });
  const [busy, setBusy] = useState(false);
  const baseline = JSON.stringify(
    order.draft.rows.map((r) => ({
      id: r.id,
      value: r.verifiedActual ?? null,
      basis: r.verificationBasis ?? "",
    })),
  );
  useEffect(
    () => onDirty(JSON.stringify(checks) !== baseline),
    [checks, baseline, onDirty],
  );
  return (
    <div className="order-review">
      <details>
        <summary>План, заявленный и проверенный объём</summary>
        <p>
          Проверка не изменяет сообщение подрядчика. Для каждого проверенного
          значения укажите основание. Пустое поле означает «не проверено».
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Работа</th>
                <th>Ед.</th>
                <th>План</th>
                <th>Заявлено</th>
                <th>Проверено</th>
                <th>Основание проверки</th>
              </tr>
            </thead>
            <tbody>
              {order.draft.rows.map((r, i) => (
                <tr key={r.id}>
                  <td>
                    {r.work}
                    {r.additional && <small> · доп. работа</small>}
                  </td>
                  <td>{r.unit}</td>
                  <td>{r.plan ?? "—"}</td>
                  <td>{r.actual ?? "—"}</td>
                  <td>
                    <input
                      aria-label={`Проверенный объём ${i + 1}`}
                      type="number"
                      min="0"
                      step="any"
                      disabled={!admin || accepted || busy}
                      value={checks[i].value ?? ""}
                      onChange={(e) =>
                        setChecks((c) =>
                          c.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  value:
                                    e.target.value === ""
                                      ? null
                                      : +e.target.value,
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Основание проверки ${i + 1}`}
                      disabled={!admin || accepted || busy}
                      value={checks[i].basis}
                      onChange={(e) =>
                        setChecks((c) =>
                          c.map((x, j) =>
                            j === i ? { ...x, basis: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    {r.verifiedAt && (
                      <small>
                        {r.verifiedBy} ·{" "}
                        {new Date(r.verifiedAt).toLocaleString("ru-RU")}
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {admin && !accepted && (
          <button
            onClick={() => setChecks(JSON.parse(baseline) as typeof checks)}
          >
            Отменить правки проверки
          </button>
        )}
        {admin && !accepted && (
          <button
            disabled={
              busy ||
              checks.some((r) => r.value !== null && r.basis.trim().length < 3)
            }
            onClick={() => {
              setBusy(true);
              void onReview(checks).finally(() => setBusy(false));
            }}
          >
            Сохранить проверку объёмов
          </button>
        )}
      </details>
      {canEdit && !order.submittedAt && !accepted && (
        <details>
          <summary>Добавить дополнительную работу</summary>
          <label>
            Наименование
            <input
              aria-label="Наименование дополнительной работы"
              value={extra.work}
              onChange={(e) => setExtra({ ...extra, work: e.target.value })}
            />
          </label>
          <label>
            Единица
            <input
              aria-label="Единица дополнительной работы"
              value={extra.unit}
              onChange={(e) => setExtra({ ...extra, unit: e.target.value })}
            />
          </label>
          <label>
            Участок / оси
            <input
              aria-label="Участок дополнительной работы"
              value={extra.target}
              onChange={(e) => setExtra({ ...extra, target: e.target.value })}
            />
          </label>
          <label>
            Основание / источник
            <textarea
              aria-label="Основание дополнительной работы"
              value={extra.basis}
              onChange={(e) => setExtra({ ...extra, basis: e.target.value })}
            />
          </label>
          <button
            disabled={
              busy ||
              !extra.work.trim() ||
              !extra.unit.trim() ||
              extra.basis.trim().length < 3
            }
            onClick={() => {
              setBusy(true);
              void onAdditional(extra).finally(() => setBusy(false));
            }}
          >
            Добавить дополнительную работу в наряд
          </button>
          <p>
            Факт заполните в новой строке. Она добавляется к исходному наряду
            без изменения выданных позиций.
          </p>
        </details>
      )}
    </div>
  );
}
