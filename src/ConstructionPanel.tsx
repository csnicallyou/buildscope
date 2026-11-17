import ConstructionTree from "./ConstructionTree";
import PdfCanvas from "./PdfCanvas";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "./workspaceClient";
import {
  recordSchema,
  ofKind,
  levelLabels,
  taskLabels,
  nodePath,
  inNode,
  inventory,
  blockers,
  constructionSummary,
  blankPayload,
  type ConstructionRecord,
  type Kind,
  type Payload,
  type OfKind,
} from "./construction";
import { today } from "./workOrders";
import type { WorkspaceUser, SharedOrder } from "./workspaceTypes";
import { useConstruction } from "./useConstruction";
export type ManagementView =
  | "overview"
  | "objects"
  | "planning"
  | "crews"
  | "materials"
  | "quality"
  | "documents";
export const managementLabels: Record<ManagementView, string> = {
  overview: "Обзор стройки",
  objects: "Объекты и участки",
  planning: "Планирование",
  crews: "Бригады",
  materials: "Материалы",
  quality: "Замечания",
  documents: "Документы",
};
const viewKind: Partial<Record<ManagementView, Kind>> = {
  objects: "node",
  planning: "task",
  crews: "crew",
  materials: "movement",
  quality: "issue",
  documents: "document",
};
const kindLabels: Record<Kind, string> = {
  contractor: "подрядчика",
  machine: "технику",
  waybill: "путевой лист",
  request: "заявку",
  proposal: "предложение",
  node: "объект",
  task: "задачу",
  crew: "бригаду",
  movement: "движение материала",
  issue: "замечание",
  document: "документ",
};
const f = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
type ModelContext = { model: string; elementIds: string[]; label: string };
type Props = {
  scopeNode?: string;
  contextDate?: string;
  contextShift?: "День" | "Ночь";
  onContextDate?: (value: string) => void;
  onContextShift?: (value: "День" | "Ночь") => void;
  view: ManagementView;
  onView: (view: ManagementView) => void;
  user: WorkspaceUser | null;
  enabled: boolean;
  orders: SharedOrder[];
  onOrders: () => void;
  onModelMaterials: () => void;
  onCompose: (task: OfKind<"task"> | null) => void;
  onModel: (model: string, ids: string[]) => void;
  onEvidence: (
    model: string,
    id: string,
    label: string,
    brigade: string,
  ) => void;
  modelContext: ModelContext;
  initialKind: Kind | null;
  onInitialHandled: () => void;
  initialRecordId: string | null;
};
function describeEvent(value: string | null) {
  if (!value) return "Записи ещё не было";
  const raw = JSON.parse(value) as Record<string, unknown>;
  const p = (raw.payload ?? raw) as Record<string, unknown>;
  const labels: Record<string, string> = {
    ...taskLabels,
    open: "Открыто",
    corrected: "Устранено, ожидает проверки",
    closed: "Закрыто",
  };
  return [
    p.title,
    p.status && `Состояние: ${labels[String(p.status)] ?? String(p.status)}`,
    p.quantity && `Количество: ${String(p.quantity)} ${String(p.unit ?? "")}`,
    p.brigade && `Бригада: ${String(p.brigade)}`,
    p.start && `Начало: ${String(p.start)}`,
    p.end && `Окончание: ${String(p.end)}`,
    p.name && `Файл: ${String(p.name)}`,
    p.description,
    p.reason,
    p.evidence,
  ]
    .filter(Boolean)
    .join(" · ");
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="cm-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Editor({
  record,
  kind,
  records,
  user,
  node,
  modelContext,
  onSave,
  onClose,
  onEvidence,
  seed,
}: {
  record: ConstructionRecord | null;
  kind: Kind;
  records: ConstructionRecord[];
  user: WorkspaceUser;
  node: string;
  modelContext: ModelContext;
  onSave: (
    p: Payload,
    r: ConstructionRecord | null,
  ) => Promise<ConstructionRecord>;
  onClose: () => void;
  onEvidence: Props["onEvidence"];
  seed?: Payload;
}) {
  const [value, setValue] = useState<Payload>(
      () =>
        seed ??
        record?.payload ??
        blankPayload(
          kind,
          today(),
          node || null,
          user.brigade ?? "Наша бригада",
        ),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [saved, setSaved] = useState(record),
    [message, setMessage] = useState(""),
    [membersText, setMembersText] = useState(
      record?.payload.kind === "crew"
        ? record.payload.members.map((m) => `${m.name}; ${m.role}`).join("\n")
        : "",
    ),
    [history, setHistory] = useState<
      | {
          id: number;
          actor: string;
          created_at: string;
          before_payload: string | null;
          after_payload: string;
        }[]
      | null
    >(null);
  const form = useRef<HTMLFormElement>(null),
    admin = user.role === "admin",
    readonly =
      user.role === "viewer" ||
      (user.role !== "admin" &&
        record?.payload.kind === "issue" &&
        record.payload.status === "closed") ||
      (user.role === "foreman" && !["task", "issue"].includes(kind));
  const patch = (part: Partial<Payload>) =>
    setValue((v) => ({ ...v, ...part }) as Payload);
  const text = (key: "title", label: string, required = false) => (
    <Field label={label}>
      <input
        aria-label={label}
        value={value[key]}
        required={required}
        maxLength={180}
        onChange={(e) => patch({ [key]: e.target.value })}
      />
    </Field>
  );
  useEffect(() => {
    form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  const dirty =
    JSON.stringify(value) !==
      JSON.stringify(
        saved?.payload ??
          blankPayload(
            kind,
            today(),
            node || null,
            user.brigade ?? "Наша бригада",
          ),
      ) || !!file;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const upload = async (r: ConstructionRecord) => {
    if (!file) return r;
    if (file.size > 25 * 1024 * 1024)
      throw Error("Файл должен быть не больше 25 МБ");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return recordSchema.parse(
      (
        await api<{ record: unknown }>(
          `/api/construction/${r.id}/file`,
          "POST",
          { revision: r.revision, name: file.name, base64: btoa(binary) },
        )
      ).record,
    );
  };
  return (
    <aside className="cm-editor" aria-label="Редактор записи стройки">
      <header>
        <div>
          <small>{saved ? `Версия ${saved.revision}` : "Новая запись"}</small>
          <h2>{saved ? value.title : `Добавить ${kindLabels[kind]}`}</h2>
        </div>
        <button type="button" aria-label="Закрыть редактор" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {error && (
        <p role="alert" className="cm-error">
          {error}{" "}
          <button
            onClick={() =>
              void (async () => {
                const data = await api<{ records: unknown[] }>(
                  "/api/construction",
                );
                const latest = data.records
                  .map((r) => recordSchema.parse(r))
                  .find((r) => r.id === saved?.id);
                if (latest) {
                  setSaved(latest);
                  setValue(latest.payload);
                  setError("");
                }
              })().catch((e) => setError(String(e)))
            }
          >
            Загрузить актуальную запись вместо моих полей
          </button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          void (async () => {
            try {
              let r = saved;
              if (
                !r ||
                value.kind === "crew" ||
                JSON.stringify(value) !== JSON.stringify(r.payload)
              )
                r = await onSave(
                  value.kind === "crew"
                    ? {
                        ...value,
                        members: membersText
                          .split("\n")
                          .filter((line) => line.trim())
                          .map((line) => {
                            const [name, ...role] = line.split(";");
                            return {
                              name: name.trim(),
                              role: role.join(";").trim(),
                            };
                          }),
                      }
                    : value,
                  r,
                );
              setSaved(r);
              r = await upload(r);
              setSaved(r);
              setFile(null);
              setMessage("Запись сохранена");
              onClose();
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Не удалось сохранить запись",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <fieldset disabled={readonly || busy}>
          <fieldset disabled={!admin}>
            {text(
              "title",
              kind === "movement" ? "Материал и марка" : "Название записи",
              true,
            )}
            {value.kind === "node" ? (
              <>
                <Field label="Уровень объекта">
                  <select
                    aria-label="Уровень объекта"
                    value={value.level}
                    onChange={(e) =>
                      patch({
                        level: e.target.value as Extract<
                          Payload,
                          { kind: "node" }
                        >["level"],
                      })
                    }
                  >
                    {Object.entries(levelLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Родительский объект">
                  <select
                    aria-label="Родительский объект"
                    value={value.parentId ?? ""}
                    onChange={(e) =>
                      patch({ parentId: e.target.value || null })
                    }
                  >
                    <option value="">Без родителя — стройка</option>
                    {ofKind(records, "node")
                      .filter((r) => r.id !== saved?.id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {nodePath(records, r.id)}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Координаты на карте (широта, долгота)">
                  <input
                    aria-label="Координаты на карте"
                    placeholder="Например: 55.75, 37.62"
                    defaultValue={
                      value.location
                        ? `${value.location.lat}, ${value.location.lng}`
                        : ""
                    }
                    onChange={(e) => {
                      const parts = e.target.value
                        .split(",")
                        .map((v) => Number(v.trim()));
                      const valid =
                        parts.length === 2 &&
                        e.target.value.trim() !== "" &&
                        parts.every(Number.isFinite) &&
                        Math.abs(parts[0]) <= 90 &&
                        Math.abs(parts[1]) <= 180;
                      e.target.setCustomValidity(
                        !e.target.value.trim() || valid
                          ? ""
                          : "Укажите широту от −90 до 90 и долготу от −180 до 180 через запятую",
                      );
                      if (valid)
                        patch({ location: { lat: parts[0], lng: parts[1] } });
                      else if (!e.target.value.trim())
                        patch({ location: null });
                    }}
                  />
                  <small>
                    Необязательно. Указывайте только известное положение
                    объекта.
                  </small>
                </Field>
              </>
            ) : (
              "nodeId" in value && (
                <Field label="Участок стройки">
                  <select
                    aria-label="Участок стройки"
                    value={value.nodeId ?? ""}
                    onChange={(e) => patch({ nodeId: e.target.value || null })}
                  >
                    <option value="">Без участка</option>
                    {ofKind(records, "node").map((r) => (
                      <option key={r.id} value={r.id}>
                        {nodePath(records, r.id)}
                      </option>
                    ))}
                  </select>
                </Field>
              )
            )}
            {"brigade" in value && (
              <Field label="Бригада записи">
                <input
                  aria-label="Бригада записи"
                  list="cm-crew-names"
                  value={value.brigade}
                  required={value.kind !== "document"}
                  onChange={(e) => patch({ brigade: e.target.value })}
                />
                <datalist id="cm-crew-names">
                  {ofKind(records, "crew").map((c) => (
                    <option key={c.id} value={c.payload.title} />
                  ))}
                </datalist>
              </Field>
            )}
            {"model" in value && (
              <div className="cm-binding">
                <span>Привязка к модели</span>
                <p>
                  {value.model
                    ? `${value.model} · элементов: ${value.elementIds.length}`
                    : "Не задана"}
                </p>
                <button
                  type="button"
                  disabled={!modelContext.elementIds.length}
                  onClick={() =>
                    patch({
                      model: modelContext.model,
                      elementIds: modelContext.elementIds,
                    })
                  }
                >
                  Привязать выбранное в 3D
                </button>
                {value.model && (
                  <button
                    type="button"
                    onClick={() => patch({ model: "", elementIds: [] })}
                  >
                    Убрать привязку
                  </button>
                )}
              </div>
            )}
          </fieldset>
          {value.kind === "node" && (
            <Field label="Описание объекта">
              <textarea
                value={value.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </Field>
          )}
          {value.kind === "crew" && (
            <>
              <Field label="Бригадир">
                <input
                  value={value.leader}
                  onChange={(e) => patch({ leader: e.target.value })}
                />
              </Field>
              <Field label="Состав бригады">
                <textarea
                  aria-label="Состав бригады"
                  placeholder="Каждая строка: имя; специальность"
                  value={membersText}
                  onChange={(e) => setMembersText(e.target.value)}
                />
              </Field>
              <Field label="Примечание">
                <textarea
                  value={value.description}
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </Field>
              <label>
                <input
                  type="checkbox"
                  checked={value.active}
                  onChange={(e) => patch({ active: e.target.checked })}
                />
                Бригада активна
              </label>
            </>
          )}
          {value.kind === "task" && (
            <>
              <fieldset disabled={!admin}>
                <div className="cm-form-row">
                  <Field label="Начало работы">
                    <input
                      aria-label="Начало работы"
                      type="date"
                      required
                      value={value.start}
                      onChange={(e) => patch({ start: e.target.value })}
                    />
                  </Field>
                  <Field label="Окончание работы">
                    <input
                      aria-label="Окончание работы"
                      type="date"
                      required
                      value={value.end}
                      onChange={(e) => patch({ end: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Смена задачи">
                  <select
                    aria-label="Смена задачи"
                    value={value.shift}
                    onChange={(e) =>
                      patch({ shift: e.target.value as "День" | "Ночь" })
                    }
                  >
                    <option>День</option>
                    <option>Ночь</option>
                  </select>
                </Field>
                <Field label="Ответственный за задачу">
                  <input
                    value={value.owner}
                    onChange={(e) => patch({ owner: e.target.value })}
                  />
                </Field>
                <Field label="Предшествующие работы">
                  <select
                    aria-label="Предшествующие работы"
                    multiple
                    value={value.dependsOn}
                    onChange={(e) =>
                      patch({
                        dependsOn: Array.from(e.target.selectedOptions).map(
                          (o) => o.value,
                        ),
                      })
                    }
                  >
                    {ofKind(records, "task")
                      .filter((r) => r.id !== saved?.id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.payload.title}
                        </option>
                      ))}
                  </select>
                  <small>Можно выбрать несколько работ.</small>
                </Field>
              </fieldset>
              <Field label="Состояние задачи">
                <select
                  aria-label="Состояние задачи"
                  value={value.status}
                  onChange={(e) =>
                    patch({
                      status: e.target.value as Extract<
                        Payload,
                        { kind: "task" }
                      >["status"],
                    })
                  }
                >
                  {Object.entries(taskLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Причина блокировки / комментарий">
                <textarea
                  value={value.reason}
                  required={value.status === "blocked"}
                  onChange={(e) => patch({ reason: e.target.value })}
                />
              </Field>
            </>
          )}
          {value.kind === "movement" && (
            <>
              <div className="cm-form-row">
                <Field label="Операция материала">
                  <select
                    aria-label="Операция материала"
                    value={value.direction}
                    onChange={(e) =>
                      patch({
                        direction: e.target.value as Extract<
                          Payload,
                          { kind: "movement" }
                        >["direction"],
                      })
                    }
                  >
                    <option value="receipt">Поступление</option>
                    <option value="opening">Начальный остаток</option>
                    <option value="consume">Расход</option>
                  </select>
                </Field>
                <Field label="Дата движения">
                  <input
                    type="date"
                    value={value.date}
                    required
                    onChange={(e) => patch({ date: e.target.value })}
                  />
                </Field>
              </div>
              <div className="cm-form-row">
                <Field label="Количество материала">
                  <input
                    aria-label="Количество материала"
                    type="number"
                    min="0.000001"
                    step="any"
                    required
                    value={value.quantity || ""}
                    onChange={(e) => patch({ quantity: +e.target.value })}
                  />
                </Field>
                <Field label="Единица материала">
                  <select
                    aria-label="Единица материала"
                    value={value.unit}
                    onChange={(e) =>
                      patch({
                        unit: e.target.value as Extract<
                          Payload,
                          { kind: "movement" }
                        >["unit"],
                      })
                    }
                  >
                    {["м³", "м²", "м", "т", "кг", "шт.", "л"].map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Основание движения">
                <input
                  aria-label="Основание движения"
                  placeholder="Накладная, замер или запись о расходе"
                  required
                  value={value.basis}
                  onChange={(e) => patch({ basis: e.target.value })}
                />
              </Field>
              {saved && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={value.voided}
                      onChange={(e) => patch({ voided: e.target.checked })}
                    />
                    Отменить операцию с сохранением истории
                  </label>
                  <Field label="Причина исправления материала">
                    <textarea
                      value={value.reason}
                      required={value.voided}
                      onChange={(e) => patch({ reason: e.target.value })}
                    />
                  </Field>
                </>
              )}
            </>
          )}
          {value.kind === "issue" && (
            <>
              <fieldset disabled={!admin}>
                <Field label="Ответственный за замечание">
                  <input
                    aria-label="Ответственный за замечание"
                    required
                    value={value.owner}
                    onChange={(e) => patch({ owner: e.target.value })}
                  />
                </Field>
                <Field label="Срок устранения">
                  <input
                    aria-label="Срок устранения"
                    type="date"
                    required
                    value={value.due}
                    onChange={(e) => patch({ due: e.target.value })}
                  />
                </Field>
                <Field label="Важность">
                  <select
                    value={value.severity}
                    onChange={(e) =>
                      patch({
                        severity: e.target.value as "normal" | "critical",
                      })
                    }
                  >
                    <option value="normal">Обычное</option>
                    <option value="critical">
                      Препятствует продолжению работ
                    </option>
                  </select>
                </Field>
                <Field label="Описание замечания">
                  <textarea
                    value={value.description}
                    onChange={(e) => patch({ description: e.target.value })}
                  />
                </Field>
              </fieldset>
              <Field label="Состояние замечания">
                <select
                  aria-label="Состояние замечания"
                  value={value.status}
                  onChange={(e) =>
                    patch({
                      status: e.target.value as "open" | "corrected" | "closed",
                    })
                  }
                >
                  <option value="open">Открыто</option>
                  <option value="corrected">Устранено, ожидает проверки</option>
                  {admin && (
                    <option value="closed">Закрыто руководителем</option>
                  )}
                </select>
              </Field>
              <Field label="Подтверждение устранения">
                <textarea
                  aria-label="Подтверждение устранения"
                  required={value.status !== "open"}
                  value={value.evidence}
                  onChange={(e) => patch({ evidence: e.target.value })}
                />
              </Field>
            </>
          )}
          {value.kind === "document" && (
            <>
              <div className="cm-form-row">
                <Field label="Номер документа">
                  <input
                    aria-label="Номер документа"
                    required
                    value={value.number}
                    onChange={(e) => patch({ number: e.target.value })}
                  />
                </Field>
                <Field label="Редакция документа">
                  <input
                    aria-label="Редакция документа"
                    required
                    value={value.edition}
                    onChange={(e) => patch({ edition: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Вид документа">
                <select
                  value={value.category}
                  onChange={(e) =>
                    patch({
                      category: e.target.value as Extract<
                        Payload,
                        { kind: "document" }
                      >["category"],
                    })
                  }
                >
                  <option value="drawing">Чертёж</option>
                  <option value="executive">Исполнительный документ</option>
                  <option value="certificate">Паспорт / сертификат</option>
                  <option value="photo">Фотофиксация</option>
                  <option value="video">Видео с объекта</option>
                  <option value="other">Прочее</option>
                </select>
              </Field>
              <Field label="Дата документа">
                <input
                  type="date"
                  required
                  value={value.date}
                  onChange={(e) => patch({ date: e.target.value })}
                />
              </Field>
              <Field label="Заменяет редакцию">
                <select
                  aria-label="Заменяет редакцию"
                  value={value.supersedes ?? ""}
                  onChange={(e) =>
                    patch({ supersedes: e.target.value || null })
                  }
                >
                  <option value="">Первая / самостоятельная редакция</option>
                  {ofKind(records, "document")
                    .filter((d) => d.id !== saved?.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.payload.number} · {d.payload.edition} ·{" "}
                        {d.payload.title}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Примечание документа">
                <textarea
                  value={value.description}
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </Field>
              {saved?.file ? (
                <p>
                  Файл:{" "}
                  <a href={`/api/construction-files/${saved.file.id}`}>
                    {saved.file.name}
                  </a>
                  . Другой файл добавляется новой редакцией.
                </p>
              ) : (
                <Field label="Файл документа">
                  <input
                    aria-label="Файл документа"
                    type="file"
                    accept=".pdf,.xlsx,.docx,.dxf,.jpg,.jpeg,.png,.mp4,.webm,.mov"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <small>
                    До 25 МБ. Файл будет доступен вошедшим пользователям с
                    подходящими правами.
                  </small>
                </Field>
              )}
            </>
          )}
        </fieldset>
        <div className="cm-editor-actions">
          {!readonly && (
            <button className="primary" disabled={busy} type="submit">
              <Check size={16} />
              {busy ? "Сохранение…" : "Сохранить запись"}
            </button>
          )}
          <button type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </form>
      {"model" in value && value.model && value.elementIds.length > 0 && (
        <button
          onClick={() =>
            onEvidence(
              value.model,
              value.elementIds[0],
              value.title,
              "brigade" in value
                ? value.brigade
                : (user.brigade ?? "Наша бригада"),
            )
          }
        >
          Фото и замечания привязанной конструкции
        </button>
      )}
      {saved && (
        <details className="cm-history">
          <summary
            onClick={() =>
              void api<{ events: NonNullable<typeof history> }>(
                `/api/construction/${saved.id}/history`,
              )
                .then((r) => setHistory(r.events))
                .catch((e) => setError(String(e)))
            }
          >
            История записи
          </summary>
          {history?.map((e) => (
            <details key={e.id}>
              <summary>
                {new Date(e.created_at).toLocaleString("ru-RU")} · {e.actor}
              </summary>
              <p>Было: {describeEvent(e.before_payload)}</p>
              <p>Стало: {describeEvent(e.after_payload)}</p>
            </details>
          ))}
        </details>
      )}
    </aside>
  );
}
export default function ConstructionPanel(props: Props) {
  const {
    view,
    onView,
    user,
    enabled,
    orders,
    onOrders,
    onCompose,
    onModel,
    onEvidence,
    modelContext,
  } = props;
  const [previewDocument, setPreviewDocument] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [issueFilter, setIssueFilter] = useState("open");
  const [documentCategory, setDocumentCategory] = useState("");
  const data = useConstruction(enabled),
    { records } = data;
  const [node, setNode] = useState(props.scopeNode ?? ""),
    [query, setQuery] = useState(""),
    [brigade, setBrigade] = useState(""),
    [date, setDate] = useState(today()),
    [shift, setShift] = useState(""),
    [taskFilter, setTaskFilter] = useState("all"),
    [editor, setEditor] = useState<{
      record: ConstructionRecord | null;
      kind: Kind;
      seed?: Payload;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setNode(props.scopeNode ?? "");
  }, [props.scopeNode]);
  useEffect(() => {
    if (props.contextDate) setDate(props.contextDate);
    if (props.contextShift) setShift(props.contextShift);
  }, [props.contextDate, props.contextShift]);
  function newSeed(kind: Kind, bindModel = false): Payload {
    const selectedShift = props.contextShift ?? shift;
    const value = blankPayload(
      kind,
      props.contextDate ?? date,
      node || null,
      user?.brigade ?? "Наша бригада",
      bindModel ? modelContext.model : "",
      bindModel ? modelContext.elementIds : [],
    );
    return value.kind === "task" &&
      (selectedShift === "День" || selectedShift === "Ночь")
      ? { ...value, shift: selectedShift }
      : value;
  }
  useEffect(() => {
    if (props.initialRecordId) {
      const record = records.find((r) => r.id === props.initialRecordId);
      if (record) {
        setEditor({ record, kind: record.payload.kind });
        props.onInitialHandled();
      }
    }
  }, [records, props.initialRecordId, props.onInitialHandled]);
  useEffect(() => {
    if (props.initialKind) {
      setEditor({
        record: null,
        kind: props.initialKind,
        seed: newSeed(props.initialKind, true),
      });
      props.onInitialHandled();
    }
  }, [props.initialKind, props.onInitialHandled]);
  const scoped = records.filter((r) => {
    const p = r.payload;
    return (
      (!query ||
        p.title
          .toLocaleLowerCase("ru")
          .includes(query.toLocaleLowerCase("ru"))) &&
      (!("nodeId" in p) || inNode(records, p.nodeId, node)) &&
      (!brigade || !("brigade" in p) || p.brigade === brigade)
    );
  });
  const summary = useMemo(
    () =>
      constructionSummary(
        scoped,
        orders.filter(
          (o) =>
            inNode(records, o.order.draft.nodeId ?? null, node) &&
            (!brigade || o.order.draft.brigade === brigade),
        ),
        date,
        records,
      ),
    [scoped, records, orders, date, node, brigade],
  );
  const tasks = ofKind(scoped, "task").filter(
    (t) =>
      (!date || (t.payload.start <= date && t.payload.end >= date)) &&
      (!shift || t.payload.shift === shift) &&
      (taskFilter === "all" ||
        (taskFilter === "overdue" &&
          t.payload.end < today() &&
          t.payload.status !== "done") ||
        (taskFilter === "blocked" &&
          (t.payload.status === "blocked" || blockers(t, records).length > 0))),
  );
  const selected = records.find((r) => r.id === node),
    admin = user?.role === "admin";
  const edit = (r: ConstructionRecord) =>
    setEditor({ record: r, kind: r.payload.kind });
  const binding = (r: ConstructionRecord) =>
    "model" in r.payload && r.payload.model ? (
      <button
        className="cm-link"
        onClick={() =>
          onModel(
            r.payload.kind === "crew"
              ? ""
              : "model" in r.payload
                ? r.payload.model
                : "",
            "elementIds" in r.payload ? r.payload.elementIds : [],
          )
        }
      >
        <ArrowUpRight size={14} />
        Показать в модели
      </button>
    ) : null;
  const taskRow = (r: OfKind<"task">) => (
    <article key={r.id} className={`cm-task status-${r.payload.status}`}>
      <div>
        <span className="cm-tag">{taskLabels[r.payload.status]}</span>
        <h3>
          <button onClick={() => edit(r)}>{r.payload.title}</button>
        </h3>
        <p>{nodePath(records, r.payload.nodeId)}</p>
        <small>
          {r.payload.start} — {r.payload.end} · {r.payload.shift} ·{" "}
          {r.payload.brigade}
        </small>
        {blockers(r, records).length > 0 && (
          <p className="cm-warning">
            Ожидает:{" "}
            {r.payload.dependsOn
              .map(
                (id) =>
                  records.find((r) => r.id === id)?.payload.title ??
                  "Недоступная работа",
              )
              .join(", ")}
          </p>
        )}
        {r.payload.reason && <p>{r.payload.reason}</p>}
      </div>
      <div className="cm-row-actions">
        {binding(r)}
        {admin && (
          <button
            disabled={
              r.payload.status === "done" ||
              r.payload.status === "blocked" ||
              !!blockers(r, records).length
            }
            onClick={() => onCompose(r)}
          >
            Выдать наряд по задаче
          </button>
        )}
        <button onClick={() => edit(r)}>Открыть задачу</button>
      </div>
    </article>
  );
  return (
    <section
      className={`construction-panel ${editor ? "cm-editing" : ""}`}
      aria-label="Управление стройкой"
    >
      <div className="cm-content">
        <header className="cm-heading">
          <div>
            <p className="cm-context">
              {selected
                ? nodePath(records, selected.id)
                : "Все объекты стройки"}
            </p>
            <h1>{managementLabels[view]}</h1>
          </div>
          <div className="cm-heading-actions">
            <button
              aria-label="Обновить данные стройки"
              onClick={() => void data.refresh()}
            >
              <RefreshCw size={17} />
            </button>
            {viewKind[view] && admin && (
              <button
                className="primary"
                onClick={() =>
                  setEditor({
                    record: null,
                    kind: viewKind[view]!,
                    seed: newSeed(viewKind[view]!),
                  })
                }
              >
                <Plus size={16} />
                Добавить {kindLabels[viewKind[view]!]}
              </button>
            )}
          </div>
        </header>
        {!enabled && (
          <p className="cm-notice">
            Управление стройкой сохраняется в общей базе. Откройте серверную
            версию и войдите в аккаунт; локальная 3D-модель доступна отдельно.
          </p>
        )}
        {(error || data.error) && (
          <p className="cm-error" role="alert">
            {error || data.error}
          </p>
        )}
        {data.loading && <p role="status">Загрузка данных стройки…</p>}
        <div className="cm-filters">
          <Field label="Контекст объекта">
            <select
              aria-label="Контекст объекта"
              value={node}
              onChange={(e) => setNode(e.target.value)}
            >
              <option value="">Все объекты и участки</option>
              {ofKind(records, "node").map((r) => (
                <option key={r.id} value={r.id}>
                  {nodePath(records, r.id)}
                </option>
              ))}
            </select>
          </Field>
          {view !== "objects" && (
            <Field label="Фильтр бригады">
              <input
                aria-label="Фильтр бригады"
                value={brigade}
                placeholder="Все бригады"
                onChange={(e) => setBrigade(e.target.value)}
              />
            </Field>
          )}
          {view !== "overview" && (
            <Field label="Поиск записей">
              <input
                aria-label="Поиск записей"
                value={query}
                placeholder="По названию"
                onChange={(e) => setQuery(e.target.value)}
              />
            </Field>
          )}
        </div>
        {view === "overview" && (
          <>
            <div className="cm-overview-top">
              <div className="cm-shift-brief">
                <div>
                  <h2>Рабочий день</h2>
                  <input
                    aria-label="Дата рабочей сводки"
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (e.target.value) props.onContextDate?.(e.target.value);
                    }}
                  />
                </div>
                <div className="cm-quick-actions">
                  {admin && (
                    <button className="primary" onClick={() => onCompose(null)}>
                      <Plus size={17} />
                      Выдать задание
                    </button>
                  )}
                  <button onClick={onOrders}>
                    <ClipboardList size={17} />
                    Сдать смену / принять работу
                  </button>
                  {admin && (
                    <button
                      onClick={() => {
                        onView("quality");
                        setEditor({ record: null, kind: "issue" });
                      }}
                    >
                      Зафиксировать замечание
                    </button>
                  )}
                </div>
                <div className="cm-shift-columns">
                  {["День", "Ночь"].map((s) => (
                    <section key={s}>
                      <h3>{s === "День" ? "Дневная смена" : "Ночная смена"}</h3>
                      {summary.shifts.filter((o) => o.order.draft.shift === s)
                        .length ? (
                        summary.shifts
                          .filter((o) => o.order.draft.shift === s)
                          .map((o) => (
                            <button
                              className="cm-order-item"
                              key={o.order.id}
                              onClick={onOrders}
                            >
                              <strong>{o.order.draft.brigade}</strong>
                              <span>
                                {o.order.draft.rows.length} работ ·{" "}
                                {o.stage === "issued"
                                  ? "выдан"
                                  : o.stage === "submitted"
                                    ? "ожидает приёмки"
                                    : "принят"}
                              </span>
                            </button>
                          ))
                      ) : (
                        <p className="cm-empty-inline">
                          Наряды на эту смену не выданы.
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              </div>
              <aside className="cm-attention">
                <h2>Требует внимания</h2>
                <button onClick={onOrders}>
                  <strong>{summary.review.length}</strong> нарядов ожидают
                  приёмки
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => {
                    setDate("");
                    setTaskFilter("overdue");
                    onView("planning");
                  }}
                >
                  <strong>{summary.overdue.length}</strong> просроченных задач
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => {
                    setDate("");
                    setTaskFilter("blocked");
                    onView("planning");
                  }}
                >
                  <strong>{summary.blocked.length}</strong> задач с
                  препятствиями
                  <ChevronRight size={16} />
                </button>
                <button onClick={() => onView("quality")}>
                  <strong>{summary.issues.length}</strong> незакрытых замечаний
                  <ChevronRight size={16} />
                </button>
                <small>
                  Сводка отражает зарегистрированные работы и замечания.
                </small>
              </aside>
            </div>
            <div className="cm-section-heading">
              <h2>Работы в процессе</h2>
              <button
                onClick={() => {
                  setTaskFilter("all");
                  onView("planning");
                }}
              >
                Открыть планирование
              </button>
            </div>
            {summary.active.length ? (
              summary.active.map(taskRow)
            ) : (
              <div className="cm-empty">
                <h3>Зафиксируйте ближайшие работы</h3>
                <p>
                  Добавьте объект, бригаду и задачу. Затем выдайте наряд на
                  нужную смену.
                </p>
                <button onClick={() => onView("objects")}>
                  Настроить структуру объектов
                </button>
              </div>
            )}
          </>
        )}
        {view === "objects" && (
          <>
            <p className="cm-intro">
              Стройка, объекты, участки и оси, конструкции и части. Привязка к
              3D сохраняется отдельно от геометрии.
            </p>
            {ofKind(records, "node").length === 0 && admin && (
              <button
                disabled={!enabled}
                onClick={() =>
                  void (async () => {
                    try {
                      const site = await data.save(
                        {
                          ...blankPayload("node", today(), null, ""),
                          title: "Маленковская",
                          description:
                            "Начальная структура по доступным моделям КЖ",
                        } as Payload,
                        null,
                      );
                      for (const [title, model] of [
                        ["Кассовый павильон", "kzh-pavilion"],
                        ["Навес «сухие ноги»", "kzh-canopy"],
                      ])
                        await data.save(
                          {
                            kind: "node",
                            title,
                            model,
                            parentId: site.id,
                            level: "object",
                            elementIds: [],
                            description:
                              "По загруженному КЖ; участки и оси уточняются отдельно",
                          },
                          null,
                        );
                      await data.refresh();
                    } catch (e) {
                      setError(String(e));
                    }
                  })()
                }
              >
                Создать структуру по доступным моделям КЖ
              </button>
            )}
            <ConstructionTree
              records={records}
              scope={node}
              query={query}
              onOpen={setNode}
              onEdit={edit}
              onModel={onModel}
              admin={admin}
            />
          </>
        )}
        {view === "planning" && (
          <>
            <div className="cm-planning-bar">
              <Field label="Дата плана">
                <input
                  aria-label="Дата плана"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (e.target.value) props.onContextDate?.(e.target.value);
                  }}
                />
              </Field>
              <Field label="Смена плана">
                <select
                  value={shift}
                  onChange={(e) => {
                    const value = e.target.value;
                    setShift(value);
                    if (value === "День" || value === "Ночь")
                      props.onContextShift?.(value);
                  }}
                >
                  <option value="">Обе смены</option>
                  <option>День</option>
                  <option>Ночь</option>
                </select>
              </Field>
              <Field label="Отбор задач">
                <select
                  aria-label="Отбор задач"
                  value={taskFilter}
                  onChange={(e) => setTaskFilter(e.target.value)}
                >
                  <option value="all">Все задачи</option>
                  <option value="overdue">Просроченные</option>
                  <option value="blocked">С препятствиями</option>
                </select>
              </Field>
              <button onClick={() => setDate("")}>Весь период</button>
            </div>
            {tasks.length ? (
              tasks.map(taskRow)
            ) : (
              <div className="cm-empty">
                <h3>На выбранный период задач нет</h3>
                <p>
                  Добавьте работу, сроки, смену и бригаду. Предшествующие работы
                  помогут соблюдать порядок этапов.
                </p>
              </div>
            )}
          </>
        )}
        {view === "crews" &&
          ofKind(scoped, "crew").map((r) => (
            <article className="cm-object-row" key={r.id}>
              <div>
                <span className="cm-tag">
                  {r.payload.active ? "Активна" : "Неактивна"}
                </span>
                <h3>{r.payload.title}</h3>
                <p>Бригадир: {r.payload.leader || "не указан"}</p>
                <p>
                  {r.payload.members.length} сотрудников ·{" "}
                  {
                    ofKind(records, "task").filter(
                      (t) =>
                        t.payload.brigade === r.payload.title &&
                        t.payload.status !== "done",
                    ).length
                  }{" "}
                  незавершённых задач
                </p>
                <ul>
                  {r.payload.members.map((m, i) => (
                    <li key={i}>
                      {m.name}
                      {m.role ? ` — ${m.role}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={() => edit(r)}>
                {admin ? "Изменить бригаду" : "Открыть состав"}
              </button>
            </article>
          ))}
        {view === "materials" && (
          <>
            <button onClick={props.onModelMaterials}>
              Потребность по 3D-модели
            </button>
            <p className="cm-intro">
              Остатки по зарегистрированным поступлениям, начальным остаткам и
              расходам. Это складской учёт; потребность модели и факт наряда
              учитываются отдельно.
            </p>
            <div className="cm-table-wrap material-balance">
              <table>
                <thead>
                  <tr>
                    <th>Материал</th>
                    <th>Объект</th>
                    <th>Приход / начальный</th>
                    <th>Расход</th>
                    <th>Остаток</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory(scoped).map((r, i) => (
                    <tr key={i}>
                      <td data-label="Материал">{r.title}</td>
                      <td data-label="Объект">{nodePath(records, r.nodeId)}</td>
                      <td data-label="Приход / начальный">
                        {f(r.incoming)} {r.unit}
                      </td>
                      <td data-label="Расход">
                        {f(r.consumed)} {r.unit}
                      </td>
                      <td data-label="Остаток">
                        <strong>
                          {f(r.balance)} {r.unit}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h2>Журнал движений</h2>
            {ofKind(scoped, "movement")
              .slice()
              .reverse()
              .map((r) => (
                <article className="cm-journal-row" key={r.id}>
                  <span>{r.payload.date}</span>
                  <strong>{r.payload.title}</strong>
                  <span>
                    {r.payload.direction === "consume"
                      ? "Расход"
                      : r.payload.direction === "opening"
                        ? "Начальный остаток"
                        : "Поступление"}
                    : {f(r.payload.quantity)} {r.payload.unit}
                    {r.payload.voided ? " · отменено" : ""}
                  </span>
                  <small>{r.payload.basis}</small>
                  <button onClick={() => edit(r)}>Открыть операцию</button>
                </article>
              ))}
          </>
        )}
        {view === "quality" && (
          <label className="section-filter">
            Показать замечания
            <select
              aria-label="Фильтр замечаний"
              value={issueFilter}
              onChange={(e) => setIssueFilter(e.target.value)}
            >
              <option value="open">Незакрытые</option>
              <option value="overdue">Просроченные</option>
              <option value="critical">Критические</option>
              <option value="all">Все</option>
            </select>
          </label>
        )}
        {view === "quality" &&
          ofKind(scoped, "issue")
            .filter(
              ({ payload: p }) =>
                issueFilter === "all" ||
                (p.status !== "closed" &&
                  (issueFilter === "open" ||
                    (issueFilter === "overdue" && !!p.due && p.due < today()) ||
                    (issueFilter === "critical" && p.severity === "critical"))),
            )
            .map((r) => (
              <article
                className={`cm-task ${r.payload.severity === "critical" && r.payload.status !== "closed" ? "status-blocked" : ""}`}
                key={r.id}
              >
                <div>
                  <span className="cm-tag">
                    {r.payload.status === "open"
                      ? "Открыто"
                      : r.payload.status === "corrected"
                        ? "Ожидает проверки"
                        : "Закрыто"}
                  </span>
                  <h3>{r.payload.title}</h3>
                  <p>{r.payload.description}</p>
                  <small>
                    {nodePath(records, r.payload.nodeId)} · {r.payload.owner} ·
                    до {r.payload.due}
                  </small>
                  {r.payload.evidence && (
                    <p>Устранение: {r.payload.evidence}</p>
                  )}
                </div>
                <div className="cm-row-actions">
                  {binding(r)}
                  <button onClick={() => edit(r)}>Открыть замечание</button>
                </div>
              </article>
            ))}
        {view === "documents" && (
          <label className="section-filter">
            Категория документов
            <select
              aria-label="Категория документов"
              value={documentCategory}
              onChange={(e) => setDocumentCategory(e.target.value)}
            >
              <option value="">Все категории</option>
              {Array.from(
                new Set(
                  ofKind(scoped, "document").map((r) => r.payload.category),
                ),
              ).map((category) => (
                <option key={category} value={category}>
                  {(
                    {
                      drawing: "Чертежи",
                      report: "Отчёты",
                      photo: "Фото",
                      video: "Видео",
                      other: "Другие документы",
                    } as Record<string, string>
                  )[category] ?? category}
                </option>
              ))}
            </select>
          </label>
        )}
        {view === "documents" &&
          ofKind(scoped, "document")
            .filter(
              (r) =>
                !documentCategory || r.payload.category === documentCategory,
            )
            .slice()
            .reverse()
            .map((r) => (
              <article className="cm-object-row" key={r.id}>
                <FileText size={28} />
                <div>
                  <span className="cm-tag">
                    {ofKind(records, "document").some(
                      (d) => d.payload.supersedes === r.id,
                    )
                      ? "Заменён новой редакцией"
                      : "Текущая редакция"}
                  </span>
                  <h3>{r.payload.title}</h3>
                  <p>
                    {r.payload.number} · ред. {r.payload.edition} ·{" "}
                    {r.payload.date}
                  </p>
                  <small>{nodePath(records, r.payload.nodeId)}</small>
                  {r.file && r.payload.category === "video" && (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      style={{ width: "100%", maxWidth: 600 }}
                      src={`/api/construction-files/${r.file.id}`}
                    />
                  )}
                  {r.file && /\.pdf$/i.test(r.file.name) && (
                    <div className="document-inline-preview">
                      <button
                        onClick={() => {
                          setPreviewDocument(
                            previewDocument === r.id ? null : r.id,
                          );
                          setPreviewPage(1);
                        }}
                      >
                        {previewDocument === r.id
                          ? "Закрыть просмотр"
                          : "Просмотреть документ"}
                      </button>
                      {previewDocument === r.id && (
                        <>
                          <label>
                            Страница
                            <input
                              aria-label="Страница документа"
                              type="number"
                              min={1}
                              value={previewPage}
                              onChange={(e) =>
                                setPreviewPage(Math.max(1, +e.target.value))
                              }
                            />
                          </label>
                          <PdfCanvas
                            url={"/api/construction-files/" + r.file.id}
                            page={previewPage}
                          />
                        </>
                      )}
                    </div>
                  )}
                  {r.file ? (
                    <p>
                      <a href={`/api/construction-files/${r.file.id}`}>
                        Скачать {r.file.name}
                      </a>{" "}
                      · {f(r.file.size / 1024)} КБ
                    </p>
                  ) : (
                    <p className="cm-warning">Файл ещё не приложен</p>
                  )}
                </div>
                <div className="cm-row-actions">
                  {binding(r)}
                  <button onClick={() => edit(r)}>Карточка документа</button>
                  {admin && (
                    <button
                      onClick={() =>
                        setEditor({
                          record: null,
                          kind: "document",
                          seed: { ...r.payload, edition: "", supersedes: r.id },
                        })
                      }
                    >
                      Добавить редакцию
                    </button>
                  )}
                </div>
              </article>
            ))}
        {!["overview", "planning", "objects", "materials"].includes(view) &&
          !scoped.some((r) => r.payload.kind === viewKind[view]) && (
            <div className="cm-empty">
              <h3>Записей пока нет</h3>
              <p>
                {admin
                  ? `Добавьте ${kindLabels[viewKind[view]!]} и привяжите к нужному участку.`
                  : "Здесь появятся доступные вам записи, добавленные руководителем."}
              </p>
            </div>
          )}
      </div>
      {editor && user && (
        <Editor
          key={
            editor.record?.id ??
            `new:${editor.kind}:${editor.seed?.kind === "document" ? (editor.seed.supersedes ?? "") : ""}`
          }
          record={editor.record}
          kind={editor.kind}
          records={records}
          user={user}
          node={node}
          modelContext={modelContext}
          onSave={async (payload, record) => {
            const result = await data.save(payload, record);
            if (payload.kind === "task") {
              setDate(payload.start);
              setShift(payload.shift);
              props.onContextDate?.(payload.start);
              props.onContextShift?.(payload.shift);
            }
            return result;
          }}
          seed={editor.seed}
          onClose={() => {
            setEditor(null);
            void data.refresh();
          }}
          onEvidence={onEvidence}
        />
      )}
    </section>
  );
}
