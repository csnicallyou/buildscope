#!/usr/bin/env bash
# Run as root; no site switch until activate.sh is called after bootstrap checks.
set -euo pipefail
release=${1:?release id required}
[[ "$release" =~ ^[0-9]{8}T[0-9]{6}$ ]] || exit 2
archive="/home/vpnadmin/buildscope-${release}.tar.gz"
test -f "$archive"
install -d -m 755 /opt/buildscope/releases /opt/buildscope/runtime
if ! id buildscope >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/buildscope --shell /usr/sbin/nologin buildscope
fi
install -d -m 700 -o buildscope -g buildscope /var/lib/buildscope /var/lib/buildscope/backups
node_version=24.19.0
runtime="/opt/buildscope/runtime/node-v${node_version}-linux-x64"
if [ ! -x "$runtime/bin/node" ]; then
  stage=$(mktemp -d /opt/buildscope/runtime/download.XXXXXX)
  trap 'rm -f "$stage/node.tar.xz" "$stage/SHASUMS256.txt"; rmdir "$stage"' EXIT
  curl --fail --silent --show-error --location "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" -o "$stage/SHASUMS256.txt"
  curl --fail --silent --show-error --location "https://nodejs.org/dist/v${node_version}/node-v${node_version}-linux-x64.tar.xz" -o "$stage/node.tar.xz"
  expected=$(awk '/ node-v24.19.0-linux-x64.tar.xz$/{print $1}' "$stage/SHASUMS256.txt")
  test -n "$expected"
  printf '%s  %s\n' "$expected" "$stage/node.tar.xz" | sha256sum --check --status
  tar -xJf "$stage/node.tar.xz" -C /opt/buildscope/runtime
fi
target="/opt/buildscope/releases/$release"
test ! -e "$target"
install -d -m 755 "$target"
tar -xzf "$archive" -C "$target"
test -f "$target/server/index.mjs"
test -f "$target/web/index.html"
chmod -R go-w "$target"
backup="/var/backups/buildscope-before-$release"
install -d -m 700 "$backup"
cp -a /etc/caddy/Caddyfile "$backup/Caddyfile"
tar -czf "$backup/legacy-web.tar.gz" -C /home/vpnadmin buildscope-web
cat > /etc/systemd/system/buildscope.service <<EOF
[Unit]
Description=BuildScope shared workspace
After=network.target
[Service]
Type=simple
User=buildscope
Group=buildscope
WorkingDirectory=$target
Environment=NODE_ENV=production
Environment=PORT=8780
Environment=PUBLIC_ORIGIN=https://buildscope.158.160.161.138.sslip.io:8443
Environment=TRUST_PROXY=1
Environment=EXTERNAL_BACKUPS=1
Environment=BUILDSCOPE_DATA=/var/lib/buildscope
Environment=BUILDSCOPE_WEB=$target/web
ExecStart=$runtime/bin/node $target/server/index.mjs
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/buildscope
MemoryMax=384M
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/buildscope-backup.service <<EOF
[Unit]
Description=Consistent SQLite backup of BuildScope
[Service]
Type=oneshot
User=buildscope
Group=buildscope
Environment=BUILDSCOPE_DATA=/var/lib/buildscope
ExecStart=$runtime/bin/node $target/server/index.mjs backup
UMask=0077
NoNewPrivileges=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/buildscope
EOF
cat > /etc/systemd/system/buildscope-backup.timer <<'EOF'
[Unit]
Description=Daily BuildScope database snapshot
[Timer]
OnCalendar=*-*-* 03:15:00 UTC
Persistent=true
RandomizedDelaySec=5m
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
printf 'Prepared release %s; legacy site unchanged\n' "$release"
