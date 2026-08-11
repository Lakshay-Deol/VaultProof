import { AttestationTerminal } from "@/components/landing/AttestationTerminal";
import { ParticleField } from "@/components/landing/ParticleField";
import { PipelineStrip } from "@/components/landing/PipelineStrip";
import { StatsBand } from "@/components/landing/StatsBand";
import { TechTicker } from "@/components/landing/TechTicker";
import { TierLadder } from "@/components/landing/TierLadder";
import { WhoSeesWhat } from "@/components/landing/WhoSeesWhat";
import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Magnetic } from "@/components/ui/Magnetic";
import { Reveal } from "@/components/ui/Reveal";
import { Section, SectionHeading } from "@/components/ui/Section";
import { MOCK_DESIRED_LOAN, MOCK_ONCHAIN_USDC, MOCK_TIER } from "@/lib/adapters/mock/fixtures";
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
          {/*
           * Three stacked layers of ambience, cheapest first: a drifting pink
           * wash, a masked grid so the dark area is not dead, and the particle
           * swarm — the one canvas on the page, parked behind the copy on the
           * right where it will never sit under text.
           */}
          <div className="pointer-events-none absolute inset-0 hero-glow" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 grid-wash" aria-hidden="true" />
          <div
            className="pointer-events-none absolute -right-[18%] -top-[12%] hidden h-[780px] w-[780px] opacity-70 lg:block"
            aria-hidden="true"
          >
            <ParticleField />
          </div>

          <div className="shell relative pb-14 pt-16 sm:pt-24">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
              {/* Staggered rather than one block: the eye lands on the badge,
                  then the claim, then the buttons, in that order. */}
              <div>
                <Reveal>
                  <Badge tone="flare">
                    <span className="live-dot bg-flare after:bg-flare" />
                    Flare Confidential Compute
                  </Badge>
                  <h1 className="mt-6 text-hero font-semibold">
                    Prove solvency.{" "}
                    <span className="text-ramp">Reveal nothing.</span>
                  </h1>
                </Reveal>
                <Reveal delay={90}>
                  <p className="mt-6 max-w-xl text-lede text-ink-muted text-pretty">
                    Undercollateralised credit on Flare, backed by a hardware enclave instead of
                    your data.
                  </p>
                </Reveal>
                <Reveal delay={160}>
                  <div className="mt-9 flex flex-wrap items-center gap-3">
                    <Magnetic>
                      <ButtonLink href="/app" size="lg">
                        Borrow
                      </ButtonLink>
                    </Magnetic>
                    <Magnetic>
                      <ButtonLink href="/how-it-works" variant="ghost" size="lg">
                        Read the design
                      </ButtonLink>
                    </Magnetic>
                  </div>
                  <p className="mt-7 max-w-lg border-l-2 border-flare/40 pl-4 text-[14px] leading-relaxed text-ink-faint">
                    The browser refuses to encrypt anything until it has checked the enclave&rsquo;s
                    attestation against the code hash on Coston2. Skip that check and the
                    encryption is decorative.
                  </p>
                </Reveal>
              </div>

              <Reveal delay={220} variant="scale">
                <AttestationTerminal />
              </Reveal>
            </div>
          </div>

          {/* Stack the ticker directly on the hero's bottom edge so it reads as
              the floor of the hero rather than a section of its own. */}
          <div className="relative border-y border-line bg-surface-alt/60 py-3.5 backdrop-blur-sm">
            <TechTicker />
          </div>
        </section>

        {/* Numbers */}
        <section className="relative">
          <div className="shell py-16 sm:py-20">
            <StatsBand />
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
                        ? "border-b border-line bg-flare-soft/40 transition-colors last:border-0 hover:bg-flare-soft/70"
                        : "border-b border-line transition-colors last:border-0 hover:bg-surface-sunk/70"
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

        {/* The flow */}
        <Section>
          <SectionHeading
            eyebrow="The pipeline"
            title="Six steps, and the third one cannot run until the second one passes."
            lede="This is the same stage table the app runs on. Verification is not a loading screen before the real work — it is the gate that makes the sealing meaningful."
          />
          <Reveal className="mt-12">
            <PipelineStrip />
          </Reveal>
          <Reveal className="mt-10">
            <ButtonLink href="/app" variant="ghost" size="sm">
              Run it end to end
            </ButtonLink>
          </Reveal>
        </Section>

        {/* Three protocols */}
        <Section tone="alt">
          <SectionHeading
            eyebrow="Where this fits on Flare"
            title="FDC brings public data on-chain. FCC brings private conclusions on-chain."
            lede="Each enshrined protocol closes a different gap. Only one of them can consume an input that has to stay secret."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PROTOCOLS.map((p, i) => {
              const card = (
                <div
                  className={
                    p.accent
                      ? "card card-lit card-hover h-full border-flare-border bg-flare-soft p-6"
                      : "card card-lit card-hover h-full p-6"
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
              );

              return (
                <Reveal key={p.name} delay={i * 90} variant="scale" className="h-full">
                  {/* Only the card the section is arguing for gets the rotating
                      rim; on all three it would be wallpaper. */}
                  {p.accent ? <div className="beam-frame h-full">{card}</div> : card}
                </Reveal>
              );
            })}
          </div>

          <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            FDC&rsquo;s security comes from replication, and replication is incompatible with
            secrecy: you cannot ask ten verifiers to check a balance behind one API key without
            giving ten verifiers the API key. FCC inverts the trust model — you trust a piece of
            silicon and a build you can reproduce yourself.
          </p>
        </Section>

        {/* Tiers */}
        <Section>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <SectionHeading
              eyebrow="The output"
              title="A band, not a balance."
              lede="The enclave prices your holdings exactly, then throws the number away and keeps the bucket. A lender learns you clear $50,000; it never learns by how much."
            />
            <Reveal variant="right">
              <TierLadder />
              <p className="mt-6 text-[14px] leading-relaxed text-ink-faint">
                The worked example lands on {MOCK_TIER.name} — {MOCK_TIER.range}. That is the whole
                on-chain claim, and it is enough to underwrite{" "}
                {formatUsd(MOCK_DESIRED_LOAN)}.
              </p>
            </Reveal>
          </div>
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
        <Section className="overflow-hidden">
          {/* One last wash, mirrored from the hero so the page closes where it
              opened. */}
          <div
            className="pointer-events-none absolute inset-0 hero-glow opacity-60"
            aria-hidden="true"
          />
          <Reveal className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <h2 className="text-display font-semibold">
                Trust the <span className="text-ramp">code hash</span>, not the operator.
              </h2>
              <p className="mt-5 text-lede text-ink-muted text-pretty">
                Run the full pipeline now: verify the enclave, seal a credential with real
                in-browser HPKE, watch the amount get discarded, and borrow{" "}
                {formatUsd(MOCK_DESIRED_LOAN)} against a tier.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Magnetic>
                <ButtonLink href="/app">Borrow</ButtonLink>
              </Magnetic>
              <Magnetic>
                <ButtonLink href="/verify" variant="ghost">
                  Verify the build
                </ButtonLink>
              </Magnetic>
            </div>
          </Reveal>
        </Section>
      </main>
      <Footer />
    </>
  );
}
