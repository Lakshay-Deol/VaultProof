# VaultProof: Prove solvency. Reveal nothing

**Bounty 2 — Confidential Compute Apps (Flare Confidential Compute)**

VaultProof is a confidential solvency oracle on Flare Confidential Compute. A borrower seals a read-only exchange API key to a public key that only a hardware enclave holds. The enclave decrypts it, queries the exchange, prices the holdings with Flare's own FTSO feeds, and reduces everything to a coarse solvency tier plus a nullifier and an expiry.

What reaches the chain is a wallet address, a tier, an expiry, a nullifier and a code-hash measurement. Never the API key, the exchange name, the asset mix, the exact balance, or the account identifier. A LendingPool contract reads that tier to extend undercollateralised credit.

FDC brings public data on-chain. FCC brings private conclusions on-chain. FDC's security comes from replication, and replication is incompatible with secrecy: you cannot ask ten verifiers to check a balance behind one API key without giving ten verifiers the API key. That gap is what VaultProof fills.

## Target user

- **Crypto-holding borrowers locked out of undercollateralised credit.** Someone with 2,000 USDC on Flare and $52,000 on an exchange, who cannot borrow 8,000 USDC because the chain cannot see off-chain wealth and there is no safe way to prove it.
- **Lending protocols that want a solvency signal without custody of user data.** A pool that would extend a larger cap given evidence of off-chain assets, but does not want to hold, process, or be liable for exchange credentials.

## How it helps day-to-day life

Maya holds 2,000 USDC on-chain and $52,000 on Kraken. Her boiler dies and she needs 8,000 USDC for six weeks. She is good for it many times over, but every on-chain lender sees 2,000 USDC and lends her about 1,600.

Her three options today all cost her something.

- Selling the exchange position is a taxable event and loses a position she wanted to keep, to solve a six-week gap.
- An exchange loan desk means KYC, custody, jurisdiction limits and days to weeks of waiting.
- Handing an API key to a scoring service means their ops team can read her live balances, and their breach becomes her breach.

<img width="1768" height="653" alt="image" src="https://github.com/user-attachments/assets/ca22ff1d-0ff7-4b64-8b8c-878f204c91cb" />




Each trades away the position, the time, or the privacy. VaultProof trades away none. She seals a read-only key, the enclave publishes T3, the pool raises her cap.

The same machine answers other questions. Swap the final reducer and you get proof of income for renting, an income band instead of three months of bank statements listing every merchant and habit. Or proof of reserves for custodians, solvency without publishing the treasury layout to competitors. Or private KYC: over 18, not sanctioned, resident of X, computed over documents no database ever holds.

The general shape is a private fact you can prove but not safely share.

## Full flow, six stages

Each stage is gated on the last in code, not in the UI.

1. **Connect.** The attestation binds to a wallet address, so the address has to exist first. Public: the wallet. Sealed: nothing yet.
2. **Verify the enclave.** Three checks run in the browser before anything is encrypted. Public: the measurement and enclave public key. Sealed: the operator cannot substitute their own key.
3. **Seal the credential.** Real RFC 9180 HPKE in the browser, X25519 with HKDF-SHA256 and ChaCha20-Poly1305. Public: the ciphertext length. Sealed: the API key, the secret, the exchange.
4. **Anchor.** The hash goes on-chain, the ciphertext does not. Public: keccak256 of the blob and a transaction hash. Sealed: the blob never enters calldata.
5. **Enclave.** Unseal, query, price, reduce, sign, then wipe. Public: "processing". Sealed: the balance, the asset mix, the account identifier.
6. **Attested, then borrow.** Public: tier, expiry, nullifier, build hash. Sealed: everything else, permanently.

                         USER CREDENTIAL
                                |
                                v
                         +-------------+
                         |     HPKE    |
                         |  Encryption |
                         +------+------+
                                |
                                v
                      CONFIDENTIAL TEE
                                |
                 +--------------+--------------+
                 |                             |
                 v                             v
             PRIVATE                       PUBLIC
             DISCARDED                     OUTPUT
                 |                             |
        +--------+--------+             +------+--------+
        |                 |             |               |
        +-----------+     +-----------+   +---------+    +---------+
        | API key   |     | API secret|   | Wallet  |    | Tier    |
        +-----------+     +-----------+   +---------+    +---------+
        | Exchange  |     | Exact     |   | Expiry  |    |Nullifier|
        |           |     | balance   |   |         |    |Code hash|
        | Asset mix |     | Account ID|   |         |    |         |
        +-----------+     +-----------+   +---------+    +---------+



