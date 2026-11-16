import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdir, mkdtemp, writeFile, realpath, rm } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Server } from "node:http";
import { WorkspaceDatabase } from "./database";
import { createWorkspaceServer } from "./http";
import { createKzh } from "../src/kzh";
import { modelObjects } from "../src/objects";
import { initialWorkDraft, workTargets, addWork } from "../src/workOrders";
import { issueWorkOrder } from "../src/workOrderArchive";
import type { SharedOrder, WorkspaceUser } from "../src/workspaceTypes";
const passwords = {
  admin: "Synthetic-admin-1234!",
  foreman: "Synthetic-foreman-1234!",
  viewer: "Synthetic-viewer-1234!",
  other: "Synthetic-other-1234!",
};
let store: WorkspaceDatabase,
  server: Server,
  url: string,
  temp: string,
  admin: WorkspaceUser;
const cookies = new Map<string, string>();
async function request(
  path: string,
  method = "GET",
  value?: unknown,
  who = "admin",
) {
  return fetch(url + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: url,
      ...(cookies.has(who) ? { Cookie: cookies.get(who)! } : {}),
      ...(value !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}
async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
async function login(name: keyof typeof passwords) {
  const res = await request(
    "/api/login",
    "POST",
    { username: name, password: passwords[name] },
    "anonymous",
  );
  expect(res.status).toBe(200);
  cookies.set(name, res.headers.get("set-cookie")!.split(";")[0]);
  return res;
}
const project = createKzh("canopy"),
  root = modelObjects(project).find((o) => o.root.mark === "Фм1")!,
  target = workTargets(project, null).find(
    (t) => t.id === `object:${root.id}`,
  )!;
function order(plan?: number) {
  const d = initialWorkDraft();
  const row = addWork(d, target, "concrete", project)!;
  if (plan !== undefined) row.plan = plan;
  d.rows.push(row);
  return issueWorkOrder(d);
}
let first: SharedOrder;
beforeAll(async () => {
  const base = resolve(".deploy/tests");
  await mkdir(base, { recursive: true });
  temp = await mkdtemp(resolve(base, "workspace-"));
  const web = resolve(temp, "web");
  await mkdir(resolve(web, "assets"), { recursive: true });
  await writeFile(resolve(web, "index.html"), "BuildScope protected model");
  await writeFile(resolve(web, "assets/model.js"), "private model");
  store = await WorkspaceDatabase.open(resolve(temp, "data/workspace.sqlite"));
  admin = await store.addUser(null, {
    username: "admin",
    name: "Руководитель",
    password: passwords.admin,
    role: "admin",
    brigade: null,
  });
  for (const [username, role, brigade] of [
    ["foreman", "foreman", "Наша бригада"],
    ["viewer", "viewer", null],
    ["other", "foreman", "Другая бригада"],
  ] as const)
    await store.addUser(admin, {
      username,
      name: username,
      password: passwords[username],
      role,
      brigade,
    });
  server = await createWorkspaceServer({ store, webRoot: web });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No test listener");
  url = `http://127.0.0.1:${address.port}`;
  for (const name of Object.keys(passwords) as (keyof typeof passwords)[])
    await login(name);
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  store.close();
  const base = await realpath(resolve(".deploy/tests")),
    rel = relative(base, await realpath(temp));
  if (!rel || isAbsolute(rel) || rel.startsWith(".."))
    throw Error("Unsafe cleanup path");
  await rm(temp, { recursive: true, force: true });
});
describe("Общая база и авторизация", () => {
  it("не раскрывает модель и API без входа, защищает от CSRF и не хранит открытые пароли", async () => {
    expect(
      (await request("/assets/model.js", "GET", undefined, "anonymous")).status,
    ).toBe(401);
    const rootPage = await request("/", "GET", undefined, "anonymous");
    expect(rootPage.status).toBe(303);
    expect(rootPage.headers.get("location")).toBe("/login");
    const csrf = await fetch(url + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: passwords.admin }),
    });
    expect(csrf.status).toBe(403);
    const wrong = await request(
      "/api/login",
      "POST",
      { username: "' OR 1=1 --", password: "wrong" },
      "anonymous",
    );
    expect(wrong.status).toBe(401);
    const cookie = (await login("admin")).headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(
      String(
        store.db
          .prepare("SELECT password_hash FROM users WHERE id=?")
          .get(admin.id)!.password_hash,
      ),
    ).not.toContain(passwords.admin);
  });
  it("руководитель выдаёт наряд, бригадир видит свою бригаду, наблюдатель не пишет", async () => {
    first = (
      await json<{ saved: SharedOrder }>(
        await request("/api/orders", "POST", {
          order: order(),
          revision: null,
        }),
      )
    ).saved;
    expect(first.revision).toBe(1);
    expect(
      (
        await request(
          "/api/orders",
          "POST",
          { order: order(), revision: null },
          "foreman",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/api/orders",
          "POST",
          { order: first.order, revision: 1 },
          "viewer",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await json<{ orders: SharedOrder[] }>(
          await request("/api/orders", "GET", undefined, "foreman"),
        )
      ).orders,
    ).toHaveLength(1);
    expect(
      (
        await json<{ orders: SharedOrder[] }>(
          await request("/api/orders", "GET", undefined, "other"),
        )
      ).orders,
    ).toHaveLength(0);
    expect(
      (
        await request(
          `/api/orders/${first.order.id}/history`,
          "GET",
          undefined,
          "other",
        )
      ).status,
    ).toBe(404);
    expect(
      (await request("/api/users", "GET", undefined, "foreman")).status,
    ).toBe(403);
  });
  it("устаревшая версия не затирает факт и бригадир не меняет план", async () => {
    const changed = structuredClone(first.order);
    changed.draft.rows[0].actual = 1.2;
    const saved = await request(
      "/api/orders",
      "POST",
      { order: changed, revision: 1 },
      "foreman",
    );
    expect(saved.status).toBe(200);
    first = (await json<{ saved: SharedOrder }>(saved)).saved;
    const stale = structuredClone(changed);
    stale.draft.rows[0].actual = 1.3;
    expect(
      (
        await request(
          "/api/orders",
          "POST",
          { order: stale, revision: 1 },
          "foreman",
        )
      ).status,
    ).toBe(409);
    const forged = structuredClone(first.order);
    forged.draft.rows[0].plan = 100;
    expect(
      (
        await request(
          "/api/orders",
          "POST",
          { order: forged, revision: first.revision },
          "foreman",
        )
      ).status,
    ).toBe(403);
    expect(store.get(admin, first.order.id).order.draft.rows[0].actual).toBe(
      1.2,
    );
  });
  it("сдача, приёмка и возврат сохраняют автора, причины и прежние значения", async () => {
    const submitted = { ...first.order, submittedAt: new Date().toISOString() };
    first = (
      await json<{ saved: SharedOrder }>(
        await request(
          "/api/orders",
          "POST",
          { order: submitted, revision: first.revision },
          "foreman",
        ),
      )
    ).saved;
    expect(first.stage).toBe("submitted");
    expect(
      (
        await request(
          `/api/orders/${first.order.id}/action`,
          "POST",
          { action: "accept", revision: first.revision },
          "foreman",
        )
      ).status,
    ).toBe(403);
    first = (
      await json<{ saved: SharedOrder }>(
        await request(`/api/orders/${first.order.id}/action`, "POST", {
          action: "accept",
          revision: first.revision,
        }),
      )
    ).saved;
    expect(first.stage).toBe("accepted");
    expect(
      (
        await request(`/api/orders/${first.order.id}/action`, "POST", {
          action: "reopen",
          revision: first.revision,
          reason: "",
        })
      ).status,
    ).toBe(400);
    first = (
      await json<{ saved: SharedOrder }>(
        await request(`/api/orders/${first.order.id}/action`, "POST", {
          action: "reopen",
          revision: first.revision,
          reason: "Уточнить факт",
        }),
      )
    ).saved;
    expect(first.stage).toBe("issued");
    expect(first.order.draft.rows[0].actual).toBe(1.2);
    first = (
      await json<{ saved: SharedOrder }>(
        await request(
          "/api/orders",
          "POST",
          {
            order: { ...first.order, submittedAt: new Date().toISOString() },
            revision: first.revision,
          },
          "foreman",
        ),
      )
    ).saved;
    const history = store.history(admin, first.order.id);
    expect(
      history.some(
        (e) => e.action === "reopen" && e.reason === "Уточнить факт",
      ),
    ).toBe(true);
    expect(
      history.some(
        (e) =>
          e.action === "progress-saved" &&
          e.snapshot?.draft.rows[0].actual === 1.2,
      ),
    ).toBe(true);
  });
  it("перенос готовит черновик ночной смены, резерв остатка не назначается дважды", async () => {
    const response = await request(
      `/api/orders/${first.order.id}/carryover`,
      "POST",
      { date: "2026-11-17", shift: "Ночь", brigade: "Наша бригада" },
    );
    expect(response.status).toBe(200);
    const carried = await json<{ draft: ReturnType<typeof initialWorkDraft> }>(
      response,
    );
    expect(carried.draft.rows[0].plan).toBeCloseTo(1.392);
    expect(carried.draft.rows[0].actual).toBeNull();
    expect(store.list(admin)).toHaveLength(1);
    expect(
      (await request("/api/orders", "POST", { order: order(), revision: null }))
        .status,
    ).toBe(409);
    expect(
      (
        await request("/api/orders", "POST", {
          order: issueWorkOrder(carried.draft),
          revision: null,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/api/orders", "POST", {
          order: order(0.1),
          revision: null,
        })
      ).status,
    ).toBe(409);
  });
  it("фотография и замечание привязаны к объекту и доступны только разрешённой бригаде", async () => {
    const image = {
      mime: "image/png",
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2lsAAAAASUVORK5CYII=",
    };
    const payload = {
      model: "kzh-canopy",
      elementId: root.id,
      orderId: first.order.id,
      text: "Проверить край",
      brigade: "Наша бригада",
      image,
    };
    expect(
      (await request("/api/notes", "POST", payload, "viewer")).status,
    ).toBe(403);
    expect(
      (await request("/api/notes", "POST", payload, "foreman")).status,
    ).toBe(201);
    const notes = await json<{ notes: { imageId: string; text: string }[] }>(
      await request(
        `/api/notes?model=kzh-canopy&element=${encodeURIComponent(root.id)}`,
      ),
    );
    expect(notes.notes[0].text).toBe("Проверить край");
    expect(
      (
        await request(
          `/api/images/${notes.notes[0].imageId}`,
          "GET",
          undefined,
          "other",
        )
      ).status,
    ).toBe(404);
    const picture = await request(`/api/images/${notes.notes[0].imageId}`);
    expect(picture.headers.get("content-type")).toBe("image/png");
    expect(
      (
        await request(
          "/api/notes",
          "POST",
          {
            ...payload,
            image: {
              mime: "image/png",
              base64: Buffer.from("<svg onload='bad'>").toString("base64"),
            },
          },
          "foreman",
        )
      ).status,
    ).toBe(400);
  });
  it("автосохранение черновика проверяет версию и не разрешено наблюдателю", async () => {
    expect(
      (
        await request(
          "/api/draft",
          "PUT",
          { draft: initialWorkDraft(), revision: 0 },
          "viewer",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/draft", "PUT", {
          draft: initialWorkDraft(),
          revision: 0,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/api/draft", "PUT", {
          draft: initialWorkDraft(),
          revision: 0,
        })
      ).status,
    ).toBe(409);
    expect(
      (await json<{ revision: number }>(await request("/api/draft"))).revision,
    ).toBe(1);
  });
  it("живая резервная копия восстанавливает наряды, фотографии и историю", async () => {
    expect((await request("/api/backups", "POST", {}, "foreman")).status).toBe(
      403,
    );
    const result = await json<{ filename: string }>(
      await request("/api/backups", "POST", {}),
    );
    const db = new DatabaseSync(resolve(store.backups, result.filename), {
      readOnly: true,
    });
    expect(Number(db.prepare("SELECT count(*) n FROM orders").get()!.n)).toBe(
      2,
    );
    expect(Number(db.prepare("SELECT count(*) n FROM images").get()!.n)).toBe(
      1,
    );
    expect(
      Number(db.prepare("SELECT count(*) n FROM events").get()!.n),
    ).toBeGreaterThan(5);
    db.close();
    const download = await request(`/api/backups/${result.filename}`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(
      (
        await request(
          `/api/backups/${result.filename}`,
          "GET",
          undefined,
          "viewer",
        )
      ).status,
    ).toBe(403);
  });
  it("выход прекращает сеанс, данные сохраняются на диске после открытия базы заново", async () => {
    await request("/api/logout", "POST", {}, "viewer");
    expect(
      (await request("/api/orders", "GET", undefined, "viewer")).status,
    ).toBe(401);
    const reopened = await WorkspaceDatabase.open(store.path, store.backups);
    expect(reopened.list(admin)).toHaveLength(2);
    reopened.close();
  });
});
