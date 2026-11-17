import { beforeAll, afterAll, it, expect } from "vitest";
import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { WorkspaceDatabase } from "./database";
import { ConstructionStore } from "./construction-store";
import {
  blankPayload,
  inventory,
  type Payload,
  type ConstructionRecord,
} from "../src/construction";
import type { WorkspaceUser } from "../src/workspaceTypes";
let db: WorkspaceDatabase, store: ConstructionStore, path: string;
const admin: WorkspaceUser = {
  id: "admin",
  username: "admin",
  name: "Тест",
  role: "admin",
  brigade: null,
  active: true,
};
const foreman: WorkspaceUser = {
  ...admin,
  id: "foreman",
  username: "foreman",
  role: "foreman",
  brigade: "Бригада 1",
};
const viewer: WorkspaceUser = { ...foreman, role: "viewer" };
const other: WorkspaceUser = { ...foreman, id: "other", brigade: "Бригада 2" };
const date = "2026-11-17";
const payload = (kind: Payload["kind"], patch: object = {}): Payload =>
  ({
    ...blankPayload(kind, date, null, "Бригада 1"),
    title: `Тест ${kind}`,
    ...patch,
  }) as Payload;
const save = (p: Payload, r: ConstructionRecord | null = null, user = admin) =>
  store.save(user, p, r?.id ?? null, r?.revision ?? null);
let site: ConstructionRecord,
  object: ConstructionRecord,
  task: ConstructionRecord,
  prior: ConstructionRecord,
  issue: ConstructionRecord;
