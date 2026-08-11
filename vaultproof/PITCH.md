# VaultProof — judge pitch & demo script

Everything you need to present VaultProof to a Flare Summer Signal judge: the pitch at three
lengths, the full workflow, the feature list, a timed demo script with the exact words to say,
and prepared answers for the hard questions.

Bounty 2 — Confidential Compute Apps (FCC). Team: Prashant Thakur. Licence: MIT.

---

## 1. The pitch

### One line

> **Prove solvency. Reveal nothing.**

### Thirty seconds

> DeFi lending is overcollateralised for one reason: a smart contract can only see the chain
> it runs on. A borrower with 2,000 USDC on Flare and $52,000 on Kraken looks poor on-chain,
> so they can't borrow $8,000 against money they demonstrably have.
>
> The missing piece is exactly one boolean — *is this borrower good for $8k?* — and there is
> no safe pipe to carry it. You can't paste an API key into a dapp. The dapp can't ask Kraken,
> because Kraken has never heard of wallet 0x7a3f. A screenshot proves nothing.
>
> VaultProof builds that pipe on Flare Confidential Compute. You seal a read-only exchange key
> to a hardware enclave, the enclave reads your balance, prices it with Flare's own FTSO feeds,
> and publishes a coarse tier — T3, not $58,371. The key, the exchange, the asset mix and the
> exact number are destroyed inside the enclave. A LendingPool reads the tier and lends
> against it.

### Two minutes — the version that wins

Open with the problem, land on the inversion, close on the check.

1. **The gap is one boolean.** (as above — the $52k borrower who looks poor on-chain)
2. **Why the existing tools can't close it.** FDC is Flare's oracle for external data, and it's
   excellent — but its security comes from *replication*, and replication is incompatible with
   secrecy. You cannot ask ten independent verifiers to check a balance behind one API key
   without handing ten verifiers the API key. That isn't an implementation gap, it's structural.
3. **The one-line positioning.** *FDC brings public data on-chain. FCC brings private
   conclusions on-chain.* That sentence is the whole reason this project belongs in Bounty 2.
4. **The inversion.** FCC changes what you trust. Not an operator, not a company, not me — a
   piece of silicon and a build you can reproduce yourself. AMD SEV-SNP runs the code in memory
   the host cannot read, and hands the browser a hardware-signed statement of exactly which
   image booted.
5. **The check that makes it real.** The browser refuses to encrypt anything until it has
   verified that attestation against a code hash whitelisted on Coston2. Skip that check and
   the encryption is decorative — you'd be encrypting to whoever asked. That gate is enforced
   in the state machine, not the UI, and six unit tests hold the line.
6. **The turn.** After the demo: *I run this project and I cannot tell you which exchange that
   was, or how much they hold. Neither can my cloud provider. The lender trusted a code hash,
   and you can rebuild it yourself right now.*

---

## 2. The full workflow

### The worked example (same numbers everywhere in the product)

| | |
| --- | --- |
| On-chain, public | 2,000 USDC on Flare |
| Off-chain, private | 0.42 BTC, 3.1 ETH, $180 |
| Priced by FTSO inside the enclave | $49,728 + $8,463 + $180 = **$58,371** |
| Published | **T3** ($50,000 – $250,000), cap $40,000 |
| The ask | 8,000 USDC, undercollateralised |

The reducer publishes a band, not a number — roughly 2.5 bits instead of a balance. The lender
learns enough to price risk and nothing more.

### The six stages

The app is a six-stage pipeline (`lib/store/pipeline.ts`). Each stage is a state in a zustand
machine, and the transitions — not the UI — are what enforce the security properties.

**1 · Connect** — Bind the attestation to a wallet.
The attestation is issued *to a wallet address*, so the wallet is chosen before anything else.
Judges with no MetaMask pick **Demo wallet** and the whole flow still runs.

**2 · Verify enclave** — Check the code before trusting it.
Three checks run in the browser, in order, and all three run identically in mock and live mode:

- **(a) Quote shape** — is this a well-formed Confidential Space attestation token, with a
  32-byte measurement and a 32-byte X25519 public key?
- **(b) Signature binding** — *this is the one that matters.* The enclave's public key is not a
  field served next to the quote; it's **inside the signed payload** (`eat_nonce`), as is the
  measurement (`submods.container.image_digest`). A relay that swaps in its own key breaks the
  binding and this check fails.
