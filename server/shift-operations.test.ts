import { beforeAll, afterAll, it, expect } from "vitest";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { WorkspaceDatabase } from "./database";
import { ConstructionStore } from "./construction-store";
import type { WorkspaceUser } from "../src/workspaceTypes";
import { initialWorkDraft } from "../src/workOrders";
import { issueWorkOrder } from "../src/workOrderArchive";
import { manualWorkRow } from "../src/orderReview";
import {
  blankPayload,
  type Payload,
  type ConstructionRecord,
} from "../src/construction";
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
  brigade: "Тестовая бригада",
};
const other: WorkspaceUser = {
  ...foreman,
  id: "other",
  brigade: "Другая бригада",
};
let db: WorkspaceDatabase, store: ConstructionStore;
beforeAll(async () => {
  await mkdir(".deploy/tests", { recursive: true });
  const dir = await mkdtemp(resolve(".deploy/tests/operations-"));
  db = await WorkspaceDatabase.open(resolve(dir, "workspace.sqlite"));
  store = new ConstructionStore(db);
});
afterAll(() => db.close());
const order = () => {
  const d = {
    ...initialWorkDraft(),
    brigade: foreman.brigade!,
    date: "2026-11-17",
  };
  d.rows = [manualWorkRow(d, "Тестовая работа", "м³", "Участок", 5)];
  return db.save(admin, issueWorkOrder(d), null);
};
it("проверенный ноль отделён от заявленного, защищён правами и ревизией, новое сообщение сбрасывает проверку", () => {
  let e = order();
  const changed = structuredClone(e.order);
  changed.draft.rows[0].actual = 2;
  e = db.save(foreman, changed, e.revision);
  const checks = [
    { id: e.order.draft.rows[0].id, value: 0, basis: "Контрольный замер" },
  ];
  expect(() =>
    db.saveReview(foreman, e.order.id, { revision: e.revision, rows: checks }),
  ).toThrow();
  expect(() =>
    db.saveReview(admin, e.order.id, {
      revision: e.revision - 1,
      rows: checks,
    }),
  ).toThrow(/изменён/);
  expect(() =>
    db.saveReview(admin, e.order.id, {
      revision: e.revision,
      rows: [{ ...checks[0], value: -1 }],
    }),
  ).toThrow();
  e = db.saveReview(admin, e.order.id, { revision: e.revision, rows: checks });
  expect(e.order.draft.rows[0].actual).toBe(2);
  expect(e.order.draft.rows[0].verifiedActual).toBe(0);
  const forged = structuredClone(e.order);
  forged.draft.rows[0].verifiedActual = 4;
  expect(() => db.save(foreman, forged, e.revision)).toThrow(/только факт/);
  const next = structuredClone(e.order);
  next.draft.rows[0].actual = 3;
  e = db.save(foreman, next, e.revision);
  expect(e.order.draft.rows[0].verifiedActual).toBeNull();
  expect(
    db.history(admin, e.order.id).some((x) => x.action === "volumes-verified"),
  ).toBe(true);
});
it("дополнительные работы добавляются без изменения исходного плана и недоступны чужой бригаде", () => {
  let e = order();
  const original = structuredClone(e.order.draft.rows[0]);
  const fields = {
    revision: e.revision,
    work: "Дополнительная работа",
    unit: "шт.",
    basis: "Указание координатора на участке",
    target: "Оси А–Б",
  };
  expect(() => db.addAdditional(other, e.order.id, fields)).toThrow();
  e = db.addAdditional(foreman, e.order.id, fields);
  expect(e.order.draft.rows[0]).toEqual(original);
  expect(e.order.draft.rows[1].plan).toBeNull();
  expect(e.order.draft.rows[1].additional?.basis).toContain("Указание");
  const submitted = { ...e.order, submittedAt: new Date().toISOString() };
  e = db.save(foreman, submitted, e.revision);
  expect(() =>
    db.addAdditional(admin, e.order.id, { ...fields, revision: e.revision }),
  ).toThrow(/верните/);
});
const payload = (kind: Payload["kind"], extra: object): Payload =>
  ({
    ...blankPayload(kind, "2026-11-17", null, foreman.brigade!),
    title: `Тест ${kind}`,
    ...extra,
  }) as Payload;
const save = (p: Payload, r: ConstructionRecord | null = null) =>
  store.save(admin, p, r?.id ?? null, r?.revision ?? null);
it("путевые листы хранят независимые часы и оригинал, проверяют даты и бригаду", () => {
  const m = save(
    payload("machine", { plate: "ТЕСТ-001", owner: "Тестовый собственник" }),
  );
  let w = save(
    payload("waybill", {
      machineId: m.id,
      source: "Бумажный лист",
      hours: 12,
      startAt: "2026-11-17T20:00",
      endAt: "2026-11-18T08:00",
      allocations: [{ nodeId: null, work: "Тестовая работа", hours: 8 }],
    }),
  );
  expect(() => save({ ...w.payload, status: "checked" } as Payload, w)).toThrow(
    /оригинал/,
  );
  w = store.attach(
    admin,
    w.id,
    w.revision,
    "synthetic.pdf",
    Buffer.from("%PDF-1.4\nsynthetic"),
  );
  w = save({ ...w.payload, status: "checked" } as Payload, w);
  expect(w.payload.kind === "waybill" && w.payload.hours).toBe(12);
  expect(() =>
    save({ ...w.payload, endAt: "2026-11-17T08:00" } as Payload, w),
  ).toThrow(/позже/);
  expect(store.list(other).some((r) => r.id === w.id)).toBe(false);
  expect(() =>
    store.attach(
      admin,
      w.id,
      w.revision,
      "overwrite.pdf",
      Buffer.from("%PDF-test"),
    ),
  ).toThrow(/редакцию/);
});
it("заявка проходит согласование перед заказом, а доставка не подменяет складской расход", () => {
  let r = save(
    payload("request", {
      source: "Сообщение подрядчика",
      quantity: 3,
      unit: "м³",
    }),
  );
  expect(() => save({ ...r.payload, status: "ordered" } as Payload, r)).toThrow(
    /согласуйте/,
  );
  r = save({ ...r.payload, status: "approved" } as Payload, r);
  r = save({ ...r.payload, status: "ordered" } as Payload, r);
  r = save({ ...r.payload, status: "received" } as Payload, r);
  expect(store.all().filter((x) => x.payload.kind === "movement")).toHaveLength(
    0,
  );
  expect(store.history(admin, r.id)).toHaveLength(4);
});
