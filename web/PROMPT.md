# Claude Code prompt: VaultProof frontend (frontend-first, demo-ready)

Paste everything below this line into Claude Code as the opening prompt.

---

Build the frontend for **VaultProof**, a confidential solvency oracle on Flare Confidential Compute (FCC), for the Flare Summer Signal hackathon (Bounty 2: Confidential Compute Apps). This is a frontend-first build: the entire user flow must work end-to-end today against a mocked enclave and mocked chain, behind clean adapter interfaces, so real contracts and the real TEE can be swapped in later without touching UI code.

## What VaultProof is (context you need)

A borrower on Flare has 2,000 USDC on-chain but ~$52k on Kraken. No lending protocol will give them an 8,000 USDC loan because the chain can't see off-chain wealth, and there is no safe way to prove it: pasting an exchange API key into a dapp hands your credentials to a server.

VaultProof fixes this with a TEE. The user's browser fetches an attestation quote from an enclave running in GCP Confidential Space, verifies it client-side (signature chains to AMD SEV root, measurement matches the code hash whitelisted in `TeeExtensionRegistry` on Coston2), and only then HPKE-seals a read-only exchange API key to the X25519 public key embedded in that signed quote. The enclave decrypts the key, queries Kraken, prices holdings with FTSO feeds, reduces everything to a coarse solvency tier (T0–T4), derives a nullifier so one exchange account can't back ten wallets, signs the result, and wipes all secrets. What lands on-chain: wallet, tier, expiry, nullifier, measurement. Never: the API key, the exchange name, the balance, the account id. A `LendingPool` contract reads the tier and extends the borrow cap.

The core insight the UI must communicate: **the browser refuses to encrypt anything until attestation verification passes.** If verification is skipped, the encryption is decorative. The verify step is the product.

## Stack

- Next.js 14, App Router, TypeScript strict
- Tailwind CSS (no component libraries; build components ourselves)
- wagmi v2 + viem for wallet connect and chain reads (Coston2, chainId 114)
- `hpke-js` for real client-side HPKE sealing (X25519 / HKDF-SHA256 / ChaCha20-Poly1305) — do the real sealing even in mock mode, sealed to the mock enclave's key
- zustand for the pipeline state machine
- No backend in this repo. All enclave/chain interaction goes through the adapter layer.

## Adapter layer (this is the seam — get it right)

Create `lib/adapters/` with two interfaces and two implementations each:

```ts
interface EnclaveClient {
  fetchQuote(): Promise<AttestationQuote>;      // { measurement, extensionVersion, enclavePubKey, quote, mode }
  submitSealed(blob: Uint8Array, txHash: string): Promise<SealedResponse>;
}

interface ChainClient {
  getWhitelistedMeasurements(): Promise<string[]>;   // TeeExtensionRegistry
  submitRequestHash(hash: string): Promise<{ txHash: string }>;  // InstructionSender
  watchAttestation(wallet: string): Promise<AttestationRecord>;  // SolvencyRegistry event
  getTier(wallet: string): Promise<number>;
  getBorrowState(wallet: string): Promise<{ borrowed: bigint; cap: bigint }>;
  borrow(amount: bigint): Promise<{ txHash: string }>;
}
```

`MockEnclaveClient` / `MockChainClient` implement these with realistic latencies (600–2500ms, jittered), deterministic data, and a persisted mock state in localStorage so a refresh doesn't lose the demo. The mock enclave generates a real X25519 keypair at module load and returns `mode: 1` (simulated) in its quote; the real one will return `mode: 0`. Mock balances: 0.42 BTC, 3.1 ETH, $180 USD → priced with hardcoded FTSO-style prices → ~$58,371 → tier T3.

Selection via `NEXT_PUBLIC_VAULTPROOF_MODE=mock|live`. Live implementations can be stubs that throw "not wired yet" — but the interfaces, ABIs (write them from the contract spec below), and Coston2 chain config must be complete so wiring is a one-file change.

Contract surface to write ABIs for now: `SolvencyRegistry.submitAttestation`, `tierOf`, `attestations`, `Attested` event; `LendingPool.borrow`, `borrowed`, `tierCap`; `TeeExtensionRegistry.isWhitelisted`. Tier caps: [0, 2000, 8000, 40000, 150000] USDC (6 decimals).

