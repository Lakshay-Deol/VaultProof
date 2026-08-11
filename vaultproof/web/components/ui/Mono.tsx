"use client";

import { truncate, cx } from "@/lib/utils/format";

import { useToast } from "./Toast";

interface MonoProps {
  value: string;
  /** Render the full value instead of the middle-out truncation. */
  full?: boolean;
  head?: number;
  tail?: number;
  className?: string;
  /** Optional label read by screen readers instead of the raw hex. */
  label?: string;
  href?: string;
}

/**
 * Every hash, address, key and measurement in the app goes through this.
 * Truncated middle-out, monospace, copy on click, tiny toast on success.
 */
export function Mono({ value, full, head = 6, tail = 4, className, label, href }: MonoProps) {
  const toast = useToast();
  const shown = full ? value : truncate(value, head, tail);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label ?? "Value"} copied`);
    } catch {
      toast("Copy blocked by the browser");
    }
  };

  return (
    <span className={cx("inline-flex items-center gap-1.5 align-middle", className)}>
      <button
        type="button"
        onClick={copy}
        title={value}
        aria-label={`Copy ${label ?? "value"} ${value}`}
        className="group inline-flex items-center gap-1.5 rounded font-mono text-[13px] leading-none tracking-tight text-ink transition-colors hover:text-flare-ink"
      >
        <span className="break-all">{shown}</span>
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="h-3 w-3 shrink-0 text-ink-faint transition-colors group-hover:text-flare-ink"
        >
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" />
          <path d="M10.5 3.5H3.5a1 1 0 0 0-1 1v7" fill="none" stroke="currentColor" />
        </svg>
      </button>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-ink-faint transition-colors hover:text-flare-ink"
          aria-label={`Open ${label ?? "value"} in the Coston2 explorer`}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3">
            <path
              d="M6.5 3.5h-3v9h9v-3M9.5 3.5h3v3M12.5 3.5 7 9"
              fill="none"
              stroke="currentColor"
            />
          </svg>
        </a>
      ) : null}
    </span>
  );
}
