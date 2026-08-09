import { AttestationTerminal } from "@/components/landing/AttestationTerminal";
import { WhoSeesWhat } from "@/components/landing/WhoSeesWhat";
import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Section, SectionHeading } from "@/components/ui/Section";
import { MOCK_DESIRED_LOAN, MOCK_ONCHAIN_USDC } from "@/lib/adapters/mock/fixtures";
import { formatUsd } from "@/lib/utils/format";

const PROTOCOLS = [
  {
    name: "FTSO",
    brings: "Price feeds",
    trust: "Many independent providers, stake-weighted median",
    privacy: "No. Everything it reads is public by definition.",
    accent: false,
  },
  {
    name: "FDC",
    brings: "External chain events and public Web2 API responses",
    trust: "Independent verifiers each fetch the same URL and vote",
    privacy:
      "No, and structurally cannot. Verification needs many parties to fetch the same thing, so the thing must be public.",
    accent: false,
  },
  {
    name: "FCC",
    brings: "Results computed over private inputs",
    trust: "Hardware attestation of a whitelisted code hash",
    privacy: "Yes. One party computes, and hardware vouches for what code ran.",
    accent: true,
  },
];

const PROBLEM_ROWS = [
  {
    fact: "On-chain wallet balance",
    value: `${MOCK_ONCHAIN_USDC.toLocaleString("en-US")} USDC on Flare`,
    knows: "Everybody",
  },
  { fact: "Kraken holdings", value: "0.42 BTC, 3.1 ETH", knows: "Kraken, the user" },
  { fact: "USD value of holdings", value: "~$52,400", knows: "Kraken, the user" },
  {
    fact: "Desired loan",
    value: `${MOCK_DESIRED_LOAN.toLocaleString("en-US")} USDC`,
    knows: "The user",
  },
  {
    fact: "What the lender needs",
    value: "“is this borrower good for $8k?”",
    knows: "Nobody, on-chain",
    highlight: true,
  },
];

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 hero-glow" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 grid-wash" aria-hidden="true" />
          <div className="shell relative pb-16 pt-16 sm:pb-24 sm:pt-24">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
              <Reveal>
              <Badge tone="flare">Flare Confidential Compute</Badge>
              <h1 className="mt-6 text-hero font-semibold">Prove solvency. Reveal nothing.</h1>
              <p className="mt-6 max-w-xl text-lede text-ink-muted text-pretty">
                Undercollateralised credit on Flare, backed by a hardware enclave instead of
                your data.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <ButtonLink href="/app">Launch app</ButtonLink>
                <ButtonLink href="/how-it-works" variant="ghost">
                  Read the design
                </ButtonLink>
              </div>
              <p className="mt-7 max-w-lg text-[14px] leading-relaxed text-ink-faint">
                The browser refuses to encrypt anything until it has checked the enclave&rsquo;s
                attestation against the code hash on Coston2. Skip that check and the encryption
                is decorative.
              </p>
              </Reveal>

              <Reveal delay={120}>
                <AttestationTerminal />
              </Reveal>
            </div>
          </div>
        </section>

        {/* The problem */}
        <Section tone="alt">
          <SectionHeading
            eyebrow="The problem"
            title="The gap is exactly one boolean."
            lede="DeFi lending is overcollateralised because a contract cannot see anything except the chain it runs on. A borrower with $52,000 on Kraken looks poor on-chain, and there is no safe pipe to carry the difference."
          />

          <Reveal className="mt-10 max-w-3xl overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[36%]" />
                <col className="w-[34%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-line">
                  <th className="label pb-3 pr-6 font-medium">Fact</th>
                  <th className="label pb-3 pr-6 font-medium">Value</th>
                  <th className="label pb-3 font-medium">Who currently knows it</th>
                </tr>
              </thead>
              <tbody>
                {PROBLEM_ROWS.map((row) => (
                  <tr
                    key={row.fact}
                    className={
                      row.highlight
                        ? "border-b border-line bg-flare-soft/40 last:border-0"
                        : "border-b border-line last:border-0"
                    }
                  >
                    <td className="py-3.5 pr-6 text-[15px]">{row.fact}</td>
                    <td className="py-3.5 pr-6 font-mono text-[13.5px] text-ink">{row.value}</td>
                    <td className="py-3.5 text-[15px] text-ink-muted">{row.knows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>

          <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            The user cannot paste an API key into a dapp. The dapp cannot ask Kraken directly,
            because Kraken has no idea who owns wallet 0x7a3f. A screenshot proves nothing.
          </p>
        </Section>

        {/* Three protocols */}
        <Section>
          <SectionHeading
            eyebrow="Where this fits on Flare"
            title="FDC brings public data on-chain. FCC brings private conclusions on-chain."
            lede="Each enshrined protocol closes a different gap. Only one of them can consume an input that has to stay secret."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PROTOCOLS.map((p, i) => (
              <Reveal key={p.name} delay={i * 90}>
              <div
                className={
                  p.accent
                    ? "card card-hover h-full border-flare bg-flare-soft p-6 shadow-glow"
                    : "card card-hover h-full p-6"
                }
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-mono text-[15px] font-medium tracking-tight">{p.name}</h3>
                  {p.accent ? <Badge tone="flare">VaultProof</Badge> : null}
                </div>
                <p className="mt-4 text-[15px] font-medium leading-snug">{p.brings}</p>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">{p.trust}</p>
                <hr className="my-4" />
                <p className="label mb-1.5">Can it see private data?</p>
                <p
                  className={
                    p.accent
                      ? "text-[14px] leading-relaxed text-flare-ink"
                      : "text-[14px] leading-relaxed text-ink-muted"
                  }
                >
                  {p.privacy}
                </p>
              </div>
              </Reveal>
            ))}
          </div>

          <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            FDC&rsquo;s security comes from replication, and replication is incompatible with
            secrecy: you cannot ask ten verifiers to check a balance behind one API key without
            giving ten verifiers the API key. FCC inverts the trust model — you trust a piece of
            silicon and a build you can reproduce yourself.
          </p>
        </Section>

        {/* Who sees what */}
        <Section tone="alt">
          <SectionHeading
            eyebrow="Threat model"
            title="Who sees what"
            lede="The design rule that generates the whole architecture: anything that touches a secret lives inside the enclave, and everything else is assumed hostile, including our own backend."
          />
          <Reveal className="mt-10 max-w-4xl">
            <WhoSeesWhat />
          </Reveal>
          <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            The lender is not trusting VaultProof the company. The lender is trusting a code hash
            registered in TeeExtensionRegistry, which anyone can rebuild and verify.
          </p>
        </Section>

        {/* Closing CTA */}
        <Section>
          <Reveal className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <h2 className="text-display font-semibold">Trust the code hash, not the operator.</h2>
              <p className="mt-5 text-lede text-ink-muted text-pretty">
                Run the full pipeline now: verify the enclave, seal a credential with real
                in-browser HPKE, watch the amount get discarded, and borrow{" "}
                {formatUsd(MOCK_DESIRED_LOAN)} against a tier.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/app">Launch app</ButtonLink>
              <ButtonLink href="/verify" variant="ghost">
                Verify the build
              </ButtonLink>
            </div>
          </Reveal>
        </Section>
      </main>
      <Footer />
    </>
  );
}
