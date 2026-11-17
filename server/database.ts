import { DatabaseSync, backup } from "node:sqlite";
import {
  randomUUID,
  randomBytes,
  scrypt as derive,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify, isDeepStrictEqual } from "node:util";
import { mkdir, chmod, readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  sharedOrderSchema,
  type SharedOrder,
  type WorkspaceUser,
  type Role,
  type WorkEvent,
} from "../src/workspaceTypes";
import {
  savedSchema,
  handoffErrors,
  type SavedWorkOrder,
} from "../src/workOrderArchive";
import { reportErrors } from "../src/workOrders";
import { allocationErrors } from "../src/workProgress";
import {
  signatureModels,
  signatureFields,
  signatureStatus,
  type SignatureStatus,
  type SignaturePhase,
} from "../src/signatures";

import {
  manualWorkRow,
  reviewSchema,
  additionalSchema,
} from "../src/orderReview";
import type { z } from "zod";

const scrypt = promisify(derive);
const now = () => new Date().toISOString();
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class WorkspaceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function passwordHash(password: string) {
  if (password.length < 12 || password.length > 256)
    throw new WorkspaceError(
      400,
      "Пароль должен содержать от 12 до 256 символов",
    );
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
async function passwordMatches(password: string, hash: string) {
  const [salt, stored] = hash.split(":");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(stored, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}
const visible = (user: WorkspaceUser, brigade: string) =>
  !user.brigade || user.brigade === brigade;
const admin = (user: WorkspaceUser) => {
  if (user.role !== "admin")
    throw new WorkspaceError(403, "Действие доступно руководителю");
};
type SqlRow = Record<string, string | number | bigint | null | Uint8Array>;
const publicUser = (r: SqlRow): WorkspaceUser => ({
  id: String(r.id),
  username: String(r.username),
  name: String(r.name),
  role: r.role as Role,
  brigade: r.brigade === null ? null : String(r.brigade),
  active: !!r.active,
});
export class WorkspaceDatabase {
  readonly db: DatabaseSync;
  private constructor(
    public path: string,
    public backups: string,
  ) {
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;",
    );
    const version = this.db.prepare("PRAGMA user_version").get()!;
    if (Number(version.user_version) > 2)
      throw Error("Database version is newer than this application");
    if (Number(version.user_version) < 1)
      this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, brigade TEXT, active INTEGER NOT NULL DEFAULT 1, password_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, brigade TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL, stage TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, revision INTEGER NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL, snapshot TEXT);
      CREATE INDEX IF NOT EXISTS events_order ON events(order_id,id);
      CREATE TABLE IF NOT EXISTS drafts(user_id TEXT PRIMARY KEY REFERENCES users(id), payload TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, model TEXT NOT NULL, element_id TEXT NOT NULL, order_id TEXT, text TEXT NOT NULL, author TEXT NOT NULL, brigade TEXT NOT NULL, created_at TEXT NOT NULL, image_id TEXT);
      CREATE INDEX IF NOT EXISTS notes_object ON notes(model,element_id);
      CREATE TABLE IF NOT EXISTS images(id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, note_id TEXT NOT NULL REFERENCES notes(id));
      PRAGMA user_version=1; COMMIT;`);
    if (Number(version.user_version) < 2)
      this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE construction_records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,author TEXT NOT NULL);
      CREATE TABLE construction_events(id INTEGER PRIMARY KEY AUTOINCREMENT,record_id TEXT NOT NULL REFERENCES construction_records(id),actor TEXT NOT NULL,created_at TEXT NOT NULL,before_payload TEXT,after_payload TEXT NOT NULL);
      CREATE INDEX construction_events_record ON construction_events(record_id,id);
      CREATE TABLE construction_files(id TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES construction_records(id),name TEXT NOT NULL,data BLOB NOT NULL,hash TEXT NOT NULL,created_at TEXT NOT NULL);
      PRAGMA user_version=2; COMMIT;`);
  }
  static async open(path: string, backups = join(dirname(path), "backups")) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await mkdir(backups, { recursive: true, mode: 0o700 });
    const store = new WorkspaceDatabase(path, backups);
    await chmod(path, 0o600);
    return store;
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  async addUser(
    actor: WorkspaceUser | null,
    input: {
      username: string;
      name: string;
      password: string;
      role: Role;
      brigade: string | null;
    },
  ) {
    if (actor) admin(actor);
    else if (Number(this.db.prepare("SELECT count(*) n FROM users").get()!.n))
      throw new WorkspaceError(403, "Первый руководитель уже создан");
    if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(input.username) || !input.name.trim())
      throw new WorkspaceError(
        400,
        "Укажите имя и логин из 3–64 латинских букв, цифр, точек или дефисов",
      );
    if (input.role === "foreman" && !input.brigade?.trim())
      throw new WorkspaceError(400, "Для бригадира укажите бригаду");
    const hash = await passwordHash(input.password);
    if (
      this.db
        .prepare("SELECT id FROM users WHERE username=?")
        .get(input.username.toLowerCase())
    )
      throw new WorkspaceError(409, "Такой логин уже есть");
    const id = randomUUID();
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?,1,?)")
        .run(
          id,
          input.username.toLowerCase(),
          input.name.trim(),
          input.role,
          input.brigade?.trim() || null,
          hash,
        );
      this.event(
        "",
        0,
        "user-created",
        input.username,
        actor?.name ?? "Первичная настройка",
        null,
      );
    });
    return publicUser(
      this.db.prepare("SELECT * FROM users WHERE id=?").get(id)!,
    );
  }
  users(user: WorkspaceUser) {
    admin(user);
    return this.db
      .prepare("SELECT * FROM users ORDER BY username")
      .all()
      .map(publicUser);
  }
  async authenticate(
    username: string,
    password: string,
  ): Promise<WorkspaceUser | null> {
    if (password.length > 256) return null;
    const row = this.db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username.toLowerCase());
    const valid = await passwordMatches(
      password,
      row ? String(row.password_hash) : `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    return row && row.active && valid ? publicUser(row) : null;
  }
  createSession(user: WorkspaceUser) {
    const token = randomBytes(32).toString("base64url");
    this.db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(digest(token), user.id, Date.now() + 12 * 60 * 60 * 1000);
    return token;
  }
  session(token: string): WorkspaceUser | null {
    const row = this.db
      .prepare(
        "SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>? AND u.active=1",
      )
      .get(digest(token), Date.now());
    return row ? publicUser(row) : null;
  }
  logout(token: string) {
    this.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(digest(token));
  }
  async changePassword(user: WorkspaceUser, current: string, next: string) {
    if (!(await this.authenticate(user.username, current)))
      throw new WorkspaceError(403, "Текущий пароль неверен");
    const hash = await passwordHash(next);
    this.transaction(() => {
      this.db
        .prepare("UPDATE users SET password_hash=? WHERE id=?")
        .run(hash, user.id);
      this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
      this.event("", 0, "password-changed", "", user.name, null);
    });
  }
  setUserActive(actor: WorkspaceUser, id: string, active: boolean) {
    admin(actor);
    if (id === actor.id)
      throw new WorkspaceError(
        400,
        "Нельзя отключить собственную учётную запись",
      );
    this.transaction(() => {
      this.db
        .prepare("UPDATE users SET active=? WHERE id=?")
        .run(active ? 1 : 0, id);
      this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      this.event(
        "",
        0,
        active ? "user-enabled" : "user-disabled",
        id,
        actor.name,
        null,
      );
    });
  }
  list(user: WorkspaceUser): SharedOrder[] {
    return this.db
      .prepare("SELECT * FROM orders ORDER BY updated_at DESC")
      .all()
      .filter((r) => visible(user, String(r.brigade)))
      .map((r) => this.decode(r));
  }
  private decode(row: SqlRow): SharedOrder {
    return sharedOrderSchema.parse({
      order: JSON.parse(String(row.payload)),
      revision: Number(row.revision),
      stage: row.stage,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    });
  }
  get(user: WorkspaceUser, id: string) {
    const row = this.db.prepare("SELECT * FROM orders WHERE id=?").get(id);
    if (!row || !visible(user, String(row.brigade)))
      throw new WorkspaceError(404, "Наряд не найден");
    return this.decode(row);
  }
  private event(
    orderId: string,
    revision: number,
    action: string,
    reason: string,
    actor: string,
    snapshot: SavedWorkOrder | null,
  ) {
    this.db
      .prepare(
        "INSERT INTO events(order_id,revision,action,reason,actor,created_at,snapshot) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        orderId,
        revision,
        action,
        reason,
        actor,
        now(),
        snapshot ? JSON.stringify(snapshot) : null,
      );
  }
  private write(
    user: WorkspaceUser,
    order: SavedWorkOrder,
    revision: number,
    stage: SharedOrder["stage"],
    action: string,
    reason = "",
  ) {
    const updatedAt = now();
    this.db
      .prepare(
        "INSERT INTO orders VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET brigade=excluded.brigade,payload=excluded.payload,revision=excluded.revision,stage=excluded.stage,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      )
      .run(
        order.id,
        order.draft.brigade,
        JSON.stringify(order),
        revision,
        stage,
        updatedAt,
        `${user.name} (${user.username})`,
      );
    const actor = `${user.name} (${user.username})`;
    this.event(order.id, revision, action, reason, actor, order);
    return { order, revision, stage, updatedAt, updatedBy: actor };
  }
  save(
    user: WorkspaceUser,
    raw: unknown,
    expected: number | null,
  ): SharedOrder {
    if (user.role === "viewer")
      throw new WorkspaceError(403, "Доступен только просмотр");
    const incoming = savedSchema.parse(raw);
    const invalid = reportErrors(incoming.draft);
    if (invalid.length) throw new WorkspaceError(400, invalid.join("; "));
    return this.transaction(() => {
      const existing = this.db
        .prepare("SELECT * FROM orders WHERE id=?")
        .get(incoming.id);
      if (!existing) {
        admin(user);
        if (expected !== null)
          throw new WorkspaceError(
            409,
            "Наряд удалён или изменён. Обновите список.",
          );
        if (
          !incoming.draft.rows.length ||
          incoming.draft.rows.some(
            (r) =>
              r.date !== incoming.draft.date ||
              r.shift !== incoming.draft.shift,
          )
        )
          throw new WorkspaceError(
            400,
            "Наряд должен содержать работы одной даты и смены",
          );
        const errors = allocationErrors(incoming, this.list(user));
        if (errors.length) throw new WorkspaceError(409, errors.join("; "));
        const order = savedSchema.parse({
          ...incoming,
          createdAt: now(),
          submittedAt: null,
          draft: {
            ...incoming.draft,
            reportedPeople: null,
            rows: incoming.draft.rows.map((r) => ({
              ...r,
              actual: null,
              verifiedActual: null,
              verificationBasis: "",
              verifiedAt: "",
              verifiedBy: "",
              completed: false,
            })),
            crew: incoming.draft.crew.map((r) => ({
              ...r,
              start: "",
              end: "",
              breakMinutes: 0,
              startSignatureNoteId: null,
              endSignatureNoteId: null,
              startSignatureStatus: "unchecked" as const,
              endSignatureStatus: "unchecked" as const,
            })),
          },
        });
        return this.write(user, order, 1, "issued", "issued");
      }
      const current = this.get(user, incoming.id);
      this.inheritSignatureChecks(incoming, current.order);
      if (current.revision !== expected)
        throw new WorkspaceError(
          409,
          "Наряд изменён другим пользователем. Обновите запись перед сохранением.",
        );
      if (current.stage !== "issued")
        throw new WorkspaceError(
          409,
          "Сданный наряд может вернуть на исправление руководитель",
        );
      const immutable = (o: SavedWorkOrder) => ({
        ...o,
        submittedAt: null,
        draft: {
          ...o.draft,
          reportedPeople: null,
          rows: o.draft.rows.map((r) => ({
            ...r,
            actual: null,
            verifiedActual: r.verifiedActual ?? null,
            verificationBasis: r.verificationBasis ?? "",
            verifiedAt: r.verifiedAt ?? "",
            verifiedBy: r.verifiedBy ?? "",
            completed: false,
          })),
          crew: o.draft.crew.map((r) => ({
            ...r,
            start: "",
            end: "",
            breakMinutes: 0,
            startSignatureNoteId: null,
            endSignatureNoteId: null,
            startSignatureStatus: "unchecked" as const,
            endSignatureStatus: "unchecked" as const,
          })),
        },
      });
      if (!isDeepStrictEqual(immutable(current.order), immutable(incoming)))
        throw new WorkspaceError(
          403,
          "При сдаче можно менять только факт, выполнение и фактическое время. План изменяет руководитель с указанием причины.",
        );
      if (incoming.submittedAt) {
        const errors = handoffErrors(incoming);
        if (errors.length) throw new WorkspaceError(400, errors.join("; "));
      }
      for (const row of incoming.draft.rows) {
        const previous = current.order.draft.rows.find((r) => r.id === row.id);
        if (previous && previous.actual !== row.actual) {
          row.verifiedActual = null;
          row.verificationBasis = "";
          row.verifiedAt = "";
          row.verifiedBy = "";
        }
      }
      this.validateSignatures(incoming);
      const order = {
        ...incoming,
        submittedAt: incoming.submittedAt ? now() : null,
      };
      return this.write(
        user,
        order,
        current.revision + 1,
        order.submittedAt ? "submitted" : "issued",
        order.submittedAt ? "submitted" : "progress-saved",
      );
    });
  }
  private inheritSignatureChecks(
    order: SavedWorkOrder,
    previous: SavedWorkOrder,
  ) {
    if (order.draft.reportedPeople === undefined)
      order.draft.reportedPeople = previous.draft.reportedPeople;
    for (const row of order.draft.rows) {
      const old = previous.draft.rows.find((r) => r.id === row.id);
      if (!old) continue;
      for (const key of [
        "verifiedActual",
        "verificationBasis",
        "verifiedAt",
        "verifiedBy",
      ] as const) {
        if (row[key] === undefined) Object.assign(row, { [key]: old[key] });
      }
    }
    for (const person of order.draft.crew) {
      const old = previous.draft.crew.find((p) => p.id === person.id);
      if (!old) continue;
      if (person.startSignatureStatus === undefined)
        person.startSignatureStatus =
          person.startSignatureNoteId !== undefined &&
          person.startSignatureNoteId !== old.startSignatureNoteId
            ? person.startSignatureNoteId
              ? "present"
              : "unchecked"
            : old.startSignatureStatus;
      if (person.endSignatureStatus === undefined)
        person.endSignatureStatus =
          person.endSignatureNoteId !== undefined &&
          person.endSignatureNoteId !== old.endSignatureNoteId
            ? person.endSignatureNoteId
              ? "present"
              : "unchecked"
            : old.endSignatureStatus;
      if (person.startSignatureNoteId === undefined)
        person.startSignatureNoteId = old.startSignatureNoteId;
      if (person.endSignatureNoteId === undefined)
        person.endSignatureNoteId = old.endSignatureNoteId;
    }
  }
  saveSignatureChecks(
    user: WorkspaceUser,
    id: string,
    revision: number,
    checks: {
      id: string;
      startSignatureNoteId: string | null;
      endSignatureNoteId: string | null;
      startSignatureStatus?: SignatureStatus;
      endSignatureStatus?: SignatureStatus;
    }[],
  ) {
    if (user.role === "viewer")
      throw new WorkspaceError(403, "Доступен только просмотр");
    return this.transaction(() => {
      const current = this.get(user, id);
      if (current.revision !== revision)
        throw new WorkspaceError(
          409,
          "Наряд изменён другим пользователем. Загрузите актуальную версию.",
        );
      if (current.stage === "accepted")
        throw new WorkspaceError(
          409,
          "Для изменения принятого наряда руководитель должен вернуть его в работу",
        );
      if (current.stage === "submitted" && user.role !== "admin")
        throw new WorkspaceError(
          403,
          "После сдачи проверку подписей выполняет руководитель",
        );
      if (
        checks.length !== current.order.draft.crew.length ||
        new Set(checks.map((p) => p.id)).size !== checks.length ||
        checks.some(
          (p) => !current.order.draft.crew.some((person) => person.id === p.id),
        )
      )
        throw new WorkspaceError(
          400,
          "Проверка должна относиться к сотрудникам этого наряда",
        );
      const order = {
        ...current.order,
        draft: {
          ...current.order.draft,
          crew: current.order.draft.crew.map((person) => {
            const check = checks.find((p) => p.id === person.id)!;
            return {
              ...person,
              startSignatureNoteId: check.startSignatureNoteId,
              endSignatureNoteId: check.endSignatureNoteId,
              startSignatureStatus:
                check.startSignatureStatus ??
                (check.startSignatureNoteId
                  ? ("present" as const)
                  : ("unchecked" as const)),
              endSignatureStatus:
                check.endSignatureStatus ??
                (check.endSignatureNoteId
                  ? ("present" as const)
                  : ("unchecked" as const)),
            };
          }),
        },
      };
      this.validateSignatures(order);
      return this.write(
        user,
        order,
        current.revision + 1,
        current.stage,
        "signatures-verified",
      );
    });
  }
  saveReview(
    user: WorkspaceUser,
    id: string,
    input: z.infer<typeof reviewSchema>,
  ) {
    admin(user);
    input = reviewSchema.parse(input);
    return this.transaction(() => {
      const current = this.get(user, id);
      if (current.revision !== input.revision)
        throw new WorkspaceError(
          409,
          "Наряд изменён. Загрузите актуальную версию.",
        );
      if (current.stage === "accepted")
        throw new WorkspaceError(
          409,
          "Сначала верните принятый наряд в работу.",
        );
      if (
        input.rows.length !== current.order.draft.rows.length ||
        new Set(input.rows.map((r) => r.id)).size !== input.rows.length ||
        input.rows.some(
          (r) => !current.order.draft.rows.some((old) => old.id === r.id),
        )
      )
        throw new WorkspaceError(
          400,
          "Проверка должна относиться к строкам этого наряда.",
        );
      if (input.rows.some((r) => r.value !== null && r.basis.trim().length < 3))
        throw new WorkspaceError(
          400,
          "Укажите основание каждого проверенного объёма.",
        );
      const order = {
        ...current.order,
        draft: {
          ...current.order.draft,
          rows: current.order.draft.rows.map((row) => {
            const check = input.rows.find((r) => r.id === row.id)!;
            return {
              ...row,
              verifiedActual: check.value,
              verificationBasis: check.basis,
              verifiedAt: now(),
              verifiedBy: `${user.name} (${user.username})`,
            };
          }),
        },
      };
      return this.write(
        user,
        order,
        current.revision + 1,
        current.stage,
        "volumes-verified",
      );
    });
  }
  addAdditional(
    user: WorkspaceUser,
    id: string,
    input: z.infer<typeof additionalSchema>,
  ) {
    if (user.role === "viewer")
      throw new WorkspaceError(403, "Доступен только просмотр");
    input = additionalSchema.parse(input);
    return this.transaction(() => {
      const current = this.get(user, id);
      if (current.revision !== input.revision)
        throw new WorkspaceError(
          409,
          "Наряд изменён. Загрузите актуальную версию.",
        );
      if (current.stage !== "issued")
        throw new WorkspaceError(
          409,
          "Сначала верните сданный наряд в работу для добавления работ.",
        );
      const row = manualWorkRow(
        current.order.draft,
        input.work,
        input.unit,
        input.target,
      );
      row.additional = {
        basis: input.basis,
        addedAt: now(),
        addedBy: `${user.name} (${user.username})`,
      };
      const order = savedSchema.parse({
        ...current.order,
        draft: {
          ...current.order.draft,
          rows: [...current.order.draft.rows, row],
        },
      });
      return this.write(
        user,
        order,
        current.revision + 1,
        current.stage,
        "additional-work",
        input.basis,
      );
    });
  }
  validateSignatures(order: SavedWorkOrder) {
    for (const person of order.draft.crew)
      for (const phase of ["start", "end"] as SignaturePhase[]) {
        const noteId = person[signatureFields[phase]];
        const status = signatureStatus(person, phase);
        if (status !== "unchecked" && !noteId)
          throw new WorkspaceError(
            400,
            `${person.name}: для проверки подписи выберите фото листа`,
          );
        if (!noteId) continue;
        if (!person[phase] && status === "present")
          throw new WorkspaceError(
            400,
            `${person.name}: укажите время ${phase === "start" ? "выхода" : "окончания"} перед подтверждением подписи`,
          );
        const note = this.db
          .prepare(
            "SELECT n.* FROM notes n JOIN images i ON i.id=n.image_id AND i.note_id=n.id WHERE n.id=?",
          )
          .get(noteId);
        if (
          !note ||
          note.order_id !== order.id ||
          note.element_id !== order.id ||
          note.model !== signatureModels[phase] ||
          note.brigade !== order.draft.brigade
        )
          throw new WorkspaceError(
            400,
            `${person.name}: выберите фото подписного листа этой смены для ${phase === "start" ? "выхода" : "окончания"}`,
          );
      }
  }
  action(
    user: WorkspaceUser,
    id: string,
    revision: number,
    action: "accept" | "reopen" | "replan",
    reason: string,
    raw?: unknown,
  ) {
    admin(user);
    return this.transaction(() => {
      const current = this.get(user, id);
      if (current.revision !== revision)
        throw new WorkspaceError(409, "Запись уже изменена. Обновите список.");
      if (action === "accept") {
        this.validateSignatures(current.order);
        if (current.stage !== "submitted")
          throw new WorkspaceError(400, "Сначала бригадир должен сдать наряд");
        return this.write(
          user,
          current.order,
          revision + 1,
          "accepted",
          "accepted",
        );
      }
      if (reason.trim().length < 3)
        throw new WorkspaceError(400, "Укажите причину исправления");
      const order =
        action === "replan"
          ? savedSchema.parse(raw)
          : { ...current.order, submittedAt: null };
      this.inheritSignatureChecks(order, current.order);
      if (order.id !== id || order.createdAt !== current.order.createdAt)
        throw new WorkspaceError(400, "Некорректный снимок наряда");
      if (action === "replan" && current.stage !== "issued")
        throw new WorkspaceError(400, "Сначала верните наряд на исправление");
      const errors = [
        ...reportErrors(order.draft),
        ...allocationErrors(order, this.list(user)),
      ];
      if (errors.length) throw new WorkspaceError(409, errors.join("; "));
      this.validateSignatures(order);
      return this.write(
        user,
        { ...order, submittedAt: null },
        revision + 1,
        "issued",
        action,
        reason.trim(),
      );
    });
  }
  history(user: WorkspaceUser, id: string): WorkEvent[] {
    this.get(user, id);
    return this.db
      .prepare("SELECT * FROM events WHERE order_id=? ORDER BY id DESC")
      .all(id)
      .map((r) => ({
        id: Number(r.id),
        orderId: String(r.order_id),
        revision: Number(r.revision),
        action: String(r.action),
        reason: String(r.reason),
        actor: String(r.actor),
        createdAt: String(r.created_at),
        snapshot: r.snapshot
          ? savedSchema.parse(JSON.parse(String(r.snapshot)))
          : null,
      }));
  }
  importLocal(user: WorkspaceUser, orders: SavedWorkOrder[]) {
    admin(user);
    return this.transaction(() => {
      let imported = 0;
      for (const raw of orders) {
        const order = savedSchema.parse(raw);
        if (this.db.prepare("SELECT id FROM orders WHERE id=?").get(order.id))
          continue;
        const errors = reportErrors(order.draft);
        if (errors.length) throw new WorkspaceError(400, errors.join("; "));
        this.validateSignatures(order);
        this.write(
          user,
          order,
          1,
          order.submittedAt ? "submitted" : "issued",
          "imported-local",
          "Снимок перенесён из браузера, исходные факты сохранены",
        );
        imported++;
      }
      return imported;
    });
  }
  draft(user: WorkspaceUser) {
    const r = this.db
      .prepare("SELECT * FROM drafts WHERE user_id=?")
      .get(user.id);
    return r
      ? {
          draft: JSON.parse(String(r.payload)),
          revision: Number(r.revision),
          updatedAt: String(r.updated_at),
        }
      : { draft: null, revision: 0, updatedAt: null };
  }
  saveDraft(user: WorkspaceUser, draft: unknown, revision: number) {
    admin(user);
    const parsed = savedSchema.shape.draft.parse(draft);
    return this.transaction(() => {
      const current = this.draft(user);
      if (current.revision !== revision)
        throw new WorkspaceError(
          409,
          "Черновик изменён в другом окне. Ваши изменения оставлены на экране; обновите черновик перед дальнейшей работой.",
        );
      const updatedAt = now();
      this.db
        .prepare(
          "INSERT INTO drafts VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_at=excluded.updated_at",
        )
        .run(user.id, JSON.stringify(parsed), revision + 1, updatedAt);
      return { draft: parsed, revision: revision + 1, updatedAt };
    });
  }
  async snapshot() {
    const filename = `buildscope-${now().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}.sqlite`;
    await backup(this.db, join(this.backups, filename));
    await chmod(join(this.backups, filename), 0o600);
    const files = (await readdir(this.backups))
      .filter((n) => /^buildscope-[\w.-]+\.sqlite$/.test(n))
      .sort()
      .reverse();
    for (const name of files.slice(30)) await unlink(join(this.backups, name));
    return filename;
  }
  close() {
    this.db.close();
  }
}