Four details carry the security.

- The signature is verified in the user's browser against Google's published keys, never on our backend, because a signature our own server checks for you proves nothing to you.
- The enclave's public key sits inside the signed token as the attestation nonce, so a relay that swaps in its own key fails on the user's machine.
- The hash is anchored before the ciphertext moves, because putting ciphertext in calldata would publish it permanently and a future key compromise would retroactively expose every credential ever submitted.
- And pricing happens inside the enclave using FTSO, because if it trusted the exchange's own dollar figure, anyone running a server that speaks the Kraken wire format could mint themselves a top tier.

After all six stages the chain knows roughly 2.5 bits about Maya's wealth. That is the entire public footprint of a $52,000 credit decision.

## How the project uses Flare

**FCC and Confidential Space** run the handler in a VM the host cannot read, and the launcher, which sits outside the container's control, signs a statement of which image booted. Without it there is no version of this on a normal server: somebody's ops team reads live credentials, and the entire product is that nobody can.

**FTSO** prices the holdings inside the enclave, from the same chain the loan settles on. Without it a self-hosted "exchange" could inflate itself into the top tier.

**The measurement registry** is an on-chain whitelist of trusted code hashes, checked before the browser encrypts anything. Without it, "trust the code, not the operator" is unverifiable, because the operator would be the party telling you which hash to trust.

**Coston2** hosts the registry, the pool and the instruction sender. It anchors requests, stores attestations and enforces the tier cap at drawdown. Without it the enclave's output is a dashboard receipt, not a credit decision.


                         FLARE
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
        FCC               FTSO           Coston2
          │                │                │
          │                │                ├── Registry
          │                │                ├── LendingPool
          │                │                └── InstructionSender
          │                │
          ▼                ▼
    Confidential        Canonical
      Compute            Pricing
          │                │
          └───────┬────────┘
                  ▼
            SOLVENCY PROOF
                  │
                  ▼
           On-chain credit



## What was newly built

Used as-is: Flare's fce-extension-scaffold, flare-foundry-starter and flare-viem-starter.

Built during the program:

- **Five Solidity contracts**, deployed on Coston2. `SolvencyRegistry` enforces expiry in the read path, handles nullifier collisions, and re-checks the measurement at write time. `LendingPool` applies tier caps that extend rather than replace collateral. `VaultProofInstructionSender` anchors the request hash, dispatches the `ATTEST_SOLVENCY` instruction through Flare's `TeeExtensionRegistry`, and owns the TEE write path back. Plus the measurement registry and a test USDC token.
- **The solvency enclave in Go:** HPKE unseal, signed read-only balance reads from two exchanges — Kraken (HMAC-SHA512 over the request path) and Binance (HMAC-SHA256 over the query string) — FTSO pricing resolved through the Flare contract registry, an HMAC nullifier, and zeroization in defers. Credentials are held in byte slices, never strings, because Go strings cannot be scrubbed. Adding an exchange is one adapter plus one line in the dispatcher; the sealed payload names the exchange, and anything without an adapter is refused before a request is made.
- **Real hardware attestation.** The enclave requests a token from the Confidential Space launcher over its unix socket, binds its X25519 key as the attestation nonce, and reports the signed image digest as its measurement. A fresh token per request, not one minted at boot and replayed.
- **Real quote verification.** The browser fetches Google's Confidential Computing key set and verifies the token signature with WebCrypto, enforcing issuer and expiry and rejecting `alg:none`.
- **The whole frontend:** four pages, six pipeline stages, mock and live adapter seams, a state machine, real in-browser HPKE, and the design system. The directory was empty at the start of the program.
- **Both live adapters:** viem and wagmi against the deployed contracts, and the enclave client against the quote and sealed endpoints. The enclave client waits for the enclave's attestation counter to actually move before reporting the run complete — it previously advanced on a timer, which rendered five green checks for a run that never happened.
- **The attack simulator.** Stage 2 ships a "Try breaking it" control that runs a substituted relay key and an unwhitelisted build against the same verifier the honest path uses. Both hard-stop with no override.
- **Browser-reachable enclave endpoints.** `/quote` and `/sealed` are called by the user's browser directly, which stock FCC never needs — so the enclave serves its own CORS with an `ALLOWED_ORIGINS` allowlist. CORS is not treated as a security boundary here: nothing on those paths carries ambient authority, and the key binding inside the signed quote is what makes an untrusted relay safe.
- **A demo bridge** (`extension/go/cmd/demo-bridge`) that completes stages 5 and 6 when FCC
  provider delivery does not. It stands in for that one hop and nothing else: it calls the
  real enclave over the same `/action` endpoint a provider would use, with the same
  opType/opCommand and the same message schema the contract emits, then writes the result
  through the real `deliverAttestation`, where `SolvencyRegistry` re-checks the measurement
  whitelist, the nullifier and expiry. Watch mode polls `RequestSubmitted` so a browser run
  finishes on its own.
