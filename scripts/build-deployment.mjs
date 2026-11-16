import { spawnSync } from "node:child_process";
import process from "node:process";
const vite = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build", "--outDir", ".deploy/release/web"],
  { stdio: "inherit", env: { ...process.env, VITE_WORKSPACE_API: "required" } },
);
if (vite.status !== 0) process.exit(vite.status ?? 1);
await import("./build-server.mjs");
