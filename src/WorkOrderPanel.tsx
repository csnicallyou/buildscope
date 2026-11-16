import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Download, Plus, Trash2, LocateFixed } from "lucide-react";
import type { Project } from "./model";
import {
  workTypes,
  workTargets,
  workReference,
  addWork,
  crewHours,
  reportErrors,
  type WorkDraft,
  type WorkId,
  type WorkRow,
  type CrewRow,
} from "./workOrders";
import { download } from "./export";
const f = (v: number | null) =>
  v === null
    ? "Не определён"
    : v.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
export default function WorkOrderPanel({
  project,
  opened,
  selected,
  selectedRoots,
  draft,
  onDraft,
  onFocus,
}: {
  project: Project;
  opened: string | null;
  selected: string | null;
  selectedRoots: string[];
  draft: WorkDraft;
  onDraft: Dispatch<SetStateAction<WorkDraft>>;
  onFocus: (id: string) => void;
}) {
  const targets = useMemo(
    () => workTargets(project, opened),
    [project, opened],
  );
  const [targetId, setTarget] = useState(""),
    [workId, setWork] = useState<WorkId>("concrete"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const preferred = selected
      ? `${opened ? "part" : "object"}:${selected}`
      : "";
    setTarget(
      targets.some((t) => t.id === preferred)
        ? preferred
        : (targets[0]?.id ?? ""),
    );
  }, [targets, selected, opened]);
  const target = targets.find((t) => t.id === targetId),
    ref = target ? workReference(target, workId) : null,
    errors = reportErrors(draft);
  const updateRow = (id: string, patch: Partial<WorkRow>) =>
    onDraft((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const updateCrew = (id: string, patch: Partial<CrewRow>) =>
    onDraft((d) => ({
      ...d,
      crew: d.crew.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const add = (batch = false) => {
    const ids = batch
      ? opened && selected
        ? [`part:${selected}`]
        : selectedRoots.map((id) => `object:${id}`)
      : [targetId];
    let added = 0;
    const next = { ...draft, rows: [...draft.rows] };
    for (const id of ids) {
      const t = targets.find((t) => t.id === id);
      if (!t) continue;
      const row = addWork(next, t, workId, project);
      if (row) {
        next.rows.push(row);
        added++;
      }
    }
    onDraft(next);
    setMessage(
      added
        ? `Добавлено работ: ${added}. Повторяющиеся элементы для той же работы и смены пропущены.`
        : "Не добавлено: работа не подходит к выбранной части либо эта работа уже есть в смене.",
    );
  };
  const exportReport = async () => {
    setBusy(true);
    setMessage("");
    try {
      const { createWorkOrder } = await import("./workOrderExcel");
      const bytes = await createWorkOrder(draft);
      download(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
        `Наряд-${draft.date}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      setMessage("Наряд сформирован локально. План и факт разделены.");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Не удалось сформировать наряд",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="work-order-panel schedule"
      aria-label="Наряд из 3D модели"
    >
      <div className="work-order-title">
        <div>
          <h1>Наряд</h1>
          <p>
            Работы по объектам и частям 3D-модели. Факт вводится вручную.
            Черновик хранится до закрытия этой страницы.
          </p>
        </div>
        <button
          className="primary"
          onClick={exportReport}
          disabled={busy || errors.length > 0}
        >
          {busy ? (
            "Формирование…"
          ) : (
            <>
              <Download size={16} />
              Скачать Excel
            </>
          )}
        </button>
      </div>
      <fieldset className="work-order-metadata">
        <legend>Параметры новых строк</legend>
        <label>
          Дата
          <input
            aria-label="Дата наряда"
            type="date"
            value={draft.date}
            onChange={(e) => onDraft((d) => ({ ...d, date: e.target.value }))}
          />
        </label>
        <label>
          Объект / станция
          <input
            aria-label="Объект наряда"
            value={draft.site}
            onChange={(e) => onDraft((d) => ({ ...d, site: e.target.value }))}
          />
        </label>
        <label>
          Смена
          <select
            aria-label="Смена наряда"
            value={draft.shift}
            onChange={(e) => onDraft((d) => ({ ...d, shift: e.target.value }))}
          >
            <option>День</option>
            <option>Ночь</option>
          </select>
        </label>
        <label>
          Подрядчик
          <input
            aria-label="Подрядчик наряда"
            placeholder="Введите название"
            value={draft.contractor}
            onChange={(e) =>
              onDraft((d) => ({ ...d, contractor: e.target.value }))
            }
          />
        </label>
        <label>
          Платформа / участок
          <input
            aria-label="Участок наряда"
            placeholder={project.document?.assembly ?? project.name}
            value={draft.zone}
            onChange={(e) => onDraft((d) => ({ ...d, zone: e.target.value }))}
          />
        </label>
      </fieldset>
      <div className="work-order-add">
        <label>
          Объект или часть
          <select
            aria-label="Конструкция для наряда"
            value={targetId}
            onChange={(e) => setTarget(e.target.value)}
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Тип работы
          <select
            aria-label="Тип работы наряда"
            value={workId}
            onChange={(e) => setWork(e.target.value as WorkId)}
          >
            {workTypes.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <p>
          {ref?.elements.length ? (
            <>
              План из модели:{" "}
              <strong>
                {f(ref.value)} {ref.unit}
              </strong>
              <br />
              {ref.basis}
            </>
          ) : (
            "Эта работа не соответствует выбранной части. Выберите другой тип или «Другая работа»."
          )}
        </p>
        <button onClick={() => add()} disabled={!ref?.elements.length}>
          <Plus size={16} />
          Добавить работу
        </button>
        <button
          onClick={() => add(true)}
          disabled={opened ? !selected : !selectedRoots.length}
        >
          {opened
            ? "Добавить выбранную часть"
            : `Добавить выбранные в 3D (${selectedRoots.length})`}
        </button>
      </div>
      {message && (
        <p className="work-order-message" role="status">
          {message}
        </p>
      )}
      <div className="work-order-list">
        <h2>Работы ({draft.rows.length})</h2>
        {!draft.rows.length && (
          <p className="muted">
            Выберите конструкцию в 3D или в списке выше, затем добавьте тип
            работы.
          </p>
        )}
        {draft.rows.map((r, index) => (
          <article
            key={r.id}
            className="work-order-row"
            data-testid="work-order-row"
          >
            <div className="work-row-heading">
              <strong>
                {index + 1}. {r.work}
              </strong>
              <button
                aria-label={`Удалить работу ${index + 1}`}
                onClick={() =>
                  onDraft((d) => ({
                    ...d,
                    rows: d.rows.filter((v) => v.id !== r.id),
                  }))
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="work-row-target">
              <span>{r.target}</span>
              <button
                disabled={
                  !r.elementIds.some((id) =>
                    project.elements.some((e) => e.id === id),
                  )
                }
                onClick={() => onFocus(r.elementIds[0])}
              >
                <LocateFixed size={14} />
                Показать в 3D
              </button>
            </div>
            <div className="work-row-values">
              <label>
                План, {r.unit}
                <input
                  aria-label={`План работы ${index + 1}`}
                  type="number"
                  min={0}
                  step="any"
                  value={r.plan ?? ""}
                  onChange={(e) =>
                    updateRow(r.id, {
                      plan: e.target.value === "" ? null : +e.target.value,
                    })
                  }
                />
              </label>
              <label>
                Факт, {r.unit}
                <input
                  aria-label={`Факт работы ${index + 1}`}
                  type="number"
                  min={0}
                  step="any"
                  value={r.actual ?? ""}
                  placeholder="Не введён"
                  onChange={(e) =>
                    updateRow(r.id, {
                      actual: e.target.value === "" ? null : +e.target.value,
                    })
                  }
                />
              </label>
              <span>
                {r.date} · {r.shift} · {r.axes || "Оси не заданы"}
              </span>
            </div>
            <small>
              {r.plan === r.modelPlan
                ? r.basis
                : `Ручной план. Справочно: ${f(r.modelPlan)} ${r.unit}. ${r.basis}`}
            </small>
            <details>
              <summary>Параметры строки, техника и примечание</summary>
              <div className="work-row-detail">
                {(
                  [
                    ["date", "Дата"],
                    ["site", "Объект"],
                    ["shift", "Смена"],
                    ["contractor", "Подрядчик"],
                    ["zone", "Участок"],
                    ["axes", "Оси"],
                    ["work", "Наименование работы"],
                    ["equipment", "Вид техники"],
                    ["brand", "Марка техники"],
                    ["plate", "Гос. номер"],
                    ["note", "Примечание"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type={key === "date" ? "date" : "text"}
                      value={r[key]}
                      onChange={(e) =>
                        updateRow(r.id, { [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
                {r.workId === "other" && (
                  <label>
                    Единица измерения
                    <input
                      value={r.unit}
                      onChange={(e) =>
                        updateRow(r.id, { unit: e.target.value })
                      }
                    />
                  </label>
                )}
              </div>
            </details>
          </article>
        ))}
      </div>
      <details className="work-crew">
        <summary>Табель ({draft.crew.length})</summary>
        <p>
          ФИО и фактическое время вводятся вручную. Ночная смена может
          переходить через полночь.
        </p>
        <button
          onClick={() =>
            onDraft((d) => ({
              ...d,
              crew: [
                ...d.crew,
                {
                  id: crypto.randomUUID(),
                  date: d.date,
                  site: d.site,
                  contractor: d.contractor,
                  shift: d.shift,
                  name: "",
                  start: "",
                  end: "",
                  breakMinutes: 0,
                  note: "",
                },
              ],
            }))
          }
        >
          <Plus size={16} />
          Добавить сотрудника
        </button>
        {draft.crew.map((r, i) => (
          <div className="work-crew-row" key={r.id}>
            <label>
              ФИО
              <input
                aria-label={`ФИО ${i + 1}`}
                value={r.name}
                onChange={(e) => updateCrew(r.id, { name: e.target.value })}
              />
            </label>
            <label>
              Начало
              <input
                aria-label={`Начало смены ${i + 1}`}
                type="time"
                value={r.start}
                onChange={(e) => updateCrew(r.id, { start: e.target.value })}
              />
            </label>
            <label>
              Окончание
              <input
                aria-label={`Конец смены ${i + 1}`}
                type="time"
                value={r.end}
                onChange={(e) => updateCrew(r.id, { end: e.target.value })}
              />
            </label>
            <label>
              Перерыв, мин
              <input
                aria-label={`Перерыв ${i + 1}`}
                type="number"
                min={0}
                value={r.breakMinutes}
                onChange={(e) =>
                  updateCrew(r.id, { breakMinutes: +e.target.value })
                }
              />
            </label>
            <span>{f(crewHours(r))} ч</span>
            <button
              aria-label={`Удалить сотрудника ${i + 1}`}
              onClick={() =>
                onDraft((d) => ({
                  ...d,
                  crew: d.crew.filter((v) => v.id !== r.id),
                }))
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </details>
      {errors.length > 0 && draft.rows.length > 0 && (
        <p className="work-order-errors">{errors.join(" · ")}</p>
      )}
      <p className="work-order-footnote">
        Excel: «ОБЪЕМ», «ТАБЕЛЬ», «ИТОГИ». В итогах работы разделены по
        наименованию и единице. Неизвестное количество не заменяется нулём.
        Данные не отправляются на сервер.
      </p>
    </section>
  );
}