- **A stub exchange** (`extension/testing/stub-exchange`) so the pipeline can be exercised
  with no exchange account at all, reached only via `VAULTPROOF_EXCHANGE_BASE_URL`, which
  the enclave refuses on real hardware and reports on `/quote` while active.
- **86 tests:** 39 Go, 14 Foundry, 33 web unit, plus live checks against Coston2.

Five real bugs were found and fixed along the way. The scaffold's `teeutils.ToHash` right-pads a string into a `bytes32` while the contract and frontend use keccak256, and the two disagree completely with a silent failure. Blob delivery was keyed by SHA-256 while the browser anchors keccak256, so the enclave would never have found the blob. The attestation check verified the token's binding but never its signature, so a forged token with matching fields would have passed.

The last two are the same shape as the first — a value that has to be identical on both sides, and isn't. The enclave opened sealed blobs using a boot-time measurement read from environment variables, while the browser binds its HPKE context to the measurement it read from the quote; on Confidential Space the launcher supplies a different value, so **every unseal would have failed** with an error that named nothing useful. The enclave now adopts the launcher-signed digest as its identity. And `wagmi` was configured with `storage: null` alongside `ssr: true`, an unsupported pair that threw on every page load and aborted the rest of wallet setup.

## Deployment details

Flare Coston2 testnet, chain ID 114. All five contracts verified on Blockscout.

| Contract                      | Address                                      |
| ----------------------------- | -------------------------------------------- |
| `SolvencyRegistry`            | `0xeB50b0128528307F7a67b2a58Ab704C0882fAC0C` |
| `LendingPool`                 | `0xa7D6eCdF3Ec224bE2c8C1b2C58ab45bd269D7cCB` |
| `VaultProofInstructionSender` | `0x56d517C498593dCE3706C44C72f5E5b5d0362b3e` |
| `TeeMeasurementRegistry`      | `0x2B5babD3acC1564a20f12aB6ac494De9919d546F` |
| `MockUSDC (tUSDC)`            | `0x94973B048F1b5cE9d94086CbAc5e3b810d2395d9` |

Registered as FCC extension **66215**, with one TEE machine
(`0x926D3b96bce4D8B34D763e4458fA4102Eec60b4A`) in `PRODUCTION` against a public
proxy. The stack was redeployed on 2026-08-13: `SolvencyRegistry` stores the
instruction sender as an `immutable`, so fixing the sender required replacing the
registry and pool with it. The 2026-08-12 addresses in earlier revisions of this
table are superseded and their sender cannot dispatch.

Live evidence, from the 2026-08-13 stack:

- Request anchored from the browser, tx `0xd612…d617` — signed by the user, carrying the
  FCC instruction fee, dispatching `ATTEST_SOLVENCY` through Flare's `TeeExtensionRegistry`.
- **T2 attestation delivered**, tx `0xdce097f8cf1b5a9aed446d7cb26450905250c75ef5449f71388b1e11bb70bfc8`.
  The tier was computed inside the enclave — HPKE unseal, exchange query, FTSO pricing,
  reduction, signature — and `SolvencyRegistry.tierOf` now returns `2` for that wallet.
- The enclave's own counters agree: `attestationCount: 1`, `lastTier: 2`.
- A credential with a malformed secret was refused at the query step with
  `"API secret is not valid base64"` — naming the step and nothing else. No key material,
  no account identifier, no balance in the error that reaches an ActionResult.

Stage 5 in that run was driven by `cmd/demo-bridge`, which stands in for FCC provider
delivery and nothing else — see "Honest limitations".

## Technical execution

Each part can be checked independently:

**Mock mode — nothing to install beyond npm:**

- `cd web && npm run dev` — localhost:3000, all six stages, no wallet or funds needed

**Live mode against Coston2**, which needs the enclave running:

