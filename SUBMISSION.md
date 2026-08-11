# VaultProof — DoraHacks submission

Drafted against every field the Flare Summer Signal submission form asks for. Fields that
cannot be filled until deployment are marked **PLACEHOLDER** and nothing else.

---

## Project name

VaultProof

## Bounty

**Bounty 2 — Confidential Compute Apps** (Flare Confidential Compute / FCC).

## One-line pitch

Prove solvency. Reveal nothing.

## Product description

VaultProof is a confidential solvency oracle on Flare Confidential Compute. A borrower
seals a read-only exchange API key to a public key that only a hardware enclave holds; the
enclave decrypts it, queries the exchange, prices the holdings with Flare's own FTSO feeds,
and reduces everything to a coarse solvency tier plus a nullifier and an expiry. What lands
on-chain is a wallet address, a tier, an expiry, a nullifier and a code-hash measurement —
never the API key, the exchange name, the asset mix, the exact balance, or the account
identifier, and a LendingPool contract reads that tier to extend undercollateralised credit.

## Target user

**Crypto-holding borrowers locked out of undercollateralised credit** — someone with 2,000
USDC on Flare and $52,000 on an exchange, who today cannot borrow 8,000 USDC because the
chain cannot see off-chain wealth and there is no safe way to prove it.

**Lending protocols that want a solvency signal without custody of user data** — a pool
that would extend a larger cap given evidence of off-chain assets, but does not want to
hold, process, or be liable for exchange credentials and balance histories.

## Demo link (working app)

**PLACEHOLDER — awaiting the deployed Vercel URL.**

Runs cold in mock mode: no wallet, no testnet funds, no setup. Choose **Demo wallet** on the
connect stage and the full six-stage pipeline runs end to end in under three minutes,
including real in-browser HPKE sealing.

## Demo video

**PLACEHOLDER — awaiting the recorded walkthrough.** Script is section 12 of
`docs/design-spec.pdf`; the app's animations were built for a 1080p screen recording, and
the closing "What VaultProof knows about you now" panel holds on screen without
interaction so it can sit under narration.

## Repository

**PLACEHOLDER — awaiting the public GitHub URL.**

## How the project uses Flare

Four Flare components, what each does inside VaultProof, and what breaks without it. This
is also rendered in-product at `/how-it-works#load-bearing`, because "meaningful, not
superficial" is a claim that should be checkable from the running app.

| Flare component | What it does in VaultProof | What breaks if you remove it |
| --- | --- | --- |
| **FCC / Confidential Space** | Runs the solvency handler inside an AMD SEV confidential VM whose memory the host cannot read, and hands the browser a hardware-signed statement of which image booted. | There is no version of this on a normal server. A normal server means somebody's ops team can read live exchange credentials, and the entire product is that nobody can. This is the test a confidential-compute submission has to pass. |
| **FTSO** | Prices the fetched holdings *inside the enclave*: BTC/USD and ETH/USD read from Flare's own feeds on the chain the loan settles on. | The enclave would have to trust the exchange's own USD valuation, so anyone running a self-hosted "exchange" could inflate their own worth into the top tier. FTSO is what makes the valuation adversarially safe. |
| **TeeExtensionRegistry** | Holds the whitelist of trusted enclave code hashes. The browser compares the measurement in the attestation quote against this list *before* it will encrypt anything. | Without an on-chain whitelist, "trust the code hash, not the operator" is unverifiable — the operator would be the party telling you which hash to trust. |
| **Coston2** | Hosts SolvencyRegistry, LendingPool and InstructionSender. Anchors each request hash, stores each attestation, and enforces the tier cap at drawdown. | The enclave signature is consumed by a contract that moves money. Without the chain it is a receipt in a dashboard, not a credit decision. |

The positioning in one line: **FDC brings public data on-chain. FCC brings private
conclusions on-chain.** FDC's security comes from replication, and replication is
incompatible with secrecy — you cannot ask ten verifiers to check a balance behind one API
key without giving ten verifiers the API key.

## What existed before, and what was built during the program

Judges score evidence of new work explicitly, so the boundary is drawn precisely.

### Pre-existing base (Flare's own scaffolds, used as-is)

- **`extension/`** — Flare's official `fce-extension-scaffold`, unmodified base: the Go/Python/TS
  extension harness, the `InstructionSender.sol` template, the `ITeeExtensionRegistry` /
  `ITeeMachineRegistry` interfaces, the simulated-TEE dev mode, and the scaffold docs.
- **`contracts/`** — Flare's `flare-foundry-starter`: Foundry config, remappings, the FTSO,
  FDC, FAssets and proof-of-reserves example scripts used as reference.
- **`reference/`** — `flare-viem-starter`, read-only, for Coston2 chain config and viem
  interaction patterns.

### Built during Flare Summer Signal

