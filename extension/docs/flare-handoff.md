# Handing the VaultProof enclave to Flare's VM operator

> **Status: premise unconfirmed.** This doc reads `deployment-steps.md` §6's "hand off"
> as Flare operating the VM. The FCC FAQ since posted is phrased entirely as self-hosting
> ("your proxy", "re-register", "your registered URL") — so confirm the offer exists
> before building for it. The zero-cost, confirmed path is
> [coston2-simulated.md](coston2-simulated.md).

`deployment-steps.md` §6 offers two ways to get onto Confidential Space: run the VM
yourself, or hand the image to Flare's operator and receive a public URL back. This
document is the second path — no GCP account, no billing, no card.

It exists because VaultProof needs one thing beyond a stock FCC extension, and that
request is easier to grant if it arrives with the reasoning attached. **Read
[The routing request](#the-routing-request-read-this-first) before you build anything** —
if the answer is no, the rest of this is wasted effort and you should self-deploy instead
([confidential-space.md](confidential-space.md)).

## The routing request (read this first)

Stock FCC needs exactly one public port: **6664**, the `ext-proxy` container. Instructions
arrive on-chain, the proxy relays them inward, and the extension's own HTTP port is never
exposed — `docker-compose.yaml` gives `extension-tee` no `ports:` mapping at all.

VaultProof adds two endpoints on the extension port (**7702**) that a **browser** must
reach directly:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/quote` | GET | Serves the Confidential Space attestation token, with the enclave's X25519 public key bound inside it as `eat_nonce`. |
| `/sealed` | POST | Accepts an HPKE ciphertext, keyed by a request hash that was already anchored on-chain. |

So the ask is: **public HTTPS routed to port 7702**, in addition to 6664. Either a second
hostname, or paths `/quote` and `/sealed` on the existing one.

### Why exposing this is safe

The instinct to refuse — "we don't publish workload ports" — is right in general and does
not apply here. VaultProof's design already assumes everything between the enclave and the
browser is hostile:

- **The quote is signed by Google**, not by us and not by the proxy. The browser verifies
  that signature itself against Google's published key set
  ([`web/lib/attestation/jwks.ts`](../../web/lib/attestation/jwks.ts)), and rejects
  `alg:none` and any non-matching issuer.
- **The enclave's public key is inside the signed payload**, not served beside it. A relay
  that substitutes its own key breaks the binding and the browser hard-stops — this is the
  primary attack the product is built to defeat, and it is tested
  ([`verify.test.ts`](../../web/lib/attestation/verify.test.ts), "rejects a substituted
  relay public key").
- **Nothing on these paths carries ambient authority.** No cookies, no session, no
  `Authorization` header; `Access-Control-Allow-Credentials` is never sent.
- **A blob posted to `/sealed` is inert.** It is opaque bytes until an on-chain
  `ATTEST_SOLVENCY` instruction quotes a request hash that was anchored *first*, and it is
  single-use — `lookupSealedBlob` deletes on read.

The practical consequence: **any reverse proxy, load balancer or WAF may sit in front of
7702.** Terminating TLS elsewhere, rewriting paths, or rate-limiting all leave the security
argument intact, because the browser trusts none of that infrastructure to begin with. The
raw container port does not need to be reachable.

The one thing that must survive the hop is the response body and the CORS headers the
extension sets itself — the gateway should not strip `Access-Control-Allow-Origin`.

## What Flare needs from you

**1. The image.** Built reproducibly, as a registry URL+tag or a tar:

```bash
cd extension
SOURCE_DATE_EPOCH=1754400000 docker buildx build \
  --platform linux/amd64 \
  --output type=docker,rewrite-timestamp=true \
  -f go/Dockerfile -t vaultproof-fce:v0.4.0 .
```

`SOURCE_DATE_EPOCH` must be pinned. Unpinned, two builds of the same source produce
different digests and the on-chain whitelist stops meaning anything.

**2. Workload launch env.** Every one of these is in the image's
`tee.launch_policy.allow_env_override` label, so the VM will accept them; anything outside
that list is rejected at attestation time.

| Variable | Value | Notes |
| --- | --- | --- |
| `MODE` | `0` | Production attestation. The image already defaults to 0 — do not let it be overridden to 1, the frontend refuses simulated quotes. |
| `CHAIN_URL` | `https://coston2-api.flare.network/ext/C/rpc` | FTSO reads. |
| `CHAIN_ID` | `114` | Binds sealed blobs to Coston2. |
| `EXTENSION_ID` | from `config/extension.env` | Written by step 4 of `deployment-steps.md`. |
| `INITIAL_OWNER` | your deployer address | |
| `PROXY_URL` | proxy URL reachable from the TEE | |
| `ALLOWED_ORIGINS` | your frontend origin | e.g. `https://vaultproof.xyz`. Exact scheme and port; comma-separated for several. Wrong value ⇒ the browser blocks every request before it reaches the enclave. |

**3. The routing request** above.

## What you need back

| | Used for |
| --- | --- |
| Public proxy URL (port 6664) | `EXT_PROXY_URL` in `.env.coston2`, then `bash ./scripts/use-chain.sh coston2` |
| Public URL for the extension endpoints (port 7702) | `NEXT_PUBLIC_ENCLAVE_URL` in `web/.env.local` |

## Then, on your side

**1. Confirm it is real hardware.** Do this before anything else:

```bash
curl -s "$ENCLAVE_URL/quote" | jq '{mode, measurement, extensionVersion}'
```

`mode` must be `0`. A `1` means the launcher socket was unreachable — it is running, but
not as a confidential VM, and the frontend will refuse it.

Cross-check the proxy too, per `deployment-steps.md` §7:

```bash
curl -s "$EXT_PROXY_URL/info" | jq '.machineData'
```

`platform` should start with `0x4743505f414d445f534556` (GCP_AMD_SEV), and `codeHash` must
**not** be `0x194844cf…` — that value is the simulated placeholder.

**2. Whitelist the measurement on Coston2.** Until this lands, stage 2 check (c) fails and
the pipeline stops before anything is encrypted. That is correct behaviour, not a
misconfiguration.

```bash
cd contracts
export PRIVATE_KEY=0x...                    # TeeMeasurementRegistry owner
export TEE_REGISTRY=0xe1788fF42Fc5a5B4012d5af6f8B51fe3a3eF36f7
export ENCLAVE_MEASUREMENT=0x...            # the `measurement` from /quote
export MEASUREMENT_LABEL="vaultproof-fce:v0.4.0"

FOUNDRY_PROFILE=vaultproof forge script \
  script/vaultproof/WhitelistMeasurement.s.sol --rpc-url coston2 --broadcast
```

The `measurement` served by `/quote` is the digest the launcher signed. If it differs from
the digest of the image you built, the image that booted is not the image you built — stop
and find out why rather than whitelisting it anyway.

**3. Register the TEE machine** — `bash ./scripts/post-build.sh` (`deployment-steps.md` §8).

**4. Point the frontend at it.**

```bash
# web/.env.local
NEXT_PUBLIC_ENCLAVE_URL=https://<the 7702 URL>
```

`NEXT_PUBLIC_*` is inlined at compile time, so restart the dev server (or redeploy on
Vercel) after changing it.

## Two things that will bite

**Every relaunch mints a new TEE identity.** Confidential Space has no persistent storage,
so the enclave generates a fresh X25519 keypair at boot. A restart invalidates any quote a
browser is holding, and the old machine stays registered on-chain until it is replaced
(`deployment-steps.md` §9). Re-run `post-build.sh` after a relaunch.

**A rebuild is a new measurement.** Any source change produces a new digest, which must be
whitelisted again before the frontend will trust it. Plan the order: build → deploy →
read `/quote` → whitelist → test.