- **(c) Whitelist** — is that measurement one that `TeeExtensionRegistry` on Coston2 says
  lenders trust?

If any check fails, the app refuses to seal. **There is deliberately no override button** — an
override would make every claim on the landing page false.

**3 · Seal credential** — Encrypt to the attested key.
Real RFC 9180 HPKE in the browser: X25519 / HKDF-SHA256 / ChaCha20-Poly1305, sealed to the key
that came out of the verified quote. The HPKE `info` is bound to
`vaultproof/v1|<measurement>|<chainId>`, so a blob sealed for one enclave build **cannot be
replayed against another build or another chain**.

The plaintext key lives in two uncontrolled inputs and one local variable inside one submit
handler. Never in React state, never in the store, never in `localStorage`, never sent anywhere.
The buffer is zeroed before the form unmounts. `npm run audit:secrets` enforces all of that
statically.

**4 · Anchor** — Hash on-chain, ciphertext off-chain.
The request hash goes to Coston2 via `InstructionSender`; the ciphertext does not. The chain
gets a commitment, not a payload.

**5 · Enclave** — Unseal, price, reduce, sign, wipe.
Five steps, shown live:

1. **Unseal** — confirm the request hash on-chain, then HPKE-open the credential.
2. **Query** — call the exchange with the read-only key.
3. **Price** — value the holdings using **FTSO feeds read on Coston2**, not the exchange's own
   USD figure.
4. **Reduce** — collapse everything to a tier, a nullifier and an expiry. *Watch the exact
   dollar amount visibly dissolve off the screen here — that animation is the product.*
5. **Sign & zeroize** — sign the record, wipe the credential in a `defer`.

**6 · Attested** — Tier on-chain. Borrow against it.
`SolvencyRegistry` stores wallet, tier, expiry, nullifier, measurement. `LendingPool` reads the
tier and extends the cap. Click **Borrow** and draw the 8,000 USDC.

Then the closing panel, **"What VaultProof knows about you now"** — two columns, public vs
destroyed. It's deliberately static so it holds on screen under narration.

| Public, on-chain | Destroyed |
| --- | --- |
| Wallet | API key |
| Tier · range | API secret |
| Expiry | Exchange name |
| Nullifier | Balances (0.42 BTC, 3.1 ETH, $180) |
| Measurement | Exact total ($58,371) |
| | Account id (consumed by the nullifier, then discarded) |

### The nullifier

`HMAC-SHA256(enclaveDerivedSecret, exchange || accountId)` — stable per exchange account,
unlinkable back to it. This is what stops one Kraken account backing ten wallets. The account id
is consumed to compute it and then discarded.

---

## 3. How Flare is load-bearing

The strongest single answer to *"is this a meaningful use of Flare?"* is that removing any one
of these breaks the product. This table is also rendered in-product at
`/how-it-works#load-bearing`, so a judge can check the claim from the running app.

| Component | What it does here | What breaks without it |
| --- | --- | --- |
| **FCC / Confidential Space** | Runs the handler in an AMD SEV confidential VM the host can't read; hands the browser a hardware-signed statement of which image booted. | There is no version of this on a normal server. A normal server means somebody's ops team can read live exchange credentials — and the entire product is that nobody can. |
| **FTSO** | Prices the holdings *inside the enclave*: BTC/USD and ETH/USD from Flare's feeds, on the chain the loan settles on. | The enclave would have to trust the exchange's own valuation, so anyone running a self-hosted "exchange" could inflate themselves into T4. FTSO is what makes the valuation adversarially safe. |
| **TeeExtensionRegistry** | Holds the whitelist of trusted enclave code hashes; the browser checks the quote against it before encrypting. | "Trust the code hash, not the operator" becomes unverifiable — the operator would be the one telling you which hash to trust. |
| **Coston2** | Hosts SolvencyRegistry, LendingPool, InstructionSender. Anchors request hashes, stores attestations, enforces the tier cap at drawdown. | The signature is consumed by a contract that moves money. Without the chain it's a receipt in a dashboard, not a credit decision. |

---

## 4. Feature list

**Product**
- Six-stage pipeline, end to end in under three minutes, no wallet and no funds required
- T0–T4 tier system with caps enforced on-chain (T0 none · T1 $2k · T2 $8k · T3 $40k · T4 $150k)
- Tier caps *extend* rather than replace collateral — this composes with existing lending, it
  doesn't replace it
