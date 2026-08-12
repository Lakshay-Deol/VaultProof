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

- **Five Solidity contracts**, deployed and verified on Blockscout. `SolvencyRegistry` enforces expiry in the read path, handles nullifier collisions, and re-checks the measurement at write time. `LendingPool` applies tier caps that extend rather than replace collateral. `VaultProofInstructionSender` handles the anchor, the TEE write path and FCC routing. Plus the measurement registry and a test USDC token.
- **The solvency enclave in Go:** HPKE unseal, Kraken HMAC-SHA512 signed reads, FTSO pricing resolved through the Flare contract registry, an HMAC nullifier, and zeroization in defers. Credentials are held in byte slices, never strings, because Go strings cannot be scrubbed.
- **Real hardware attestation.** The enclave requests a token from the Confidential Space launcher over its unix socket, binds its X25519 key as the attestation nonce, and reports the signed image digest as its measurement. A fresh token per request, not one minted at boot and replayed.
- **Real quote verification.** The browser fetches Google's Confidential Computing key set and verifies the token signature with WebCrypto, enforcing issuer and expiry and rejecting `alg:none`.
- **The whole frontend:** four pages, six pipeline stages, mock and live adapter seams, a state machine, real in-browser HPKE, and the design system. The directory was empty at the start of the program.
- **Both live adapters:** viem and wagmi against the deployed contracts, and the enclave client against the quote and sealed endpoints.
- **The attack simulator.** Stage 2 ships a "Try breaking it" control that runs a substituted relay key and an unwhitelisted build against the same verifier the honest path uses. Both hard-stop with no override.
- **Browser-reachable enclave endpoints.** `/quote` and `/sealed` are called by the user's browser directly, which stock FCC never needs — so the enclave serves its own CORS with an `ALLOWED_ORIGINS` allowlist. CORS is not treated as a security boundary here: nothing on those paths carries ambient authority, and the key binding inside the signed quote is what makes an untrusted relay safe.
- **77 tests:** 29 Go, 11 Foundry, 33 web unit, 4 live against Coston2.

Five real bugs were found and fixed along the way. The scaffold's `teeutils.ToHash` right-pads a string into a `bytes32` while the contract and frontend use keccak256, and the two disagree completely with a silent failure. Blob delivery was keyed by SHA-256 while the browser anchors keccak256, so the enclave would never have found the blob. The attestation check verified the token's binding but never its signature, so a forged token with matching fields would have passed.

The last two are the same shape as the first — a value that has to be identical on both sides, and isn't. The enclave opened sealed blobs using a boot-time measurement read from environment variables, while the browser binds its HPKE context to the measurement it read from the quote; on Confidential Space the launcher supplies a different value, so **every unseal would have failed** with an error that named nothing useful. The enclave now adopts the launcher-signed digest as its identity. And `wagmi` was configured with `storage: null` alongside `ssr: true`, an unsupported pair that threw on every page load and aborted the rest of wallet setup.

## Deployment details

Flare Coston2 testnet, chain ID 114. All five contracts verified on Blockscout.

| Contract                      | Address                                      |
| ----------------------------- | -------------------------------------------- |
| `SolvencyRegistry`            | `0xD653bE4c296E2462D22254953D2Aaa7D4DA1917C` |
| `LendingPool`                 | `0x3b7c700cd2d812348de61BD13b28e601C661b5Da` |
| `VaultProofInstructionSender` | `0x45540745B838F6f3feC76E662b5539BcB82339c3` |
| `TeeMeasurementRegistry`      | `0xe1788fF42Fc5a5B4012d5af6f8B51fe3a3eF36f7` |
| `MockUSDC (tUSDC)`            | `0x459c634EE948f6D486b714E06C1F186034F2e7A4` |

Live evidence:

- T3 attestation delivered, tx `0xd99378e7a668ff52eef4e032902cd8e2d4df99401b908fb316ac686af73ceb4f`
- Borrowed 15,000 tUSDC, tx `0x66fde48b7de4c0871b23662fa966e2a13d984d773f90fcb0c0d316e54bd02b46`
- A 50,000 attempt reverted with "over cap", so the contract refuses rather than trusting the front end.