beforeAll(async () => {
  await mkdir(".deploy/tests", { recursive: true });
  path = resolve(
    await mkdtemp(resolve(".deploy/tests/management-")),
    "workspace.sqlite",
  );
  db = await WorkspaceDatabase.open(path);
  store = new ConstructionStore(db);
});
afterAll(() => db.close());
it("миграция v1 сохраняет данные и добавляет структуру v2 повторяемо", async () => {
  db.db
    .prepare(
      "INSERT INTO users VALUES('m','migration','Существующий','admin',NULL,1,'not-a-password')",
    )
    .run();
  db.db.exec(
    "DROP TABLE construction_files; DROP TABLE construction_events; DROP TABLE construction_records; PRAGMA user_version=1;",
  );
  db.close();
  db = await WorkspaceDatabase.open(path);
  store = new ConstructionStore(db);
  expect(db.db.prepare("PRAGMA user_version").get()?.user_version).toBe(2);
  expect(db.db.prepare("SELECT name FROM users WHERE id='m'").get()?.name).toBe(
    "Существующий",
  );
});
it("иерархия, права и версии защищают структуру от потери правок", () => {
  site = save(payload("node", { level: "site" }));
  object = save(
    payload("node", { title: "Объект", level: "object", parentId: site.id }),
  );
  expect(() =>
    save({ ...site.payload, parentId: object.id } as Payload, site),
  ).toThrow();
  expect(() => save(payload("node"), null, foreman)).toThrow();
  expect(() => save(payload("node"), null, viewer)).toThrow();
  const next = save(
    { ...site.payload, title: "Новая стройка" } as Payload,
    site,
  );
  expect(() => save(site.payload, site)).toThrow(/изменена/);
  site = next;
  expect(store.history(admin, site.id)).toHaveLength(2);
});
it("предшествующие задачи, циклы и критические замечания блокируют запуск", () => {
  prior = save(payload("task", { title: "Подготовка", nodeId: object.id }));
  task = save(
    payload("task", {
      title: "Бетонирование",
      nodeId: object.id,
      dependsOn: [prior.id],
    }),
  );
  expect(() =>
    save({ ...task.payload, status: "active" } as Payload, task),
  ).toThrow(/предшествующие/);
  expect(() =>
    save({ ...prior.payload, dependsOn: [task.id] } as Payload, prior),
  ).toThrow(/цепочку/);
  prior = save({ ...prior.payload, status: "done" } as Payload, prior, foreman);
  issue = save(
    payload("issue", {
      title: "Основание не принято",
      nodeId: object.id,
      owner: "Ответственный",
      severity: "critical",
    }),
  );
  expect(() =>
    save({ ...task.payload, status: "active" } as Payload, task),
  ).toThrow(/замечания/);
  expect(() =>
    save(
      { ...issue.payload, status: "closed", evidence: "Проверено" } as Payload,
      issue,
      foreman,
    ),
  ).toThrow();
  expect(() =>
    save({ ...issue.payload, status: "corrected" } as Payload, issue, foreman),
  ).toThrow(/подтверждение/);
  issue = save(
    {
      ...issue.payload,
      status: "corrected",
      evidence: "Доработано, фото в привязанной конструкции",
    } as Payload,
    issue,
    foreman,
  );
  issue = save({ ...issue.payload, status: "closed" } as Payload, issue);
  expect(() =>
    save({ ...issue.payload, status: "open" } as Payload, issue, foreman),
  ).toThrow(/руководитель/);
  task = save({ ...task.payload, status: "active" } as Payload, task, foreman);
  expect(task.payload.kind === "task" && task.payload.status).toBe("active");
});
it("бригадир не изменяет сроки и не читает чужую бригаду", () => {
  expect(() =>
    save({ ...task.payload, end: "2027-01-01" } as Payload, task, foreman),
  ).toThrow(/план/);
  const foreign = save(
    payload("task", { title: "Другая работа", brigade: "Бригада 2" }),
  );
  expect(() => store.get(foreman, foreign.id)).toThrow();
  expect(() => store.get(other, task.id)).toThrow();
  expect(store.list(viewer).some((r) => r.id === foreign.id)).toBe(false);
});
it("материалы разделяются по единицам и участкам, расход и отмена не делают отрицательный остаток", () => {
  const receipt = save(
    payload("movement", {
      title: "Щебень",
      nodeId: object.id,
      quantity: 10,
      basis: "Накладная 1",
    }),
  );
  save(
    payload("movement", {
      title: "Щебень",
      nodeId: object.id,
      quantity: 2,
      unit: "т",
      basis: "Накладная 2",
    }),
  );
  save(
    payload("movement", {
      title: "Щебень",
      nodeId: object.id,
      direction: "consume",
      quantity: 3,
      basis: "Запись расхода",
    }),
  );
  expect(
    inventory(store.list(admin)).find((r) => r.unit === "м³")?.balance,
  ).toBe(7);
  expect(
    inventory(store.list(admin)).find((r) => r.unit === "т")?.balance,
  ).toBe(2);
  expect(() =>
    save(
      payload("movement", {
        title: "Щебень",
        nodeId: object.id,
        direction: "consume",
        quantity: 8,
        basis: "Расход",
      }),
    ),
  ).toThrow(/остаток/);
  expect(() =>
    save(
      {
        ...receipt.payload,
        voided: true,
        reason: "Ошибка поставки",
      } as Payload,
      receipt,
    ),
  ).toThrow(/остаток/);
});
it("редакции документов и защищённые файлы сохраняются с SHA256 и историей", () => {
  let doc = save(
    payload("document", {
      title: "Чертёж 1",
      number: "КЖ-1",
      nodeId: object.id,
    }),
  );
  doc = store.attach(
    admin,
    doc.id,
    doc.revision,
    "synthetic.pdf",
    Buffer.from("%PDF-1.4\nsynthetic test fixture\n%%EOF"),
  );
  expect(doc.file?.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(store.file(viewer, doc.file!.id).record_id).toBe(doc.id);
  expect(() => store.file(other, doc.file!.id)).toThrow();
  expect(() =>
    store.attach(
      admin,
      doc.id,
      doc.revision,
      "evil.html",
      Buffer.from("<script>bad</script>"),
    ),
  ).toThrow();
  const revision = save({
    ...doc.payload,
    edition: "2",
    supersedes: doc.id,
  } as Payload);
  expect(() =>
    save({ ...doc.payload, edition: "3", supersedes: doc.id } as Payload),
  ).toThrow(/замена/);
  expect(store.history(admin, doc.id)).toHaveLength(2);
  expect(revision.payload.kind).toBe("document");
});
it("наряд привязывается к правильной задаче, смене и бригаде", () => {
  const draft = {
    taskId: task.id,
    nodeId: object.id,
    brigade: "Бригада 1",
    date,
    shift: "День",
  };
  expect(() => store.validateOrder(admin, draft)).not.toThrow();
  expect(() => store.validateOrder(admin, { ...draft, shift: "Ночь" })).toThrow(
    /соответствовать/,
  );
});