## Design system — Flare-inspired

Match the visual language of flare.network and dev.flare.network. Fetch and study both before writing any styles. The look, described:

- Light-first. Background `#FFFFFF`, section alternation with a very light warm gray (`#F7F7F7` / `#FAFAFA`). Near-black text `#1A1A1A`, secondary `#6B6B6B`.
- One accent: Flare pink `#E62058`. Used sparingly and with total confidence — primary buttons, active states, the pink pipeline highlights, small underline accents on section headings. Never as large background washes.
- Typography: a clean grotesque sans (use `Inter` or `Satoshi` via next/font), tight tracking on headlines, big size contrast — hero headlines 56–72px, body 16–18px. Monospace (`JetBrains Mono` or `IBM Plex Mono`) for every hash, address, key, measurement, and code-ish value, always truncated middle-out (`0x4b7c…e02a`) with copy-on-click.
- Flat and precise, not glassy. 1px borders `#E5E5E5`, radius 8–12px, almost no shadows (a faint one on hover is fine). Generous whitespace. Thin horizontal rules between sections like Flare's docs.
- Motion: fast and quiet. 150–200ms ease-out on everything, a single deliberate slow animation reserved for the pipeline stepper. No parallax, no floating blobs.
- Dark mode: skip it. Ship one polished light theme.

Status colors: success `#0E9F6E`, pending `#B45309`, failure `#DC2626`. Tier badges T0–T4 get a subtle scale from gray → pink.

## Pages

### `/` — Landing

1. Hero: "Prove solvency. Reveal nothing." Subline: "Undercollateralised credit on Flare, backed by a hardware enclave instead of your data." Two buttons: "Launch app" (pink) and "Read the design" (ghost, links to `/how-it-works`). Right side: a live-looking terminal-style card cycling through the actual attestation record format (wallet, tier T3, expiry, nullifier, measurement) with a typing effect.
2. The problem, told as the worked example from the spec: a small table — on-chain 2,000 USDC, Kraken ~$52,400, loan wanted 8,000 USDC, "what the lender needs: one boolean."
3. The three-protocol row: FTSO (public prices), FDC (public APIs), FCC (private inputs), with the one-liner "FDC brings public data on-chain. FCC brings private conclusions on-chain." Style each as a bordered card, FCC's border pink.
4. "Who sees what" table straight from the threat model (user / enclave / operators / relay / lender / chain vs API key / balance / exchange / tier). This table is a selling point; make it beautiful.
5. Footer: Coston2 explorer links, GitHub, "Built for Flare Summer Signal 2026".

### `/app` — The product (this is 80% of the effort)

A single-page guided pipeline. Left rail: vertical stepper with six stages. Main area: the active stage's card. Completed stages collapse to a summary row with their key artifact (a hash, a tx link) still visible. State machine in zustand: `idle → verifying → verified → sealing → anchoring → processing → attested → failed(stage)`.

Stage 1 — Connect. wagmi connect (injected + WalletConnect). Show address, Coston2 badge, wrong-network guard with a switch button.

Stage 2 — Verify enclave. The hero moment. A card titled "Check the enclave before trusting it" runs three checks sequentially, each flipping from spinner to green tick with real data displayed:
  a. Quote fetched — show measurement, extensionVersion, enclavePubKey, and the mode as a badge ("SIMULATED" amber in mock mode, "HARDWARE" green in live).
  b. Signature chains to AMD SEV / Confidential Space root.
  c. Measurement found in TeeExtensionRegistry on Coston2 — show the matching hash from "chain" next to the quote's hash, visually equal, with an explorer link.
  Then a pink banner: "Key verified. The browser will encrypt only to this key." Include a small "what happens if this fails?" expander explaining the relay key-substitution attack in two sentences. If any check fails, the flow hard-stops with a red state — no override button. That refusal is the pitch.

Stage 3 — Seal credential. Exchange picker (Kraken active; Binance, Coinbase grayed "soon"). Fields: API key, API secret (password field, paste-friendly), a "read-only scope required" hint linking to Kraken's key page. On submit: run real hpke-js seal in the browser with info binding `"vaultproof/v1|" + measurement + "|" + chainId`, generate the nonce and an ephemeral response keypair, then show the result: "Sealed. 0x04a1… (612 bytes). Your key now exists in exactly two places: this tab, and nowhere yet." Show plaintext being visually replaced by the opaque blob (a brief scramble animation on the key field).

