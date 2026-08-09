import type { Metadata } from "next";

import { CodeBlock, DocCallout } from "@/components/docs/Doc";
import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Mono } from "@/components/ui/Mono";
import {
  MOCK_EXTENSION_VERSION,
  MOCK_MEASUREMENT,
} from "@/lib/adapters/mock/fixtures";
import { ADDRESSES } from "@/lib/config/addresses";
import { explorerAddress } from "@/lib/config/chain";
import { MEASUREMENT_COMMAND, REPRODUCIBLE_BUILD_COMMAND } from "@/lib/config/links";
import { IS_MOCK } from "@/lib/config/mode";

export const metadata: Metadata = {
  title: "Verify the build",
  description:
    "Rebuild the enclave image from source and check that your hash equals the one whitelisted in TeeExtensionRegistry on Coston2.",
};

export default function VerifyPage() {
  return (
    <>
      <Nav />
      <main id="main">
        <div className="shell py-14 sm:py-20">
          <div className="max-w-prose">
            <p className="label">Verification</p>
            <h1 className="mt-3 text-display font-semibold">Don&rsquo;t trust us. Rebuild it.</h1>
            <p className="mt-6 text-lede text-ink-muted text-pretty">
              The enclave image is built reproducibly. Anyone can rebuild it from source and
              check that their hash equals the one registered on-chain. That is what turns
              &ldquo;trust us&rdquo; into &ldquo;verify us&rdquo;.
            </p>

            <div className="mt-10 space-y-6">
              <DocCallout title="The claim">
                <p>
                  Build the enclave package from this repository with{" "}
                  <span className="font-mono text-[14px]">SOURCE_DATE_EPOCH</span> pinned and no
                  timestamps or paths baked into the image. Your resulting digest should equal
                  the measurement whitelisted in TeeExtensionRegistry — and equal the one the
                  browser checked on stage 2 before it sealed anything.
                </p>
              </DocCallout>

              <div>
                <p className="label mb-3">1. Rebuild</p>
                <CodeBlock label="reproducible build">{REPRODUCIBLE_BUILD_COMMAND}</CodeBlock>
              </div>

              <div>
                <p className="label mb-3">2. Read your hash</p>
                <CodeBlock label="measurement">{MEASUREMENT_COMMAND}</CodeBlock>
              </div>

              <div>
                <p className="label mb-3">3. Compare</p>
                <div className="card divide-y divide-line">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                    <div>
                      <span className="flex items-center gap-2 text-[14px] font-medium">
                        Expected measurement
                        {IS_MOCK ? <Badge tone="pending">mock</Badge> : null}
                      </span>
                      <p className="mt-0.5 text-[13px] text-ink-muted">
                        {MOCK_EXTENSION_VERSION}
                      </p>
                    </div>
                    <Mono value={MOCK_MEASUREMENT} label="Measurement" head={14} tail={10} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                    <div>
                      <span className="flex items-center gap-2 text-[14px] font-medium">
                        TeeExtensionRegistry
                        {IS_MOCK ? <Badge tone="pending">mock</Badge> : null}
                      </span>
                      <p className="mt-0.5 text-[13px] text-ink-muted">
                        Flare&rsquo;s on-chain whitelist, Coston2.
                      </p>
                    </div>
                    <Mono
                      value={ADDRESSES.teeExtensionRegistry}
                      label="TeeExtensionRegistry"
                      href={IS_MOCK ? undefined : explorerAddress(ADDRESSES.teeExtensionRegistry)}
                    />
                  </div>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
                  If the two match, you have confirmed that the code holding live exchange
                  credentials is the code in this repository, without taking anyone&rsquo;s word
                  for it.
                </p>
              </div>

              {IS_MOCK ? (
                <DocCallout tone="fail" title="This deployment is running in mock mode">
                  <p>
                    The measurement above is the mock fixture, and the registry address is a
                    placeholder. The verification logic the browser runs on stage 2 is real —
                    including the key-binding check that stops a substituted relay key — but the
                    platform signature is simulated and there is nothing deployed to compare
                    against yet. The app says so in the quote itself:{" "}
                    <span className="font-mono text-[14px]">mode: 1</span>.
                  </p>
                </DocCallout>
              ) : null}

              <div className="border-t border-line pt-8">
                <h2 className="text-title font-semibold">Why this matters more than a signature</h2>
                <p className="mt-4 text-[16px] leading-[1.7]">
                  A team can always ship a new image that quietly exfiltrates credentials. The
                  new image has a different measurement, so it is rejected by the registry until
                  it is whitelisted — and once it is whitelisted, anyone can rebuild from source
                  and compare. The trust anchor is the build, not the team.
                </p>
                <p className="mt-4 text-[16px] leading-[1.7] text-ink-muted">
                  The residual risk is honest and worth naming: whoever controls whitelisting is
                  a governance dependency. VaultProof is not trustless end to end, and claiming
                  otherwise would be the kind of thing this page exists to make impossible.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <ButtonLink href="/how-it-works" variant="ghost">
                    Read the design
                  </ButtonLink>
                  <ButtonLink href="/app">Run the pipeline</ButtonLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
