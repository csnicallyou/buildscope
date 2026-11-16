import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const release = process.argv[2];
if (!/^\d{8}T\d{6}$/.test(release ?? "")) throw Error("Invalid release");
await mkdir(".deploy", { recursive: true });
const accessFile = resolve(".deploy/access.json");
if (!existsSync(accessFile)) {
  const password = () => `${randomBytes(15).toString("base64url")}aA7!`;
  const users = [
    {
      username: "admin",
      name: "Руководитель",
      role: "admin",
      brigade: null,
      password: password(),
    },
    {
      username: "brigadir",
      name: "Бригадир",
      role: "foreman",
      brigade: "Наша бригада",
      password: password(),
    },
    {
      username: "viewer",
      name: "Просмотр",
      role: "viewer",
      brigade: "Наша бригада",
      password: password(),
    },
  ];
  await writeFile(accessFile, JSON.stringify(users, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
}
if (process.platform === "win32") {
  const account = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
  const secured = spawnSync(
    "icacls",
    [accessFile, "/inheritance:r", "/grant:r", `${account}:(F)`],
    { encoding: "utf8", windowsHide: true },
  );
  if (secured.status !== 0)
    throw Error("Unable to restrict credential file permissions");
}
const result = spawnSync(
  "ssh",
  [
    "-i",
    resolve(homedir(), ".ssh/hostkey_vpn"),
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "vpnadmin@158.160.161.138",
    "sudo",
    "-n",
    "/opt/buildscope/runtime/node-v24.19.0-linux-x64/bin/node",
    `/home/vpnadmin/buildscope-provision-${release}.mjs`,
    release,
  ],
  { input: await readFile(accessFile), encoding: "utf8", windowsHide: true },
);
process.stdout.write(result.stdout ?? "");
if (result.status !== 0) {
  process.stderr.write("Provisioning failed. No secrets printed.\n");
  process.exit(result.status ?? 1);
}
process.stdout.write(
  "Account details saved privately in .deploy/access.json\n",
);
