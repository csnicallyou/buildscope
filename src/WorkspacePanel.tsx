import { useEffect, useState } from "react";
import { z } from "zod";
import { api } from "./workspaceClient";
import { userSchema, type WorkspaceUser, type Role } from "./workspaceTypes";
export default function WorkspacePanel({
  user,
  onImport,
}: {
  user: WorkspaceUser;
  onImport: () => Promise<boolean>;
}) {
  const [users, setUsers] = useState<WorkspaceUser[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [username, setUsername] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState<Role>("foreman"),
    [brigade, setBrigade] = useState("Наша бригада");
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [backups, setBackups] = useState<string[]>([]);
  const load = async () => {
    if (user.role !== "admin") return;
    try {
      setUsers(
        z.object({ users: z.array(userSchema) }).parse(await api("/api/users"))
          .users,
      );
      setBackups(
        z
          .object({ backups: z.array(z.string()) })
          .parse(await api("/api/backups")).backups,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    }
  };
  useEffect(() => {
    void load();
  }, [user.id]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="schedule workspace-account">
      <h1>Команда и доступ</h1>
      <p>
        {user.name} · {user.username} ·{" "}
        {user.role === "admin"
          ? "Руководитель"
          : user.role === "foreman"
            ? `Бригадир · ${user.brigade}`
            : "Просмотр"}
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button
        onClick={() =>
          void run(async () => {
            await api("/api/logout", "POST");
            window.location.assign("/login");
          })
        }
      >
        Выйти
      </button>
      <details className="account-section">
        <summary>Изменить мой пароль</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/api/password", "POST", { current, next });
              setCurrent("");
              setNext("");
              setMessage("Пароль изменён. Другие сеансы завершены.");
            });
          }}
        >
          <label>
            Текущий пароль
            <input
              aria-label="Текущий пароль"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            Новый пароль
            <input
              aria-label="Новый пароль"
              type="password"
              minLength={12}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <button disabled={busy}>Изменить пароль</button>
        </form>
      </details>
      {user.role === "admin" && (
        <>
          <h2>Пользователи</h2>
          <div className="team-users">
            {users.map((u) => (
              <div key={u.id}>
                <strong>{u.name}</strong>
                <span>
                  {u.username} ·{" "}
                  {u.role === "admin"
                    ? "Руководитель"
                    : u.role === "foreman"
                      ? "Бригадир"
                      : "Просмотр"}{" "}
                  · {u.brigade ?? "Все бригады"}
                </span>
                <button
                  disabled={busy || u.id === user.id}
                  onClick={() =>
                    void run(async () => {
                      await api(`/api/users/${u.id}`, "PATCH", {
                        active: !u.active,
                      });
                      await load();
                    })
                  }
                >
                  {u.active ? "Отключить" : "Включить"}
                </button>
              </div>
            ))}
          </div>
          <details className="account-section">
            <summary>Добавить пользователя</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api("/api/users", "POST", {
                    username,
                    name,
                    password,
                    role,
                    brigade: brigade.trim() || null,
                  });
                  setUsername("");
                  setName("");
                  setPassword("");
                  await load();
                  setMessage(
                    "Пользователь создан. Передайте ему выбранные логин и пароль лично.",
                  );
                });
              }}
            >
              <label>
                Имя
                <input
                  aria-label="Имя пользователя"
                  value={name}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Логин
                <input
                  aria-label="Логин нового пользователя"
                  pattern="[a-zA-Z0-9_.-]{3,64}"
                  value={username}
                  required
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label>
                Пароль
                <input
                  aria-label="Пароль нового пользователя"
                  type="password"
                  minLength={12}
                  value={password}
                  required
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                Роль
                <select
                  aria-label="Роль пользователя"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="foreman">Бригадир</option>
                  <option value="viewer">Просмотр</option>
                  <option value="admin">Руководитель</option>
                </select>
              </label>
              <label>
                Бригада
                <input
                  aria-label="Бригада пользователя"
                  value={brigade}
                  required={role === "foreman"}
                  placeholder="Пусто — доступ ко всем бригадам"
                  onChange={(e) => setBrigade(e.target.value)}
                />
              </label>
              <button disabled={busy}>Создать пользователя</button>
            </form>
          </details>
          <h2>Резервные копии</h2>
          <details className="account-section">
            <summary>Перенести прежние наряды из этого браузера</summary>
            <p>
              Откройте сайт в том браузере, где составляли наряды раньше. Будут
              перенесены записи локального архива; исходная копия сохранится.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (await onImport())
                    setMessage(
                      "Локальные наряды перенесены. Исходная копия в браузере сохранена.",
                    );
                })
              }
            >
              Перенести локальный архив
            </button>
          </details>
          <p>
            Сервер ежедневно сохраняет базу с нарядами, историей и фотографиями.
            Последние 30 копий хранятся на этой ВМ; для защиты от потери самой
            ВМ скачивайте копии отдельно.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api("/api/backups", "POST", {});
                await load();
                setMessage("Резервная копия создана");
              })
            }
          >
            Создать резервную копию
          </button>
          <ul>
            {backups.slice(0, 5).map((file) => (
              <li key={file}>
                <a href={`/api/backups/${encodeURIComponent(file)}`}>
                  Скачать{" "}
                  {file.replace(/^buildscope-/, "").replace(/\.sqlite$/, "")}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