- Nullifier prevents one exchange account backing many wallets
- Expiry enforced in the contract read path, not just displayed
- Four pages: landing, `/app` pipeline, `/how-it-works`, `/verify`

**Security, and how it's demonstrated**
- Three client-side attestation checks, identical code in both modes, no override
- Sealing gate enforced in the state machine — `startSeal()` throws unless the store is
  `verified`, and stage 3 isn't mounted in the render tree before then
- **"Try breaking it"** on stage 2 runs the threat model's attacks against the same verifier the
  honest path uses: a substituted relay key, and an unwhitelisted build. Both hard-stop.
- Real HPKE with context binding to measurement + chain ID
- No logging anywhere near credentials; zeroize in a `defer`; `npm run audit:secrets` enforces
  it statically in CI

**Engineering**
- Adapter seam (`lib/adapters/types.ts`) — going live means filling in `live/` and flipping one
  env var; no page or component references a mock, an address literal, or a transport
- 31 unit tests, strict `tsc --noEmit`, secret audit script
- Mock mode needs **zero** env vars and zero deployed contracts — deploys cold to Vercel
- Mode pill on `/app` and in the footer, so a screen recording is never ambiguous about what
  it's showing
- All four contract addresses live in one file and render as explorer links in the footer,
  tagged `mock` when not deployed
- Accessibility: visible keyboard focus everywhere, hashes are real buttons that copy and
  announce, pipeline status exposed to assistive tech, full `prefers-reduced-motion` support

**Built during the program** — `contracts/src/vaultproof/` (SolvencyRegistry, LendingPool,
VaultProofConstants), the four-step FCE handler, the HPKE flow, the nullifier scheme, the tier
reducer, the entire `web/` frontend, and the reproducible-build verifier story. The scaffolds in
`extension/`, `contracts/` and `reference/` are Flare's own, used as-is.

---

## 5. Demo script — 3 minutes

Stage directions in *italics*. Say the bold lines close to verbatim; they're load-bearing.

**0:00 — Landing page.** *Scroll slowly through the hero.*
> This is VaultProof. **Prove solvency, reveal nothing.** The problem is on this page: a
> borrower with $52,000 on Kraken and 2,000 USDC on Flare looks poor to a smart contract. The
> gap between them is exactly one boolean, and there's no safe way to carry it.

*Scroll to the three-protocol section.*
> FDC brings public data on-chain. FCC brings private conclusions on-chain. FDC can't do this
> one — its security comes from replication, and you can't replicate a secret.

**0:35 — `/app`, stage 1.** *Click Borrow. Point at the mode pill.*
> Mock mode, and the app says so — nothing here is pretending to be a deployment. I'll take the
> demo wallet, which is why you can run this yourself in thirty seconds with no MetaMask.

**0:50 — Stage 2, verification.** *Let the three checks run. Slow down here.*
> Three checks, in the browser, before anything is encrypted. Shape. Signature binding.
> Whitelist. **The middle one is the whole product**: the enclave's public key isn't a field
> served next to the quote, it's inside the signature. So a relay that swaps in its own key
> breaks the binding.

*Click **Try breaking it** → relay key swap.*
> Here's that attack. Same verifier the honest path uses. It fails, the flow hard-stops, and
> stage three never mounts. **There's no override button** — an override would make every claim
> on the landing page false.

*Reset, let the honest path pass.*

**1:30 — Stage 3, seal.** *Fill the demo credential.*
> Real RFC 9180 HPKE, in this tab, right now — X25519, ChaCha20-Poly1305 — sealed to the key
> that came out of that verified quote. The context is bound to the measurement and the chain
> ID, so this blob can't be replayed against a different build. The plaintext never enters React
> state, never touches localStorage, and the buffer is zeroed before this form unmounts.

**1:55 — Stage 4, anchor.** *Quick.*
> The request hash goes on-chain. The ciphertext does not.

**2:05 — Stage 5, the enclave.** *This is the money shot. Say nothing for a beat and let the
dissolve animation play.*
> Unseal. Query the exchange. Price it — **with FTSO, on Coston2, not with Kraken's own dollar
> figure**, because otherwise anyone with a self-hosted exchange could inflate themselves into
> the top tier. Then reduce.
>
> *(as the number dissolves)* That was $58,371. It is now T3, and it is gone. Sign, and zeroize.

