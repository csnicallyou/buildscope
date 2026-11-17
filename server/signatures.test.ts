import { beforeAll, afterAll, it, expect } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Server } from "node:http";
import { WorkspaceDatabase } from "./database";
import { createWorkspaceServer } from "./http";
import {
  initialWorkDraft,
  addWork,
  workTargets,
  crewHours,
} from "../src/workOrders";
import {
  issueWorkOrder,
  submitWorkOrder,
  serializeWorkOrders,
  parseWorkOrders,
  type SavedWorkOrder,
} from "../src/workOrderArchive";
import { createKzh } from "../src/kzh";
import { signatureModels } from "../src/signatures";
import type { SharedOrder } from "../src/workspaceTypes";
let db: WorkspaceDatabase,
  server: Server,
  url: string,
  entry: SharedOrder,
  other: SharedOrder;
const cookies = new Map<string, string>();
const password = "Synthetic-signatures-1234!";
const image = {
  mime: "image/png",
  base64:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
};
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  role = "admin",
) {
  return fetch(url + path, {
    method,
    headers: {
      Origin: url,
      Cookie: cookies.get(role) ?? "",
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}
async function save(order: SavedWorkOrder) {
  return request(
    "/api/orders",
    "POST",
    { order, revision: entry.revision },
    "foreman",
  );
}
const project = createKzh("canopy"),
  targets = workTargets(project, null).filter(
    (t) => t.elements[0]?.mark === "Фм1",
  );
function makeOrder(index = 0) {
  const draft = initialWorkDraft();
  draft.shift = "Ночь";
  draft.rows.push(addWork(draft, targets[index], "concrete", project)!);
  draft.crew.push({
    id: "employee",
    date: draft.date,
    site: draft.site,
    shift: draft.shift,
    contractor: "",
    name: "Тестовый сотрудник",
    start: "",
    end: "",
    breakMinutes: 60,
    note: "",
  });
  return issueWorkOrder(draft);
}
beforeAll(async () => {
  await mkdir(".deploy/tests", { recursive: true });
  const temp = await mkdtemp(resolve(".deploy/tests/signatures-"));
  db = await WorkspaceDatabase.open(resolve(temp, "workspace.sqlite"));
  const web = resolve(temp, "web");
  await mkdir(web);
  await writeFile(resolve(web, "index.html"), "synthetic fixture");
  const admin = await db.addUser(null, {
    username: "admin",
    name: "Руководитель",
    role: "admin",
    brigade: null,
    password,
  });
  for (const role of ["foreman", "viewer", "other"] as const)
    await db.addUser(admin, {
      username: role,
      name: role,
      role: role === "viewer" ? "viewer" : "foreman",
      brigade: role === "other" ? "Другая бригада" : "Наша бригада",
      password,
    });
  server = await createWorkspaceServer({ store: db, webRoot: web });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No port");
  url = `http://127.0.0.1:${address.port}`;
  for (const role of ["admin", "foreman", "viewer", "other"]) {
    const response = await request("/api/login", "POST", {
      username: role,
      password,
    });
    cookies.set(role, response.headers.get("set-cookie")!.split(";")[0]);
  }
  for (const index of [0, 1]) {
    const response = await request("/api/orders", "POST", {
      order: makeOrder(index),
      revision: null,
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { saved: SharedOrder };
    if (index === 0) entry = result.saved;
    else other = result.saved;
  }
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
});
let startNote: string, endNote: string;
const photo = (order: SharedOrder, phase: "start" | "end") => ({
  model: signatureModels[phase],
  elementId: order.order.id,
  orderId: order.order.id,
  brigade: "Наша бригада",
  text: "Подписной лист",
  image,
});
it("старые архивы совместимы, новая выдача обнуляет отметки прошлой смены", () => {
  const draft = makeOrder().draft;
  draft.crew[0].startSignatureNoteId = "past";
  draft.crew[0].endSignatureNoteId = "past";
  const fresh = issueWorkOrder(draft);
  expect(fresh.draft.crew[0].startSignatureNoteId).toBeNull();
  expect(fresh.draft.crew[0].endSignatureNoteId).toBeNull();
  const restored = parseWorkOrders(serializeWorkOrders([entry.order]))[0];
  expect(restored.draft.crew[0].name).toBe("Тестовый сотрудник");
});
it("фото обязательно, чужая бригада и просмотр не загружают листы", async () => {
  expect(
    (
      await request(
        "/api/notes",
        "POST",
        { ...photo(entry, "start"), image: null },
        "foreman",
      )
    ).status,
  ).toBe(400);
  expect(
    (await request("/api/notes", "POST", photo(entry, "start"), "viewer"))
      .status,
  ).toBe(403);
  expect(
    (await request("/api/notes", "POST", photo(entry, "start"), "other"))
      .status,
  ).toBe(404);
  const response = await request(
    "/api/notes",
    "POST",
    photo(entry, "start"),
    "foreman",
  );
  expect(response.status).toBe(201);
  startNote = ((await response.json()) as { id: string }).id;
});
it("галочка требует реального фото своей смены и времени выхода", async () => {
  const changed = structuredClone(entry.order);
  changed.draft.crew[0].startSignatureNoteId = "missing";
  changed.draft.crew[0].start = "20:00";
  expect((await save(changed)).status).toBe(400);
  changed.draft.crew[0].startSignatureNoteId = startNote;
  changed.draft.crew[0].start = "";
  expect((await save(changed)).status).toBe(400);
  changed.draft.crew[0].start = "20:00";
  const response = await save(changed);
  expect(response.status).toBe(200);
  entry = ((await response.json()) as { saved: SharedOrder }).saved;
});
it("сохранение из старого клиента не стирает уже проверенные подписи", async () => {
  const oldClient = structuredClone(entry.order);
  delete oldClient.draft.crew[0].startSignatureNoteId;
  delete oldClient.draft.crew[0].endSignatureNoteId;
  oldClient.draft.rows[0].actual = 0.2;
  const response = await save(oldClient);
  expect(response.status).toBe(200);
  entry = ((await response.json()) as { saved: SharedOrder }).saved;
  expect(entry.order.draft.crew[0].startSignatureNoteId).toBe(startNote);
  expect(entry.order.draft.rows[0].actual).toBe(0.2);
});
it("фото выхода не подтверждает окончание, фото другого наряда не принимается", async () => {
  const foreign = await request(
    "/api/notes",
    "POST",
    photo(other, "end"),
    "foreman",
  );
  const foreignId = ((await foreign.json()) as { id: string }).id;
  const changed = structuredClone(entry.order);
  changed.draft.crew[0].end = "08:00";
  changed.draft.crew[0].breakMinutes = 60;
  for (const id of [startNote, foreignId]) {
    changed.draft.crew[0].endSignatureNoteId = id;
    expect((await save(changed)).status).toBe(400);
  }
  const response = await request(
    "/api/notes",
    "POST",
    photo(entry, "end"),
    "admin",
  );
  expect(response.status).toBe(201);
  endNote = ((await response.json()) as { id: string }).id;
  changed.draft.crew[0].endSignatureNoteId = endNote;
  changed.draft.rows[0].actual = 1;
  const saved = await save(changed);
  expect(saved.status).toBe(200);
  entry = ((await saved.json()) as { saved: SharedOrder }).saved;
  expect(crewHours(entry.order.draft.crew[0])).toBe(11);
});
it("подписные листы доступны своей бригаде и входят в историю проверок", async () => {
  const path = `/api/notes?model=${signatureModels.start}&element=${entry.order.id}`;
  expect((await request(path, "GET", undefined, "other")).status).toBe(404);
  const response = await request(path, "GET", undefined, "viewer");
  const result = (await response.json()) as { notes: { imageId: string }[] };
  expect(result.notes).toHaveLength(1);
  expect(
    (
      await request(
        `/api/images/${result.notes[0].imageId}`,
        "GET",
        undefined,
        "viewer",
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        `/api/images/${result.notes[0].imageId}`,
        "GET",
        undefined,
        "other",
      )
    ).status,
  ).toBe(404);
  const history = db.history(
    db.session(cookies.get("admin")!.split("=")[1])!,
    entry.order.id,
  );
  expect(
    history.some(
      (e) => e.snapshot?.draft.crew[0].endSignatureNoteId === endNote,
    ),
  ).toBe(true);
});
it("бригадир после сдачи не меняет листы, перенос сбрасывает проверки", async () => {
  const response = await save(
    submitWorkOrder({ ...entry.order, serverRevision: entry.revision }),
  );
  expect(response.status).toBe(200);
  entry = ((await response.json()) as { saved: SharedOrder }).saved;
  expect(
    (await request("/api/notes", "POST", photo(entry, "end"), "foreman"))
      .status,
  ).toBe(403);
  const carry = await request(
    `/api/orders/${entry.order.id}/carryover`,
    "POST",
    { date: "2026-11-18", shift: "День", brigade: "Наша бригада" },
  );
  expect(carry.status).toBe(200);
  const value = (await carry.json()) as { draft: SavedWorkOrder["draft"] };
  expect(value.draft.crew[0].startSignatureNoteId).toBeNull();
  expect(value.draft.crew[0].endSignatureNoteId).toBeNull();
  expect(value.draft.crew[0].start).toBe("");
});
it("руководитель проверяет сданный отчёт отдельно от факта, принятый отчёт закрыт", async () => {
  const path = `/api/orders/${entry.order.id}/signatures`,
    before = structuredClone(entry.order);
  const payload = {
    revision: entry.revision,
    checks: entry.order.draft.crew.map((p) => ({
      id: p.id,
      startSignatureNoteId: startNote,
      endSignatureNoteId: endNote,
    })),
    actual: 999,
  };
  for (const role of ["foreman", "viewer"])
    expect((await request(path, "PUT", payload, role)).status).toBe(403);
  expect((await request(path, "PUT", { ...payload, checks: [] })).status).toBe(
    400,
  );
  expect(
    (
      await request(path, "PUT", {
        ...payload,
        checks: [{ ...payload.checks[0], endSignatureNoteId: startNote }],
      })
    ).status,
  ).toBe(400);
  expect(
    (await request("/api/notes", "POST", photo(entry, "end"), "admin")).status,
  ).toBe(201);
  const saved = await request(path, "PUT", payload);
  expect(saved.status).toBe(200);
  entry = ((await saved.json()) as { saved: SharedOrder }).saved;
  expect(entry.stage).toBe("submitted");
  expect(entry.order.draft.rows).toEqual(before.draft.rows);
  expect(entry.order.draft.crew[0].start).toBe("20:00");
  expect(entry.order.submittedAt).toBe(before.submittedAt);
  expect((await request(path, "PUT", payload)).status).toBe(409);
  const accept = await request(`/api/orders/${entry.order.id}/action`, "POST", {
    action: "accept",
    revision: entry.revision,
  });
  expect(accept.status).toBe(200);
  entry = ((await accept.json()) as { saved: SharedOrder }).saved;
  expect(
    (await request(path, "PUT", { ...payload, revision: entry.revision }))
      .status,
  ).toBe(409);
  expect(
    (await request("/api/notes", "POST", photo(entry, "end"))).status,
  ).toBe(409);
});
