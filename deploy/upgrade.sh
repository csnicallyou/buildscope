#!/usr/bin/env bash
# Upgrade an existing installation. Never bootstrap or restore an older database.
set -euo pipefail
release=${1:?release required}
[[ "$release" =~ ^[0-9]{8}T[0-9]{6}$ ]] || exit 2
node=/opt/buildscope/runtime/node-v24.19.0-linux-x64/bin/node
target="/opt/buildscope/releases/$release"
archive="/home/vpnadmin/buildscope-$release.tar.gz"
test -f "$archive"
previous=$(systemctl show buildscope --property=WorkingDirectory --value)
[[ "$previous" =~ ^/opt/buildscope/releases/[0-9]{8}T[0-9]{6}$ ]] || exit 2
test ! -e "$target"
install -d -m 755 "$target"
tar -xzf "$archive" -C "$target"
test -f "$target/server/index.mjs"
test -f "$target/web/index.html"
backup="/var/backups/buildscope-before-$release"
install -d -m 700 "$backup"
cp -a /etc/systemd/system/buildscope.service /etc/systemd/system/buildscope-backup.service "$backup/"
systemctl start buildscope-backup.service
snapshot=$(find /var/lib/buildscope/backups -maxdepth 1 -type f -name 'buildscope-*.sqlite' | sort | tail -1)
test -n "$snapshot"
install -d -m 700 -o buildscope -g buildscope "$backup/preflight"
# buildscope can traverse only this specific private staging directory.
chmod 711 "$backup"
install -m 600 -o buildscope -g buildscope "$snapshot" "$backup/preflight/workspace.sqlite"
runuser -u buildscope -- env BUILDSCOPE_DATA="$backup/preflight" "$node" "$target/server/index.mjs" check
printf '\nMigration verified on private snapshot; switching service\n'
systemctl stop buildscope-backup.timer
systemctl stop buildscope
runuser -u buildscope -- env BUILDSCOPE_DATA=/var/lib/buildscope "$node" "$previous/server/index.mjs" backup > "$backup/snapshot-path"
before=$("$node" -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync("/var/lib/buildscope/workspace.sqlite",{readOnly:true});console.log(JSON.stringify([db.prepare("SELECT count(*) n FROM users").get().n,db.prepare("SELECT count(*) n FROM orders").get().n]));db.close()')
sed -i "s|$previous|$target|g" /etc/systemd/system/buildscope.service /etc/systemd/system/buildscope-backup.service
systemctl daemon-reload
runuser -u buildscope -- env BUILDSCOPE_DATA=/var/lib/buildscope "$node" "$target/server/index.mjs" check
after=$("$node" -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync("/var/lib/buildscope/workspace.sqlite",{readOnly:true});console.log(JSON.stringify([db.prepare("SELECT count(*) n FROM users").get().n,db.prepare("SELECT count(*) n FROM orders").get().n]));db.close()')
test "$before" = "$after"
systemctl start buildscope
for i in {1..15}; do
  if curl -fsS http://127.0.0.1:8780/api/health >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8780/api/health
systemctl start buildscope-backup.timer
systemctl start buildscope-backup.service
chmod 700 "$backup"
printf '\nUpgraded %s -> %s. Users and orders preserved: %s\n' "$previous" "$target" "$after"
