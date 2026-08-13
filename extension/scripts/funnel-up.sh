#!/usr/bin/env bash
#
# Publish the extension proxy on a stable public HTTPS hostname via Tailscale
# Funnel, and record that hostname in .env.coston2 as EXT_PROXY_URL.
#
# Why Funnel rather than a quick tunnel: the URL is written ON-CHAIN when
# post-build.sh registers the TEE machine, and independent FTDC providers keep
# POSTing to it. A hostname that rotates on restart strands the registration
# silently — the machine looks healthy and instructions simply never arrive.
# Funnel's <machine>.<tailnet>.ts.net is stable for the life of the node.
#
# Run this BEFORE post-build.sh. Re-running it is safe.
#
# Tailscale runs unprivileged here (userspace networking), so this needs no
# root and no systemd.

set -euo pipefail

TS_DIR="$HOME/.local/share/tailscale"
TS_SOCK="$TS_DIR/tailscaled.sock"
TS="$HOME/.local/bin/tailscale"

# Proxy external port on the host — container 6664, per docker-compose.yaml.
# This is the port that serves /instruction and /info.
PROXY_PORT="${EXT_PROXY_FUNNEL_PORT:-6674}"

ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.coston2"

log() { printf '[funnel] %s\n' "$*"; }
die() { printf '[funnel] ERROR: %s\n' "$*" >&2; exit 1; }

[ -x "$TS" ] || die "tailscale not found at $TS"
[ -S "$TS_SOCK" ] || die "tailscaled is not running; start it with scripts/funnel-daemon.sh"

ts() { "$TS" --socket="$TS_SOCK" "$@"; }

# --- 1. require a logged-in node -------------------------------------------

state="$(ts status --json 2>/dev/null | jq -r '.BackendState // "Unknown"')"
if [ "$state" != "Running" ]; then
    log "backend state is $state, not Running."
    log "Authenticate first:  $TS --socket=$TS_SOCK up --hostname=vaultproof-proxy"
    die "not logged in"
fi

host="$(ts status --json | jq -r '.Self.DNSName' | sed 's/\.$//')"
[ -n "$host" ] && [ "$host" != "null" ] || die "could not read this node's DNS name"
url="https://$host"
log "node hostname: $host"

# --- 2. publish the proxy ---------------------------------------------------

# Funnel may need enabling for the tailnet the first time; the CLI prints a
# console link when that is the case, so surface its output rather than hiding it.
log "publishing localhost:$PROXY_PORT on $url"
if ! ts funnel --bg --https=443 "$PROXY_PORT"; then
    die "funnel failed — if it printed a console URL above, enable Funnel for the tailnet and re-run"
fi

ts funnel status || true

# --- 3. record it for post-build -------------------------------------------
#
# post-build.sh reads EXT_PROXY_URL and writes it on-chain, so the value has to
# be final before that runs.

if [ -f "$ENV_FILE" ]; then
    if grep -qE '^EXT_PROXY_URL=' "$ENV_FILE"; then
        # sed with | as delimiter: the value contains slashes.
        sed -i "s|^EXT_PROXY_URL=.*|EXT_PROXY_URL=$url|" "$ENV_FILE"
    else
        printf 'EXT_PROXY_URL=%s\n' "$url" >> "$ENV_FILE"
    fi
    log "wrote EXT_PROXY_URL to $(basename "$ENV_FILE")"
    log "run ./scripts/use-chain.sh coston2 to copy it into the active .env"
else
    log "no .env.coston2 found; set EXT_PROXY_URL=$url yourself"
fi

cat <<EOF

[funnel] public URL: $url

Verify once the proxy is up:
  curl -sS $url/info | jq .

Then, in order:
  ./scripts/use-chain.sh coston2
  bash ./scripts/pre-build.sh
  ./scripts/start-services.sh
  bash ./scripts/post-build.sh     # writes $url on-chain — must be final by now
EOF
