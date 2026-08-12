# Tier 2 — the real FCC path on Coston2, simulated attestation

Runs the whole pipeline for real — real instruction dispatch through FlareTeeManager, the
real Go enclave unsealing and pricing via FTSO, a real `Attested` event, a real capped
borrow — with `SIMULATED_TEE=true`, which Flare supports on Coston2 for the hackathon.
Only the hardware root is simulated, and the browser renders that honestly (`mode: 1`,
amber SIMULATED badge). No GCP, no billing.

The generic mechanics live in [deployment-steps.md](deployment-steps.md) and
[testing-against-coston2.md](testing-against-coston2.md). This doc is the VaultProof
ordering plus the parts specific to us.

## 0. Cost, stated plainly

| Piece | Cost |
| --- | --- |
| Go, Docker | free (`sudo snap install go --classic`, `sudo snap install docker`) |
| Gas (register extension + TEE, anchor, borrow) | free — Coston2 faucet C2FLR |
| Indexer DB access for the proxy `[db]` block | free, **but gated** — see §1 |
| Stable public HTTPS hostname | free **if** one of §2's options works for you |

## 1. Get the two external inputs first

Everything else is mechanical; these two can stall you indefinitely, so start them first.
Neither responds to effort — both are grants from Flare.

**Indexer DB access — the hardest blocker.** The ext-proxy reads Flare's Coston2 indexer at
`35.241.249.150:3306`, and `deployment-steps.md` lists **VPN access to Flare's network** as
a prerequisite. The host is not reachable from the open internet, so credentials alone are
not enough. Without the proxy running, no TEE machine reaches `PRODUCTION` and no dispatched
instruction is ever delivered — which presents as a machine stuck at status 1 and 404s from
the FTDC proxy.

Ask in the hackathon channel for **both** the VPN access and the database name; credentials
are distributed there too. Confirm reachability before doing anything else:

```bash
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/35.241.249.150/3306' && echo reachable
```

**A stable public HTTPS hostname.** The URL is stored **on-chain** at registration and
providers keep POSTing to it; a quick-tunnel URL that rotates on restart strands the
registration (per the FCC FAQ — this overrides the quick-tunnel default in
[cloudflared.md](cloudflared.md)). Free options, in order of preference:

1. **You own a domain** → Cloudflare **named** tunnel (free plan): add the domain to
   Cloudflare, `cloudflared tunnel create`, set `TUNNEL_ARGS=run --token …` in `.env` —
   the scaffold's cloudflared compose supports named tunnels natively. Stable hostname,
   no port-forwarding, works behind CGNAT.
2. **No domain, home network allows inbound** → free DuckDNS subdomain + Caddy
   auto-HTTPS + router port-forward of 443. Free, but dead on CGNAT (common on Indian
   ISPs — if your router's WAN IP differs from `curl ifconfig.me`, you are CGNATed;
   use option 1 or 3).
3. **Neither** → Oracle Cloud Always Free VM ($0, card required for identity) or any
   ~$5/mo VPS. This is the only path that can cost money.

## 2. Fill the two gitignored config files

Both already exist with placeholders:

- `.env.coston2` — set `DEPLOYMENT_PRIVATE_KEY` (the deployer,
  `0xEa0d…730e`, already holds ~94 C2FLR), `PROXY_PRIVATE_KEY`, and `EXT_PROXY_URL`.
- `config/proxy/extension_proxy.coston2.docker.toml` — fill `[db]` from §1.

## 3. Order of operations

```bash
cd extension
./scripts/use-chain.sh coston2          # .env.coston2 → .env

# sanity check (already green as of the last run — 29 tests, vet clean)
(cd go && go build ./... && go vet ./... && go test ./...)

bash ./scripts/pre-build.sh             # deploys InstructionSender, registers the
                                        # extension → writes config/extension.env
./scripts/start-services.sh             # builds + starts redis, ext-proxy, extension-tee
bash ./scripts/post-build.sh            # registers the TEE machine (rRap), reaches PRODUCTION
./scripts/test.sh                       # scaffold round-trip through the deployed extension
```

Then route public HTTPS: `<hostname>` → port **6674** (proxy external; container 6664).

## 4. The gates that fail silently

From the FCC FAQ — when a dispatched instruction never arrives, it is one of these, and
nothing errors:

- machine not **status 2 (PRODUCTION)**
- availability check older than **6h**
- no registered **teeId**
- registered URL dead or changed
- **multiple machines** registered under the extension — each dispatch picks one, so a
  stale sibling swallows requests at random. One active machine per endpoint; pause the
  rest (`tools/cmd/query-tee` lists them).

Every TEE restart mints a new identity: restart → re-register (`post-build.sh`) → pause
the stale machine. There is no restoring an old teeId.

Debug order: on-chain dispatch → machine status + URL → availability freshness →
`$EXT_PROXY_URL/info` → `/action/status/<epoch>/<id>` →
`instructions_received / instructions_rejected` metrics. A 404 from Flare's FTDC proxy
does not mean it is down — for a recent action it usually means the instruction never
reached it.

## 5. VaultProof's browser endpoints (outside the FCC flow)

FCC only routes `/instruction` to the proxy. VaultProof's `/quote` and `/sealed` sit on
the **extension** port and are called by the user's browser directly.

`docker-compose.coston2.yaml` maps port 7702 (loopback by default). For a public deploy:

```bash
# .env additions
EXTENSION_BIND=0.0.0.0:7702        # or keep loopback and reverse-proxy to it
ALLOWED_ORIGINS=http://localhost:3000   # exact frontend origin(s), comma-separated
```

Route a second HTTPS path or hostname to 7702 — e.g. `enclave.<host>` → 7702 alongside
`proxy.<host>` → 6674. Any reverse proxy is fine; the browser trusts none of it (the key
binding is inside the quote). Just don't strip the `Access-Control-Allow-Origin` header
the extension sets.

## 6. Flip the frontend

```bash
# web/.env.local
NEXT_PUBLIC_VAULTPROOF_MODE=live
NEXT_PUBLIC_ENCLAVE_URL=https://<the 7702 hostname>
```

Restart the dev server (`NEXT_PUBLIC_*` is inlined at build time). Stage 2 fetches the
real quote — SIMULATED badge, honestly — and stages 4–6 run against Coston2 for real.
The Vercel deploy can stay `mock` until the enclave URL is stable.

## 7. Definition of done

- [ ] `curl $EXT_PROXY_URL/info` → your `extensionId`, `platform: TEST_PLATFORM`
- [ ] `query-tee` shows exactly **one** machine, status PRODUCTION
- [ ] `./scripts/test.sh` passes (scaffold SAY_HELLO round-trip)
- [ ] `curl https://<enclave-host>/quote` → `mode: 1`, measurement, pubkey
- [ ] Browser pipeline end-to-end: verify → seal → anchor (real tx) → enclave →
      `Attested` event → borrow within cap
