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
| Indexer DB access for the proxy `[db]` block | free — credentials from Flare support, no VPN |
| Stable public HTTPS hostname | free — see §1 |

## 1. Get the one external input first

Everything else is mechanical. Only the hostname can stall you, so start it first.

**Indexer DB access — not a blocker, despite what older docs say.** The ext-proxy reads
Flare's Coston2 indexer, and **Coston2 requires no VPN**: per
[Flare's FCC troubleshooting guide](https://dev.flare.network/fcc/troubleshooting), "Coston2
access does not require a VPN… Coston uses different credentials and adds a VPN requirement,
and FCC development is on Coston2." The scaffold inherited Coston's prerequisite by mistake.

Take the host and database name from
[Build Your First Extension](https://dev.flare.network/fcc/guides/getting-started), and
request read-only credentials through Flare support. **Do not use `35.241.249.150` from
older docs** — it is dead (answers ICMP, refuses 3306) and those credentials were rotated.

Confirm reachability before doing anything else, substituting the documented host:

```bash
mysql -h <documented-host> -u <user> -p -e "SELECT MAX(number) FROM blocks;" indexer
```

The proxy needs the block head within **140 seconds** of chain head (`liveness.go`), plus
`Relay.SigningPolicyInitialized` logs, `VoterRegistry.VoterRegistered` logs, and
`FlareSystemsManager.signNewSigningPolicy` transactions. Flare's instance indexes exactly
those, so a successful connection is effectively the whole check.

**A stable public HTTPS hostname — the real blocker.** The URL is stored **on-chain** at
registration and providers keep POSTing to it; a quick-tunnel URL that rotates on restart
strands the registration (per the FCC FAQ — this overrides the quick-tunnel default in
[cloudflared.md](cloudflared.md)). Free options, in order of preference:

1. **No domain needed** → **Tailscale Funnel**. Gives a stable
   `https://<machine>.<tailnet>.ts.net` with a valid public certificate, reachable by
   anyone on the internet without a Tailscale account, and it works behind CGNAT with no
   port-forwarding. Funnel is [available on all plans including free](https://tailscale.com/kb/1223/funnel)
   and listens on 443, 8443 or 10000. Bandwidth limits are non-configurable but ample for
   a demo. This is the best fit if you do not own a domain.
2. **You own a domain** → Cloudflare **named** tunnel (free plan): add the domain to
   Cloudflare, `cloudflared tunnel create`, set `TUNNEL_ARGS=run --token …` in `.env` —
   the scaffold's cloudflared compose supports named tunnels natively.
3. **Home network allows inbound** → free DuckDNS subdomain + Caddy auto-HTTPS + router
   port-forward of 443. Dead on CGNAT (common on Indian ISPs — if your router's WAN IP
   differs from `curl -4 ifconfig.me`, you are CGNATed; use option 1).
4. **Last resort** → Oracle Cloud Always Free VM ($0, card required for identity) or any
   ~$5/mo VPS. The only path that can cost money.

**ngrok's free tier is unsuitable**, despite the static domain it now offers: free
endpoints serve an interstitial warning page unless the caller sends an
`ngrok-skip-browser-warning` header, and FTDC providers are independent operators who will
never send it.

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
With Tailscale Funnel that is `tailscale funnel 6674`, and the resulting
`https://<machine>.<tailnet>.ts.net` is what goes in `EXT_PROXY_URL`.

Note which port serves what, because the FCC FAQ cites the scaffold's *default* ports
rather than this repo's: `/instruction` and `/info` are on the **external** port (container
6664, host 6674), while `/ready`, `/healthy` and `/startup` are on the **internal** port
(container 6663, host 6673). The FAQ's `:6661/ready` is the default config's internal port;
here it is `localhost:6673/ready`.

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

## 5a. Choosing an exchange

Two adapters ship: **Kraken** and **Binance**. The sealed payload names one, and the
enclave refuses anything else before making a request.

From India, use **Binance**: it has been FIU-IND registered since August 2024 and is
available to Indian users, while Kraken has been unregistered since December 2023. Create
a key under Binance → Account → API Management with **Enable Reading** and nothing else.

Binance is signed differently from Kraken — HMAC-SHA256 over the query string, hex, with
the key in an `X-MBX-APIKEY` header — and the signature covers the query string exactly as
transmitted, so the enclave builds that string once and never re-encodes it.

If you have no exchange account at all, point the enclave at a stub instead:

```bash
# .env addition — simulated runs only
VAULTPROOF_EXCHANGE_BASE_URL=https://your-stub.example
```

The stub must answer `POST /0/private/Balance` with
`{"error":[],"result":{"XXBT":"1.5","ZUSD":"2000.0"}}`. Signature headers are sent but a
stub need not verify them.

This is refused on real hardware. `CheckExchangeOverride` fails closed when the
Confidential Space launcher socket exists, so the override works only where there is no
hardware claim to undermine, and `/quote` names the endpoint while it is active. Pricing
still runs through FTSO, so the stub controls quantities, not valuations.

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