```bash
cd extension
./scripts/use-chain.sh coston2        # activates .env.coston2
./scripts/start-services.sh           # redis, ext-proxy, extension-tee
./scripts/funnel-daemon.sh            # Tailscale Funnel: stable public HTTPS,
./scripts/funnel-up.sh                #   no domain needed, writes EXT_PROXY_URL
bash ./scripts/post-build.sh          # registers the TEE machine, reaches PRODUCTION
```

- `curl localhost:7702/quote` — measurement, enclave public key, attestation mode
- `curl localhost:6673/ready` — proxy readiness; 503 here explains most silent failures
- `cd extension/go && go run ./cmd/smoke` — seals as the browser does, attests, checks replay
- `go run ./cmd/demo-bridge -watch` — completes stages 5–6 for a browser run
- `cd extension/testing/stub-exchange && go run .` — stand-in exchange, so no account is needed

Then set `NEXT_PUBLIC_VAULTPROOF_MODE=live` and `NEXT_PUBLIC_ENCLAVE_URL=http://localhost:7702`
in `web/.env.local` and restart the dev server.

A restart of the enclave mints a new TEE identity and the proxy caches the old one, which
presents as `/ready` returning 503 with `no new info` and `'forbidden': invalid teeID` in
the proxy log. `docker compose restart ext-proxy` clears it in about fifteen seconds.

### What has actually been executed

The distinction between "written" and "run" is the one worth being precise about, so it is
drawn explicitly rather than left to the reader.

**Run, reproducible with the commands above:**

The enclave serves a live quote, and the two independent HPKE implementations — `hpke-js`
in the browser, `cloudflare/circl` in Go — agree on the wire. The smoke harness seals
exactly as the browser does, delivers out of band, and drives an `ATTEST_SOLVENCY`
instruction through the real handler:

```
1. quote        measurement=0x7661756c7470… mode=1
   enclave key  0x4951ce44f82a5c8485…
2. sealed       112 bytes, requestHash=0xd9c4301270e0…
3. delivered    accepted=true
4. attest       status=1 log="ok"

RESULT: full attestation issued
5. replay       refused — blob was consumed on first use
```

Step 4 issues a real tier: unseal, exchange query, FTSO pricing, reduction and signature
all run. Point it at a real exchange key instead of the stub and the only thing that
changes is whose holdings are priced. Had the two HPKE sides drifted, it would have failed
at step 4 and said `unseal:` rather than `query:`. Step 5 confirms the replay defence — the
ciphertext is deleted on read, so the second attempt finds nothing.

Run against a credential the exchange rejects, step 4 stops at `query` with a message that
names the step and nothing else — no key material, no account identifier, no balance.

The browser-facing endpoints answer with the CORS headers a cross-origin `fetch` needs,
including the preflight that `POST /sealed` triggers:

