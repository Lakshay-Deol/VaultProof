import type { Metadata } from "next";

import { CodeBlock, DocCallout, DocSection, DocToc } from "@/components/docs/Doc";
import { FlowPlayer } from "@/components/docs/FlowPlayer";
import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Mono } from "@/components/ui/Mono";
import { ADDRESSES } from "@/lib/config/addresses";
import { explorerAddress } from "@/lib/config/chain";
import { IS_MOCK } from "@/lib/config/mode";
import { TIERS } from "@/lib/config/tiers";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The attestation-bound key exchange, the tier and nullifier design, where Flare is load-bearing, and the honest limitations.",
};

const TOC = [
  { id: "sequence", label: "End-to-end sequence" },
  { id: "binding", label: "Attestation-bound key exchange" },
  { id: "minimisation", label: "Tiers, nullifiers, expiry" },
  { id: "load-bearing", label: "Where Flare is load-bearing" },
  { id: "limitations", label: "Honest limitations" },
  { id: "roadmap", label: "Roadmap" },
];

const LOAD_BEARING = [
  {
    component: "FCC / Confidential Space",
    does: "Runs the handler inside an AMD SEV confidential VM whose memory the host cannot read, and hands the browser a hardware-signed statement of which image booted.",
    breaks:
      "There is no version of this on a normal server. A normal server means somebody's ops team can read live exchange credentials, and the whole product is that nobody can.",
  },
  {
    component: "FTSO",
    does: "Prices the fetched holdings inside the enclave: BTC/USD and ETH/USD read from Flare's own feeds on the chain the loan settles on.",
    breaks:
      "Take FTSO away and the enclave has to trust the exchange's own USD valuation, so anyone running a self-hosted “exchange” can inflate their own worth into T4.",
  },
  {
    component: "TeeExtensionRegistry",
    does: "Holds the whitelist of trusted code hashes. The browser compares the measurement in the quote against this list before it will encrypt anything.",
    breaks:
      "Without an on-chain whitelist, “trust the code hash, not the operator” is unverifiable — the operator would be the one telling you which hash to trust.",
  },
  {
    component: "Coston2",
    does: "Hosts SolvencyRegistry, LendingPool and InstructionSender. Anchors each request hash, stores each attestation, and enforces the tier cap at drawdown.",
    breaks:
      "The enclave signature is consumed by a contract that moves money. Without the chain it is a receipt in a dashboard, not a credit decision.",
  },
];

