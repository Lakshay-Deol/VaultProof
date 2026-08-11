"use client";

import Link from "next/link";

import { Logomark } from "@/components/site/Nav";
import { Badge } from "@/components/ui/Badge";
import { Mono } from "@/components/ui/Mono";
import { CONTRACTS } from "@/lib/config/addresses";
import { EXPLORER, explorerAddress } from "@/lib/config/chain";
import { IS_MOCK } from "@/lib/config/mode";
import { REPO_URL } from "@/lib/config/links";

/**
 * Deployment details, one click from every page. DoraHacks asks for them and
 * judges are told to check them, so they are not buried in a README.
 */
export function Footer() {
  return (
    <footer className="relative border-t border-line bg-surface-alt">
      {/* Brand ramp on the seam, so the page ends on the accent it opened on. */}
      <div className="absolute inset-x-0 top-0 h-px bg-flare-edge" aria-hidden="true" />
      <div className="shell py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div>
            <div className="mb-6 flex items-center gap-2.5">
              <Logomark />
              <span className="text-[15px] font-semibold tracking-tight">VaultProof</span>
            </div>
            <p className="label">Deployment</p>
            <h2 className="mt-3 text-title font-semibold">Flare Coston2 · chain 114</h2>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink-muted">
              Everything the lender reads lives at these addresses. Nothing else about the
              borrower is written anywhere.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                className="text-[14px] text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-flare"
                href={EXPLORER}
                target="_blank"
                rel="noreferrer"
              >
                Coston2 explorer
              </a>
              <a
                className="text-[14px] text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-flare"
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              <Link
                className="text-[14px] text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-flare"
                href="/verify"
              >
                Reproduce the build
              </Link>
            </div>
          </div>

          <div className="card card-lit divide-y divide-line">
            {CONTRACTS.map((c) => (
              <div
                key={c.key}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors duration-200 first:rounded-t-lg last:rounded-b-lg hover:bg-surface-sunk/60"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium">{c.label}</span>
                    {c.placeholder ? <Badge>mock</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{c.blurb}</p>
                </div>
                <Mono
                  value={c.address}
                  label={c.label}
                  href={c.placeholder ? undefined : explorerAddress(c.address)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[13px] text-ink-muted">
          <p>Built for Flare Summer Signal 2026 · Bounty 2, Confidential Compute Apps.</p>
          <p>
            {IS_MOCK
              ? "Running in mock mode: no backend, no deployed contracts, real HPKE."
              : "Running in live mode against Coston2."}
          </p>
        </div>
      </div>
    </footer>
  );
}
