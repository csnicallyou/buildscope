import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { WorkspaceDatabase } from "./database";
import { createWorkspaceServer } from "./http";
await mkdir(".deploy/browser-tests", { recursive: true });
const data = await mkdtemp(resolve(".deploy/browser-tests/run-"));
const store = await WorkspaceDatabase.open(resolve(data, "workspace.sqlite"));
const admin = await store.addUser(null, {
  username: "admin",
  name: "Тестовый руководитель",
  password: "Browser-admin-1234!",
  role: "admin",
  brigade: null,
});
for (const role of ["foreman", "viewer"] as const)
  await store.addUser(admin, {
    username: role,
    name: role === "foreman" ? "Тестовый бригадир" : "Тестовый наблюдатель",
    password: `Browser-${role}-1234!`,
    role,
    brigade: "Наша бригада",
  });
const server = await createWorkspaceServer({
  store,
  webRoot: resolve(".deploy/release/web"),
});
server.listen(8781, "127.0.0.1");
process.on("SIGTERM", () =>
  server.close(() => {
    store.close();
    process.exit(0);
  }),
);