**2:35 — Stage 6, attested. Click Borrow.**
> Tier's on-chain. The pool reads it and extends the cap. Eight thousand USDC,
> undercollateralised, against money that never appeared anywhere.

**2:50 — The closing panel. Hold still. Deliver this straight to camera.**
> Public: a wallet, a tier, an expiry, a nullifier, a code hash. Destroyed: the key, the secret,
> the exchange, the asset mix, the exact total, the account id.
>
> **I run this project and I cannot tell you which exchange that was, or how much they hold.
> Neither can my cloud provider. The lender trusted a code hash — and you can rebuild it
> yourself right now.**

*Optional 15s tag: open `/verify` and show the rebuild command.*

---

## 6. Hard questions, prepared answers

**"Isn't this just a TEE? Why does it need Flare?"**
FTSO does the pricing inside the enclave, TeeExtensionRegistry holds the trust anchor, and
Coston2 is where the attestation is consumed by a contract that moves money. Take Flare out and
you have a signed JSON blob nobody is obliged to honour. Take FCC out and there's no version of
this that works — a normal server means someone's ops team can read live exchange credentials.

**"Why not just use FDC?"**
Structural, not a gap in FDC. FDC's security is replication: many verifiers fetch the same URL
and vote. That requires the thing to be public. You cannot ask ten verifiers to check a balance
behind one API key without giving ten verifiers the API key.

**"What if the user lies to the enclave?"**
They can't lie to it about the balance — the enclave calls the exchange itself with the user's
read-only key. They *can* lie by using an exchange that lies. See the limitation below; the
system proves what a named source said, not what is true, and the fix is whitelisting exchanges.

**"Couldn't the operator just read the key?"**
That's the property AMD SEV-SNP provides — the host, including me and including Google, cannot
read the VM's memory. And you don't have to take my word for which code booted: the measurement
is in a hardware-signed quote, checked against an on-chain whitelist, before the browser will
encrypt anything.

**"Is the demo actually working, or is it a mock?"**
Both, honestly labelled. The thing that's easiest to fake is the thing this project is about, so
that's the part that isn't faked: the HPKE sealing is real, the enclave keypair is real, the
mock enclave genuinely unseals what your browser sealed, and a tampered blob genuinely fails to
open. The attestation verification logic is the same file in both modes. What's simulated is the
platform signature and the hardware root — and the quote says `mode: 1`, rendered as an amber
**SIMULATED** badge, rather than pretending.

**"What's the business case for a lender?"**
A solvency signal without custody of user data. They get a tier they can price risk against, and
they never hold, process, or become liable for exchange credentials and balance histories.

### Honest limitations — volunteer these, don't wait to be asked

Stating these unprompted reads as confidence, and they're in-product at
`/how-it-works#limitations`.

- **Attestation freshness.** A quote proves what booted, not what's running at request time.
  Short-lived quotes and per-request re-fetch narrow the window; nothing closes it.
- **Side channels.** AMD SEV has a published history of them. Adequate for a hackathon and for
  real money at moderate size; not a claim of perfection.
- **Exchange trust.** If Kraken lies, VaultProof faithfully attests a lie.
- **Governance.** Whoever controls whitelisting is a trusted role. Not trustless end to end, and
  it doesn't claim to be.

### Roadmap — same enclave, different reducer

1. **Proof of income** from bank APIs — same seal, same attestation, an income band instead of a
   wealth tier.
2. **Proof of reserves** for custodians — one enclave reads many accounts, publishes one
   solvency assertion.
3. **Private KYC** — "over 18, not sanctioned, resident of X", computed over documents nobody
   else ever sees.

---

## 7. Pre-demo checklist

- [ ] `npm run dev`, hard-refresh `/app`, confirm the mode pill reads **mock**
- [ ] Run the pipeline once end to end to warm it, then **Reset** — the run persists in
      `localStorage`, so clear it or you'll open on a finished demo
- [ ] `npm run typecheck` · `npm test` (31) · `npm run audit:secrets` all green
- [ ] Fill the **PLACEHOLDER** rows in `SUBMISSION.md`: Vercel URL, GitHub URL, demo video, and
      the four deployed addresses
- [ ] Browser zoom at 100%, 1080p recording, console closed
- [ ] Rehearse the stage-5 dissolve — it plays once and it's the moment the pitch turns

**Deadline: 14 August 2026** · DoraHacks, Flare Summer Signal.
