// Run once as root on the prepared VM. Secrets arrive only through stdin.
import { spawnSync } from "node:child_process";
import process from "node:process";
const release = process.argv[2];
if (!/^\d{8}T\d{6}$/.test(release ?? "")) throw Error("Invalid release");
let input = "";
for await (const chunk of process.stdin) input += chunk;
const users = JSON.parse(input);
const node = "/opt/buildscope/runtime/node-v24.19.0-linux-x64/bin/node";
const bootstrap = spawnSync(
  "runuser",
  [
    "-u",
    "buildscope",
    "--",
    "env",
    "BUILDSCOPE_DATA=/var/lib/buildscope",
    node,
    `/opt/buildscope/releases/${release}/server/index.mjs`,
    "bootstrap",
  ],
  { input: JSON.stringify(users[0]), encoding: "utf8" },
);
if (bootstrap.status !== 0)
  throw Error("Bootstrap failed; site has not been switched");
if (spawnSync("systemctl", ["start", "buildscope"]).status !== 0)
  throw Error("Service failed");
const origin = "https://buildscope.158.160.161.138.sslip.io:8443";
let ready = false;
for (let i = 0; i < 20; i++) {
  try {
    if ((await fetch("http://127.0.0.1:8780/api/health")).ok) {
      ready = true;
      break;
    }
  } catch {
    /* Wait for systemd startup. */
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!ready) throw Error("API not ready");
const login = await fetch("http://127.0.0.1:8780/api/login", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify(users[0]),
});
if (!login.ok) throw Error("Admin login failed");
const cookie = login.headers.get("set-cookie")?.split(";")[0];
if (!cookie?.startsWith("__Host-buildscope_session="))
  throw Error("Secure cookie missing");
for (const user of users.slice(1)) {
  const res = await fetch("http://127.0.0.1:8780/api/users", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(user),
  });
  if (!res.ok) throw Error("User provisioning failed");
}
const orders = await fetch("http://127.0.0.1:8780/api/orders", {
  headers: { Cookie: cookie },
});
if (!orders.ok) throw Error("Authenticated API failed");
const denied = await fetch("http://127.0.0.1:8780/assets/private.js");
if (denied.status !== 401) throw Error("Assets must require login");
await fetch("http://127.0.0.1:8780/api/logout", {
  method: "POST",
  headers: { Origin: origin, Cookie: cookie },
});
process.stdout.write(
  "Accounts and protected API verified; credentials were not logged\n",
);
