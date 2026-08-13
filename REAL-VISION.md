# REAL-VISION — what VaultProof is when the hardware is real

**Status: the app in this repo runs in mock mode.** The enclave is simulated in your
browser tab, the chain writes are fabricated, and the quote says so out loud (`mode: 1`,
rendered as an amber SIMULATED badge). This document specifies the system it is a model
*of* — what changes, what does not, and exactly what stands between the two.

It exists so the gap is a written spec rather than a vague promise. Everything below is
either already built and unexercised, or named as missing.

---

## 1. Why mock mode is not the product

VaultProof's claim is narrow and total: **the code that reads your exchange credential runs
in hardware nobody — including us — can read into, and you can check that yourself before
you hand it over.**

Mock mode cannot make that claim, and does not try to. What it demonstrates is the *shape*
of the interaction and the parts that are genuinely real even in the model:

| Real in mock mode | Simulated in mock mode |
| --- | --- |
| RFC 9180 HPKE sealing in your browser (X25519 / HKDF-SHA256 / ChaCha20-Poly1305) | The platform signature. Nothing signed the quote. |
| The enclave X25519 keypair, and the unseal roundtrip — a tampered blob genuinely fails | The hardware root. There is no SEV-SNP behind it. |
| The three attestation checks in `lib/attestation/verify.ts`, including the key-binding check | The chain writes. Deterministic fake tx hashes in `localStorage`. |
| The state machine's sealing gate — `startSeal()` throws unless status is `verified` | The exchange call and FTSO pricing. Fixture holdings. |

The honest summary: **mock mode proves the cryptography and the control flow. It proves
nothing about the trust model**, because the trust model is entirely a property of the
hardware and the signature chain, and those are the two things it fakes.

---

## 2. The real architecture

```
Browser                     Confidential Space VM              Coston2
───────                     ─────────────────────              ───────
                            ┌───────────────────────┐
  GET /quote ──────────────►│ enclave (port 7702)   │
                            │  · X25519 keypair     │
  ◄──── signed JWT ─────────│    minted at boot     │
       (Google-signed)      │  · asks launcher for  │
                            │    a token per request│
  verify signature ─────────┼──► Google JWKS        │
  vs Google's key set       │                       │
                            │                       │
  check measurement ────────┼───────────────────────┼──► TeeMeasurementRegistry
  is whitelisted            │                       │      .isWhitelisted()
                            │                       │
  seal(credential) ─────────┼───────────────────────┼──► InstructionSender
   HPKE to attested key     │                       │      .submitRequest(hash)
                            │                       │
  POST /sealed ────────────►│ blob held, inert      │
       (ciphertext)         │                       │
                            │                       │
                            │ ATTEST_SOLVENCY ◄─────┼─── on-chain instruction
                            │  1. unseal            │
                            │  2. query exchange    │
                            │  3. price via FTSO ───┼──► FTSO feeds
                            │  4. reduce to tier    │
                            │  5. sign, zeroize     │
                            │                       │
                            │  submitAttestation ───┼──► SolvencyRegistry
                            └───────────────────────┘         │
                                                              ▼
                                                        LendingPool.borrow()
                                                        capped by tier
```

The load-bearing property is that **the launcher signs the measurement, not the workload.**
The Confidential Space launcher sits outside the container's control, so the enclave cannot
mint a token describing an image other than the one that actually booted. That is what
converts "trust the operator" into "check the hash", and it is the single thing mock mode
cannot simulate.

---

## 3. What must be true, end to end

Each of these is a hard gate. The pipeline stops at the first one that fails, with no
override anywhere.

**1. The enclave reports `mode: 0`.** It fetched a token over the launcher's unix socket at
`/run/container_launcher/teeserver.sock`. If that socket is absent the code falls back to
simulated and says so rather than pretending — see `extension/go/internal/vaultproof/attest.go`.

**2. The token's signature verifies in the browser** against Google's published
Confidential Computing key set, with `alg:none` and a wrong issuer both rejected outright
(`web/lib/attestation/jwks.ts`). This must never move to a backend: a signature our own
server checks for you proves nothing to you.

**3. The enclave's public key is inside the signed payload** as `eat_nonce`, and matches the
key the browser is about to encrypt to. This is the check that defeats a relay substituting
its own key, and it is the one the whole product rests on.

**4. The measurement is whitelisted on-chain** in `TeeMeasurementRegistry`, and it equals
the digest of a reproducible build anyone can reproduce from this repo.