const ROADMAP = [
  {
    title: "Proof of income from bank APIs",
    line: "Same seal, same attestation, a reducer that emits an income band instead of a wealth tier.",
  },
  {
    title: "Proof of reserves for custodians",
    line: "One enclave reads many exchange accounts and publishes a single solvency assertion.",
  },
  {
    title: "Private KYC assertions",
    line: "“Over 18, not sanctioned, resident of X” — computed over documents nobody else ever sees.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Nav />
      <main id="main">
        <div className="shell py-14 sm:py-20">
          {/* Article + TOC sized to fill the container, so there is no dead
              gutter between the prose and the sidebar. */}
          <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[minmax(0,1fr)_180px] lg:gap-14">
            <article className="min-w-0">
              <p className="label">The design</p>
              <h1 className="mt-3 text-display font-semibold">How VaultProof works</h1>
              <p className="mt-6 text-lede text-ink-muted text-pretty">
                A borrower seals a read-only exchange key to a key only a hardware enclave holds.
                The enclave prices the holdings with FTSO, reduces everything to a tier, signs it,
                and wipes the rest. What lands on-chain is about 2.5 bits of wealth data.
              </p>

              <DocCallout title="The one thing to take away">
                <p>
                  Encrypting to a key you were handed by an untrusted server is not encryption,
                  it is a formality. VaultProof makes the key inseparable from the attestation,
                  and checks that binding in your browser before it will seal anything.
                </p>
              </DocCallout>

              <div className="mt-12 space-y-12">
                <DocSection id="sequence" title="End-to-end sequence">
                  <p>
                    Twelve steps, played through. The first four exist purely to remove us from
                    the trust equation; the remaining eight do the work.
                  </p>
                  <FlowPlayer />
                  <p>
                    Step 5 and 6 are deliberately in that order. The hash goes on-chain first and
                    the ciphertext goes off-chain second, because putting the ciphertext in
                    calldata would publish it permanently — a future compromise of the enclave
                    key would retroactively expose every credential ever submitted. Hashes leak
                    nothing and still give a public, ordered, tamper-evident record that a request
                    happened.
                  </p>
                  <p>
                    Step 7 is what stops the relay fabricating work: the enclave refuses to
                    process a blob whose keccak256 does not appear in a confirmed{" "}
                    <span className="font-mono text-[14px]">RequestSubmitted</span> event, and
                    refuses any nonce it has seen before.
                  </p>
                </DocSection>

                <DocSection id="binding" title="The attestation-bound key exchange">
                  <p>
                    The enclave generates its X25519 keypair itself at boot and embeds the public
                    half inside the signed quote. The platform signature covers the measurement
                    and the payload together, so a substituted key breaks the signature.
                  </p>

                  <DocCallout tone="fail" title="Attack: the relay swaps the enclave public key">
                    <p>
                      Our own compromised backend serves an attacker keypair, decrypts credentials
                      in transit, and forwards a re-encrypted copy so nothing looks broken.
                    </p>
                    <p>
                      <strong className="font-medium">Blocked because</strong> the substituted key
                      is not covered by the platform signature. Client-side verification fails
                      before any credential is sealed. The failure is loud, and it happens on the
                      user&rsquo;s machine rather than ours — which is why this check cannot be
                      moved to a backend.
                    </p>
                    <p className="text-[14px] text-ink-muted">
                      You can run this attack yourself: the app has a “Try breaking it” control on
                      stage 2 in mock mode.
                    </p>
                  </DocCallout>

                  <p>
                    HPKE (RFC 9180) gives a single-shot public-key encryption interface with
                    X25519, HKDF-SHA256 and ChaCha20-Poly1305 — <span className="font-mono text-[14px]">hpke-js</span>{" "}
                    in the browser, <span className="font-mono text-[14px]">cloudflare/circl</span>{" "}
                    in Go. Context is bound so a sealed blob cannot be replayed against a
                    different enclave version:
                  </p>

                  <CodeBlock label="context binding">
                    {`info = "vaultproof/v1|" + measurement + "|" + chainId`}
                  </CodeBlock>
                </DocSection>

                <DocSection id="minimisation" title="Tiers, nullifiers, expiry">
                  <p>
                    An enclave that publishes “this wallet holds $58,371.42” has protected the API
                    key and leaked the user. Deciding what not to publish is as much of the design
                    as the encryption is.
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[440px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-line">
                          <th className="label pb-3 pr-6 font-medium">Tier</th>
                          <th className="label pb-3 pr-6 font-medium">Range</th>
                          <th className="label pb-3 font-medium">Suggested max loan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {TIERS.map((tier) => (
                          <tr key={tier.id} className="border-b border-line last:border-0">
                            <td className="py-3 pr-6 font-mono text-[14px]">{tier.name}</td>
                            <td className="py-3 pr-6 text-[15px]">{tier.range}</td>
                            <td className="py-3 font-mono text-[14px] tabular-nums">
                              {tier.capLabel}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p>
                    A tier is roughly two and a half bits of information. An exact balance is a
                    fingerprint: unique, linkable across chains, and permanent once it is on a
                    public ledger.
                  </p>

                  <p>
                    Without a nullifier, one Kraken account could back five wallets and borrow
                    five times against the same $52k. The enclave derives a stable, unlinkable
                    identifier from the exchange account:
                  </p>

                  <CodeBlock label="nullifier">
                    {`nullifier = HMAC-SHA256(enclaveDerivedSecret, exchange || accountId)`}
                  </CodeBlock>

                  <p>
                    Stable, because the same account always yields the same nullifier. Unlinkable,
                    because the secret never leaves the enclave, so nobody can go from a nullifier
                    back to an account. The registry refuses to bind a live nullifier to a second
                    wallet.
                  </p>

                  <p>
                    Balances move, so an attestation is valid for 24 hours and the pool checks
                    freshness at drawdown rather than at approval. Expiry is enforced inside{" "}
                    <span className="font-mono text-[14px]">tierOf</span> — in the read path, not
                    by a cleanup job — so a stale attestation cannot be used even if nobody prunes
                    it.
                  </p>
                </DocSection>

                <DocSection id="load-bearing" title="Where Flare is load-bearing">
                  <p>
                    Four Flare components, what each does inside VaultProof, and what breaks if
                    you take it out.
                  </p>

                  <div className="space-y-3">
                    {LOAD_BEARING.map((row) => (
                      <div key={row.component} className="card p-5">
                        <h3 className="font-mono text-[14px] font-medium tracking-tight text-flare-ink">
                          {row.component}
                        </h3>
                        <p className="mt-3 text-[15px] leading-relaxed">{row.does}</p>
                        <p className="mt-3 border-t border-line pt-3 text-[14px] leading-relaxed text-ink-muted">
                          <span className="label mr-2">Remove it</span>
                          {row.breaks}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="card divide-y divide-line">
                    {[
                      { label: "SolvencyRegistry", address: ADDRESSES.solvencyRegistry },
                      { label: "LendingPool", address: ADDRESSES.lendingPool },
                      { label: "InstructionSender", address: ADDRESSES.instructionSender },
                      { label: "TeeExtensionRegistry", address: ADDRESSES.teeExtensionRegistry },
                    ].map((c) => (
                      <div
                        key={c.label}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <span className="flex items-center gap-2 text-[14px] font-medium">
                          {c.label}
                          {IS_MOCK ? <Badge>mock</Badge> : null}
                        </span>
                        <Mono
                          value={c.address}
                          label={c.label}
                          href={IS_MOCK ? undefined : explorerAddress(c.address)}
                        />
                      </div>
                    ))}
                  </div>
                </DocSection>

                <DocSection id="limitations" title="Honest limitations">
                  <p>
                    Three things that belong on a slide rather than buried in an appendix, because
                    volunteering them reads as competence and getting caught hiding them does not.
                  </p>
                  <ul className="space-y-4">
                    {[
                      {
                        title: "Attestation freshness",
                        body: "A quote proves the code that booted, not the code running at request time. Short-lived quotes and a per-request re-fetch narrow this; nothing closes it fully.",
                      },
                      {
                        title: "Side channels",
                        body: "AMD SEV has a published history of them. Adequate for a hackathon and for real money at moderate size; not a claim of perfection.",
                      },
                      {
                        title: "Exchange trust",
                        body: "If Kraken lies about a balance, VaultProof faithfully attests a lie. The system proves what a named source said, not what is true.",
                      },
                      {
                        title: "Governance",
                        body: "Whoever controls whitelisting is a dependency. A malicious build is rejected until it is whitelisted, and anyone can rebuild and compare hashes — but the whitelist itself is a trusted role, and pretending otherwise would be dishonest.",
                      },
                    ].map((item) => (
                      <li key={item.title} className="border-l-2 border-line pl-5">
                        <p className="text-[15px] font-medium">{item.title}</p>
                        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">
                          {item.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                </DocSection>

                <DocSection id="roadmap" title="Roadmap">
                  <p>Same enclave, different reducer function.</p>
                  <ol className="space-y-3">
                    {ROADMAP.map((item, i) => (
                      <li key={item.title} className="flex gap-4">
                        <span className="mt-[3px] font-mono text-[13px] text-flare-ink tabular-nums">
                          0{i + 1}
                        </span>
                        <span>
                          <span className="block text-[15px] font-medium">{item.title}</span>
                          <span className="mt-1 block text-[15px] leading-relaxed text-ink-muted">
                            {item.line}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="border-t border-line pt-4 text-[15px] leading-relaxed text-ink-muted">
                    After the hackathon: harden the verifier CLI, get a third-party audit of the
                    enclave package, and go to mainnet after Songbird.
                  </p>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <ButtonLink href="/app">Run the pipeline</ButtonLink>
                    <ButtonLink href="/verify" variant="ghost">
                      Verify the build
                    </ButtonLink>
                  </div>
                </DocSection>
              </div>
            </article>

            <div className="hidden lg:block">
              <DocToc items={TOC} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
