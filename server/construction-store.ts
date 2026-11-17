import { randomUUID, createHash } from "node:crypto";
import {
  payloadSchema,
  recordSchema,
  ofKind,
  inventory,
  blockers,
  type Payload,
  type ConstructionRecord,
} from "../src/construction";
import type { WorkspaceUser } from "../src/workspaceTypes";
import { WorkspaceDatabase, WorkspaceError } from "./database";
const scope = (p: Payload) =>
  "brigade" in p ? p.brigade || null : p.kind === "crew" ? p.title : null;
const allowed = (u: WorkspaceUser, p: Payload) =>
  !u.brigade || !scope(p) || scope(p) === u.brigade;
export class ConstructionStore {
  constructor(readonly store: WorkspaceDatabase) {}
  all(): ConstructionRecord[] {
    return this.store.db
      .prepare("SELECT * FROM construction_records ORDER BY created_at,id")
      .all()
      .map((r) => {
        const file = this.store.db
          .prepare(
            "SELECT id,name,length(data) size,hash FROM construction_files WHERE record_id=? ORDER BY rowid DESC LIMIT 1",
          )
          .get(r.id);
        return recordSchema.parse({
          id: r.id,
          revision: r.revision,
          payload: JSON.parse(String(r.payload)),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          author: r.author,
          file: file ?? null,
        });
      });
  }
  list(user: WorkspaceUser) {
    return this.all().filter((r) => allowed(user, r.payload));
  }
  get(user: WorkspaceUser, id: string) {
    const r = this.list(user).find((r) => r.id === id);
    if (!r) throw new WorkspaceError(404, "Запись не найдена или недоступна");
    return r;
  }
  validate(p: Payload, id: string, existing: ConstructionRecord[]) {
    if (p.kind === "node") {
      const levels = ["site", "object", "zone", "structure", "part"];
      if (p.parentId === id)
        throw new WorkspaceError(400, "Объект не может быть вложен в себя");
      if (p.parentId) {
        const parent = existing.find((r) => r.id === p.parentId);
        if (
          parent?.payload.kind !== "node" ||
          levels.indexOf(parent.payload.level) >= levels.indexOf(p.level)
        )
          throw new WorkspaceError(
            400,
            "Выберите родителя выше по структуре стройки",
          );
      } else if (p.level !== "site")
        throw new WorkspaceError(
          400,
          "Для этого уровня нужен родительский объект",
        );
      if (
        existing.some(
          (r) =>
            r.payload.kind === "node" &&
            r.payload.parentId === id &&
            levels.indexOf(r.payload.level) <= levels.indexOf(p.level),
        )
      )
        throw new WorkspaceError(
          400,
          "Новый уровень нарушит структуру вложенных объектов",
        );
    } else if (
      "nodeId" in p &&
      p.nodeId &&
      !ofKind(existing, "node").some((r) => r.id === p.nodeId)
    )
      throw new WorkspaceError(400, "Выбранный участок не существует");
    if (p.kind === "task") {
      if (p.end < p.start)
        throw new WorkspaceError(400, "Окончание не может быть раньше начала");
      const tasks = ofKind(existing, "task");
      if (p.dependsOn.some((d) => d === id || !tasks.some((t) => t.id === d)))
        throw new WorkspaceError(400, "Проверьте предшествующие работы");
      const visit = (key: string, seen: Set<string>): boolean => {
        if (key === id) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return (
          tasks
            .find((t) => t.id === key)
            ?.payload.dependsOn.some((d) => visit(d, seen)) ?? false
        );
      };
      if (p.dependsOn.some((d) => visit(d, new Set())))
        throw new WorkspaceError(
          400,
          "Зависимости работ образуют замкнутую цепочку",
        );
      if (
        (p.status === "active" || p.status === "done") &&
        blockers(
          {
            id,
            payload: p,
            revision: 1,
            createdAt: "",
            updatedAt: "",
            author: "",
            file: null,
          },
          existing,
        ).length
      )
        throw new WorkspaceError(
          409,
          "Сначала завершите предшествующие работы и закройте критические замечания",
        );
      if (p.status === "blocked" && !p.reason.trim())
        throw new WorkspaceError(400, "Укажите причину блокировки");
    }
    if (
      p.kind === "crew" &&
      ofKind(existing, "crew").some(
        (c) =>
          c.id !== id &&
          c.payload.title.toLowerCase() === p.title.toLowerCase(),
      )
    )
      throw new WorkspaceError(409, "Бригада с таким названием уже существует");
    if (p.kind === "movement") {
      if (p.voided && p.reason.trim().length < 3)
        throw new WorkspaceError(400, "Укажите причину отмены движения");
      const next = [
        ...existing.filter((r) => r.id !== id),
        {
          id,
          payload: p,
          revision: 1,
          createdAt: "",
          updatedAt: "",
          author: "",
          file: null,
        },
      ];
      if (inventory(next).some((r) => r.balance < -1e-8))
        throw new WorkspaceError(
          409,
          "Расход превышает зарегистрированный остаток. Внесите поступление или начальный остаток.",
        );
    }
    if (p.kind === "issue" && p.status !== "open" && !p.evidence.trim())
      throw new WorkspaceError(
        400,
        "Опишите устранение и подтверждение; приложите фото или документ при необходимости",
      );
    if (p.kind === "document" && p.supersedes) {
      const prev = existing.find((r) => r.id === p.supersedes);
      if (
        prev?.payload.kind !== "document" ||
        prev.id === id ||
        prev.payload.nodeId !== p.nodeId ||
        prev.payload.number !== p.number ||
        scope(prev.payload) !== scope(p)
      )
        throw new WorkspaceError(
          400,
          "Редакции должны относиться к тому же номеру, участку и бригаде доступа",
        );
      if (
        ofKind(existing, "document").some(
          (r) => r.id !== id && r.payload.supersedes === p.supersedes,
        )
      )
        throw new WorkspaceError(
          409,
          "Для предыдущей редакции уже выпущена замена",
        );
      const seen = new Set([id]);
      let cursor: ConstructionRecord | undefined = prev;
      while (cursor?.payload.kind === "document") {
        if (seen.has(cursor.id))
          throw new WorkspaceError(400, "Редакции образуют замкнутую цепочку");
        seen.add(cursor.id);
        const nextId: string | null = cursor.payload.supersedes;
        cursor = existing.find((r) => r.id === nextId);
      }
    }
  }
  save(
    user: WorkspaceUser,
    raw: unknown,
    recordId: string | null,
    revision: number | null,
  ) {
    if (user.role === "viewer")
      throw new WorkspaceError(403, "Доступен только просмотр");
    const p = payloadSchema.parse(raw),
      id = recordId ?? randomUUID();
    return this.store.transaction(() => {
      const existing = this.all(),
        previous = recordId ? this.get(user, id) : null;
      if (previous && previous.payload.kind !== p.kind)
        throw new WorkspaceError(400, "Тип записи нельзя менять");
      if (previous ? previous.revision !== revision : revision !== null)
        throw new WorkspaceError(
          409,
          "Запись уже изменена. Загрузите актуальную версию; ваши поля сохранены в форме.",
        );
      if (!allowed(user, p))
        throw new WorkspaceError(403, "Недоступная бригада");
      if (user.role !== "admin") {
        if (
          previous?.payload.kind === "issue" &&
          previous.payload.status === "closed"
        )
          throw new WorkspaceError(
            403,
            "Закрытое замечание возвращает на исправление руководитель",
          );
        if (
          !previous ||
          !["task", "issue"].includes(p.kind) ||
          p.kind !== previous.payload.kind
        )
          throw new WorkspaceError(
            403,
            "Создание и планирование доступны руководителю",
          );
        const immutable = (v: Payload) => {
          if (v.kind === "task") return { ...v, status: "planned", reason: "" };
          if (v.kind === "issue") return { ...v, status: "open", evidence: "" };
          return v;
        };
        if (
          JSON.stringify(immutable(previous.payload)) !==
          JSON.stringify(immutable(p))
        )
          throw new WorkspaceError(
            403,
            "Бригадир изменяет выполнение и подтверждение, план меняет руководитель",
          );
        if (p.kind === "issue" && p.status === "closed")
          throw new WorkspaceError(
            403,
            "Закрытие замечания подтверждает руководитель",
          );
      }
      if (
        p.kind === "issue" &&
        p.status === "closed" &&
        (previous?.payload.kind !== "issue" ||
          previous.payload.status !== "corrected")
      )
        throw new WorkspaceError(409, "Сначала отметьте устранение замечания");
      this.validate(p, id, existing);
      const created = previous?.createdAt ?? new Date().toISOString(),
        updated = new Date().toISOString(),
        author = `${user.name} (${user.username})`;
      this.store.db
        .prepare(
          "INSERT INTO construction_records VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_at=excluded.updated_at,author=excluded.author",
        )
        .run(
          id,
          p.kind,
          JSON.stringify(p),
          (previous?.revision ?? 0) + 1,
          created,
          updated,
          author,
        );
      this.store.db
        .prepare(
          "INSERT INTO construction_events(record_id,actor,created_at,before_payload,after_payload) VALUES(?,?,?,?,?)",
        )
        .run(
          id,
          author,
          updated,
          previous ? JSON.stringify(previous) : null,
          JSON.stringify(p),
        );
      return this.get(user, id);
    });
  }
  history(user: WorkspaceUser, id: string) {
    this.get(user, id);
    return this.store.db
      .prepare(
        "SELECT id,actor,created_at,before_payload,after_payload FROM construction_events WHERE record_id=? ORDER BY id DESC",
      )
      .all(id);
  }
  file(user: WorkspaceUser, fileId: string) {
    const file = this.store.db
      .prepare("SELECT * FROM construction_files WHERE id=?")
      .get(fileId);
    if (!file) throw new WorkspaceError(404, "Файл не найден");
    this.get(user, String(file.record_id));
    return file;
  }
  attach(
    user: WorkspaceUser,
    id: string,
    revision: number,
    name: string,
    data: Buffer,
  ) {
    if (user.role !== "admin")
      throw new WorkspaceError(403, "Документы загружает руководитель");
    const extension = name.toLowerCase().split(".").at(-1);
    const valid =
      extension === "pdf"
        ? data.subarray(0, 5).toString() === "%PDF-"
        : ["xlsx", "docx"].includes(extension ?? "")
          ? data.subarray(0, 2).toString() === "PK"
          : extension === "png"
            ? data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
            : ["jpg", "jpeg"].includes(extension ?? "")
              ? data[0] === 255 && data[1] === 216
              : extension === "dxf"
                ? data.subarray(0, 200).toString().includes("SECTION")
                : false;
    if (!valid || !data.length || data.length > 25 * 1024 * 1024)
      throw new WorkspaceError(
        400,
        "Поддерживаются PDF, XLSX, DOCX, DXF и изображения JPEG/PNG до 25 МБ",
      );
    return this.store.transaction(() => {
      const record = this.get(user, id);
      if (record.revision !== revision)
        throw new WorkspaceError(
          409,
          "Документ изменён. Обновите запись перед загрузкой",
        );
      if (record.payload.kind !== "document" || record.file)
        throw new WorkspaceError(
          409,
          "Для другого файла создайте новую редакцию документа",
        );
      const fileId = randomUUID(),
        hash = createHash("sha256").update(data).digest("hex"),
        now = new Date().toISOString();
      this.store.db
        .prepare("INSERT INTO construction_files VALUES(?,?,?,?,?,?)")
        .run(fileId, id, name.replace(/[\\/\r\n]/g, "_"), data, hash, now);
      this.store.db
        .prepare(
          "UPDATE construction_records SET revision=revision+1,updated_at=?,author=? WHERE id=?",
        )
        .run(now, `${user.name} (${user.username})`, id);
      this.store.db
        .prepare(
          "INSERT INTO construction_events(record_id,actor,created_at,before_payload,after_payload) VALUES(?,?,?,?,?)",
        )
        .run(
          id,
          user.username,
          now,
          JSON.stringify(record),
          JSON.stringify({ fileId, name, hash }),
        );
      return this.get(user, id);
    });
  }
  validateOrder(
    user: WorkspaceUser,
    draft: {
      taskId?: string | null;
      nodeId?: string | null;
      brigade: string;
      date: string;
      shift: string;
      rows?: { elementIds: string[]; project: string }[];
    },
  ) {
    if (draft.nodeId && this.get(user, draft.nodeId).payload.kind !== "node")
      throw new WorkspaceError(400, "Выберите участок стройки");
    if (!draft.taskId) return;
    const task = this.get(user, draft.taskId);
    if (task.payload.kind !== "task")
      throw new WorkspaceError(400, "Задача не найдена");
    const p = task.payload;
    if (
      draft.rows?.some(
        (r) =>
          (p.elementIds.length > 0 &&
            !r.elementIds.some((id) => p.elementIds.includes(id))) ||
          (p.model === "kzh-canopy" &&
            r.elementIds.some((id) => !id.startsWith("canopy-"))) ||
          (p.model === "kzh-pavilion" &&
            r.elementIds.some((id) => !id.startsWith("pavilion-"))),
      )
    )
      throw new WorkspaceError(
        409,
        "Выбранные конструкции не соответствуют привязке задачи к модели",
      );
    if (
      p.status === "blocked" ||
      p.status === "done" ||
      blockers(
        task as ConstructionRecord & {
          payload: Extract<Payload, { kind: "task" }>;
        },
        this.all(),
      ).length
    )
      throw new WorkspaceError(
        409,
        "Задача заблокирована, завершена или ожидает предшествующие работы",
      );
    if (
      p.brigade !== draft.brigade ||
      p.shift !== draft.shift ||
      draft.date < p.start ||
      draft.date > p.end ||
      draft.nodeId !== p.nodeId
    )
      throw new WorkspaceError(
        409,
        "Участок, бригада, дата и смена наряда должны соответствовать задаче",
      );
  }
}