```
$ curl -i -X OPTIONS -H "Origin: http://localhost:3000" … /sealed
HTTP/1.1 204 No Content
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Test suites, all green: **39 Go** (`go test ./...`), **14 Foundry**
(`FOUNDRY_PROFILE=vaultproof forge test`, run from `contracts/`), **33 web unit**
(`npm test`). `go vet` and `tsc --noEmit` are clean.

On-chain, from the deployment above: a T3 attestation delivered, 15,000 tUSDC borrowed, and
a 50,000 attempt reverted `over cap` — the contract refusing rather than trusting the front
end.

**Not run, and not claimed:**

- **Real hardware attestation.** The code path is complete and on the real path, but it has
  never executed on Confidential Space. Locally the enclave reports `mode: 1` and the UI
  renders it as SIMULATED.
- **Delivery of a dispatched instruction to the enclave.** Everything up to the dispatch
  now works and is verified on-chain: `submitRequest` anchors the hash and calls
  `sendInstructions`, the transaction succeeds and pays the fee, extension 66215 has one
  TEE machine in `PRODUCTION` with a fresh availability proof, and the proxy is publicly
  reachable with `/ready` returning 200. What has not been observed is a provider actually
  delivering that instruction to the proxy: the enclave logs show only `F_GET/TEE_INFO`
  heartbeats, never a `VAULTPROOF/ATTEST_SOLVENCY` action. Per Flare's FCC FAQ, whether
  each provider attempted delivery and what response it got is not publicly queryable — it
  lives in provider logs — so this is the one link that cannot be closed from inside this
  repository.

[REAL-VISION.md](REAL-VISION.md) specifies what the second column requires, in the order it
blocks.

## Honest limitations

The demo in this repo runs in mock mode. **[REAL-VISION.md](REAL-VISION.md)** specifies the
system it is a model of — the real architecture, what is already built and unexercised,
what is missing in the order it blocks, and the risks that survive a successful deploy.

**Hardware mode has never executed.** The attestation code is real and on the real path, and on Confidential Space it fetches a genuine AMD SEV-SNP-backed token that the browser verifies against Google. But it has not been run on that hardware, so no claim is made that it has. Locally it reports simulated mode and the UI renders it as such. Every failure branch fails closed to simulated rather than overclaiming.

What *has* run is narrower and stated above: the enclave itself, its HPKE unseal against a browser-format blob, and its replay defence. The gap is the hardware root and the on-chain instruction path, not the enclave logic.

**The FCC instruction path stops at delivery.** The dispatch is real: `submitRequest` anchors the hash and calls `sendInstructions`, and that transaction succeeds on Coston2. Everything downstream of a delivered instruction is proven — the enclave unseals, queries, prices via FTSO, reduces to a tier, signs, and refuses replays, driven end to end by `go run ./cmd/smoke` against the live containerised enclave, which issues a full attestation. The unobserved hop is in between: no provider has been seen delivering a dispatched instruction to the proxy.

An earlier version of this contract only emitted an event and never dispatched at all, which is why this had never worked; that is fixed and pinned by three Foundry tests. The infrastructure claim that used to sit here was also wrong. The scaffold's ext-proxy reads Flare's Coston2 indexer database, and that database is publicly reachable — Coston2 needs no VPN, per [Flare's FCC troubleshooting guide](https://dev.flare.network/fcc/troubleshooting); the VPN requirement belongs to Coston. The host and database name are documented in [Build Your First Extension](https://dev.flare.network/fcc/guides/getting-started), and read-only credentials are issued by Flare support. The `35.241.249.150` host cited in older scaffold docs is dead and its embedded credentials have been rotated — it answers ICMP but refuses 3306, which costs an afternoon if you take it at face value. What actually remains before an end-to-end run is a stable public HTTPS hostname for the proxy, since the URL is written on-chain at registration and providers keep POSTing to it. `SIMULATED_TEE=true` is supported on Coston2, so the path costs nothing to exercise — see [extension/docs/coston2-simulated.md](extension/docs/coston2-simulated.md).

**Attestation freshness.** A quote proves the code that booted, not the code running at request time. Per-request tokens narrow this; nothing closes it.

**Side channels.** AMD SEV has a published history of them. Adequate at moderate size, not a claim of perfection.

**Exchange trust.** If the exchange lies about a balance, VaultProof faithfully attests a lie. The system proves what a named source said, not what is true.

**Jurisdiction.** Supported exchanges are Kraken and Binance. Which of them a given user can actually reach is a regulatory question, not a technical one — Kraken has been unregistered with India's FIU-IND since December 2023, while Binance registered in August 2024 and is available there. Two adapters is not coverage; it is two.

**Simulated runs may use a stub exchange.** `VAULTPROOF_EXCHANGE_BASE_URL` can point the enclave at a stand-in server, so the pipeline can be exercised without any exchange account at all. A tier produced this way is not evidence of anything, and the system refuses to let it be mistaken for evidence: the override is rejected outright when the Confidential Space launcher socket is present, so it cannot take effect on real hardware, and while it is active `/quote` reports the endpoint alongside the measurement. A simulated run is already labelled SIMULATED in the browser; this names *which* part is fake rather than leaving it to be inferred.

**Governance.** Whoever controls whitelisting is a trusted role. The system is not trustless end to end and does not claim to be.

## Roadmap

- Run it on Confidential Space: build reproducibly, list the resulting image digest on the measurement registry, deploy, and serve hardware mode.
- A reproducible-build verifier CLI, so strangers can rebuild the image and check the hash themselves.
- Multi-TEE quorum, using the cosigner threshold already in the FCC instruction params to require k-of-n enclaves to agree.
- Revocation: an explicit revoke path and a kill switch for a superseded build.
- More sources: Coinbase, Binance, then bank APIs behind one credential schema.
- New reducers: proof of income, proof of reserves, private KYC assertions.
- Governance hardening: whitelist control to a multisig, then to a lender-governed set.
- Audit, Songbird, then mainnet.

## Distribution and testing

No user acquisition yet, as the project is pre-public-demo. Testing to date is the 73-test suite plus on-chain runs against the live deployment. The honest statement is that this has been validated technically, not yet with real users.
