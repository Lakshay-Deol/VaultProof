import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";

import { ModePill } from "@/components/app/ModePill";
import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";

export const metadata: Metadata = {
  title: "App",
  description:
    "Verify the enclave, seal a read-only exchange key with in-browser HPKE, and borrow against a solvency tier.",
};

/**
 * Only the stage machinery is client-only — it touches WebCrypto and wallet
 * state on mount. The page heading, the mode pill and the footer link are
 * static, so the part of the page that renders first is also the part that
 * never moves.
 */
const Pipeline = dynamic(
  () => import("@/components/app/Pipeline").then((m) => m.Pipeline),
  {
    ssr: false,
    loading: () => <PipelineSkeleton />,
  },
);

/**
 * Sized to the connect stage it is replaced by, so swapping the real pipeline
 * in does not push the footer around. Keep these heights in step with
 * StageConnect if that card grows.
 */
function PipelineSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12" aria-hidden="true">
      <div className="h-[52px] rounded bg-surface-sunk md:h-[286px]" />
      <div className="h-[430px] rounded-lg border border-line bg-surface" />
    </div>
  );
}

export default function AppPage() {
  return (
    <>
      <Nav />
      <main id="main">
        <div className="shell py-10 sm:py-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-display font-semibold">Prove solvency</h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-muted">
                Six stages, start to loan. The browser will not encrypt anything until stage 2
                passes.
              </p>
            </div>
            <ModePill />
          </div>

          <Pipeline />

          <p className="mt-12 border-t border-line pt-6 text-[13px] text-ink-muted">
            <Link
              href="/verify"
              className="underline decoration-line underline-offset-4 transition-colors hover:decoration-flare"
            >
              Verify the build yourself →
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