## Technical execution

Each part can be checked independently:

- `cd web && npm run dev` — localhost:3000, mock mode, no wallet or funds needed
- `cd extension/go && go run ./cmd` — the enclave on port 8080
- `curl localhost:8080/quote` — measurement, enclave public key, attestation mode
- `go run ./cmd/smoke` — seals as the browser does, attests, checks replay
- `cd web && npm run test:live` — 4 tests against the real Coston2 deployment

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
   enclave key  0x44615090f74ffa7924…
2. sealed       112 bytes, requestHash=0x1f77a2bc5e5e…
3. delivered    accepted=true
4. attest       status=0 log="error: query: exchange rejected the credential"

RESULT: unseal OK — HPKE roundtrip through the live server worked.
        Failed at the exchange step, as expected for a fake key.
5. replay       refused — blob was consumed on first use
```

Step 4 is the interesting one: `unseal` succeeded and the run stopped at `query`, which is
exactly right for a credential that is not a real Kraken key. Had the two HPKE sides
drifted, it would have failed one step earlier and said so. Step 5 confirms the replay
defence — the ciphertext is deleted on read, so the second attempt finds nothing.

The browser-facing endpoints answer with the CORS headers a cross-origin `fetch` needs,
including the preflight that `POST /sealed` triggers:

```
$ curl -i -X OPTIONS -H "Origin: http://localhost:3000" … /sealed
HTTP/1.1 204 No Content
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Test suites, all green: **29 Go** (`go test ./...`), **11 Foundry**
(`FOUNDRY_PROFILE=vaultproof forge test`), **33 web unit** (`npm test`), **4 live against
the deployed Coston2 contracts** (`npm run test:live`). `go vet` is clean.

On-chain, from the deployment above: a T3 attestation delivered, 15,000 tUSDC borrowed, and
a 50,000 attempt reverted `over cap` — the contract refusing rather than trusting the front
end.

**Not run, and not claimed:**

- **Real hardware attestation.** The code path is complete and on the real path, but it has
  never executed on Confidential Space. Locally the enclave reports `mode: 1` and the UI
  renders it as SIMULATED.
- **The FCC on-chain instruction path**, end to end through a registered TEE machine. The
  scaffold's ext-proxy requires Flare's indexer database, which is reachable only over
  Flare's VPN. Blocked on access, not on code.

[REAL-VISION.md](REAL-VISION.md) specifies what the second column requires, in the order it
blocks.

## Honest limitations

The demo in this repo runs in mock mode. **[REAL-VISION.md](REAL-VISION.md)** specifies the
system it is a model of — the real architecture, what is already built and unexercised,
what is missing in the order it blocks, and the risks that survive a successful deploy.

**Hardware mode has never executed.** The attestation code is real and on the real path, and on Confidential Space it fetches a genuine AMD SEV-SNP-backed token that the browser verifies against Google. But it has not been run on that hardware, so no claim is made that it has. Locally it reports simulated mode and the UI renders it as such. Every failure branch fails closed to simulated rather than overclaiming.

What *has* run is narrower and stated above: the enclave itself, its HPKE unseal against a browser-format blob, and its replay defence. The gap is the hardware root and the on-chain instruction path, not the enclave logic.

**The FCC instruction path is blocked on infrastructure access, not on code.** The scaffold's ext-proxy reads Flare's indexer database, which sits behind Flare's VPN. Without it the proxy cannot start, so no TEE machine can reach `PRODUCTION` status and no dispatched instruction can be delivered. `SIMULATED_TEE=true` is supported on Coston2 and would otherwise make this path reachable at zero cost — see [extension/docs/coston2-simulated.md](extension/docs/coston2-simulated.md).

**Attestation freshness.** A quote proves the code that booted, not the code running at request time. Per-request tokens narrow this; nothing closes it.

**Side channels.** AMD SEV has a published history of them. Adequate at moderate size, not a claim of perfection.

**Exchange trust.** If Kraken lies about a balance, VaultProof faithfully attests a lie. The system proves what a named source said, not what is true.

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
