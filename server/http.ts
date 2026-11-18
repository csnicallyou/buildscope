import { reviewSchema, additionalSchema } from "../src/orderReview";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat, readdir } from "node:fs/promises";
import { resolve, relative, extname, isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { WorkspaceDatabase, WorkspaceError } from "./database";
import {
  roleSchema,
  type ObjectNote,
  type WorkspaceUser,
} from "../src/workspaceTypes";
import { savedSchema } from "../src/workOrderArchive";
import { initialWorkDraft } from "../src/workOrders";
import { ConstructionStore } from "./construction-store";
import { unitKey } from "../src/workProgress";
import { signatureModels } from "../src/signatures";

type Options = {
  store: WorkspaceDatabase;
  webRoot: string;
  publicOrigin?: string;
  devOrigin?: string;
  trustProxy?: boolean;
};
const json = (res: ServerResponse, value: unknown, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
};
async function body(req: IncomingMessage, limit = 8 * 1024 * 1024) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = Buffer.from(chunk);
    size += b.length;
    if (size > limit)
      throw new WorkspaceError(
        413,
        "Размер запроса превышает допустимый предел",
      );
    chunks.push(b);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return req.headers["content-type"]?.includes(
      "application/x-www-form-urlencoded",
    )
      ? Object.fromEntries(new URLSearchParams(text))
      : JSON.parse(text || "{}");
  } catch {
    throw new WorkspaceError(400, "Неверный формат запроса");
  }
}
const loginPage = (message = "") =>
  `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Вход · BuildScope</title><style>body{margin:0;background:#182832;color:#e4edf0;font:15px 'Segoe UI',sans-serif;display:grid;place-items:center;min-height:100dvh}main{max-width:360px;width:calc(100% - 64px);padding:32px;background:#203540;border:1px solid #354c58;border-radius:12px}h1{font-size:26px;margin:0 0 24px;color:#91cbc6}h2{font-size:21px;font-weight:500}p{font-size:13px;line-height:1.7;color:#a2b5bf}label{display:block;margin:20px 0 8px}input{box-sizing:border-box;width:100%;background:#182832;color:#e4edf0;border:1px solid #58717e;border-radius:6px;padding:12px;font:inherit}button{margin-top:24px;width:100%;padding:12px;border:0;border-radius:6px;background:#91cbc6;color:#182832;font:600 15px 'Segoe UI';cursor:pointer}input:focus,button:focus{outline:2px solid #e1b56a;outline-offset:2px}.error{color:#efb598}</style><main><h1>BuildScope</h1><h2>Вход в рабочее пространство</h2><p>Наряды, объекты и работа бригады.<br>Аккаунт GPT не требуется.</p>${message ? `<p class="error" role="alert">${message}</p>` : ""}<form action="/auth/login" method="post"><label for="username">Логин</label><input id="username" name="username" autocomplete="username" required autofocus><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="current-password" required><button>Войти</button></form></main></html>`;
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const newUser = z.object({
  username: z.string().max(64),
  name: z.string().min(1).max(120),
  password: z.string().max(256),
  role: roleSchema,
  brigade: z.string().max(120).nullable(),
});
const noteInput = z.object({
  model: z.string().min(1).max(250),
  elementId: z.string().min(1).max(250),
  orderId: z.string().nullable().optional(),
  text: z.string().max(4000),
  brigade: z.string().max(120),
  image: z
    .object({
      mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
      base64: z.string().max(7 * 1024 * 1024),
    })
    .nullable()
    .optional(),
});
const requireAdmin = (u: WorkspaceUser) => {
  if (u.role !== "admin")
    throw new WorkspaceError(403, "Доступно руководителю");
};
export async function createWorkspaceServer(options: Options) {
  const { store } = options,
    root = await realpath(options.webRoot);
  const construction = new ConstructionStore(store);
  const secure = options.publicOrigin?.startsWith("https:") ?? false;
  const cookieName = secure
    ? "__Host-buildscope_session"
    : "buildscope_session";
  const cookie = (res: ServerResponse, token: string) =>
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 43200 : 0}${secure ? "; Secure" : ""}`,
    );
  const failures = new Map<string, { count: number; until: number }>();
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    const url = new URL(req.url ?? "/", "http://localhost"),
      path = url.pathname;
    const token =
      (req.headers.cookie ?? "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith(`${cookieName}=`))
        ?.slice(cookieName.length + 1) ?? "";
    const user = token ? store.session(token) : null;
    const csrf = () => {
      const host = req.headers.host ?? "";
      const allowed = [
        options.publicOrigin,
        options.devOrigin,
        ...(!options.publicOrigin && /^(127\.0\.0\.1|localhost):\d+$/.test(host)
          ? [`http://${host}`]
          : []),
      ].filter(Boolean);
      if (!req.headers.origin || !allowed.includes(req.headers.origin))
        throw new WorkspaceError(
          403,
          "Запрос должен быть отправлен с этого сайта",
        );
    };
    try {
      if (req.method !== "GET" && req.method !== "HEAD") csrf();
      if (req.method === "GET" && path === "/api/health") {
        json(res, {
          service: "buildscope-workspace",
          version: 2,
          appVersion: "0.15.3",
        });
        return;
      }
      if (req.method === "GET" && path === "/api/session") {
        json(res, { user });
        return;
      }
      if (req.method === "GET" && path === "/login") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(loginPage());
        return;
      }
      if (
        req.method === "POST" &&
        (path === "/auth/login" || path === "/api/login")
      ) {
        const ip = options.trustProxy
          ? String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress)
              .split(",")
              .at(-1)!
              .trim()
          : (req.socket.remoteAddress ?? "local");
        const failed = failures.get(ip);
        if (failed && failed.until > Date.now() && failed.count >= 20)
          throw new WorkspaceError(
            429,
            "Слишком много попыток входа. Повторите через 15 минут.",
          );
        const input = z
          .object({
            username: z.string().max(64),
            password: z.string().max(256),
          })
          .parse(await body(req));
        const signed = await store.authenticate(input.username, input.password);
        if (!signed) {
          if (failures.size > 1000)
            for (const [key, v] of failures)
              if (v.until < Date.now()) failures.delete(key);
          failures.set(ip, {
            count: failed && failed.until > Date.now() ? failed.count + 1 : 1,
            until: Date.now() + 15 * 60 * 1000,
          });
          if (path === "/auth/login") {
            res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
            res.end(loginPage("Неверный логин или пароль"));
          } else json(res, { error: "Неверный логин или пароль" }, 401);
          return;
        }
        failures.delete(ip);
        cookie(res, store.createSession(signed));
        if (path === "/auth/login") {
          res.writeHead(303, { Location: "/" });
          res.end();
        } else json(res, { user: signed });
        return;
      }
      if (!user) {
        if (path.startsWith("/api/") || path.startsWith("/assets/"))
          json(res, { error: "Войдите в рабочее пространство" }, 401);
        else {
          res.writeHead(303, { Location: "/login" });
          res.end();
        }
        return;
      }
      if (req.method === "POST" && path === "/api/logout") {
        store.logout(token);
        cookie(res, "");
        json(res, { ok: true });
        return;
      }
      if (path === "/api/construction" && req.method === "GET") {
        json(res, { records: construction.list(user) });
        return;
      }
      if (path === "/api/construction" && req.method === "POST") {
        const input = z
          .object({
            payload: z.unknown(),
            id: z.string().nullable(),
            revision: z.number().int().positive().nullable(),
          })
          .parse(await body(req));
        json(res, {
          record: construction.save(
            user,
            input.payload,
            input.id,
            input.revision,
          ),
        });
        return;
      }
      const constructionHistory = path.match(
        /^\/api\/construction\/([^/]+)\/history$/,
      );
      if (constructionHistory && req.method === "GET") {
        json(res, {
          events: construction.history(user, constructionHistory[1]),
        });
        return;
      }
      const attachment = path.match(/^\/api\/construction\/([^/]+)\/file$/);
      if (attachment && req.method === "POST") {
        requireAdmin(user);
        const input = z
          .object({
            revision: z.number().int().positive(),
            name: z.string().min(1).max(240),
            base64: z.string().max(35 * 1024 * 1024),
          })
          .parse(await body(req, 36 * 1024 * 1024));
        json(res, {
          record: construction.attach(
            user,
            attachment[1],
            input.revision,
            input.name,
            Buffer.from(input.base64, "base64"),
          ),
        });
        return;
      }
      const documentFile = path.match(/^\/api\/construction-files\/([^/]+)$/);
      if (documentFile && req.method === "GET") {
        const file = construction.file(user, documentFile[1]);
        if (/\.(mp4|webm|mov)$/i.test(String(file.name))) {
          const data = Buffer.from(file.data as Uint8Array);
          res.setHeader(
            "Content-Type",
            String(file.name).toLowerCase().endsWith(".mp4")
              ? "video/mp4"
              : String(file.name).toLowerCase().endsWith(".mov")
                ? "video/quicktime"
                : "video/webm",
          );
          res.setHeader("Accept-Ranges", "bytes");
          if (req.headers.range) {
            const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
            const start = range ? Number(range[1]) : -1;
            const end = range?.[2]
              ? Math.min(Number(range[2]), data.length - 1)
              : data.length - 1;
            if (start < 0 || start >= data.length || end < start) {
              res.writeHead(416, { "Content-Range": `bytes */${data.length}` });
              res.end();
              return;
            }
            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${data.length}`,
              "Content-Length": end - start + 1,
            });
            res.end(data.subarray(start, end + 1));
            return;
          }
          res.setHeader("Content-Length", data.length);
          res.end(data);
          return;
        }
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(String(file.name))}`,
        );
        res.end(file.data);
        return;
      }
      if (req.method === "POST" && path === "/api/password") {
        const input = z
          .object({ current: z.string().max(256), next: z.string().max(256) })
          .parse(await body(req));
        await store.changePassword(user, input.current, input.next);
        cookie(res, store.createSession(user));
        json(res, { ok: true });
        return;
      }
      if (path === "/api/users" && req.method === "GET") {
        json(res, { users: store.users(user) });
        return;
      }
      if (path === "/api/users" && req.method === "POST") {
        requireAdmin(user);
        json(
          res,
          { user: await store.addUser(user, newUser.parse(await body(req))) },
          201,
        );
        return;
      }
      if (/^\/api\/users\/[^/]+$/.test(path) && req.method === "PATCH") {
        const input = z.object({ active: z.boolean() }).parse(await body(req));
        store.setUserActive(user, path.split("/")[3], input.active);
        json(res, { ok: true });
        return;
      }
      if (path === "/api/orders" && req.method === "GET") {
        json(res, { orders: store.list(user) });
        return;
      }
      if (path === "/api/orders" && req.method === "POST") {
        const input = z
          .object({
            order: savedSchema,
            revision: z.number().int().positive().nullable(),
          })
          .parse(await body(req));
        if (input.revision === null)
          construction.validateOrder(user, input.order.draft);
        json(res, { saved: store.save(user, input.order, input.revision) });
        return;
      }
      if (path === "/api/import" && req.method === "POST") {
        const input = z
          .object({ orders: z.array(savedSchema).max(1000) })
          .parse(await body(req));
        json(res, {
          imported: store.importLocal(user, input.orders),
          orders: store.list(user),
        });
        return;
      }
      const orderRoute = path.match(
        /^\/api\/orders\/([^/]+)\/(history|action|carryover|signatures|review|additional)$/,
      );
      if (orderRoute) {
        const [, id, action] = orderRoute;
        if (action === "review" && req.method === "PUT") {
          json(res, {
            saved: store.saveReview(
              user,
              id,
              reviewSchema.parse(await body(req)),
            ),
          });
          return;
        }
        if (action === "additional" && req.method === "POST") {
          json(res, {
            saved: store.addAdditional(
              user,
              id,
              additionalSchema.parse(await body(req)),
            ),
          });
          return;
        }

        if (action === "signatures" && req.method === "PUT") {
          const input = z
            .object({
              revision: z.number().int().positive(),
              checks: z
                .array(
                  z.object({
                    id: z.string().min(1),
                    startSignatureNoteId: z.string().min(1).max(200).nullable(),
                    endSignatureNoteId: z.string().min(1).max(200).nullable(),
                    startSignatureStatus: z
                      .enum(["unchecked", "present", "missing", "illegible"])
                      .optional(),
                    endSignatureStatus: z
                      .enum(["unchecked", "present", "missing", "illegible"])
                      .optional(),
                  }),
                )
                .max(200),
            })
            .parse(await body(req));
          json(res, {
            saved: store.saveSignatureChecks(
              user,
              id,
              input.revision,
              input.checks,
            ),
          });
          return;
        }
        if (action === "history" && req.method === "GET") {
          json(res, { events: store.history(user, id) });
          return;
        }
        if (action === "action" && req.method === "POST") {
          const input = z
            .object({
              revision: z.number().int(),
              action: z.enum(["accept", "reopen", "replan"]),
              reason: z.string().max(4000).default(""),
              order: savedSchema.optional(),
            })
            .parse(await body(req));
          json(res, {
            saved: store.action(
              user,
              id,
              input.revision,
              input.action,
              input.reason,
              input.order,
            ),
          });
          return;
        }
        if (action === "carryover" && req.method === "POST") {
          requireAdmin(user);
          const input = z
            .object({
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              shift: z.enum(["День", "Ночь"]),
              brigade: z.string().trim().min(1).max(120),
            })
            .parse(await body(req));
          const source = store.get(user, id);
          if (source.stage === "issued")
            throw new WorkspaceError(400, "Сначала сдайте текущий наряд");
          const rows = source.order.draft.rows
            .filter((r) => !r.completed)
            .map((r) => {
              const planned =
                r.plan ??
                (r.modelNeed && unitKey(r.modelNeed.unit) === unitKey(r.unit)
                  ? r.modelNeed.value
                  : null);
              return {
                ...r,
                id: randomUUID(),
                date: input.date,
                shift: input.shift,
                plan:
                  planned === null || r.actual === null
                    ? null
                    : Number(Math.max(0, planned - r.actual).toPrecision(12)),
                actual: null,
                verifiedActual: null,
                verificationBasis: "",
                verifiedAt: "",
                verifiedBy: "",
                completed: false,
                note: `${r.note}\nПеренос из наряда ${source.order.draft.date} · ${source.order.draft.shift} (${id})`.trim(),
              };
            })
            .filter((r) => r.plan === null || r.plan > 0);
          json(res, {
            draft: {
              ...initialWorkDraft(),
              ...source.order.draft,
              ...input,
              taskId: null,
              proposalId: null,
              reportedPeople: null,
              rows,
              crew: source.order.draft.crew.map((r) => ({
                ...r,
                id: randomUUID(),
                date: input.date,
                shift: input.shift,
                start: "",
                end: "",
                breakMinutes: 0,
                startSignatureNoteId: null,
                endSignatureNoteId: null,
                startSignatureStatus: "unchecked",
                endSignatureStatus: "unchecked",
              })),
            },
          });
          return;
        }
      }
      if (path === "/api/draft" && req.method === "GET") {
        requireAdmin(user);
        json(res, store.draft(user));
        return;
      }
      if (path === "/api/draft" && req.method === "PUT") {
        const input = z
          .object({
            revision: z.number().int().nonnegative(),
            draft: savedSchema.shape.draft,
          })
          .parse(await body(req));
        json(res, store.saveDraft(user, input.draft, input.revision));
        return;
      }
      if (path === "/api/notes" && req.method === "GET") {
        if (
          Object.values(signatureModels).some(
            (model) => model === url.searchParams.get("model"),
          )
        )
          store.get(user, url.searchParams.get("element") ?? "");
        const rows = store.db
          .prepare(
            "SELECT * FROM notes WHERE model=? AND element_id=? ORDER BY created_at DESC",
          )
          .all(
            url.searchParams.get("model") ?? "",
            url.searchParams.get("element") ?? "",
          );
        const notes: ObjectNote[] = rows
          .filter((r) => !user.brigade || r.brigade === user.brigade)
          .map((r) => ({
            id: String(r.id),
            model: String(r.model),
            elementId: String(r.element_id),
            orderId: r.order_id === null ? null : String(r.order_id),
            text: String(r.text),
            author: String(r.author),
            brigade: String(r.brigade),
            createdAt: String(r.created_at),
            imageId: r.image_id === null ? null : String(r.image_id),
          }));
        json(res, { notes });
        return;
      }
      if (path === "/api/notes" && req.method === "POST") {
        if (user.role === "viewer")
          throw new WorkspaceError(403, "Доступен только просмотр");
        const input = noteInput.parse(await body(req));
        if (!input.text.trim() && !input.image)
          throw new WorkspaceError(400, "Добавьте комментарий или фотографию");
        const order = input.orderId ? store.get(user, input.orderId) : null;
        const signature = Object.values(signatureModels).some(
          (model) => model === input.model,
        );
        if (
          signature &&
          (!order || input.elementId !== order.order.id || !input.image)
        )
          throw new WorkspaceError(
            400,
            "Прикрепите фото подписного листа к этому наряду",
          );
        if (signature && order?.stage === "submitted" && user.role !== "admin")
          throw new WorkspaceError(
            403,
            "После сдачи проверку подписей выполняет руководитель",
          );
        if (signature && order?.stage === "accepted")
          throw new WorkspaceError(
            409,
            "Для добавления подписных листов руководитель должен вернуть принятый наряд в работу",
          );
        const brigade =
          signature && order
            ? order.order.draft.brigade
            : (user.brigade ?? input.brigade);
        let image: Buffer | null = null;
        if (input.image) {
          image = Buffer.from(input.image.base64, "base64");
          const detected =
            image.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
              ? "image/png"
              : image[0] === 255 && image[1] === 216 && image[2] === 255
                ? "image/jpeg"
                : image.subarray(0, 4).toString() === "RIFF" &&
                    image.subarray(8, 12).toString() === "WEBP"
                  ? "image/webp"
                  : null;
          if (image.length > 5 * 1024 * 1024 || detected !== input.image.mime)
            throw new WorkspaceError(
              400,
              "Нужна фотография JPEG, PNG или WebP размером до 5 МБ",
            );
        }
        const id = randomUUID(),
          imageId = image ? randomUUID() : null,
          createdAt = new Date().toISOString(),
          author = `${user.name} (${user.username})`;
        store.transaction(() => {
          store.db
            .prepare("INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?)")
            .run(
              id,
              input.model,
              input.elementId,
              input.orderId ?? null,
              input.text.trim(),
              author,
              brigade,
              createdAt,
              imageId,
            );
          if (image && imageId)
            store.db
              .prepare("INSERT INTO images VALUES(?,?,?,?)")
              .run(imageId, input.image!.mime, image, id);
          store.db
            .prepare(
              "INSERT INTO events(order_id,revision,action,reason,actor,created_at,snapshot) VALUES(?,0,'object-note',?,?,?,NULL)",
            )
            .run(
              input.orderId ?? "",
              `${input.model} / ${input.elementId}: ${input.text.trim()}`,
              author,
              createdAt,
            );
        });
        json(res, { ok: true, id }, 201);
        return;
      }
      if (/^\/api\/images\/[^/]+$/.test(path) && req.method === "GET") {
        const r = store.db
          .prepare(
            "SELECT i.*,n.brigade FROM images i JOIN notes n ON n.id=i.note_id WHERE i.id=?",
          )
          .get(path.split("/")[3]);
        if (
          !r ||
          (user.brigade && r.brigade !== user.brigade) ||
          !(r.data instanceof Uint8Array)
        )
          throw new WorkspaceError(404, "Фото не найдено");
        res.setHeader("Content-Type", String(r.mime));
        res.setHeader("Content-Length", r.data.length);
        res.end(r.data);
        return;
      }
      if (path === "/api/backups" && req.method === "GET") {
        requireAdmin(user);
        json(res, {
          backups: (await readdir(store.backups))
            .filter((n) => /^buildscope-[\w.-]+\.sqlite$/.test(n))
            .sort()
            .reverse(),
        });
        return;
      }
      if (path === "/api/backups" && req.method === "POST") {
        requireAdmin(user);
        json(res, { filename: await store.snapshot() });
        return;
      }
      if (path.startsWith("/api/backups/") && req.method === "GET") {
        requireAdmin(user);
        const filename = decodeURIComponent(path.slice("/api/backups/".length));
        if (!/^buildscope-[\w.-]+\.sqlite$/.test(filename))
          throw new WorkspaceError(404, "Копия не найдена");
        const file = join(store.backups, filename),
          info = await stat(file).catch(() => null);
        if (!info?.isFile()) throw new WorkspaceError(404, "Копия не найдена");
        res.setHeader("Content-Type", "application/vnd.sqlite3");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
        res.setHeader("Content-Length", info.size);
        const stream = createReadStream(file);
        stream.on("error", () => res.destroy());
        res.on("close", () => stream.destroy());
        stream.pipe(res);
        return;
      }
      if (path.startsWith("/api/")) throw new WorkspaceError(404, "Не найдено");
      if (!["GET", "HEAD"].includes(req.method ?? ""))
        throw new WorkspaceError(405, "Метод не поддерживается");
      let pathname: string;
      try {
        pathname = decodeURIComponent(path);
      } catch {
        throw new WorkspaceError(400, "Неверный адрес");
      }
      if (
        /[\\\0:]/.test(pathname) ||
        pathname.split("/").some((p) => p.startsWith("."))
      )
        throw new WorkspaceError(404, "Не найдено");
      const file = await realpath(
        resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`),
      ).catch(() => null);
      if (!file) throw new WorkspaceError(404, "Не найдено");
      const rel = relative(root, file);
      if (isAbsolute(rel) || rel.startsWith(".."))
        throw new WorkspaceError(404, "Не найдено");
      const info = await stat(file);
      if (!info.isFile()) throw new WorkspaceError(404, "Не найдено");
      res.setHeader(
        "Content-Type",
        mime[extname(file)] ?? "application/octet-stream",
      );
      res.setHeader("Content-Length", info.size);
      if (req.method === "HEAD") res.end();
      else {
        const stream = createReadStream(file);
        stream.on("error", () => res.destroy());
        res.on("close", () => stream.destroy());
        stream.pipe(res);
      }
    } catch (e) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (e instanceof WorkspaceError)
        json(res, { error: e.message }, e.status);
      else if (e instanceof z.ZodError)
        json(
          res,
          { error: "Проверьте заполнение полей и допустимые значения" },
          400,
        );
      else {
        process.stderr.write(
          `BuildScope request failed: ${e instanceof Error ? e.name : "unknown"}\n`,
        );
        json(
          res,
          { error: "Не удалось выполнить запрос. Данные не удалены." },
          500,
        );
      }
    }
  });
}