- **`contracts/src/vaultproof/`** — `SolvencyRegistry.sol` (tier, expiry, nullifier and
  measurement storage; nullifier collision handling; expiry enforced in the read path;
  measurement re-checked against the registry at write time), `LendingPool.sol` (tier caps
  extending rather than replacing collateral), `VaultProofConstants.sol` (the OPType /
  OPCommand pair shared with the Go side).
- **The solvency handler** — the four-step FCE handler: confirm the request hash on-chain,
  unseal the credential, fetch and price, reduce and sign, zeroize. Plus the no-logging,
  no-credential-in-errors rules for everything under the enclave package.
- **The HPKE flow** — attestation-bound key exchange end to end: the enclave generates its
  X25519 keypair at boot and embeds the public half in the signed quote; the browser
  verifies that binding before sealing; context is bound with
  `"vaultproof/v1|" + measurement + "|" + chainId` so a blob cannot be replayed against a
  different enclave build.
- **The nullifier scheme** — `HMAC-SHA256(enclaveDerivedSecret, exchange || accountId)`,
  stable per exchange account and unlinkable back to it, so one account cannot back ten
  wallets.
- **The tier reducer** — the T0–T4 bands and the argument for publishing ~2.5 bits instead
  of an exact balance.
- **This entire frontend (`web/`)** — 4 pages, 6 pipeline stages, the adapter layer, the
  zustand state machine, real in-browser HPKE, the client-side attestation verifier, the
  inline SVG sequence diagram, the design system, 31 unit tests, and a static
  credential-handling audit. The directory was empty at the start of the program.
- **The verifier story** — the reproducible-build claim, the exact build command, and the
  `/verify` page that tells a judge how to rebuild the image and compare their hash against
  the whitelisted one.

## Technical execution — does the demo work?

Yes, cold, from a public URL, with no wallet and no funds.

- Mock mode needs **zero environment variables** and **zero deployed contracts**.
- The **demo wallet** option means a judge with no MetaMask still completes the whole flow.
- The **sealing is real** — genuine RFC 9180 HPKE (X25519 / HKDF-SHA256 /
  ChaCha20-Poly1305) in the browser, sealed to a real X25519 key that the mock enclave
  actually unseals. A tampered blob genuinely fails to open.
- The **verification gate is structural, not cosmetic**: `startSeal()` throws unless the
  store is in the `verified` state, and the seal form is not mounted in the render tree
  before then. Six unit tests hold that line.
- **You can break it on purpose.** Stage 2 has a "Try breaking it" control that runs the
  threat model's attacks — a substituted relay public key, and an unwhitelisted build —
  against the same verifier the honest path uses. Both hard-stop with no override.

## Deployment details

| Item | Value |
| --- | --- |
| Network | Flare Coston2 testnet, chain ID **114** |
| RPC | `https://coston2-api.flare.network/ext/C/rpc` |
| Explorer | `https://coston2-explorer.flare.network` |
| SolvencyRegistry | **PLACEHOLDER — awaiting deployment** |
| LendingPool | **PLACEHOLDER — awaiting deployment** |
| InstructionSender | **PLACEHOLDER — awaiting deployment** |
| TeeExtensionRegistry | Flare protocol contract — **PLACEHOLDER, awaiting the Coston2 address** |
| Enclave build | `vaultproof-v0.3.1`, GCP Confidential Space, AMD SEV-SNP |
| Frontend host | Vercel — **PLACEHOLDER** |

All four addresses live in exactly one file, `web/lib/config/addresses.ts`, and render as
explorer links in the site footer on every page. In mock mode they render with a `mock` tag
so nothing can be mistaken for a deployment.

## Honest limitations

Volunteered rather than buried, and stated in-product at `/how-it-works#limitations`:

- **Attestation freshness.** A quote proves the code that booted, not the code running at
  request time. Short-lived quotes and a per-request re-fetch narrow this; nothing closes it.
- **Side channels.** AMD SEV has a published history of them. Adequate for a hackathon and
  for real money at moderate size; not a claim of perfection.
- **Exchange trust.** If Kraken lies about a balance, VaultProof faithfully attests a lie.
  The system proves what a named source said, not what is true.
- **Governance.** Whoever controls whitelisting is a trusted role. The system is not
  trustless end to end and does not claim to be.

## Roadmap

Same enclave, different reducer function:

1. **Proof of income from bank APIs** — same seal, same attestation, a reducer that emits an
   income band instead of a wealth tier.
2. **Proof of reserves for custodians** — one enclave reads many exchange accounts and
   publishes a single solvency assertion.
3. **Private KYC assertions** — "over 18, not sanctioned, resident of X", computed over
   documents nobody else ever sees.

After the hackathon: harden the verifier CLI, commission a third-party audit of the enclave
package, and go to mainnet after Songbird.

## Team

Prashant Thakur.

## Licence

MIT.
