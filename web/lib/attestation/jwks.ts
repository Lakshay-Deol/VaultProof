/**
 * Verifies a GCP Confidential Space attestation token against Google's
 * published signing keys.
 *
 * This is the check that turns "the operator says this is an enclave" into
 * something a stranger can confirm. Without it, checks 1 and 3 only prove the
 * token is *internally consistent* — a malicious operator could mint a JWT
 * with any measurement and any public key and both would pass.
 *
 * It runs in the browser, against Google's keys, using WebCrypto. It
 * deliberately does not run on our backend: a signature our own server checks
 * for you proves nothing to you (spec §6).
 */

/** Google's OIDC discovery document for Confidential Space tokens. */
const DISCOVERY_URL =
  "https://confidentialcomputing.googleapis.com/.well-known/openid-configuration";

/** The issuer every genuine Confidential Space token carries. */
export const CONFIDENTIAL_SPACE_ISSUER =
  "https://confidentialcomputing.googleapis.com";

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
}

interface JwtHeader {
  alg: string;
  kid?: string;
}

function b64urlToBytes(segment: string): Uint8Array {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment))) as T;
}

/** Cached per page load: the key set changes rarely, the check runs often. */
let jwksCache: Promise<Jwk[]> | null = null;

async function fetchJwks(): Promise<Jwk[]> {
  if (!jwksCache) {
    jwksCache = (async () => {
      const discovery = await fetch(DISCOVERY_URL).then((r) => {
        if (!r.ok) throw new Error(`discovery returned HTTP ${r.status}`);
        return r.json() as Promise<{ jwks_uri: string }>;
      });
      const keys = await fetch(discovery.jwks_uri).then((r) => {
        if (!r.ok) throw new Error(`JWKS returned HTTP ${r.status}`);
        return r.json() as Promise<{ keys: Jwk[] }>;
      });
      return keys.keys;
    })().catch((err) => {
      // Do not cache a failure — a transient network blip should not poison
      // verification for the rest of the session.
      jwksCache = null;
      throw err;
    });
  }
  return jwksCache;
}

/** Maps a JWK to the WebCrypto import parameters for its algorithm. */
function algorithmFor(jwk: Jwk, alg: string): {
  importParams: RsaHashedImportParams | EcKeyImportParams;
  verifyParams: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
} | null {
  if (jwk.kty === "RSA" && alg === "RS256") {
    return {
      importParams: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      verifyParams: { name: "RSASSA-PKCS1-v1_5" },
    };
  }
  if (jwk.kty === "EC" && alg === "ES256") {
    return {
      importParams: { name: "ECDSA", namedCurve: "P-256" },
      verifyParams: { name: "ECDSA", hash: "SHA-256" },
    };
  }
  return null;
}

export interface SignatureResult {
  ok: boolean;
  /** Which key id verified it, for display. */
  kid?: string;
  error?: string;
}

/**
 * Verifies the token's signature chains to Google's Confidential Computing
 * key set, and that the issuer is the one we expect.
 *
 * `none` and unexpected algorithms are rejected outright — accepting alg:none
 * is the classic JWT bypass, and it would make every other check decorative.
 */
export async function verifyTokenSignature(token: string): Promise<SignatureResult> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Attestation token is not a well-formed JWT." };
  }
  const [headerSeg, payloadSeg, signatureSeg] = parts as [string, string, string];

  let header: JwtHeader;
  try {
    header = decodeSegment<JwtHeader>(headerSeg);
  } catch {
    return { ok: false, error: "Attestation token header could not be read." };
  }

  if (!header.alg || header.alg === "none") {
    return { ok: false, error: "Token declares no signature algorithm." };
  }

  const payload = decodeSegment<{ iss?: string; exp?: number }>(payloadSeg);
  if (payload.iss !== CONFIDENTIAL_SPACE_ISSUER) {
    return {
      ok: false,
      error: `Token issuer is ${payload.iss ?? "absent"}, not Google Confidential Computing.`,
    };
  }
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
    return { ok: false, error: "Attestation token has expired." };
  }

  let keys: Jwk[];
  try {
    keys = await fetchJwks();
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach Google's key set to verify the quote: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }

  // Prefer the key the token names; fall back to trying the set, so a rotated
  // kid does not fail a token that is otherwise genuine.
  const candidates = header.kid
    ? keys.filter((k) => k.kid === header.kid)
    : keys;
  if (candidates.length === 0) {
    return { ok: false, error: "Token was signed by a key Google does not publish." };
  }

  const signed = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
  const signature = b64urlToBytes(signatureSeg);

  for (const jwk of candidates) {
    const params = algorithmFor(jwk, header.alg);
    if (!params) continue;
    try {
      const key = await crypto.subtle.importKey("jwk", jwk as JsonWebKey, params.importParams, false, [
        "verify",
      ]);
      const ok = await crypto.subtle.verify(
        params.verifyParams,
        key,
        signature as unknown as BufferSource,
        signed as unknown as BufferSource,
      );
      if (ok) return { ok: true, kid: jwk.kid };
    } catch {
      // Try the next candidate rather than failing the whole check.
    }
  }

  return { ok: false, error: "Signature did not verify against Google's key set." };
}
