import { Marquee } from "@/components/ui/Marquee";

/**
 * The primitives the build actually stands on, scrolling past under the hero.
 *
 * A logo wall would be a lie — this project has no partners. What it does have
 * is a specific stack, and naming it is the honest version of the same signal.
 */
const ITEMS = [
  "AMD SEV-SNP",
  "GCP Confidential Space",
  "HPKE · X25519",
  "HKDF-SHA256",
  "ChaCha20-Poly1305",
  "FTSO price feeds",
  "Coston2 · chain 114",
  "TeeExtensionRegistry",
  "Reproducible builds",
  "Nullifier binding",
];

export function TechTicker() {
  return (
    <Marquee duration={54} className="py-1">
      {ITEMS.map((item) => (
        <span key={item} className="flex items-center whitespace-nowrap">
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-faint">
            {item}
          </span>
          {/* Separator lives inside the item so the duplicated track keeps an
              even rhythm across the seam. */}
          <span className="mx-6 h-1 w-1 rounded-full bg-flare/60" aria-hidden="true" />
        </span>
      ))}
    </Marquee>
  );
}
