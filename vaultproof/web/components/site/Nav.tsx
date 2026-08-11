"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ButtonLink } from "@/components/ui/Button";
import { cx } from "@/lib/utils/format";

const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/verify", label: "Verify" },
];

export function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);

  /*
   * One rAF-throttled scroll listener drives both the condensed state and the
   * reading-progress hairline, so the bar can never disagree with the header.
   */
  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(y > 12);
      setProgress(scrollable > 0 ? Math.min(1, Math.max(0, y / scrollable)) : 0);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      className={cx(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300",
        scrolled
          ? "border-line bg-surface/70 shadow-hover backdrop-blur-md"
          : "border-transparent bg-surface/85 backdrop-blur-sm",
      )}
    >
      <div
        className={cx(
          "shell flex items-center justify-between gap-4 transition-[height] duration-300",
          scrolled ? "h-14" : "h-16",
        )}
      >
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded"
          aria-label="VaultProof home"
        >
          <Logomark className="transition-[transform,filter] duration-500 group-hover:rotate-[8deg] group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(230,32,88,0.55)]" />
          <span className="text-[15px] font-semibold tracking-tight">VaultProof</span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-active={pathname === link.href}
              className={cx(
                "nav-link relative whitespace-nowrap rounded px-2 py-1.5 text-[13px] transition-colors sm:px-3 sm:text-[14px]",
                pathname === link.href ? "text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {link.label}
            </Link>
          ))}
          {/* One text node: the button is a flex row, so a second child would
              inherit its gap and read as a stray space. */}
          <ButtonLink href="/app" size="sm" className="ml-1 whitespace-nowrap px-3 sm:px-3.5">
            Borrow
          </ButtonLink>
        </nav>
      </div>

      {/* How far down the page you are. Transform-only, so it never lays out. */}
      <div
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-gradient-to-r from-flare via-flare-ink to-flare-ember"
        style={{ transform: `scaleX(${progress})` }}
        aria-hidden="true"
      />
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
