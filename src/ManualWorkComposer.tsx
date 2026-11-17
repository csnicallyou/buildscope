import { useState, type Dispatch, type SetStateAction } from "react";
import { manualWorkRow } from "./orderReview";
import type { WorkDraft } from "./workOrders";
export default function ManualWorkComposer({
  draft,
  onDraft,
}: {
  draft: WorkDraft;
  onDraft: Dispatch<SetStateAction<WorkDraft>>;
}) {
  const [work, setWork] = useState(""),
    [unit, setUnit] = useState("м³"),
    [plan, setPlan] = useState(""),
    [target, setTarget] = useState("");
  return (
    <details className="manual-work-composer">
      <summary>Добавить работу без 3D-привязки</summary>
      <p>
        Используйте для участков, модели которых пока нет. План и факт
        учитываются отдельно от геометрии.
      </p>
      <label>
        Работа
        <input
          aria-label="Ручная работа"
          value={work}
          onChange={(e) => setWork(e.target.value)}
        />
      </label>
      <label>
        Единица
        <input
          aria-label="Единица ручной работы"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
      </label>
      <label>
        План
        <input
          aria-label="План ручной работы"
          type="number"
          min="0"
          step="any"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
        />
      </label>
      <label>
        Участок / оси
        <input
          aria-label="Участок ручной работы"
          placeholder={draft.zone || draft.site}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </label>
      <button
        disabled={
          !work.trim() ||
          !unit.trim() ||
          (plan !== "" && (!Number.isFinite(+plan) || +plan < 0))
        }
        onClick={() => {
          onDraft((d) => ({
            ...d,
            rows: [
              ...d.rows,
              manualWorkRow(
                d,
                work.trim(),
                unit.trim(),
                target.trim(),
                plan === "" ? null : +plan,
              ),
            ],
          }));
          setWork("");
          setPlan("");
        }}
      >
        Добавить ручную работу
      </button>
    </details>
  );
}
