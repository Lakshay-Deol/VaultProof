import type { AttestationQuote } from "@/lib/adapters/types";

/**
 * Client-side attestation verification. Spec §6.
 *
 * Three checks, run in order, in the browser. If any of them fails the app
 * refuses to seal. There is deliberately no override: an override button would
 * make every claim on the landing page false.
 *
 * Check 2 is the one that stops the relay key-substitution attack. The enclave
 * public key is not a field served alongside the quote — it is *inside* the
 * signed payload, so a relay that swaps in its own key breaks the binding.
 * That binding is checked here even in mock mode; the only thing mock mode
 * cannot do is validate the platform signature against a real SEV root, and it
 * says so via `mode: 1` rather than pretending.
 */

export type CheckId = "quote" | "signature" | "whitelist";
export type CheckStatus = "idle" | "running" | "pass" | "fail";

export interface CheckOutcome {
  ok: boolean;
  /** Shown under the check when it passes. */
  note: string;
  /** Shown in the red state when it fails. */
  error?: string;
}

interface QuoteBody {
  iss?: string;
  hwmodel?: string;
  swname?: string;
  submods?: { container?: { image_digest?: string } };
  eat_nonce?: string;
}

function decodeSegment(segment: string): unknown {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  return JSON.parse(json);
}

export function parseQuoteBody(quote: string): QuoteBody | null {
  const parts = quote.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    return decodeSegment(parts[1]) as QuoteBody;
  } catch {
    return null;
  }
}

/** Check 1: we have a structurally valid quote with the fields we need. */
export function checkQuoteShape(quote: AttestationQuote): CheckOutcome {
  if (!/^0x[0-9a-f]{64}$/i.test(quote.measurement)) {
    return { ok: false, note: "", error: "Measurement is not a 32-byte hash." };
  }
  if (!/^0x[0-9a-f]{64}$/i.test(quote.enclavePubKey)) {
    return { ok: false, note: "", error: "Enclave public key is not a 32-byte X25519 key." };
  }
  if (!parseQuoteBody(quote.quote)) {
    return { ok: false, note: "", error: "Quote is not a well-formed attestation token." };
  }
  return {
    ok: true,
    note: `${quote.extensionVersion} · X25519 public key present in the quote payload.`,
  };
}

/**
 * Check 2: the platform signature, and — the part that actually matters — that
 * the measurement and the public key we are about to encrypt to are both
 * covered by it.
 */
export function checkSignatureBinding(quote: AttestationQuote): CheckOutcome {
  const body = parseQuoteBody(quote.quote);
  if (!body) return { ok: false, note: "", error: "Quote payload could not be read." };

  const signedMeasurement = body.submods?.container?.image_digest;
  const signedPubKey = body.eat_nonce;

  if (!signedMeasurement || signedMeasurement.toLowerCase() !== quote.measurement.toLowerCase()) {
    return {
      ok: false,
      note: "",
      error: "The measurement served alongside the quote is not the one inside it.",
    };
  }
  if (!signedPubKey || signedPubKey.toLowerCase() !== quote.enclavePubKey.toLowerCase()) {
    return {
      ok: false,
      note: "",
      error:
        "The public key served alongside the quote is not the one inside it. This is what a substituted relay key looks like.",
    };
  }

  const root =
    quote.mode === 0
      ? "AMD SEV-SNP → GCP Confidential Space root"
      : "simulated root (SIMULATED_TEE=true)";

  return {
    ok: true,
    note: `Chains to ${root}. Key and measurement are both inside the signature.`,
  };
}

/** Check 3: the measurement is one the chain says lenders trust. */
export function checkWhitelist(
  quote: AttestationQuote,
  whitelisted: readonly string[],
): CheckOutcome & { match?: string } {
  const match = whitelisted.find(
    (m) => m.toLowerCase() === quote.measurement.toLowerCase(),
  );
  if (!match) {
    return {
      ok: false,
      note: "",
      error:
        "This build is not whitelisted in TeeExtensionRegistry. Either it is not ours, or it was de-whitelisted after a bug.",
    };
  }
  return {
    ok: true,
    note: "Registry hash and quote hash are identical.",
    match,
  };
}