**5. The hash is anchored before the ciphertext moves.** Putting ciphertext in calldata
would publish it permanently, so a future key compromise would retroactively expose every
credential ever submitted. Only `keccak256(blob)` goes on-chain.

**6. Pricing happens inside the enclave via FTSO**, not from the exchange's own dollar
figure — otherwise anyone running a server that speaks the Kraken wire format could mint
themselves a top tier.

**7. Nothing credential-derived leaves.** No logging on the path, byte slices rather than Go
strings so buffers can be scrubbed, `Zeroize` in defers. What reaches the chain is a wallet,
a tier, an expiry, a nullifier and a measurement — about 2.5 bits of information about
someone's wealth.

---

## 4. What is already built, and how far it has been exercised

This code is on the real path today. Some of it now has a verified local run behind it
(README, "What has actually been executed"); none of it has run on real hardware, which is
the whole reason this document is separate from the README.

| Piece | Where |
| --- | --- |
| Launcher token fetch, nonce binding, claim parsing | `extension/go/internal/vaultproof/attest.go` |
| Browser-side signature verification against Google's JWKS | `web/lib/attestation/jwks.ts` |
| The three client-side checks | `web/lib/attestation/verify.ts` |
| Live enclave client (`/quote`, `/sealed`, `/state`) | `web/lib/adapters/live/enclave.ts` |
| Live Coston2 client — viem + wagmi against the deployed contracts | `web/lib/adapters/live/chain.ts` |
| HPKE unseal, Kraken HMAC reads, FTSO pricing, HMAC nullifier | `extension/go/internal/vaultproof/` |
| Five deployed, Blockscout-verified contracts | `contracts/src/vaultproof/` |

The Go enclave, its HPKE unseal against a browser-format blob, and its single-use replay
defence have been run and verified locally in simulated mode. What remains unexercised is
the hardware root and the FCC on-chain instruction path.

Two fixes were made specifically for the real path:

- **CORS on the enclave** (`extension/go/internal/extension/cors.go`). The browser calls
  `/quote` and `/sealed` cross-origin; with no headers it is blocked before reaching the
  handler. `ALLOWED_ORIGINS` is a comma-separated allowlist, empty meaning any origin.
  CORS is not a security boundary here and is not treated as one — nothing on those paths
  carries ambient authority, and `Access-Control-Allow-Credentials` is never sent.

- **Measurement consistency** (`extension/go/internal/extension/extension.go`). The browser
  binds its HPKE `info` to the measurement it read from the quote, while the enclave used to
  open with a boot-time value from env vars. On Confidential Space those differ, so *every
  unseal would have failed*. The enclave now adopts the launcher-signed digest at boot and
  on each quote.

> Both now compile and are covered by tests — `go build ./...`, `go vet ./...` and
> `go test ./...` are clean, including four CORS tests. The CORS headers have been
> confirmed against a live enclave, preflight included. Neither has run on Confidential
> Space.

---

## 5. What is missing

Honest list, in the order it blocks.

**1. A running deployment.** The enclave runs locally and its crypto is verified, but
nothing has ever run as a *deployed* service that the frontend or the FCC providers can
reach. Two tiers:

- **Near term, zero cost:** the real FCC path on Coston2 with `SIMULATED_TEE=true`, which
  Flare supports for the hackathon — real dispatch, real enclave logic, real attestation
  event, real borrow; only the hardware root simulated and labelled as such.
  [`extension/docs/coston2-simulated.md`](extension/docs/coston2-simulated.md).
- **The end state:** GCP Confidential Space, `mode: 0`.
  [`extension/docs/confidential-space.md`](extension/docs/confidential-space.md).

