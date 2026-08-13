#!/usr/bin/env bash
#
# Start tailscaled unprivileged, in userspace-networking mode.
#
# Userspace mode needs no root and no TUN device — the daemon proxies
# connections itself rather than creating a network interface. That is the same
# mode Tailscale documents for containers, and Funnel works in it.
#
# Idempotent: exits successfully if the daemon is already up.

set -euo pipefail

TS_DIR="$HOME/.local/share/tailscale"
TS_SOCK="$TS_DIR/tailscaled.sock"
TSD="$HOME/.local/bin/tailscaled"
TS="$HOME/.local/bin/tailscale"

log() { printf '[funnel-daemon] %s\n' "$*"; }

[ -x "$TSD" ] || { printf '[funnel-daemon] ERROR: %s not found\n' "$TSD" >&2; exit 1; }
mkdir -p "$TS_DIR"

# Liveness is "the socket answers", NOT "status succeeds": plain `status` exits
# non-zero while logged out, which would restart a perfectly healthy daemon and
# drop any login already in flight. `status --json` answers either way.
if [ -S "$TS_SOCK" ] && "$TS" --socket="$TS_SOCK" status --json >/dev/null 2>&1; then
    log "already running"
    exit 0
fi

# A stale socket from a killed daemon blocks the new one from binding.
rm -f "$TS_SOCK"

nohup "$TSD" \
    --tun=userspace-networking \
    --state="$TS_DIR/tailscaled.state" \
    --socket="$TS_SOCK" \
    --statedir="$TS_DIR" \
    > "$TS_DIR/tailscaled.log" 2>&1 &

log "started tailscaled (pid $!), log: $TS_DIR/tailscaled.log"

for _ in $(seq 1 20); do
    [ -S "$TS_SOCK" ] && { log "socket ready"; break; }
    sleep 0.5
done

state="$("$TS" --socket="$TS_SOCK" status --json 2>/dev/null | jq -r '.BackendState // "Unknown"')"
log "backend state: $state"

if [ "$state" != "Running" ]; then
    cat <<EOF

Not logged in yet. Authenticate this node:

  $TS --socket=$TS_SOCK up --hostname=vaultproof-proxy --accept-dns=false

It prints a login.tailscale.com URL; open it and sign in. Then:

  ./scripts/funnel-up.sh
EOF
fi
