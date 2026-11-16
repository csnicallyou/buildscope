import { resolve } from "node:path";
import { WorkspaceDatabase } from "./database";
import { createWorkspaceServer } from "./http";
const data = resolve(process.env.BUILDSCOPE_DATA ?? "data");
const store = await WorkspaceDatabase.open(resolve(data, "workspace.sqlite"));
const command = process.argv[2];
if (command === "bootstrap") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const user = JSON.parse(input) as {
    username: string;
    name: string;
    password: string;
  };
  const added = await store.addUser(null, {
    ...user,
    role: "admin",
    brigade: null,
  });
  process.stdout.write(
    JSON.stringify({ id: added.id, username: added.username }),
  );
  store.close();
} else if (command === "backup") {
  process.stdout.write(await store.snapshot());
  store.close();
} else {
  const server = await createWorkspaceServer({
    store,
    webRoot: resolve(process.env.BUILDSCOPE_WEB ?? "dist"),
    publicOrigin: process.env.PUBLIC_ORIGIN,
    trustProxy: process.env.TRUST_PROXY === "1",
    devOrigin: process.env.DEV_ORIGIN,
  });
  server.listen(Number(process.env.PORT ?? 8780), "127.0.0.1", () =>
    process.stdout.write("BuildScope workspace ready\n"),
  );
  const timer = setInterval(
    () =>
      void store
        .snapshot()
        .catch(() => process.stderr.write("Backup failed\n")),
    24 * 60 * 60 * 1000,
  );
  if (process.env.EXTERNAL_BACKUPS === "1") clearInterval(timer);
  else timer.unref();
  const stop = () => {
    clearInterval(timer);
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
