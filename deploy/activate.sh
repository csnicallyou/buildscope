#!/usr/bin/env bash
set -euo pipefail
release=${1:?release id required}
[[ "$release" =~ ^[0-9]{8}T[0-9]{6}$ ]] || exit 2
backup="/var/backups/buildscope-before-$release"
test -f "$backup/Caddyfile"
test -f /var/lib/buildscope/workspace.sqlite
systemctl enable --now buildscope.service
for i in {1..15}; do
  if curl -fsS http://127.0.0.1:8780/api/health >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8780/api/health
# This deployment is for the single existing BuildScope Caddy site only.
# Fail if another site/global block was added since inspection.
test "$(awk '/^[^[:space:]#].*\{$/{n++} END{print n+0}' /etc/caddy/Caddyfile)" = 1
grep -q '^buildscope.158.160.161.138.sslip.io:8443 {' /etc/caddy/Caddyfile
cat > /etc/caddy/Caddyfile.buildscope-next <<'EOF'
buildscope.158.160.161.138.sslip.io:8443 {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8780
}
EOF
caddy validate --config /etc/caddy/Caddyfile.buildscope-next --adapter caddyfile
cp /etc/caddy/Caddyfile.buildscope-next /etc/caddy/Caddyfile
if ! systemctl reload caddy; then
  cp "$backup/Caddyfile" /etc/caddy/Caddyfile
  systemctl reload caddy
  exit 1
fi
if ! curl -fsS --retry 3 --retry-delay 1 https://buildscope.158.160.161.138.sslip.io:8443/login >/dev/null; then
  cp "$backup/Caddyfile" /etc/caddy/Caddyfile
  systemctl reload caddy
  exit 1
fi
systemctl enable --now buildscope-backup.timer
systemctl start buildscope-backup.service
printf 'BuildScope active; rollback configuration: %s/Caddyfile\n' "$backup"
