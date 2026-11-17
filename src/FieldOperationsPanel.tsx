import { useEffect, useState, type ReactNode } from "react";
import {
  Plus,
  X,
  Truck,
  FileText,
  UsersRound,
  ClipboardList,
  Send,
  Download,
} from "lucide-react";
import {
  blankField,
  fieldLabels,
  fieldStatusLabels,
  type FieldKind,
  type FieldPayload,
} from "./fieldOperations";
import { useConstruction } from "./useConstruction";
import {
  ofKind,
  inNode,
  nodePath,
  type ConstructionRecord,
} from "./construction";
import type { SharedOrder, WorkspaceUser } from "./workspaceTypes";
import { api } from "./workspaceClient";
import { today, initialWorkDraft, type WorkDraft } from "./workOrders";
import { manualWorkRow } from "./orderReview";
import { download } from "./export";
import { uploadConstructionFile } from "./constructionFiles";

const icons = {
  contractor: UsersRound,
  machine: Truck,
  waybill: FileText,
  request: Send,
  proposal: ClipboardList,
};
const statuses = {
  waybill: ["draft", "received", "checked"],
  request: ["draft", "approved", "ordered", "received", "cancelled"],
  proposal: ["proposed", "approved", "rejected"],
};
function historyText(value: string) {
  const raw = JSON.parse(value) as Record<string, unknown>;
  const p = (raw.payload ?? raw) as Record<string, unknown>;
  return [
    p.title,
    p.name && `Файл: ${p.name}`,
    p.status && `Состояние: ${fieldStatusLabels[String(p.status)] ?? p.status}`,
    p.plate && `Номер: ${p.plate}`,
    p.owner && `Собственник: ${p.owner}`,
    p.date,
    p.shift,
    p.hours !== undefined && `Общие часы: ${p.hours ?? "не указаны"}`,
    p.quantity !== undefined &&
      `Количество: ${p.quantity ?? "не указано"} ${p.unit ?? ""}`,
    p.source && `Источник: ${p.source}`,
    p.note,
  ]
    .filter((v) => v !== undefined && v !== false && v !== "")
    .join(" · ");
}
const field = (label: string, child: ReactNode) => (
  <label className="cm-field">
    <span>{label}</span>
    {child}
  </label>
);
type Entry = ConstructionRecord & { payload: FieldPayload };
export default function FieldOperationsPanel({
  view,
  onView,
  user,
  enabled,
  orders,
  onCompose,
}: {
  view: FieldKind;
  onView: (v: FieldKind) => void;
  user: WorkspaceUser | null;
  enabled: boolean;
  orders: SharedOrder[];
  onCompose: (d: WorkDraft) => void;
}) {
  const { records, error, loading, save, refresh } = useConstruction(enabled);
  const [form, setForm] = useState<FieldPayload | null>(null),
    [record, setRecord] = useState<Entry | null>(null),
    [file, setFile] = useState<File | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [node, setNode] = useState(""),
    [history, setHistory] = useState<
      { actor: string; created_at: string; after_payload: string }[] | null
    >(null);
  const admin = user?.role === "admin";
  const items = records
    .filter((r): r is Entry => r.payload.kind === view)
    .filter(
      (r) =>
        (!node ||
          !r.payload.nodeId ||
          inNode(records, r.payload.nodeId, node) ||
          (r.payload.kind === "waybill" &&
            r.payload.allocations.some(
              (a) => a.nodeId && inNode(records, a.nodeId, node),
            ))) &&
        `${r.payload.title} ${r.payload.brigade} ${r.payload.note}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  useEffect(() => {
    setForm(null);
    setRecord(null);
    setMessage("");
    setFile(null);
    setHistory(null);
    setQuery("");
  }, [view]);
  const patch = (p: object) =>
    setForm((value) => (value ? ({ ...value, ...p } as FieldPayload) : null));
  const input = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    required = false,
    type = "text",
  ) =>
    field(
      label,
      <input
        aria-label={label}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />,
    );
  const number = (
    label: string,
    value: number | null,
    onChange: (v: number | null) => void,
  ) =>
    field(
      label,
      <input
        aria-label={label}
        type="number"
        min="0"
        step="any"
        value={value ?? ""}
        placeholder="Неизвестно"
        onChange={(e) =>
          onChange(e.target.value === "" ? null : +e.target.value)
        }
      />,
    );
  const nodes = ofKind(records, "node");
  const nodeSelect = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void,
  ) =>
    field(
      label,
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Без участка</option>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {nodePath(records, n.id)}
          </option>
        ))}
      </select>,
    );
  const open = (r: Entry) => {
    setRecord(r);
    setForm(structuredClone(r.payload));
    setFile(null);
    setHistory(null);
    setMessage("");
  };
  const perform = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };
  const saveForm = async () => {
    if (!form) return;
    const saved = await save(form, record);
    setRecord(saved as Entry);
    if (file) {
      setRecord((await uploadConstructionFile(saved, file)) as Entry);
    }
    await refresh();
    setForm(null);
    setFile(null);
    setMessage("Запись и вложения сохранены");
  };
  const compose = (entry: Entry) => {
    if (entry.payload.kind !== "proposal") return;
    const p = entry.payload;
    const draft: WorkDraft = {
      ...initialWorkDraft(),
      proposalId: entry.id,
      date: p.date,
      shift: p.shift,
      brigade: p.brigade,
      site: p.nodeId ? nodePath(records, p.nodeId) : "",
      nodeId: p.nodeId,
      contractor:
        ofKind(records, "contractor").find((r) => r.id === p.contractorId)
          ?.payload.title ?? "",
      zone: p.nodeId ? nodePath(records, p.nodeId) : "",
    };
    const row = manualWorkRow(draft, p.title, p.unit, draft.zone, p.quantity);
    row.equipment = p.equipment;
    row.note = `Предложение: ${entry.id}. Источник: ${p.source}. ${p.note}`;
    draft.rows = [row];
    onCompose(draft);
  };
  return (
    <section
      className={`field-operations ${form ? "field-editing" : ""}`}
      aria-label={fieldLabels[view]}
    >
      <div className="field-main">
        <header className="operations-heading">
          <div>
            <p>Рабочие сведения координатора</p>
            <h1>{fieldLabels[view]}</h1>
          </div>
          <button
            className="primary"
            disabled={!admin || !enabled}
            onClick={() => {
              setRecord(null);
              setForm(
                blankField(
                  view,
                  today(),
                  user?.brigade ?? "Наша бригада",
                  node || null,
                ),
              );
              setFile(null);
              setHistory(null);
            }}
          >
            <Plus size={16} />
            Добавить
          </button>
        </header>
        <div className="field-tabs">
          {(Object.keys(fieldLabels) as FieldKind[]).map((k) => {
            const Icon = icons[k];
            return (
              <button
                key={k}
                className={k === view ? "active" : ""}
                onClick={() => onView(k)}
              >
                <Icon size={17} />
                {fieldLabels[k]}
              </button>
            );
          })}
        </div>
        {!enabled && (
          <p className="cm-warning">
            Для сохранения рабочих записей войдите на общий сервер.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <div className="field-filters">
          {input("Поиск рабочей записи", query, setQuery)}
          {nodeSelect("Объект / участок", node, (v) => setNode(v ?? ""))}
          <button
            disabled={!items.length}
            onClick={() => {
              const csv = [
                [
                  "Раздел",
                  "Название",
                  "Бригада",
                  "Объект",
                  "Данные",
                  "Автор",
                  "Обновлено",
                ],
                ...items.map((r) => [
                  fieldLabels[view],
                  r.payload.title,
                  r.payload.brigade,
                  nodePath(records, r.payload.nodeId),
                  JSON.stringify(r.payload),
                  r.author,
                  r.updatedAt,
                ]),
              ]
                .map((row) =>
                  row
                    .map(
                      (v) =>
                        '"' +
                        (/^[=+\-@\t\r]/.test(String(v))
                          ? "'" + String(v)
                          : String(v)
                        ).replace(/"/g, '""') +
                        '"',
                    )
                    .join(";"),
                )
                .join("\r\n");
              download("\ufeff" + csv, `${view}.csv`, "text/csv;charset=utf-8");
            }}
          >
            <Download size={16} />
            CSV
          </button>
        </div>
        {loading && <p>Загрузка…</p>}
        {!loading && !items.length && (
          <div className="operations-empty">
            <h2>Записей пока нет</h2>
            <p>
              Сохраните сведения из документа или сообщения. Неизвестные
              количества можно оставить пустыми.
            </p>
          </div>
        )}
        <div className="field-records">
          {items.map((r) => {
            const p = r.payload;
            return (
              <article key={r.id} className="field-card">
                <header>
                  <h2>{p.title}</h2>
                  {"status" in p && (
                    <span className="operation-status neutral">
                      {fieldStatusLabels[p.status]}
                    </span>
                  )}
                </header>
                <p>
                  {p.brigade} · {nodePath(records, p.nodeId)}
                </p>
                {p.kind === "contractor" && (
                  <p>
                    {p.contact} {p.phone} ·{" "}
                    {p.active ? "Работает" : "Неактивен"}
                  </p>
                )}
                {p.kind === "machine" && (
                  <p>
                    {p.plate} · {p.owner} ·{" "}
                    {p.active ? "В работе" : "Неактивна"}
                  </p>
                )}
                {p.kind === "waybill" && (
                  <>
                    <p>
                      {p.date} · {p.shift} ·{" "}
                      {
                        ofKind(records, "machine").find(
                          (m) => m.id === p.machineId,
                        )?.payload.plate
                      }
                    </p>
                    <p>
                      Всего: {p.hours ?? "не указано"} ч · участков:{" "}
                      {p.allocations.length}
                    </p>
                    <small>Источник: {p.source}</small>
                  </>
                )}
                {(p.kind === "request" || p.kind === "proposal") && (
                  <>
                    <p>
                      {p.date}
                      {p.kind === "proposal" ? ` · ${p.shift}` : ""} ·{" "}
                      {p.quantity ?? "не указано"} {p.unit}
                    </p>
                    <small>Источник: {p.source}</small>
                  </>
                )}
                {p.note && <p>{p.note}</p>}
                {r.file && (
                  <a href={`/api/construction-files/${r.file.id}`}>
                    Оригинал: {r.file.name}
                  </a>
                )}
                <footer>
                  <small>
                    {r.author} · {new Date(r.updatedAt).toLocaleString("ru-RU")}
                  </small>
                  <button onClick={() => open(r)}>Открыть карточку</button>
                  {p.kind === "proposal" &&
                    p.status === "approved" &&
                    admin && (
                      <button onClick={() => compose(r)}>
                        Составить наряд
                      </button>
                    )}
                </footer>
              </article>
            );
          })}
        </div>
      </div>
      {form && (
        <aside className="field-editor">
          <header>
            <h2>{record ? "Карточка записи" : "Новая запись"}</h2>
            <button
              aria-label="Закрыть рабочую карточку"
              onClick={() => setForm(null)}
            >
              <X />
            </button>
          </header>
          <p className="cm-intro">
            Изменения сохраняются кнопкой. Оригинал файла и история остаются в
            базе.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(saveForm);
            }}
          >
            <fieldset disabled={!admin || busy}>
              {input(
                form.kind === "waybill"
                  ? "Номер путевого листа"
                  : "Название рабочей записи",
                form.title,
                (v) => patch({ title: v }),
                true,
              )}
              {input(
                "Бригада рабочей записи",
                form.brigade,
                (v) =>
                  patch({
                    brigade: v,
                    ...(form.kind === "waybill" ? { orderId: null } : {}),
                  }),
                !["contractor", "machine"].includes(form.kind),
              )}
              {nodeSelect("Участок рабочей записи", form.nodeId, (v) =>
                patch({ nodeId: v }),
              )}
              {"date" in form &&
                input(
                  "Дата рабочей записи",
                  form.date,
                  (v) =>
                    patch({
                      date: v,
                      ...(form.kind === "waybill" ? { orderId: null } : {}),
                    }),
                  true,
                  "date",
                )}
              {"shift" in form &&
                field(
                  "Смена рабочей записи",
                  <select
                    aria-label="Смена рабочей записи"
                    value={form.shift}
                    onChange={(e) =>
                      patch({
                        shift: e.target.value,
                        ...(form.kind === "waybill" ? { orderId: null } : {}),
                      })
                    }
                  >
                    <option>День</option>
                    <option>Ночь</option>
                  </select>,
                )}
              {form.kind === "contractor" && (
                <>
                  {input("Контактное лицо", form.contact, (v) =>
                    patch({ contact: v }),
                  )}
                  {input("Телефон подрядчика", form.phone, (v) =>
                    patch({ phone: v }),
                  )}
                </>
              )}
              {form.kind === "machine" && (
                <>
                  {input(
                    "Государственный / инвентарный номер",
                    form.plate,
                    (v) => patch({ plate: v }),
                    true,
                  )}
                  {input(
                    "Собственник техники",
                    form.owner,
                    (v) => patch({ owner: v }),
                    true,
                  )}
                </>
              )}
              {"active" in form && (
                <label>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => patch({ active: e.target.checked })}
                  />
                  Активна / работает
                </label>
              )}
              {form.kind === "waybill" && (
                <>
                  {field(
                    "Техника путевого листа",
                    <select
                      aria-label="Техника путевого листа"
                      required
                      value={form.machineId}
                      onChange={(e) => patch({ machineId: e.target.value })}
                    >
                      <option value="">Выберите технику</option>
                      {ofKind(records, "machine")
                        .filter(
                          (m) =>
                            !m.payload.brigade ||
                            m.payload.brigade === form.brigade,
                        )
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.payload.title} · {m.payload.plate}
                          </option>
                        ))}
                    </select>,
                  )}
                  {field(
                    "Связанный наряд",
                    <select
                      aria-label="Связанный наряд"
                      value={form.orderId ?? ""}
                      onChange={(e) =>
                        patch({ orderId: e.target.value || null })
                      }
                    >
                      <option value="">Без наряда</option>
                      {orders
                        .filter(
                          (o) =>
                            o.order.draft.date === form.date &&
                            o.order.draft.shift === form.shift &&
                            o.order.draft.brigade === form.brigade,
                        )
                        .map((o) => (
                          <option key={o.order.id} value={o.order.id}>
                            {o.order.draft.site} · {o.order.id.slice(0, 8)}
                          </option>
                        ))}
                    </select>,
                  )}
                  {input(
                    "Начало работы техники",
                    form.startAt,
                    (v) => patch({ startAt: v }),
                    false,
                    "datetime-local",
                  )}
                  {input(
                    "Окончание работы техники",
                    form.endAt,
                    (v) => patch({ endAt: v }),
                    false,
                    "datetime-local",
                  )}
                  {number("Общие часы по путевому листу", form.hours, (v) =>
                    patch({ hours: v }),
                  )}
                  <h3>Распределение по участкам</h3>
                  {form.allocations.map((a, i) => (
                    <div className="allocation-row" key={i}>
                      {nodeSelect(`Участок техники ${i + 1}`, a.nodeId, (v) =>
                        patch({
                          allocations: form.allocations.map((x, j) =>
                            j === i ? { ...x, nodeId: v } : x,
                          ),
                        }),
                      )}
                      {input(
                        `Работа техники ${i + 1}`,
                        a.work,
                        (v) =>
                          patch({
                            allocations: form.allocations.map((x, j) =>
                              j === i ? { ...x, work: v } : x,
                            ),
                          }),
                        true,
                      )}
                      {number(`Часы на участке ${i + 1}`, a.hours, (v) =>
                        patch({
                          allocations: form.allocations.map((x, j) =>
                            j === i ? { ...x, hours: v } : x,
                          ),
                        }),
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          patch({
                            allocations: form.allocations.filter(
                              (_, j) => j !== i,
                            ),
                          })
                        }
                      >
                        Убрать участок
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        allocations: [
                          ...form.allocations,
                          { nodeId: form.nodeId, work: "", hours: null },
                        ],
                      })
                    }
                  >
                    Добавить участок техники
                  </button>
                  <small>
                    Сумма участков и общие часы независимы. Простои, переезды и
                    пересечения сверяются по оригиналу; форма не предполагает их
                    равенство.
                  </small>
                </>
              )}
              {form.kind === "proposal" && (
                <>
                  {field(
                    "Подрядчик предложения",
                    <select
                      aria-label="Подрядчик предложения"
                      value={form.contractorId ?? ""}
                      onChange={(e) =>
                        patch({ contractorId: e.target.value || null })
                      }
                    >
                      <option value="">Не указан</option>
                      {ofKind(records, "contractor").map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.payload.title}
                        </option>
                      ))}
                    </select>,
                  )}
                  {input("Планируемая техника", form.equipment, (v) =>
                    patch({ equipment: v }),
                  )}
                </>
              )}
              {form.kind === "request" &&
                field(
                  "Ресурс заявки",
                  <select
                    aria-label="Ресурс заявки"
                    value={form.resource}
                    onChange={(e) => patch({ resource: e.target.value })}
                  >
                    <option value="material">Материал</option>
                    <option value="machine">Техника</option>
                  </select>,
                )}
              {"quantity" in form && (
                <>
                  {number("Количество рабочей записи", form.quantity, (v) =>
                    patch({ quantity: v }),
                  )}
                  {input(
                    "Единица рабочей записи",
                    form.unit,
                    (v) => patch({ unit: v }),
                    true,
                  )}
                </>
              )}
              {"source" in form &&
                input(
                  "Источник сведений",
                  form.source,
                  (v) => patch({ source: v }),
                  true,
                )}
              {"status" in form &&
                field(
                  "Состояние рабочей записи",
                  <select
                    aria-label="Состояние рабочей записи"
                    value={form.status}
                    onChange={(e) => patch({ status: e.target.value })}
                  >
                    {statuses[form.kind].map((s) => (
                      <option
                        key={s}
                        value={s}
                        disabled={s === "checked" && !record?.file}
                      >
                        {fieldStatusLabels[s]}
                      </option>
                    ))}
                  </select>,
                )}
              {field(
                "Примечание / причина",
                <textarea
                  aria-label="Примечание рабочей записи"
                  value={form.note}
                  onChange={(e) => patch({ note: e.target.value })}
                />,
              )}
              {["waybill", "request", "proposal"].includes(form.kind) &&
                (!record?.file ? (
                  field(
                    "Оригинал документа",
                    <input
                      aria-label="Оригинал рабочей записи"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx,.mp4,.webm,.mov"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />,
                  )
                ) : (
                  <a href={`/api/construction-files/${record.file.id}`}>
                    Оригинал: {record.file.name}
                  </a>
                ))}
              {form.kind === "request" && (
                <small>
                  Получение по заявке не создаёт складскую операцию. Поступление
                  зарегистрируйте в разделе «Материалы» с его основанием.
                </small>
              )}
              <button className="primary" disabled={busy}>
                Сохранить рабочую запись
              </button>
            </fieldset>
          </form>
          {message && <p role="alert">{message}</p>}
          {record && (
            <>
              <button
                onClick={() =>
                  void perform(async () => {
                    const result = await api<{
                      events: {
                        actor: string;
                        created_at: string;
                        after_payload: string;
                      }[];
                    }>(`/api/construction/${record.id}/history`);
                    setHistory(result.events);
                  })
                }
              >
                История рабочей записи
              </button>
              <button
                onClick={() => {
                  const latest = records.find((r) => r.id === record.id) as
                    Entry | undefined;
                  if (latest) open(latest);
                }}
              >
                Загрузить актуальную запись
              </button>
              {history?.map((e, i) => (
                <p key={i}>
                  <strong>{e.actor}</strong> ·{" "}
                  {new Date(e.created_at).toLocaleString("ru-RU")}
                  <small>{historyText(e.after_payload)}</small>
                </p>
              ))}
            </>
          )}
        </aside>
      )}
    </section>
  );
}