Stage 4 — Anchor. Compute keccak256 of the blob, submit the hash on-chain first, show the tx hash with explorer link, then POST the blob. One line of copy explaining the ordering: "The hash goes on-chain, the ciphertext does not — so a future key compromise can't retroactively expose past credentials."

Stage 5 — Enclave processing. A live sub-stepper mirroring the enclave's five steps: unseal → query exchange → price via FTSO → reduce to tier + nullifier → sign & wipe. In mock mode each step takes 1–2s. The FTSO step shows the actual math (0.42 BTC × $118,400 + 3.1 ETH × $2,730 + $180 = $58,371) and then the reduce step visibly discards it: the dollar figure literally blurs/dissolves and is replaced by "T3". Do not skip this animation; it is the "reduction is the privacy product" argument made visible.

Stage 6 — Attested. A large tier card: "T3 · $50k–$250k", expiry countdown (24h), nullifier and measurement in mono with copy, explorer link to the Attested event. Below it, the LendingPool panel: current cap ($40,000 + on-chain collateral), a borrow input preset to 8,000 USDC, borrow button, success state showing the transfer. Then the closing panel titled "What VaultProof knows about you now": a two-column list — left "Public (on-chain)": wallet, tier, expiry, nullifier, measurement; right "Destroyed": API key, exchange, balances, account id — each right-column item struck through. This panel is the demo's final beat.

Persistent elements on `/app`: a top-right mode pill (MOCK / LIVE), a "reset demo" button (clears mock state), and a thin footer link "Verify the build yourself → `/verify`".

### `/how-it-works`

A clean docs-style page (Flare docs layout: narrow prose column, left-border pink callouts): sequence diagram of the 12 steps (build it as an inline SVG, styled to match, not an image), the attestation-bound key exchange explanation with the "relay swaps the key" attack box, the tier table, the nullifier formula, and the honest limitations section (attestation freshness, SEV side channels, exchange trust) verbatim in spirit from the spec. Judges read this page; keep it tight.

### `/verify`

Short page: the reproducible-build claim, the exact build command in a copyable code block, and "your hash should equal the one registered on-chain" with the registry link. In mock mode, show the mock measurement.

## Copy rules

All UI copy in the confident, plain voice of the spec. Short sentences. No "please wait", no exclamation marks, no marketing filler. Where the spec has a good line ("trust the code hash, not the operator"), use it. Every hash and address is clickable-to-copy with a tiny toast.

## Build order

1. Scaffold, design tokens, fonts, layout shell, landing page static.
2. Adapter interfaces + full mock implementations + zustand pipeline store with unit-testable transitions.
3. `/app` stages 1–2 (wagmi against Coston2 config, mock verify flow).
4. Stages 3–6 including real hpke-js sealing and all animations.
5. `/how-it-works` and `/verify`.
6. Polish pass: mobile (the stepper collapses to horizontal dots on <768px), empty/error/loading states for every stage, keyboard focus states, then run through the whole flow three times and fix every rough edge.

## Acceptance criteria

- `NEXT_PUBLIC_VAULTPROOF_MODE=mock npm run dev` gives a complete, convincing wallet-to-borrow run with zero backend and zero deployed contracts. This is what gets screen-recorded for the DoraHacks demo video.
- The verify stage genuinely gates sealing: the seal form is unreachable in code (not just visually) until verification passes.
- HPKE sealing is real, in-browser, and the plaintext key never enters zustand, never hits localStorage, and never appears in a network log — grep the code to confirm before finishing.
- Swapping to live mode requires edits only inside `lib/adapters/live/`.
- Lighthouse ≥ 90 performance on the landing page; no layout shift on `/app`.
- `README.md` with a 30-second quickstart, a screenshot, the mode flag explained, and a "what's mocked vs real" table.

Work milestone by milestone. After each one, run it, look at it in the browser yourself, and fix what looks wrong before moving on. When something in this prompt conflicts with what looks good on screen, screen wins — but the security gating rules (verify before seal, no plaintext persistence) are non-negotiable.
