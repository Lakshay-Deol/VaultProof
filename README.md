# VaultProof

A confidential solvency oracle on Flare Confidential Compute. Prove you hold off-chain assets without revealing the account, the balance, or the API key that proved it.

Built for Flare Summer Signal, Bounty 2 (Confidential Compute Apps). Full design doc, threat model, and demo script: `docs/design-spec.pdf`.

## Repo layout

```
extension/    Flare's official fce-extension-scaffold (Go/Python/TS), unmodified base.
              Customize: go/internal/extension/extension.go (handler),
              go/internal/config/config.go (OPType), contracts/InstructionSender.sol.
              Has SIMULATED_TEE=true mode for laptop dev; flip to false on
              Confidential Space at the end. Docs in extension/docs/.

contracts/    flare-foundry-starter + our contracts in src/vaultproof/:
              SolvencyRegistry.sol, LendingPool.sol, VaultProofConstants.sol.
              The starter's src/proofOfReserves/ and src/FtsoV2Consumer.sol are
              useful references for FTSO reads. Deploy target: Coston2.

web/          Next.js dapp, built. Runs the full flow (verify enclave -> HPKE
              seal -> anchor -> enclave -> tier -> borrow) against a mocked
              enclave and mocked chain, with adapter seams in lib/adapters/ for
              going live later. The HPKE sealing and the attestation checks are
              real in both modes. See web/README.md.

reference/    flare-viem-starter, read-only reference for Coston2 chain config,
              FTSO reads from TS, and contract interaction patterns with viem.

docs/         The design spec PDF. Threat model is section 10, build plan
              section 11, demo script section 12.
```

## Quickstart

Frontend first (no chain, no TEE, no wallet, no env file needed):

```bash
cd web
npm install
npm run dev            # http://localhost:3000 — mock mode is the default
```

Pick **Demo wallet** on the connect stage to run the whole pipeline without MetaMask.
Checks: `npm run typecheck`, `npm test`, `npm run audit:secrets`.

Contracts:

```bash
cd contracts
forge soldeer install
cp .env.example .env   # add a Coston2 funded key (faucet: faucet.flare.network)
forge test
```

Extension (simulated TEE on your laptop):

```bash
cd extension
cp .env.example .env   # LANGUAGE=go, SIMULATED_TEE=true
./scripts/full-setup.sh
```

## Rules that are not optional

The OPType pair `keccak256("VAULTPROOF")` / `keccak256("ATTEST_SOLVENCY")` is defined in `contracts/src/vaultproof/VaultProofConstants.sol` and must match the Go config byte for byte. A mismatch produces requests that vanish silently.

No logging in any package that touches credentials. No credential-derived value in an error message. Zeroize in a defer. See spec section 9 for the full list; add a CI grep before the final push.

Attestation verification happens in the browser, never on a backend. If the frontend ever seals to a key that did not come out of a verified quote, the product claim is gone.

## Build order (from spec section 11)

Contracts on Coston2, then extension skeleton in simulated mode, then the HPKE roundtrip, then real Kraken + FTSO, then frontend wiring, then the reproducible-build verifier, and only then MODE=0 on real Confidential Space. Every milestone is demoable on its own; if time runs out at milestone 5 there is still a complete story.

Deadline: August 14, 2026. Submission: DoraHacks, Flare Summer Signal.