**2. Indexer database access — resolved.** The scaffold's ext-proxy reads Flare's Coston2
indexer, and that database is reachable from the open internet: Coston2 requires no VPN,
per [Flare's FCC troubleshooting guide](https://dev.flare.network/fcc/troubleshooting).
The VPN prerequisite the scaffold inherited applies to Coston, not Coston2. The current
host and database name are in [Build Your First Extension](https://dev.flare.network/fcc/guides/getting-started);
read-only credentials come from Flare support. The `35.241.249.150:3306` host named in
older docs is dead — it answers ICMP but refuses the port, and its credentials have been
rotated. Verified against the live database: it carries the `SigningPolicyInitialized` and
`VoterRegistered` logs and the `signNewSigningPolicy` transactions the proxy queries, at
roughly 8 seconds behind chain head, well inside the proxy's 140-second tolerance.

A stable public HTTPS hostname was the next blocker; it is solved. Tailscale Funnel gives
`https://<machine>.<tailnet>.ts.net` — stable across restarts, valid certificate, dual
stack, free, and no domain required. `extension/scripts/funnel-daemon.sh` and
`funnel-up.sh` bring it up and record the URL in `.env.coston2`.

**The real remaining blocker is in this repository.**
`VaultProofInstructionSender.submitRequest` only emits `RequestSubmitted`; it never calls
`TEE_EXTENSION_REGISTRY.sendInstructions`, which is the call that actually dispatches an
instruction to a TEE machine. The scaffold's `sendSayHello` makes that call and VaultProof's
equivalent does not, so a user can seal, anchor and pay gas, and the enclave is still never
asked to do anything. This was masked until now because the live enclave adapter reported
each step done on a timer rather than on evidence.

Closing it is a contract change plus a redeploy chain: implement the dispatch, redeploy the
sender, and redeploy `SolvencyRegistry` and `LendingPool`, because the registry stores the
sender address as an `immutable` and cannot be repointed. Then re-list the build's
measurement and update `web/lib/config/addresses.ts`.

**3. Port routing for the browser endpoints.** Stock FCC publishes only port 6664 (the
proxy); the base `docker-compose.yaml` gives `extension-tee` no `ports:` mapping at all.
VaultProof's `/quote` and `/sealed` sit on 7702 and must be reachable from the browser.
`docker-compose.coston2.yaml` now maps it, bound to loopback by default.

**4. Extension registration.** `config/extension.env` does not exist — `pre-build.sh` has
never been run, so there is no `EXTENSION_ID`. Without it the on-chain instruction path
cannot route `ATTEST_SOLVENCY` to the enclave, and stage 5 has nothing driving it.

**5. A whitelisted real measurement.** `TeeMeasurementRegistry` currently lists the
simulated-build stand-in. The real digest gets listed with
`contracts/script/vaultproof/WhitelistMeasurement.s.sol`, which reads the flag back through
`isWhitelisted` and reverts if the write did not take.

**6. A real exchange credential.** The smoke harness reaches `query:` and stops there with a
fake key — confirming every step before it, and confirming that nothing in the pipeline has
yet been exercised against a real balance.

---

## 6. The switch

Going live is deliberately not a rewrite. `lib/adapters/types.ts` defines two interfaces —
`EnclaveClient` and `ChainClient` — with a mock and a live implementation of each. No file
under `app/` or `components/` references a mock, an address literal, or a transport.

```bash
NEXT_PUBLIC_VAULTPROOF_MODE=live
NEXT_PUBLIC_ENCLAVE_URL=https://<the enclave's public URL>
```

Both are inlined at build time, so a Vercel deploy needs them set before the build, not
after.

**One code change should accompany that flip.** Today `checkSignatureBinding` *passes* a
`mode: 1` quote with a note saying the root is simulated — correct for mock mode, wrong for
production, where a simulated quote is signed by nobody and its measurement and embedded key
are whatever the operator typed. A live build should fail closed on `mode !== 0`, so the
refusal is structural rather than a badge the user is expected to notice.

---

## 7. What stays true in both modes

Worth stating, because it is what makes the mock defensible as a demo rather than a
pretence:

- The sealing is real HPKE. Only the private key's location is fictional.
- The verification logic is the same code in both modes.
- The sealing gate is structural — stage 3 is not mounted in the render tree until the store
  says verification passed, so there is no DOM to prise open and no handler to call early.
- The mock enclave actually unseals what the browser sealed. A tampered blob genuinely
  fails, exactly as the Go handler would fail it.
- The quote never claims to be something it is not. `mode: 1` is in the payload, on the
  badge, in the stage-2 detail panel, and in the footer.

---

## 8. Residual risks, unchanged by any of the above

These survive a successful hardware deployment and are not solved by it.

- **Attestation freshness.** A quote proves the code that booted, not the code running at
  request time. Per-request tokens narrow this; nothing closes it.
- **Side channels.** AMD SEV has a published history of them. Adequate at moderate size, not
  a claim of perfection.
- **Exchange trust.** If Kraken lies about a balance, VaultProof faithfully attests a lie.
  The system proves what a named source said, not what is true.
- **Governance.** Whoever controls whitelisting is a trusted role. Not trustless end to end,
  and it does not claim to be.
- **Ephemeral identity.** Confidential Space has no persistent storage, so every relaunch
  mints a new enclave keypair. Held quotes are invalidated and the old machine stays
  registered on-chain until replaced.
