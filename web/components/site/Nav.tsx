"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ButtonLink } from "@/components/ui/Button";
import { cx } from "@/lib/utils/format";

const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/verify", label: "Verify" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-sm">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 rounded" aria-label="VaultProof home">
          <Logomark />
          <span className="text-[15px] font-semibold tracking-tight">VaultProof</span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cx(
                "whitespace-nowrap rounded px-2 py-1.5 text-[13px] transition-colors sm:px-3 sm:text-[14px]",
                pathname === link.href ? "text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {link.label}
            </Link>
          ))}
          {/* One text node: the button is a flex row, so a second child would
              inherit its gap and read as a stray space. */}
          <ButtonLink href="/app" size="sm" className="ml-1 whitespace-nowrap px-3 sm:px-3.5">
            <span className="hidden xs:inline">Launch app</span>
            <span className="xs:hidden">Launch</span>
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}

/**
 * A sealed box with a keyhole gap: the product in one mark. Pink stroke only,
 * no fill, so it reads at 20px.
 */
export function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("h-[22px] w-[22px]", className)} aria-hidden="true">
      <rect
        x="3.25"
        y="3.25"
        width="17.5"
        height="17.5"
        rx="4"
        fill="none"
        stroke="#E62058"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="10.5" r="2.4" fill="none" stroke="#F2F2F4" strokeWidth="1.6" />
      <path d="M12 12.9v3.6" stroke="#F2F2F4" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
