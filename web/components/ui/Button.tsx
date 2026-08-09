import Link from "next/link";

import { cx } from "@/lib/utils/format";

type Variant = "primary" | "ghost" | "quiet" | "danger";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "bg-flare text-white hover:bg-flare-ink active:translate-y-px",
  ghost: "border border-line bg-surface text-ink hover:border-ink hover:shadow-hover",
  quiet: "text-ink-muted hover:text-ink",
  danger: "border border-state-fail/40 bg-state-failSoft text-state-fail hover:border-state-fail",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[15px]",
  sm: "h-9 px-3.5 text-[13px]",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cx(base, variants[variant], sizes[size], className)} {...rest} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  href,
  external,
  ...rest
}: CommonProps & { href: string; external?: boolean }) {
  const cls = cx(base, variants[variant], sizes[size], className);
  if (external) {
    return <a className={cls} href={href} target="_blank" rel="noreferrer" {...rest} />;
  }
  return <Link className={cls} href={href} {...rest} />;
}
