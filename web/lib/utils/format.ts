/** Middle-out truncation: 0x4b7c…e02a. Used for every hash, address and key. */
export function truncate(value: string, head = 6, tail = 4): string {
  if (!value) return "";
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatUsd(value: number, opts: { cents?: boolean } = {}): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
}

/** 6-decimal asset units → "$8,000". */
export function formatUnits6(value: bigint): string {
  return formatUsd(Number(value) / 1e6);
}

export function toUnits6(whole: number): bigint {
  return BigInt(Math.round(whole * 1e6));
}

/** "23h 41m 08s" — recomputed on a 1s tick, so no seconds-level jitter. */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "expired";
  const total = Math.floor(msRemaining / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}h ${pad(m)}m ${pad(s)}s`;
}

export function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(".000Z", "Z");
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return `0x${out}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
